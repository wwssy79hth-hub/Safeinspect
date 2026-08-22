// ============================================================
// SafeInspect — Standards service
//
// Reads the standards / asset_classes / inspection_rules tables
// (migration 004) so intervals, editions and referenced-standard
// labels are data, not hard-coded strings. Falls back to the
// static CATEGORY_STANDARDS map when the tables are unavailable
// (e.g. the migration has not been applied yet).
// ============================================================

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { CATEGORY_STANDARDS, DEFAULT_STANDARD } from '@/lib/inspection-data'
import type {
  AssetCategory,
  StandardRow,
  AssetClassRow,
  InspectionRuleRow,
} from '@/types/database'

export interface StandardsData {
  standards: StandardRow[]
  assetClasses: AssetClassRow[]
  rules: InspectionRuleRow[]
}

// ─── Load & cache ─────────────────────────────────────────────

let cache: Promise<StandardsData | null> | null = null

export function loadStandardsData(): Promise<StandardsData | null> {
  if (!cache) {
    cache = (async () => {
      try {
        const [standards, assetClasses, rules] = await Promise.all([
          supabase.from('standards').select('*'),
          supabase.from('asset_classes').select('*'),
          supabase.from('inspection_rules').select('*'),
        ])
        if (standards.error || assetClasses.error || rules.error) return null
        if (!standards.data?.length || !rules.data?.length) return null
        return {
          standards: standards.data,
          assetClasses: assetClasses.data ?? [],
          rules: rules.data,
        }
      } catch {
        return null
      }
    })()
  }
  return cache
}

/** React hook — null until loaded (or when the tables are absent). */
export function useStandards(): StandardsData | null {
  const [data, setData] = useState<StandardsData | null>(null)
  useEffect(() => {
    let alive = true
    loadStandardsData().then((d) => { if (alive) setData(d) })
    return () => { alive = false }
  }, [])
  return data
}

// ─── Rule resolution (mirrors public.applicable_rule) ─────────

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function standardInForce(data: StandardsData, code: string, edition: string, on: string): boolean {
  const s = data.standards.find((x) => x.code === code && x.edition === edition)
  if (!s) return false
  return s.effective_from <= on && (!s.superseded_from || s.superseded_from > on)
}

/**
 * The rule applicable to a category on a date, preferring an
 * exact service-condition match, then the latest edition in force.
 */
export function applicableRule(
  data: StandardsData,
  category: AssetCategory,
  condition: 'standard' | 'harsh' = 'standard',
  on: string = isoToday()
): InspectionRuleRow | null {
  const candidates = data.rules.filter(
    (r) =>
      r.asset_class_code === category &&
      r.effective_from <= on &&
      (r.service_condition === condition || r.service_condition === 'standard') &&
      standardInForce(data, r.standard_code, r.standard_edition, on)
  )
  candidates.sort((a, b) => {
    const exactA = a.service_condition === condition ? 1 : 0
    const exactB = b.service_condition === condition ? 1 : 0
    if (exactA !== exactB) return exactB - exactA
    return b.effective_from.localeCompare(a.effective_from)
  })
  return candidates[0] ?? null
}

/**
 * Display label for a (code, edition) pair, following the
 * convention already used across the app: AS/NZS codes take a
 * colon ("AS/NZS 1891.4:2025"), plain AS codes a hyphen
 * ("AS 1657-2018").
 */
export function standardLabel(code: string, edition: string): string {
  return code.startsWith('AS/NZS') ? `${code}:${edition}` : `${code}-${edition}`
}

/**
 * The current referenced-standard label for a category — from the
 * rules when available, else the static fallback.
 */
export function currentStandardLabelFor(
  data: StandardsData | null,
  category: AssetCategory
): string {
  if (data) {
    const rule = applicableRule(data, category)
    if (rule) return standardLabel(rule.standard_code, rule.standard_edition)
  }
  return CATEGORY_STANDARDS[category]?.[0] ?? DEFAULT_STANDARD
}

/**
 * Options for the "Standard Referenced" select: the category's
 * applicable rule first, then every standard currently in force,
 * then the static fallbacks (deduplicated, order-preserving).
 */
export function standardOptionsFor(
  data: StandardsData | null,
  category: AssetCategory
): string[] {
  const options: string[] = []
  const push = (s: string) => { if (s && !options.includes(s)) options.push(s) }

  if (data) {
    const rule = applicableRule(data, category)
    if (rule) push(standardLabel(rule.standard_code, rule.standard_edition))
    const today = isoToday()
    for (const s of data.standards) {
      if (s.effective_from <= today && (!s.superseded_from || s.superseded_from > today)) {
        push(standardLabel(s.code, s.edition))
      }
    }
  }
  for (const s of CATEGORY_STANDARDS[category] ?? []) push(s)
  push(DEFAULT_STANDARD)
  return options
}

/**
 * The tightest (minimum) inspection interval across a set of
 * categories — this is what drives the site's next
 * recertification date (HeightTrack: certificate expiry = the
 * earliest asset due date). Null when no rule matches.
 */
export function minIntervalMonthsFor(
  data: StandardsData | null,
  categories: AssetCategory[]
): number | null {
  if (!data) return null
  let min: number | null = null
  for (const cat of categories) {
    const rule = applicableRule(data, cat)
    if (rule && (min === null || rule.interval_months < min)) {
      min = rule.interval_months
    }
  }
  return min
}
