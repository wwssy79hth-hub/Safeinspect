// ============================================================
// SafeInspect — Range label helpers
// A run of grouped point features renders as one label
// ("DB-001 to DB-005"), matching the Anchor Safe drawings.
// ============================================================

import type { PlanFeature, PlanPoint } from '@/types/database'

/** Numeric suffix of an asset code ("TMAP-029" → 29), or null. */
export function codeNumber(code: string): number | null {
  const m = /-(\d+)$/.exec(code)
  return m ? parseInt(m[1], 10) : null
}

/**
 * Label for a group of features: "DB-001 to DB-005" when the codes
 * span a range, the single code when there's one member, and
 * "DB-001 (+3)" as a fallback when codes don't parse.
 */
export function rangeLabel(features: PlanFeature[]): string {
  if (features.length === 0) return ''
  if (features.length === 1) return features[0].label ?? features[0].asset_code

  const numbered = features
    .map((f) => ({ code: f.asset_code, n: codeNumber(f.asset_code) }))
    .filter((x): x is { code: string; n: number } => x.n !== null)
    .sort((a, b) => a.n - b.n)

  if (numbered.length < 2) {
    return `${features[0].asset_code} (+${features.length - 1})`
  }
  return `${numbered[0].code} to ${numbered[numbered.length - 1].code}`
}

/** Anchor point for a group label: topmost member, so the label sits above the run. */
export function groupAnchor(features: PlanFeature[]): PlanPoint | null {
  let best: PlanPoint | null = null
  for (const f of features) {
    const p = f.geometry[0]
    if (!p) continue
    if (!best || p.y < best.y) best = p
  }
  return best
}

/** The member whose label_offset stores the group label's position. */
export function groupLabelOwner(features: PlanFeature[]): PlanFeature {
  return [...features].sort(
    (a, b) => (codeNumber(a.asset_code) ?? 0) - (codeNumber(b.asset_code) ?? 0)
  )[0]
}
