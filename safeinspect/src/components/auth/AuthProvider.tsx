import { useEffect, type ReactNode } from 'react'
import { authService } from '@/lib/auth'
import { useAuthStore } from '@/store/auth.store'

interface AuthProviderProps {
  children: ReactNode
}

/**
 * AuthProvider must wrap the entire app.
 * It initializes the session on mount and subscribes to
 * Supabase auth state changes (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.)
 * keeping the Zustand store in sync.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const { initialize, setSession } = useAuthStore()

  useEffect(() => {
    // 1. Restore session from local storage
    initialize()

    // 2. Subscribe to future auth events
    const unsubscribe = authService.onAuthStateChange((event, session) => {
      switch (event) {
        case 'SIGNED_IN':
        case 'TOKEN_REFRESHED':
        case 'USER_UPDATED':
          setSession(session)
          break
        case 'SIGNED_OUT':
          setSession(null)
          break
        default:
          break
      }
    })

    return () => {
      unsubscribe()
    }
  }, [initialize, setSession])

  return <>{children}</>
}
