import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Session, User } from '@supabase/supabase-js'
import type { Profile } from '@/types/database'
import { authService } from '@/lib/auth'

// ─── State Shape ──────────────────────────────────────────────

interface AuthState {
  // Data
  session: Session | null
  user: User | null
  profile: Profile | null

  // UI state
  loading: boolean
  initialized: boolean
  error: string | null

  // Actions
  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (payload: {
    email: string
    password: string
    fullName: string
    position?: string
    accreditationNumber?: string
  }) => Promise<void>
  sendMagicLink: (email: string) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  signOut: () => Promise<void>
  setSession: (session: Session | null) => void
  setProfile: (profile: Profile | null) => void
  clearError: () => void
}

// ─── Store ────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
  devtools(
    (set, get) => ({
      session: null,
      user: null,
      profile: null,
      loading: false,
      initialized: false,
      error: null,

      /**
       * Called once on app mount. Restores session and fetches profile.
       */
      initialize: async () => {
        set({ loading: true })
        try {
          const session = await authService.getSession()
          if (session?.user) {
            const profile = await authService.getProfile(session.user.id)
            set({ session, user: session.user, profile })
          } else {
            set({ session: null, user: null, profile: null })
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to initialize session'
          set({ error: message })
        } finally {
          set({ loading: false, initialized: true })
        }
      },

      signIn: async (email, password) => {
        set({ loading: true, error: null })
        try {
          const { session, user } = await authService.signIn({ email, password })
          if (user) {
            const profile = await authService.getProfile(user.id)
            set({ session, user, profile })
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Sign in failed'
          set({ error: message })
          throw err
        } finally {
          set({ loading: false })
        }
      },

      signUp: async (payload) => {
        set({ loading: true, error: null })
        try {
          const { session, user } = await authService.signUp(payload)
          if (user) {
            // Profile is created via DB trigger, but we create it here as fallback
            const profile = await authService.upsertProfile({
              id: user.id,
              email: user.email!,
              full_name: payload.fullName,
              position: payload.position ?? null,
              accreditation_number: payload.accreditationNumber ?? null,
              role: 'inspector',
              company: 'Abseal Pty Ltd',
              avatar_url: null,
            })
            set({ session, user, profile })
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Sign up failed'
          set({ error: message })
          throw err
        } finally {
          set({ loading: false })
        }
      },

      sendMagicLink: async (email) => {
        set({ loading: true, error: null })
        try {
          await authService.sendMagicLink(email)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to send magic link'
          set({ error: message })
          throw err
        } finally {
          set({ loading: false })
        }
      },

      resetPassword: async (email) => {
        set({ loading: true, error: null })
        try {
          await authService.resetPassword(email)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to send reset email'
          set({ error: message })
          throw err
        } finally {
          set({ loading: false })
        }
      },

      signOut: async () => {
        set({ loading: true, error: null })
        try {
          await authService.signOut()
          set({ session: null, user: null, profile: null })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Sign out failed'
          set({ error: message })
        } finally {
          set({ loading: false })
        }
      },

      setSession: (session) => {
        const user = session?.user ?? null
        set({ session, user })
        // Fetch profile whenever session changes
        if (user) {
          authService.getProfile(user.id).then((profile) => {
            // Only update if still the same user
            if (get().user?.id === user.id) {
              set({ profile })
            }
          })
        } else {
          set({ profile: null })
        }
      },

      setProfile: (profile) => set({ profile }),
      clearError: () => set({ error: null }),
    }),
    { name: 'AuthStore' }
  )
)

// ─── Selectors ────────────────────────────────────────────────

export const selectIsAuthenticated = (s: AuthState) =>
  !!s.session && !!s.user

export const selectIsAdmin = (s: AuthState) =>
  s.profile?.role === 'admin'

export const selectDisplayName = (s: AuthState) =>
  s.profile?.full_name ?? s.user?.email ?? 'Inspector'
