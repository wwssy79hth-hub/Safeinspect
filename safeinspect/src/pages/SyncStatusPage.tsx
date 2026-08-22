// ============================================================
// SafeInspect — Sync status screen
//
// HeightTrack rule: sync status is a real screen, not a spinner.
// An inspector who cannot see that their day's work is safe will
// re-enter it. Shows every pending/failed operation with its
// error and attempt count, plus queued photo volume; items are
// removed only by succeeding or by explicit discard.
// ============================================================

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle, Trash2,
  CloudUpload, Camera, FileEdit, MapPin, X,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { useSyncQueue, type QueuedOp, type QueuedOpType } from '@/lib/syncQueue'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { pendingPhotoStats } from '@/lib/photoOutbox'

const OP_ICONS: Record<QueuedOpType, typeof CloudUpload> = {
  upsert_asset: FileEdit,
  delete_asset: Trash2,
  update_inspection: FileEdit,
  save_markers: MapPin,
  upload_photo: Camera,
}

function OpRow({ op }: { op: QueuedOp }) {
  const { discard } = useSyncQueue()
  const [confirming, setConfirming] = useState(false)
  const Icon = OP_ICONS[op.type] ?? CloudUpload
  const failed = op.retries > 0

  return (
    <div className={cn(
      'rounded-2xl border p-4',
      failed ? 'border-status-noncompliant/40 bg-status-noncompliant-bg/5'
             : 'border-surface-border bg-surface-raised'
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
          failed ? 'bg-status-noncompliant-bg' : 'bg-surface-overlay'
        )}>
          <Icon size={16} className={failed ? 'text-status-noncompliant' : 'text-brand-orange'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate">{op.label}</p>
          <p className="text-slate-500 text-xs mt-0.5">
            Queued {format(parseISO(op.createdAt), 'd MMM HH:mm')}
            {op.retries > 0 && ` · ${op.retries} failed attempt${op.retries === 1 ? '' : 's'}`}
          </p>
          {op.lastError && (
            <p className="text-status-noncompliant text-xs mt-1.5 break-words">
              {op.lastError}
            </p>
          )}
        </div>
        {confirming ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => discard(op.id)}
              className="h-9 px-3 rounded-lg bg-status-noncompliant text-white text-xs font-bold"
            >
              Discard
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="w-9 h-9 rounded-lg bg-surface-overlay flex items-center justify-center text-slate-400"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            title="Discard without syncing"
            className="w-9 h-9 rounded-lg bg-surface-overlay flex items-center justify-center text-slate-500 hover:text-status-noncompliant transition-colors shrink-0"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

export default function SyncStatusPage() {
  const navigate = useNavigate()
  const { queue, isSyncing, flush, lastSyncedAt } = useSyncQueue()
  const { isOnline } = useOnlineStatus()
  const [photoStats, setPhotoStats] = useState<{ count: number; bytes: number }>({ count: 0, bytes: 0 })

  useEffect(() => {
    pendingPhotoStats().then(setPhotoStats)
  }, [queue.length, isSyncing])

  const failedCount = queue.filter((op) => op.retries > 0).length
  const mb = photoStats.bytes / (1024 * 1024)

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface-raised border-b border-surface-border">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="font-display font-bold text-white text-base uppercase tracking-wide">
              Sync Status
            </h1>
            <p className="text-slate-500 text-xs">
              {isOnline ? 'Online' : 'Offline'}
              {lastSyncedAt && ` · last sync ${format(parseISO(lastSyncedAt), 'HH:mm')}`}
            </p>
          </div>
          <button
            onClick={() => flush()}
            disabled={isSyncing || queue.length === 0 || !isOnline}
            className={cn(
              'flex items-center gap-1.5 h-10 px-4 rounded-xl font-display font-bold text-sm transition-all',
              queue.length > 0 && isOnline
                ? 'bg-brand-orange text-white active:scale-[0.97]'
                : 'bg-surface-overlay text-slate-500'
            )}
          >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-surface-border bg-surface-raised p-3 text-center">
            <p className="text-white font-display font-bold text-xl">{queue.length}</p>
            <p className="text-slate-500 text-[11px] uppercase tracking-wide">Pending</p>
          </div>
          <div className={cn(
            'rounded-2xl border p-3 text-center',
            failedCount > 0
              ? 'border-status-noncompliant/40 bg-status-noncompliant-bg/10'
              : 'border-surface-border bg-surface-raised'
          )}>
            <p className={cn('font-display font-bold text-xl', failedCount > 0 ? 'text-status-noncompliant' : 'text-white')}>
              {failedCount}
            </p>
            <p className="text-slate-500 text-[11px] uppercase tracking-wide">Failed</p>
          </div>
          <div className="rounded-2xl border border-surface-border bg-surface-raised p-3 text-center">
            <p className="text-white font-display font-bold text-xl">
              {photoStats.count}
              {photoStats.count > 0 && (
                <span className="text-slate-500 text-xs font-normal"> · {mb < 0.1 ? '<0.1' : mb.toFixed(1)} MB</span>
              )}
            </p>
            <p className="text-slate-500 text-[11px] uppercase tracking-wide">Photos queued</p>
          </div>
        </div>

        {/* Queue */}
        {queue.length === 0 ? (
          <div className="rounded-2xl border border-surface-border bg-surface-raised p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-status-compliant-bg mx-auto mb-3 flex items-center justify-center">
              <CheckCircle2 size={22} className="text-status-compliant" />
            </div>
            <p className="text-white font-semibold text-sm">All changes synced</p>
            <p className="text-slate-500 text-xs mt-1">
              Everything captured on this device has reached the server.
            </p>
          </div>
        ) : (
          <>
            {!isOnline && (
              <div className="flex items-center gap-2 rounded-xl border border-status-recommendation/40 bg-status-recommendation/10 px-3 py-2.5">
                <AlertTriangle size={14} className="text-status-recommendation shrink-0" />
                <p className="text-status-recommendation text-xs">
                  Offline — queued work is safe on this device and will sync automatically when connectivity returns.
                </p>
              </div>
            )}
            <div className="space-y-2.5">
              {queue.map((op) => <OpRow key={op.id} op={op} />)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
