// ============================================================
// SafeInspect — PDF Report Generator
// Produces a professional A4 report matching the Abseal
// Recertification Report template structure exactly.
//
// Stack: jsPDF 2.5.1 + jspdf-autotable 3.8.1
// No html2canvas — pure vector draw for reliability at scale
// ============================================================

import jsPDF from 'jspdf'
import autoTable, { type RowInput } from 'jspdf-autotable'
import { format, parseISO, addMonths } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { resolveStorageUrl, resolveStorageUrls } from '@/lib/storageUrls'
import { loadStandardsData, minIntervalMonthsFor } from '@/lib/standards'
import { ASSET_CATEGORY_LABELS, ASSET_CATEGORIES } from '@/types/database'
import {
  reportTypeConfig, displayStatus, isProposalReport,
  type ReportTypeConfig,
} from '@/lib/reportTypes'
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
  proposed:         [37,  99,  235] as [number, number, number],
  proposedBg:       [219, 234, 254] as [number, number, number],
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
    case 'proposed':       return { bg: C.proposedBg,       text: C.proposed,       label: 'PROPOSED'       }
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

function siteStatusLabel(s: string | null): string {
  if (s === 'compliant')           return 'COMPLIANT'
  if (s === 'non_compliant')       return 'NON-COMPLIANT'
  if (s === 'partially_compliant') return 'PARTIALLY COMPLIANT'
  if (s === 'proposed')            return 'PROPOSED — NOT YET INSTALLED'
  return 'PENDING'
}

/**
 * Status to print for an asset, resolved against the report type.
 * On a proposed anchor installation nothing is installed yet, so no item
 * can be reported as compliant — those items print as PROPOSED.
 */
function assetStatus(asset: InspectionAsset, inspection: Inspection): AssetStatus {
  return displayStatus(asset.status as AssetStatus, inspection.issue_type)
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
  /** Report-type driven wording + status presentation rules */
  reportType: ReportTypeConfig
  /**
   * Tightest inspection interval across the categories present,
   * from the inspection_rules table (null when unavailable —
   * falls back to 12 months).
   */
  minIntervalMonths: number | null
}

async function fetchReportData(inspectionId: string): Promise<ReportData> {
  const [inspRes, assetsRes] = await Promise.all([
    supabase.from('inspections').select('*').eq('id', inspectionId).single(),
    supabase.from('inspection_assets').select('*')
      .eq('inspection_id', inspectionId)
      .order('category').order('sort_order'),
  ])

  if (inspRes.error) throw inspRes.error
  const inspection = inspRes.data as Inspection

  // Certifier profile
  const { data: certifier } = await supabase
    .from('profiles').select('*').eq('id', inspection.certifier_id).single()

  // Photos for all assets
  const { data: photos } = await supabase
    .from('asset_photos').select('*')
    .eq('inspection_id', inspectionId)
    .order('sort_order')

  // The buckets are private — batch-sign photo paths for embedding
  const photoRows = photos ?? []
  const signedPhotoUrls = await resolveStorageUrls(
    'inspection-photos',
    photoRows.map((p) => p.storage_path)
  )

  const photosByAsset: Record<string, Array<{ url: string; caption: string | null }>> = {}
  for (const p of photoRows) {
    const url = signedPhotoUrls.get(p.storage_path) ?? p.public_url
    if (!url) continue
    if (!photosByAsset[p.asset_id]) photosByAsset[p.asset_id] = []
    photosByAsset[p.asset_id].push({ url, caption: p.caption })
  }

  // Load aerial map
  let aerialMapB64: string | null = null
  if (inspection.aerial_map_url) {
    const url = await resolveStorageUrl('aerial-maps', inspection.aerial_map_url)
    if (url) aerialMapB64 = await loadImageAsBase64(url)
  }

  // Load certifier signature
  let signatureB64: string | null = null
  if (inspection.certifier_signature_url) {
    const url = await resolveStorageUrl('signatures', inspection.certifier_signature_url)
    if (url) signatureB64 = await loadImageAsBase64(url)
  }

  // Interval from the standards rules for the categories present
  const assets = assetsRes.data ?? []
  const categories = [...new Set(assets.map((a) => a.category))]
  const standardsData = await loadStandardsData()
  const minIntervalMonths = minIntervalMonthsFor(standardsData, categories)

  return {
    inspection,
    certifier: certifier ?? null,
    assets,
    photosByAsset,
    aerialMapB64,
    signatureB64,
    reportType: reportTypeConfig(inspection.issue_type),
    minIntervalMonths,
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
  d.text(reportTypeConfig(inspection.issue_type).runningHeader, A4.w / 2, 7,
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
  const { inspection, certifier, reportType } = data

  d.y = 14  // start below global header band

  // ── Hero band ───────────────────────────────────────────────
  d.rect(M.l, d.y, CW, 48, C.navy)

  // Decorative orange accent strip
  d.rect(M.l, d.y, 4, 48, C.orange)

  // Report type badge — widened to fit the longer report type names
  const badgeW = 78
  d.rect(M.l + 8, d.y + 6, badgeW, 8, reportType.isProposal ? C.proposed : C.orange)
  d.text(reportType.label.toUpperCase(),
    M.l + 8 + badgeW / 2, d.y + 11.2, { size: 7.5, bold: true, color: C.white, align: 'center' })

  // Main title
  d.text('HEIGHT SAFETY', M.l + 8, d.y + 23, { size: 20, bold: true, color: C.white })
  d.text(reportType.documentTitle, M.l + 8, d.y + 32, { size: 13, bold: true, color: C.orange })

  // Standards line
  d.text('AS/NZS 1891.4:2025  │  AS 1657-2018  │  AS/NZS 5532:2013',
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

  // ── Proposal notice ──────────────────────────────────────────
  // Nothing in a proposal has been installed, so say so up front.
  if (reportType.isProposal) {
    d.ensureSpace(16)
    d.rect(M.l, d.y, CW, 13, C.proposedBg, C.proposed)
    d.rect(M.l, d.y, 3, 13, C.proposed)
    d.text('PROPOSED INSTALLATION — NOT YET INSTALLED', M.l + 6, d.y + 5,
      { size: 8, bold: true, color: C.proposed })
    d.text('All items in this report are proposed. They have not been installed, load tested or certified.',
      M.l + 6, d.y + 9.8, { size: 7, color: C.slate700 })
    d.y += 17
  }

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
    ['Report Type',          reportType.label],
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
  // Box height follows the text — declarations differ per report type.
  const declText = reportType.declaration
  d.doc.setFontSize(7)
  d.doc.setFont('helvetica', 'normal')
  const splitDecl = d.doc.splitTextToSize(declText, CW - 8)
  const declH = splitDecl.length * 3.2 + 9

  d.ensureSpace(declH + 4)
  d.gap(3)
  const accent = reportType.isProposal ? C.proposed : C.navy
  d.rect(M.l, d.y, CW, declH, reportType.isProposal ? C.proposedBg : [240, 244, 255], accent)
  d.rect(M.l, d.y, 3, declH, accent)
  d.text('DECLARATION', M.l + 5, d.y + 5, { size: 7.5, bold: true, color: accent })
  d.doc.setFontSize(7)
  d.doc.setFont('helvetica', 'normal')
  d.setTextColor(C.slate700)
  d.doc.text(splitDecl, M.l + 5, d.y + 10)
  d.y += declH + 3
}

// ─── PAGE 2: Inspection Summary ───────────────────────────────

function drawSummaryPage(d: PDFDrawer, data: ReportData) {
  d.doc.addPage()
  d.y = 14

  const { assets, inspection, reportType } = data
  const proposal = reportType.isProposal

  // Compute per-category counts against the *displayed* status, so a
  // proposal counts proposed items rather than claiming compliance.
  const catMap = new Map<AssetCategory, { total:number; positive:number; non_compliant:number; recommendation:number }>()
  for (const asset of assets) {
    const cat = asset.category as AssetCategory
    if (!catMap.has(cat)) catMap.set(cat, { total: 0, positive: 0, non_compliant: 0, recommendation: 0 })
    const st = assetStatus(asset, inspection)
    const s = catMap.get(cat)!
    s.total++
    if (st === (proposal ? 'proposed' : 'compliant')) s.positive++
    if (st === 'non_compliant')  s.non_compliant++
    if (st === 'recommendation') s.recommendation++
  }

  const displayed    = assets.map((a) => assetStatus(a, inspection))
  const totalAll     = assets.length
  const positiveAll  = displayed.filter((st) => st === (proposal ? 'proposed' : 'compliant')).length
  const ncAll        = displayed.filter((st) => st === 'non_compliant').length
  const recAll       = displayed.filter((st) => st === 'recommendation').length
  const compliancePct = totalAll > 0 ? Math.round((positiveAll / totalAll) * 100) : 0

  drawSectionHeading(d,
    proposal ? 'Proposed Item Summary' : 'Inspection Item Summary',
    `${inspection.site_name}  ·  ${format(parseISO(inspection.date_of_inspection), 'd MMMM yyyy')}`)

  // Headline metric. A proposal has no compliance to report, so it shows
  // the size of the proposed scope instead of a compliance percentage.
  d.ensureSpace(20)
  d.rect(M.l, d.y, CW, 16, C.slate50, C.slate200)

  d.text(reportType.overallMetricLabel, M.l + 2, d.y + 6, { size: 7, bold: true, color: C.navy })

  if (proposal) {
    d.text(`${positiveAll} proposed item${positiveAll === 1 ? '' : 's'}`, M.l + 2, d.y + 12,
      { size: 9, bold: true, color: C.proposed })
    d.text('No compliance status is reported — none of these items have been installed or certified yet.',
      M.l + 44, d.y + 9.5, { size: 6.5, color: C.slate500, maxW: CW - 48 })
  } else {
    const barX = M.l + 44, barW = CW - 48, barH = 5, barY = d.y + 5.5
    d.rect(barX, barY, barW, barH, C.slate200)
    const fillW = Math.max(1, (compliancePct / 100) * barW)
    d.rect(barX, barY, fillW, barH,
      compliancePct >= 80 ? C.compliant : compliancePct >= 50 ? C.recommendation : C.nonCompliant)

    d.text(`${compliancePct}%`, M.l + 2, d.y + 12, { size: 9, bold: true,
      color: compliancePct >= 80 ? C.compliant : compliancePct >= 50 ? C.recommendation : C.nonCompliant })
    d.text(`${totalAll} items  ·  ${positiveAll} ${reportType.positiveColumnLabel.toLowerCase()}  ·  ${ncAll} non-compliant  ·  ${recAll} recommendations`,
      barX, d.y + 13.5, { size: 6.5, color: C.slate500 })
  }
  d.y += 20

  // Overall site status
  const osStatus = proposal ? 'proposed' : inspection.overall_status
  const osCols = osStatus === 'proposed' ? { bg: C.proposedBg, text: C.proposed } :
                 osStatus === 'compliant' ? { bg: C.compliantBg, text: C.compliant } :
                 osStatus === 'non_compliant' ? { bg: C.nonCompliantBg, text: C.nonCompliant } :
                 { bg: C.recommendationBg, text: C.recommendation }
  d.gap(2)
  d.rect(M.l, d.y, CW, 8, osCols.bg, osCols.text)
  d.text(proposal ? 'PROPOSAL STATUS:' : 'OVERALL SITE STATUS:', M.l + 3, d.y + 5.5,
    { size: 8, bold: true, color: osCols.text })
  d.text(siteStatusLabel(osStatus), M.l + 50, d.y + 5.5, { size: 8, bold: true, color: osCols.text })
  d.y += 10

  // Summary table. A proposal has no compliance to tally, so the
  // non-compliant column is dropped rather than printed as a row of zeros.
  const ncColIdx = proposal ? -1 : 4
  const recColIdx = proposal ? 4 : 5

  const tableRows: RowInput[] = []
  for (const cat of ASSET_CATEGORIES) {
    const s = catMap.get(cat)
    if (!s) continue   // skip categories with no items
    tableRows.push([
      ASSET_CATEGORY_LABELS[cat],
      cat,
      String(s.total),
      String(s.positive),
      ...(proposal ? [] : [String(s.non_compliant)]),
      String(s.recommendation),
    ])
  }

  // Totals row
  const positiveTint: [number, number, number] = proposal ? [170, 205, 255] : [180, 255, 180]
  const totalCell = (value: number, tint: [number, number, number]) => ({
    content: String(value),
    styles: {
      fontStyle: 'bold' as const, fillColor: C.navy, textColor: tint,
      halign: 'center' as const,
    },
  })
  tableRows.push([
    { content: 'TOTALS', styles: { fontStyle: 'bold', fillColor: C.navy, textColor: C.white } },
    { content: '',       styles: { fillColor: C.navy } },
    totalCell(totalAll, C.white),
    totalCell(positiveAll, positiveTint),
    ...(proposal ? [] : [totalCell(ncAll, ncAll > 0 ? [255, 160, 160] : positiveTint)]),
    totalCell(recAll, recAll > 0 ? [255, 220, 120] : positiveTint),
  ])

  // Fresh object per column — autoTable mutates the style objects it is given
  const countCol = () => ({
    // Widths must sum to the content width (62 + 18 + 18 + counts = 182mm)
    cellWidth: proposal ? 42 : 28, halign: 'center' as const, fontStyle: 'bold' as const,
  })

  autoTable(d.doc, {
    startY: d.y,
    head: [[
      'Category', 'Code', 'Total', reportType.positiveColumnLabel,
      ...(proposal ? [] : ['Non-Compliant']), 'Recommendation',
    ]],
    body: tableRows,
    margin: { left: M.l, right: M.r },
    styles: { fontSize: 7.5, cellPadding: 2.5, font: 'helvetica', textColor: C.slate700 },
    headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
    columnStyles: {
      0: { cellWidth: 62, halign: 'left' },
      1: { cellWidth: 18, halign: 'center', font: 'courier', fontSize: 7, textColor: C.navy },
      2: { cellWidth: 18, halign: 'center' },
      3: { ...countCol(), textColor: proposal ? C.proposed : C.compliant },
      4: countCol(),
      ...(proposal ? {} : { 5: countCol() }),
    },
    alternateRowStyles: { fillColor: C.slate50 },
    didParseCell: (hookData) => {
      if (hookData.section !== 'body') return
      const val = parseInt(hookData.cell.text[0] ?? '0', 10)
      if (hookData.column.index === ncColIdx && val > 0) {
        hookData.cell.styles.textColor = C.nonCompliant
      }
      if (hookData.column.index === recColIdx && val > 0) {
        hookData.cell.styles.textColor = C.recommendation
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
  drawSectionHeading(d,
    data.reportType.isProposal ? `${label} — Proposed` : label,
    `Code prefix: ${category}-001, ${category}-002, ${category}-003 …`)

  // Asset table (code, location, status, priority)
  const tableRows: RowInput[] = catAssets.map((a) => {
    const sc = statusColors(assetStatus(a, data.inspection))
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
  const sc     = statusColors(assetStatus(asset, data.inspection))
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
    d.text(data.reportType.isProposal ? 'PROPOSAL NOTES' : 'FINDING',
      M.l + 4, d.y + 3.5, { size: 6, bold: true, color: C.slate400 })
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

  // Corrective action — on a proposal this is the proposed scope of works
  if (asset.corrective_action) {
    const caAccent = data.reportType.isProposal ? C.proposed : C.nonCompliant
    const caAccentBg = data.reportType.isProposal ? C.proposedBg : C.nonCompliantBg
    d.ensureSpace(6)
    d.rect(M.l, d.y, CW, 5, caAccentBg)
    d.rect(M.l, d.y, 2, 5, caAccent)
    d.text(data.reportType.isProposal ? 'PROPOSED WORKS' : 'CORRECTIVE ACTION',
      M.l + 4, d.y + 3.5, { size: 6, bold: true, color: caAccent })
    d.y += 5

    d.doc.setFontSize(7.5)
    d.doc.setFont('helvetica', 'normal')
    d.setTextColor(C.slate700)
    const caLines = d.doc.splitTextToSize(asset.corrective_action, CW - 6)
    const caH = caLines.length * 4 + 4
    d.ensureSpace(caH)
    d.rect(M.l, d.y, CW, caH,
      data.reportType.isProposal ? [248, 250, 255] : [255, 248, 248], caAccent)
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
  const issueAssets = data.assets.filter((a) => {
    const st = assetStatus(a, data.inspection)
    return st === 'non_compliant' || st === 'recommendation'
  })
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

    const rows: RowInput[] = grp.map((a) => [
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

// ─── Proposed installation schedule ───────────────────────────
// Replaces the compliance-oriented summary on a proposal: a plain
// schedule of everything being proposed, ready to price and install.

function drawProposedScheduleSummary(d: PDFDrawer, data: ReportData) {
  const proposedAssets = data.assets.filter(
    (a) => assetStatus(a, data.inspection) === 'proposed'
  )
  if (proposedAssets.length === 0) return

  d.doc.addPage()
  d.y = 14

  drawSectionHeading(d, 'Proposed Installation Schedule',
    'Every item proposed for installation at this site. None of these items are installed or certified yet.')

  const rows = proposedAssets.map((a) => [
    { content: a.asset_code, styles: { fontStyle: 'bold' as const, font: 'courier', textColor: C.navy } },
    ASSET_CATEGORY_LABELS[a.category as AssetCategory],
    a.location_on_site ?? '—',
    a.corrective_action || a.finding || '—',
    { content: 'PROPOSED', styles: {
        fillColor: C.proposedBg, textColor: C.proposed,
        fontStyle: 'bold' as const, halign: 'center' as const, fontSize: 6.5,
      }
    },
  ])

  autoTable(d.doc, {
    startY: d.y,
    head: [['Asset Code', 'Category', 'Proposed Location', 'Proposed Works / Notes', 'Status']],
    body: rows,
    margin: { left: M.l, right: M.r },
    styles: { fontSize: 7, cellPadding: 2, font: 'helvetica', textColor: C.slate700, overflow: 'linebreak' },
    headStyles: { fillColor: C.proposed, textColor: C.white, fontStyle: 'bold', fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 34 },
      2: { cellWidth: 40, overflow: 'linebreak' },
      3: { cellWidth: 62, overflow: 'linebreak' },
      4: { cellWidth: 24, halign: 'center' },
    },
    alternateRowStyles: { fillColor: C.slate50 },
  })

  d.y = (d.doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6

  // Closing note — the proposal is not a certification
  d.ensureSpace(20)
  d.rect(M.l, d.y, CW, 16, C.proposedBg, C.proposed)
  d.rect(M.l, d.y, 3, 16, C.proposed)
  d.text('NEXT STEPS', M.l + 6, d.y + 5, { size: 7.5, bold: true, color: C.proposed })
  d.doc.setFontSize(7)
  d.doc.setFont('helvetica', 'normal')
  d.setTextColor(C.slate700)
  const note = d.doc.splitTextToSize(
    'On acceptance, the proposed items above are to be installed to the manufacturer’s specification, ' +
    'load tested where required, and certified under an Installation & Verification report before the ' +
    'system is used. Substrate suitability is to be confirmed on site prior to installation.',
    CW - 10
  )
  d.doc.text(note, M.l + 6, d.y + 9)
  d.y += 20
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

  const { inspection, reportType } = data
  // A proposal has no installed system to schedule a recertification for —
  // the clock only starts once the proposed items are installed.
  // Interval comes from the inspection_rules table (tightest rule
  // across the categories present); 12 months is the fallback when
  // the standards data is unavailable.
  const intervalMonths = data.minIntervalMonths ?? 12
  const nextDue = reportType.isProposal
    ? `${intervalMonths} months from installation`
    : inspection.next_recertification_due
      ? format(parseISO(inspection.next_recertification_due), 'dd/MM/yyyy')
      : format(addMonths(parseISO(inspection.date_of_inspection), intervalMonths), 'dd/MM/yyyy')

  drawSectionHeading(d, reportType.isProposal ? 'Prepared By' : 'Inspector Sign-Off')

  const rows: [string, string][] = [
    [reportType.isProposal ? 'Prepared By' : 'Inspector Name', data.certifier?.full_name ?? '—'],
    [reportType.isProposal ? 'Date Prepared' : 'Date of Sign-Off',
      inspection.inspector_sign_off_date
        ? format(parseISO(inspection.inspector_sign_off_date), 'dd/MM/yyyy')
        : format(new Date(), 'dd/MM/yyyy')],
    [reportType.nextDateLabel,   nextDue],
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
  d.text(reportType.isProposal ? 'SIGNATURE' : 'INSPECTOR SIGNATURE',
    M.l + 2, d.y + 4.5, { size: 6.5, bold: true, color: C.slate400 })
  if (data.signatureB64) {
    try {
      d.doc.addImage(data.signatureB64, 'PNG', M.l + 2, d.y + 2, 70, 18, undefined, 'FAST')
    } catch { /* skip */ }
  }
  d.y += 26

  // ── Disclaimer ──────────────────────────────────────────────
  d.gap(6)

  const proposalDisclaimer =
    'This document is a proposal for a height safety installation and is NOT a certification. None of the items ' +
    'described have been installed, load tested or certified at the date of this document, and no compliance ' +
    'status is expressed or implied for any of them. Proposed positions and quantities are subject to on-site ' +
    'verification of the substrate and may change during installation. The system must not be used until it has ' +
    'been installed, commissioned and certified. This document has been prepared for the exclusive use of the ' +
    'client named above and must not be reproduced, distributed, or relied upon by any third party without the ' +
    'written consent of Abseal Pty Ltd.'

  const disclaimer = reportType.isProposal ? proposalDisclaimer :
    'This report has been prepared for the exclusive use of the client named above and must not be reproduced, ' +
    'distributed, or relied upon by any third party without the written consent of Abseal Pty Ltd. ' +
    'This report reflects conditions at the time of inspection only. Abseal Pty Ltd accepts no liability ' +
    'for changes in condition after the inspection date. The assessment has been conducted in accordance with ' +
    'the applicable Australian Standards as referenced herein. Recommendations contained in this report ' +
    'should be actioned within the specified timeframes to maintain compliance and the safety of persons ' +
    'working at height.'

  d.doc.setFontSize(7.5)
  d.doc.setFont('helvetica', 'normal')
  const disclaimerLines = d.doc.splitTextToSize(disclaimer, CW - 10)
  const discH = disclaimerLines.length * 3.4 + 12

  d.ensureSpace(discH + 4)
  const discAccent = reportType.isProposal ? C.proposed : C.navy
  d.rect(M.l, d.y, CW, discH, reportType.isProposal ? C.proposedBg : [240, 244, 255], discAccent)
  d.rect(M.l, d.y, 3, discH, discAccent)
  d.text('DISCLAIMER', M.l + 5, d.y + 6, { size: 8, bold: true, color: discAccent })

  d.doc.setFontSize(7.5)
  d.doc.setFont('helvetica', 'normal')
  d.setTextColor(C.slate700)
  d.doc.text(disclaimerLines, M.l + 5, d.y + 13)
  d.y += discH + 4

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

  if (data.reportType.isProposal) {
    onProgress?.(75, 'Drawing proposed installation schedule…')
    drawProposedScheduleSummary(drawer, data)
  }

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
  const filename = `Abseal_${data.reportType.filenameStem}_${sitePart}_${datePart}.pdf`

  doc.save(filename)
  onProgress?.(100, 'Done!')
}

// ─── Optional: save PDF blob to Supabase Storage ─────────────

export async function generateAndUploadReport(
  inspectionId: string,
  userId: string,
  onProgress?: ProgressCallback
): Promise<{ url: string; storagePath: string }> {
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
  if (data.reportType.isProposal) drawProposedScheduleSummary(drawer, data)
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
  const filename = `Abseal_${data.reportType.filenameStem}_${sitePart}_${datePart}.pdf`
  const storagePath = `${inspectionId}/${filename}`

  const blob = doc.output('blob')

  const { error } = await supabase.storage
    .from('reports')
    .upload(storagePath, blob, { contentType: 'application/pdf', upsert: true })

  if (error) throw error

  // The bucket is private — hand back a signed URL for the
  // "Open report" link.
  const signedUrl = await resolveStorageUrl('reports', storagePath)
  if (!signedUrl) throw new Error('Report uploaded but could not create a link')

  onProgress?.(100, 'Done!')
  return { url: signedUrl, storagePath }
}
