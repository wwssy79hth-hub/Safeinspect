// ============================================================
// SafeInspect — Database Types
// Generated to match Abseal Recertification Report structure
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ─── Enums ───────────────────────────────────────────────────

export type InspectionStatus =
  | 'draft'
  | 'in_progress'
  | 'completed'
  | 'issued'

export type OverallSiteStatus =
  | 'compliant'
  | 'non_compliant'
  | 'partially_compliant'
  | 'proposed'          // design-stage report — nothing installed yet

/**
 * The kind of report being produced. This drives the document title,
 * the declaration wording and — critically — how asset statuses are
 * presented: a proposed anchor installation has no installed hardware,
 * so its items are reported as PROPOSED, never COMPLIANT.
 */
export type IssueType =
  | 'recertification'
  | 'new_install_verification'
  | 'proposed_anchor_installation'
  | 'non_compliant_follow_up'
  | 'initial_inspection'

export type AssetStatus =
  | 'compliant'
  | 'non_compliant'
  | 'recommendation'
  | 'proposed'          // specified but not yet installed
  | 'n/a'

export type Priority = 1 | 2 | 3

export type UserRole = 'admin' | 'inspector' | 'viewer'

// ─── Asset Category Codes ─────────────────────────────────────

export type AssetCategory =
  | 'APS'   // Access Point Signage
  | 'ST'    // Strops
  | 'TMAP'  // Top Mount Anchor Point
  | 'CAP'   // Concrete Anchor Point
  | 'HSL'   // Horizontal Static Line
  | 'VSL'   // Vertical Static Line
  | 'LD'    // Ladder
  | 'GR'    // Guardrail
  | 'WW'    // Walkway
  | 'STP'   // Step
  | 'STR'   // Stair
  | 'SL'    // Step Ladder
  | 'EK'    // Guardrail Entry Kit
  | 'PL'    // Platform
  | 'GHK'   // Guardrail Hatch Kit
  | 'SS'    // Safety Signage
  | 'DB'    // Davit Base
  | 'RR'    // Rigid Rail System
  | 'SPM'   // Skylight Protection Mesh
  | 'OSE'   // Other Safety Equipment
  | 'R'     // Recommendation

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  APS:  'Access Point Signage',
  ST:   'Strops',
  TMAP: 'Top Mount Anchor Point',
  CAP:  'Concrete Anchor Point',
  HSL:  'Horizontal Static Line',
  VSL:  'Vertical Static Line',
  LD:   'Ladder',
  GR:   'Guardrail',
  WW:   'Walkway',
  STP:  'Step',
  STR:  'Stair',
  SL:   'Step Ladder',
  EK:   'Guardrail Entry Kit',
  PL:   'Platform',
  GHK:  'Guardrail Hatch Kit',
  SS:   'Safety Signage',
  DB:   'Davit Base',
  RR:   'Rigid Rail System',
  SPM:  'Skylight Protection Mesh',
  OSE:  'Other Safety Equipment',
  R:    'Recommendation',
}

export const ASSET_CATEGORIES: AssetCategory[] = Object.keys(
  ASSET_CATEGORY_LABELS
) as AssetCategory[]

// ─── Insert helper ────────────────────────────────────────────

/**
 * Shape accepted by `.insert()`.
 *
 * Only columns the database cannot fill in itself are required: everything
 * that is nullable or carries a DEFAULT (ids, timestamps, status columns)
 * is optional. `Req` lists the columns that must be supplied.
 */
type Insertable<Row, Req extends keyof Row> =
  Pick<Row, Req> & Partial<Omit<Row, Req>>

// ─── Database Table Row Types ─────────────────────────────────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          position: string | null
          accreditation_number: string | null
          role: UserRole
          company: string
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: Insertable<
          Database['public']['Tables']['profiles']['Row'],
          'id' | 'email'
        >
        Update: Partial<Database['public']['Tables']['profiles']['Row']>
        Relationships: []
      }

      inspections: {
        Row: {
          id: string
          job_number: string
          quote_number: string | null
          client_name: string
          site_name: string
          site_address: string
          roof_area_reference: string | null
          date_of_inspection: string
          issue_type: IssueType
          overall_status: OverallSiteStatus | null
          inspection_status: InspectionStatus
          certifier_id: string
          certifier_signature_url: string | null
          inspector_signature_url: string | null
          date_signed: string | null
          inspector_sign_off_date: string | null
          next_recertification_due: string | null
          report_issued_to: string | null
          aerial_map_url: string | null
          drawing_scaled: boolean | null
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string
        }
        Insert: Insertable<
          Database['public']['Tables']['inspections']['Row'],
          | 'job_number' | 'client_name' | 'site_name' | 'site_address'
          | 'date_of_inspection' | 'certifier_id' | 'created_by'
        >
        Update: Partial<Database['public']['Tables']['inspections']['Row']>
        Relationships: []
      }

      inspection_assets: {
        Row: {
          id: string
          inspection_id: string
          category: AssetCategory
          asset_code: string         // e.g. "TMAP-003"
          location_on_site: string | null
          photo_refs: string[]       // array of Storage keys
          status: AssetStatus
          priority: Priority | null
          finding: string | null
          standard_referenced: string | null
          corrective_action: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: Insertable<
          Database['public']['Tables']['inspection_assets']['Row'],
          'inspection_id' | 'category' | 'asset_code'
        >
        Update: Partial<Database['public']['Tables']['inspection_assets']['Row']>
        Relationships: []
      }

      asset_photos: {
        Row: {
          id: string
          inspection_id: string
          asset_id: string
          storage_path: string
          public_url: string | null
          caption: string | null
          sort_order: number
          created_at: string
          uploaded_by: string
        }
        Insert: Insertable<
          Database['public']['Tables']['asset_photos']['Row'],
          'inspection_id' | 'asset_id' | 'storage_path' | 'uploaded_by'
        >
        Update: Partial<Database['public']['Tables']['asset_photos']['Row']>
        Relationships: []
      }

      inspection_summary: {
        Row: {
          id: string
          inspection_id: string
          category: AssetCategory
          total: number
          compliant: number
          non_compliant: number
          updated_at: string
        }
        Insert: Insertable<
          Database['public']['Tables']['inspection_summary']['Row'],
          'inspection_id' | 'category' | 'total' | 'compliant' | 'non_compliant'
        >
        Update: Partial<Database['public']['Tables']['inspection_summary']['Row']>
        Relationships: []
      }
    }

    Views: {
      [_ in never]: never
    }

    Functions: {
      get_inspection_summary: {
        Args: { p_inspection_id: string }
        Returns: {
          category: AssetCategory
          label: string
          total: number
          compliant: number
          non_compliant: number
        }[]
      }
    }

    Enums: {
      asset_status: AssetStatus
      asset_category: AssetCategory
      inspection_status: InspectionStatus
      overall_site_status: OverallSiteStatus
      issue_type: IssueType
      user_role: UserRole
      priority: Priority
    }
  }
}

// ─── Convenience Row Types ───────────────────────────────────

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Inspection = Database['public']['Tables']['inspections']['Row']
export type InspectionAsset = Database['public']['Tables']['inspection_assets']['Row']
export type AssetPhoto = Database['public']['Tables']['asset_photos']['Row']
export type InspectionSummaryRow = Database['public']['Tables']['inspection_summary']['Row']
