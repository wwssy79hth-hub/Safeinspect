import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Mail, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { resetRequestSchema, type ResetRequestFormValues } from '@/lib/schemas/auth.schemas'

export default function ResetPasswordPage() {
  const { resetPassword, loading, error, clearError } = useAuthStore()
  const [sent, setSent] = useState(false)

  const { register, handleSubmit, getValues, formState: { errors } } = useForm<ResetRequestFormValues>({
    resolver: zodResolver(resetRequestSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = async (values: ResetRequestFormValues) => {
    clearError()
    try {
      await resetPassword(values.email)
      setSent(true)
    } catch {
      // error in store
    }
  }

  return (
    <div className="min-h-screen bg-surface-base flex flex-col">
      <div className="h-1 bg-gradient-to-r from-brand-blue via-brand-orange to-brand-light" />

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <Link
            to="/auth/login"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-8 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to sign in
          </Link>

          <div className="bg-surface-raised rounded-2xl border border-surface-border shadow-2xl p-6">
            {!sent ? (
              <>
                <div className="mb-6">
                  <h2 className="font-display text-2xl font-bold text-white mb-1">Reset password</h2>
                  <p className="text-slate-400 text-sm">
                    Enter your email and we'll send you a reset link.
                  </p>
                </div>

                {error && (
                  <div className="flex items-start gap-3 p-3 mb-4 rounded-lg bg-status-noncompliant-bg border border-status-noncompliant/30">
                    <AlertCircle size={16} className="text-status-noncompliant mt-0.5 shrink-0" />
                    <p className="text-status-noncompliant text-sm">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} noValidate>
                  <div className="mb-6">
                    <label className="block text-field-label font-medium text-slate-300 uppercase tracking-widest mb-2">
                      Email
                    </label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="email"
                        autoComplete="email"
                        placeholder="inspector@abseal.com.au"
                        className={cn(
                          'w-full h-touch bg-surface-base border rounded-xl pl-10 pr-4 text-white text-field-value',
                          'placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-orange/60 transition-colors',
                          errors.email ? 'border-status-noncompliant' : 'border-surface-border hover:border-slate-500'
                        )}
                        {...register('email')}
                      />
                    </div>
                    {errors.email && (
                      <p className="mt-1.5 text-xs text-status-noncompliant">{errors.email.message}</p>
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
                    ) : 'Send Reset Link'}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-status-compliant-bg mb-4">
                  <CheckCircle2 size={28} className="text-status-compliant" />
                </div>
                <h3 className="text-white font-display text-xl font-semibold mb-2">Check your email</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                  A password reset link has been sent to{' '}
                  <span className="text-white font-medium">{getValues('email')}</span>.
                </p>
                <Link
                  to="/auth/login"
                  className="text-brand-light text-sm hover:text-white transition-colors"
                >
                  Return to sign in
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
