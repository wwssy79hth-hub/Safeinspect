import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/database'

// ─── Types ───────────────────────────────────────────────────

export interface SignInWithPasswordPayload {
  email: string
  password: string
}

export interface SignUpPayload {
  email: string
  password: string
  fullName: string
  position?: string
  accreditationNumber?: string
}

export interface AuthError {
  message: string
  status?: number
}

// ─── Auth Operations ─────────────────────────────────────────

export const authService = {
  /**
   * Sign in with email + password.
   */
  async signIn({ email, password }: SignInWithPasswordPayload) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) throw error
    return data
  },

  /**
   * Sign up and create a profile row.
   */
  async signUp({ email, password, fullName, position, accreditationNumber }: SignUpPayload) {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          full_name: fullName,
          position: position ?? null,
          accreditation_number: accreditationNumber ?? null,
        },
      },
    })
    if (error) throw error
    return data
  },

  /**
   * Send a magic-link email for passwordless sign-in.
   */
  async sendMagicLink(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) throw error
  },

  /**
   * Send password reset email.
   */
  async resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/auth/reset-password` }
    )
    if (error) throw error
  },

  /**
   * Update password (used after reset redirect).
   */
  async updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
  },

  /**
   * Sign out and clear session.
   */
  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  /**
   * Get the current session (null if not signed in).
   */
  async getSession() {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    return data.session
  },

  /**
   * Get the current user's profile from the profiles table.
   */
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // not found
      throw error
    }
    return data
  },

  /**
   * Upsert profile (called after sign-up or profile edits).
   */
  async upsertProfile(profile: Partial<Profile> & { id: string }): Promise<Profile> {
    const { data, error } = await supabase
      .from('profiles')
      .upsert({ ...profile, updated_at: new Date().toISOString() })
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Subscribe to auth state changes. Returns the unsubscribe function.
   */
  onAuthStateChange(
    callback: (event: string, session: Awaited<ReturnType<typeof authService.getSession>>) => void
  ) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session)
    })
    return data.subscription.unsubscribe
  },
}
