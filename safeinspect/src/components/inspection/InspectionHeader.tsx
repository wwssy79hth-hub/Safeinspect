import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Cloud, CloudOff, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InspectionStatus, OverallSiteStatus } from '@/types/database'
import { ASSET_CATEGORIES, type AssetCategory } from '@/types/database'
import { useInspectionStore } from '@/store/inspection.store'

// ─── Props ────────────────────────────────────────────────────

interface InspectionHeaderProps {
  /** Inspection title / site name */
  title: string
  /** Sub-label — job number or client name */
  subtitle?: string
  /** Current save state */
  saving?: boolean
  /** Whether we have a live connection */
  online?: boolean
  /** Overall inspection status (for badge) */
  overallStatus?: OverallSiteStatus | null
  /** Current inspection status */
  inspectionStatus?: InspectionStatus
  /** Active category being inspected (highlights progress bar) */
  activeCategory?: AssetCategory
  /** Back navigation target (defaults to -1 in history) */
  backTo?: string
  /** Show progress bar (only in active inspection) */
  showProgress?: boolean
  /** Right-side slot for action buttons */
  actions?: React.ReactNode
}

// ─── Status config ────────────────────────────────────────────

const OVERALL_STATUS_CONFIG: Record<
  OverallSiteStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  compliant: {
    label: 'Compliant',
    bg: 'bg-status-compliant-bg',
    text: 'text-status-compliant',
    dot: 'bg-status-compliant',
  },
  non_compliant: {
    label: 'Non-Compliant',
    bg: 'bg-status-noncompliant-bg',
    text: 'text-status-noncompliant',
    dot: 'bg-status-noncompliant',
  },
  partially_compliant: {
    label: 'Partial',
    bg: 'bg-status-recommendation-bg',
    text: 'text-status-recommendation',
    dot: 'bg-status-recommendation',
  },
}

const INSPECTION_STATUS_CONFIG: Record<
  InspectionStatus,
  { label: string; icon: typeof Clock }
> = {
  draft:       { label: 'Draft',       icon: Clock },
  in_progress: { label: 'In Progress', icon: Clock },
  completed:   { label: 'Completed',   icon: CheckCircle2 },
  issued:      { label: 'Issued',      icon: CheckCircle2 },
}

// ─── Component ────────────────────────────────────────────────

export function InspectionHeader({
  title,
  subtitle,
  saving = false,
  online = true,
  overallStatus,
  inspectionStatus = 'draft',
  activeCategory,
  backTo,
  showProgress = false,
  actions,
}: InspectionHeaderProps) {
  const navigate = useNavigate()
  const { assets } = useInspectionStore()

  // Progress: how many categories have at least one asset
  const categoriesWithAssets = ASSET_CATEGORIES.filter(
    (cat) => assets.some((a) => a.category === cat)
  )
  const progressPct = showProgress
    ? Math.round((categoriesWithAssets.length / ASSET_CATEGORIES.length) * 100)
    : 0

  // Count non-compliant for alert
  const nonCompliantCount = assets.filter((a) => a.status === 'non_compliant').length

  const handleBack = () => {
    if (backTo) navigate(backTo)
    else navigate(-1)
  }

  const statusConfig = overallStatus ? OVERALL_STATUS_CONFIG[overallStatus] : null
  const iStatusConfig = INSPECTION_STATUS_CONFIG[inspectionStatus]

  return (
    <div className="bg-surface-raised border-b border-surface-border sticky top-0 lg:top-0 z-10">
      {/* Non-compliant alert banner */}
      {nonCompliantCount > 0 && showProgress && (
        <div className="bg-status-noncompliant/10 border-b border-status-noncompliant/20 px-4 py-2 flex items-center gap-2">
          <AlertCircle size={14} className="text-status-noncompliant shrink-0" />
          <p className="text-status-noncompliant text-xs font-medium">
            {nonCompliantCount} non-compliant item{nonCompliantCount !== 1 ? 's' : ''} require corrective action
          </p>
        </div>
      )}

      {/* Main header row */}
      <div className="flex items-center gap-3 px-4 h-14">
        {/* Back */}
        <button
          onClick={handleBack}
          className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-white hover:bg-surface-overlay transition-colors shrink-0"
          aria-label="Go back"
        >
          <ArrowLeft size={20} />
        </button>

        {/* Title + status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="font-display text-base font-bold text-white truncate leading-tight">
              {title}
            </h1>
            {statusConfig && (
              <span className={cn(
                'hidden sm:inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0',
                statusConfig.bg, statusConfig.text
              )}>
                <span className={cn('w-1.5 h-1.5 rounded-full', statusConfig.dot)} />
                {statusConfig.label}
              </span>
            )}
          </div>
          {subtitle && (
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-slate-500 text-xs truncate">{subtitle}</p>
              <span className={cn(
                'text-[10px] font-medium uppercase tracking-wider',
                inspectionStatus === 'in_progress' ? 'text-brand-orange' :
                inspectionStatus === 'completed' ? 'text-status-compliant' :
                'text-slate-500'
              )}>
                · {iStatusConfig.label}
              </span>
            </div>
          )}
        </div>

        {/* Right: save indicator + actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Save / online indicator */}
          <div className="flex items-center gap-1.5">
            {saving ? (
              <>
                <span className="w-3 h-3 border-[1.5px] border-brand-orange/40 border-t-brand-orange rounded-full animate-spin" />
                <span className="text-slate-500 text-xs hidden sm:block">Saving…</span>
              </>
            ) : online ? (
              <>
                <Cloud size={14} className="text-status-compliant" />
                <span className="text-slate-500 text-xs hidden sm:block">Saved</span>
              </>
            ) : (
              <>
                <CloudOff size={14} className="text-status-recommendation" />
                <span className="text-slate-500 text-xs hidden sm:block">Offline</span>
              </>
            )}
          </div>

          {actions}
        </div>
      </div>

      {/* Progress bar (shown during active inspection) */}
      {showProgress && (
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-slate-500 text-xs">
              {categoriesWithAssets.length} / {ASSET_CATEGORIES.length} categories
            </span>
            <span className="text-slate-400 text-xs font-mono">{progressPct}%</span>
          </div>
          <div className="h-1.5 bg-surface-overlay rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-orange rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Category dots */}
          {activeCategory && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {ASSET_CATEGORIES.map((cat) => {
                const hasAssets = assets.some((a) => a.category === cat)
                const hasNonCompliant = assets.some(
                  (a) => a.category === cat && a.status === 'non_compliant'
                )
                const isActive = cat === activeCategory

                return (
                  <div
                    key={cat}
                    className={cn(
                      'w-2 h-2 rounded-full transition-all duration-200',
                      isActive ? 'bg-brand-orange scale-125' :
                      hasNonCompliant ? 'bg-status-noncompliant' :
                      hasAssets ? 'bg-status-compliant' :
                      'bg-surface-border'
                    )}
                    title={cat}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
