// ============================================================
// SafeInspect — Site Map
// Aerial/plan canvas with a single SVG overlay locked to the
// image (viewBox = natural pixels), so features stay glued to
// the imagery at every zoom — like a scaled drawing.
// Supports point assets, polyline assets (static lines,
// guardrails, walkways), pinch zoom, zoom-to-cursor, and
// tap-to-place capture in the field.
// ============================================================

import {
  useState, useRef, useCallback, useEffect, useMemo,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  Upload, ZoomIn, ZoomOut, RotateCcw, Save, MapPin, X, Plus,
  Link2, Eye, EyeOff, ChevronDown, ChevronUp, ImageIcon, Layers,
  Check, Undo2, Spline, Ungroup,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInspectionStore } from '@/store/inspection.store'
import {
  ASSET_CATEGORY_LABELS, ASSET_CATEGORIES,
  type AssetCategory, type AssetStatus, type PlanFeature, type PlanPoint,
} from '@/types/database'
import {
  LineSymbol, FeatureLabel,
  STATUS_COLORS, LINE_CATEGORIES,
} from './map/symbols'
import { rangeLabel, groupAnchor, groupLabelOwner } from './map/labels'

// ─── Types ────────────────────────────────────────────────────

interface PendingPlacement {
  asset_id: string | null
  asset_code: string
  category: AssetCategory
  status: AssetStatus
  mode: 'point' | 'polyline'
}

/** Quick-add capture: tap-tap-tap placement of brand-new auto-numbered assets. */
interface QuickAdd {
  category: AssetCategory
  mode: 'run' | 'polyline'
  groupId: string      // shared by every point placed in this run → range label
  runIds: string[]     // features placed so far in this run
}

interface SiteMapProps {
  inspectionId: string
  /** Called when user opens a feature — parent can scroll to asset form */
  onMarkerClick?: (assetCode: string) => void
  /** If true, hides editing controls (read-only for reports) */
  readOnly?: boolean
}

const TAP_THRESHOLD_PX = 8
const MIN_ZOOM = 0.5
const MAX_ZOOM = 12

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

// ─── Legend panel ─────────────────────────────────────────────

function MapLegend({ features }: { features: PlanFeature[] }) {
  const [collapsed, setCollapsed] = useState(false)

  const byCat = features.reduce<Partial<Record<AssetCategory, number>>>((acc, f) => {
    acc[f.category] = (acc[f.category] ?? 0) + 1
    return acc
  }, {})

  const statuses = Object.keys(STATUS_COLORS) as AssetStatus[]

  return (
    <div data-map-ui className="absolute top-2 right-2 z-30 bg-surface-base/95 backdrop-blur-sm border border-surface-border rounded-xl shadow-xl max-w-[180px] overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-surface-border"
      >
        <span className="text-white text-xs font-bold font-display uppercase tracking-wide">Legend</span>
        {collapsed ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronUp size={12} className="text-slate-400" />}
      </button>

      {!collapsed && (
        <div className="p-2 space-y-1">
          {statuses.map((status) => {
            const count = features.filter((f) => f.status === status).length
            if (count === 0) return null
            const c = STATUS_COLORS[status]
            return (
              <div key={status} className="flex items-center gap-2">
                <div className="w-4 h-4 rounded shrink-0" style={{ backgroundColor: c.bg }} />
                <span className="text-slate-300 text-[10px] flex-1">{c.label}</span>
                <span className="text-slate-500 text-[10px] font-mono">{count}</span>
              </div>
            )
          })}

          {Object.keys(byCat).length > 0 && (
            <>
              <div className="border-t border-surface-border my-1.5" />
              <p className="text-slate-600 text-[9px] uppercase tracking-wider font-semibold mb-1">By Category</p>
              {(Object.entries(byCat) as [AssetCategory, number][]).map(([cat, count]) => (
                <div key={cat} className="flex items-center justify-between">
                  <span className="text-slate-400 text-[10px] truncate">{ASSET_CATEGORY_LABELS[cat]}</span>
                  <span className="text-slate-500 text-[10px] font-mono ml-2">{count}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Selected feature panel ───────────────────────────────────

function FeaturePanel({
  feature, onOpen, onRemove, onClose, readOnly,
}: {
  feature: PlanFeature
  onOpen: () => void
  onRemove: () => void
  onClose: () => void
  readOnly?: boolean
}) {
  const c = STATUS_COLORS[feature.status]
  return (
    <div data-map-ui className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40 bg-surface-raised border border-surface-border rounded-xl shadow-2xl p-3 min-w-[240px] max-w-[90%]">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: c.bg }} />
          <span className="text-white text-sm font-bold font-mono">{feature.label ?? feature.asset_code}</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
          <X size={14} />
        </button>
      </div>
      <p className="text-slate-400 text-xs mb-2">
        {ASSET_CATEGORY_LABELS[feature.category]} ·{' '}
        <span style={{ color: c.bg }}>{c.label}</span>
        {feature.geometry_type !== 'point' && (
          <span className="text-slate-500"> · {feature.geometry.length} vertices</span>
        )}
      </p>
      {!readOnly && (
        <div className="flex gap-2">
          <button
            onClick={onOpen}
            className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-brand-orange/10 border border-brand-orange/30 text-brand-orange text-xs font-medium hover:bg-brand-orange/20 transition-colors"
          >
            <Link2 size={12} />
            Open Item
          </button>
          <button
            onClick={onRemove}
            className="w-8 h-8 rounded-lg bg-status-noncompliant/10 border border-status-noncompliant/30 flex items-center justify-center text-status-noncompliant hover:bg-status-noncompliant/20 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Grouped run panel ────────────────────────────────────────

function GroupPanel({
  features, tapped, onOpen, onUngroup, onRemove, onClose, readOnly,
}: {
  features: PlanFeature[]
  tapped: PlanFeature
  onOpen: () => void
  onUngroup: () => void
  onRemove: () => void
  onClose: () => void
  readOnly?: boolean
}) {
  const c = STATUS_COLORS[tapped.status]
  return (
    <div data-map-ui className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40 bg-surface-raised border border-surface-border rounded-xl shadow-2xl p-3 min-w-[260px] max-w-[90%]">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: c.bg }} />
          <span className="text-white text-sm font-bold font-mono">{rangeLabel(features)}</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
          <X size={14} />
        </button>
      </div>
      <p className="text-slate-400 text-xs mb-2">
        {ASSET_CATEGORY_LABELS[tapped.category]} · {features.length} in run ·
        tapped <span className="font-mono text-slate-300">{tapped.asset_code}</span>
      </p>
      {!readOnly && (
        <div className="flex gap-2">
          <button
            onClick={onOpen}
            className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-brand-orange/10 border border-brand-orange/30 text-brand-orange text-xs font-medium hover:bg-brand-orange/20 transition-colors"
          >
            <Link2 size={12} />
            Open Item
          </button>
          <button
            onClick={onUngroup}
            className="flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-surface-base border border-surface-border text-slate-300 text-xs font-medium hover:text-white hover:border-brand-orange/40 transition-colors"
          >
            <Ungroup size={12} />
            Ungroup
          </button>
          <button
            onClick={onRemove}
            className="w-8 h-8 rounded-lg bg-status-noncompliant/10 border border-status-noncompliant/30 flex items-center justify-center text-status-noncompliant hover:bg-status-noncompliant/20 transition-colors"
            title="Remove all markers in this run (assets stay in the checklist)"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────

export function SiteMap({ inspectionId, onMarkerClick, readOnly = false }: SiteMapProps) {
  const {
    sitePlans, activePlanId, planFeatures, saving, siteMapDirty,
    setActivePlan, createSitePlan, uploadSitePlanImage,
    addFeature, updateFeature, removeFeature, saveFeatures,
    syncFeaturesFromAssets, quickPlaceAsset, ungroupFeatures,
    assets,
  } = useInspectionStore()

  const activePlan = sitePlans.find((p) => p.id === activePlanId) ?? sitePlans[0] ?? null
  const features = useMemo(
    () => (activePlan ? planFeatures.filter((f) => f.site_plan_id === activePlan.id) : []),
    [planFeatures, activePlan]
  )

  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Image natural dimensions → viewBox
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(
    activePlan?.image_width && activePlan?.image_height
      ? { w: activePlan.image_width, h: activePlan.image_height }
      : null
  )
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null)

  // Pan/zoom transform: translate(tx,ty) scale(s), origin top-left
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 })
  const transformInitialised = useRef(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showLegend, setShowLegend] = useState(true)
  const [showUnplaced, setShowUnplaced] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [placing, setPlacing] = useState<PendingPlacement | null>(null)
  const [quickAdd, setQuickAdd] = useState<QuickAdd | null>(null)
  const [draftPoints, setDraftPoints] = useState<PlanPoint[]>([])

  // Gesture bookkeeping (refs — no re-render per move)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<
    | { type: 'pan'; startX: number; startY: number; startTx: number; startTy: number; moved: boolean }
    | { type: 'pinch'; startDist: number; startScale: number; startTx: number; startTy: number; midX: number; midY: number }
    | { type: 'feature'; id: string; lastX: number; lastY: number; moved: boolean }
    | { type: 'vertex'; id: string; index: number }
    | { type: 'label'; id: string; lastX: number; lastY: number }
    | null
  >(null)

  const selectedFeature = features.find((f) => f.id === selectedId) ?? null

  // Range-label groups: features sharing a group_id render one label
  const groupMap = useMemo(() => {
    const m = new Map<string, PlanFeature[]>()
    for (const f of features) {
      if (!f.group_id) continue
      const arr = m.get(f.group_id)
      if (arr) arr.push(f)
      else m.set(f.group_id, [f])
    }
    return m
  }, [features])

  const selectedGroup = selectedFeature?.group_id
    ? groupMap.get(selectedFeature.group_id) ?? null
    : null

  // ── Sizing ────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [activePlan?.image_url])

  // Reset dims when switching plans
  useEffect(() => {
    transformInitialised.current = false
    setImgDims(
      activePlan?.image_width && activePlan?.image_height
        ? { w: activePlan.image_width, h: activePlan.image_height }
        : null
    )
    setSelectedId(null)
    setPlacing(null)
    setDraftPoints([])
  }, [activePlan?.id, activePlan?.image_width, activePlan?.image_height])

  // Fitted stage size (image contained in container at scale 1)
  const fit = useMemo(() => {
    if (!imgDims || !containerSize || containerSize.w === 0) return null
    const scale = Math.min(containerSize.w / imgDims.w, containerSize.h / imgDims.h)
    return { w: imgDims.w * scale, h: imgDims.h * scale }
  }, [imgDims, containerSize])

  // Centre once fitted
  useEffect(() => {
    if (!fit || !containerSize || transformInitialised.current) return
    setTransform({
      scale: 1,
      tx: (containerSize.w - fit.w) / 2,
      ty: (containerSize.h - fit.h) / 2,
    })
    transformInitialised.current = true
  }, [fit, containerSize])

  // ── Coordinate helpers ────────────────────────────────────

  /** Client coords → normalised (0–1) image coords. */
  const clientToNorm = useCallback((clientX: number, clientY: number): PlanPoint | null => {
    const stage = stageRef.current
    if (!stage) return null
    const rect = stage.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    }
  }, [])

  // ── Zoom ──────────────────────────────────────────────────

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = clientX - rect.left
    const cy = clientY - rect.top
    setTransform((t) => {
      const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, t.scale * factor))
      const k = scale / t.scale
      return {
        scale,
        tx: cx - (cx - t.tx) * k,
        ty: cy - (cy - t.ty) * k,
      }
    })
  }, [])

  // React registers onWheel passively, so preventDefault needs a manual
  // non-passive listener to stop the page scrolling while zooming.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt, activePlan?.image_url])

  const zoomCentre = (factor: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
  }

  const handleReset = () => {
    transformInitialised.current = false
    if (fit && containerSize) {
      setTransform({
        scale: 1,
        tx: (containerSize.w - fit.w) / 2,
        ty: (containerSize.h - fit.h) / 2,
      })
      transformInitialised.current = true
    }
  }

  // ── Pointer gestures (pan / pinch / tap / drag) ───────────

  const handlePointerDown = (e: ReactPointerEvent) => {
    // Overlay controls (banners, panels, zoom buttons) are not map surface:
    // never start a gesture from them, or a tap on ✓ would also place a marker
    if ((e.target as HTMLElement).closest('[data-map-ui]')) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values())
      gesture.current = {
        type: 'pinch',
        startDist: Math.hypot(b.x - a.x, b.y - a.y),
        startScale: transform.scale,
        startTx: transform.tx,
        startTy: transform.ty,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
      }
      return
    }

    // Single pointer on empty canvas → pan (may resolve into a tap)
    if (!gesture.current || gesture.current.type === 'pan') {
      gesture.current = {
        type: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        startTx: transform.tx,
        startTy: transform.ty,
        moved: false,
      }
    }
  }

  const handlePointerMove = (e: ReactPointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (prev) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return

    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values())
      const dist = Math.hypot(b.x - a.x, b.y - a.y)
      if (g.startDist === 0) return
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const rawScale = g.startScale * (dist / g.startDist)
      const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rawScale))
      const k = scale / g.startScale
      const midX = (a.x + b.x) / 2 - rect.left
      const midY = (a.y + b.y) / 2 - rect.top
      const startMidX = g.midX - rect.left
      const startMidY = g.midY - rect.top
      setTransform({
        scale,
        tx: midX - (startMidX - g.startTx) * k,
        ty: midY - (startMidY - g.startTy) * k,
      })
      return
    }

    if (g.type === 'pan') {
      const dx = e.clientX - g.startX
      const dy = e.clientY - g.startY
      if (!g.moved && Math.hypot(dx, dy) < TAP_THRESHOLD_PX) return
      g.moved = true
      setTransform((t) => ({ ...t, tx: g.startTx + dx, ty: g.startTy + dy }))
      return
    }

    if (g.type === 'feature') {
      if (readOnly) return   // tap-select only, no drag
      const dxc = e.clientX - g.lastX
      const dyc = e.clientY - g.lastY
      if (!g.moved && Math.hypot(dxc, dyc) < TAP_THRESHOLD_PX) return
      g.moved = true
      const stage = stageRef.current
      if (!stage) return
      const rect = stage.getBoundingClientRect()
      const dx = dxc / rect.width
      const dy = dyc / rect.height
      g.lastX = e.clientX
      g.lastY = e.clientY
      const f = useInspectionStore.getState().planFeatures.find((pf) => pf.id === g.id)
      if (!f) return
      updateFeature(g.id, {
        geometry: f.geometry.map((p) => ({ x: clamp01(p.x + dx), y: clamp01(p.y + dy) })),
      })
      return
    }

    if (g.type === 'vertex') {
      const norm = clientToNorm(e.clientX, e.clientY)
      if (!norm) return
      const f = useInspectionStore.getState().planFeatures.find((pf) => pf.id === g.id)
      if (!f) return
      updateFeature(g.id, {
        geometry: f.geometry.map((p, i) => (i === g.index ? norm : p)),
      })
      return
    }

    if (g.type === 'label') {
      const stage = stageRef.current
      if (!stage) return
      const rect = stage.getBoundingClientRect()
      const dx = (e.clientX - g.lastX) / rect.width
      const dy = (e.clientY - g.lastY) / rect.height
      g.lastX = e.clientX
      g.lastY = e.clientY
      const f = useInspectionStore.getState().planFeatures.find((pf) => pf.id === g.id)
      if (!f) return
      const cur = f.label_offset ?? { dx: 0, dy: 0 }
      updateFeature(g.id, {
        label_offset: { dx: cur.dx + dx, dy: cur.dy + dy },
      })
    }
  }

  const handlePointerUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId)
    const g = gesture.current

    if (g?.type === 'pan' && !g.moved) {
      // Tap on empty canvas
      if (placing) {
        const norm = clientToNorm(e.clientX, e.clientY)
        if (norm) {
          if (placing.mode === 'point') {
            const f = addFeature({
              site_plan_id: activePlan!.id,
              inspection_id: inspectionId,
              asset_id: placing.asset_id,
              asset_code: placing.asset_code,
              category: placing.category,
              status: placing.status,
              geometry_type: 'point',
              geometry: [norm],
            })
            setSelectedId(f.id)
            setPlacing(null)
          } else {
            setDraftPoints((pts) => [...pts, norm])
          }
        }
      } else if (quickAdd) {
        const norm = clientToNorm(e.clientX, e.clientY)
        if (norm) {
          if (quickAdd.mode === 'run') {
            // Each tap creates the next auto-numbered asset in the run
            quickPlaceAsset(quickAdd.category, [norm], { groupId: quickAdd.groupId })
              .then((f) => {
                setQuickAdd((q) => (q ? { ...q, runIds: [...q.runIds, f.id] } : q))
              })
              .catch(() => { /* store surfaces the error state */ })
          } else {
            setDraftPoints((pts) => [...pts, norm])
          }
        }
      } else {
        setSelectedId(null)
      }
    }

    // Feature tap (pointer capture retargets pointerup to the container)
    if (g?.type === 'feature' && !g.moved) {
      const id = g.id
      setSelectedId((cur) => (cur === id ? null : id))
    }

    if (pointers.current.size === 0) gesture.current = null
    else if (pointers.current.size === 1 && g?.type === 'pinch') {
      // Dropped from pinch to single finger — restart pan from here
      const [p] = Array.from(pointers.current.values())
      gesture.current = {
        type: 'pan',
        startX: p.x, startY: p.y,
        startTx: transform.tx, startTy: transform.ty,
        moved: true,   // don't treat pinch remnant as a tap
      }
    }
  }

  const handleFeaturePointerDown = (e: ReactPointerEvent, id: string) => {
    if (placing || quickAdd) return   // while placing, features shouldn't swallow taps
    e.stopPropagation()
    ;(containerRef.current as HTMLElement)?.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    gesture.current = { type: 'feature', id, lastX: e.clientX, lastY: e.clientY, moved: false }
  }

  const handleVertexPointerDown = (e: ReactPointerEvent, id: string, index: number) => {
    if (readOnly) return
    e.stopPropagation()
    ;(containerRef.current as HTMLElement)?.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    gesture.current = { type: 'vertex', id, index }
  }

  // ── Polyline capture ──────────────────────────────────────

  const finishPolyline = () => {
    if (!placing || draftPoints.length < 2 || !activePlan) return
    const f = addFeature({
      site_plan_id: activePlan.id,
      inspection_id: inspectionId,
      asset_id: placing.asset_id,
      asset_code: placing.asset_code,
      category: placing.category,
      status: placing.status,
      geometry_type: 'polyline',
      geometry: draftPoints,
    })
    setSelectedId(f.id)
    setPlacing(null)
    setDraftPoints([])
  }

  const cancelPlacing = () => {
    setPlacing(null)
    setDraftPoints([])
  }

  // ── Quick-add (auto-numbered field capture) ───────────────

  const startQuickAdd = (category: AssetCategory) => {
    setShowPalette(false)
    setPlacing(null)
    setSelectedId(null)
    setDraftPoints([])
    setQuickAdd({
      category,
      mode: LINE_CATEGORIES.has(category) ? 'polyline' : 'run',
      groupId: crypto.randomUUID(),
      runIds: [],
    })
  }

  const finishQuickAdd = async () => {
    if (!quickAdd) return
    if (quickAdd.mode === 'run') {
      // A single placement isn't a run — drop its group so it keeps its own label
      if (quickAdd.runIds.length === 1) {
        updateFeature(quickAdd.runIds[0], { group_id: null })
      }
    } else if (draftPoints.length >= 2) {
      await quickPlaceAsset(quickAdd.category, draftPoints, { geometryType: 'polyline' })
    }
    setDraftPoints([])
    setQuickAdd(null)
  }

  const cancelQuickAdd = () => {
    // Points already placed in the run stay — they're real assets now
    if (quickAdd?.mode === 'run' && quickAdd.runIds.length === 1) {
      updateFeature(quickAdd.runIds[0], { group_id: null })
    }
    setDraftPoints([])
    setQuickAdd(null)
  }

  // ── Label drag (offset + leader line) ─────────────────────

  const handleLabelPointerDown = (e: ReactPointerEvent, id: string) => {
    if (readOnly || placing || quickAdd) return
    e.stopPropagation()
    ;(containerRef.current as HTMLElement)?.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    gesture.current = { type: 'label', id, lastX: e.clientX, lastY: e.clientY }
  }

  // ── Unplaced assets ───────────────────────────────────────

  const placedCodes = useMemo(
    () => new Set(planFeatures.map((f) => f.asset_code)),
    [planFeatures]
  )
  const unplacedAssets = assets.filter((a) => !placedCodes.has(a.asset_code))

  const startPlacing = (asset: typeof assets[number]) => {
    const category = asset.category as AssetCategory
    setDraftPoints([])
    setPlacing({
      asset_id: asset.id,
      asset_code: asset.asset_code,
      category,
      status: asset.status as AssetStatus,
      mode: LINE_CATEGORIES.has(category) ? 'polyline' : 'point',
    })
    setSelectedId(null)
  }

  // ── Save ──────────────────────────────────────────────────

  const handleSave = async () => {
    await saveFeatures(inspectionId)
  }

  const handleImageUpload = async (file: File) => {
    await uploadSitePlanImage(inspectionId, file, activePlan?.id)
  }

  const handleAddPlan = async () => {
    const name = window.prompt('Name for the new roof area:', `Roof ${String(sitePlans.length + 1).padStart(2, '0')}`)
    if (name) await createSitePlan(inspectionId, name)
  }

  // ── ViewBox values ────────────────────────────────────────

  const vb = imgDims ?? { w: 1000, h: 700 }
  // Symbol unit: ~1.1% of image width, so symbols read like drawing icons
  const S = vb.w * 0.011

  // ── Empty state (no image on active plan) ─────────────────

  if (!activePlan?.image_url) {
    return (
      <div className="flex flex-col h-full">
        {sitePlans.length > 0 && (
          <PlanTabs
            plans={sitePlans}
            activeId={activePlan?.id ?? null}
            onSelect={setActivePlan}
            onAdd={readOnly ? undefined : handleAddPlan}
          />
        )}
        <div
          className="flex-1 flex flex-col items-center justify-center gap-4 p-8 border-2 border-dashed border-surface-border rounded-2xl cursor-pointer hover:border-brand-orange/50 hover:bg-brand-orange/5 transition-all"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="w-16 h-16 rounded-2xl bg-surface-overlay flex items-center justify-center">
            <ImageIcon size={28} className="text-slate-500" />
          </div>
          <div className="text-center">
            <p className="text-white font-display text-lg font-bold mb-1">Add Site Plan</p>
            <p className="text-slate-500 text-sm max-w-xs leading-relaxed">
              Upload an aerial photograph or site plan to place and track asset markers.
            </p>
          </div>
          <button
            type="button"
            className="flex items-center gap-2 h-12 px-6 rounded-xl bg-brand-orange text-white font-display font-bold shadow-lg shadow-brand-orange/25 hover:bg-orange-500 transition-colors"
          >
            <Upload size={16} />
            Upload Image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImageUpload(file)
            }}
          />
        </div>

        {assets.length > 0 && (
          <div className="mt-4 p-4 bg-surface-raised rounded-xl border border-surface-border">
            <p className="text-slate-400 text-sm mb-3">
              <span className="text-white font-medium">{assets.length} assets</span> recorded.
              Upload a site plan to place markers, or auto-generate a grid layout.
            </p>
            <button
              onClick={syncFeaturesFromAssets}
              className="flex items-center gap-2 text-brand-orange text-sm font-medium hover:text-orange-400 transition-colors"
            >
              <Layers size={14} />
              Auto-place markers from assets
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Map view ──────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Roof area tabs */}
      <PlanTabs
        plans={sitePlans}
        activeId={activePlan.id}
        onSelect={setActivePlan}
        onAdd={readOnly ? undefined : handleAddPlan}
      />

      {/* Toolbar */}
      {!readOnly && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { setShowPalette((v) => !v); setShowUnplaced(false) }}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand-orange text-white text-xs font-bold shadow-md hover:bg-orange-500 transition-all"
          >
            <Plus size={13} />
            Add Asset
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-raised border border-surface-border text-slate-300 text-xs hover:border-brand-orange/40 hover:text-white transition-all"
          >
            <Upload size={13} />
            Replace Image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImageUpload(file)
            }}
          />

          {unplacedAssets.length > 0 && (
            <button
              onClick={() => { setShowUnplaced((v) => !v); setShowPalette(false) }}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand-orange/10 border border-brand-orange/30 text-brand-orange text-xs hover:bg-brand-orange/20 transition-all"
            >
              <MapPin size={13} />
              Place {unplacedAssets.length} unplaced
            </button>
          )}

          <div className="flex-1" />

          <button
            onClick={() => setShowLegend((v) => !v)}
            className="h-8 w-8 flex items-center justify-center rounded-lg bg-surface-raised border border-surface-border text-slate-400 hover:text-white transition-all"
          >
            {showLegend ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>

          {siteMapDirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand-orange text-white text-xs font-bold shadow-md hover:bg-orange-500 transition-all disabled:opacity-60"
            >
              {saving
                ? <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                : <Save size={13} />
              }
              Save Map
            </button>
          )}
        </div>
      )}

      {/* Quick-add category palette */}
      {showPalette && !readOnly && (
        <div className="bg-surface-raised rounded-xl border border-surface-border p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white text-xs font-semibold">
              Pick a category — assets are numbered automatically as you tap the map:
            </p>
            <button onClick={() => setShowPalette(false)} className="text-slate-500 hover:text-white">
              <X size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
            {ASSET_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => startQuickAdd(cat)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-surface-border bg-surface-base hover:border-brand-orange/50 hover:bg-brand-orange/5 transition-all text-left"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-brand-orange text-[10px] font-mono font-bold">
                    {cat}
                    {LINE_CATEGORIES.has(cat) && <Spline size={9} className="text-slate-500" />}
                  </span>
                  <span className="block text-slate-500 text-[9px] truncate">
                    {ASSET_CATEGORY_LABELS[cat]}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Unplaced drawer */}
      {showUnplaced && unplacedAssets.length > 0 && (
        <div className="bg-surface-raised rounded-xl border border-surface-border p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white text-xs font-semibold">Select an asset to place on the map:</p>
            <button onClick={() => setShowUnplaced(false)} className="text-slate-500 hover:text-white">
              <X size={14} />
            </button>
          </div>
          <div className="flex gap-2 flex-wrap max-h-24 overflow-y-auto">
            {unplacedAssets.map((a) => {
              const c = STATUS_COLORS[a.status as AssetStatus]
              const isSelected = placing?.asset_code === a.asset_code
              const isLine = LINE_CATEGORIES.has(a.category as AssetCategory)
              return (
                <button
                  key={a.asset_code}
                  onClick={() => (isSelected ? cancelPlacing() : startPlacing(a))}
                  className={cn(
                    'flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-1 rounded-md border transition-all',
                    isSelected ? 'ring-2 ring-white/50 scale-105' : 'hover:scale-105'
                  )}
                  style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text }}
                >
                  {isLine && <Spline size={10} />}
                  {a.asset_code}
                </button>
              )
            })}
          </div>
          {placing && (
            <p className="text-brand-orange text-xs mt-2 animate-pulse font-medium">
              {placing.mode === 'point'
                ? `👆 Tap the map to place ${placing.asset_code}`
                : `👆 Tap to add vertices for ${placing.asset_code}, then press ✓ to finish`}
            </p>
          )}
        </div>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        className={cn(
          'relative flex-1 min-h-[300px] rounded-xl overflow-hidden border border-surface-border bg-surface-base',
          placing || quickAdd ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
        )}
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Transformed stage: image + SVG overlay share one box */}
        <div
          ref={stageRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: fit?.w ?? '100%',
            height: fit?.h ?? '100%',
            transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
            transformOrigin: '0 0',
          }}
        >
          <img
            src={activePlan.image_url}
            alt={activePlan.name}
            className="absolute inset-0 w-full h-full select-none pointer-events-none"
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget
              if (!imgDims && img.naturalWidth > 0) {
                setImgDims({ w: img.naturalWidth, h: img.naturalHeight })
              }
            }}
          />

          <svg
            viewBox={`0 0 ${vb.w} ${vb.h}`}
            className="absolute inset-0 w-full h-full overflow-visible"
            style={{ pointerEvents: 'none' }}
          >
            {/* Scope polygon (dashed red boundary, like the overview page) */}
            {activePlan.scope_polygon && activePlan.scope_polygon.length >= 3 && (
              <polygon
                points={activePlan.scope_polygon.map((p) => `${p.x * vb.w},${p.y * vb.h}`).join(' ')}
                fill="#dc2626"
                fillOpacity={0.12}
                stroke="#dc2626"
                strokeWidth={S * 0.3}
                strokeDasharray={`${S} ${S * 0.6}`}
              />
            )}

            {/* Features */}
            {features.map((f) => {
              const pts = f.geometry.map((p) => ({ x: p.x * vb.w, y: p.y * vb.h }))
              if (pts.length === 0) return null
              const group = f.group_id ? groupMap.get(f.group_id) : undefined
              const isGrouped = !!group && group.length > 1
              const isGroupOwner = isGrouped && groupLabelOwner(group).id === f.id
              const isSelected =
                f.id === selectedId ||
                (isGrouped && !!selectedFeature && selectedFeature.group_id === f.group_id)
              const anchor = f.geometry_type === 'point'
                ? pts[0]
                : pts[Math.floor(pts.length / 2)]

              // Label: grouped runs render one range label at the group's
              // topmost member; label_offset shifts it and draws a leader line
              let labelNode = null
              if (!isGrouped || isGroupOwner) {
                const gAnchor = isGrouped ? groupAnchor(group) : null
                const anchorVb = gAnchor
                  ? { x: gAnchor.x * vb.w, y: gAnchor.y * vb.h }
                  : anchor
                const off = f.label_offset ?? { dx: 0, dy: 0 }
                const lx = anchorVb.x + off.dx * vb.w
                const ly = anchorVb.y - S * 2.2 + off.dy * vb.h
                const offsetDist = Math.hypot(lx - anchorVb.x, ly - anchorVb.y)
                labelNode = (
                  <>
                    {offsetDist > S * 3.2 && (
                      <line
                        x1={lx} y1={ly}
                        x2={anchorVb.x} y2={anchorVb.y}
                        stroke="#ffffff"
                        strokeWidth={S * 0.1}
                        opacity={0.85}
                      />
                    )}
                    <FeatureLabel
                      text={isGrouped ? rangeLabel(group) : (f.label ?? f.asset_code)}
                      x={lx}
                      y={ly}
                      s={S}
                      status={f.status}
                      selected={isSelected}
                      onPointerDown={readOnly ? undefined : (e) => handleLabelPointerDown(e, f.id)}
                    />
                  </>
                )
              }

              return (
                <g
                  key={f.id}
                  style={{ pointerEvents: 'auto', cursor: readOnly ? 'pointer' : 'move' }}
                  onPointerDown={(e) => handleFeaturePointerDown(e, f.id)}
                >
                  {f.geometry_type === 'point' ? (
                    <>
                      {isSelected && (
                        <circle cx={pts[0].x} cy={pts[0].y} r={S * 1.6} fill="none" stroke="#ffffff" strokeWidth={S * 0.18} opacity={0.8} />
                      )}
                      {/* Classic pin: status-coloured dot with white ring */}
                      <circle
                        cx={pts[0].x} cy={pts[0].y} r={S * 0.6}
                        fill={STATUS_COLORS[f.status].bg}
                        stroke="#ffffff"
                        strokeWidth={S * 0.2}
                      />
                    </>
                  ) : (
                    <LineSymbol feature={f} points={pts} s={S} selected={isSelected} />
                  )}

                  {/* Vertex handles when a polyline is selected */}
                  {isSelected && !readOnly && f.geometry_type !== 'point' && pts.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x} cy={p.y} r={S * 0.55}
                      fill="#ffffff" stroke="#0f172a" strokeWidth={S * 0.12}
                      style={{ cursor: 'grab' }}
                      onPointerDown={(e) => handleVertexPointerDown(e, f.id, i)}
                    />
                  ))}

                  {labelNode}
                </g>
              )
            })}

            {/* Draft polyline while capturing */}
            {(placing?.mode === 'polyline' || quickAdd?.mode === 'polyline') && draftPoints.length > 0 && (
              <g style={{ pointerEvents: 'none' }}>
                <polyline
                  points={draftPoints.map((p) => `${p.x * vb.w},${p.y * vb.h}`).join(' ')}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={S * 0.25}
                  strokeDasharray={`${S * 0.6} ${S * 0.4}`}
                />
                {draftPoints.map((p, i) => (
                  <circle key={i} cx={p.x * vb.w} cy={p.y * vb.h} r={S * 0.5} fill="#f97316" stroke="#ffffff" strokeWidth={S * 0.12} />
                ))}
              </g>
            )}
          </svg>
        </div>

        {/* Legend */}
        {showLegend && <MapLegend features={features} />}

        {/* Zoom controls */}
        <div data-map-ui className="absolute bottom-3 right-3 flex flex-col gap-1.5 z-30">
          <button
            onClick={() => zoomCentre(1.4)}
            className="w-8 h-8 rounded-lg bg-surface-base/90 border border-surface-border flex items-center justify-center text-slate-300 hover:text-white hover:bg-surface-raised transition-all"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => zoomCentre(1 / 1.4)}
            className="w-8 h-8 rounded-lg bg-surface-base/90 border border-surface-border flex items-center justify-center text-slate-300 hover:text-white hover:bg-surface-raised transition-all"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={handleReset}
            className="w-8 h-8 rounded-lg bg-surface-base/90 border border-surface-border flex items-center justify-center text-slate-300 hover:text-white hover:bg-surface-raised transition-all"
          >
            <RotateCcw size={12} />
          </button>
        </div>

        {/* Quick-add banner: run counter + finish controls */}
        {quickAdd && (
          <div data-map-ui className="absolute top-3 left-3 z-30 flex items-center gap-2 bg-surface-base/95 border border-brand-orange/40 rounded-xl px-3 py-2">
            <span className="text-white text-xs font-medium">
              Adding <span className="text-brand-orange font-mono">{quickAdd.category}</span>
              {quickAdd.mode === 'run' ? (
                <span className="text-slate-400 ml-1">
                  · {quickAdd.runIds.length} placed{quickAdd.runIds.length >= 2 ? ' (run)' : ''}
                </span>
              ) : (
                <span className="text-slate-400 ml-1">({draftPoints.length} pts)</span>
              )}
            </span>
            {quickAdd.mode === 'polyline' && (
              <button
                onClick={(e) => { e.stopPropagation(); setDraftPoints((p) => p.slice(0, -1)) }}
                disabled={draftPoints.length === 0}
                className="w-6 h-6 rounded-md bg-surface-raised border border-surface-border flex items-center justify-center text-slate-300 hover:text-white disabled:opacity-40"
              >
                <Undo2 size={12} />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); finishQuickAdd() }}
              disabled={quickAdd.mode === 'polyline' ? draftPoints.length < 2 : quickAdd.runIds.length === 0}
              className="w-6 h-6 rounded-md bg-status-compliant flex items-center justify-center text-white disabled:opacity-40"
            >
              <Check size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); cancelQuickAdd() }}
              className="text-slate-500 hover:text-white ml-1"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Placing banner + polyline controls */}
        {placing && (
          <div data-map-ui className="absolute top-3 left-3 z-30 flex items-center gap-2 bg-surface-base/95 border border-brand-orange/40 rounded-xl px-3 py-2">
            <span className="text-white text-xs font-medium">
              {placing.mode === 'point' ? 'Placing' : 'Drawing'}{' '}
              <span className="text-brand-orange font-mono">{placing.asset_code}</span>
              {placing.mode === 'polyline' && (
                <span className="text-slate-400 ml-1">({draftPoints.length} pts)</span>
              )}
            </span>
            {placing.mode === 'polyline' && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); setDraftPoints((p) => p.slice(0, -1)) }}
                  disabled={draftPoints.length === 0}
                  className="w-6 h-6 rounded-md bg-surface-raised border border-surface-border flex items-center justify-center text-slate-300 hover:text-white disabled:opacity-40"
                >
                  <Undo2 size={12} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); finishPolyline() }}
                  disabled={draftPoints.length < 2}
                  className="w-6 h-6 rounded-md bg-status-compliant flex items-center justify-center text-white disabled:opacity-40"
                >
                  <Check size={12} />
                </button>
              </>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); cancelPlacing() }}
              className="text-slate-500 hover:text-white ml-1"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Feature count */}
        <div data-map-ui className="absolute bottom-3 left-3 z-30 flex items-center gap-1.5 bg-surface-base/90 border border-surface-border rounded-lg px-2.5 py-1.5">
          <MapPin size={11} className="text-brand-orange" />
          <span className="text-white text-[10px] font-bold">{features.length}</span>
          <span className="text-slate-500 text-[10px]">placed</span>
        </div>

        {/* Selected feature / group panel */}
        {selectedFeature && (
          selectedGroup && selectedGroup.length > 1 ? (
            <GroupPanel
              features={selectedGroup}
              tapped={selectedFeature}
              readOnly={readOnly}
              onOpen={() => { onMarkerClick?.(selectedFeature.asset_code); setSelectedId(null) }}
              onUngroup={() => ungroupFeatures(selectedFeature.group_id!)}
              onRemove={() => {
                selectedGroup.forEach((f) => removeFeature(f.id))
                setSelectedId(null)
              }}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <FeaturePanel
              feature={selectedFeature}
              readOnly={readOnly}
              onOpen={() => { onMarkerClick?.(selectedFeature.asset_code); setSelectedId(null) }}
              onRemove={() => { removeFeature(selectedFeature.id); setSelectedId(null) }}
              onClose={() => setSelectedId(null)}
            />
          )
        )}

        {/* Saving overlay */}
        {saving && (
          <div className="absolute inset-0 bg-surface-base/50 flex items-center justify-center z-50">
            <div className="flex items-center gap-2 bg-surface-raised border border-surface-border rounded-xl px-4 py-3 shadow-xl">
              <span className="w-4 h-4 border-2 border-brand-orange/30 border-t-brand-orange rounded-full animate-spin" />
              <span className="text-white text-sm">Saving…</span>
            </div>
          </div>
        )}
      </div>

      {/* Icon legend (matches Anchor Safe PDF format) */}
      <div className="bg-surface-raised rounded-xl border border-surface-border p-3">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Icon Legend</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 mt-2">
          {(Object.entries(ASSET_CATEGORY_LABELS) as [AssetCategory, string][]).map(([code, label]) => (
            <div key={code} className="flex items-center gap-1.5">
              <span className="text-brand-orange text-[9px] font-mono font-bold w-10 shrink-0">{code}</span>
              <span className="text-slate-500 text-[10px] truncate">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Roof area tabs ───────────────────────────────────────────

function PlanTabs({
  plans, activeId, onSelect, onAdd,
}: {
  plans: { id: string; name: string }[]
  activeId: string | null
  onSelect: (id: string) => void
  onAdd?: () => void
}) {
  if (plans.length === 0) return null
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {plans.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelect(p.id)}
          className={cn(
            'h-8 px-3 rounded-lg text-xs font-medium border transition-all',
            p.id === activeId
              ? 'bg-brand-orange text-white border-brand-orange shadow-md'
              : 'bg-surface-raised text-slate-300 border-surface-border hover:text-white hover:border-brand-orange/40'
          )}
        >
          {p.name}
        </button>
      ))}
      {onAdd && (
        <button
          onClick={onAdd}
          className="h-8 w-8 rounded-lg bg-surface-raised border border-surface-border flex items-center justify-center text-slate-400 hover:text-white hover:border-brand-orange/40 transition-all"
          title="Add roof area"
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  )
}
