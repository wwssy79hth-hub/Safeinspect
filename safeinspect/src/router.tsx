import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'

// ── Auth pages ───────────────────────────────────────────────
import LoginPage        from '@/pages/auth/LoginPage'
import SignUpPage       from '@/pages/auth/SignUpPage'
import AuthCallbackPage from '@/pages/auth/AuthCallbackPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'

// ── App pages ────────────────────────────────────────────────
import Dashboard      from '@/pages/Dashboard'
import NewInspection  from '@/pages/inspections/NewInspection'
import InspectionDetail from '@/pages/inspections/InspectionDetail'

// ── Stubs (built in Step 3+) ─────────────────────────────────
const Stub = ({ label }: { label: string }) => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="text-center">
      <p className="text-brand-orange font-display text-2xl font-bold">{label}</p>
      <p className="text-slate-500 text-sm mt-1">Coming in the next step</p>
    </div>
  </div>
)

const UnauthorizedPage = () => (
  <div className="min-h-screen bg-surface-base flex items-center justify-center">
    <div className="text-center">
      <p className="text-status-noncompliant font-display text-2xl font-bold mb-2">Access Denied</p>
      <p className="text-slate-400">You don't have permission to view this page.</p>
    </div>
  </div>
)

const VerifyEmailPage = () => (
  <div className="min-h-screen bg-surface-base flex items-center justify-center px-4">
    <div className="text-center max-w-sm">
      <div className="w-16 h-16 rounded-2xl bg-status-compliant-bg mx-auto mb-4 flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.57A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
        </svg>
      </div>
      <h2 className="font-display text-2xl font-bold text-white mb-2">Verify your email</h2>
      <p className="text-slate-400 text-sm leading-relaxed">
        We've sent a confirmation email. Click the link to activate your account.
      </p>
    </div>
  </div>
)

// ─── Router ──────────────────────────────────────────────────

const router = createBrowserRouter([
  // ── Public ──────────────────────────────────────────────
  {
    path: '/auth',
    children: [
      { index: true, element: <Navigate to="/auth/login" replace /> },
      { path: 'login',          element: <LoginPage /> },
      { path: 'signup',         element: <SignUpPage /> },
      { path: 'callback',       element: <AuthCallbackPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'verify-email',   element: <VerifyEmailPage /> },
    ],
  },
  { path: '/unauthorized', element: <UnauthorizedPage /> },

  // ── Protected (with AppShell) ────────────────────────────
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/dashboard',             element: <Dashboard /> },
          { path: '/inspections',           element: <Stub label="Inspections List" /> },
          { path: '/inspections/new',       element: <NewInspection /> },
          { path: '/inspections/scan',      element: <Stub label="QR Scanner" /> },
          { path: '/inspections/:id',       element: <InspectionDetail /> },
          { path: '/inspections/:id/map',   element: <Stub label="Site Map" /> },
          { path: '/inspections/:id/assets/:category', element: <Stub label="Asset Entry" /> },
          { path: '/reports',               element: <Stub label="Reports" /> },
          { path: '/templates',             element: <Stub label="Templates" /> },
          { path: '/team',                  element: <Stub label="Team" /> },
          { path: '/profile',               element: <Stub label="Profile" /> },
        ],
      },
    ],
  },

  // ── Root ─────────────────────────────────────────────────
  { path: '/',  element: <Navigate to="/dashboard" replace /> },
  { path: '*',  element: <Navigate to="/dashboard" replace /> },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
