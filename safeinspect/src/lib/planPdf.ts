// ============================================================
// SafeInspect — Site plan drafting pages for the PDF report
//
// Replays the map's vector features (points, polylines, range
// labels, leader lines, scope polygon) onto an A4 landscape
// page over the aerial image — crisp at print resolution, in
// the drafting layout of the Anchor Safe recert drawings:
// LEGEND quantity panel, icon legend, and a title block strip
// with the issue banner.
//
// Geometry contract: plan_features store vertices normalised to
// the plan image (0–1), so mm = frame origin + n × frame size.
// ============================================================

import type jsPDF from 'jspdf'
import { format, parseISO } from 'date-fns'
import {
  ASSET_CATEGORY_LABELS,
  type AssetCategory, type AssetStatus, type Inspection,
  type PlanFeature, type PlanPoint, type Profile, type SitePlan,
} from '@/types/database'
import {
  LINE_SYMBOLS, STATUS_COLORS,
} from '@/components/inspection/map/symbols'
import { rangeLabel, groupAnchor, groupLabelOwner } from '@/components/inspection/map/labels'

// ─── Page geometry (A4 landscape, mm) ────────────────────────

const L = { w: 297, h: 210 }
const FRAME = 5           // outer border inset
const TITLE_BLOCK_H = 24  // bottom strip

type RGB = [number, number, number]

const NAVY:  RGB = [26, 58, 92]
const WHITE: RGB = [255, 255, 255]
const SLATE500: RGB = [100, 116, 139]
const SLATE700: RGB = [51, 65, 85]
const SLATE900: RGB = [15, 23, 42]
const RED:   RGB = [220, 38, 38]

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/** Input for one drafting page. */
export interface PlanLayout {
  plan: SitePlan
  features: PlanFeature[]
  imageB64: string | null
  /** natural pixel dims of the image (from the plan row or measured) */
  imgW: number
  imgH: number
}

export interface PlanPageContext {
  inspection: Inspection
  certifier: Profile | null
  /** e.g. "RECERTIFICATION", "PROPOSED ANCHOR INSTALLATION" */
  issueTitle: string
  /** Raster logo (PNG data URL) for the title block; text brand fallback */
  logoB64?: string | null
}

// ─── Small drawing helpers ───────────────────────────────────

function setFill(doc: jsPDF, c: RGB) { doc.setFillColor(c[0], c[1], c[2]) }
function setDraw(doc: jsPDF, c: RGB) { doc.setDrawColor(c[0], c[1], c[2]) }
function setText(doc: jsPDF, c: RGB) { doc.setTextColor(c[0], c[1], c[2]) }

function text(
  doc: jsPDF, txt: string, x: number, y: number,
  opts: { size?: number; bold?: boolean; color?: RGB; align?: 'left'|'center'|'right'; mono?: boolean } = {}
) {
  const { size = 7, bold = false, color = SLATE900, align = 'left', mono = false } = opts
  doc.setFontSize(size)
  doc.setFont(mono ? 'courier' : 'helvetica', bold ? 'bold' : 'normal')
  setText(doc, color)
  doc.text(txt, x, y, { align })
}

function withOpacity(doc: jsPDF, opacity: number, draw: () => void) {
  // GState is attached to the jsPDF instance at runtime
  const d = doc as jsPDF & { GState: new (o: { opacity: number; 'stroke-opacity'?: number }) => unknown; setGState: (g: unknown) => void }
  d.setGState(new d.GState({ opacity, 'stroke-opacity': opacity }))
  draw()
  d.setGState(new d.GState({ opacity: 1, 'stroke-opacity': 1 }))
}

function polyPath(doc: jsPDF, pts: { x: number; y: number }[], close: boolean, style: 'S' | 'F' | 'FD') {
  if (pts.length < 2) return
  // doc.lines takes deltas from the previous vertex
  const deltas: [number, number][] = []
  for (let i = 1; i < pts.length; i++) {
    deltas.push([pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y])
  }
  doc.lines(deltas, pts[0].x, pts[0].y, [1, 1], style, close)
}

// ─── Point marker (matches the app's pin style) ──────────────
// A status-coloured dot with a white ring — same look as the
// on-screen map, so screen and print read identically.

function drawPinDot(doc: jsPDF, status: AssetStatus, cx: number, cy: number, s: number) {
  setFill(doc, hexToRgb(STATUS_COLORS[status].bg))
  setDraw(doc, WHITE)
  doc.setLineWidth(s * 0.2)
  doc.circle(cx, cy, s * 0.6, 'FD')
}

// ─── Line feature (static lines, guardrails, walkways) ───────

function drawLineFeature(doc: jsPDF, f: PlanFeature, pts: { x: number; y: number }[], s: number) {
  const style = LINE_SYMBOLS[f.category] ?? { stroke: '#ec4899', widthFactor: 0.3 }
  const stroke = hexToRgb(style.stroke)
  const w = s * style.widthFactor * 2
  const closed = f.geometry_type === 'polygon'

  setDraw(doc, stroke)
  doc.setLineWidth(w)
  if (style.dash) {
    const dash = style.dash.split(' ').map((d) => Number(d) * s)
    doc.setLineDashPattern(dash, 0)
  }

  if (closed) {
    setFill(doc, stroke)
    withOpacity(doc, 0.15, () => polyPath(doc, pts, true, 'F'))
    polyPath(doc, pts, true, 'S')
  } else if (style.hatch) {
    withOpacity(doc, 0.55, () => polyPath(doc, pts, false, 'S'))
  } else {
    polyPath(doc, pts, false, 'S')
  }
  doc.setLineDashPattern([], 0)

  // Walkway cross-ticks
  if (style.hatch) {
    doc.setLineWidth(s * 0.12)
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      const nx = -dy / len
      const ny = dx / len
      const n = Math.max(1, Math.floor(len / (s * 1.2)))
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n
        const mx = a.x + dx * t
        const my = a.y + dy * t
        doc.line(mx - nx * w * 0.5, my - ny * w * 0.5, mx + nx * w * 0.5, my + ny * w * 0.5)
      }
    }
  }

  // Static-line vertex nodes
  if (style.vertexNodes) {
    setFill(doc, WHITE)
    doc.setLineWidth(s * 0.12)
    for (const p of pts) {
      doc.rect(p.x - s * 0.35, p.y - s * 0.35, s * 0.7, s * 0.7, 'FD')
    }
  }
}

// ─── Status-coloured code label ──────────────────────────────

function drawLabel(
  doc: jsPDF, txt: string, cx: number, cy: number, s: number, status: AssetStatus
) {
  const c = STATUS_COLORS[status]
  const fontSize = Math.max(4.5, Math.min(7.5, s * 2.4))
  doc.setFontSize(fontSize)
  doc.setFont('courier', 'bold')
  const textW = doc.getTextWidth(txt)
  const padX = fontSize * 0.12
  const w = textW + padX * 2
  const h = fontSize * 0.5

  setFill(doc, hexToRgb(c.bg))
  setDraw(doc, hexToRgb(c.border))
  doc.setLineWidth(0.2)
  doc.roundedRect(cx - w / 2, cy - h / 2, w, h, h * 0.2, h * 0.2, 'FD')
  setText(doc, hexToRgb(c.text))
  doc.text(txt, cx, cy + fontSize * 0.13, { align: 'center' })
}

// ─── One drafting page ───────────────────────────────────────

export function drawPlanLayoutPage(
  doc: jsPDF,
  layout: PlanLayout,
  ctx: PlanPageContext
): void {
  doc.addPage('a4', 'landscape')
  const { plan, features } = layout

  // ── Outer frame + map area ────────────────────────────────
  const mapX = FRAME
  const mapY = FRAME
  const mapW = L.w - FRAME * 2
  const mapH = L.h - FRAME * 2 - TITLE_BLOCK_H

  setDraw(doc, SLATE900)
  doc.setLineWidth(0.4)
  doc.rect(FRAME, FRAME, L.w - FRAME * 2, L.h - FRAME * 2)
  doc.line(FRAME, FRAME + mapH, L.w - FRAME, FRAME + mapH)

  // ── Aerial image (contain-fit, centred) ───────────────────
  let imgX = mapX, imgY = mapY, imgW = mapW, imgH = mapH
  if (layout.imageB64 && layout.imgW > 0 && layout.imgH > 0) {
    const aspect = layout.imgW / layout.imgH
    imgW = mapW
    imgH = mapW / aspect
    if (imgH > mapH) { imgH = mapH; imgW = mapH * aspect }
    imgX = mapX + (mapW - imgW) / 2
    imgY = mapY + (mapH - imgH) / 2
    const fmt = layout.imageB64.startsWith('data:image/png') ? 'PNG' : 'JPEG'
    doc.addImage(layout.imageB64, fmt, imgX, imgY, imgW, imgH, undefined, 'FAST')
  } else {
    text(doc, 'No site plan image', mapX + mapW / 2, mapY + mapH / 2,
      { size: 10, color: SLATE500, align: 'center' })
  }

  // Normalised (0–1) → page mm
  const px = (p: PlanPoint) => ({ x: imgX + p.x * imgW, y: imgY + p.y * imgH })
  // Symbol unit mirrors the on-screen S = viewBox width × 1.1%
  const s = Math.max(1.4, Math.min(3.0, imgW * 0.011))

  // ── Scope polygon (dashed red boundary) ───────────────────
  if (plan.scope_polygon && plan.scope_polygon.length >= 3) {
    const pts = plan.scope_polygon.map(px)
    setFill(doc, RED)
    withOpacity(doc, 0.12, () => polyPath(doc, pts, true, 'F'))
    setDraw(doc, RED)
    doc.setLineWidth(s * 0.3)
    doc.setLineDashPattern([s, s * 0.6], 0)
    polyPath(doc, pts, true, 'S')
    doc.setLineDashPattern([], 0)
  }

  // ── Features: lines beneath, points above ─────────────────
  const groups = new Map<string, PlanFeature[]>()
  for (const f of features) {
    if (!f.group_id) continue
    const arr = groups.get(f.group_id)
    if (arr) arr.push(f)
    else groups.set(f.group_id, [f])
  }

  for (const f of features) {
    if (f.geometry.length === 0) continue
    if (f.geometry_type !== 'point') drawLineFeature(doc, f, f.geometry.map(px), s)
  }
  for (const f of features) {
    if (f.geometry.length === 0) continue
    if (f.geometry_type === 'point') {
      const p = px(f.geometry[0])
      drawPinDot(doc, f.status, p.x, p.y, s)
    }
  }

  // ── Labels (range labels for runs, leader lines for offsets) ─
  for (const f of features) {
    if (f.geometry.length === 0) continue
    const group = f.group_id ? groups.get(f.group_id) : undefined
    const isGrouped = !!group && group.length > 1
    if (isGrouped && groupLabelOwner(group).id !== f.id) continue

    const anchorNorm = isGrouped
      ? groupAnchor(group) ?? f.geometry[0]
      : f.geometry_type === 'point'
        ? f.geometry[0]
        : f.geometry[Math.floor(f.geometry.length / 2)]
    const anchor = px(anchorNorm)
    const off = f.label_offset ?? { dx: 0, dy: 0 }
    const lx = anchor.x + off.dx * imgW
    const ly = anchor.y - s * 2.2 + off.dy * imgH

    if (Math.hypot(lx - anchor.x, ly - anchor.y) > s * 3.2) {
      setDraw(doc, WHITE)
      doc.setLineWidth(s * 0.1)
      doc.line(lx, ly, anchor.x, anchor.y)
    }
    drawLabel(
      doc,
      isGrouped ? rangeLabel(group) : (f.label ?? f.asset_code),
      lx, ly, s, f.status
    )
  }

  // ── LEGEND panel (top-left): description + quantity ───────
  const counts = new Map<AssetCategory, number>()
  for (const f of features) {
    counts.set(f.category, (counts.get(f.category) ?? 0) + 1)
  }
  // The live enum can carry categories newer than the frontend type
  // union — fall back to the raw code rather than "undefined"
  const legendRows = [...counts.entries()]
    .map(([cat, n]) => ({ label: ASSET_CATEGORY_LABELS[cat] ?? String(cat), n }))
    .sort((a, b) => a.label.localeCompare(b.label))

  if (legendRows.length > 0) {
    const lw = 62
    const rowH = 4
    const lh = rowH * (legendRows.length + 2) + 2
    const lx0 = mapX + 2
    const ly0 = mapY + 2

    setFill(doc, WHITE)
    setDraw(doc, SLATE900)
    doc.setLineWidth(0.25)
    withOpacity(doc, 0.93, () => doc.rect(lx0, ly0, lw, lh, 'FD'))
    text(doc, 'LEGEND', lx0 + lw / 2, ly0 + rowH - 0.8, { size: 6.5, bold: true, align: 'center' })
    doc.line(lx0, ly0 + rowH + 0.5, lx0 + lw, ly0 + rowH + 0.5)
    text(doc, 'Description', lx0 + 2, ly0 + rowH * 2 - 0.8, { size: 5.5, bold: true, color: SLATE700 })
    text(doc, 'Qty', lx0 + lw - 2, ly0 + rowH * 2 - 0.8, { size: 5.5, bold: true, color: SLATE700, align: 'right' })
    legendRows.forEach((r, i) => {
      const y = ly0 + rowH * (i + 3) - 0.8
      text(doc, r.label, lx0 + 2, y, { size: 5.5, color: SLATE700 })
      text(doc, String(r.n), lx0 + lw - 2, y, { size: 5.5, color: SLATE700, align: 'right' })
    })
  }

  // ── Status legend (bottom-left, matches the app's map key) ─
  const statusesPresent = (Object.keys(STATUS_COLORS) as AssetStatus[])
    .filter((st) => features.some((f) => f.status === st))
  if (statusesPresent.length > 0) {
    const rowH = 4.4
    const bw = 44
    const bh = statusesPresent.length * rowH + 6.5
    const bx = mapX + 2
    const by = mapY + mapH - bh - 2

    setFill(doc, WHITE)
    setDraw(doc, SLATE900)
    doc.setLineWidth(0.25)
    withOpacity(doc, 0.93, () => doc.rect(bx, by, bw, bh, 'FD'))
    text(doc, 'STATUS', bx + bw / 2, by + 3.4, { size: 6, bold: true, align: 'center' })
    statusesPresent.forEach((st, i) => {
      const y = by + 6.5 + i * rowH
      const c = STATUS_COLORS[st]
      setFill(doc, hexToRgb(c.bg))
      setDraw(doc, WHITE)
      doc.setLineWidth(0.3)
      doc.circle(bx + 4, y + 1.2, 1.3, 'FD')
      text(doc, c.label, bx + 7.5, y + 2.2,
        { size: 5.5, color: SLATE700 })
      text(doc, String(features.filter((f) => f.status === st).length), bx + bw - 2, y + 2.2,
        { size: 5.5, color: SLATE700, align: 'right' })
    })
  }

  // ── Title block strip ─────────────────────────────────────
  drawTitleBlock(doc, layout, ctx, FRAME + mapH, TITLE_BLOCK_H)
}

// ─── Title block (bottom strip, Anchor Safe style) ───────────

function drawTitleBlock(
  doc: jsPDF, layout: PlanLayout, ctx: PlanPageContext,
  y: number, h: number
) {
  const { inspection, certifier } = ctx
  const x0 = FRAME
  const w = L.w - FRAME * 2
  const nonCompliant = inspection.overall_status === 'non_compliant'
  const bannerColor: RGB = nonCompliant ? RED : NAVY

  setFill(doc, WHITE)
  doc.rect(x0, y, w, h, 'F')

  // Column layout: ISSUE | INSPECTOR | CLIENT+TITLE | JOB/QUOTE | SITE ADDRESS | BRAND
  const cols = [x0, x0 + 52, x0 + 92, x0 + 170, x0 + 204, x0 + 252, x0 + w]
  setDraw(doc, SLATE900)
  doc.setLineWidth(0.3)
  for (const cx of cols.slice(1, -1)) doc.line(cx, y, cx, y + h)

  const labelY = y + 4
  const pad = 2

  // ISSUE banner
  text(doc, 'ISSUE', (cols[0] + cols[1]) / 2, labelY, { size: 5.5, bold: true, color: SLATE500, align: 'center' })
  setFill(doc, bannerColor)
  doc.roundedRect(cols[0] + pad, y + 6.5, cols[1] - cols[0] - pad * 2, 7, 1, 1, 'F')
  text(doc, nonCompliant ? 'NON-COMPLIANT' : ctx.issueTitle, (cols[0] + cols[1]) / 2, y + 11,
    { size: 6.5, bold: true, color: WHITE, align: 'center' })
  text(doc, `${layout.plan.name}  ·  ${format(parseISO(inspection.date_of_inspection), 'd/MM/yyyy')}`,
    (cols[0] + cols[1]) / 2, y + 17.5, { size: 5.5, color: SLATE700, align: 'center' })

  // INSPECTOR
  text(doc, 'INSPECTOR', cols[1] + pad, labelY, { size: 5.5, bold: true, color: SLATE500 })
  text(doc, certifier?.full_name ?? '—', cols[1] + pad, y + 9.5, { size: 7 })
  if (certifier?.accreditation_number) {
    text(doc, certifier.accreditation_number, cols[1] + pad, y + 14, { size: 5.5, color: SLATE700 })
  }

  // CLIENT + TITLE
  text(doc, 'CLIENT', cols[2] + pad, labelY, { size: 5.5, bold: true, color: SLATE500 })
  text(doc, inspection.client_name.slice(0, 48), cols[2] + pad, y + 9.5, { size: 7, bold: true })
  text(doc, 'TITLE', cols[2] + pad, y + 14, { size: 5.5, bold: true, color: SLATE500 })
  text(doc, `${ctx.issueTitle} — Site Layout`, cols[2] + pad, y + 18.5, { size: 6.5 })

  // QUOTE # / JOB #
  text(doc, 'QUOTE #', cols[3] + pad, labelY, { size: 5.5, bold: true, color: SLATE500 })
  text(doc, inspection.quote_number ?? '—', cols[3] + pad, y + 9, { size: 6.5, mono: true })
  text(doc, 'JOB #', cols[3] + pad, y + 13.5, { size: 5.5, bold: true, color: SLATE500 })
  text(doc, inspection.job_number, cols[3] + pad, y + 18, { size: 6.5, mono: true })

  // SITE ADDRESS
  text(doc, 'SITE ADDRESS', cols[4] + pad, labelY, { size: 5.5, bold: true, color: SLATE500 })
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'normal')
  setText(doc, SLATE900)
  const addr = doc.splitTextToSize(
    `${inspection.site_name}\n${inspection.site_address}`, cols[5] - cols[4] - pad * 2
  ) as string[]
  doc.text(addr.slice(0, 4), cols[4] + pad, y + 9)

  // BRAND + drawing scaled
  const brandCx = (cols[5] + cols[6]) / 2
  if (ctx.logoB64) {
    const logoS = 9
    doc.addImage(ctx.logoB64, 'PNG', brandCx - logoS / 2 - 11, y + 3, logoS, logoS, undefined, 'FAST')
    text(doc, 'SafeInspect', brandCx + 5, y + 8.8, { size: 9, bold: true, color: NAVY, align: 'center' })
    text(doc, 'HEIGHT SAFETY INSPECTIONS', brandCx, y + 13.5, { size: 4.4, color: SLATE500, align: 'center' })
  } else {
    text(doc, 'SafeInspect', brandCx, y + 9, { size: 11, bold: true, color: NAVY, align: 'center' })
    text(doc, 'HEIGHT SAFETY INSPECTIONS', brandCx, y + 13, { size: 5, color: SLATE500, align: 'center' })
  }
  const ds = layout.plan.drawing_scaled || inspection.drawing_scaled
  text(doc, 'DRAWING SCALED', cols[5] + pad, y + 19.5, { size: 5, bold: true, color: SLATE500 })
  setDraw(doc, SLATE900)
  doc.setLineWidth(0.25)
  const boxX = cols[6] - pad - 3.2
  const boxY = y + 16.8
  doc.rect(boxX, boxY, 3.2, 3.2)
  if (ds) {
    // Tick drawn with lines — the built-in fonts have no ✓ glyph
    doc.setLineWidth(0.45)
    doc.line(boxX + 0.7, boxY + 1.8, boxX + 1.4, boxY + 2.5)
    doc.line(boxX + 1.4, boxY + 2.5, boxX + 2.6, boxY + 0.8)
  }
}
