import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, QrCode, LayoutTemplate, ClipboardCheck,
  TrendingUp, AlertTriangle, Clock, ArrowRight,
  CheckCircle2, XCircle, AlertCircle, FileText,
  ChevronRight, MapPin, Calendar,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { useAuthStore, selectDisplayName } from '@/store/auth.store'
import { useInspectionStore } from '@/store/inspection.store'
import type { Inspection, InspectionStatus, OverallSiteStatus } from '@/types/database'

// ─── Status config maps ───────────────────────────────────────

const SITE_STATUS: Record<
  OverallSiteStatus,
  { label: string; icon: typeof CheckCircle2; color: string; bg: string; border: string }
> = {
  compliant: {
    label: 'Compliant', icon: CheckCircle2,
    color: 'text-status-compliant', bg: 'bg-status-compliant-bg', border: 'border-status-compliant/30',
  },
  non_compliant: {
    label: 'Non-Compliant', icon: XCircle,
    color: 'text-status-noncompliant', bg: 'bg-status-noncompliant-bg', border: 'border-status-noncompliant/30',
  },
  partially_compliant: {
    label: 'Partial', icon: AlertCircle,
    color: 'text-status-recommendation', bg: 'bg-status-recommendation-bg', border: 'border-status-recommendation/30',
  },
}

const INSP_STATUS: Record<InspectionStatus, { label: string; color: string }> = {
  draft:       { label: 'Draft',       color: 'text-slate-400' },
  in_progress: { label: 'In Progress', color: 'text-brand-orange' },
  completed:   { label: 'Completed',   color: 'text-status-compliant' },
  issued:      { label: 'Issued',      color: 'text-brand-light' },
}

// ─── Sub-components ───────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, accent, trend,
}: {
  label: string
  value: string | number
  sub?: string
  icon: typeof ClipboardCheck
  accent: 'orange' | 'green' | 'red' | 'blue'
  trend?: { dir: 'up' | 'down'; pct: number }
}) {
  const accentMap = {
    orange: { icon: 'text-brand-orange', glow: 'shadow-brand-orange/20', bg: 'bg-brand-orange/10' },
    green:  { icon: 'text-status-compliant', glow: 'shadow-status-compliant/20', bg: 'bg-status-compliant-bg' },
    red:    { icon: 'text-status-noncompliant', glow: 'shadow-status-noncompliant/20', bg: 'bg-status-noncompliant-bg' },
    blue:   { icon: 'text-brand-light', glow: 'shadow-brand-light/20', bg: 'bg-brand-light/10' },
  }
  const { icon: iconCls, glow, bg } = accentMap[accent]

  return (
    <div className="bg-surface-raised rounded-2xl border border-surface-border p-4 flex items-start gap-4">
      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-lg', bg, glow)}>
        <Icon size={20} className={iconCls} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-slate-500 text-xs font-medium uppercase tracking-widest leading-none mb-1.5">
          {label}
        </p>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-2xl font-bold text-white">{value}</span>
          {trend && (
            <span className={cn(
              'text-xs font-medium',
              trend.dir === 'up' ? 'text-status-compliant' : 'text-status-noncompliant'
            )}>
              {trend.dir === 'up' ? '↑' : '↓'} {trend.pct}%
            </span>
          )}
        </div>
        {sub && <p className="text-slate-500 text-xs mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  )
}

function InspectionCard({ inspection, onClick }: { inspection: Inspection; onClick: () => void }) {
  const siteStatus = inspection.overall_status
    ? SITE_STATUS[inspection.overall_status]
    : null
  const inspStatus = INSP_STATUS[inspection.inspection_status]

  const StatusIcon = siteStatus?.icon

  return (
    <button
      onClick={onClick}
      className="w-full bg-surface-raised border border-surface-border rounded-2xl p-4 flex items-start gap-3 hover:border-brand-orange/40 hover:bg-surface-overlay active:scale-[0.98] transition-all duration-150 text-left group"
    >
      {/* Status indicator strip */}
      <div className={cn(
        'w-1 self-stretch rounded-full shrink-0',
        inspection.overall_status === 'compliant' ? 'bg-status-compliant' :
        inspection.overall_status === 'non_compliant' ? 'bg-status-noncompliant' :
        inspection.overall_status === 'partially_compliant' ? 'bg-status-recommendation' :
        'bg-surface-border'
      )} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold text-white truncate leading-tight">
              {inspection.site_name}
            </h3>
            <p className="text-slate-400 text-xs truncate">{inspection.client_name}</p>
          </div>
          {siteStatus && StatusIcon && (
            <span className={cn(
              'inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-lg shrink-0 border',
              siteStatus.bg, siteStatus.color, siteStatus.border
            )}>
              <StatusIcon size={10} />
              {siteStatus.label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500 mt-2">
          <span className="flex items-center gap-1">
            <MapPin size={10} />
            {inspection.roof_area_reference || inspection.site_address.split(',')[0]}
          </span>
          <span className="flex items-center gap-1">
            <Calendar size={10} />
            {format(parseISO(inspection.date_of_inspection), 'd MMM yyyy')}
          </span>
          <span className={cn('font-medium ml-auto', inspStatus.color)}>
            {inspStatus.label}
          </span>
        </div>

        {/* Job number */}
        <p className="text-slate-600 text-[10px] font-mono mt-1.5">
          #{inspection.job_number}
        </p>
      </div>

      <ChevronRight
        size={16}
        className="text-slate-600 shrink-0 group-hover:text-brand-orange transition-colors mt-0.5"
      />
    </button>
  )
}

function QuickAction({
  icon: Icon, label, sub, onClick, accent = false,
}: {
  icon: typeof Plus
  label: string
  sub: string
  onClick: () => void
  accent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-1.5 p-4 rounded-2xl border transition-all duration-150 active:scale-[0.97] text-left',
        accent
          ? 'bg-brand-orange border-brand-orange/0 shadow-lg shadow-brand-orange/25 hover:bg-orange-500'
          : 'bg-surface-raised border-surface-border hover:border-brand-orange/40 hover:bg-surface-overlay'
      )}
    >
      <div className={cn(
        'w-9 h-9 rounded-xl flex items-center justify-center',
        accent ? 'bg-white/20' : 'bg-surface-overlay'
      )}>
        <Icon size={18} className={accent ? 'text-white' : 'text-brand-orange'} />
      </div>
      <div>
        <p className={cn('text-sm font-display font-bold', accent ? 'text-white' : 'text-white')}>
          {label}
        </p>
        <p className={cn('text-[11px] leading-tight mt-0.5', accent ? 'text-orange-100' : 'text-slate-500')}>
          {sub}
        </p>
      </div>
    </button>
  )
}

// ─── Dashboard ────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const displayName = useAuthStore(selectDisplayName)

  const {
    inspections, inspectionsLoading, stats,
    fetchInspections, fetchStats, initDraft,
  } = useInspectionStore()

  useEffect(() => {
    if (user?.id) {
      fetchInspections(user.id)
      fetchStats(user.id)
    }
  }, [user?.id, fetchInspections, fetchStats])

  const recentInspections = inspections.slice(0, 8)
  const inProgress = inspections.filter((i) => i.inspection_status === 'in_progress')

  const handleNewInspection = () => {
    initDraft()
    navigate('/inspections/new')
  }

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div className="max-w-2xl mx-auto lg:max-w-4xl px-4 pt-6 pb-4">

      {/* ── Page header ───────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-slate-500 text-sm">{greeting()},</p>
            <h1 className="font-display text-2xl font-bold text-white mt-0.5">
              {displayName.split(' ')[0]}
            </h1>
          </div>
          {/* Quick date */}
          <div className="text-right">
            <p className="text-white text-sm font-medium">
              {format(new Date(), 'EEE d MMM')}
            </p>
            <p className="text-slate-500 text-xs">{format(new Date(), 'yyyy')}</p>
          </div>
        </div>

        {/* Active inspection banner — shown when there's one in progress */}
        {inProgress.length > 0 && (
          <button
            onClick={() => navigate(`/inspections/${inProgress[0].id}`)}
            className="mt-4 w-full flex items-center gap-3 p-3 rounded-xl bg-brand-orange/10 border border-brand-orange/30 hover:bg-brand-orange/15 transition-all active:scale-[0.98]"
          >
            <div className="w-2 h-2 rounded-full bg-brand-orange animate-pulse shrink-0" />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-brand-orange text-sm font-semibold truncate">
                Continue: {inProgress[0].site_name}
              </p>
              <p className="text-slate-400 text-xs">{inProgress[0].client_name} · In Progress</p>
            </div>
            <ArrowRight size={16} className="text-brand-orange shrink-0" />
          </button>
        )}
      </div>

      {/* ── Stats grid ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard
          label="This Month"
          value={stats.thisMonth}
          sub="inspections completed"
          icon={ClipboardCheck}
          accent="orange"
        />
        <StatCard
          label="Avg Compliance"
          value={`${stats.avgCompliance}%`}
          sub="across all sites"
          icon={TrendingUp}
          accent={stats.avgCompliance >= 80 ? 'green' : stats.avgCompliance >= 50 ? 'orange' : 'red'}
        />
        <StatCard
          label="In Progress"
          value={stats.pending}
          sub="active inspections"
          icon={Clock}
          accent="blue"
        />
        <StatCard
          label="Drafts"
          value={stats.drafts}
          sub="pending completion"
          icon={AlertTriangle}
          accent={stats.drafts > 0 ? 'red' : 'green'}
        />
      </div>

      {/* ── Quick actions ─────────────────────────────────── */}
      <div className="mb-6">
        <h2 className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <QuickAction
            icon={Plus}
            label="New Inspection"
            sub="Start a site"
            onClick={handleNewInspection}
            accent
          />
          <QuickAction
            icon={QrCode}
            label="Scan QR"
            sub="Open by code"
            onClick={() => navigate('/inspections/scan')}
          />
          <QuickAction
            icon={LayoutTemplate}
            label="Templates"
            sub="Saved layouts"
            onClick={() => navigate('/templates')}
          />
        </div>
      </div>

      {/* ── Recent Inspections ────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-slate-500 text-xs font-semibold uppercase tracking-widest">
            Recent Inspections
          </h2>
          <button
            onClick={() => navigate('/inspections')}
            className="flex items-center gap-1 text-brand-light text-xs hover:text-white transition-colors"
          >
            View all <ChevronRight size={12} />
          </button>
        </div>

        {inspectionsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-surface-raised rounded-2xl border border-surface-border animate-pulse" />
            ))}
          </div>
        ) : recentInspections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-raised border border-surface-border flex items-center justify-center mb-4">
              <FileText size={28} className="text-slate-600" />
            </div>
            <p className="text-white font-display text-lg font-bold mb-1">No inspections yet</p>
            <p className="text-slate-500 text-sm mb-6 max-w-xs">
              Start your first height safety inspection to see it here.
            </p>
            <button
              onClick={handleNewInspection}
              className="btn-primary px-6 text-base"
            >
              <Plus size={18} /> New Inspection
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {recentInspections.map((inspection) => (
              <InspectionCard
                key={inspection.id}
                inspection={inspection}
                onClick={() => navigate(`/inspections/${inspection.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
