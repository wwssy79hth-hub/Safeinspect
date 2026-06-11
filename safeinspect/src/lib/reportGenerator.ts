// ============================================================
// SafeInspect — PDF Report Generator
// Produces a professional A4 report matching the Abseal
// Recertification Report template structure exactly.
//
// Stack: jsPDF 2.5.1 + jspdf-autotable 3.8.1
// No html2canvas — pure vector draw for reliability at scale
// ============================================================

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format, parseISO, addYears } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { ASSET_CATEGORY_LABELS, ASSET_CATEGORIES } from '@/types/database'
import type {
  Inspection, InspectionAsset, AssetCategory,
  AssetStatus, Profile,
} from '@/types/database'

// ─── Brand colours (exact matches to Tailwind config) ────────

const C = {
  navy:             [26,  58,  92]  as [number, number, number],
  orange:           [249, 115, 22]  as [number, number, number],
  compliant:        [22,  163, 74]  as [number, number, number],
  compliantBg:      [220, 252, 231] as [number, number, number],
  nonCompliant:     [220, 38,  38]  as [number, number, number],
  nonCompliantBg:   [254, 226, 226] as [number, number, number],
  recommendation:   [217, 119, 6]   as [number, number, number],
  recommendationBg: [254, 243, 199] as [number, number, number],
  naBg:             [241, 245, 249] as [number, number, number],
  na:               [100, 116, 139] as [number, number, number],
  p1:               [220, 38,  38]  as [number, number, number],
  p2:               [217, 119, 6]   as [number, number, number],
  p3:               [202, 138, 4]   as [number, number, number],
  white:            [255, 255, 255] as [number, number, number],
  offWhite:         [248, 250, 252] as [number, number, number],
  slate50:          [248, 250, 252] as [number, number, number],
  slate100:         [241, 245, 249] as [number, number, number],
  slate200:         [226, 232, 240] as [number, number, number],
  slate400:         [148, 163, 184] as [number, number, number],
  slate500:         [100, 116, 139] as [number, number, number],
  slate600:         [71,  85,  105] as [number, number, number],
  slate700:         [51,  65,  85]  as [number, number, number],
  slate900:         [15,  23,  42]  as [number, number, number],
  black:            [0,   0,   0]   as [number, number, number],
}

// ─── Page geometry ────────────────────────────────────────────

const A4 = { w: 210, h: 297 }   // mm
const M  = { t: 18, b: 22, l: 14, r: 14 }  // margins
const CW = A4.w - M.l - M.r     // content width: 182mm

// ─── Progress callback type ───────────────────────────────────

export type ProgressCallback = (pct: number, label: string) => void

// ─── Status helpers ───────────────────────────────────────────

function statusColors(status: AssetStatus): {
  bg: [number,number,number]; text: [number,number,number]; label: string
} {
  switch (status) {
    case 'compliant':      return { bg: C.compliantBg,      text: C.compliant,      label: 'COMPLIANT'      }
    case 'non_compliant':  return { bg: C.nonCompliantBg,   text: C.nonCompliant,   label: 'NON-COMPLIANT'  }
    case 'recommendation': return { bg: C.recommendationBg, text: C.recommendation, label: 'RECOMMENDATION' }
    case 'n/a':            return { bg: C.naBg,             text: C.na,             label: 'N/A'            }
  }
}

function priorityColors(p: number): { bg: [number,number,number]; text: [number,number,number] } {
  if (p === 1) return { bg: C.nonCompliantBg,   text: C.nonCompliant   }
  if (p === 2) return { bg: C.recommendationBg, text: C.recommendation }
  return       { bg: [254, 249, 195],            text: C.p3             }
}

function priorityLabel(p: number): string {
  if (p === 1) return 'P1 — IMMEDIATE'
  if (p === 2) return 'P2 — 30 DAYS'
  return               'P3 — PLANNED'
}

function issueTypeLabel(t: string): string {
  if (t === 'recertification')       return 'Recertification'
  if (t === 'non_compliant_follow_up') return 'Non-Compliant Follow-Up'
  return 'Initial Inspection'
}

function siteStatusLabel(s: string | null): string {
  if (s === 'compliant')         return 'COMPLIANT'
  if (s === 'non_compliant')     return 'NON-COMPLIANT'
  if (s === 'partially_compliant') return 'PARTIALLY COMPLIANT'
  return 'PENDING'
}

// ─── Low-level drawing helpers ────────────────────────────────

class PDFDrawer {
  doc: jsPDF
  y: number  // current vertical cursor

  constructor(doc: jsPDF) {
    this.doc = doc
    this.y = M.t
  }

  /** Set fill + draw colour together */
  setFill(rgb: [number, number, number]) {
    this.doc.setFillColor(rgb[0], rgb[1], rgb[2])
  }
  setDraw(rgb: [number, number, number]) {
    this.doc.setDrawColor(rgb[0], rgb[1], rgb[2])
  }
  setTextColor(rgb: [number, number, number]) {
    this.doc.setTextColor(rgb[0], rgb[1], rgb[2])
  }

  /** Filled rectangle */
  rect(x: number, y: number, w: number, h: number, fill: [number,number,number], stroke?: [number,number,number]) {
    this.setFill(fill)
    if (stroke) {
      this.setDraw(stroke)
      this.doc.rect(x, y, w, h, 'FD')
    } else {
      this.doc.rect(x, y, w, h, 'F')
    }
  }

  /** Text with font settings */
  text(
    txt: string, x: number, y: number,
    opts: {
      size?: number; bold?: boolean; color?: [number,number,number]
      align?: 'left'|'center'|'right'; maxW?: number; mono?: boolean
    } = {}
  ) {
    const { size = 9, bold = false, color = C.slate900, align = 'left', maxW, mono = false } = opts
    this.doc.setFontSize(size)
    this.doc.setFont(mono ? 'courier' : 'helvetica', bold ? 'bold' : 'normal')
    this.setTextColor(color)
    const alignOpt: 'left'|'center'|'right' = align
    if (maxW) {
      this.doc.text(txt, x, y, { align: alignOpt, maxWidth: maxW })
    } else {
      this.doc.text(txt, x, y, { align: alignOpt })
    }
  }

  /** Horizontal rule */
  hr(y: number, color: [number,number,number] = C.slate200, lw = 0.2) {
    this.doc.setDrawColor(color[0], color[1], color[2])
    this.doc.setLineWidth(lw)
    this.doc.line(M.l, y, A4.w - M.r, y)
  }

  /** Check if we need a new page; if so, add one + reset cursor */
  ensureSpace(needed: number) {
    if (this.y + needed > A4.h - M.b) {
      this.doc.addPage()
      this.y = M.t
    }
  }

  /** Move cursor down by n mm */
  gap(n: number) { this.y += n }
}

// ─── Load image as base64 (for embedding photos + aerial map) ─

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ─── Get natural image dimensions from base64 ─────────────────

async function getImageDimensions(b64: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve({ w: 1, h: 1 })
    img.src = b64
  })
}

// ─── Fetch all report data from Supabase ─────────────────────

interface ReportData {
  inspection:  Inspection
  certifier:   Profile | null
  assets:      InspectionAsset[]
  photosByAsset: Record<string, Array<{ url: string; caption: string | null }>>
  aerialMapB64: string | null
  signatureB64: string | null
}

async function fetchReportData(inspectionId: string): Promise<ReportData> {
  const [inspRes, assetsRes] = await Promise.all([
    supabase.from('inspections').select('*').eq('id', inspectionId).single(),
    supabase.from('inspection_assets').select('*')
      .eq('inspection_id', inspectionId)
      .order('category').order('sort_order'),
  ])

  if (inspRes.error) throw inspRes.error
  const inspection = inspRes.data

  // Certifier profile
  const { data: certifier } = await supabase
    .from('profiles').select('*').eq('id', inspection.certifier_id).single()

  // Photos for all assets
  const { data: photos } = await supabase
    .from('asset_photos').select('*')
    .eq('inspection_id', inspectionId)
    .order('sort_order')

  const photosByAsset: Record<string, Array<{ url: string; caption: string | null }>> = {}
  for (const p of photos ?? []) {
    if (!photosByAsset[p.asset_id]) photosByAsset[p.asset_id] = []
    if (p.public_url) photosByAsset[p.asset_id].push({ url: p.public_url, caption: p.caption })
  }

  // Load aerial map
  let aerialMapB64: string | null = null
  if (inspection.aerial_map_url) {
    aerialMapB64 = await loadImageAsBase64(inspection.aerial_map_url)
  }

  // Load certifier signature
  let signatureB64: string | null = null
  if (inspection.certifier_signature_url) {
    signatureB64 = await loadImageAsBase64(inspection.certifier_signature_url)
  }

  return {
    inspection,
    certifier: certifier ?? null,
    assets: assetsRes.data ?? [],
    photosByAsset,
    aerialMapB64,
    signatureB64,
  }
}

// ─── Persistent page header / footer ─────────────────────────

function drawPageHeaderFooter(
  doc: jsPDF, pageNum: number, totalPages: number,
  inspection: Inspection
) {
  const d = new PDFDrawer(doc)

  // ── Header bar ──────────────────────────────────────────────
  d.rect(0, 0, A4.w, 11, C.navy)
  d.text('HEIGHT SAFETY RECERTIFICATION REPORT', A4.w / 2, 7,
    { size: 7.5, bold: true, color: C.white, align: 'center' })
  d.text('Abseal Pty Ltd', M.l, 7, { size: 7, color: [249, 155, 80] })
  d.text(`Page ${pageNum} of ${totalPages}`, A4.w - M.r, 7,
    { size: 7, color: C.slate400, align: 'right' })

  // ── Orange accent line ───────────────────────────────────────
  d.rect(0, 11, A4.w, 0.8, C.orange)

  // ── Footer ──────────────────────────────────────────────────
  const fy = A4.h - 8
  d.rect(0, A4.h - 12, A4.w, 12, C.navy)
  d.text('Abseal Pty Ltd  │  P O Box 22, Olinda VIC 3788  │  03 9751 0553  │  0438 757 622  │  office@abseal.com.au',
    A4.w / 2, fy, { size: 6.5, color: C.slate400, align: 'center' })
  d.text('This report is confidential and prepared for the client named herein only.',
    A4.w / 2, fy + 3.5, { size: 6, color: C.slate400, align: 'center' })
}

// ─── Section heading ──────────────────────────────────────────

function drawSectionHeading(d: PDFDrawer, title: string, sub?: string) {
  d.ensureSpace(14)
  d.rect(M.l, d.y, CW, 9, C.navy)
  d.rect(M.l, d.y + 9, 3, sub ? 5 : 0, C.orange)
  d.text(title.toUpperCase(), M.l + 4, d.y + 6, { size: 9, bold: true, color: C.white })
  d.y += 9
  if (sub) {
    d.rect(M.l, d.y, CW, 5, C.slate50)
    d.text(sub, M.l + 4, d.y + 3.5, { size: 7, color: C.slate500 })
    d.y += 5
  }
  d.gap(3)
}

// ─── Key-value pair row ───────────────────────────────────────

function drawKVRow(
  d: PDFDrawer, label: string, value: string,
  y: number, shade: boolean, colW = 44
) {
  if (shade) d.rect(M.l, y, CW, 7, C.slate50)
  d.hr(y, C.slate200, 0.1)
  d.text(label, M.l + 2, y + 4.8, { size: 7.5, bold: true, color: C.navy })
  d.text(value || '—', M.l + colW, y + 4.8, { size: 7.5, color: C.slate700, maxW: CW - colW - 2 })
  return y + 7
}

// ─── PAGE 1: Cover ────────────────────────────────────────────

function drawCoverPage(d: PDFDrawer, data: ReportData) {
  const { inspection, certifier } = data

  d.y = 14  // start below global header band

  // ── Hero band ───────────────────────────────────────────────
  d.rect(M.l, d.y, CW, 48, C.navy)

  // Decorative orange accent strip
  d.rect(M.l, d.y, 4, 48, C.orange)

  // Report type badge
  d.rect(M.l + 8, d.y + 6, 60, 8, C.orange)
  d.text(issueTypeLabel(inspection.issue_type).toUpperCase(),
    M.l + 38, d.y + 11.2, { size: 7.5, bold: true, color: C.white, align: 'center' })

  // Main title
  d.text('HEIGHT SAFETY', M.l + 8, d.y + 23, { size: 20, bold: true, color: C.white })
  d.text('RECERTIFICATION REPORT', M.l + 8, d.y + 32, { size: 13, bold: true, color: C.orange })

  // Standards line
  d.text('AS1891.4:2009  │  AS1657-2018  │  AS5532-2013',
    M.l + 8, d.y + 41, { size: 7, color: [180, 200, 220] })

  d.y += 52

  // ── Site name large display ──────────────────────────────────
  d.gap(4)
  d.text(inspection.site_name, M.l, d.y, { size: 18, bold: true, color: C.navy })
  d.gap(7)
  d.text(inspection.site_address, M.l, d.y, { size: 9, color: C.slate500 })
  d.gap(5)
  d.hr(d.y, C.orange, 0.6)
  d.gap(6)

  // ── Site Details table ───────────────────────────────────────
  drawSectionHeading(d, 'Site Details')

  const siteRows = [
    ['Client',               inspection.client_name],
    ['Site Name',            inspection.site_name],
    ['Site Address',         inspection.site_address],
    ['Roof / Area Reference',inspection.roof_area_reference ?? '—'],
    ['Date of Inspection',   format(parseISO(inspection.date_of_inspection), 'dd/MM/yyyy')],
    ['Job Number',           inspection.job_number],
    ['Quote Number',         inspection.quote_number ?? '—'],
    ['Issue Type',           issueTypeLabel(inspection.issue_type)],
  ]

  let ky = d.y
  siteRows.forEach(([label, value], i) => {
    ky = drawKVRow(d, label, value, ky, i % 2 === 0)
  })
  d.y = ky + 2

  // ── Certifier Details ────────────────────────────────────────
  d.gap(4)
  drawSectionHeading(d, 'Certifier Details')

  const certRows: [string, string][] = [
    ['Certifier Name',         certifier?.full_name ?? inspection.certifier_id],
    ['Position / Qualification', certifier?.position ?? '—'],
    ['Company',                 certifier?.company ?? 'Abseal Pty Ltd'],
    ['Accreditation Number',   certifier?.accreditation_number ?? '—'],
    ['Date Signed',            inspection.date_signed
      ? format(parseISO(inspection.date_signed), 'dd/MM/yyyy')
      : format(new Date(), 'dd/MM/yyyy')],
  ]

  ky = d.y
  certRows.forEach(([label, value], i) => {
    ky = drawKVRow(d, label, value, ky, i % 2 === 0)
  })
  d.y = ky + 2

  // Signature box
  d.ensureSpace(22)
  d.gap(2)
  d.rect(M.l, d.y, CW, 18, C.slate50, C.slate200)
  d.text('SIGNATURE', M.l + 2, d.y + 4, { size: 6.5, bold: true, color: C.slate400 })
  if (data.signatureB64) {
    try {
      d.doc.addImage(data.signatureB64, 'PNG', M.l + 2, d.y + 2, 60, 14, undefined, 'FAST')
    } catch { /* skip if corrupt */ }
  }
  d.y += 20

  // ── Declaration ──────────────────────────────────────────────
  d.ensureSpace(28)
  d.gap(3)
  d.rect(M.l, d.y, CW, 24, [240, 244, 255], C.navy)
  d.rect(M.l, d.y, 3, 24, C.navy)
  d.text('DECLARATION', M.l + 5, d.y + 5, { size: 7.5, bold: true, color: C.navy })
  const declText =
    'This is a Recertification Assessment of the Height Safety System in Accordance with AS1891.4:2009 ' +
    'Section 9 - Inspection, Maintenance and Storage, and other relevant manufacturer requirements. ' +
    'The report presents a detailed assessment of the Height Safety Systems in place, highlighting areas ' +
    'that require improvement and making recommendations to rectify any non-compliances. Standards referenced: ' +
    'AS1891.4:2009, AS1657-2018, AS5532-2013 and applicable manufacturer requirements.'
  d.doc.setFontSize(7)
  d.doc.setFont('helvetica', 'normal')
  d.setTextColor(C.slate700)
  const splitDecl = d.doc.splitTextToSize(declText, CW - 8)
  d.doc.text(splitDecl, M.l + 5, d.y + 10)
  d.y += 27
}

// ─── PAGE 2: Inspection Summary ───────────────────────────────

function drawSummaryPage(d: PDFDrawer, data: ReportData) {
  d.doc.addPage()
  d.y = 14

  const { assets, inspection } = data

  // Compute per-category counts
  const catMap = new Map<AssetCategory, { total:number; compliant:number; non_compliant:number; recommendation:number }>()
  for (const asset of assets) {
    const cat = asset.category as AssetCategory
    if (!catMap.has(cat)) catMap.set(cat, { total: 0, compliant: 0, non_compliant: 0, recommendation: 0 })
    const s = catMap.get(cat)!
    s.total++
    if (asset.status === 'compliant')      s.compliant++
    if (asset.status === 'non_compliant')  s.non_compliant++
    if (asset.status === 'recommendation') s.recommendation++
  }

  const totalAll     = assets.length
  const compliantAll = assets.filter((a) => a.status === 'compliant').length
  const ncAll        = assets.filter((a) => a.status === 'non_compliant').length
  const recAll       = assets.filter((a) => a.status === 'recommendation').length
  const compliancePct = totalAll > 0 ? Math.round((compliantAll / totalAll) * 100) : 0

  drawSectionHeading(d, 'Inspection Item Summary',
    `${inspection.site_name}  ·  ${format(parseISO(inspection.date_of_inspection), 'd MMMM yyyy')}`)

  // Overall compliance bar
  d.ensureSpace(20)
  d.rect(M.l, d.y, CW, 16, C.slate50, C.slate200)

  // Compliance fill
  const barX = M.l + 44, barW = CW - 48, barH = 5, barY = d.y + 5.5
  d.rect(barX, barY, barW, barH, C.slate200)
  const fillW = Math.max(1, (compliancePct / 100) * barW)
  d.rect(barX, barY, fillW, barH,
    compliancePct >= 80 ? C.compliant : compliancePct >= 50 ? C.recommendation : C.nonCompliant)

  d.text('OVERALL COMPLIANCE', M.l + 2, d.y + 6, { size: 7, bold: true, color: C.navy })
  d.text(`${compliancePct}%`, M.l + 2, d.y + 12, { size: 9, bold: true,
    color: compliancePct >= 80 ? C.compliant : compliancePct >= 50 ? C.recommendation : C.nonCompliant })
  d.text(`${totalAll} items  ·  ${compliantAll} compliant  ·  ${ncAll} non-compliant  ·  ${recAll} recommendations`,
    barX, d.y + 13.5, { size: 6.5, color: C.slate500 })
  d.y += 20

  // Overall site status
  const osStatus = inspection.overall_status
  const osCols = osStatus === 'compliant' ? { bg: C.compliantBg, text: C.compliant } :
                 osStatus === 'non_compliant' ? { bg: C.nonCompliantBg, text: C.nonCompliant } :
                 { bg: C.recommendationBg, text: C.recommendation }
  d.gap(2)
  d.rect(M.l, d.y, CW, 8, osCols.bg, osCols.text)
  d.text('OVERALL SITE STATUS:', M.l + 3, d.y + 5.5, { size: 8, bold: true, color: osCols.text })
  d.text(siteStatusLabel(osStatus), M.l + 50, d.y + 5.5, { size: 8, bold: true, color: osCols.text })
  d.y += 10

  // Summary table
  const tableRows: (string | { content: string; styles: object })[][] = []
  for (const cat of ASSET_CATEGORIES) {
    const s = catMap.get(cat)
    if (!s) continue   // skip categories with no items
    tableRows.push([
      ASSET_CATEGORY_LABELS[cat],
      cat,
      String(s.total),
      String(s.compliant),
      String(s.non_compliant),
      String(s.recommendation),
    ])
  }

  // Totals row
  tableRows.push([
    { content: 'TOTALS', styles: { fontStyle: 'bold', fillColor: C.navy, textColor: C.white } },
    { content: '',        styles: { fillColor: C.navy } },
    { content: String(totalAll),     styles: { fontStyle: 'bold', fillColor: C.navy, textColor: C.white, halign: 'center' } },
    { content: String(compliantAll), styles: { fontStyle: 'bold', fillColor: C.navy, textColor: [180,255,180], halign: 'center' } },
    { content: String(ncAll),        styles: { fontStyle: 'bold', fillColor: C.navy, textColor: ncAll > 0 ? [255,160,160] : [180,255,180], halign: 'center' } },
    { content: String(recAll),       styles: { fontStyle: 'bold', fillColor: C.navy, textColor: recAll > 0 ? [255,220,120] : [180,255,180], halign: 'center' } },
  ])

  autoTable(d.doc, {
    startY: d.y,
    head: [['Category', 'Code', 'Total', 'Compliant', 'Non-Compliant', 'Recommendation']],
    body: tableRows,
    margin: { left: M.l, right: M.r },
    styles: { fontSize: 7.5, cellPadding: 2.5, font: 'helvetica', textColor: C.slate700 },
    headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
    columnStyles: {
      0: { cellWidth: 62, halign: 'left' },
      1: { cellWidth: 18, halign: 'center', font: 'courier', fontSize: 7, textColor: C.navy },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 28, halign: 'center', textColor: C.compliant, fontStyle: 'bold' },
      4: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: C.slate50 },
    didParseCell: (hookData) => {
      if (hookData.column.index === 4 && hookData.section === 'body') {
        const val = parseInt(hookData.cell.text[0] ?? '0', 10)
        if (val > 0) hookData.cell.styles.textColor = C.nonCompliant
      }
      if (hookData.column.index === 5 && hookData.section === 'body') {
        const val = parseInt(hookData.cell.text[0] ?? '0', 10)
        if (val > 0) hookData.cell.styles.textColor = C.recommendation
      }
    },
  })

  d.y = (d.doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4
}

// ─── Detailed findings per category ───────────────────────────

async function drawCategorySection(
  d: PDFDrawer,
  data: ReportData,
  category: AssetCategory,
  catAssets: InspectionAsset[]
) {
  d.doc.addPage()
  d.y = 14

  const label = ASSET_CATEGORY_LABELS[category]
  drawSectionHeading(d, label, `Code prefix: ${category}-001, ${category}-002, ${category}-003 …`)

  // Asset table (code, location, status, priority)
  const tableRows = catAssets.map((a) => {
    const sc = statusColors(a.status)
    const prioLabel = a.priority ? priorityLabel(a.priority) : '—'
    return [
      { content: a.asset_code, styles: { fontStyle: 'bold', textColor: C.navy, font: 'courier' } },
      a.location_on_site ?? '—',
      { content: sc.label, styles: { fillColor: sc.bg, textColor: sc.text, fontStyle: 'bold', halign: 'center' } },
      { content: prioLabel, styles: {
          fillColor: a.priority ? priorityColors(a.priority).bg : C.white,
          textColor: a.priority ? priorityColors(a.priority).text : C.slate400,
          fontStyle: a.priority ? 'bold' : 'normal', halign: 'center', fontSize: 6.5,
        }
      },
    ]
  })

  autoTable(d.doc, {
    startY: d.y,
    head: [['Asset Code', 'Location on Site', 'Status', 'Priority']],
    body: tableRows,
    margin: { left: M.l, right: M.r },
    styles: { fontSize: 7.5, cellPadding: 2.5, font: 'helvetica' },
    headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: 'bold', fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 72 },
      2: { cellWidth: 44, halign: 'center' },
      3: { cellWidth: 38, halign: 'center' },
    },
    alternateRowStyles: { fillColor: C.slate50 },
  })

  d.y = (d.doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4

  // ── Per-asset detailed findings ──────────────────────────────
  for (const asset of catAssets) {
    await drawAssetDetail(d, data, asset)
  }
}

// ─── Single asset detailed block ──────────────────────────────

async function drawAssetDetail(
  d: PDFDrawer, data: ReportData, asset: InspectionAsset
) {
  const sc   = statusColors(asset.status)
  const photos = data.photosByAsset[asset.id] ?? []

  // Estimate height needed for this block
  const estimatedH = 10 + (asset.finding ? 22 : 0) + (asset.corrective_action ? 14 : 0) + (photos.length > 0 ? 44 : 0)
  d.ensureSpace(estimatedH)

  // Asset code header bar
  d.rect(M.l, d.y, CW, 8, sc.bg, sc.text)
  d.rect(M.l, d.y, 3, 8, sc.text)
  d.text(asset.asset_code, M.l + 5, d.y + 5.5, { size: 9, bold: true, color: sc.text, mono: true })
  d.text(sc.label, A4.w - M.r - 2, d.y + 5.5, { size: 7.5, bold: true, color: sc.text, align: 'right' })

  // Priority badge
  if (asset.priority) {
    const pc = priorityColors(asset.priority)
    d.rect(A4.w - M.r - 36, d.y, 34, 8, pc.bg)
    d.text(priorityLabel(asset.priority), A4.w - M.r - 19, d.y + 5.5,
      { size: 6.5, bold: true, color: pc.text, align: 'center' })
  }

  d.y += 9

  // Location
  if (asset.location_on_site) {
    d.rect(M.l, d.y, CW, 5.5, C.slate100)
    d.text('Location on Site:', M.l + 2, d.y + 3.8, { size: 6.5, bold: true, color: C.slate500 })
    d.text(asset.location_on_site, M.l + 34, d.y + 3.8, { size: 6.5, color: C.slate700 })
    d.y += 6
  }

  // Finding block
  if (asset.finding) {
    d.ensureSpace(4)
    d.rect(M.l, d.y, CW, 5, C.slate100)
    d.rect(M.l, d.y, 2, 5, C.slate400)
    d.text('FINDING', M.l + 4, d.y + 3.5, { size: 6, bold: true, color: C.slate400 })
    d.y += 5

    d.doc.setFontSize(7.5)
    d.doc.setFont('helvetica', 'normal')
    d.setTextColor(C.slate700)
    const lines = d.doc.splitTextToSize(asset.finding, CW - 6)
    const findH = lines.length * 4 + 4
    d.ensureSpace(findH)
    d.rect(M.l, d.y, CW, findH, [250, 252, 255], C.slate200)
    d.doc.text(lines, M.l + 3, d.y + 4)
    d.y += findH + 1
  }

  // Standard referenced
  if (asset.standard_referenced) {
    d.ensureSpace(6)
    d.rect(M.l, d.y, CW, 5.5, C.slate50)
    d.text('Standard Referenced:', M.l + 2, d.y + 3.8, { size: 6.5, bold: true, color: C.slate500 })
    d.text(asset.standard_referenced, M.l + 44, d.y + 3.8, { size: 6.5, color: C.navy, bold: true })
    d.y += 6
  }

  // Corrective action
  if (asset.corrective_action) {
    d.ensureSpace(6)
    d.rect(M.l, d.y, CW, 5, C.nonCompliantBg)
    d.rect(M.l, d.y, 2, 5, C.nonCompliant)
    d.text('CORRECTIVE ACTION', M.l + 4, d.y + 3.5, { size: 6, bold: true, color: C.nonCompliant })
    d.y += 5

    d.doc.setFontSize(7.5)
    d.doc.setFont('helvetica', 'normal')
    d.setTextColor(C.slate700)
    const caLines = d.doc.splitTextToSize(asset.corrective_action, CW - 6)
    const caH = caLines.length * 4 + 4
    d.ensureSpace(caH)
    d.rect(M.l, d.y, CW, caH, [255, 248, 248], C.nonCompliant)
    d.doc.text(caLines, M.l + 3, d.y + 4)
    d.y += caH + 1
  }

  // Photos
  if (photos.length > 0) {
    d.ensureSpace(6)
    d.rect(M.l, d.y, CW, 5, C.slate100)
    d.rect(M.l, d.y, 2, 5, C.orange)
    d.text('PHOTOS', M.l + 4, d.y + 3.5, { size: 6, bold: true, color: C.orange })
    d.y += 6

    const photoW  = 55   // mm
    const photoH  = 42   // mm
    const gutter  = 3    // mm between photos
    const perRow  = Math.floor(CW / (photoW + gutter))
    const rows    = Math.ceil(photos.length / perRow)

    for (let row = 0; row < rows; row++) {
      d.ensureSpace(photoH + 8)
      for (let col = 0; col < perRow; col++) {
        const idx = row * perRow + col
        if (idx >= photos.length) break
        const photo = photos[idx]
        const px = M.l + col * (photoW + gutter)
        const py = d.y

        try {
          const b64 = await loadImageAsBase64(photo.url)
          if (b64) {
            const dims = await getImageDimensions(b64)
            const aspect = dims.w / dims.h
            let drawW = photoW, drawH = photoH

            if (aspect > photoW / photoH) {
              drawH = photoW / aspect
            } else {
              drawW = photoH * aspect
            }

            const offsetX = (photoW - drawW) / 2
            const offsetY = (photoH - drawH) / 2

            // Photo border
            d.rect(px, py, photoW, photoH, C.slate100, C.slate200)
            d.doc.addImage(b64, 'JPEG', px + offsetX, py + offsetY, drawW, drawH, undefined, 'FAST')

            // Photo number badge
            d.rect(px + 1, py + 1, 8, 5, C.navy)
            d.text(`#${idx + 1}`, px + 5, py + 4.5, { size: 5.5, bold: true, color: C.white, align: 'center' })

            // Caption
            if (photo.caption) {
              d.doc.setFontSize(6.5)
              d.doc.setFont('helvetica', 'normal')
              d.setTextColor(C.slate500)
              const capLines = d.doc.splitTextToSize(photo.caption, photoW - 2)
              d.doc.text(capLines[0], px + photoW / 2, py + photoH + 3.5, { align: 'center' })
            }
          }
        } catch { /* skip failed photo */ }
      }
      d.y += photoH + 8
    }
  }

  // Separator between assets
  d.gap(2)
  d.hr(d.y, C.slate200, 0.2)
  d.gap(3)
}

// ─── Recommendations summary page ────────────────────────────

function drawRecommendationsSummary(d: PDFDrawer, data: ReportData) {
  const issueAssets = data.assets.filter(
    (a) => a.status === 'non_compliant' || a.status === 'recommendation'
  )
  if (issueAssets.length === 0) return

  d.doc.addPage()
  d.y = 14

  drawSectionHeading(d, 'Recommendations Summary',
    'All non-compliant and recommendation items consolidated below, grouped by priority.')

  const byPriority: Record<1|2|3, InspectionAsset[]> = { 1: [], 2: [], 3: [] }
  for (const a of issueAssets) {
    const p = (a.priority ?? 3) as 1|2|3
    byPriority[p].push(a)
  }

  const priorityTitles: Record<1|2|3, string> = {
    1: 'PRIORITY 1 — IMMEDIATE ACTION REQUIRED',
    2: 'PRIORITY 2 — ACTION WITHIN 30 DAYS',
    3: 'PRIORITY 3 — PLANNED ACTION',
  }

  for (const p of [1, 2, 3] as const) {
    const grp = byPriority[p]
    if (grp.length === 0) continue

    const pc = priorityColors(p)

    d.ensureSpace(12)
    d.rect(M.l, d.y, CW, 8, pc.bg, pc.text)
    d.rect(M.l, d.y, 3, 8, pc.text)
    d.text(priorityTitles[p], M.l + 5, d.y + 5.5, { size: 8, bold: true, color: pc.text })
    d.y += 9

    const rows = grp.map((a) => [
      { content: a.asset_code, styles: { fontStyle: 'bold', font: 'courier', textColor: C.navy } },
      ASSET_CATEGORY_LABELS[a.category as AssetCategory],
      a.finding ?? '—',
      a.corrective_action ?? '—',
    ])

    autoTable(d.doc, {
      startY: d.y,
      head: [['Asset Code', 'Category', 'Finding', 'Corrective Action']],
      body: rows,
      margin: { left: M.l, right: M.r },
      styles: { fontSize: 7, cellPadding: 2, font: 'helvetica', textColor: C.slate700, overflow: 'linebreak' },
      headStyles: { fillColor: pc.text, textColor: C.white, fontStyle: 'bold', fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 36 },
        2: { cellWidth: 58, overflow: 'linebreak' },
        3: { cellWidth: 66, overflow: 'linebreak' },
      },
      alternateRowStyles: { fillColor: C.slate50 },
    })

    d.y = (d.doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  }
}

// ─── Site Layout page ─────────────────────────────────────────

async function drawSiteLayoutPage(d: PDFDrawer, data: ReportData) {
  d.doc.addPage()
  d.y = 14

  drawSectionHeading(d, 'Site Layout — Aerial Map and Legend',
    `${data.inspection.roof_area_reference ?? ''}  ·  Drawing Scaled: ${data.inspection.drawing_scaled ? 'Yes' : 'No'}`)

  // Aerial map image
  if (data.aerialMapB64) {
    const mapW = CW
    const mapH = 110
    d.ensureSpace(mapH + 4)
    try {
      const dims = await getImageDimensions(data.aerialMapB64)
      const aspect = dims.w / dims.h
      let drawW = mapW, drawH = mapW / aspect
      if (drawH > mapH) { drawH = mapH; drawW = mapH * aspect }

      const offsetX = (mapW - drawW) / 2
      d.rect(M.l, d.y, mapW, mapH, C.slate100, C.slate200)
      d.doc.addImage(data.aerialMapB64, 'JPEG', M.l + offsetX, d.y, drawW, drawH, undefined, 'FAST')
      d.y += mapH + 4
    } catch {
      d.rect(M.l, d.y, CW, mapH, C.slate100, C.slate200)
      d.text('Site plan image could not be loaded', M.l + CW / 2, d.y + mapH / 2,
        { size: 9, color: C.slate400, align: 'center' })
      d.y += mapH + 4
    }
  } else {
    d.rect(M.l, d.y, CW, 30, C.slate100, C.slate200)
    d.text('No aerial site plan uploaded', M.l + CW / 2, d.y + 16,
      { size: 9, color: C.slate400, align: 'center' })
    d.y += 34
  }

  // Asset Code Legend
  drawSectionHeading(d, 'Asset Code Legend')

  const legendItems: [string, string][] = Object.entries(ASSET_CATEGORY_LABELS) as [AssetCategory, string][]

  const colW = CW / 2 - 2
  const rows = Math.ceil(legendItems.length / 2)
  const rowH = 5.5

  for (let i = 0; i < rows; i++) {
    d.ensureSpace(rowH)
    if (i % 2 === 0) d.rect(M.l, d.y, CW, rowH, C.slate50)
    d.hr(d.y, C.slate200, 0.1)

    for (let col = 0; col < 2; col++) {
      const idx = i + col * rows
      if (idx >= legendItems.length) break
      const [code, label] = legendItems[idx]
      const x = M.l + col * (colW + 4)
      d.text(code, x + 1, d.y + 3.8, { size: 7, bold: true, color: C.navy, mono: true })
      d.text(label, x + 16, d.y + 3.8, { size: 7, color: C.slate600 })
    }
    d.y += rowH
  }
  d.gap(2)
}

// ─── Sign-off page ────────────────────────────────────────────

function drawSignOffPage(d: PDFDrawer, data: ReportData) {
  d.doc.addPage()
  d.y = 14

  const { inspection } = data
  const nextDue = inspection.next_recertification_due
    ? format(parseISO(inspection.next_recertification_due), 'dd/MM/yyyy')
    : format(addYears(parseISO(inspection.date_of_inspection), 1), 'dd/MM/yyyy')

  drawSectionHeading(d, 'Inspector Sign-Off')

  const rows: [string, string][] = [
    ['Inspector Name',           data.certifier?.full_name ?? '—'],
    ['Date of Sign-Off',         inspection.inspector_sign_off_date
      ? format(parseISO(inspection.inspector_sign_off_date), 'dd/MM/yyyy')
      : format(new Date(), 'dd/MM/yyyy')],
    ['Next Recertification Due', nextDue],
    ['Report Issued To',         inspection.report_issued_to ?? inspection.client_name],
  ]

  let ky = d.y
  rows.forEach(([label, value], i) => {
    ky = drawKVRow(d, label, value, ky, i % 2 === 0)
  })
  d.y = ky + 2

  // Signature box
  d.gap(4)
  d.rect(M.l, d.y, CW, 22, C.slate50, C.slate200)
  d.text('INSPECTOR SIGNATURE', M.l + 2, d.y + 4.5, { size: 6.5, bold: true, color: C.slate400 })
  if (data.signatureB64) {
    try {
      d.doc.addImage(data.signatureB64, 'PNG', M.l + 2, d.y + 2, 70, 18, undefined, 'FAST')
    } catch { /* skip */ }
  }
  d.y += 26

  // ── Disclaimer ──────────────────────────────────────────────
  d.gap(6)
  d.ensureSpace(40)
  d.rect(M.l, d.y, CW, 36, [240, 244, 255], C.navy)
  d.rect(M.l, d.y, 3, 36, C.navy)
  d.text('DISCLAIMER', M.l + 5, d.y + 6, { size: 8, bold: true, color: C.navy })

  const disclaimer =
    'This report has been prepared for the exclusive use of the client named above and must not be reproduced, ' +
    'distributed, or relied upon by any third party without the written consent of Abseal Pty Ltd. ' +
    'This report reflects conditions at the time of inspection only. Abseal Pty Ltd accepts no liability ' +
    'for changes in condition after the inspection date. The assessment has been conducted in accordance with ' +
    'the applicable Australian Standards as referenced herein. Recommendations contained in this report ' +
    'should be actioned within the specified timeframes to maintain compliance and the safety of persons ' +
    'working at height.'

  d.doc.setFontSize(7.5)
  d.doc.setFont('helvetica', 'normal')
  d.setTextColor(C.slate700)
  const disclaimerLines = d.doc.splitTextToSize(disclaimer, CW - 10)
  d.doc.text(disclaimerLines, M.l + 5, d.y + 13)
  d.y += 40

  // ── Company contact footer block ─────────────────────────────
  d.gap(6)
  d.ensureSpace(30)
  d.rect(M.l, d.y, CW, 26, C.navy)
  d.rect(M.l, d.y, 4, 26, C.orange)

  d.text('Abseal Pty Ltd', M.l + 8, d.y + 8, { size: 12, bold: true, color: C.white })
  d.text('Height Safety Specialists', M.l + 8, d.y + 13.5, { size: 7.5, color: C.orange })
  d.text('P O Box 22, Olinda VIC 3788', M.l + 8, d.y + 19, { size: 7, color: C.slate400 })
  d.text('03 9751 0553  │  0438 757 622  │  office@abseal.com.au',
    M.l + 8, d.y + 23, { size: 7, color: C.slate400 })
  d.y += 30
}

// ─── Main export ─────────────────────────────────────────────

export async function generateAndDownloadReport(
  inspectionId: string,
  onProgress?: ProgressCallback
): Promise<void> {
  onProgress?.(5, 'Fetching inspection data…')

  const data = await fetchReportData(inspectionId)

  onProgress?.(20, 'Building document…')

  // Create jsPDF document
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  })

  // ── Draw all pages ───────────────────────────────────────────

  const drawer = new PDFDrawer(doc)

  // Page 1: Cover + site details + certifier
  drawCoverPage(drawer, data)
  onProgress?.(35, 'Drawing summary table…')

  // Page 2: Inspection summary table
  drawSummaryPage(drawer, data)
  onProgress?.(45, 'Drawing findings…')

  // Category detail pages
  const categoriesWithAssets = ASSET_CATEGORIES.filter((cat) =>
    data.assets.some((a) => a.category === cat)
  )

  const catStep = 20 / Math.max(categoriesWithAssets.length, 1)
  for (let i = 0; i < categoriesWithAssets.length; i++) {
    const cat = categoriesWithAssets[i]
    const catAssets = data.assets.filter((a) => a.category === cat)
    onProgress?.(45 + i * catStep, `Drawing ${ASSET_CATEGORY_LABELS[cat]}…`)
    await drawCategorySection(drawer, data, cat, catAssets)
  }

  onProgress?.(70, 'Drawing recommendations summary…')
  drawRecommendationsSummary(drawer, data)

  onProgress?.(80, 'Drawing site layout…')
  await drawSiteLayoutPage(drawer, data)

  onProgress?.(90, 'Drawing sign-off page…')
  drawSignOffPage(drawer, data)

  // ── Stamp page numbers on all pages ─────────────────────────
  onProgress?.(95, 'Finalising document…')
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    drawPageHeaderFooter(doc, i, totalPages, data.inspection)
  }

  // ── Save / download ──────────────────────────────────────────
  onProgress?.(99, 'Preparing download…')

  const datePart = format(parseISO(data.inspection.date_of_inspection), 'yyyyMMdd')
  const sitePart = data.inspection.site_name.replace(/[^a-z0-9]/gi, '_').slice(0, 30)
  const filename = `Abseal_Recertification_${sitePart}_${datePart}.pdf`

  doc.save(filename)
  onProgress?.(100, 'Done!')
}

// ─── Optional: save PDF blob to Supabase Storage ─────────────

export async function generateAndUploadReport(
  inspectionId: string,
  userId: string,
  onProgress?: ProgressCallback
): Promise<string> {
  onProgress?.(5, 'Fetching inspection data…')
  const data = await fetchReportData(inspectionId)

  // Build as blob
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const drawer = new PDFDrawer(doc)

  drawCoverPage(drawer, data)
  drawSummaryPage(drawer, data)

  const categoriesWithAssets = ASSET_CATEGORIES.filter((cat) =>
    data.assets.some((a) => a.category === cat)
  )
  for (const cat of categoriesWithAssets) {
    const catAssets = data.assets.filter((a) => a.category === cat)
    await drawCategorySection(drawer, data, cat, catAssets)
  }

  drawRecommendationsSummary(drawer, data)
  await drawSiteLayoutPage(drawer, data)
  drawSignOffPage(drawer, data)

  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    drawPageHeaderFooter(doc, i, totalPages, data.inspection)
  }

  onProgress?.(80, 'Uploading to cloud…')

  const datePart = format(parseISO(data.inspection.date_of_inspection), 'yyyyMMdd')
  const sitePart = data.inspection.site_name.replace(/[^a-z0-9]/gi, '_').slice(0, 30)
  const filename = `Abseal_Recertification_${sitePart}_${datePart}.pdf`
  const storagePath = `reports/${inspectionId}/${filename}`

  const blob = doc.output('blob')

  const { error } = await supabase.storage
    .from('reports')
    .upload(storagePath, blob, { contentType: 'application/pdf', upsert: true })

  if (error) throw error

  const { data: urlData } = supabase.storage
    .from('reports')
    .getPublicUrl(storagePath)

  onProgress?.(100, 'Done!')
  return urlData.publicUrl
}
