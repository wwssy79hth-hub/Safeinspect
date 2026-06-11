import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Eye, EyeOff, Mail, Lock, ArrowRight, Zap, AlertCircle, CheckCircle2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import {
  signInSchema, magicLinkSchema,
  type SignInFormValues, type MagicLinkFormValues,
} from '@/lib/schemas/auth.schemas'

type AuthMode = 'password' | 'magic-link'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/dashboard'

  const { signIn, sendMagicLink, loading, error, clearError } = useAuthStore()

  const [mode, setMode] = useState<AuthMode>('password')
  const [showPassword, setShowPassword] = useState(false)
  const [magicSent, setMagicSent] = useState(false)

  // Password form
  const passwordForm = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  })

  // Magic link form
  const magicForm = useForm<MagicLinkFormValues>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: '' },
  })

  const handlePasswordSubmit = async (values: SignInFormValues) => {
    clearError()
    try {
      await signIn(values.email, values.password)
      navigate(from, { replace: true })
    } catch {
      // error is already set in store
    }
  }

  const handleMagicLinkSubmit = async (values: MagicLinkFormValues) => {
    clearError()
    try {
      await sendMagicLink(values.email)
      setMagicSent(true)
    } catch {
      // error already set
    }
  }

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode)
    setMagicSent(false)
    clearError()
  }

  return (
    <div className="min-h-screen bg-surface-base flex flex-col">
      {/* Top bar accent */}
      <div className="h-1 bg-gradient-to-r from-brand-blue via-brand-orange to-brand-light" />

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          {/* Logo / Brand */}
          <div className="mb-10 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-orange mb-4 shadow-lg shadow-brand-orange/30 animate-pulse-orange">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                {/* Stylised shield icon */}
                <path
                  d="M16 3L4 8v8c0 6.627 5.373 13 12 13s12-6.373 12-13V8L16 3z"
                  fill="white"
                  fillOpacity="0.9"
                />
                <path
                  d="M11 16l3 3 7-7"
                  stroke="#f97316"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="font-display text-3xl font-bold text-white tracking-tight">
              SafeInspect
            </h1>
            <p className="text-slate-400 text-sm mt-1 font-sans">
              Height Safety Inspection Platform
            </p>
          </div>

          {/* Card */}
          <div className="bg-surface-raised rounded-2xl border border-surface-border shadow-2xl p-6">

            {/* Mode toggle */}
            <div className="flex rounded-xl bg-surface-base p-1 mb-6 gap-1">
              <button
                onClick={() => switchMode('password')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  mode === 'password'
                    ? 'bg-brand-orange text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                <Lock size={14} />
                Password
              </button>
              <button
                onClick={() => switchMode('magic-link')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  mode === 'magic-link'
                    ? 'bg-brand-orange text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                <Zap size={14} />
                Magic Link
              </button>
            </div>

            {/* Error banner */}
            {error && (
              <div className="flex items-start gap-3 p-3 mb-4 rounded-lg bg-status-noncompliant-bg border border-status-noncompliant/30">
                <AlertCircle size={16} className="text-status-noncompliant mt-0.5 shrink-0" />
                <p className="text-status-noncompliant text-sm">{error}</p>
              </div>
            )}

            {/* ── Password Form ── */}
            {mode === 'password' && (
              <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)} noValidate>
                {/* Email */}
                <div className="mb-4">
                  <label className="block text-field-label font-medium text-slate-300 uppercase tracking-widest mb-2">
                    Email
                  </label>
                  <div className="relative">
                    <Mail
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                    />
                    <input
                      type="email"
                      autoComplete="email"
                      placeholder="inspector@abseal.com.au"
                      className={cn(
                        'w-full h-touch bg-surface-base border rounded-xl pl-10 pr-4 text-white text-field-value',
                        'placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-orange/60',
                        'transition-colors',
                        passwordForm.formState.errors.email
                          ? 'border-status-noncompliant'
                          : 'border-surface-border hover:border-slate-500'
                      )}
                      {...passwordForm.register('email')}
                    />
                  </div>
                  {passwordForm.formState.errors.email && (
                    <p className="mt-1.5 text-xs text-status-noncompliant">
                      {passwordForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                {/* Password */}
                <div className="mb-2">
                  <label className="block text-field-label font-medium text-slate-300 uppercase tracking-widest mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Lock
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                    />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className={cn(
                        'w-full h-touch bg-surface-base border rounded-xl pl-10 pr-12 text-white text-field-value',
                        'placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-orange/60',
                        'transition-colors',
                        passwordForm.formState.errors.password
                          ? 'border-status-noncompliant'
                          : 'border-surface-border hover:border-slate-500'
                      )}
                      {...passwordForm.register('password')}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {passwordForm.formState.errors.password && (
                    <p className="mt-1.5 text-xs text-status-noncompliant">
                      {passwordForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                {/* Forgot password link */}
                <div className="flex justify-end mb-6">
                  <Link
                    to="/auth/reset-password"
                    className="text-xs text-brand-light hover:text-white transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className={cn(
                    'w-full h-touch-lg rounded-xl font-display font-semibold text-lg tracking-wide',
                    'bg-brand-orange text-white shadow-lg shadow-brand-orange/30',
                    'flex items-center justify-center gap-2',
                    'hover:bg-orange-500 active:scale-[0.98] transition-all duration-150',
                    'disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100'
                  )}
                >
                  {loading ? (
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      Sign In
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* ── Magic Link Form ── */}
            {mode === 'magic-link' && !magicSent && (
              <form onSubmit={magicForm.handleSubmit(handleMagicLinkSubmit)} noValidate>
                <p className="text-slate-400 text-sm mb-5 leading-relaxed">
                  Enter your email and we'll send you a one-click sign-in link — no password needed.
                </p>

                <div className="mb-6">
                  <label className="block text-field-label font-medium text-slate-300 uppercase tracking-widest mb-2">
                    Email
                  </label>
                  <div className="relative">
                    <Mail
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                    />
                    <input
                      type="email"
                      autoComplete="email"
                      placeholder="inspector@abseal.com.au"
                      className={cn(
                        'w-full h-touch bg-surface-base border rounded-xl pl-10 pr-4 text-white text-field-value',
                        'placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-orange/60',
                        'transition-colors',
                        magicForm.formState.errors.email
                          ? 'border-status-noncompliant'
                          : 'border-surface-border hover:border-slate-500'
                      )}
                      {...magicForm.register('email')}
                    />
                  </div>
                  {magicForm.formState.errors.email && (
                    <p className="mt-1.5 text-xs text-status-noncompliant">
                      {magicForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={cn(
                    'w-full h-touch-lg rounded-xl font-display font-semibold text-lg tracking-wide',
                    'bg-brand-orange text-white shadow-lg shadow-brand-orange/30',
                    'flex items-center justify-center gap-2',
                    'hover:bg-orange-500 active:scale-[0.98] transition-all duration-150',
                    'disabled:opacity-60 disabled:cursor-not-allowed'
                  )}
                >
                  {loading ? (
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      Send Magic Link
                      <Zap size={18} />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* ── Magic Link Sent ── */}
            {mode === 'magic-link' && magicSent && (
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-status-compliant-bg mb-4">
                  <CheckCircle2 size={28} className="text-status-compliant" />
                </div>
                <h3 className="text-white font-display text-xl font-semibold mb-2">
                  Check your email
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                  A sign-in link has been sent to{' '}
                  <span className="text-white font-medium">
                    {magicForm.getValues('email')}
                  </span>
                  . It expires in 1 hour.
                </p>
                <button
                  onClick={() => {
                    setMagicSent(false)
                    magicForm.reset()
                    clearError()
                  }}
                  className="text-brand-light text-sm hover:text-white transition-colors"
                >
                  Send to a different email
                </button>
              </div>
            )}
          </div>

          {/* Sign up link */}
          <p className="text-center text-slate-500 text-sm mt-6">
            New to SafeInspect?{' '}
            <Link
              to="/auth/signup"
              className="text-brand-light hover:text-white font-medium transition-colors"
            >
              Create an account
            </Link>
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="pb-6 text-center">
        <p className="text-slate-600 text-xs">
          Abseal Pty Ltd · Height Safety Specialists
        </p>
      </div>
    </div>
  )
}
