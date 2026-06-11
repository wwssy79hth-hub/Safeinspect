import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store'
import type { UserRole } from '@/types/database'

interface ProtectedRouteProps {
  /** Redirect unauthenticated users here. Defaults to /auth/login */
  redirectTo?: string
  /** Optionally restrict to specific roles */
  allowedRoles?: UserRole[]
}

/**
 * Wrap any route that requires authentication.
 * Usage in router:
 *   <Route element={<ProtectedRoute />}>
 *     <Route path="/dashboard" element={<Dashboard />} />
 *   </Route>
 */
export function ProtectedRoute({
  redirectTo = '/auth/login',
  allowedRoles,
}: ProtectedRouteProps) {
  const location = useLocation()
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const initialized = useAuthStore((s) => s.initialized)
  const loading = useAuthStore((s) => s.loading)
  const profile = useAuthStore((s) => s.profile)

  // Wait for session restore before making any decision
  if (!initialized || loading) {
    return <AuthLoadingScreen />
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to={redirectTo}
        state={{ from: location }}
        replace
      />
    )
  }

  // Role guard
  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <Outlet />
}

/**
 * Full-screen loading state shown while session is being restored.
 * Uses brand colors — no layout shell needed yet.
 */
function AuthLoadingScreen() {
  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        {/* Abseal brand mark placeholder */}
        <div className="w-12 h-12 rounded-xl bg-brand-orange animate-pulse-orange" />
        <p className="text-slate-400 text-sm font-mono tracking-widest uppercase">
          Loading…
        </p>
      </div>
    </div>
  )
}
