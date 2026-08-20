// ============================================================
// SafeInspect — Offline Sync Queue
// Queues mutations that failed while offline and replays them
// automatically when the device comes back online.
// Uses localStorage for durability across page reloads.
// ============================================================

import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

// ─── Queue item shape ─────────────────────────────────────────

type AssetUpsert = Database['public']['Tables']['inspection_assets']['Insert']
type InspectionUpdate = Database['public']['Tables']['inspections']['Update']

export type QueuedOpType = QueuedOp['type']

/**
 * Each op carries a payload shaped for the table it targets, so a queued
 * mutation is type-checked at enqueue time rather than failing at replay.
 */
export type QueuedOpPayload =
  | { type: 'upsert_asset';      payload: AssetUpsert }
  | { type: 'delete_asset';      payload: { id: string } }
  | { type: 'update_inspection'; payload: { id: string } & InspectionUpdate }
  | { type: 'save_markers';      payload: { id: string; notes: string | null; drawing_scaled: boolean | null } }
  | { type: 'upload_photo';      payload: { inspection_id: string; asset_id: string; storage_path: string } }

export type QueuedOp = QueuedOpPayload & {
  id: string
  createdAt: string
  retries: number
  lastError?: string
}

// ─── Store shape ──────────────────────────────────────────────

interface SyncQueueState {
  queue: QueuedOp[]
  isSyncing: boolean
  lastSyncedAt: string | null

  enqueue: <T extends QueuedOpPayload>(type: T['type'], payload: T['payload']) => void
  dequeue: (id: string) => void
  flush: () => Promise<void>
  clearAll: () => void
}

// ─── Operation executors ──────────────────────────────────────

async function executeOp(op: QueuedOp): Promise<void> {
  switch (op.type) {
    case 'upsert_asset': {
      const { error } = await supabase
        .from('inspection_assets')
        .upsert(op.payload)
      if (error) throw error
      break
    }
    case 'delete_asset': {
      const { error } = await supabase
        .from('inspection_assets')
        .delete()
        .eq('id', op.payload.id)
      if (error) throw error
      break
    }
    case 'update_inspection': {
      const { id, ...patch } = op.payload
      const { error } = await supabase
        .from('inspections')
        .update(patch)
        .eq('id', id)
      if (error) throw error
      break
    }
    case 'save_markers': {
      const { id, notes, drawing_scaled } = op.payload
      const { error } = await supabase
        .from('inspections')
        .update({ notes, drawing_scaled })
        .eq('id', id)
      if (error) throw error
      break
    }
    case 'upload_photo': {
      // Photos are large binary — skip re-upload from queue,
      // just mark them as needing re-upload in the UI
      console.warn('[SyncQueue] Photo re-upload not supported from queue — user must re-add photo')
      break
    }
    default:
      console.warn('[SyncQueue] Unknown op type:', (op as QueuedOp).type)
  }
}

// ─── Store ────────────────────────────────────────────────────

export const useSyncQueue = create<SyncQueueState>()(
  devtools(
    persist(
      (set, get) => ({
        queue: [],
        isSyncing: false,
        lastSyncedAt: null,

        enqueue: (type, payload) => {
          const op = {
            id:        crypto.randomUUID(),
            type,
            payload,
            createdAt: new Date().toISOString(),
            retries:   0,
          } as QueuedOp
          set((s) => ({ queue: [...s.queue, op] }))
        },

        dequeue: (id) => {
          set((s) => ({ queue: s.queue.filter((op) => op.id !== id) }))
        },

        flush: async () => {
          const { queue, isSyncing } = get()
          if (isSyncing || queue.length === 0) return

          set({ isSyncing: true })

          const remaining: QueuedOp[] = []

          for (const op of queue) {
            try {
              await executeOp(op)
              // Success — don't re-add
            } catch (err) {
              const updated: QueuedOp = {
                ...op,
                retries:   op.retries + 1,
                lastError: err instanceof Error ? err.message : 'Unknown error',
              }
              // Give up after 5 retries
              if (updated.retries < 5) {
                remaining.push(updated)
              } else {
                console.error('[SyncQueue] Permanently failed op:', updated)
              }
            }
          }

          set({
            queue: remaining,
            isSyncing: false,
            lastSyncedAt: new Date().toISOString(),
          })
        },

        clearAll: () => set({ queue: [] }),
      }),
      {
        name: 'safeinspect-sync-queue',
        partialize: (s) => ({ queue: s.queue }),
      }
    ),
    { name: 'SyncQueue' }
  )
)
