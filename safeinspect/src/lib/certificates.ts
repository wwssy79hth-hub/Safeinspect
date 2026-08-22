// ============================================================
// SafeInspect — Certificate service
//
// Certificates are records, not files (migration 006). Issue and
// revoke go through security-definer RPCs that enforce the
// evidence gate and role checks server-side; this module is a
// thin typed wrapper plus the fetch for the issued banner.
// ============================================================

import { supabase } from '@/lib/supabase'
import type { Certificate } from '@/types/database'

/**
 * Issue the certificate for a completed, signed inspection.
 * The server enforces the gates (completion, signature, photo
 * evidence for every compliance claim, no proposals) — a thrown
 * error carries the human-readable reason.
 */
export async function issueCertificate(
  inspectionId: string,
  documentPath?: string | null
): Promise<Certificate> {
  const { data, error } = await supabase.rpc('issue_certificate', {
    p_inspection_id: inspectionId,
    p_document_path: documentPath ?? null,
  })
  if (error) throw new Error(error.message)
  return data as Certificate
}

/** The active (non-revoked) certificate for an inspection, if any. */
export async function fetchActiveCertificate(
  inspectionId: string
): Promise<Certificate | null> {
  try {
    const { data, error } = await supabase
      .from('certificates')
      .select('*')
      .eq('inspection_id', inspectionId)
      .is('revoked_at', null)
      .maybeSingle()
    if (error) return null
    return data
  } catch {
    return null
  }
}

/** Admin-only: revoke an issued certificate (unfreezes the records). */
export async function revokeCertificate(
  certificateId: string,
  reason: string
): Promise<void> {
  const { error } = await supabase.rpc('revoke_certificate', {
    p_certificate_id: certificateId,
    p_reason: reason,
  })
  if (error) throw new Error(error.message)
}
