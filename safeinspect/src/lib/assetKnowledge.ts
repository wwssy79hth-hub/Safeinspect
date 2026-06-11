import type { AssetCategory, AssetStatus } from '@/types/database'

// ─── Standard references per category ────────────────────────

export const CATEGORY_STANDARDS: Record<AssetCategory, string[]> = {
  APS:  ['AS/NZS 1891.4:2009', 'AS 1657-2018'],
  ST:   ['AS/NZS 1891.4:2009', 'AS/NZS 1891.1:2007'],
  TMAP: ['AS/NZS 1891.4:2009', 'AS/NZS 1891.1:2007'],
  CAP:  ['AS/NZS 1891.4:2009', 'AS/NZS 1891.1:2007'],
  HSL:  ['AS/NZS 1891.4:2009', 'AS/NZS 1891.2:2001'],
  VSL:  ['AS/NZS 1891.4:2009', 'AS/NZS 1891.2:2001'],
  LD:   ['AS 1657-2018', 'AS/NZS 1891.4:2009'],
  GR:   ['AS 1657-2018', 'AS/NZS 4994.1:2009'],
  WW:   ['AS 1657-2018'],
  STP:  ['AS 1657-2018'],
  STR:  ['AS 1657-2018'],
  SL:   ['AS 1657-2018', 'AS/NZS 1891.4:2009'],
  EK:   ['AS 1657-2018'],
  PL:   ['AS 1657-2018'],
  GHK:  ['AS 1657-2018'],
  SS:   ['AS/NZS 1891.4:2009', 'AS/NZS ISO 45001:2018'],
  DB:   ['AS 5532-2013', 'AS/NZS 1891.4:2009'],
  RR:   ['AS/NZS 1891.4:2009', 'EN 795:2012'],
  SPM:  ['AS/NZS 4994.1:2009', 'AS 1657-2018'],
  OSE:  ['AS/NZS 1891.4:2009'],
  R:    ['AS/NZS 1891.4:2009', 'AS 1657-2018'],
}

export const DEFAULT_STANDARD = (cat: AssetCategory) =>
  CATEGORY_STANDARDS[cat][0] ?? 'AS/NZS 1891.4:2009'

// ─── Common findings per category per status ─────────────────

export interface FindingSuggestion {
  finding: string
  corrective_action: string
}

export const FINDINGS_BY_CATEGORY: Partial<
  Record<AssetCategory, Partial<Record<AssetStatus, FindingSuggestion[]>>>
> = {
  TMAP: {
    compliant: [
      { finding: 'Anchor point inspected and found to be in satisfactory condition. All fixings secure, no corrosion or damage observed.', corrective_action: '' },
    ],
    non_compliant: [
      { finding: 'Anchor point fixings are loose/missing. Load-bearing capacity cannot be confirmed.', corrective_action: 'Re-torque or replace fixings to manufacturer specification. Re-inspect prior to use.' },
      { finding: 'Significant corrosion observed on anchor point and/or base plate. Structural integrity compromised.', corrective_action: 'Remove from service immediately. Replace anchor point assembly. Re-certify prior to use.' },
      { finding: 'Anchor point deformed/damaged — evidence of shock load applied to system.', corrective_action: 'Remove from service immediately. Full system inspection required. Replace damaged components.' },
      { finding: 'Sealant/waterproofing around anchor base failed. Water ingress risk to substrate.', corrective_action: 'Re-seal anchor base with approved sealant. Inspect substrate for water damage.' },
    ],
    recommendation: [
      { finding: 'Minor surface corrosion noted. No immediate risk but warrants monitoring.', corrective_action: 'Clean and apply corrosion inhibitor. Inspect at next scheduled recertification.' },
      { finding: 'Sealant showing signs of deterioration around base plate.', corrective_action: 'Re-seal anchor base within 30 days to prevent water ingress.' },
    ],
  },
  CAP: {
    compliant: [
      { finding: 'Concrete anchor point inspected and found to be in satisfactory condition. All fixings secure and substrate intact.', corrective_action: '' },
    ],
    non_compliant: [
      { finding: 'Concrete substrate cracking/spalling around anchor point. Structural integrity of fixing compromised.', corrective_action: 'Remove from service. Engage structural engineer to assess substrate. Replace anchor point after repair.' },
      { finding: 'Chemical anchor shows signs of failure — movement detected under load test.', corrective_action: 'Remove from service immediately. Core drill and re-install with approved chemical anchor system.' },
    ],
    recommendation: [
      { finding: 'Minor cracking in concrete surface noted adjacent to anchor. Monitor for progression.', corrective_action: 'Re-inspect in 3 months. Engage structural engineer if cracking progresses.' },
    ],
  },
  HSL: {
    compliant: [
      { finding: 'Horizontal static line system inspected. Wire rope, end terminations, intermediate supports, and tensioner all in satisfactory condition.', corrective_action: '' },
    ],
    non_compliant: [
      { finding: 'Wire rope showing broken strands / bird-caging. System must not be used.', corrective_action: 'Remove from service immediately. Replace wire rope and re-certify system prior to use.' },
      { finding: 'End anchor fixing loose or missing. System integrity compromised.', corrective_action: 'Remove from service. Replace/re-torque end anchor fixings to specification. Re-certify prior to use.' },
      { finding: 'Tensioner inoperable — wire rope slack exceeds permissible limit.', corrective_action: 'Replace tensioner assembly. Re-tension wire rope to manufacturer specification.' },
      { finding: 'Intermediate support bracket damaged/missing. Mid-span loading capacity compromised.', corrective_action: 'Replace damaged/missing intermediate supports. Re-certify system prior to use.' },
    ],
    recommendation: [
      { finding: 'Wire rope showing surface oxidation. No structural impact at this stage.', corrective_action: 'Clean and lubricate wire rope. Re-inspect at next recertification.' },
      { finding: 'Wire rope tension marginally low. Within acceptable range but warrants adjustment.', corrective_action: 'Re-tension wire rope to manufacturer specification within 30 days.' },
    ],
  },
  VSL: {
    compliant: [
      { finding: 'Vertical static line system inspected. Wire rope, energy absorber, top and bottom anchors all in satisfactory condition.', corrective_action: '' },
    ],
    non_compliant: [
      { finding: 'Vertical wire rope damaged — broken strands, kinks, or corrosion present.', corrective_action: 'Remove from service. Replace wire rope and re-certify system prior to use.' },
      { finding: 'Top/bottom anchor fixing insecure.', corrective_action: 'Remove from service. Re-torque fixings to specification. Re-certify prior to use.' },
    ],
    recommendation: [
      { finding: 'Minor surface corrosion on wire rope or fittings.', corrective_action: 'Clean, lubricate and monitor at next recertification.' },
    ],
  },
  GR: {
    compliant: [
      { finding: 'Guardrail system inspected and found to be in satisfactory condition. Posts, rails, and fixings all secure. Height compliant with AS 1657-2018.', corrective_action: '' },
    ],
    non_compliant: [
      { finding: 'Guardrail height non-compliant — below 900mm minimum required by AS 1657-2018.', corrective_action: 'Raise guardrail to minimum 900mm height as per AS 1657-2018 s.3.4. Re-certify prior to use.' },
      { finding: 'Post fixing insecure — movement detected. Fall arrest capacity compromised.', corrective_action: 'Re-torque or replace post fixings to manufacturer specification. Re-certify prior to use.' },
      { finding: 'Significant section of guardrail missing/removed.', corrective_action: 'Do not use roof area beyond this point. Reinstate guardrail immediately.' },
      { finding: 'Guardrail showing significant corrosion — structural integrity compromised.', corrective_action: 'Replace corroded sections. Re-certify prior to use.' },
    ],
    recommendation: [
      { finding: 'Surface corrosion / paint deterioration noted. No structural impact at this stage.', corrective_action: 'Sand, prime and repaint affected areas within 90 days.' },
      { finding: 'Base plate sealant deteriorating — water ingress risk.', corrective_action: 'Re-seal base plates within 30 days.' },
    ],
  },
  LD: {
    compliant: [
      { finding: 'Ladder inspected and found to be in satisfactory condition. Rungs, stiles, fixings, and fall arrest bracket all secure.', corrective_action: '' },
    ],
    non_compliant: [
      { finding: 'Ladder fixing bolts loose or missing. Ladder movement under load.', corrective_action: 'Re-torque or replace fixings to manufacturer specification. Re-certify prior to use.' },
      { finding: 'Rung/stile damaged — structural integrity compromised.', corrective_action: 'Remove from service. Replace damaged components or full ladder. Re-certify prior to use.' },
      { finding: 'Ladder does not extend 1000mm above landing — non-compliant with AS 1657-2018.', corrective_action: 'Extend ladder or install grabrails to achieve 1000mm above landing per AS 1657-2018.' },
    ],
    recommendation: [
      { finding: 'Surface corrosion on ladder components. No structural impact at this stage.', corrective_action: 'Clean and treat with corrosion inhibitor. Monitor at next recertification.' },
    ],
  },
  DB: {
    compliant: [
      { finding: 'Davit base inspected and found to be in satisfactory condition. Fixing secure, sleeve in good order, no corrosion or damage.', corrective_action: '' },
    ],
    non_compliant: [
      { finding: 'Davit base fixing bolts loose or corroded. Load-bearing integrity cannot be confirmed.', corrective_action: 'Remove from service. Replace fixings to manufacturer specification. Re-certify prior to use.' },
      { finding: 'Davit base sleeve damaged or missing. Davit arm cannot be safely installed.', corrective_action: 'Replace damaged/missing sleeve. Re-certify prior to use.' },
    ],
    recommendation: [
      { finding: 'Surface corrosion on davit base. No structural impact at this stage.', corrective_action: 'Clean and treat corrosion. Monitor at next recertification.' },
    ],
  },
  WW: {
    compliant: [
      { finding: 'Walkway inspected and found to be in satisfactory condition. Decking, fixings, and edge protection all secure and in good order.', corrective_action: '' },
    ],
    non_compliant: [
      { finding: 'Walkway decking sections loose/missing. Slip/trip hazard.', corrective_action: 'Replace or re-secure decking sections immediately. Re-certify prior to use.' },
      { finding: 'Walkway fixings loose or corroded. Structural integrity compromised.', corrective_action: 'Replace fixings to manufacturer specification. Re-certify prior to use.' },
    ],
    recommendation: [
      { finding: 'Minor surface corrosion on walkway framing. No structural impact at this stage.', corrective_action: 'Clean and treat with corrosion inhibitor. Monitor at next recertification.' },
    ],
  },
  APS: {
    compliant: [
      { finding: 'Access point signage present, legible and correctly positioned.', corrective_action: '' },
    ],
    non_compliant: [
      { finding: 'Access point signage missing or illegible. Roof workers cannot identify hazards/equipment.', corrective_action: 'Install/replace signage as per AS/NZS 1891.4:2009 requirements. Include anchor system identification and PPE requirements.' },
    ],
    recommendation: [
      { finding: 'Signage showing UV degradation / fading. Content still legible.', corrective_action: 'Replace signage within 30 days to maintain legibility.' },
    ],
  },
  SS: {
    compliant: [
      { finding: 'Safety signage present, legible and correctly positioned.', corrective_action: '' },
    ],
    non_compliant: [
      { finding: 'Safety signage missing/illegible at roof access point.', corrective_action: 'Install compliant safety signage identifying hazards, required PPE, and emergency procedures.' },
    ],
    recommendation: [
      { finding: 'Safety signage showing deterioration. Content still legible.', corrective_action: 'Replace signage within 30 days.' },
    ],
  },
  ST: {
    compliant: [
      { finding: 'Strop(s) inspected. Webbing, stitching, hardware, and labels all in satisfactory condition. Within service life.', corrective_action: '' },
    ],
    non_compliant: [
      { finding: 'Strop webbing damaged — cuts, abrasion, chemical damage or UV degradation present.', corrective_action: 'Remove from service immediately. Replace with compliant strop. Record serial number of replacement.' },
      { finding: 'Strop hardware damaged or non-functional.', corrective_action: 'Remove from service immediately. Replace with compliant strop.' },
      { finding: 'Strop service life expired or label missing/illegible.', corrective_action: 'Remove from service. Replace and document new strop serial number and inspection date.' },
    ],
    recommendation: [
      { finding: 'Strop approaching end of service life — recommend replacement prior to next recertification.', corrective_action: 'Replace strop within 90 days.' },
    ],
  },
  SL: {
    compliant: [
      { finding: 'Step ladder system inspected and found to be in satisfactory condition. Steps, fixings, and handrails all secure.', corrective_action: '' },
    ],
    non_compliant: [
      { finding: 'Step ladder fixings loose or missing. Structural integrity compromised.', corrective_action: 'Re-torque or replace fixings. Re-certify prior to use.' },
    ],
    recommendation: [
      { finding: 'Surface corrosion on step ladder components.', corrective_action: 'Clean and treat. Monitor at next recertification.' },
    ],
  },
  PL: {
    compliant: [
      { finding: 'Platform system inspected and found to be in satisfactory condition. Decking, handrails, and fixings all secure.', corrective_action: '' },
    ],
    non_compliant: [
      { finding: 'Platform decking loose or damaged. Trip hazard present.', corrective_action: 'Replace or re-secure decking immediately. Re-certify prior to use.' },
    ],
    recommendation: [
      { finding: 'Surface corrosion on platform framing. No structural impact at this stage.', corrective_action: 'Clean and treat. Monitor at next recertification.' },
    ],
  },
  EK: {
    compliant: [
      { finding: 'Guardrail entry kit inspected and found to be in satisfactory condition. Gate, hardware, and fixings all secure and functional.', corrective_action: '' },
    ],
    non_compliant: [
      { finding: 'Self-closing gate mechanism not functioning correctly.', corrective_action: 'Repair or replace gate mechanism. Re-certify prior to use.' },
    ],
    recommendation: [
      { finding: 'Gate mechanism showing signs of wear. Still functional.', corrective_action: 'Service gate mechanism within 30 days.' },
    ],
  },
  GHK: {
    compliant: [
      { finding: 'Guardrail hatch kit inspected. Hatch, gate, and fixings all secure and functional.', corrective_action: '' },
    ],
    non_compliant: [
      { finding: 'Hatch gate self-closing mechanism inoperable.', corrective_action: 'Repair or replace hatch gate mechanism. Re-certify prior to use.' },
    ],
    recommendation: [
      { finding: 'Minor wear on hatch mechanism. Still functional.', corrective_action: 'Service within 30 days.' },
    ],
  },
  SPM: {
    compliant: [
      { finding: 'Skylight protection mesh inspected and found to be in satisfactory condition. Mesh, frame, and fixings all secure.', corrective_action: '' },
    ],
    non_compliant: [
      { finding: 'Skylight protection mesh damaged or fixings missing. Fall-through hazard.', corrective_action: 'Remove from service area. Replace mesh and fixings to AS/NZS 4994.1:2009 specification.' },
    ],
    recommendation: [
      { finding: 'Mesh showing signs of corrosion / UV degradation.', corrective_action: 'Replace mesh within 90 days.' },
    ],
  },
  RR: {
    compliant: [
      { finding: 'Rigid rail system inspected and found to be in satisfactory condition. Rail, trolleys, end stops, and fixings all in good order.', corrective_action: '' },
    ],
    non_compliant: [
      { finding: 'Rail fixing brackets loose or missing. System integrity compromised.', corrective_action: 'Remove from service. Re-torque/replace fixings. Re-certify prior to use.' },
    ],
    recommendation: [
      { finding: 'Trolley movement showing minor resistance. System still functional.', corrective_action: 'Lubricate trolleys and inspect rail joints within 30 days.' },
    ],
  },
  STP: {
    compliant: [
      { finding: 'Step-over inspected and found to be in satisfactory condition. Fixings and non-slip surface intact.', corrective_action: '' },
    ],
    non_compliant: [
      { finding: 'Step-over fixings loose or missing.', corrective_action: 'Re-secure fixings to manufacturer specification. Re-certify prior to use.' },
    ],
    recommendation: [
      { finding: 'Non-slip surface showing wear.', corrective_action: 'Replace non-slip surface within 30 days.' },
    ],
  },
  STR: {
    compliant: [
      { finding: 'Stair assembly inspected and found to be in satisfactory condition. Treads, handrails, and fixings all secure.', corrective_action: '' },
    ],
    non_compliant: [
      { finding: 'Stair handrail loose or missing. Fall hazard.', corrective_action: 'Repair or reinstate handrail to AS 1657-2018 specification immediately.' },
    ],
    recommendation: [
      { finding: 'Surface corrosion on stair components.', corrective_action: 'Clean and treat within 90 days.' },
    ],
  },
  OSE: {
    compliant: [
      { finding: 'Other safety equipment inspected and found to be in satisfactory condition.', corrective_action: '' },
    ],
    non_compliant: [
      { finding: 'Equipment damaged/non-functional. Removed from service.', corrective_action: 'Replace or repair equipment to manufacturer specification before returning to service.' },
    ],
    recommendation: [
      { finding: 'Equipment showing signs of wear. Still functional.', corrective_action: 'Service or replace within 90 days.' },
    ],
  },
  R: {
    recommendation: [
      { finding: 'Recommend installation of additional anchor points to improve coverage of this roof area.', corrective_action: 'Obtain quote for installation. Schedule works within planned maintenance program.' },
      { finding: 'Recommend installation of access point signage to assist roof workers.', corrective_action: 'Install compliant signage at roof access point.' },
      { finding: 'Recommend installation of guardrail to protect leading edge.', corrective_action: 'Obtain quote for guardrail installation. Schedule works within planned maintenance program.' },
    ],
  },
}

// ─── Location suggestions per category ───────────────────────

export const LOCATION_SUGGESTIONS: Partial<Record<AssetCategory, string[]>> = {
  TMAP: ['North perimeter', 'South perimeter', 'East perimeter', 'West perimeter', 'Central roof', 'Plant room roof', 'Near HVAC unit', 'Parapet wall', 'Ridge line'],
  CAP:  ['North perimeter', 'South perimeter', 'East perimeter', 'West perimeter', 'Central roof', 'Concrete slab area'],
  HSL:  ['North perimeter run', 'South perimeter run', 'East perimeter run', 'West perimeter run', 'Central spine', 'Plant room area'],
  VSL:  ['North facade', 'South facade', 'East facade', 'West facade', 'Plant room ladder', 'Access hatch ladder'],
  GR:   ['North perimeter', 'South perimeter', 'East perimeter', 'West perimeter', 'Around plant room', 'Around skylight', 'Leading edge'],
  LD:   ['North access point', 'South access point', 'East access point', 'West access point', 'Plant room ladder', 'Parapet ladder'],
  DB:   ['North facade', 'South facade', 'East facade', 'West facade', 'Around building perimeter'],
  WW:   ['North-South walkway', 'East-West walkway', 'Plant room access walkway', 'Perimeter walkway'],
  SL:   ['Roof access hatch', 'Plant room access', 'Parapet crossover', 'Equipment access'],
}
