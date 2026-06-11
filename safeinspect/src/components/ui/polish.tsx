import { cn } from '@/lib/utils'

// ─── Skeleton primitive ───────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'bg-surface-overlay rounded-lg animate-pulse',
        className
      )}
    />
  )
}

// ─── Dashboard skeleton ───────────────────────────────────────

export function DashboardSkeleton() {
  return (
    <div className="max-w-2xl mx-auto lg:max-w-4xl px-4 pt-6 pb-4">
      {/* Greeting */}
      <div className="mb-6">
        <Skeleton className="h-4 w-24 mb-1" />
        <Skeleton className="h-7 w-36" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-surface-raised rounded-2xl border border-surface-border p-4 flex items-start gap-4">
            <Skeleton className="w-11 h-11 rounded-xl shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-7 w-16 mb-1" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="mb-6">
        <Skeleton className="h-3 w-24 mb-3" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface-raised rounded-2xl border border-surface-border p-4">
              <Skeleton className="w-9 h-9 rounded-xl mb-2" />
              <Skeleton className="h-4 w-16 mb-1" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      </div>

      {/* Recent inspections */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-14" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface-raised rounded-2xl border border-surface-border p-4 flex items-start gap-3">
              <Skeleton className="w-1.5 self-stretch rounded-full shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-4 w-40 mb-1" />
                <Skeleton className="h-3 w-28 mb-2" />
                <div className="flex gap-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Inspection detail skeleton ───────────────────────────────

export function InspectionDetailSkeleton() {
  return (
    <div className="max-w-2xl mx-auto lg:max-w-4xl">
      {/* Header */}
      <div className="bg-surface-raised border-b border-surface-border px-4 h-14 flex items-center gap-3">
        <Skeleton className="w-9 h-9 rounded-xl" />
        <div>
          <Skeleton className="h-4 w-40 mb-1" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="ml-auto">
          <Skeleton className="h-8 w-16 rounded-xl" />
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {/* Site info card */}
        <div className="bg-surface-raised rounded-2xl border border-surface-border p-4">
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <Skeleton className="h-2.5 w-12 mb-1.5" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        </div>

        {/* Category sections */}
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-surface-raised rounded-2xl border border-surface-border">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="w-1.5 h-8 rounded-full shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-4 w-36 mb-1" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="w-5 h-5 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Asset form skeleton ──────────────────────────────────────

export function AssetFormSkeleton() {
  return (
    <div className="rounded-2xl border border-surface-border">
      <div className="flex items-center gap-3 px-4 py-3.5 bg-surface-raised">
        <Skeleton className="w-1.5 h-8 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-4 w-24 mb-1" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="w-5 h-5 rounded" />
      </div>
    </div>
  )
}

// ─── Inline save indicator ────────────────────────────────────

export type SaveIndicatorStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export function SaveIndicator({ status }: { status: SaveIndicatorStatus }) {
  if (status === 'idle') return null

  return (
    <div className="flex items-center gap-1.5 text-xs">
      {status === 'pending' && (
        <>
          <div className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-pulse" />
          <span className="text-slate-500">Unsaved</span>
        </>
      )}
      {status === 'saving' && (
        <>
          <span className="w-3 h-3 border border-brand-orange/30 border-t-brand-orange rounded-full animate-spin" />
          <span className="text-slate-500">Saving…</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <div className="w-1.5 h-1.5 rounded-full bg-status-compliant" />
          <span className="text-slate-500">Saved</span>
        </>
      )}
      {status === 'error' && (
        <>
          <div className="w-1.5 h-1.5 rounded-full bg-status-noncompliant" />
          <span className="text-status-noncompliant">Save failed</span>
        </>
      )}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-surface-raised border border-surface-border flex items-center justify-center mb-4">
        {icon}
      </div>
      <p className="text-white font-display text-lg font-bold mb-1">{title}</p>
      <p className="text-slate-500 text-sm mb-6 max-w-xs leading-relaxed">{description}</p>
      {action}
    </div>
  )
}

// ─── Report number generator ──────────────────────────────────

/**
 * Generates a report number in the format AB-YYYY-XXXX
 * where XXXX is a zero-padded sequence number.
 * In production this should come from a DB sequence.
 */
export function generateReportNumber(sequence?: number): string {
  const year = new Date().getFullYear()
  const seq  = sequence ?? Math.floor(Math.random() * 9000) + 1000
  return `AB-${year}-${String(seq).padStart(4, '0')}`
}

// ─── Sunlight-mode helper ─────────────────────────────────────

/**
 * Sunlight readability class — adds max contrast text on
 * certain critical status indicators when viewing outdoors.
 * Apply via CSS media query in future; for now this gives
 * the correct classes to use.
 */
export const SUNLIGHT = {
  // Use these instead of text-slate-500 on dark surfaces outdoors
  label:       'text-slate-300',
  value:       'text-white',
  muted:       'text-slate-400',
  // Status text stays the same — already high contrast
} as const

// ─── Touch target audit ───────────────────────────────────────

/**
 * All interactive elements must be at least 48×48px (h-touch).
 * Use this constant to enforce it in new components.
 */
export const TOUCH = {
  min:  'min-h-[48px] min-w-[48px]',
  std:  'h-12 min-w-[48px]',  // 48px
  lg:   'h-14 min-w-[56px]',  // 56px
  icon: 'w-12 h-12',          // 48×48 icon button
} as const
