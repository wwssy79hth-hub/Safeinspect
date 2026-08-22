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

export type ServiceCondition = 'standard' | 'harsh'

/** Durable registry asset lifecycle (distinct from per-visit AssetStatus) */
export type RegistryAssetStatus = 'active' | 'do_not_use' | 'removed'

export type AlertKind = 'recert_due' | 'recert_overdue' | 'certificate_expiring'

export type TestMethod =
  | 'proof_load'
  | 'documentation_review'
  | 'functional_test'
  | 'visual_inspection'

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
          site_id: string | null
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
          asset_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Insertable<
          Database['public']['Tables']['inspection_assets']['Row'],
          'inspection_id' | 'category' | 'asset_code'
        >
        Update: Partial<Database['public']['Tables']['inspection_assets']['Row']>
        Relationships: [
          {
            foreignKeyName: 'inspection_assets_inspection_id_fkey'
            columns: ['inspection_id']
            isOneToOne: false
            referencedRelation: 'inspections'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'inspection_assets_asset_id_fkey'
            columns: ['asset_id']
            isOneToOne: false
            referencedRelation: 'assets'
            referencedColumns: ['id']
          },
        ]
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

      clients: {
        Row: {
          id: string
          name: string
          contact_name: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          updated_at: string
        }
        Insert: Insertable<
          Database['public']['Tables']['clients']['Row'],
          'name'
        >
        Update: Partial<Database['public']['Tables']['clients']['Row']>
        Relationships: []
      }

      sites: {
        Row: {
          id: string
          client_id: string
          name: string
          address: string
          service_condition: ServiceCondition
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Insertable<
          Database['public']['Tables']['sites']['Row'],
          'client_id' | 'name' | 'address'
        >
        Update: Partial<Database['public']['Tables']['sites']['Row']>
        Relationships: [
          {
            foreignKeyName: 'sites_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
        ]
      }

      assets: {
        Row: {
          id: string
          site_id: string
          category: AssetCategory
          tag: string
          serial_number: string | null
          manufacturer: string | null
          model: string | null
          installed_on: string | null
          location_note: string | null
          status: RegistryAssetStatus
          last_pass_on: string | null
          next_due_on: string | null
          created_at: string
          updated_at: string
        }
        Insert: Insertable<
          Database['public']['Tables']['assets']['Row'],
          'site_id' | 'category' | 'tag'
        >
        Update: Partial<Database['public']['Tables']['assets']['Row']>
        Relationships: []
      }

      certificates: {
        Row: {
          id: string
          certificate_number: string
          inspection_id: string
          site_id: string | null
          issue_type: IssueType
          overall_status: OverallSiteStatus | null
          issued_by: string
          issued_at: string
          expires_on: string | null
          standard_line: string
          document_path: string | null
          asset_count: number
          compliant_count: number
          revoked_at: string | null
          revoked_reason: string | null
          revoked_by: string | null
        }
        Insert: never   // issue_certificate() RPC only
        Update: never   // append-only; revoke_certificate() RPC only
        Relationships: []
      }

      alerts: {
        Row: {
          id: string
          kind: AlertKind
          asset_id: string | null
          site_id: string | null
          certificate_id: string | null
          due_on: string
          title: string
          detail: string | null
          created_at: string
          resolved_at: string | null
        }
        Insert: never   // raised by sweep_due_date_alerts() only
        Update: never
        Relationships: []
      }

      alert_recipients: {
        Row: {
          alert_id: string
          user_id: string
          acknowledged_at: string | null
        }
        Insert: never
        Update: never   // acknowledge_alert() RPC only
        Relationships: [
          {
            foreignKeyName: 'alert_recipients_alert_id_fkey'
            columns: ['alert_id']
            isOneToOne: false
            referencedRelation: 'alerts'
            referencedColumns: ['id']
          },
        ]
      }

      standards: {
        Row: {
          code: string
          edition: string
          title: string
          effective_from: string
          superseded_from: string | null
        }
        Insert: Insertable<
          Database['public']['Tables']['standards']['Row'],
          'code' | 'edition' | 'title' | 'effective_from'
        >
        Update: Partial<Database['public']['Tables']['standards']['Row']>
        Relationships: []
      }

      asset_classes: {
        Row: {
          code: AssetCategory
          name: string
          standard_code: string
          is_installed: boolean
        }
        Insert: Insertable<
          Database['public']['Tables']['asset_classes']['Row'],
          'code' | 'name' | 'standard_code'
        >
        Update: Partial<Database['public']['Tables']['asset_classes']['Row']>
        Relationships: []
      }

      inspection_rules: {
        Row: {
          asset_class_code: AssetCategory
          standard_code: string
          standard_edition: string
          service_condition: ServiceCondition
          interval_months: number
          test_method: TestMethod
          effective_from: string
          source_note: string | null
          verified_by: string | null
          verified_at: string | null
        }
        Insert: Insertable<
          Database['public']['Tables']['inspection_rules']['Row'],
          'asset_class_code' | 'standard_code' | 'standard_edition'
          | 'interval_months' | 'test_method' | 'effective_from'
        >
        Update: Partial<Database['public']['Tables']['inspection_rules']['Row']>
        Relationships: []
      }
    }

    Views: {
      [_ in never]: never
    }

    Functions: {
      issue_certificate: {
        Args: { p_inspection_id: string; p_document_path?: string | null }
        Returns: Database['public']['Tables']['certificates']['Row']
      }
      revoke_certificate: {
        Args: { p_certificate_id: string; p_reason: string }
        Returns: undefined
      }
      acknowledge_alert: {
        Args: { p_alert_id: string }
        Returns: undefined
      }
      sweep_due_date_alerts: {
        Args: { p_lead_days?: number }
        Returns: undefined
      }
      applicable_rule: {
        Args: { p_class: AssetCategory; p_condition?: string; p_on?: string }
        Returns: Database['public']['Tables']['inspection_rules']['Row'] | null
      }
      next_due_date: {
        Args: { p_class: AssetCategory; p_condition: string; p_last_pass: string }
        Returns: string | null
      }
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
export type Certificate = Database['public']['Tables']['certificates']['Row']
export type AlertRow = Database['public']['Tables']['alerts']['Row']
export type ClientRow = Database['public']['Tables']['clients']['Row']
export type SiteRow = Database['public']['Tables']['sites']['Row']
export type RegistryAsset = Database['public']['Tables']['assets']['Row']
export type StandardRow = Database['public']['Tables']['standards']['Row']
export type AssetClassRow = Database['public']['Tables']['asset_classes']['Row']
export type InspectionRuleRow = Database['public']['Tables']['inspection_rules']['Row']
