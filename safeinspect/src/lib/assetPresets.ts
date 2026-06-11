import type { AssetCategory } from '@/types/database'

// ─── Finding templates per category ──────────────────────────
// Sourced from the real Anchor Safe report language in the uploaded PDFs

export interface FindingTemplate {
  text: string
  defaultStatus: 'compliant' | 'non_compliant' | 'recommendation'
}

export const FINDING_TEMPLATES: Partial<Record<AssetCategory, FindingTemplate[]>> = {
  TMAP: [
    { text: 'Top mount anchor point is in good condition, securely attached with no signs of corrosion or structural damage.', defaultStatus: 'compliant' },
    { text: 'Top mount anchor point shows signs of corrosion to the base plate and fixing hardware — requires replacement.', defaultStatus: 'non_compliant' },
    { text: 'Top mount anchor point load-bearing capacity cannot be verified — structural assessment recommended.', defaultStatus: 'recommendation' },
    { text: 'Top mount anchor point fixing bolts are loose and require re-torquing to manufacturer specification.', defaultStatus: 'non_compliant' },
    { text: 'Top mount anchor point webbing strap showing UV degradation — strap requires replacement.', defaultStatus: 'non_compliant' },
  ],
  CAP: [
    { text: 'Concrete anchor point is in good condition, core drill mounting is secure with no visible cracking in substrate.', defaultStatus: 'compliant' },
    { text: 'Concrete anchor point substrate shows cracking around the fixing — structural integrity compromised, replacement required.', defaultStatus: 'non_compliant' },
    { text: 'Concrete anchor point stainless hardware in good condition, no signs of corrosion.', defaultStatus: 'compliant' },
    { text: 'Concrete anchor point — unable to verify pull-test certification date. Load test required.', defaultStatus: 'recommendation' },
  ],
  HSL: [
    { text: 'Horizontal static line system is in good condition — wire rope, terminations, intermediate supports and end anchors inspected and serviceable.', defaultStatus: 'compliant' },
    { text: 'Horizontal static line wire rope shows corrosion and broken strands — requires immediate replacement.', defaultStatus: 'non_compliant' },
    { text: 'Horizontal static line intermediate support spacing exceeds maximum allowable — requires additional intermediate anchor.', defaultStatus: 'non_compliant' },
    { text: 'Horizontal static line energy absorber has been deployed — system requires full replacement before re-use.', defaultStatus: 'non_compliant' },
    { text: 'Horizontal static line tensioner requires adjustment to bring wire rope within specified tension range.', defaultStatus: 'recommendation' },
  ],
  VSL: [
    { text: 'Vertical static line is in good condition — rope, sleeve, anchor points and terminations inspected and serviceable.', defaultStatus: 'compliant' },
    { text: 'Vertical static line rope shows wear and fraying — requires immediate replacement.', defaultStatus: 'non_compliant' },
    { text: 'Vertical static line top anchor requires re-fixing — fasteners are inadequately secured.', defaultStatus: 'non_compliant' },
  ],
  GR: [
    { text: 'Guardrail system is in good condition — posts, rails, baseplates and connections are secure and free from damage.', defaultStatus: 'compliant' },
    { text: 'Guardrail system post is damaged/bent and does not meet height requirements under AS 1657-2018.', defaultStatus: 'non_compliant' },
    { text: 'Guardrail system baseplate fixing is loose — requires re-securing to structure.', defaultStatus: 'non_compliant' },
    { text: 'Guardrail system mid-rail missing/damaged — does not comply with AS 1657-2018 barrier requirements.', defaultStatus: 'non_compliant' },
    { text: 'Guardrail system height is below minimum 900 mm requirement per AS 1657-2018.', defaultStatus: 'non_compliant' },
  ],
  LD: [
    { text: 'Ladder is in good condition — rungs, rails, safety cage and mounting are secure and free of corrosion.', defaultStatus: 'compliant' },
    { text: 'Ladder rungs are corroded and show signs of structural weakness — replacement required.', defaultStatus: 'non_compliant' },
    { text: 'Ladder safety cage does not extend to the required height per AS 1657-2018.', defaultStatus: 'non_compliant' },
    { text: 'Ladder does not have a landing platform at the required intervals per AS 1657-2018.', defaultStatus: 'non_compliant' },
  ],
  WW: [
    { text: 'Walkway is in good condition — anti-slip surface, edge protection, and fixings are serviceable.', defaultStatus: 'compliant' },
    { text: 'Walkway anti-slip surface is worn and no longer provides adequate grip — resurfacing required.', defaultStatus: 'non_compliant' },
    { text: 'Walkway fixings are corroded and require replacement.', defaultStatus: 'non_compliant' },
  ],
  DB: [
    { text: 'Davit base is in good condition — socket, base plate and fixings are secure with no signs of corrosion.', defaultStatus: 'compliant' },
    { text: 'Davit base socket shows corrosion — requires treatment and protective coating.', defaultStatus: 'recommendation' },
    { text: 'Davit base fixing bolts are missing/loose — requires immediate rectification.', defaultStatus: 'non_compliant' },
    { text: 'Davit base cover plate is missing — socket exposed to weather and debris ingress.', defaultStatus: 'recommendation' },
  ],
  SL: [
    { text: 'Step ladder crossover system is in good condition — treads, handrails and fixings are serviceable.', defaultStatus: 'compliant' },
    { text: 'Step ladder tread is damaged — anti-slip surface compromised, replacement required.', defaultStatus: 'non_compliant' },
    { text: 'Step ladder handrail is loose — requires re-securing.', defaultStatus: 'non_compliant' },
  ],
  APS: [
    { text: 'Access point signage is clearly legible, correctly positioned and in good condition.', defaultStatus: 'compliant' },
    { text: 'Access point signage is faded/illegible — replacement required.', defaultStatus: 'non_compliant' },
    { text: 'Access point signage is missing — must be installed per AS 1891.4:2009.', defaultStatus: 'non_compliant' },
  ],
  SS: [
    { text: 'Safety signage is clearly legible, correctly positioned and in good condition.', defaultStatus: 'compliant' },
    { text: 'Safety signage is faded and requires replacement.', defaultStatus: 'recommendation' },
    { text: 'Required safety signage is absent — must be installed.', defaultStatus: 'non_compliant' },
  ],
  SPM: [
    { text: 'Skylight protection mesh is in good condition — secure, intact and no signs of corrosion or damage.', defaultStatus: 'compliant' },
    { text: 'Skylight protection mesh has a breach/hole — requires immediate repair or replacement.', defaultStatus: 'non_compliant' },
    { text: 'Skylight protection mesh fixings are corroded — replacement required.', defaultStatus: 'non_compliant' },
  ],
  R: [
    { text: 'Recommend installing additional anchor points to improve fall protection coverage in this area.', defaultStatus: 'recommendation' },
    { text: 'Recommend undertaking a structural assessment prior to next recertification.', defaultStatus: 'recommendation' },
    { text: 'Recommend installing safety signage at this access point.', defaultStatus: 'recommendation' },
  ],
}

// ─── Standard references per category ────────────────────────

export const CATEGORY_STANDARDS: Partial<Record<AssetCategory, string>> = {
  TMAP: 'AS/NZS 1891.4:2009',
  CAP:  'AS/NZS 1891.4:2009',
  HSL:  'AS/NZS 1891.4:2009',
  VSL:  'AS/NZS 1891.4:2009',
  ST:   'AS/NZS 1891.4:2009',
  GR:   'AS 1657-2018',
  LD:   'AS 1657-2018',
  WW:   'AS 1657-2018',
  STP:  'AS 1657-2018',
  STR:  'AS 1657-2018',
  SL:   'AS 1657-2018',
  EK:   'AS 1657-2018',
  PL:   'AS 1657-2018',
  GHK:  'AS 1657-2018',
  DB:   'AS/NZS 1891.4:2009 / AS 5532-2013',
  RR:   'AS/NZS 4488:1997',
  SPM:  'AS/NZS 1891.4:2009',
  APS:  'AS/NZS 1891.4:2009',
  SS:   'AS 1891.4:2009',
  OSE:  'AS/NZS 1891.4:2009',
  R:    'AS/NZS 1891.4:2009',
}

// ─── Default corrective actions per finding type ──────────────

export const CORRECTIVE_ACTION_TEMPLATES = {
  replace:           'Remove from service immediately. Replace with new compliant equipment. Re-inspect upon installation.',
  retorque:          'Re-torque all fixing bolts to manufacturer specified torque values. Re-inspect within 30 days.',
  load_test:         'Conduct destructive load test or obtain engineering certification prior to next use.',
  structural_review: 'Commission structural engineer assessment of substrate prior to next inspection cycle.',
  repaint:           'Remove corrosion, treat with rust converter, apply two coats of primer and two coats of suitable protective paint.',
  reattach:          'Re-secure fixing to structure using appropriate fasteners. Re-inspect upon completion.',
  signage_install:   'Supply and install compliant safety signage as per AS 1891.4:2009 requirements.',
  resurface:         'Remove worn anti-slip surface treatment and re-apply compliant non-slip coating.',
}
