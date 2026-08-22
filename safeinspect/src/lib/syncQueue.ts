// ============================================================
// SafeInspect — Offline outbox
//
// Durable queue of mutations that could not reach Supabase
// (offline, or a network failure mid-save). Modelled on
// HeightTrack's outbox rules:
//
//   - Every replay is IDEMPOTENT: asset saves carry a
//     client-generated id and upsert on the natural key
//     (inspection_id, asset_code); photo rows reuse the queued
//     photo's id. Replaying after a crash or double-flush is
//     safe by construction.
//   - Nothing is ever silently dropped. Failed ops stay in the
//     queue with their error and attempt count until they
//     succeed or the user explicitly discards them — a silently
//     lost fail result is the worst bug this product can have.
//   - Photo BLOBS live in the IndexedDB photo outbox
//     (photoOutbox.ts); this queue holds only their metadata.
//
// The queue itself persists to localStorage (zustand/persist)
// and is surfaced on the /sync status screen.
// ============================================================

import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import { getPhoto, deletePhoto } from '@/lib/photoOutbox'
import type { Database } from '@/types/database'

type AssetUpsert     = Database['public']['Tables']['inspection_assets']['Insert']
type InspectionUpdate = Database['public']['Tables']['inspections']['Update']

// ─── Queue item shape ─────────────────────────────────────────

export type QueuedOpType =
  | 'upsert_asset'
  | 'delete_asset'
  | 'update_inspection'
  | 'save_markers'
  | 'upload_photo'

export interface QueuedOp {
  id: string
  type: QueuedOpType
  /** Human-readable line for the sync status screen */
  label: string
  payload: Record<string, unknown>
  createdAt: string
  retries: number
  lastError?: string
}

/**
 * True when a failure is connectivity-shaped (offline, DNS,
 * fetch abort) — the class of error the outbox exists for.
 * Server-side rejections (RLS, constraint violations) are NOT
 * queued: retrying them cannot succeed and would hide a bug.
 */
export function isOfflineError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  if (err instanceof TypeError) return true // fetch network failure
  const msg = err instanceof Error ? err.message : String(err)
  return /failed to fetch|network|timeout|ERR_INTERNET|load failed/i.test(msg)
}

// ─── Operation executors ──────────────────────────────────────

async function executeOp(op: QueuedOp): Promise<void> {
  switch (op.type) {
    case 'upsert_asset': {
      const { error } = await supabase
        .from('inspection_assets')
        .upsert(op.payload as unknown as AssetUpsert, {
          onConflict: 'inspection_id,asset_code',
        })
      if (error) throw error
      break
    }
    case 'delete_asset': {
      const { error } = await supabase
        .from('inspection_assets')
        .delete()
        .eq('id', op.payload.id as string)
      if (error) throw error
      break
    }
    case 'update_inspection': {
      const { id, ...patch } = op.payload
      const { error } = await supabase
        .from('inspections')
        .update(patch as InspectionUpdate)
        .eq('id', id as string)
      if (error) throw error
      break
    }
    case 'save_markers': {
      const { id, notes, drawing_scaled } = op.payload
      const { error } = await supabase
        .from('inspections')
        .update({
          notes: notes as string | null,
          drawing_scaled: drawing_scaled as boolean | null,
        })
        .eq('id', id as string)
      if (error) throw error
      break
    }
    case 'upload_photo': {
      const photoId = op.payload.photoId as string
      const queued = await getPhoto(photoId)
      if (!queued) {
        throw new Error(
          'Photo data is no longer on this device (storage was cleared). Discard this item and re-take the photo.'
        )
      }
      const { error: uploadErr } = await supabase.storage
        .from('inspection-photos')
        .upload(queued.storagePath, queued.blob, {
          upsert: true,
          contentType: queued.contentType,
        })
      if (uploadErr) throw uploadErr

      // Row id = queued photo id, so a replay lands on the same row
      const { error: rowErr } = await supabase.from('asset_photos').upsert(
        {
          id: queued.id,
          inspection_id: queued.inspectionId,
          asset_id: queued.assetId,
          storage_path: queued.storagePath,
          caption: queued.caption,
          sort_order: queued.sortOrder,
          uploaded_by: queued.uploadedBy,
        },
        { onConflict: 'id' }
      )
      if (rowErr) throw rowErr

      await deletePhoto(photoId)
      break
    }
  }
}

// ─── Store ────────────────────────────────────────────────────

interface SyncQueueState {
  queue: QueuedOp[]
  isSyncing: boolean
  lastSyncedAt: string | null

  enqueue: (type: QueuedOpType, label: string, payload: Record<string, unknown>) => QueuedOp
  /** Remove one op without executing it — explicit user action only */
  discard: (id: string) => void
  flush: () => Promise<void>
  /** Pending upsert for this asset id (photos must queue behind it) */
  hasQueuedAsset: (assetId: string) => boolean
}

export const useSyncQueue = create<SyncQueueState>()(
  devtools(
    persist(
      (set, get) => ({
        queue: [],
        isSyncing: false,
        lastSyncedAt: null,

        enqueue: (type, label, payload) => {
          const op: QueuedOp = {
            id: crypto.randomUUID(),
            type,
            label,
            payload,
            createdAt: new Date().toISOString(),
            retries: 0,
          }
          set((s) => ({ queue: [...s.queue, op] }))
          return op
        },

        discard: (id) => {
          const op = get().queue.find((o) => o.id === id)
          if (op?.type === 'upload_photo') {
            void deletePhoto(op.payload.photoId as string)
          }
          set((s) => ({ queue: s.queue.filter((o) => o.id !== id) }))
        },

        hasQueuedAsset: (assetId) =>
          get().queue.some(
            (op) => op.type === 'upsert_asset' && op.payload.id === assetId
          ),

        flush: async () => {
          const { isSyncing } = get()
          if (isSyncing || get().queue.length === 0) return

          set({ isSyncing: true })
          try {
            // FIFO: an asset save enqueued before its photos must
            // land first (the photo row references the asset row).
            for (const op of [...get().queue]) {
              // op may have been discarded while we were flushing
              if (!get().queue.some((o) => o.id === op.id)) continue
              try {
                await executeOp(op)
                set((s) => ({ queue: s.queue.filter((o) => o.id !== op.id) }))
              } catch (err) {
                const lastError = err instanceof Error ? err.message : 'Unknown error'
                set((s) => ({
                  queue: s.queue.map((o) =>
                    o.id === op.id ? { ...o, retries: o.retries + 1, lastError } : o
                  ),
                }))
                // Offline again? Stop burning attempts on the rest.
                if (isOfflineError(err)) break
              }
            }
          } finally {
            set({ isSyncing: false, lastSyncedAt: new Date().toISOString() })
          }
        },
      }),
      {
        name: 'safeinspect-sync-queue',
        partialize: (s) => ({ queue: s.queue }),
      }
    ),
    { name: 'SyncQueue' }
  )
)
