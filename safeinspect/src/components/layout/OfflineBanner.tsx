import { useEffect, useState } from 'react'
import { WifiOff, Wifi, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useSyncQueue } from '@/lib/syncQueue'

export function OfflineBanner() {
  const { isOnline, wasOffline } = useOnlineStatus()
  const { queue, isSyncing, flush, lastSyncedAt } = useSyncQueue()
  const [dismissed, setDismissed] = useState(false)

  // Auto-flush queue when we come back online
  useEffect(() => {
    if (isOnline && queue.length > 0) {
      flush()
    }
  }, [isOnline, queue.length, flush])

  // Re-show banner on status changes
  useEffect(() => {
    setDismissed(false)
  }, [isOnline])

  // Nothing to show
  if (dismissed) return null
  if (isOnline && !wasOffline && queue.length === 0) return null

  // ── Offline ────────────────────────────────────────────────
  if (!isOnline) {
    return (
      <div className="fixed top-0 inset-x-0 z-50 animate-slide-down">
        <div className="bg-surface-overlay border-b border-status-recommendation/40 px-4 py-2.5 flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-status-recommendation/20 flex items-center justify-center shrink-0">
            <WifiOff size={14} className="text-status-recommendation" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-status-recommendation text-sm font-semibold leading-none">
              Working Offline
            </p>
            <p className="text-slate-400 text-xs mt-0.5">
              Changes saved locally
              {queue.length > 0 && ` · ${queue.length} pending sync`}
            </p>
          </div>
          {queue.length > 0 && (
            <div className="flex items-center gap-1 bg-status-recommendation/10 border border-status-recommendation/30 rounded-lg px-2 py-1">
              <AlertTriangle size={11} className="text-status-recommendation" />
              <span className="text-status-recommendation text-[10px] font-bold">{queue.length}</span>
            </div>
          )}
        </div>
        {/* Degraded mode indicator strip */}
        <div className="h-0.5 bg-gradient-to-r from-status-recommendation/0 via-status-recommendation to-status-recommendation/0 animate-pulse" />
      </div>
    )
  }

  // ── Just came back online, syncing ─────────────────────────
  if (wasOffline || isSyncing || queue.length > 0) {
    return (
      <div className="fixed top-0 inset-x-0 z-50 animate-fade-in">
        <div className={cn(
          'border-b px-4 py-2.5 flex items-center gap-3',
          isSyncing
            ? 'bg-brand-blue/20 border-brand-light/30'
            : 'bg-status-compliant-bg/20 border-status-compliant/30'
        )}>
          <div className={cn(
            'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
            isSyncing ? 'bg-brand-light/10' : 'bg-status-compliant-bg'
          )}>
            {isSyncing
              ? <RefreshCw size={14} className="text-brand-light animate-spin" />
              : <CheckCircle2 size={14} className="text-status-compliant" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn(
              'text-sm font-semibold leading-none',
              isSyncing ? 'text-brand-light' : 'text-status-compliant'
            )}>
              {isSyncing ? 'Syncing changes…' : 'Back online'}
            </p>
            <p className="text-slate-400 text-xs mt-0.5">
              {isSyncing
                ? `${queue.length} item${queue.length !== 1 ? 's' : ''} to sync`
                : 'All changes synced successfully'
              }
            </p>
          </div>
          {!isSyncing && (
            <button
              onClick={() => setDismissed(true)}
              className="text-slate-500 hover:text-white text-xs transition-colors px-2 py-1"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    )
  }

  return null
}
