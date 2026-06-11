import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Building2, MapPin, Hash, User2, FileText, Navigation,
  CheckCircle2, ChevronRight, Upload, ImageIcon, X, AlertCircle,
  Calendar, Layers, ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useInspectionStore, selectDraftComplete } from '@/store/inspection.store'
import type { IssueType } from '@/types/database'

// ─── Validation schema ────────────────────────────────────────

const schema = z.object({
  client_name:         z.string().min(1, 'Client name is required'),
  site_name:           z.string().min(1, 'Site name is required'),
  site_address:        z.string().min(1, 'Site address is required'),
  roof_area_reference: z.string().optional(),
  job_number:          z.string().optional(),
  quote_number:        z.string().optional(),
  date_of_inspection:  z.string().min(1, 'Inspection date is required'),
  issue_type:          z.enum(['recertification', 'non_compliant_follow_up', 'initial_inspection']),
})
type FormValues = z.infer<typeof schema>

// ─── Issue type options ───────────────────────────────────────

const ISSUE_TYPES: { value: IssueType; label: string; sub: string }[] = [
  {
    value: 'recertification',
    label: 'Recertification',
    sub: 'Annual AS1891.4:2009 recertification',
  },
  {
    value: 'initial_inspection',
    label: 'Initial Inspection',
    sub: 'First-time site assessment',
  },
  {
    value: 'non_compliant_follow_up',
    label: 'Non-Compliant Follow-Up',
    sub: 'Revisit after corrective action',
  },
]

// ─── GPS capture ──────────────────────────────────────────────

function useGPS() {
  const [loading, setLoading] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const capture = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported on this device')
      return
    }
    setLoading(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
      { timeout: 10000, enableHighAccuracy: true }
    )
  }

  return { loading, coords, error, capture }
}

// ─── Form field helper ────────────────────────────────────────

function Field({
  label, error, optional, children, icon: Icon,
}: {
  label: string
  error?: string
  optional?: boolean
  children: React.ReactNode
  icon?: typeof Building2
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
        {Icon && <Icon size={11} className="text-slate-500" />}
        {label}
        {optional && <span className="text-slate-600 normal-case tracking-normal font-normal text-[10px]">(optional)</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1.5 text-xs text-status-noncompliant flex items-center gap-1">
          <AlertCircle size={11} /> {error}
        </p>
      )}
    </div>
  )
}

function TextInput({
  hasError, className, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }) {
  return (
    <input
      className={cn(
        'w-full h-12 bg-surface-base border rounded-xl px-4 text-white text-sm',
        'placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-orange/50',
        'transition-colors hover:border-slate-500',
        hasError ? 'border-status-noncompliant' : 'border-surface-border',
        className
      )}
      {...props}
    />
  )
}

// ─── Site plan image drop zone ────────────────────────────────

function SitePlanDropzone({
  file, onFile, onClear,
}: {
  file: File | null
  onFile: (f: File) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const previewUrl = file ? URL.createObjectURL(file) : null

  const accept = 'image/jpeg,image/png,image/webp,image/heic,application/pdf'

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  if (previewUrl) {
    return (
      <div className="relative rounded-xl overflow-hidden border border-status-compliant/40 bg-surface-base">
        <img
          src={previewUrl}
          alt="Site plan preview"
          className="w-full h-48 object-cover"
        />
        <button
          type="button"
          onClick={onClear}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-surface-base/90 border border-surface-border flex items-center justify-center hover:bg-surface-overlay transition-colors"
        >
          <X size={14} className="text-slate-300" />
        </button>
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 px-3 py-2">
          <p className="text-white text-xs font-medium truncate">{file!.name}</p>
          <p className="text-slate-400 text-[10px]">Tap × to replace</p>
        </div>
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'relative flex flex-col items-center justify-center gap-3 h-40 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200',
        dragging
          ? 'border-brand-orange bg-brand-orange/10'
          : 'border-surface-border hover:border-brand-orange/50 hover:bg-surface-overlay bg-surface-base'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
        }}
      />
      <div className={cn(
        'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
        dragging ? 'bg-brand-orange/20' : 'bg-surface-overlay'
      )}>
        {dragging
          ? <Upload size={22} className="text-brand-orange" />
          : <ImageIcon size={22} className="text-slate-500" />
        }
      </div>
      <div className="text-center">
        <p className="text-slate-300 text-sm font-medium">
          {dragging ? 'Drop to upload' : 'Upload aerial / site plan'}
        </p>
        <p className="text-slate-600 text-xs mt-0.5">
          JPG, PNG, WEBP or PDF · Max 20 MB
        </p>
      </div>
    </div>
  )
}

// ─── NewInspection page ───────────────────────────────────────

export default function NewInspection() {
  const navigate = useNavigate()
  const { user, profile } = useAuthStore()
  const { draft, updateDraft, initDraft, createInspection, uploadSitePlanImage, saving, error, clearError } =
    useInspectionStore()

  // Init draft with profile defaults on first render only
  useEffect(() => {
    initDraft({
      certifier_id:            user?.id ?? '',
      certifier_name:          profile?.full_name ?? '',
      certifier_position:      profile?.position ?? '',
      certifier_accreditation: profile?.accreditation_number ?? '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [sitePlanFile, setSitePlanFile] = useState<File | null>(null)
  const gps = useGPS()

  const {
    register, handleSubmit, setValue, watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      client_name:         draft?.client_name ?? '',
      site_name:           draft?.site_name ?? '',
      site_address:        draft?.site_address ?? '',
      roof_area_reference: draft?.roof_area_reference ?? '',
      job_number:          draft?.job_number ?? '',
      quote_number:        draft?.quote_number ?? '',
      date_of_inspection:  draft?.date_of_inspection ?? new Date().toISOString().split('T')[0],
      issue_type:          draft?.issue_type ?? 'recertification',
    },
  })

  const selectedIssueType = watch('issue_type')

  // Sync form → draft on every change
  const syncField = (field: keyof FormValues, value: string) => {
    updateDraft({ [field]: value } as Parameters<typeof updateDraft>[0])
  }

  const handleGPS = async () => {
    gps.capture()
  }

  const onSubmit = async (values: FormValues) => {
    clearError()
    if (!user?.id) return

    // Persist final draft values
    updateDraft({
      ...values,
      latitude: gps.coords?.lat ?? null,
      longitude: gps.coords?.lng ?? null,
    })

    try {
      const inspectionId = await createInspection(user.id)

      // Upload site plan if provided
      if (sitePlanFile) {
        await uploadSitePlanImage(inspectionId, sitePlanFile)
      }

      navigate(`/inspections/${inspectionId}`)
    } catch {
      // error displayed from store
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="sticky top-0 lg:top-0 z-10 bg-surface-raised border-b border-surface-border">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-white hover:bg-surface-overlay transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="font-display text-base font-bold text-white">New Inspection</h1>
            <p className="text-slate-500 text-xs">AS1891.4:2009 · AS1657-2018 · AS5532-2013</p>
          </div>
        </div>

        {/* Standards badge bar */}
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-none">
          {['AS1891.4:2009', 'AS1657-2018', 'AS5532-2013'].map((s) => (
            <span
              key={s}
              className="shrink-0 text-[10px] font-mono font-medium text-brand-orange bg-brand-orange/10 border border-brand-orange/20 px-2 py-0.5 rounded-md"
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="px-4 py-6 space-y-6">

        {/* ── Error banner ──────────────────────────────────── */}
        {error && (
          <div className="flex items-start gap-3 p-3 rounded-xl bg-status-noncompliant-bg border border-status-noncompliant/30">
            <AlertCircle size={16} className="text-status-noncompliant mt-0.5 shrink-0" />
            <p className="text-status-noncompliant text-sm">{error}</p>
          </div>
        )}

        {/* ── SECTION: Issue Type ───────────────────────────── */}
        <section>
          <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="w-5 h-5 rounded-md bg-brand-orange/20 flex items-center justify-center text-brand-orange text-[10px] font-bold">1</span>
            Issue Type
          </h2>
          <div className="space-y-2">
            {ISSUE_TYPES.map(({ value, label, sub }) => (
              <label
                key={value}
                className={cn(
                  'flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all duration-150',
                  selectedIssueType === value
                    ? 'bg-brand-orange/10 border-brand-orange/50'
                    : 'bg-surface-raised border-surface-border hover:border-surface-overlay'
                )}
              >
                <input
                  type="radio"
                  value={value}
                  className="sr-only"
                  {...register('issue_type', {
                    onChange: (e) => syncField('issue_type', e.target.value),
                  })}
                />
                <div className={cn(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 transition-all',
                  selectedIssueType === value
                    ? 'border-brand-orange bg-brand-orange'
                    : 'border-surface-border'
                )}>
                  {selectedIssueType === value && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">{label}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{sub}</p>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* ── SECTION: Site Details ─────────────────────────── */}
        <section>
          <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="w-5 h-5 rounded-md bg-brand-orange/20 flex items-center justify-center text-brand-orange text-[10px] font-bold">2</span>
            Site Details
          </h2>
          <div className="space-y-4">
            <Field label="Client Name" icon={User2} error={errors.client_name?.message}>
              <TextInput
                placeholder="e.g. Vicinity Centres"
                hasError={!!errors.client_name}
                {...register('client_name', { onChange: (e) => syncField('client_name', e.target.value) })}
              />
            </Field>

            <Field label="Site Name" icon={Building2} error={errors.site_name?.message}>
              <TextInput
                placeholder="e.g. Emporium Melbourne"
                hasError={!!errors.site_name}
                {...register('site_name', { onChange: (e) => syncField('site_name', e.target.value) })}
              />
            </Field>

            <Field label="Site Address" icon={MapPin} error={errors.site_address?.message}>
              <TextInput
                placeholder="e.g. 287 Lonsdale St, Melbourne VIC 3000"
                hasError={!!errors.site_address}
                {...register('site_address', { onChange: (e) => syncField('site_address', e.target.value) })}
              />
            </Field>

            <Field label="Roof / Area Reference" icon={Layers} optional error={errors.roof_area_reference?.message}>
              <TextInput
                placeholder="e.g. Roof 01"
                hasError={!!errors.roof_area_reference}
                {...register('roof_area_reference', { onChange: (e) => syncField('roof_area_reference', e.target.value) })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Job #" icon={Hash} optional error={errors.job_number?.message}>
                <TextInput
                  placeholder="e.g. 14713"
                  hasError={!!errors.job_number}
                  {...register('job_number', { onChange: (e) => syncField('job_number', e.target.value) })}
                />
              </Field>
              <Field label="Quote #" icon={FileText} optional error={errors.quote_number?.message}>
                <TextInput
                  placeholder="e.g. Q-4872"
                  hasError={!!errors.quote_number}
                  {...register('quote_number', { onChange: (e) => syncField('quote_number', e.target.value) })}
                />
              </Field>
            </div>

            <Field label="Date of Inspection" icon={Calendar} error={errors.date_of_inspection?.message}>
              <TextInput
                type="date"
                hasError={!!errors.date_of_inspection}
                {...register('date_of_inspection', { onChange: (e) => syncField('date_of_inspection', e.target.value) })}
              />
            </Field>
          </div>
        </section>

        {/* ── SECTION: GPS ──────────────────────────────────── */}
        <section>
          <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="w-5 h-5 rounded-md bg-brand-orange/20 flex items-center justify-center text-brand-orange text-[10px] font-bold">3</span>
            GPS Location <span className="text-slate-600 font-normal normal-case tracking-normal">(optional)</span>
          </h2>

          {gps.coords ? (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-status-compliant-bg border border-status-compliant/30">
              <CheckCircle2 size={18} className="text-status-compliant shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-status-compliant text-sm font-semibold">Location captured</p>
                <p className="text-slate-500 text-xs font-mono">
                  {gps.coords.lat.toFixed(6)}, {gps.coords.lng.toFixed(6)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => gps.capture()}
                className="text-slate-400 hover:text-white text-xs transition-colors"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleGPS}
                disabled={gps.loading}
                className={cn(
                  'w-full flex items-center justify-center gap-2 h-12 rounded-xl border border-surface-border',
                  'bg-surface-raised text-slate-300 text-sm font-medium',
                  'hover:border-brand-orange/40 hover:text-white transition-all active:scale-[0.98]',
                  'disabled:opacity-60 disabled:cursor-not-allowed'
                )}
              >
                {gps.loading ? (
                  <span className="w-4 h-4 border-2 border-slate-600 border-t-brand-orange rounded-full animate-spin" />
                ) : (
                  <Navigation size={16} className="text-brand-orange" />
                )}
                {gps.loading ? 'Getting location…' : 'Capture GPS coordinates'}
              </button>
              {gps.error && (
                <p className="text-status-noncompliant text-xs flex items-center gap-1 px-1">
                  <AlertCircle size={11} /> {gps.error}
                </p>
              )}
            </div>
          )}
        </section>

        {/* ── SECTION: Site Plan ────────────────────────────── */}
        <section>
          <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="w-5 h-5 rounded-md bg-brand-orange/20 flex items-center justify-center text-brand-orange text-[10px] font-bold">4</span>
            Site Plan / Aerial Image <span className="text-slate-600 font-normal normal-case tracking-normal">(optional)</span>
          </h2>
          <SitePlanDropzone
            file={sitePlanFile}
            onFile={setSitePlanFile}
            onClear={() => setSitePlanFile(null)}
          />
          <p className="text-slate-600 text-xs mt-2 leading-relaxed px-1">
            Upload your aerial/drone photograph now, or add it later from the inspection screen.
            You'll be able to place and link asset markers on the image.
          </p>
        </section>

        {/* ── Submit ────────────────────────────────────────── */}
        <div className="pt-2 pb-4">
          <button
            type="submit"
            disabled={saving}
            className={cn(
              'w-full h-14 rounded-xl font-display font-bold text-lg tracking-wide',
              'bg-brand-orange text-white shadow-lg shadow-brand-orange/30',
              'flex items-center justify-center gap-2',
              'hover:bg-orange-500 active:scale-[0.98] transition-all duration-150',
              'disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100'
            )}
          >
            {saving ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Start Inspection
                <ChevronRight size={20} />
              </>
            )}
          </button>
          <p className="text-center text-slate-600 text-xs mt-3">
            Inspection will be saved as a draft until you submit the report.
          </p>
        </div>
      </form>
    </div>
  )
}
