import {
  useState, useRef, useCallback, useEffect, type MouseEvent, type TouchEvent,
} from 'react'
import {
  Upload, ZoomIn, ZoomOut, RotateCcw, Save, MapPin, X,
  Link2, CheckCircle2, XCircle, AlertCircle, MinusCircle,
  Info, Layers, Eye, EyeOff, ChevronDown, ChevronUp, ImageIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useInspectionStore, type SiteMapMarker,
} from '@/store/inspection.store'
import { ASSET_CATEGORY_LABELS, type AssetCategory, type AssetStatus } from '@/types/database'

// ─── Pin colour system (matches the Anchor Safe PDF exactly) ──

const PIN_CONFIG: Record<AssetStatus, {
  bg: string; border: string; text: string; label: string; icon: typeof CheckCircle2
}> = {
  compliant:      { bg: '#16a34a', border: '#15803d', text: '#fff', label: 'Compliant',      icon: CheckCircle2 },
  non_compliant:  { bg: '#dc2626', border: '#b91c1c', text: '#fff', label: 'Non-Compliant',  icon: XCircle     },
  recommendation: { bg: '#d97706', border: '#b45309', text: '#fff', label: 'Recommendation', icon: AlertCircle },
  'n/a':          { bg: '#475569', border: '#334155', text: '#fff', label: 'N/A',             icon: MinusCircle },
}

// ─── Unplaced marker (floating palette) ───────────────────────

interface PendingMarker {
  asset_code: string
  category: AssetCategory
  status: AssetStatus
}

// ─── Props ────────────────────────────────────────────────────

interface SiteMapProps {
  inspectionId: string
  /** Called when user clicks a marker — parent can scroll to asset form */
  onMarkerClick?: (assetCode: string) => void
  /** If true, hides editing controls (read-only for reports) */
  readOnly?: boolean
}

// ─── Pin SVG component ────────────────────────────────────────

function Pin({
  marker, selected, onClick, onDragStart, readOnly,
}: {
  marker: SiteMapMarker
  selected: boolean
  onClick: () => void
  onDragStart?: (e: React.DragEvent, id: string) => void
  readOnly?: boolean
}) {
  const cfg = PIN_CONFIG[marker.status]

  return (
    <div
      role="button"
      aria-label={marker.asset_code}
      draggable={!readOnly}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onDragStart={(e) => onDragStart?.(e, marker.id)}
      className={cn(
        'absolute flex flex-col items-center cursor-pointer select-none transition-transform duration-100',
        selected ? 'z-30 scale-125' : 'z-20 hover:scale-110',
        !readOnly && 'active:scale-95'
      )}
      style={{
        left: `${marker.x}%`,
        top: `${marker.y}%`,
        transform: 'translate(-50%, -100%)',
      }}
    >
      {/* Label bubble */}
      <div
        className={cn(
          'px-1.5 py-0.5 rounded-md text-[9px] font-bold font-mono whitespace-nowrap shadow-lg mb-0.5',
          'border',
          selected ? 'ring-2 ring-white/50' : ''
        )}
        style={{
          backgroundColor: cfg.bg,
          borderColor: cfg.border,
          color: cfg.text,
        }}
      >
        {marker.asset_code}
      </div>

      {/* Pin needle */}
      <div
        className="w-2 h-2 rounded-full border-2 border-white shadow-md"
        style={{ backgroundColor: cfg.bg }}
      />
    </div>
  )
}

// ─── Legend panel ─────────────────────────────────────────────

function MapLegend({ markers }: { markers: SiteMapMarker[] }) {
  const [collapsed, setCollapsed] = useState(false)

  // Group by category
  const byCat = markers.reduce<Partial<Record<AssetCategory, number>>>((acc, m) => {
    acc[m.category] = (acc[m.category] ?? 0) + 1
    return acc
  }, {})

  const counts = {
    compliant:      markers.filter((m) => m.status === 'compliant').length,
    non_compliant:  markers.filter((m) => m.status === 'non_compliant').length,
    recommendation: markers.filter((m) => m.status === 'recommendation').length,
    'n/a':          markers.filter((m) => m.status === 'n/a').length,
  }

  return (
    <div className="absolute top-2 right-2 z-30 bg-surface-base/95 backdrop-blur-sm border border-surface-border rounded-xl shadow-xl max-w-[180px] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-surface-border"
      >
        <span className="text-white text-xs font-bold font-display uppercase tracking-wide">Legend</span>
        {collapsed ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronUp size={12} className="text-slate-400" />}
      </button>

      {!collapsed && (
        <div className="p-2 space-y-1">
          {/* Status counts */}
          {(Object.entries(PIN_CONFIG) as [AssetStatus, typeof PIN_CONFIG[AssetStatus]][]).map(([status, cfg]) => {
            const count = counts[status]
            if (count === 0) return null
            const Icon = cfg.icon
            return (
              <div key={status} className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                  style={{ backgroundColor: cfg.bg }}
                >
                  <Icon size={9} color="white" />
                </div>
                <span className="text-slate-300 text-[10px] flex-1">{cfg.label}</span>
                <span className="text-slate-500 text-[10px] font-mono">{count}</span>
              </div>
            )
          })}

          {/* Divider */}
          {Object.keys(byCat).length > 0 && (
            <>
              <div className="border-t border-surface-border my-1.5" />
              <p className="text-slate-600 text-[9px] uppercase tracking-wider font-semibold mb-1">By Category</p>
              {(Object.entries(byCat) as [AssetCategory, number][]).map(([cat, count]) => (
                <div key={cat} className="flex items-center justify-between">
                  <span className="text-slate-400 text-[10px] truncate">{cat}</span>
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

// ─── Marker tooltip ───────────────────────────────────────────

function MarkerTooltip({
  marker, onLink, onRemove, onClose, readOnly,
}: {
  marker: SiteMapMarker
  onLink: () => void
  onRemove: () => void
  onClose: () => void
  readOnly?: boolean
}) {
  const cfg = PIN_CONFIG[marker.status]
  const Icon = cfg.icon

  return (
    <div
      className="absolute z-40 bg-surface-raised border border-surface-border rounded-xl shadow-2xl p-3 min-w-[200px]"
      style={{ left: `${marker.x}%`, top: `${marker.y}%`, transform: 'translate(-50%, -110%)' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Arrow */}
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-4 h-2 overflow-hidden">
        <div className="w-3 h-3 bg-surface-raised border-r border-b border-surface-border rotate-45 translate-x-0.5 -translate-y-1.5" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <div
            className="w-5 h-5 rounded flex items-center justify-center"
            style={{ backgroundColor: cfg.bg }}
          >
            <Icon size={11} color="white" />
          </div>
          <span className="text-white text-sm font-bold font-mono">{marker.asset_code}</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
          <X size={14} />
        </button>
      </div>

      <p className="text-slate-400 text-xs mb-2">
        {ASSET_CATEGORY_LABELS[marker.category]} ·{' '}
        <span style={{ color: cfg.bg }}>{cfg.label}</span>
      </p>

      {!readOnly && (
        <div className="flex gap-2">
          <button
            onClick={onLink}
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

// ─── Main SiteMap component ───────────────────────────────────

export function SiteMap({ inspectionId, onMarkerClick, readOnly = false }: SiteMapProps) {
  const {
    sitePlan, saving, siteMapDirty,
    addMarker, updateMarker, removeMarker, saveMarkers,
    uploadSitePlanImage, syncMarkersFromAssets,
    assets,
  } = useInspectionStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showLegend, setShowLegend] = useState(true)
  const [showUnplaced, setShowUnplaced] = useState(false)
  const [placingMarker, setPlacingMarker] = useState<PendingMarker | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const selectedMarker = sitePlan.markers.find((m) => m.id === selectedId) ?? null

  // ── Unplaced assets (have no marker yet) ──────────────────
  const unplacedAssets: PendingMarker[] = assets
    .filter((a) => !sitePlan.markers.some((m) => m.asset_code === a.asset_code))
    .map((a) => ({
      asset_code: a.asset_code,
      category: a.category as AssetCategory,
      status: a.status as AssetStatus,
    }))

  // ── Image upload ──────────────────────────────────────────

  const handleImageUpload = async (file: File) => {
    await uploadSitePlanImage(inspectionId, file)
  }

  // ── Click to place marker ─────────────────────────────────

  const handleImageClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!placingMarker || !imageRef.current) return

      const rect = imageRef.current.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100

      addMarker({
        ...placingMarker,
        label: placingMarker.asset_code,
        x: Math.max(2, Math.min(98, x)),
        y: Math.max(2, Math.min(98, y)),
      })
      setPlacingMarker(null)
    },
    [placingMarker, addMarker]
  )

  // ── Drag-to-reposition marker ─────────────────────────────

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (!draggingId || !imageRef.current) return

    const rect = imageRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100

    updateMarker(draggingId, {
      x: Math.max(2, Math.min(98, x)),
      y: Math.max(2, Math.min(98, y)),
    })
    setDraggingId(null)
  }

  // ── Zoom ──────────────────────────────────────────────────

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 4))
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5))
  const handleReset = () => { setZoom(1); setPanOffset({ x: 0, y: 0 }) }

  // ── Pan (mouse) ───────────────────────────────────────────

  const handleMouseDown = (e: MouseEvent) => {
    if (placingMarker) return
    if ((e.target as HTMLElement).closest('[role="button"]')) return
    setIsPanning(true)
    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y })
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isPanning) return
    setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y })
  }

  const handleMouseUp = () => setIsPanning(false)

  // ── Save markers ──────────────────────────────────────────

  const handleSave = async () => {
    await saveMarkers(inspectionId)
  }

  // ── No image state ────────────────────────────────────────

  if (!sitePlan.image_url) {
    return (
      <div className="flex flex-col h-full">
        {/* Upload area */}
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

        {/* Or sync from assets */}
        {assets.length > 0 && (
          <div className="mt-4 p-4 bg-surface-raised rounded-xl border border-surface-border">
            <p className="text-slate-400 text-sm mb-3">
              <span className="text-white font-medium">{assets.length} assets</span> recorded.
              Upload a site plan to place markers, or auto-generate a grid layout.
            </p>
            <button
              onClick={syncMarkersFromAssets}
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

  // ── Map with image ────────────────────────────────────────

  return (
    <div className="flex flex-col h-full gap-3">
      {/* ── Toolbar ──────────────────────────────────────── */}
      {!readOnly && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* Upload new image */}
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

          {/* Sync from assets */}
          {unplacedAssets.length > 0 && (
            <button
              onClick={() => setShowUnplaced((v) => !v)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand-orange/10 border border-brand-orange/30 text-brand-orange text-xs hover:bg-brand-orange/20 transition-all"
            >
              <MapPin size={13} />
              Place {unplacedAssets.length} unplaced
            </button>
          )}

          <div className="flex-1" />

          {/* Legend toggle */}
          <button
            onClick={() => setShowLegend((v) => !v)}
            className="h-8 w-8 flex items-center justify-center rounded-lg bg-surface-raised border border-surface-border text-slate-400 hover:text-white transition-all"
          >
            {showLegend ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>

          {/* Save button */}
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

      {/* ── Unplaced assets drawer ────────────────────────── */}
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
              const cfg = PIN_CONFIG[a.status]
              const isSelected = placingMarker?.asset_code === a.asset_code
              return (
                <button
                  key={a.asset_code}
                  onClick={() => setPlacingMarker(isSelected ? null : a)}
                  className={cn(
                    'text-[10px] font-mono font-bold px-2 py-1 rounded-md border transition-all',
                    isSelected ? 'ring-2 ring-white/50 scale-105' : 'hover:scale-105'
                  )}
                  style={{
                    backgroundColor: cfg.bg,
                    borderColor: cfg.border,
                    color: cfg.text,
                  }}
                >
                  {a.asset_code}
                </button>
              )
            })}
          </div>
          {placingMarker && (
            <p className="text-brand-orange text-xs mt-2 animate-pulse font-medium">
              👆 Click anywhere on the map to place {placingMarker.asset_code}
            </p>
          )}
        </div>
      )}

      {/* ── Map canvas ───────────────────────────────────── */}
      <div
        ref={containerRef}
        className={cn(
          'relative flex-1 min-h-[300px] rounded-xl overflow-hidden border border-surface-border bg-surface-base',
          placingMarker ? 'cursor-crosshair' : isPanning ? 'cursor-grabbing' : 'cursor-grab'
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => { if (!placingMarker) setSelectedId(null) }}
      >
        {/* Zoomable / pannable inner layer */}
        <div
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 0.15s ease-out',
            width: '100%',
            height: '100%',
            position: 'relative',
          }}
          onClick={handleImageClick}
        >
          {/* The aerial image */}
          <img
            ref={imageRef}
            src={sitePlan.image_url!}
            alt="Site plan"
            className="w-full h-full object-contain select-none pointer-events-none"
            draggable={false}
          />

          {/* Markers */}
          {sitePlan.markers.map((marker) => (
            <Pin
              key={marker.id}
              marker={marker}
              selected={marker.id === selectedId}
              readOnly={readOnly}
              onClick={() => {
                setSelectedId(marker.id === selectedId ? null : marker.id)
                onMarkerClick?.(marker.asset_code)
              }}
              onDragStart={handleDragStart}
            />
          ))}

          {/* Selected marker tooltip */}
          {selectedMarker && (
            <MarkerTooltip
              marker={selectedMarker}
              readOnly={readOnly}
              onLink={() => { onMarkerClick?.(selectedMarker.asset_code); setSelectedId(null) }}
              onRemove={() => { removeMarker(selectedMarker.id); setSelectedId(null) }}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>

        {/* Legend */}
        {showLegend && <MapLegend markers={sitePlan.markers} />}

        {/* Zoom controls */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5 z-30">
          <button
            onClick={handleZoomIn}
            className="w-8 h-8 rounded-lg bg-surface-base/90 border border-surface-border flex items-center justify-center text-slate-300 hover:text-white hover:bg-surface-raised transition-all"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={handleZoomOut}
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

        {/* Placing mode indicator */}
        {placingMarker && (
          <div className="absolute top-3 left-3 z-30 flex items-center gap-2 bg-surface-base/95 border border-brand-orange/40 rounded-xl px-3 py-2">
            <div
              className="w-4 h-4 rounded text-[9px] font-bold font-mono text-white flex items-center justify-center"
              style={{ backgroundColor: PIN_CONFIG[placingMarker.status].bg }}
            >
              +
            </div>
            <span className="text-white text-xs font-medium">
              Placing <span className="text-brand-orange font-mono">{placingMarker.asset_code}</span>
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setPlacingMarker(null) }}
              className="text-slate-500 hover:text-white ml-1"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Marker count badge */}
        <div className="absolute bottom-3 left-3 z-30 flex items-center gap-1.5 bg-surface-base/90 border border-surface-border rounded-lg px-2.5 py-1.5">
          <MapPin size={11} className="text-brand-orange" />
          <span className="text-white text-[10px] font-bold">
            {sitePlan.markers.length}
          </span>
          <span className="text-slate-500 text-[10px]">markers</span>
        </div>

        {/* Loading overlay */}
        {saving && (
          <div className="absolute inset-0 bg-surface-base/50 flex items-center justify-center z-50">
            <div className="flex items-center gap-2 bg-surface-raised border border-surface-border rounded-xl px-4 py-3 shadow-xl">
              <span className="w-4 h-4 border-2 border-brand-orange/30 border-t-brand-orange rounded-full animate-spin" />
              <span className="text-white text-sm">Saving…</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Icon legend (matches Anchor Safe PDF format) ── */}
      <div className="bg-surface-raised rounded-xl border border-surface-border p-3">
        <button
          className="w-full flex items-center gap-2 text-left"
          onClick={() => setShowUnplaced((v) => !v)}
        >
          <Info size={13} className="text-slate-500" />
          <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Icon Legend</span>
        </button>
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
