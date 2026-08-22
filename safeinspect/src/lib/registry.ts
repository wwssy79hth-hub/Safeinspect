// ============================================================
// SafeInspect — Asset registry service
//
// Client access to the durable registry (migration 005):
// reusable clients and sites, and per-asset history across
// visits — the query the durable model exists to answer.
// Every call degrades gracefully to null/empty when the
// migration has not been applied yet.
// ============================================================

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  AssetCategory,
  AssetStatus,
  RegistryAsset,
  SiteRow,
} from '@/types/database'

export interface SiteOption extends SiteRow {
  client_name: string
}

// ─── Sites for autocomplete ───────────────────────────────────

export async function fetchSites(): Promise<SiteOption[]> {
  try {
    const { data, error } = await supabase
      .from('sites')
      .select('*, clients(name)')
      .order('name')
    if (error || !data) return []
    return (data as Array<SiteRow & { clients: { name: string } | null }>).map(
      (s) => ({ ...s, client_name: s.clients?.name ?? '' })
    )
  } catch {
    return []
  }
}

/** React hook: known sites, empty until loaded / when unavailable. */
export function useSites(): SiteOption[] {
  const [sites, setSites] = useState<SiteOption[]>([])
  useEffect(() => {
    let alive = true
    fetchSites().then((s) => { if (alive) setSites(s) })
    return () => { alive = false }
  }, [])
  return sites
}

// ─── Find-or-create on inspection creation ────────────────────

/**
 * Resolve (client name, site name, address) to a site id,
 * creating the client and/or site when new. Returns null when
 * the registry tables are unavailable, so inspection creation
 * still succeeds against a pre-005 database.
 */
export async function findOrCreateSite(
  clientName: string,
  siteName: string,
  siteAddress: string
): Promise<string | null> {
  const client = clientName.trim()
  const site = siteName.trim()
  if (!client || !site) return null

  try {
    // Client
    let clientId: string
    const { data: existingClient, error: clientErr } = await supabase
      .from('clients').select('id').eq('name', client).maybeSingle()
    if (clientErr) return null
    if (existingClient) {
      clientId = existingClient.id
    } else {
      const { data: created, error } = await supabase
        .from('clients').insert({ name: client }).select('id').single()
      if (error || !created) return null
      clientId = created.id
    }

    // Site
    const { data: existingSite, error: siteErr } = await supabase
      .from('sites').select('id')
      .eq('client_id', clientId).eq('name', site)
      .maybeSingle()
    if (siteErr) return null
    if (existingSite) return existingSite.id

    const { data: createdSite, error } = await supabase
      .from('sites')
      .insert({ client_id: clientId, name: site, address: siteAddress.trim() })
      .select('id').single()
    if (error || !createdSite) return null
    return createdSite.id
  } catch {
    return null
  }
}

// ─── Per-asset history ────────────────────────────────────────

export interface AssetHistoryEntry {
  inspection_id: string
  date_of_inspection: string
  status: AssetStatus
  finding: string | null
  corrective_action: string | null
  standard_referenced: string | null
}

export interface AssetContext {
  asset: RegistryAsset
  /** Results from other visits, newest first */
  history: AssetHistoryEntry[]
}

/**
 * The durable asset behind (site, tag) and its results from
 * previous visits — "show me anchor #47's history".
 */
export async function fetchAssetContext(
  siteId: string,
  tag: string,
  excludeInspectionId?: string
): Promise<AssetContext | null> {
  try {
    const { data: asset, error } = await supabase
      .from('assets').select('*')
      .eq('site_id', siteId).eq('tag', tag)
      .maybeSingle()
    if (error || !asset) return null

    const { data: rows } = await supabase
      .from('inspection_assets')
      .select('inspection_id, status, finding, corrective_action, standard_referenced, inspections(date_of_inspection)')
      .eq('asset_id', asset.id)

    type HistRow = {
      inspection_id: string
      status: AssetStatus
      finding: string | null
      corrective_action: string | null
      standard_referenced: string | null
      inspections: { date_of_inspection: string } | null
    }

    const history: AssetHistoryEntry[] = ((rows ?? []) as HistRow[])
      .filter((r) => r.inspection_id !== excludeInspectionId)
      .map((r) => ({
        inspection_id: r.inspection_id,
        date_of_inspection: r.inspections?.date_of_inspection ?? '',
        status: r.status,
        finding: r.finding,
        corrective_action: r.corrective_action,
        standard_referenced: r.standard_referenced,
      }))
      .sort((a, b) => b.date_of_inspection.localeCompare(a.date_of_inspection))

    return { asset, history }
  } catch {
    return null
  }
}

/**
 * React hook for the capture form: previous-visit context for the
 * asset being captured. Null while loading or when there is no
 * durable record yet.
 */
export function useAssetContext(
  siteId: string | null | undefined,
  category: AssetCategory,
  tag: string,
  excludeInspectionId?: string
): AssetContext | null {
  const [ctx, setCtx] = useState<AssetContext | null>(null)
  useEffect(() => {
    let alive = true
    setCtx(null)
    if (siteId && tag) {
      fetchAssetContext(siteId, tag, excludeInspectionId).then((c) => {
        if (alive) setCtx(c)
      })
    }
    return () => { alive = false }
  }, [siteId, category, tag, excludeInspectionId])
  return ctx
}
