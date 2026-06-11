import {
  useState, useEffect, useCallback, useRef,
} from 'react'
import {
  Camera, ImagePlus, X, MapPin, CheckCircle2, XCircle,
  AlertCircle, MinusCircle, ChevronDown, Trash2, Save,
  RotateCcw, AlertTriangle, ChevronRight, Zap, ClipboardList,
  BookOpen, Hash, Navigation2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useInspectionStore } from '@/store/inspection.store'
import { usePhotoCapture } from '@/hooks/usePhotoCapture'
import {
  QUICK_FILL_OPTIONS,
  INSPECTION_CHECKLIST,
  CATEGORY_STANDARDS,
  PRIORITY_CONFIG,
  ASSET_STATUS_CONFIG,
  getDefaultStandard,
  type QuickFillOption,
} from '@/lib/inspection-data'
import type {
  InspectionAsset, AssetCategory, AssetStatus, Priority,
} from '@/types/database'

// ─── Props ────────────────────────────────────────────────────

interface AssetItemFormProps {
  inspectionId: string
  category: AssetCategory
  asset?: InspectionAsset
  onSaved?: (asset: InspectionAsset) => void
  onOpenMap?: (assetCode: string) => void
  onDeleted?: () => void
  defaultExpanded?: boolean
}

// ─── Local form state ─────────────────────────────────────────

interface FormState {
  asset_code: string
  location_on_site: string
  status: AssetStatus
  priority: Priority | null
  finding: string
  standard_referenced: string
  corrective_action: string
}

const STATUS_OPTIONS: { value: AssetStatus; label: string; icon: typeof CheckCircle2 }[] = [
  { value: 'compliant',      label: 'Compliant',      icon: CheckCircle2 },
  { value: 'non_compliant',  label: 'Non-Compliant',  icon: XCircle      },
  { value: 'recommendation', label: 'Recommendation', icon: AlertCircle  },
  { value: 'n/a',            label: 'N/A',            icon: MinusCircle  },
]

// ─── Photo strip ──────────────────────────────────────────────

function PhotoStrip(props: ReturnType<typeof usePhotoCapture>) {
  const { photos, addFiles, removePhoto, updateCaption, openCamera, openFilePicker,
          fileInputRef, cameraInputRef, canAddMore } = props
  return (
    <div>
      {photos.length > 0 && (
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
          {photos.map((photo) => (
            <div key={photo.id} className="relative shrink-0 w-24 h-24 rounded-xl overflow-hidden border border-surface-border group">
              <img src={photo.localUrl} alt={photo.caption || 'Photo'} className="w-full h-full object-cover" draggable={false} />
              {/* Caption overlay */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 px-1.5 py-1.5">
                <input
                  value={photo.caption}
                  onChange={(e) => updateCaption(photo.id, e.target.value)}
                  placeholder="Caption…"
                  className="w-full bg-transparent text-white text-[9px] placeholder:text-white/50 outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              {/* Remove */}
              <button
                onClick={(e) => { e.stopPropagation(); removePhoto(photo.id) }}
                className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity"
              >
                <X size={10} className="text-white" />
              </button>
              {/* Upload spinner */}
              {photo.uploading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              )}
              {/* Error state */}
              {photo.error && (
                <div className="absolute inset-0 bg-red-900/70 flex items-center justify-center" title={photo.error}>
                  <AlertTriangle size={16} className="text-white" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {canAddMore && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={openCamera}
            className="flex items-center justify-center gap-2 h-11 rounded-xl bg-surface-base border border-surface-border text-slate-400 text-sm hover:border-brand-orange/40 hover:text-white transition-all active:scale-[0.97]">
            <Camera size={16} className="text-brand-orange" /> Camera
          </button>
          <button type="button" onClick={openFilePicker}
            className="flex items-center justify-center gap-2 h-11 rounded-xl bg-surface-base border border-surface-border text-slate-400 text-sm hover:border-brand-orange/40 hover:text-white transition-all active:scale-[0.97]">
            <ImagePlus size={16} className="text-brand-orange" /> Library
          </button>
        </div>
      )}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="sr-only" multiple onChange={(e) => e.target.files && addFiles(e.target.files)} />
      <input ref={fileInputRef}   type="file" accept="image/*"                       className="sr-only" multiple onChange={(e) => e.target.files && addFiles(e.target.files)} />
    </div>
  )
}

// ─── Smart quick-fill panel ───────────────────────────────────

function QuickFillPanel({
  category, currentStatus, onApply,
}: {
  category: AssetCategory
  currentStatus: AssetStatus
  onApply: (opt: QuickFillOption) => void
}) {
  const [open, setOpen] = useState(false)
  const options = QUICK_FILL_OPTIONS[category] ?? []
  if (options.length === 0) return null

  const statusOrder: AssetStatus[] = ['compliant', 'non_compliant', 'recommendation', 'n/a']
  const grouped = statusOrder.reduce<Record<AssetStatus, QuickFillOption[]>>(
    (acc, s) => { acc[s] = options.filter((o) => o.status === s); return acc },
    { compliant: [], non_compliant: [], recommendation: [], 'n/a': [] }
  )

  const statusLabel: Record<AssetStatus, string> = {
    compliant: 'Compliant', non_compliant: 'Non-Compliant',
    recommendation: 'Recommendation', 'n/a': 'N/A',
  }
  const statusColor: Record<AssetStatus, string> = {
    compliant: 'text-status-compliant', non_compliant: 'text-status-noncompliant',
    recommendation: 'text-status-recommendation', 'n/a': 'text-slate-400',
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-light hover:text-white transition-colors">
        <Zap size={11} />
        Quick Fill
        <ChevronDown size={11} className={cn('transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-50 bg-surface-raised border border-surface-border rounded-2xl shadow-2xl w-80 max-h-80 overflow-y-auto">
            <div className="p-2 space-y-1">
              {statusOrder.map((s) => {
                const opts = grouped[s]
                if (opts.length === 0) return null
                return (
                  <div key={s}>
                    <p className={cn('text-[9px] font-bold uppercase tracking-widest px-2 py-1', statusColor[s])}>
                      {statusLabel[s]}
                    </p>
                    {opts.map((opt, i) => (
                      <button key={i} type="button"
                        onClick={() => { onApply(opt); setOpen(false) }}
                        className="w-full text-left px-3 py-2.5 rounded-xl text-slate-300 text-xs hover:bg-surface-overlay hover:text-white transition-colors">
                        <span className="font-medium">{opt.label}</span>
                        {opt.finding && (
                          <p className="text-slate-600 text-[10px] mt-0.5 line-clamp-2 leading-relaxed">
                            {opt.finding}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Inspection checklist panel ───────────────────────────────

function ChecklistPanel({ category }: { category: AssetCategory }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const items = INSPECTION_CHECKLIST[category] ?? []
  if (items.length === 0) return null

  const allChecked = items.every((item) => checked[item])
  const someChecked = items.some((item) => checked[item])

  return (
    <div className="bg-surface-base rounded-xl border border-surface-border p-3">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <ClipboardList size={11} />
          Inspection Checklist
        </p>
        <span className={cn(
          'text-[10px] font-bold px-2 py-0.5 rounded-full',
          allChecked ? 'bg-status-compliant-bg text-status-compliant' :
          someChecked ? 'bg-brand-orange/10 text-brand-orange' :
          'bg-surface-overlay text-slate-500'
        )}>
          {items.filter((i) => checked[i]).length}/{items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <label key={item} className="flex items-start gap-2.5 cursor-pointer group">
            <div
              className={cn(
                'w-4 h-4 rounded flex items-center justify-center border shrink-0 mt-0.5 transition-all',
                checked[item]
                  ? 'bg-status-compliant border-status-compliant'
                  : 'border-surface-border group-hover:border-slate-500 bg-surface-raised'
              )}
              onClick={() => setChecked((prev) => ({ ...prev, [item]: !prev[item] }))}
            >
              {checked[item] && <CheckCircle2 size={11} className="text-white" strokeWidth={3} />}
            </div>
            <span className={cn(
              'text-xs leading-relaxed transition-colors',
              checked[item] ? 'text-slate-500 line-through' : 'text-slate-300'
            )}>
              {item}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

// ─── Field label helper ───────────────────────────────────────

function FieldLabel({
  children, required, action,
}: {
  children: React.ReactNode
  required?: boolean
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-1.5">
      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1">
        {children}
        {required && <span className="text-status-noncompliant">*</span>}
      </label>
      {action}
    </div>
  )
}

// ─── Text input ───────────────────────────────────────────────

function Input({ hasError, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }) {
  return (
    <input
      className={cn(
        'w-full h-11 bg-surface-base border rounded-xl px-3 text-white text-sm',
        'placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-orange/50',
        'hover:border-slate-500 transition-colors',
        hasError ? 'border-status-noncompliant/60' : 'border-surface-border',
        className
      )}
      {...props}
    />
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────

export function AssetItemForm({
  inspectionId, category, asset, onSaved, onOpenMap, onDeleted, defaultExpanded = false,
}: AssetItemFormProps) {
  const user = useAuthStore((s) => s.user)
  const { upsertAsset, deleteAsset, getNextAssetCode, saving, updateMarker, sitePlan } = useInspectionStore()

  const isNew = !asset
  const [expanded, setExpanded] = useState(defaultExpanded || isNew)
  const [dirty, setDirty] = useState(isNew)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [savedAssetId, setSavedAssetId] = useState<string | null>(asset?.id ?? null)
  const [showChecklist, setShowChecklist] = useState(false)

  const [form, setForm] = useState<FormState>(() => ({
    asset_code:          asset?.asset_code ?? getNextAssetCode(category),
    location_on_site:    asset?.location_on_site ?? '',
    status:              (asset?.status as AssetStatus) ?? 'compliant',
    priority:            (asset?.priority as Priority | null) ?? null,
    finding:             asset?.finding ?? '',
    standard_referenced: asset?.standard_referenced ?? getDefaultStandard(category),
    corrective_action:   asset?.corrective_action ?? '',
  }))

  const photoCapture = usePhotoCapture({
    inspectionId,
    assetId: savedAssetId,
    userId: user?.id ?? '',
  })

  const patch = useCallback((updates: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...updates }))
    setDirty(true)
  }, [])

  // Status → instantly sync map marker pin colour
  useEffect(() => {
    if (!form.asset_code) return
    const marker = sitePlan.markers.find((m) => m.asset_code === form.asset_code)
    if (marker) updateMarker(marker.id, { status: form.status })
  }, [form.status, form.asset_code]) // eslint-disable-line

  // Auto-clear priority when status doesn't need it
  useEffect(() => {
    if ((form.status === 'compliant' || form.status === 'n/a') && form.priority !== null) {
      setForm((p) => ({ ...p, priority: null }))
    }
  }, [form.status]) // eslint-disable-line

  // Apply quick-fill option (populates status + finding + corrective action + priority at once)
  const applyQuickFill = useCallback((opt: QuickFillOption) => {
    setForm((prev) => ({
      ...prev,
      status:           opt.status,
      priority:         opt.priority,
      finding:          opt.finding,
      corrective_action: opt.corrective_action,
    }))
    setDirty(true)
  }, [])

  const needsPriority  = form.status === 'non_compliant' || form.status === 'recommendation'
  const statusCfg      = ASSET_STATUS_CONFIG[form.status]
  const StatusIcon     = STATUS_OPTIONS.find((s) => s.value === form.status)!.icon
  const hasChecklist   = (INSPECTION_CHECKLIST[category] ?? []).length > 0

  // ── Save ────────────────────────────────────────────────────

  const handleSave = async () => {
    try {
      const saved = await upsertAsset({
        ...(asset?.id ? { id: asset.id } : {}),
        inspection_id:       inspectionId,
        category,
        asset_code:          form.asset_code,
        location_on_site:    form.location_on_site || null,
        status:              form.status,
        priority:            form.priority,
        finding:             form.finding || null,
        standard_referenced: form.standard_referenced || null,
        corrective_action:   form.corrective_action || null,
        photo_refs:          photoCapture.storagePaths,
        sort_order:          asset?.sort_order ?? 0,
      })
      setSavedAssetId(saved.id)
      if (photoCapture.photos.some((p) => p.file)) {
        await photoCapture.uploadAll(saved.id)
      }
      setDirty(false)
      onSaved?.(saved)
    } catch { /* error lives in store */ }
  }

  const handleDelete = async () => {
    if (!asset?.id) { onDeleted?.(); return }
    await deleteAsset(asset.id)
    onDeleted?.()
  }

  const resetForm = () => {
    setForm({
      asset_code:          asset?.asset_code ?? getNextAssetCode(category),
      location_on_site:    asset?.location_on_site ?? '',
      status:              (asset?.status as AssetStatus) ?? 'compliant',
      priority:            (asset?.priority as Priority | null) ?? null,
      finding:             asset?.finding ?? '',
      standard_referenced: asset?.standard_referenced ?? getDefaultStandard(category),
      corrective_action:   asset?.corrective_action ?? '',
    })
    setDirty(false)
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className={cn(
      'rounded-2xl border transition-all duration-200 overflow-hidden',
      expanded
        ? cn('border-2', statusCfg.border, 'shadow-sm')
        : 'border border-surface-border hover:border-slate-600'
    )}>

      {/* ── Collapsed header ────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3.5 text-left group',
          expanded ? cn(statusCfg.bg, 'bg-opacity-20') : 'bg-surface-raised'
        )}
      >
        {/* Status colour strip */}
        <div className={cn('w-1.5 self-stretch rounded-full shrink-0', statusCfg.dot)} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono font-bold text-white text-sm tracking-wider">{form.asset_code}</span>
            {dirty && (
              <span className="text-[9px] font-bold text-brand-orange bg-brand-orange/15 border border-brand-orange/30 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                Unsaved
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {form.location_on_site
              ? <p className="text-slate-500 text-xs truncate">{form.location_on_site}</p>
              : <p className="text-slate-700 text-xs italic">No location set</p>
            }
          </div>
        </div>

        {/* Status badge — desktop */}
        <span className={cn(
          'hidden sm:flex items-center gap-1.5 shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-lg border',
          statusCfg.bg, statusCfg.color, statusCfg.border
        )}>
          <StatusIcon size={11} />
          {statusCfg.label}
        </span>

        {/* Status dot — mobile */}
        <div className={cn('sm:hidden w-2.5 h-2.5 rounded-full shrink-0', statusCfg.dot)} />

        {/* Photo count */}
        {photoCapture.photos.length > 0 && (
          <span className="text-slate-500 text-xs shrink-0">📷{photoCapture.photos.length}</span>
        )}

        {/* Priority badge */}
        {form.priority && needsPriority && (
          <span className={cn(
            'hidden sm:flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black shrink-0',
            PRIORITY_CONFIG[form.priority].bg, PRIORITY_CONFIG[form.priority].color
          )}>
            P{form.priority}
          </span>
        )}

        <ChevronRight size={15} className={cn(
          'text-slate-600 shrink-0 transition-transform duration-200 group-hover:text-slate-400',
          expanded && 'rotate-90'
        )} />
      </button>

      {/* ── Expanded body ────────────────────────────────────── */}
      {expanded && (
        <div className="bg-surface-raised px-4 pb-5 pt-4 space-y-5 border-t border-surface-border/50">

          {/* ── Code + Location ─────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>
                <Hash size={11} className="text-slate-500" />
                Asset Code
              </FieldLabel>
              <Input
                value={form.asset_code}
                onChange={(e) => patch({ asset_code: e.target.value.toUpperCase() })}
                spellCheck={false}
                placeholder={`${category}-001`}
                className="font-mono"
              />
            </div>
            <div>
              <FieldLabel
                action={onOpenMap && (
                  <button type="button"
                    onClick={() => onOpenMap(form.asset_code)}
                    className="flex items-center gap-1 text-[11px] text-brand-light hover:text-white transition-colors">
                    <Navigation2 size={10} /> Map
                  </button>
                )}
              >
                <MapPin size={11} className="text-slate-500" />
                Location
              </FieldLabel>
              <Input
                value={form.location_on_site}
                onChange={(e) => patch({ location_on_site: e.target.value })}
                placeholder="e.g. North parapet"
              />
            </div>
          </div>

          {/* ── Status selector ──────────────────────────────── */}
          <div>
            <FieldLabel
              action={
                <QuickFillPanel
                  category={category}
                  currentStatus={form.status}
                  onApply={applyQuickFill}
                />
              }
            >
              Status
            </FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map(({ value, label, icon: Icon }) => {
                const cfg = ASSET_STATUS_CONFIG[value]
                const sel = form.status === value
                return (
                  <button key={value} type="button"
                    onClick={() => patch({ status: value })}
                    className={cn(
                      'flex items-center gap-2.5 px-3 h-12 rounded-xl border-2 transition-all duration-150 active:scale-[0.97]',
                      sel
                        ? cn(cfg.border, cfg.bg)
                        : 'border-surface-border bg-surface-base hover:border-slate-600'
                    )}>
                    <Icon size={18} className={sel ? cfg.color : 'text-slate-500'} strokeWidth={sel ? 2.5 : 1.75} />
                    <span className={cn('text-sm font-semibold', sel ? cfg.color : 'text-slate-400')}>{label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Priority (only when non-compliant or recommendation) ── */}
          {needsPriority && (
            <div>
              <FieldLabel required={form.status === 'non_compliant'}>Priority</FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                {([1, 2, 3] as Priority[]).map((p) => {
                  const cfg = PRIORITY_CONFIG[p]
                  const sel = form.priority === p
                  return (
                    <button key={p} type="button"
                      onClick={() => patch({ priority: sel ? null : p })}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1 py-3 rounded-xl border-2 transition-all duration-150 active:scale-[0.97]',
                        sel ? cn(cfg.border, cfg.bg) : 'border-surface-border bg-surface-base hover:border-slate-600'
                      )}>
                      <div className={cn('w-2.5 h-2.5 rounded-full', sel ? cfg.dot : 'bg-slate-600')} />
                      <span className={cn('text-sm font-bold font-display', sel ? cfg.color : 'text-slate-400')}>
                        P{p}
                      </span>
                      <span className={cn('text-[9px] leading-tight text-center px-1', sel ? cfg.color : 'text-slate-600')}>
                        {p === 1 ? 'Immediate' : p === 2 ? '30 Days' : 'Planned'}
                      </span>
                    </button>
                  )
                })}
              </div>
              {form.status === 'non_compliant' && !form.priority && (
                <p className="text-status-noncompliant text-xs mt-1.5 flex items-center gap-1">
                  <AlertCircle size={11} /> Priority required for non-compliant items
                </p>
              )}
            </div>
          )}

          {/* ── Inspection Checklist (toggle) ─────────────────── */}
          {hasChecklist && (
            <div>
              <button
                type="button"
                onClick={() => setShowChecklist((v) => !v)}
                className="flex items-center gap-2 text-[11px] font-semibold text-slate-400 hover:text-white uppercase tracking-widest transition-colors"
              >
                <ClipboardList size={12} />
                Inspection Checklist
                <ChevronDown size={11} className={cn('transition-transform ml-auto', showChecklist && 'rotate-180')} />
              </button>
              {showChecklist && (
                <div className="mt-2">
                  <ChecklistPanel category={category} />
                </div>
              )}
            </div>
          )}

          {/* ── Photos ───────────────────────────────────────── */}
          <div>
            <FieldLabel>Photos</FieldLabel>
            <PhotoStrip {...photoCapture} />
          </div>

          {/* ── Finding ──────────────────────────────────────── */}
          <div>
            <FieldLabel
              action={
                <button type="button"
                  onClick={() => {
                    const opts = QUICK_FILL_OPTIONS[category]?.filter((o) => o.status === form.status)
                    if (opts?.[0]) patch({ finding: opts[0].finding })
                  }}
                  className="flex items-center gap-1 text-[11px] text-brand-light hover:text-white transition-colors">
                  <BookOpen size={10} /> Suggest
                </button>
              }
            >
              Finding
            </FieldLabel>
            <textarea
              value={form.finding}
              onChange={(e) => patch({ finding: e.target.value })}
              rows={3}
              placeholder={`Describe the condition of this ${category} item…`}
              className="w-full bg-surface-base border border-surface-border rounded-xl px-3 py-3 text-white text-sm placeholder:text-slate-600 resize-none focus:outline-none focus:ring-2 focus:ring-brand-orange/50 hover:border-slate-500 transition-colors leading-relaxed"
            />
          </div>

          {/* ── Standard Referenced ──────────────────────────── */}
          <div>
            <FieldLabel>Standard Referenced</FieldLabel>
            <div className="relative">
              <select
                value={form.standard_referenced}
                onChange={(e) => patch({ standard_referenced: e.target.value })}
                className="w-full h-11 bg-surface-base border border-surface-border rounded-xl px-3 pr-9 text-white text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-brand-orange/50 hover:border-slate-500 transition-colors"
              >
                {(CATEGORY_STANDARDS[category] ?? ['AS/NZS 1891.4:2009']).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
                {/* Additional standards not in the default list */}
                {['AS/NZS 1891.4:2009', 'AS 1657-2018', 'AS 5532-2013', 'AS/NZS 1891.1:2007',
                  'AS/NZS 1891.2:2001', 'AS/NZS 4488.2:1997', 'AS/NZS 4994.1:2009', 'AS 1319-1994']
                  .filter((s) => !(CATEGORY_STANDARDS[category] ?? []).includes(s))
                  .map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>

          {/* ── Corrective Action ─────────────────────────────── */}
          {needsPriority && (
            <div>
              <FieldLabel
                required
                action={
                  <button type="button"
                    onClick={() => {
                      const opts = QUICK_FILL_OPTIONS[category]?.filter(
                        (o) => o.status === form.status && o.corrective_action
                      )
                      if (opts?.[0]) patch({ corrective_action: opts[0].corrective_action })
                    }}
                    className="flex items-center gap-1 text-[11px] text-brand-light hover:text-white transition-colors">
                    <BookOpen size={10} /> Suggest
                  </button>
                }
              >
                Corrective Action
              </FieldLabel>
              <textarea
                value={form.corrective_action}
                onChange={(e) => patch({ corrective_action: e.target.value })}
                rows={3}
                placeholder="Detail the corrective action required to achieve compliance…"
                className={cn(
                  'w-full bg-surface-base rounded-xl px-3 py-3 text-white text-sm placeholder:text-slate-600 resize-none',
                  'focus:outline-none focus:ring-2 focus:ring-brand-orange/50 transition-colors border leading-relaxed',
                  form.corrective_action
                    ? 'border-surface-border hover:border-slate-500'
                    : 'border-status-noncompliant/40 hover:border-status-noncompliant/60'
                )}
              />
              {!form.corrective_action && (
                <p className="text-status-noncompliant text-xs mt-1.5 flex items-center gap-1">
                  <AlertCircle size={11} /> Required for non-compliant and recommendation items
                </p>
              )}
            </div>
          )}

          {/* ── Action bar ────────────────────────────────────── */}
          <div className="flex items-center gap-2 pt-1 border-t border-surface-border/30">
            {/* Delete */}
            {asset?.id && !deleteConfirm && (
              <button type="button" onClick={() => setDeleteConfirm(true)}
                className="h-11 w-11 flex items-center justify-center rounded-xl bg-surface-base border border-surface-border text-slate-500 hover:text-status-noncompliant hover:border-status-noncompliant/40 transition-all shrink-0">
                <Trash2 size={15} />
              </button>
            )}

            {/* Delete confirm */}
            {deleteConfirm && (
              <div className="flex items-center gap-2 flex-1">
                <span className="text-status-noncompliant text-xs font-medium">Delete this item?</span>
                <button type="button" onClick={handleDelete}
                  className="h-9 px-3 rounded-lg bg-status-noncompliant text-white text-xs font-bold hover:bg-red-700 transition-colors">
                  Delete
                </button>
                <button type="button" onClick={() => setDeleteConfirm(false)}
                  className="h-9 px-3 rounded-lg bg-surface-overlay text-slate-300 text-xs hover:text-white transition-colors">
                  Cancel
                </button>
              </div>
            )}

            {/* Reset */}
            {dirty && !deleteConfirm && (
              <button type="button" onClick={resetForm}
                className="h-11 px-3 rounded-xl bg-surface-base border border-surface-border text-slate-400 text-xs hover:text-white transition-all flex items-center gap-1.5 shrink-0">
                <RotateCcw size={13} /> Reset
              </button>
            )}

            {/* Save */}
            {!deleteConfirm && (
              <button type="button" onClick={handleSave}
                disabled={saving || photoCapture.hasUploading}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 h-11 rounded-xl font-display font-bold text-base tracking-wide',
                  'transition-all duration-150 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed',
                  dirty
                    ? 'bg-brand-orange text-white shadow-lg shadow-brand-orange/25 hover:bg-orange-500'
                    : 'bg-surface-overlay text-slate-500 border border-surface-border'
                )}>
                {saving
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><Save size={15} />{dirty ? 'Save Item' : 'Saved ✓'}</>
                }
              </button>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
