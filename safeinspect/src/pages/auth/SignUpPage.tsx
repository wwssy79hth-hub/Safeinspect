import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Eye, EyeOff, Mail, Lock, User, BadgeCheck, Briefcase, ArrowRight, AlertCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { signUpSchema, type SignUpFormValues } from '@/lib/schemas/auth.schemas'

export default function SignUpPage() {
  const navigate = useNavigate()
  const { signUp, loading, error, clearError } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      fullName: '',
      email: '',
      position: '',
      accreditationNumber: '',
      password: '',
      confirmPassword: '',
    },
  })

  const onSubmit = async (values: SignUpFormValues) => {
    clearError()
    try {
      await signUp({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        position: values.position,
        accreditationNumber: values.accreditationNumber,
      })
      navigate('/auth/verify-email', { replace: true })
    } catch {
      // error set in store
    }
  }

  return (
    <div className="min-h-screen bg-surface-base flex flex-col">
      <div className="h-1 bg-gradient-to-r from-brand-blue via-brand-orange to-brand-light" />

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="mb-8 text-center">
            <Link to="/auth/login" className="inline-flex items-center gap-2 mb-6">
              <div className="w-10 h-10 rounded-xl bg-brand-orange flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
                  <path d="M16 3L4 8v8c0 6.627 5.373 13 12 13s12-6.373 12-13V8L16 3z" fill="white" fillOpacity="0.9" />
                  <path d="M11 16l3 3 7-7" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="font-display text-xl font-bold text-white">SafeInspect</span>
            </Link>
            <h2 className="font-display text-2xl font-bold text-white">Create your account</h2>
            <p className="text-slate-400 text-sm mt-1">Inspector registration</p>
          </div>

          <div className="bg-surface-raised rounded-2xl border border-surface-border shadow-2xl p-6">
            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 p-3 mb-4 rounded-lg bg-status-noncompliant-bg border border-status-noncompliant/30">
                <AlertCircle size={16} className="text-status-noncompliant mt-0.5 shrink-0" />
                <p className="text-status-noncompliant text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
              {/* Full Name */}
              <Field label="Full Name" error={errors.fullName?.message}>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    autoComplete="name"
                    placeholder="Jane Smith"
                    className={inputCls(!!errors.fullName)}
                    {...register('fullName')}
                  />
                </div>
              </Field>

              {/* Email */}
              <Field label="Email" error={errors.email?.message}>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="jane@abseal.com.au"
                    className={inputCls(!!errors.email)}
                    {...register('email')}
                  />
                </div>
              </Field>

              {/* Position (optional) */}
              <Field label="Position / Qualification" error={errors.position?.message} optional>
                <div className="relative">
                  <Briefcase size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="e.g. Accredited Installer"
                    className={inputCls(!!errors.position)}
                    {...register('position')}
                  />
                </div>
              </Field>

              {/* Accreditation Number (optional) */}
              <Field label="Accreditation Number" error={errors.accreditationNumber?.message} optional>
                <div className="relative">
                  <BadgeCheck size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="e.g. AI-12345"
                    className={inputCls(!!errors.accreditationNumber)}
                    {...register('accreditationNumber')}
                  />
                </div>
              </Field>

              {/* Password */}
              <Field label="Password" error={errors.password?.message}>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Min 8 characters"
                    className={cn(inputCls(!!errors.password), 'pr-12')}
                    {...register('password')}
                  />
                  <button type="button" tabIndex={-1}
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>

              {/* Confirm Password */}
              <Field label="Confirm Password" error={errors.confirmPassword?.message}>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Repeat password"
                    className={cn(inputCls(!!errors.confirmPassword), 'pr-12')}
                    {...register('confirmPassword')}
                  />
                  <button type="button" tabIndex={-1}
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>

              <button
                type="submit"
                disabled={loading}
                className={cn(
                  'w-full h-touch-lg rounded-xl font-display font-semibold text-lg tracking-wide mt-2',
                  'bg-brand-orange text-white shadow-lg shadow-brand-orange/30',
                  'flex items-center justify-center gap-2',
                  'hover:bg-orange-500 active:scale-[0.98] transition-all duration-150',
                  'disabled:opacity-60 disabled:cursor-not-allowed'
                )}
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Create Account <ArrowRight size={18} /></>
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-slate-500 text-sm mt-6">
            Already have an account?{' '}
            <Link to="/auth/login" className="text-brand-light hover:text-white font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Small helpers ────────────────────────────────────────────

function Field({
  label, error, optional, children
}: {
  label: string; error?: string; optional?: boolean; children: React.ReactNode
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-field-label font-medium text-slate-300 uppercase tracking-widest mb-2">
        {label}
        {optional && <span className="text-slate-600 normal-case tracking-normal font-normal">(optional)</span>}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-status-noncompliant">{error}</p>}
    </div>
  )
}

function inputCls(hasError: boolean) {
  return cn(
    'w-full h-touch bg-surface-base border rounded-xl pl-10 pr-4 text-white text-field-value',
    'placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-orange/60 transition-colors',
    hasError ? 'border-status-noncompliant' : 'border-surface-border hover:border-slate-500'
  )
}
