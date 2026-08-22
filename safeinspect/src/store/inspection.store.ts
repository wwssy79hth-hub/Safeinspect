import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import { useSyncQueue } from '@/lib/syncQueue'
import type {
  Inspection,
  InspectionAsset,
  AssetCategory,
  AssetStatus,
  IssueType,
  OverallSiteStatus,
  SitePlan,
  PlanFeature,
  PlanGeometryType,
  PlanPoint,
} from '@/types/database'

// ─── Plan features ───────────────────────────────────────────
// Persisted in site_plans / plan_features tables. Geometry is
// image-normalised (0–1) so it renders identically at any zoom,
// on any device, and in the PDF export.

export type NewPlanFeature = {
  site_plan_id: string
  inspection_id: string
  asset_id?: string | null
  asset_code: string
  category: AssetCategory
  status: AssetStatus
  geometry_type: PlanGeometryType
  geometry: PlanPoint[]
  label?: string | null
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
  sitePlans: SitePlan[]
  activePlanId: string | null
  planFeatures: PlanFeature[]          // all features for the inspection
  deletedFeatureIds: string[]          // persisted rows pending deletion
  siteMapDirty: boolean                // true when features unsaved

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
  loadSitePlans: (inspectionId: string) => Promise<void>
  setActivePlan: (planId: string) => void
  createSitePlan: (inspectionId: string, name: string) => Promise<SitePlan>
  uploadSitePlanImage: (inspectionId: string, file: File, planId?: string) => Promise<string>
  addFeature: (feature: NewPlanFeature) => PlanFeature
  updateFeature: (id: string, patch: Partial<PlanFeature>) => void
  removeFeature: (id: string) => void
  syncFeaturesFromAssets: () => void   // auto-create point features for unplaced assets
  saveFeatures: (inspectionId: string) => Promise<void>

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

/** Read an image file's natural pixel dimensions before upload. */
async function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bmp = await createImageBitmap(file)
    const dims = { width: bmp.width, height: bmp.height }
    bmp.close()
    return dims
  } catch {
    return null
  }
}

const localTimestamps = () => {
  const now = new Date().toISOString()
  return { created_at: now, updated_at: now }
}

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
        sitePlans: [],
        activePlanId: null,
        planFeatures: [],
        deletedFeatureIds: [],
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
            sitePlans: [],
            activePlanId: null,
            planFeatures: [],
            deletedFeatureIds: [],
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

            // Auto-sync feature status if one exists for this asset code
            const feature = get().planFeatures.find((f) => f.asset_code === data.asset_code)
            if (feature && feature.status !== data.status) {
              get().updateFeature(feature.id, {
                status: data.status as AssetStatus,
                asset_id: data.id,
              })
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

        loadSitePlans: async (inspectionId) => {
          try {
            const [plansRes, featuresRes] = await Promise.all([
              supabase
                .from('site_plans')
                .select('*')
                .eq('inspection_id', inspectionId)
                .order('sort_order', { ascending: true }),
              supabase
                .from('plan_features')
                .select('*')
                .eq('inspection_id', inspectionId)
                .order('sort_order', { ascending: true }),
            ])
            if (plansRes.error) throw plansRes.error
            if (featuresRes.error) throw featuresRes.error

            let plans = plansRes.data as SitePlan[]

            // Inspections created before this feature: promote the legacy
            // aerial_map_url into a proper site_plans row on first open.
            if (plans.length === 0) {
              const insp = get().activeInspection
              const aerialUrl = insp?.id === inspectionId ? insp.aerial_map_url : null
              if (aerialUrl) {
                const { data: created, error: createErr } = await supabase
                  .from('site_plans')
                  .insert({
                    inspection_id: inspectionId,
                    name: insp?.roof_area_reference || 'Roof 01',
                    image_url: aerialUrl,
                    drawing_scaled: insp?.drawing_scaled ?? false,
                  })
                  .select()
                  .single()
                if (!createErr && created) plans = [created as SitePlan]
              }
            }

            set((s) => ({
              sitePlans: plans,
              planFeatures: featuresRes.data as PlanFeature[],
              deletedFeatureIds: [],
              activePlanId:
                plans.find((p) => p.id === s.activePlanId)?.id ?? plans[0]?.id ?? null,
              siteMapDirty: false,
            }))
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to load site plans'
            set({ error: msg })
          }
        },

        setActivePlan: (planId) => set({ activePlanId: planId }),

        createSitePlan: async (inspectionId, name) => {
          set({ saving: true, error: null })
          try {
            const { data, error } = await supabase
              .from('site_plans')
              .insert({
                inspection_id: inspectionId,
                name,
                sort_order: get().sitePlans.length,
              })
              .select()
              .single()
            if (error) throw error
            const plan = data as SitePlan
            set((s) => ({ sitePlans: [...s.sitePlans, plan], activePlanId: plan.id }))
            return plan
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to create site plan'
            set({ error: msg })
            throw err
          } finally {
            set({ saving: false })
          }
        },

        uploadSitePlanImage: async (inspectionId, file, planId) => {
          set({ saving: true, error: null })
          try {
            // Resolve target plan — create the default one if none exists yet
            let plan = get().sitePlans.find((p) => p.id === (planId ?? get().activePlanId))
            if (!plan) {
              const { data, error } = await supabase
                .from('site_plans')
                .insert({ inspection_id: inspectionId, name: 'Roof 01' })
                .select()
                .single()
              if (error) throw error
              plan = data as SitePlan
              set((s) => ({ sitePlans: [...s.sitePlans, plan!], activePlanId: plan!.id }))
            }

            const dims = await readImageDimensions(file)
            const ext = file.name.split('.').pop() ?? 'jpg'
            const path = `aerial-maps/${inspectionId}/${plan.id}.${ext}`
            const { error: uploadErr } = await supabase.storage
              .from('aerial-maps')
              .upload(path, file, { upsert: true, contentType: file.type })
            if (uploadErr) throw uploadErr

            const { data: urlData } = supabase.storage
              .from('aerial-maps')
              .getPublicUrl(path)
            const publicUrl = urlData.publicUrl

            const { data: updated, error: updateErr } = await supabase
              .from('site_plans')
              .update({
                image_path: path,
                image_url: publicUrl,
                image_width: dims?.width ?? null,
                image_height: dims?.height ?? null,
              })
              .eq('id', plan.id)
              .select()
              .single()
            if (updateErr) throw updateErr

            // Keep the legacy report field pointing at the first plan's image
            const isFirstPlan = get().sitePlans[0]?.id === plan.id
            if (isFirstPlan) {
              await supabase
                .from('inspections')
                .update({ aerial_map_url: publicUrl })
                .eq('id', inspectionId)
            }

            set((s) => ({
              sitePlans: s.sitePlans.map((p) => (p.id === plan!.id ? (updated as SitePlan) : p)),
              activeInspection: isFirstPlan && s.activeInspection
                ? { ...s.activeInspection, aerial_map_url: publicUrl }
                : s.activeInspection,
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

        addFeature: (feature) => {
          const row: PlanFeature = {
            ...localTimestamps(),
            ...feature,
            id: crypto.randomUUID(),
            asset_id: feature.asset_id ?? null,
            label: feature.label ?? feature.asset_code,
            label_offset: null,
            sort_order: get().planFeatures.length,
          }
          set((s) => ({
            planFeatures: [...s.planFeatures, row],
            siteMapDirty: true,
          }))
          return row
        },

        updateFeature: (id, patch) => {
          set((s) => ({
            planFeatures: s.planFeatures.map((f) =>
              f.id === id ? { ...f, ...patch } : f
            ),
            siteMapDirty: true,
          }))
        },

        removeFeature: (id) => {
          set((s) => ({
            planFeatures: s.planFeatures.filter((f) => f.id !== id),
            deletedFeatureIds: [...s.deletedFeatureIds, id],
            siteMapDirty: true,
          }))
        },

        syncFeaturesFromAssets: () => {
          const { assets, planFeatures, activePlanId, activeInspectionId } = get()
          if (!activePlanId || !activeInspectionId) return
          const existingCodes = new Set(planFeatures.map((f) => f.asset_code))
          const newFeatures: PlanFeature[] = []

          assets.forEach((asset, idx) => {
            if (!existingCodes.has(asset.asset_code)) {
              // Place new features in a grid — user drags them into position
              newFeatures.push({
                id: crypto.randomUUID(),
                site_plan_id: activePlanId,
                inspection_id: activeInspectionId,
                asset_id: asset.id,
                asset_code: asset.asset_code,
                category: asset.category as AssetCategory,
                status: asset.status as AssetStatus,
                geometry_type: 'point',
                geometry: [{
                  x: ((idx % 10) * 0.09) + 0.05,
                  y: (Math.floor(idx / 10) * 0.12) + 0.05,
                }],
                label: asset.asset_code,
                label_offset: null,
                sort_order: planFeatures.length + idx,
                ...localTimestamps(),
              })
            }
          })

          if (newFeatures.length > 0) {
            set((s) => ({
              planFeatures: [...s.planFeatures, ...newFeatures],
              siteMapDirty: true,
            }))
          }
        },

        saveFeatures: async (inspectionId) => {
          const { planFeatures, deletedFeatureIds } = get()
          set({ saving: true, error: null })

          const upserts = planFeatures
            .filter((f) => f.inspection_id === inspectionId)
            .map(({ created_at: _c, updated_at: _u, ...row }) => row)

          try {
            if (deletedFeatureIds.length > 0) {
              const { error } = await supabase
                .from('plan_features')
                .delete()
                .in('id', deletedFeatureIds)
              if (error) throw error
            }
            if (upserts.length > 0) {
              const { error } = await supabase
                .from('plan_features')
                .upsert(upserts)
              if (error) throw error
            }
            set({ siteMapDirty: false, deletedFeatureIds: [] })
          } catch (err) {
            // Offline / transient failure: queue for replay, keep local state
            useSyncQueue.getState().enqueue('save_plan_features', {
              upserts,
              deleteIds: deletedFeatureIds,
            })
            set({ siteMapDirty: false, deletedFeatureIds: [] })
            const msg = err instanceof Error ? err.message : 'Failed to save site plan'
            console.warn('[SiteMap] Save queued for retry:', msg)
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
          sitePlans: s.sitePlans,
          activePlanId: s.activePlanId,
          planFeatures: s.planFeatures,
          deletedFeatureIds: s.deletedFeatureIds,
          siteMapDirty: s.siteMapDirty,
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
