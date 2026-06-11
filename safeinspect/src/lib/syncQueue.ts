// ============================================================
// SafeInspect — Offline Sync Queue
// Queues mutations that failed while offline and replays them
// automatically when the device comes back online.
// Uses localStorage for durability across page reloads.
// ============================================================

import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'

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
  payload: Record<string, unknown>
  createdAt: string
  retries: number
  lastError?: string
}

// ─── Store shape ──────────────────────────────────────────────

interface SyncQueueState {
  queue: QueuedOp[]
  isSyncing: boolean
  lastSyncedAt: string | null

  enqueue: (type: QueuedOpType, payload: Record<string, unknown>) => void
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
        .upsert(op.payload as Record<string, unknown>)
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
        .update(patch)
        .eq('id', id as string)
      if (error) throw error
      break
    }
    case 'save_markers': {
      const { id, notes, drawing_scaled } = op.payload
      const { error } = await supabase
        .from('inspections')
        .update({ notes, drawing_scaled })
        .eq('id', id as string)
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
          const op: QueuedOp = {
            id:        crypto.randomUUID(),
            type,
            payload,
            createdAt: new Date().toISOString(),
            retries:   0,
          }
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
