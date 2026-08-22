// ============================================================
// SafeInspect — Plan symbol library
// Per-category SVG symbols matching the Anchor Safe drawing
// conventions: blue squares for davit bases, circles for anchor
// points, magenta polylines for static lines / guardrails,
// green hatched bands for walkways, etc.
// All geometry is drawn in image-space (viewBox) units so the
// symbols stay locked to the aerial imagery at every zoom level,
// exactly like a scaled drawing.
// ============================================================

import type { AssetCategory, AssetStatus, PlanFeature } from '@/types/database'

// ─── Status colours (label bubbles — matches PDF) ─────────────

export const STATUS_COLORS: Record<AssetStatus, { bg: string; border: string; text: string; label: string }> = {
  compliant:      { bg: '#16a34a', border: '#15803d', text: '#ffffff', label: 'Compliant' },
  non_compliant:  { bg: '#dc2626', border: '#b91c1c', text: '#ffffff', label: 'Non-Compliant' },
  recommendation: { bg: '#d97706', border: '#b45309', text: '#ffffff', label: 'Recommendation' },
  proposed:       { bg: '#2563eb', border: '#1d4ed8', text: '#ffffff', label: 'Proposed' },
  'n/a':          { bg: '#475569', border: '#334155', text: '#ffffff', label: 'N/A' },
}

// ─── Symbol styles ────────────────────────────────────────────

type SymbolKind = 'circle' | 'square' | 'diamond' | 'crossCircle' | 'ladder' | 'hatchRect'

interface PointSymbolStyle {
  kind: SymbolKind
  fill: string
  stroke: string
}

interface LineSymbolStyle {
  stroke: string
  /** stroke width as a fraction of the symbol size unit */
  widthFactor: number
  dash?: string
  /** draw square vertex nodes along the line (static lines) */
  vertexNodes?: boolean
  /** overlay diagonal hatching (walkways) */
  hatch?: boolean
}

/** Categories captured as polylines in the field. */
export const LINE_CATEGORIES: ReadonlySet<AssetCategory> = new Set([
  'HSL', 'VSL', 'GR', 'WW', 'RR',
] as AssetCategory[])

export const POINT_SYMBOLS: Record<AssetCategory, PointSymbolStyle> = {
  APS:  { kind: 'square',      fill: '#f59e0b', stroke: '#b45309' },
  ST:   { kind: 'circle',      fill: '#38bdf8', stroke: '#0369a1' },
  TMAP: { kind: 'crossCircle', fill: '#fb923c', stroke: '#c2410c' },
  CAP:  { kind: 'crossCircle', fill: '#facc15', stroke: '#a16207' },
  HSL:  { kind: 'square',      fill: '#ec4899', stroke: '#be185d' },
  VSL:  { kind: 'square',      fill: '#d946ef', stroke: '#a21caf' },
  LD:   { kind: 'ladder',      fill: '#a78bfa', stroke: '#6d28d9' },
  GR:   { kind: 'square',      fill: '#f472b6', stroke: '#be185d' },
  WW:   { kind: 'hatchRect',   fill: '#4ade80', stroke: '#15803d' },
  STP:  { kind: 'square',      fill: '#fb923c', stroke: '#c2410c' },
  STR:  { kind: 'square',      fill: '#fbbf24', stroke: '#b45309' },
  SL:   { kind: 'ladder',      fill: '#60a5fa', stroke: '#1d4ed8' },
  EK:   { kind: 'square',      fill: '#34d399', stroke: '#047857' },
  PL:   { kind: 'hatchRect',   fill: '#c4b5fd', stroke: '#6d28d9' },
  GHK:  { kind: 'square',      fill: '#2dd4bf', stroke: '#0f766e' },
  SS:   { kind: 'crossCircle', fill: '#fdba74', stroke: '#c2410c' },
  DB:   { kind: 'square',      fill: '#2563eb', stroke: '#1e3a8a' },
  RR:   { kind: 'square',      fill: '#818cf8', stroke: '#4338ca' },
  SPM:  { kind: 'hatchRect',   fill: '#93c5fd', stroke: '#1d4ed8' },
  OSE:  { kind: 'diamond',     fill: '#94a3b8', stroke: '#475569' },
  R:    { kind: 'diamond',     fill: '#f97316', stroke: '#9a3412' },
}

export const LINE_SYMBOLS: Partial<Record<AssetCategory, LineSymbolStyle>> = {
  HSL: { stroke: '#ec4899', widthFactor: 0.28, vertexNodes: true },
  VSL: { stroke: '#d946ef', widthFactor: 0.28, vertexNodes: true },
  GR:  { stroke: '#f472b6', widthFactor: 0.35 },
  WW:  { stroke: '#4ade80', widthFactor: 0.9, hatch: true },
  RR:  { stroke: '#818cf8', widthFactor: 0.35, dash: '2 1' },
}

// ─── Point symbol renderer ────────────────────────────────────
// (cx, cy) in viewBox units; s = symbol half-size in viewBox units.

export function PointSymbol({
  category, cx, cy, s,
}: {
  category: AssetCategory
  cx: number
  cy: number
  s: number
}) {
  const style = POINT_SYMBOLS[category]
  const sw = s * 0.22

  switch (style.kind) {
    case 'circle':
      return <circle cx={cx} cy={cy} r={s} fill={style.fill} stroke={style.stroke} strokeWidth={sw} />

    case 'crossCircle':
      return (
        <g stroke={style.stroke} strokeWidth={sw}>
          <circle cx={cx} cy={cy} r={s} fill={style.fill} />
          <line x1={cx - s * 0.6} y1={cy - s * 0.6} x2={cx + s * 0.6} y2={cy + s * 0.6} />
          <line x1={cx - s * 0.6} y1={cy + s * 0.6} x2={cx + s * 0.6} y2={cy - s * 0.6} />
        </g>
      )

    case 'square':
      return (
        <rect
          x={cx - s} y={cy - s} width={s * 2} height={s * 2}
          fill={style.fill} stroke={style.stroke} strokeWidth={sw}
        />
      )

    case 'diamond':
      return (
        <rect
          x={cx - s} y={cy - s} width={s * 2} height={s * 2}
          transform={`rotate(45 ${cx} ${cy})`}
          fill={style.fill} stroke={style.stroke} strokeWidth={sw}
        />
      )

    case 'ladder':
      return (
        <g>
          <rect
            x={cx - s * 0.8} y={cy - s} width={s * 1.6} height={s * 2}
            fill={style.fill} stroke={style.stroke} strokeWidth={sw}
          />
          {[-0.4, 0, 0.4].map((f) => (
            <line
              key={f}
              x1={cx - s * 0.8} y1={cy + s * f}
              x2={cx + s * 0.8} y2={cy + s * f}
              stroke={style.stroke} strokeWidth={sw}
            />
          ))}
        </g>
      )

    case 'hatchRect':
      return (
        <g>
          <rect
            x={cx - s} y={cy - s * 0.7} width={s * 2} height={s * 1.4}
            fill={style.fill} fillOpacity={0.85}
            stroke={style.stroke} strokeWidth={sw}
          />
          {[-0.5, 0.1, 0.7].map((f) => (
            <line
              key={f}
              x1={cx + s * f - s * 0.5} y1={cy + s * 0.7}
              x2={cx + s * f + s * 0.2} y2={cy - s * 0.7}
              stroke={style.stroke} strokeWidth={sw * 0.7}
            />
          ))}
        </g>
      )
  }
}

// ─── Polyline symbol renderer ─────────────────────────────────

export function LineSymbol({
  feature, points, s, selected,
}: {
  feature: Pick<PlanFeature, 'category' | 'geometry_type'>
  points: { x: number; y: number }[]
  s: number
  selected?: boolean
}) {
  const style = LINE_SYMBOLS[feature.category] ?? { stroke: '#ec4899', widthFactor: 0.3 }
  const w = s * style.widthFactor * 2
  const pts = points.map((p) => `${p.x},${p.y}`).join(' ')
  const closed = feature.geometry_type === 'polygon'

  return (
    <g>
      {/* Hit area + selection halo */}
      <polyline
        points={closed ? `${pts} ${points[0]?.x},${points[0]?.y}` : pts}
        fill="none"
        stroke={selected ? '#ffffff' : 'transparent'}
        strokeOpacity={selected ? 0.6 : 0}
        strokeWidth={w * 2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <polyline
        points={closed ? `${pts} ${points[0]?.x},${points[0]?.y}` : pts}
        fill={closed ? style.stroke : 'none'}
        fillOpacity={closed ? 0.15 : 0}
        stroke={style.stroke}
        strokeWidth={w}
        strokeDasharray={style.dash ? style.dash.split(' ').map((d) => Number(d) * s).join(' ') : undefined}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={style.hatch ? 0.55 : 0.9}
      />
      {/* Walkway hatching: short cross-ticks along each segment */}
      {style.hatch && points.slice(1).map((p, i) => {
        const a = points[i]
        const dx = p.x - a.x
        const dy = p.y - a.y
        const len = Math.hypot(dx, dy) || 1
        const nx = -dy / len
        const ny = dx / len
        const step = s * 1.2
        const n = Math.max(1, Math.floor(len / step))
        return Array.from({ length: n }, (_, k) => {
          const t = (k + 0.5) / n
          const mx = a.x + dx * t
          const my = a.y + dy * t
          return (
            <line
              key={`${i}-${k}`}
              x1={mx - nx * w * 0.5} y1={my - ny * w * 0.5}
              x2={mx + nx * w * 0.5} y2={my + ny * w * 0.5}
              stroke={style.stroke}
              strokeWidth={s * 0.12}
              opacity={0.9}
            />
          )
        })
      })}
      {/* Vertex nodes (static line intermediate anchors) */}
      {style.vertexNodes && points.map((p, i) => (
        <rect
          key={i}
          x={p.x - s * 0.35} y={p.y - s * 0.35}
          width={s * 0.7} height={s * 0.7}
          fill="#ffffff"
          stroke={style.stroke}
          strokeWidth={s * 0.12}
        />
      ))}
    </g>
  )
}

// ─── Label bubble ─────────────────────────────────────────────
// Status-coloured code label (green/red/orange, like the PDF).
// Rendered in image-space; text length is estimated monospace.

export function FeatureLabel({
  text, x, y, s, status, selected, onPointerDown,
}: {
  text: string
  x: number
  y: number
  s: number
  status: AssetStatus
  selected?: boolean
  /** When provided, the label is draggable (repositioning + leader line). */
  onPointerDown?: (e: React.PointerEvent) => void
}) {
  const c = STATUS_COLORS[status]
  const fontSize = s * 1.5
  const padX = fontSize * 0.35
  const w = text.length * fontSize * 0.62 + padX * 2
  const h = fontSize * 1.45

  return (
    <g
      onPointerDown={onPointerDown}
      style={onPointerDown ? { cursor: 'grab', pointerEvents: 'auto' } : undefined}
    >
      <rect
        x={x - w / 2} y={y - h / 2} width={w} height={h}
        rx={h * 0.22}
        fill={c.bg} stroke={selected ? '#ffffff' : c.border}
        strokeWidth={selected ? s * 0.25 : s * 0.12}
      />
      <text
        x={x} y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight={700}
        fill={c.text}
      >
        {text}
      </text>
    </g>
  )
}
