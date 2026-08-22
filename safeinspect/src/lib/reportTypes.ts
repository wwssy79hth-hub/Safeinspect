// ============================================================
// SafeInspect — Report Type Configuration
//
// A report can be produced in one of several modes. The mode
// decides the document title, the declaration wording, the
// sign-off wording and how each asset status is presented.
//
// The important rule: a Proposed Anchor Installation report
// describes hardware that does not exist yet. Nothing in it can
// be "compliant" — items are reported as PROPOSED.
// ============================================================

import type { AssetStatus, IssueType, OverallSiteStatus } from '@/types/database'

export interface ReportTypeConfig {
  /** Full name used on the cover badge and in the site details table */
  label: string
  /** Short one-liner shown under the label when choosing a report type */
  description: string
  /** Second line of the cover title block, e.g. "RECERTIFICATION REPORT" */
  documentTitle: string
  /** Text in the navy band at the top of every page */
  runningHeader: string
  /** Filename stem, e.g. Abseal_Recertification_<site>_<date>.pdf */
  filenameStem: string
  /** Declaration paragraph on the cover page */
  declaration: string
  /**
   * True when the report describes work that has not been carried out yet.
   * Proposal reports never present an item as compliant.
   */
  isProposal: boolean
  /** Status a newly added asset starts on for this report type */
  defaultAssetStatus: AssetStatus
  /** Statuses an inspector may pick from for this report type */
  allowedAssetStatuses: AssetStatus[]
  /** Heading of the "good" column in the summary table */
  positiveColumnLabel: string
  /** Label of the overall figure shown above the summary table */
  overallMetricLabel: string
  /** Label used on the sign-off page for the follow-up date */
  nextDateLabel: string
}

const STANDARDS = 'AS/NZS 1891.4:2025, AS 1657-2018, AS/NZS 5532:2013'

export const REPORT_TYPE_CONFIG: Record<IssueType, ReportTypeConfig> = {
  recertification: {
    label: 'Recertification',
    description: 'Annual AS/NZS 1891.4:2025 recertification of an existing system',
    documentTitle: 'RECERTIFICATION REPORT',
    runningHeader: 'HEIGHT SAFETY RECERTIFICATION REPORT',
    filenameStem: 'Recertification',
    declaration:
      'This is a Recertification Assessment of the Height Safety System in Accordance with the ' +
      'inspection, maintenance and storage requirements of AS/NZS 1891.4:2025, and other relevant manufacturer requirements. ' +
      'The report presents a detailed assessment of the Height Safety Systems in place, highlighting areas ' +
      'that require improvement and making recommendations to rectify any non-compliances. Standards referenced: ' +
      `${STANDARDS} and applicable manufacturer requirements.`,
    isProposal: false,
    defaultAssetStatus: 'compliant',
    allowedAssetStatuses: ['compliant', 'non_compliant', 'recommendation', 'n/a'],
    positiveColumnLabel: 'Compliant',
    overallMetricLabel: 'OVERALL COMPLIANCE',
    nextDateLabel: 'Next Recertification Due',
  },

  new_install_verification: {
    label: 'New Installation & Verification',
    description: 'Commissioning and verification of a newly installed system',
    documentTitle: 'INSTALLATION & VERIFICATION REPORT',
    runningHeader: 'HEIGHT SAFETY INSTALLATION & VERIFICATION REPORT',
    filenameStem: 'Installation_Verification',
    declaration:
      'This is an Installation and Verification Assessment of a newly installed Height Safety System, ' +
      'carried out in accordance with the inspection, maintenance and storage requirements of ' +
      'AS/NZS 1891.4:2025, AS/NZS 5532:2013 and the manufacturer’s installation requirements. Each item listed has been installed, ' +
      'load tested where required, and verified as fit for service at the date of this report. Standards referenced: ' +
      `${STANDARDS} and applicable manufacturer requirements.`,
    isProposal: false,
    defaultAssetStatus: 'compliant',
    allowedAssetStatuses: ['compliant', 'non_compliant', 'recommendation', 'n/a'],
    positiveColumnLabel: 'Verified',
    overallMetricLabel: 'INSTALLATION VERIFIED',
    nextDateLabel: 'First Recertification Due',
  },

  proposed_anchor_installation: {
    label: 'Proposed Anchor Installation',
    description: 'Design-stage proposal — items are not yet installed',
    documentTitle: 'PROPOSED ANCHOR INSTALLATION',
    runningHeader: 'PROPOSED ANCHOR INSTALLATION REPORT',
    filenameStem: 'Proposed_Anchor_Installation',
    declaration:
      'This is a Proposed Anchor Installation design for the site named herein. The items listed in this ' +
      'document are PROPOSED and have NOT been installed, load tested or certified at the date of this report. ' +
      'No compliance status is expressed or implied for any proposed item. Proposed positions, quantities and ' +
      'system types have been selected in accordance with ' + STANDARDS + ' and applicable manufacturer ' +
      'requirements, and are subject to on-site verification of the substrate. Following installation, the ' +
      'system must be commissioned, load tested and certified before it is used.',
    isProposal: true,
    defaultAssetStatus: 'proposed',
    allowedAssetStatuses: ['proposed', 'recommendation', 'n/a'],
    positiveColumnLabel: 'Proposed',
    overallMetricLabel: 'PROPOSED SCOPE',
    nextDateLabel: 'Certification Due (after installation)',
  },

  initial_inspection: {
    label: 'Initial Inspection',
    description: 'First-time assessment of an existing site',
    documentTitle: 'INITIAL INSPECTION REPORT',
    runningHeader: 'HEIGHT SAFETY INITIAL INSPECTION REPORT',
    filenameStem: 'Initial_Inspection',
    declaration:
      'This is an Initial Assessment of the Height Safety System in Accordance with the ' +
      'inspection, maintenance and storage requirements of AS/NZS 1891.4:2025, and other relevant manufacturer requirements. ' +
      'The report presents a detailed assessment of the Height Safety Systems in place, highlighting areas ' +
      'that require improvement and making recommendations to rectify any non-compliances. Standards referenced: ' +
      `${STANDARDS} and applicable manufacturer requirements.`,
    isProposal: false,
    defaultAssetStatus: 'compliant',
    allowedAssetStatuses: ['compliant', 'non_compliant', 'recommendation', 'n/a'],
    positiveColumnLabel: 'Compliant',
    overallMetricLabel: 'OVERALL COMPLIANCE',
    nextDateLabel: 'Next Recertification Due',
  },

  non_compliant_follow_up: {
    label: 'Non-Compliant Follow-Up',
    description: 'Revisit after corrective action on a previous report',
    documentTitle: 'NON-COMPLIANT FOLLOW-UP REPORT',
    runningHeader: 'HEIGHT SAFETY FOLLOW-UP REPORT',
    filenameStem: 'Follow_Up',
    declaration:
      'This is a Follow-Up Assessment of the Height Safety System in Accordance with the ' +
      'inspection, maintenance and storage requirements of AS/NZS 1891.4:2025, and other relevant manufacturer requirements. ' +
      'It records the outcome of corrective action taken against previously reported non-compliances. ' +
      `Standards referenced: ${STANDARDS} and applicable manufacturer requirements.`,
    isProposal: false,
    defaultAssetStatus: 'compliant',
    allowedAssetStatuses: ['compliant', 'non_compliant', 'recommendation', 'n/a'],
    positiveColumnLabel: 'Compliant',
    overallMetricLabel: 'OVERALL COMPLIANCE',
    nextDateLabel: 'Next Recertification Due',
  },
}

/** Order the report types are offered in when starting a new job */
export const REPORT_TYPE_ORDER: IssueType[] = [
  'recertification',
  'new_install_verification',
  'proposed_anchor_installation',
  'initial_inspection',
  'non_compliant_follow_up',
]

export function reportTypeConfig(issueType: IssueType | string | null | undefined): ReportTypeConfig {
  return REPORT_TYPE_CONFIG[(issueType as IssueType) ?? 'recertification']
    ?? REPORT_TYPE_CONFIG.recertification
}

export function issueTypeLabel(issueType: IssueType | string | null | undefined): string {
  return reportTypeConfig(issueType).label
}

export function isProposalReport(issueType: IssueType | string | null | undefined): boolean {
  return reportTypeConfig(issueType).isProposal
}

/**
 * The status an item should be *presented* as for a given report type.
 *
 * On a proposed installation nothing has been installed, so anything an
 * inspector left as compliant (or that was carried over from another
 * report type) is shown as PROPOSED instead.
 */
export function displayStatus(
  status: AssetStatus,
  issueType: IssueType | string | null | undefined
): AssetStatus {
  if (!isProposalReport(issueType)) return status
  if (status === 'compliant' || status === 'non_compliant') return 'proposed'
  return status
}

/** Overall site status, adjusted for report type */
export function displayOverallStatus(
  status: OverallSiteStatus | null,
  issueType: IssueType | string | null | undefined
): OverallSiteStatus | null {
  if (isProposalReport(issueType)) return 'proposed'
  return status
}

export function defaultAssetStatusFor(
  issueType: IssueType | string | null | undefined
): AssetStatus {
  return reportTypeConfig(issueType).defaultAssetStatus
}

export function allowedAssetStatusesFor(
  issueType: IssueType | string | null | undefined
): AssetStatus[] {
  return reportTypeConfig(issueType).allowedAssetStatuses
}
