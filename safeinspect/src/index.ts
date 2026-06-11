// Auth components
export { AuthProvider } from './components/auth/AuthProvider'
export { ProtectedRoute } from './components/auth/ProtectedRoute'

// Auth store
export { useAuthStore, selectIsAuthenticated, selectIsAdmin, selectDisplayName } from './store/auth.store'

// Auth service
export { authService } from './lib/auth'

// Supabase client
export { supabase } from './lib/supabase'

// Utilities
export { cn } from './lib/utils'
