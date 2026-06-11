import { useState, useRef, useCallback } from 'react'
import {
  ChevronDown, Plus, CheckCircle2, XCircle, AlertCircle,
  MinusCircle, Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInspectionStore } from '@/store/inspection.store'
import { AssetItemForm } from './AssetItemForm'
import type { AssetCategory, InspectionAsset } from '@/types/database'
import { ASSET_CATEGORY_LABELS } from '@/types/database'
import { ASSET_STATUS_CONFIG } from '@/lib/inspection-data'

// ─── Category icons ───────────────────────────────────────────
// Each category gets a representative icon for quick identification

const CATEGORY_ICONS: Partial<Record<AssetCategory, string>> = {
  APS:  '🪧',  ST:   '🪝',  TMAP: '⚓',  CAP:  '🔩',
  HSL:  '🔗',  VSL:  '📏',  LD:   '🪜',  GR:   '🚧',
  WW:   '🛤️',  STP:  '👣',  STR:  '🏗️',  SL:   '🪜',
  EK:   '🚪',  PL:   '🟫',  GHK:  '🪤',  SS:   '⚠️',
  DB:   '🏗️',  RR:   '🛤️',  SPM:  '🔲',  OSE:  '🔧',
  R:    '📋',
}

// ─── Mini stats pill ──────────────────────────────────────────

function StatPill({ count, type }: { count: number; type: 'compliant' | 'non_compliant' | 'recommendation' | 'na' }) {
  if (count === 0) return null
  const configs = {
    compliant:      { icon: CheckCircle2, color: 'text-status-compliant',     bg: 'bg-status-compliant-bg'     },
    non_compliant:  { icon: XCircle,      color: 'text-status-noncompliant',  bg: 'bg-status-noncompliant-bg'  },
    recommendation: { icon: AlertCircle,  color: 'text-status-recommendation', bg: 'bg-status-recommendation-bg'},
    na:             { icon: MinusCircle,  color: 'text-status-na',            bg: 'bg-status-na-bg'            },
  }
  const { icon: Icon, color, bg } = configs[type]
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md', bg, color)}>
      <Icon size={9} />
      {count}
    </span>
  )
}

// ─── Props ────────────────────────────────────────────────────

interface CategorySectionProps {
  inspectionId: string
  category: AssetCategory
  /** Pre-scroll here when marker is tapped on map */
  highlightAssetCode?: string | null
  onOpenMap?: (assetCode: string) => void
  /** Start expanded (e.g. first category, or deep-linked) */
  defaultExpanded?: boolean
}

// ─── CategorySection ──────────────────────────────────────────

export function CategorySection({
  inspectionId, category, highlightAssetCode, onOpenMap, defaultExpanded = false,
}: CategorySectionProps) {
  const { assetsByCategory, getNextAssetCode } = useInspectionStore()
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [addingNew, setAddingNew] = useState(false)
  const newFormRef = useRef<HTMLDivElement>(null)

  const assets: InspectionAsset[] = assetsByCategory[category] ?? []

  // Derived stats
  const stats = {
    total:          assets.length,
    compliant:      assets.filter((a) => a.status === 'compliant').length,
    non_compliant:  assets.filter((a) => a.status === 'non_compliant').length,
    recommendation: assets.filter((a) => a.status === 'recommendation').length,
    na:             assets.filter((a) => a.status === 'n/a').length,
  }

  const hasIssues = stats.non_compliant > 0 || stats.recommendation > 0

  // Header left-border colour: red if any non-compliant, orange if recommendation, green if all compliant
  const headerAccent =
    stats.non_compliant > 0  ? 'border-l-status-noncompliant' :
    stats.recommendation > 0 ? 'border-l-status-recommendation' :
    stats.total > 0           ? 'border-l-status-compliant' :
                                'border-l-surface-border'

  const handleAddNew = () => {
    if (!expanded) setExpanded(true)
    setAddingNew(true)
    // Scroll to new form after render
    setTimeout(() => {
      newFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  const handleNewSaved = useCallback(() => {
    setAddingNew(false)
  }, [])

  const handleDeleted = useCallback(() => {
    // noop — store handles asset removal, component re-renders
  }, [])

  const categoryLabel = ASSET_CATEGORY_LABELS[category]
  const icon = CATEGORY_ICONS[category] ?? '📌'

  return (
    <div
      id={`category-${category}`}
      className={cn(
        'rounded-2xl border border-surface-border overflow-hidden transition-all duration-200',
        expanded && 'shadow-sm'
      )}
    >
      {/* ── Section Header ─────────────────────────────── */}
      <div
        className={cn(
          'flex items-center gap-3 px-4 cursor-pointer select-none border-l-4 transition-all',
          headerAccent,
          expanded ? 'bg-surface-overlay py-3.5' : 'bg-surface-raised py-3 hover:bg-surface-overlay'
        )}
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
      >
        {/* Icon + label */}
        <span className="text-lg shrink-0 leading-none">{icon}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-bold text-white text-base leading-tight tracking-wide truncate">
              {categoryLabel}
            </h3>
            <span className="text-slate-600 text-[10px] font-mono shrink-0">({category})</span>
          </div>

          {/* Stats row */}
          {stats.total > 0 ? (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="text-slate-500 text-[11px]">{stats.total} item{stats.total !== 1 ? 's' : ''}</span>
              <StatPill count={stats.compliant}      type="compliant"      />
              <StatPill count={stats.non_compliant}  type="non_compliant"  />
              <StatPill count={stats.recommendation} type="recommendation" />
              <StatPill count={stats.na}             type="na"             />
            </div>
          ) : (
            <p className="text-slate-600 text-[11px] mt-0.5 italic">No items recorded</p>
          )}
        </div>

        {/* Add button — shown always */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleAddNew() }}
          className={cn(
            'h-8 px-3 flex items-center gap-1.5 rounded-xl text-xs font-bold transition-all shrink-0',
            'bg-brand-orange/10 border border-brand-orange/30 text-brand-orange',
            'hover:bg-brand-orange/20 active:scale-95'
          )}
        >
          <Plus size={13} />
          <span className="hidden sm:block">Add</span>
        </button>

        {/* Expand chevron */}
        <ChevronDown
          size={16}
          className={cn(
            'text-slate-500 shrink-0 transition-transform duration-200',
            expanded && '-rotate-180'
          )}
        />
      </div>

      {/* ── Section Body ───────────────────────────────── */}
      {expanded && (
        <div className="bg-surface-base border-t border-surface-border px-3 py-3 space-y-3">

          {/* Issue callout */}
          {hasIssues && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-status-noncompliant-bg border border-status-noncompliant/20">
              <XCircle size={14} className="text-status-noncompliant shrink-0 mt-0.5" />
              <p className="text-status-noncompliant text-xs leading-relaxed">
                {stats.non_compliant > 0 && (
                  <><strong>{stats.non_compliant}</strong> non-compliant item{stats.non_compliant !== 1 ? 's' : ''} require corrective action. </>
                )}
                {stats.recommendation > 0 && (
                  <><strong>{stats.recommendation}</strong> recommendation{stats.recommendation !== 1 ? 's' : ''}.</>
                )}
              </p>
            </div>
          )}

          {/* Asset list */}
          {assets.map((asset) => (
            <div
              key={asset.id}
              id={`asset-${asset.asset_code}`}
              className={cn(
                'transition-all duration-300',
                highlightAssetCode === asset.asset_code &&
                  'ring-2 ring-brand-orange/60 ring-offset-2 ring-offset-surface-base rounded-2xl'
              )}
            >
              <AssetItemForm
                inspectionId={inspectionId}
                category={category}
                asset={asset}
                onOpenMap={onOpenMap}
                onDeleted={handleDeleted}
                defaultExpanded={highlightAssetCode === asset.asset_code}
              />
            </div>
          ))}

          {/* New asset form */}
          {addingNew && (
            <div ref={newFormRef}>
              <AssetItemForm
                inspectionId={inspectionId}
                category={category}
                onSaved={handleNewSaved}
                onOpenMap={onOpenMap}
                onDeleted={() => setAddingNew(false)}
                defaultExpanded
              />
            </div>
          )}

          {/* Add button at bottom (inside expanded section) */}
          {!addingNew && (
            <button
              type="button"
              onClick={handleAddNew}
              className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border-2 border-dashed border-surface-border text-slate-500 text-sm hover:border-brand-orange/50 hover:text-brand-orange hover:bg-brand-orange/5 transition-all active:scale-[0.98]"
            >
              <Plus size={16} />
              Add {categoryLabel} item
            </button>
          )}
        </div>
      )}
    </div>
  )
}
