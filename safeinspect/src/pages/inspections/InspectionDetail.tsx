import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Map, List, BarChart2, ChevronRight,
  AlertTriangle, CheckCircle2, XCircle, Clock,
  FileText, Share2, MoreVertical, Layers,
  ArrowUpRight, Download, CloudUpload, Loader2,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useInspectionStore } from '@/store/inspection.store'
import { InspectionHeader } from '@/components/inspection/InspectionHeader'
import { CategorySection } from '@/components/inspection/CategorySection'
import { SiteMap } from '@/components/inspection/SiteMap'
import { ASSET_CATEGORIES, ASSET_CATEGORY_LABELS } from '@/types/database'
import type { AssetCategory } from '@/types/database'
import { ASSET_STATUS_CONFIG } from '@/lib/inspection-data'
import {
  generateAndDownloadReport,
  generateAndUploadReport,
  type ProgressCallback,
} from '@/lib/reportGenerator'
import { SignatureSection } from '@/components/inspection/SignaturePad'

// ─── Tab types ────────────────────────────────────────────────

type Tab = 'checklist' | 'map' | 'summary'

// ─── Summary table (mirrors Abseal PDF summary table) ────────

function InspectionSummaryTable({ inspectionId }: { inspectionId: string }) {
  const { getCategorySummaries } = useInspectionStore()
  const summaries = getCategorySummaries()

  const totals = summaries.reduce(
    (acc, s) => ({
      total: acc.total + s.total,
      compliant: acc.compliant + s.compliant,
      non_compliant: acc.non_compliant + s.non_compliant,
    }),
    { total: 0, compliant: 0, non_compliant: 0 }
  )

  if (summaries.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center px-4">
        <Layers size={32} className="text-slate-600 mb-3" />
        <p className="text-white font-display text-lg font-bold mb-1">No items recorded yet</p>
        <p className="text-slate-500 text-sm">Switch to the checklist tab to start adding assets.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-border">
            <th className="text-left py-2.5 px-3 text-slate-500 text-[10px] font-semibold uppercase tracking-widest">Category</th>
            <th className="text-center py-2.5 px-2 text-slate-500 text-[10px] font-semibold uppercase tracking-widest w-12">Total</th>
            <th className="text-center py-2.5 px-2 text-status-compliant text-[10px] font-semibold uppercase tracking-widest w-16">✓</th>
            <th className="text-center py-2.5 px-2 text-status-noncompliant text-[10px] font-semibold uppercase tracking-widest w-16">✗</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((s) => (
            <tr key={s.category} className="border-b border-surface-border/50 hover:bg-surface-overlay transition-colors">
              <td className="py-2.5 px-3">
                <div>
                  <span className="text-white text-xs font-medium">{ASSET_CATEGORY_LABELS[s.category]}</span>
                  <span className="text-slate-600 text-[10px] font-mono ml-1.5">{s.category}</span>
                </div>
              </td>
              <td className="text-center py-2.5 px-2 text-white font-mono text-xs">{s.total}</td>
              <td className="text-center py-2.5 px-2">
                <span className={cn('font-mono text-xs', s.compliant > 0 ? 'text-status-compliant' : 'text-slate-600')}>
                  {s.compliant}
                </span>
              </td>
              <td className="text-center py-2.5 px-2">
                <span className={cn('font-mono text-xs font-bold', s.non_compliant > 0 ? 'text-status-noncompliant' : 'text-slate-600')}>
                  {s.non_compliant}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-surface-border">
            <td className="py-3 px-3 text-white text-xs font-bold uppercase tracking-wide">Totals</td>
            <td className="text-center py-3 px-2 text-white font-mono text-xs font-bold">{totals.total}</td>
            <td className="text-center py-3 px-2 text-status-compliant font-mono text-xs font-bold">{totals.compliant}</td>
            <td className="text-center py-3 px-2 text-status-noncompliant font-mono text-xs font-bold">{totals.non_compliant}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── Non-compliant items summary ─────────────────────────────

function NonCompliantSummary() {
  const { assets } = useInspectionStore()
  const navigate = useNavigate()

  const issues = assets.filter(
    (a) => a.status === 'non_compliant' || a.status === 'recommendation'
  )

  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-status-compliant-bg border border-status-compliant/20">
        <CheckCircle2 size={18} className="text-status-compliant shrink-0" />
        <p className="text-status-compliant text-sm font-medium">
          No non-compliant items or recommendations recorded.
        </p>
      </div>
    )
  }

  const byPriority = {
    1: issues.filter((a) => a.priority === 1),
    2: issues.filter((a) => a.priority === 2),
    3: issues.filter((a) => a.priority === 3),
    null: issues.filter((a) => a.priority === null),
  }

  return (
    <div className="space-y-4">
      {([1, 2, 3] as const).map((p) => {
        const items = byPriority[p]
        if (items.length === 0) return null
        const labels = { 1: 'Priority 1 — Immediate Action', 2: 'Priority 2 — Within 30 Days', 3: 'Priority 3 — Planned' }
        const colors = { 1: 'text-status-noncompliant border-status-noncompliant/30', 2: 'text-status-recommendation border-status-recommendation/30', 3: 'text-yellow-500 border-yellow-500/30' }
        return (
          <div key={p}>
            <h4 className={cn('text-xs font-bold uppercase tracking-wider mb-2', colors[p].split(' ')[0])}>{labels[p]}</h4>
            <div className="space-y-2">
              {items.map((a) => (
                <div key={a.id} className={cn('flex items-start gap-3 p-3 rounded-xl border bg-surface-raised', colors[p].split(' ')[1])}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-white text-sm">{a.asset_code}</span>
                      <span className={cn('text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-md', ASSET_STATUS_CONFIG[a.status as keyof typeof ASSET_STATUS_CONFIG].bg, ASSET_STATUS_CONFIG[a.status as keyof typeof ASSET_STATUS_CONFIG].color)}>
                        {ASSET_STATUS_CONFIG[a.status as keyof typeof ASSET_STATUS_CONFIG].label}
                      </span>
                    </div>
                    {a.finding && <p className="text-slate-400 text-xs line-clamp-2 mb-1">{a.finding}</p>}
                    {a.corrective_action && (
                      <p className="text-slate-300 text-xs">
                        <span className="text-slate-500">Action: </span>{a.corrective_action}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── InspectionDetail ─────────────────────────────────────────

export default function InspectionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const {
    activeInspection, saving,
    loadInspection, loadAssets, loadSitePlan,
    updateInspection, getOverallStatus,
    assets,
  } = useInspectionStore()

  const [tab, setTab] = useState<Tab>('checklist')
  const [highlightCode, setHighlightCode] = useState<string | null>(null)
  const [activeCat, setActiveCat] = useState<AssetCategory | null>(null)

  // ── Report generation state ─────────────────────────────────
  const [reportGenerating, setReportGenerating] = useState(false)
  const [reportProgress, setReportProgress] = useState(0)
  const [reportProgressLabel, setReportProgressLabel] = useState('')
  const [reportError, setReportError] = useState<string | null>(null)
  const [reportCloudUrl, setReportCloudUrl] = useState<string | null>(null)

  // Load inspection + assets + site plan on mount
  useEffect(() => {
    if (!id) return
    loadInspection(id)
    loadAssets(id)
    loadSitePlan(id)
  }, [id, loadInspection, loadAssets, loadSitePlan])

  // Update overall status whenever assets change
  useEffect(() => {
    if (!id || !activeInspection) return
    const status = getOverallStatus()
    if (status !== activeInspection.overall_status) {
      updateInspection(id, {
        overall_status: status,
        inspection_status: assets.length > 0 ? 'in_progress' : 'draft',
      })
    }
  }, [assets]) // eslint-disable-line

  // When a map marker is clicked → switch to checklist and highlight that asset
  const handleMarkerClick = useCallback((assetCode: string) => {
    setTab('checklist')
    setHighlightCode(assetCode)

    // Find which category this code belongs to
    const asset = assets.find((a) => a.asset_code === assetCode)
    if (asset) setActiveCat(asset.category as AssetCategory)

    // Scroll to the asset
    setTimeout(() => {
      const el = document.getElementById(`asset-${assetCode}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 200)

    // Clear highlight after 3s
    setTimeout(() => setHighlightCode(null), 3000)
  }, [assets])

  // When "Map" is tapped from an asset form → switch to map tab
  const handleOpenMap = useCallback((assetCode: string) => {
    setTab('map')
  }, [])

  // Mark inspection complete
  const handleMarkComplete = async () => {
    if (!id) return
    await updateInspection(id, {
      overall_status: getOverallStatus(),
      inspection_status: 'completed',
      inspector_sign_off_date: new Date().toISOString().split('T')[0],
    })
  }

  // Generate and download PDF report
  const handleGenerateReport = async () => {
    if (!id) return
    setReportGenerating(true)
    setReportProgress(0)
    setReportProgressLabel('Starting…')
    setReportError(null)

    const progressCb: ProgressCallback = (pct, label) => {
      setReportProgress(pct)
      setReportProgressLabel(label)
    }

    try {
      await generateAndDownloadReport(id, progressCb)
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Report generation failed')
    } finally {
      setReportGenerating(false)
    }
  }

  // Generate and save to cloud
  const handleUploadReport = async () => {
    if (!id || !user?.id) return
    setReportGenerating(true)
    setReportProgress(0)
    setReportProgressLabel('Starting…')
    setReportError(null)

    const progressCb: ProgressCallback = (pct, label) => {
      setReportProgress(pct)
      setReportProgressLabel(label)
    }

    try {
      const url = await generateAndUploadReport(id, user.id, progressCb)
      setReportCloudUrl(url)
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setReportGenerating(false)
    }
  }

  // Signature save handlers
  const handleCertifierSigned = async (url: string) => {
    if (!id) return
    await updateInspection(id, { certifier_signature_url: url })
  }

  const handleClientSigned = async (url: string) => {
    if (!id) return
    await updateInspection(id, { inspector_signature_url: url })
  }

  if (!activeInspection) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <span className="w-8 h-8 border-2 border-brand-orange/30 border-t-brand-orange rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Loading inspection…</p>
        </div>
      </div>
    )
  }

  const categoriesWithItems = ASSET_CATEGORIES.filter(
    (cat) => (useInspectionStore.getState().assetsByCategory[cat] ?? []).length > 0
  )

  const completedCount = assets.filter((a) => a.status !== undefined).length
  const totalCategories = ASSET_CATEGORIES.length

  return (
    <div className="max-w-2xl mx-auto lg:max-w-4xl">
      {/* ── Sticky header ─────────────────────────────────── */}
      <InspectionHeader
        title={activeInspection.site_name}
        subtitle={`${activeInspection.client_name} · #${activeInspection.job_number}`}
        saving={saving}
        overallStatus={activeInspection.overall_status}
        inspectionStatus={activeInspection.inspection_status}
        showProgress
        backTo="/inspections"
        actions={
          <button
            onClick={handleGenerateReport}
            disabled={reportGenerating || assets.length === 0}
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-brand-orange text-white text-xs font-bold shadow-md hover:bg-orange-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {reportGenerating
              ? <Loader2 size={13} className="animate-spin" />
              : <Download size={13} />
            }
            {reportGenerating ? `${reportProgress}%` : 'PDF'}
          </button>
        }
      />

      {/* ── Tab bar ───────────────────────────────────────── */}
      <div className="sticky top-[calc(var(--header-h,7rem))] z-[9] bg-surface-base border-b border-surface-border px-4">
        <div className="flex gap-1">
          {([
            { id: 'checklist', icon: List,      label: 'Checklist' },
            { id: 'map',       icon: Map,        label: 'Site Map'  },
            { id: 'summary',   icon: BarChart2,   label: 'Summary'  },
          ] as const).map(({ id: tabId, icon: Icon, label }) => (
            <button
              key={tabId}
              onClick={() => setTab(tabId)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-all',
                tab === tabId
                  ? 'border-brand-orange text-brand-orange'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              )}
            >
              <Icon size={15} />
              <span className="hidden sm:block">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────────── */}
      <div className="px-4 py-4">

        {/* CHECKLIST TAB */}
        {tab === 'checklist' && (
          <div className="space-y-3">
            {/* Site info card */}
            <div className="bg-surface-raised rounded-2xl border border-surface-border p-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-0.5">Site</p>
                  <p className="text-white font-medium">{activeInspection.site_name}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-0.5">Client</p>
                  <p className="text-white font-medium">{activeInspection.client_name}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-0.5">Date</p>
                  <p className="text-white">
                    {format(parseISO(activeInspection.date_of_inspection), 'd MMM yyyy')}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-0.5">Area Ref</p>
                  <p className="text-white">{activeInspection.roof_area_reference ?? '—'}</p>
                </div>
              </div>
            </div>

            {/* Category sections — all 21 */}
            {ASSET_CATEGORIES.map((cat, i) => (
              <CategorySection
                key={cat}
                inspectionId={activeInspection.id}
                category={cat}
                highlightAssetCode={highlightCode}
                onOpenMap={handleOpenMap}
                defaultExpanded={i === 0 || activeCat === cat}
              />
            ))}

            {/* Complete inspection button */}
            {activeInspection.inspection_status !== 'completed' && assets.length > 0 && (
              <div className="pt-4 pb-6">
                <button
                  onClick={handleMarkComplete}
                  disabled={saving}
                  className="w-full h-14 rounded-2xl font-display font-bold text-lg bg-brand-orange text-white shadow-lg shadow-brand-orange/25 hover:bg-orange-500 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {saving
                    ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <><CheckCircle2 size={20} /> Mark Inspection Complete</>
                  }
                </button>
              </div>
            )}
          </div>
        )}

        {/* MAP TAB */}
        {tab === 'map' && (
          <div className="h-[calc(100vh-14rem)]">
            <SiteMap
              inspectionId={activeInspection.id}
              onMarkerClick={handleMarkerClick}
            />
          </div>
        )}

        {/* SUMMARY TAB */}
        {tab === 'summary' && (
          <div className="space-y-6">
            {/* Overall status */}
            {activeInspection.overall_status && (
              <div className={cn(
                'flex items-center gap-3 p-4 rounded-2xl border',
                activeInspection.overall_status === 'compliant'
                  ? 'bg-status-compliant-bg border-status-compliant/30'
                  : activeInspection.overall_status === 'non_compliant'
                  ? 'bg-status-noncompliant-bg border-status-noncompliant/30'
                  : 'bg-status-recommendation-bg border-status-recommendation/30'
              )}>
                {activeInspection.overall_status === 'compliant' ? (
                  <CheckCircle2 size={22} className="text-status-compliant shrink-0" />
                ) : activeInspection.overall_status === 'non_compliant' ? (
                  <XCircle size={22} className="text-status-noncompliant shrink-0" />
                ) : (
                  <AlertTriangle size={22} className="text-status-recommendation shrink-0" />
                )}
                <div>
                  <p className={cn('font-display text-lg font-bold',
                    activeInspection.overall_status === 'compliant' ? 'text-status-compliant' :
                    activeInspection.overall_status === 'non_compliant' ? 'text-status-noncompliant' :
                    'text-status-recommendation'
                  )}>
                    {activeInspection.overall_status === 'compliant' ? 'Overall: Compliant' :
                     activeInspection.overall_status === 'non_compliant' ? 'Overall: Non-Compliant' :
                     'Overall: Partially Compliant'}
                  </p>
                  <p className="text-slate-500 text-xs">
                    {assets.length} items recorded · {format(parseISO(activeInspection.date_of_inspection), 'd MMM yyyy')}
                  </p>
                </div>
              </div>
            )}

            {/* Inspection item summary table */}
            <div className="bg-surface-raised rounded-2xl border border-surface-border overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-border">
                <h3 className="font-display font-bold text-white text-base uppercase tracking-wide">
                  Inspection Item Summary
                </h3>
                <p className="text-slate-500 text-xs mt-0.5">
                  Per AS1891.4:2009 Section 9 · {format(parseISO(activeInspection.date_of_inspection), 'd MMM yyyy')}
                </p>
              </div>
              <InspectionSummaryTable inspectionId={activeInspection.id} />
            </div>

            {/* Non-compliant items */}
            <div className="bg-surface-raised rounded-2xl border border-surface-border overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-border">
                <h3 className="font-display font-bold text-white text-base uppercase tracking-wide">
                  Recommendations Summary
                </h3>
                <p className="text-slate-500 text-xs mt-0.5">Non-compliant and recommendation items consolidated by priority</p>
              </div>
              <div className="p-4">
                <NonCompliantSummary />
              </div>
            </div>

            {/* Signatures */}
            <SignatureSection
              inspectionId={activeInspection.id}
              certifierName={activeInspection.certifier_id}
              clientName={activeInspection.client_name}
              existingCertifierUrl={activeInspection.certifier_signature_url}
              existingClientUrl={activeInspection.inspector_signature_url}
              onCertifierSaved={handleCertifierSigned}
              onClientSaved={handleClientSigned}
            />

            {/* Generate report CTA */}
            <div className="pb-6 space-y-3">

              {/* Error banner */}
              {reportError && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-status-noncompliant-bg border border-status-noncompliant/30">
                  <AlertTriangle size={15} className="text-status-noncompliant shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-status-noncompliant text-sm font-medium">Report generation failed</p>
                    <p className="text-status-noncompliant/80 text-xs mt-0.5">{reportError}</p>
                  </div>
                  <button onClick={() => setReportError(null)} className="text-status-noncompliant/60 hover:text-status-noncompliant">
                    <XCircle size={14} />
                  </button>
                </div>
              )}

              {/* Progress bar */}
              {reportGenerating && (
                <div className="p-4 rounded-xl bg-surface-raised border border-surface-border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Loader2 size={14} className="text-brand-orange animate-spin" />
                      <span className="text-white text-sm font-medium">Generating PDF…</span>
                    </div>
                    <span className="text-brand-orange text-sm font-mono font-bold">{reportProgress}%</span>
                  </div>
                  <div className="h-2 bg-surface-overlay rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-orange rounded-full transition-all duration-300"
                      style={{ width: `${reportProgress}%` }}
                    />
                  </div>
                  <p className="text-slate-500 text-xs mt-1.5">{reportProgressLabel}</p>
                </div>
              )}

              {/* Cloud save success */}
              {reportCloudUrl && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-status-compliant-bg border border-status-compliant/30">
                  <CheckCircle2 size={15} className="text-status-compliant shrink-0" />
                  <div className="flex-1">
                    <p className="text-status-compliant text-sm font-medium">Report saved to cloud</p>
                    <a href={reportCloudUrl} target="_blank" rel="noreferrer"
                      className="text-status-compliant/80 text-xs underline">
                      Open report
                    </a>
                  </div>
                </div>
              )}

              {/* Primary: Download PDF */}
              <button
                onClick={handleGenerateReport}
                disabled={reportGenerating || assets.length === 0}
                className={cn(
                  "w-full h-14 rounded-2xl font-display font-bold text-lg transition-all flex items-center justify-center gap-2",
                  "active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
                  assets.length === 0
                    ? "bg-surface-overlay text-slate-500 border border-surface-border"
                    : "bg-brand-orange text-white shadow-lg shadow-brand-orange/25 hover:bg-orange-500"
                )}
              >
                {reportGenerating ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Download size={20} />
                )}
                {reportGenerating ? 'Generating…' : 'Download PDF Report'}
              </button>

              {/* Secondary: Save to cloud */}
              {assets.length > 0 && (
                <button
                  onClick={handleUploadReport}
                  disabled={reportGenerating}
                  className="w-full h-11 rounded-xl font-display font-semibold text-base transition-all flex items-center justify-center gap-2 bg-surface-raised border border-surface-border text-slate-300 hover:border-brand-orange/40 hover:text-white active:scale-[0.98] disabled:opacity-50"
                >
                  <CloudUpload size={16} className="text-brand-orange" />
                  Save Report to Cloud
                </button>
              )}

              {assets.length === 0 && (
                <p className="text-center text-slate-600 text-xs">
                  Add inspection items before generating a report.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
