import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import type {
  Inspection,
  InspectionAsset,
  AssetCategory,
  AssetStatus,
  IssueType,
  OverallSiteStatus,
} from '@/types/database'

// ─── Site map marker ─────────────────────────────────────────
// Stored as a JSON column on the inspection row (or a separate table)

export interface SiteMapMarker {
  id: string               // UUID
  asset_code: string       // e.g. "TMAP-003" — links to inspection_assets.asset_code
  x: number                // 0–100 (percentage of image width)
  y: number                // 0–100 (percentage of image height)
  status: AssetStatus      // drives pin colour
  category: AssetCategory
  label: string            // short display label
}

export interface SitePlanData {
  image_url: string | null          // Supabase Storage public URL
  image_path: string | null         // Storage path for deletion
  markers: SiteMapMarker[]
  drawing_scaled: boolean
}

// ─── Draft shape ─────────────────────────────────────────────

export interface InspectionDraft {
  job_number: string
  quote_number: string
  client_name: string
  site_name: string
  site_address: string
  roof_area_reference: string
  date_of_inspection: string
  issue_type: IssueType
  latitude: number | null
  longitude: number | null
  certifier_id: string
  certifier_name: string
  certifier_position: string
  certifier_accreditation: string
  template_id: string | null
  selected_categories: AssetCategory[]
}

export interface CategorySummary {
  category: AssetCategory
  total: number
  compliant: number
  non_compliant: number
  recommendation: number
  na: number
}

// ─── State shape ─────────────────────────────────────────────

interface InspectionState {
  activeInspectionId: string | null
  activeInspection: Inspection | null
  draft: InspectionDraft | null

  assets: InspectionAsset[]
  assetsByCategory: Partial<Record<AssetCategory, InspectionAsset[]>>

  // Site plan / map
  sitePlan: SitePlanData
  siteMapDirty: boolean   // true when markers unsaved

  inspections: Inspection[]
  inspectionsLoading: boolean
  inspectionsError: string | null

  stats: {
    thisMonth: number
    avgCompliance: number
    pending: number
    drafts: number
  }

  saving: boolean
  error: string | null

  // ── Draft ────────────────────────────────────────────────────
  initDraft: (partial?: Partial<InspectionDraft>) => void
  updateDraft: (patch: Partial<InspectionDraft>) => void
  clearDraft: () => void

  // ── Inspection CRUD ──────────────────────────────────────────
  createInspection: (userId: string) => Promise<string>
  loadInspection: (id: string) => Promise<void>
  updateInspection: (id: string, patch: Partial<Inspection>) => Promise<void>

  // ── Assets ───────────────────────────────────────────────────
  loadAssets: (inspectionId: string) => Promise<void>
  upsertAsset: (asset: Partial<InspectionAsset> & { inspection_id: string; category: AssetCategory }) => Promise<InspectionAsset>
  deleteAsset: (assetId: string) => Promise<void>

  // ── Site map ─────────────────────────────────────────────────
  loadSitePlan: (inspectionId: string) => Promise<void>
  uploadSitePlanImage: (inspectionId: string, file: File) => Promise<string>
  addMarker: (marker: Omit<SiteMapMarker, 'id'>) => void
  updateMarker: (id: string, patch: Partial<SiteMapMarker>) => void
  removeMarker: (id: string) => void
  syncMarkersFromAssets: () => void   // auto-create markers for all known assets
  saveMarkers: (inspectionId: string) => Promise<void>

  // ── List + stats ─────────────────────────────────────────────
  fetchInspections: (userId: string) => Promise<void>
  fetchStats: (userId: string) => Promise<void>

  // ── Computed ─────────────────────────────────────────────────
  getCategorySummaries: () => CategorySummary[]
  getNextAssetCode: (category: AssetCategory) => string
  getOverallStatus: () => OverallSiteStatus

  clearError: () => void
}

// ─── Defaults ────────────────────────────────────────────────

const defaultDraft = (): InspectionDraft => ({
  job_number: '',
  quote_number: '',
  client_name: '',
  site_name: '',
  site_address: '',
  roof_area_reference: '',
  date_of_inspection: new Date().toISOString().split('T')[0],
  issue_type: 'recertification',
  latitude: null,
  longitude: null,
  certifier_id: '',
  certifier_name: '',
  certifier_position: '',
  certifier_accreditation: '',
  template_id: null,
  selected_categories: [],
})

const defaultSitePlan = (): SitePlanData => ({
  image_url: null,
  image_path: null,
  markers: [],
  drawing_scaled: false,
})

// ─── Store ────────────────────────────────────────────────────

export const useInspectionStore = create<InspectionState>()(
  devtools(
    persist(
      (set, get) => ({
        activeInspectionId: null,
        activeInspection: null,
        draft: null,
        assets: [],
        assetsByCategory: {},
        sitePlan: defaultSitePlan(),
        siteMapDirty: false,
        inspections: [],
        inspectionsLoading: false,
        inspectionsError: null,
        stats: { thisMonth: 0, avgCompliance: 0, pending: 0, drafts: 0 },
        saving: false,
        error: null,

        // ── Draft ────────────────────────────────────────────

        initDraft: (partial = {}) =>
          set({ draft: { ...defaultDraft(), ...partial } }),

        updateDraft: (patch) => {
          const current = get().draft ?? defaultDraft()
          set({ draft: { ...current, ...patch } })
        },

        clearDraft: () =>
          set({
            draft: null,
            activeInspectionId: null,
            activeInspection: null,
            assets: [],
            assetsByCategory: {},
            sitePlan: defaultSitePlan(),
            siteMapDirty: false,
          }),

        // ── Create ──────────────────────────────────────────

        createInspection: async (userId) => {
          const draft = get().draft
          if (!draft) throw new Error('No draft to save')
          set({ saving: true, error: null })
          try {
            const { data, error } = await supabase
              .from('inspections')
              .insert({
                job_number: draft.job_number || `JOB-${Date.now()}`,
                quote_number: draft.quote_number || null,
                client_name: draft.client_name,
                site_name: draft.site_name,
                site_address: draft.site_address,
                roof_area_reference: draft.roof_area_reference || null,
                date_of_inspection: draft.date_of_inspection,
                issue_type: draft.issue_type,
                inspection_status: 'draft',
                certifier_id: draft.certifier_id || userId,
                created_by: userId,
              })
              .select()
              .single()
            if (error) throw error
            set({ activeInspectionId: data.id, activeInspection: data })
            return data.id
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to create inspection'
            set({ error: msg })
            throw err
          } finally {
            set({ saving: false })
          }
        },

        // ── Load ─────────────────────────────────────────────

        loadInspection: async (id) => {
          set({ saving: true, error: null })
          try {
            const { data, error } = await supabase
              .from('inspections')
              .select('*')
              .eq('id', id)
              .single()
            if (error) throw error
            set({ activeInspection: data, activeInspectionId: id })
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to load inspection'
            set({ error: msg })
            throw err
          } finally {
            set({ saving: false })
          }
        },

        // ── Update ───────────────────────────────────────────

        updateInspection: async (id, patch) => {
          set({ saving: true, error: null })
          try {
            const { data, error } = await supabase
              .from('inspections')
              .update(patch)
              .eq('id', id)
              .select()
              .single()
            if (error) throw error
            set({ activeInspection: data })
            set((s) => ({
              inspections: s.inspections.map((i) => (i.id === id ? data : i)),
            }))
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to update inspection'
            set({ error: msg })
            throw err
          } finally {
            set({ saving: false })
          }
        },

        // ── Assets ───────────────────────────────────────────

        loadAssets: async (inspectionId) => {
          try {
            const { data, error } = await supabase
              .from('inspection_assets')
              .select('*')
              .eq('inspection_id', inspectionId)
              .order('sort_order', { ascending: true })
            if (error) throw error
            const byCategory: Partial<Record<AssetCategory, InspectionAsset[]>> = {}
            for (const asset of data) {
              const cat = asset.category as AssetCategory
              if (!byCategory[cat]) byCategory[cat] = []
              byCategory[cat]!.push(asset)
            }
            set({ assets: data, assetsByCategory: byCategory })
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to load assets'
            set({ error: msg })
          }
        },

        upsertAsset: async (asset) => {
          set({ saving: true, error: null })
          try {
            const sortOrder = get().assetsByCategory[asset.category]?.length ?? 0
            const payload = {
              ...asset,
              sort_order: asset.sort_order ?? sortOrder,
              standard_referenced: asset.standard_referenced ?? 'AS/NZS 1891.4:2009',
              photo_refs: asset.photo_refs ?? [],
            }
            const { data, error } = await supabase
              .from('inspection_assets')
              .upsert(payload)
              .select()
              .single()
            if (error) throw error
            const existing = get().assets
            const idx = existing.findIndex((a) => a.id === data.id)
            const updated = idx >= 0
              ? existing.map((a) => (a.id === data.id ? data : a))
              : [...existing, data]
            const byCategory: Partial<Record<AssetCategory, InspectionAsset[]>> = {}
            for (const a of updated) {
              const cat = a.category as AssetCategory
              if (!byCategory[cat]) byCategory[cat] = []
              byCategory[cat]!.push(a)
            }
            set({ assets: updated, assetsByCategory: byCategory })

            // Auto-sync marker status if one exists for this asset code
            const markers = get().sitePlan.markers
            const existingMarker = markers.find((m) => m.asset_code === data.asset_code)
            if (existingMarker) {
              get().updateMarker(existingMarker.id, { status: data.status as AssetStatus })
            }
            return data
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to save asset'
            set({ error: msg })
            throw err
          } finally {
            set({ saving: false })
          }
        },

        deleteAsset: async (assetId) => {
          set({ saving: true, error: null })
          try {
            const { error } = await supabase
              .from('inspection_assets')
              .delete()
              .eq('id', assetId)
            if (error) throw error
            const updated = get().assets.filter((a) => a.id !== assetId)
            const byCategory: Partial<Record<AssetCategory, InspectionAsset[]>> = {}
            for (const a of updated) {
              const cat = a.category as AssetCategory
              if (!byCategory[cat]) byCategory[cat] = []
              byCategory[cat]!.push(a)
            }
            set({ assets: updated, assetsByCategory: byCategory })
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to delete asset'
            set({ error: msg })
            throw err
          } finally {
            set({ saving: false })
          }
        },

        // ── Site map ─────────────────────────────────────────

        loadSitePlan: async (inspectionId) => {
          try {
            const { data, error } = await supabase
              .from('inspections')
              .select('aerial_map_url, drawing_scaled, notes')
              .eq('id', inspectionId)
              .single()
            if (error) throw error

            // markers are stored in the notes field as JSON prefix "MARKERS:" for MVP
            // Production: use a dedicated site_plan_markers table
            let markers: SiteMapMarker[] = []
            if (data.notes?.startsWith('MARKERS:')) {
              try {
                markers = JSON.parse(data.notes.slice(8))
              } catch { /* ignore corrupt */ }
            }

            set({
              sitePlan: {
                image_url: data.aerial_map_url,
                image_path: null,
                markers,
                drawing_scaled: data.drawing_scaled ?? false,
              },
              siteMapDirty: false,
            })
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to load site plan'
            set({ error: msg })
          }
        },

        uploadSitePlanImage: async (inspectionId, file) => {
          set({ saving: true, error: null })
          try {
            const ext = file.name.split('.').pop() ?? 'jpg'
            const path = `aerial-maps/${inspectionId}/site-plan.${ext}`
            const { error: uploadErr } = await supabase.storage
              .from('aerial-maps')
              .upload(path, file, { upsert: true, contentType: file.type })
            if (uploadErr) throw uploadErr

            const { data: urlData } = supabase.storage
              .from('aerial-maps')
              .getPublicUrl(path)

            const publicUrl = urlData.publicUrl

            await supabase
              .from('inspections')
              .update({ aerial_map_url: publicUrl })
              .eq('id', inspectionId)

            set((s) => ({
              sitePlan: { ...s.sitePlan, image_url: publicUrl, image_path: path },
              activeInspection: s.activeInspection
                ? { ...s.activeInspection, aerial_map_url: publicUrl }
                : null,
            }))

            return publicUrl
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to upload site plan'
            set({ error: msg })
            throw err
          } finally {
            set({ saving: false })
          }
        },

        addMarker: (marker) => {
          const id = crypto.randomUUID()
          set((s) => ({
            sitePlan: {
              ...s.sitePlan,
              markers: [...s.sitePlan.markers, { ...marker, id }],
            },
            siteMapDirty: true,
          }))
        },

        updateMarker: (id, patch) => {
          set((s) => ({
            sitePlan: {
              ...s.sitePlan,
              markers: s.sitePlan.markers.map((m) =>
                m.id === id ? { ...m, ...patch } : m
              ),
            },
            siteMapDirty: true,
          }))
        },

        removeMarker: (id) => {
          set((s) => ({
            sitePlan: {
              ...s.sitePlan,
              markers: s.sitePlan.markers.filter((m) => m.id !== id),
            },
            siteMapDirty: true,
          }))
        },

        syncMarkersFromAssets: () => {
          const { assets, sitePlan } = get()
          const existingCodes = new Set(sitePlan.markers.map((m) => m.asset_code))
          const newMarkers: SiteMapMarker[] = []

          assets.forEach((asset, idx) => {
            if (!existingCodes.has(asset.asset_code)) {
              // Place new markers in a grid — user can drag to correct position
              newMarkers.push({
                id: crypto.randomUUID(),
                asset_code: asset.asset_code,
                category: asset.category as AssetCategory,
                status: asset.status as AssetStatus,
                label: asset.asset_code,
                x: ((idx % 10) * 9) + 5,
                y: (Math.floor(idx / 10) * 12) + 5,
              })
            }
          })

          if (newMarkers.length > 0) {
            set((s) => ({
              sitePlan: {
                ...s.sitePlan,
                markers: [...s.sitePlan.markers, ...newMarkers],
              },
              siteMapDirty: true,
            }))
          }
        },

        saveMarkers: async (inspectionId) => {
          const { sitePlan } = get()
          set({ saving: true, error: null })
          try {
            const markersJson = 'MARKERS:' + JSON.stringify(sitePlan.markers)
            const { error } = await supabase
              .from('inspections')
              .update({
                notes: markersJson,
                drawing_scaled: sitePlan.drawing_scaled,
              })
              .eq('id', inspectionId)
            if (error) throw error
            set({ siteMapDirty: false })
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to save markers'
            set({ error: msg })
            throw err
          } finally {
            set({ saving: false })
          }
        },

        // ── List + stats ─────────────────────────────────────

        fetchInspections: async (userId) => {
          set({ inspectionsLoading: true, inspectionsError: null })
          try {
            const { data, error } = await supabase
              .from('inspections')
              .select('*')
              .or(`created_by.eq.${userId},certifier_id.eq.${userId}`)
              .order('created_at', { ascending: false })
              .limit(50)
            if (error) throw error
            set({ inspections: data ?? [] })
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to fetch inspections'
            set({ inspectionsError: msg })
          } finally {
            set({ inspectionsLoading: false })
          }
        },

        fetchStats: async (userId) => {
          try {
            const startOfMonth = new Date()
            startOfMonth.setDate(1)
            startOfMonth.setHours(0, 0, 0, 0)
            const { data } = await supabase
              .from('inspections')
              .select('inspection_status, overall_status, created_at')
              .or(`created_by.eq.${userId},certifier_id.eq.${userId}`)
            if (!data) return
            const thisMonth = data.filter(
              (i) => new Date(i.created_at) >= startOfMonth
            ).length
            const completed = data.filter((i) => i.overall_status !== null)
            const compliantCount = completed.filter(
              (i) => i.overall_status === 'compliant'
            ).length
            const avgCompliance = completed.length
              ? Math.round((compliantCount / completed.length) * 100)
              : 0
            const pending = data.filter(
              (i) => i.inspection_status === 'in_progress'
            ).length
            const drafts = data.filter(
              (i) => i.inspection_status === 'draft'
            ).length
            set({ stats: { thisMonth, avgCompliance, pending, drafts } })
          } catch { /* non-critical */ }
        },

        // ── Computed ────────────────────────────────────────

        getCategorySummaries: () => {
          const { assets } = get()
          const map = new Map<AssetCategory, CategorySummary>()
          for (const asset of assets) {
            const cat = asset.category
            if (!map.has(cat)) {
              map.set(cat, { category: cat, total: 0, compliant: 0, non_compliant: 0, recommendation: 0, na: 0 })
            }
            const s = map.get(cat)!
            s.total++
            const status = asset.status as AssetStatus
            if (status === 'compliant') s.compliant++
            else if (status === 'non_compliant') s.non_compliant++
            else if (status === 'recommendation') s.recommendation++
            else if (status === 'n/a') s.na++
          }
          return Array.from(map.values())
        },

        getNextAssetCode: (category) => {
          const existing = get().assetsByCategory[category] ?? []
          const next = existing.length + 1
          return `${category}-${String(next).padStart(3, '0')}`
        },

        getOverallStatus: (): OverallSiteStatus => {
          const { assets } = get()
          if (assets.length === 0) return 'compliant'
          const hasNonCompliant = assets.some((a) => a.status === 'non_compliant')
          const hasRecommendation = assets.some((a) => a.status === 'recommendation')
          if (hasNonCompliant) return 'non_compliant'
          if (hasRecommendation) return 'partially_compliant'
          return 'compliant'
        },

        clearError: () => set({ error: null }),
      }),
      {
        name: 'safeinspect-inspection',
        partialize: (s) => ({
          draft: s.draft,
          activeInspectionId: s.activeInspectionId,
          sitePlan: s.sitePlan,
        }),
      }
    ),
    { name: 'InspectionStore' }
  )
)

// ─── Selectors ───────────────────────────────────────────────

export const selectDraftComplete = (s: InspectionState): boolean => {
  const d = s.draft
  if (!d) return false
  return !!(d.client_name && d.site_name && d.site_address && d.date_of_inspection)
}

export const selectCategoryProgress = (
  s: InspectionState,
  category: AssetCategory
) => {
  const assets = s.assetsByCategory[category] ?? []
  const compliant = assets.filter((a) => a.status === 'compliant').length
  const total = assets.length
  return { total, compliant, pct: total ? Math.round((compliant / total) * 100) : 0 }
}
