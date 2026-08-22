import { useRef, useState, useEffect, useCallback } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { CheckCircle2, RotateCcw, Save, PenTool, User, AlertCircle, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { resolveStorageUrl } from '@/lib/storageUrls'

// ─── Types ────────────────────────────────────────────────────

export type SignatureRole = 'certifier'

export interface SignatureResult {
  role: SignatureRole
  dataUrl: string
  /** Storage path persisted to the database (bucket is private) */
  storageUrl: string
}

interface SignaturePadProps {
  inspectionId: string
  role: SignatureRole
  label: string
  sublabel?: string
  existingUrl?: string | null
  onSaved: (result: SignatureResult) => void
  disabled?: boolean
}

// ─── Upload helper ────────────────────────────────────────────

async function uploadSignature(
  inspectionId: string,
  role: SignatureRole,
  dataUrl: string
): Promise<string> {
  // Convert data URL to blob
  const res  = await fetch(dataUrl)
  const blob = await res.blob()
  const path = `${inspectionId}/${role}_${Date.now()}.png`

  const { error } = await supabase.storage
    .from('signatures')
    .upload(path, blob, { contentType: 'image/png', upsert: true })

  if (error) throw error

  // The bucket is private — persist the path; sign URLs at read time
  return path
}

// ─── Single pad ───────────────────────────────────────────────

function SinglePad({
  inspectionId, role, label, sublabel, existingUrl, onSaved, disabled = false,
}: SignaturePadProps) {
  const canvasRef  = useRef<SignatureCanvas>(null)
  const [saving,   setSaving]   = useState(false)
  const [isEmpty,  setIsEmpty]  = useState(true)
  const [saved,    setSaved]    = useState(!!existingUrl)
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  // The stored value is a storage path (or a legacy URL) — resolve
  // it to a signed URL for display.
  useEffect(() => {
    let alive = true
    if (existingUrl) {
      resolveStorageUrl('signatures', existingUrl).then((url) => {
        if (alive) setSavedUrl(url)
      })
    } else {
      setSavedUrl(null)
    }
    return () => { alive = false }
  }, [existingUrl])

  const handleBegin = () => setIsEmpty(false)

  const handleClear = () => {
    canvasRef.current?.clear()
    setIsEmpty(true)
    setSaved(false)
    setError(null)
  }

  const handleSave = useCallback(async () => {
    if (!canvasRef.current || canvasRef.current.isEmpty()) return
    setSaving(true)
    setError(null)
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png')
      const storagePath = await uploadSignature(inspectionId, role, dataUrl)
      setSavedUrl(dataUrl)  // display the freshly drawn signature directly
      setSaved(true)
      setIsEmpty(true)
      onSaved({ role, dataUrl, storageUrl: storagePath })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setSaving(false)
    }
  }, [inspectionId, role, onSaved])

  const roleIcon = User

  return (
    <div className={cn(
      'rounded-2xl border transition-all duration-200 overflow-hidden',
      saved ? 'border-status-compliant/40 bg-status-compliant-bg/10' : 'border-surface-border bg-surface-raised'
    )}>
      {/* Header */}
      <div className={cn(
        'flex items-center gap-3 px-4 py-3 border-b',
        saved ? 'border-status-compliant/20' : 'border-surface-border'
      )}>
        <div className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
          saved ? 'bg-status-compliant-bg' : 'bg-surface-overlay'
        )}>
          {saved
            ? <CheckCircle2 size={18} className="text-status-compliant" />
            : <PenTool size={18} className="text-brand-orange" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            'font-display font-bold text-sm uppercase tracking-wide',
            saved ? 'text-status-compliant' : 'text-white'
          )}>
            {label}
          </p>
          {sublabel && (
            <p className="text-slate-500 text-xs">{sublabel}</p>
          )}
        </div>
        {saved && (
          <button
            onClick={handleClear}
            className="text-slate-500 hover:text-white text-xs flex items-center gap-1 transition-colors"
          >
            <RotateCcw size={12} /> Re-sign
          </button>
        )}
      </div>

      {/* Saved state — show existing signature */}
      {saved && savedUrl && (
        <div className="p-4">
          <div className="bg-white rounded-xl overflow-hidden border border-status-compliant/20 h-28 flex items-center justify-center">
            <img
              src={savedUrl}
              alt={`${label} signature`}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <p className="text-status-compliant text-xs text-center mt-2 flex items-center justify-center gap-1">
            <CheckCircle2 size={11} /> Signature captured and saved
          </p>
        </div>
      )}

      {/* Drawing canvas */}
      {!saved && (
        <div className="p-4">
          <p className="text-slate-500 text-xs mb-2 flex items-center gap-1">
            <PenTool size={11} />
            Sign in the box below using your finger or stylus
          </p>

          {/* Canvas wrapper — white background for contrast */}
          <div className={cn(
            'relative rounded-xl overflow-hidden border-2 bg-white',
            isEmpty ? 'border-dashed border-slate-300' : 'border-brand-orange/40'
          )}>
            <SignatureCanvas
              ref={canvasRef}
              onBegin={handleBegin}
              canvasProps={{
                className: 'w-full block touch-none',
                style: { height: '120px' },
              }}
              backgroundColor="rgba(255,255,255,0)"
              penColor="#1a3a5c"
              dotSize={2}
              minWidth={1.5}
              maxWidth={3}
              velocityFilterWeight={0.7}
            />
            {/* Empty state hint */}
            {isEmpty && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="flex items-center gap-2 text-slate-300">
                  <PenTool size={16} />
                  <span className="text-sm">Sign here</span>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-status-noncompliant-bg border border-status-noncompliant/30">
              <AlertCircle size={13} className="text-status-noncompliant shrink-0" />
              <p className="text-status-noncompliant text-xs">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleClear}
              disabled={isEmpty}
              className="flex items-center gap-1.5 h-11 px-4 rounded-xl bg-surface-base border border-surface-border text-slate-400 text-sm hover:text-white transition-all disabled:opacity-40"
            >
              <RotateCcw size={14} /> Clear
            </button>
            <button
              onClick={handleSave}
              disabled={isEmpty || saving || disabled}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 h-11 rounded-xl font-display font-bold text-base transition-all',
                'active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed',
                !isEmpty && !saving
                  ? 'bg-brand-orange text-white shadow-md shadow-brand-orange/25 hover:bg-orange-500'
                  : 'bg-surface-overlay text-slate-500 border border-surface-border'
              )}
            >
              {saving
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><Upload size={15} /> Save Signature</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Exported compound component ─────────────────────────────

interface SignatureSectionProps {
  inspectionId: string
  certifierName?: string
  existingCertifierUrl?: string | null
  onCertifierSaved: (url: string) => void
}

export function SignatureSection({
  inspectionId,
  certifierName,
  existingCertifierUrl,
  onCertifierSaved,
}: SignatureSectionProps) {
  const signed = !!existingCertifierUrl

  return (
    <div className="bg-surface-raised rounded-2xl border border-surface-border overflow-hidden">
      {/* Section header */}
      <div className="px-4 py-3 border-b border-surface-border">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center',
            signed ? 'bg-status-compliant-bg' : 'bg-brand-orange/10'
          )}>
            {signed
              ? <CheckCircle2 size={18} className="text-status-compliant" />
              : <PenTool size={18} className="text-brand-orange" />
            }
          </div>
          <div>
            <h3 className="font-display font-bold text-white text-base uppercase tracking-wide">
              Signature
            </h3>
            <p className="text-slate-500 text-xs">
              {signed ? 'Certifier signature captured' : 'Required for final report'}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4">
        <SinglePad
          inspectionId={inspectionId}
          role="certifier"
          label="Certifier Signature"
          sublabel={certifierName ?? 'Accredited Inspector'}
          existingUrl={existingCertifierUrl}
          onSaved={(r) => onCertifierSaved(r.storageUrl)}
        />
      </div>
    </div>
  )
}
