import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth.store'

/**
 * Supabase redirects here after:
 * - Magic link click
 * - Password reset link click
 * - OAuth sign-in
 *
 * The URL will contain a hash fragment with the session tokens.
 * Supabase client auto-detects and processes these.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const { initialize } = useAuthStore()

  useEffect(() => {
    const handleCallback = async () => {
      // Supabase auto-processes the URL hash (access_token, refresh_token)
      const { data, error } = await supabase.auth.getSession()

      if (error) {
        console.error('Auth callback error:', error)
        navigate('/auth/login?error=callback_failed', { replace: true })
        return
      }

      if (data.session) {
        await initialize()
        navigate('/dashboard', { replace: true })
      } else {
        navigate('/auth/login', { replace: true })
      }
    }

    handleCallback()
  }, [navigate, initialize])

  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-brand-orange animate-pulse-orange" />
        <p className="text-slate-400 text-sm font-mono tracking-widest uppercase">
          Signing you in…
        </p>
      </div>
    </div>
  )
}
