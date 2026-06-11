import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { OfflineBanner } from '@/components/layout/OfflineBanner'
import {
  LayoutDashboard, ClipboardList, FileText, Users, UserCircle,
  LogOut, ShieldCheck, Menu, X, Bell,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useAuthStore, selectDisplayName } from '@/store/auth.store'

// ─── Nav items ────────────────────────────────────────────────

const NAV_ITEMS = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/inspections',  icon: ClipboardList,   label: 'Inspections' },
  { to: '/reports',      icon: FileText,        label: 'Reports' },
  { to: '/team',         icon: Users,           label: 'Team' },
  { to: '/profile',      icon: UserCircle,      label: 'Profile' },
] as const

// ─── AppShell ─────────────────────────────────────────────────

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()
  const { signOut, profile } = useAuthStore()
  const displayName = useAuthStore(selectDisplayName)

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth/login')
  }

  return (
    <div className="min-h-screen bg-surface-base flex">
      {/* ── Offline / sync status banner ─────────────────────── */}
      <OfflineBanner />

      {/* ── Desktop Sidebar ─────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 bg-surface-raised border-r border-surface-border shrink-0 fixed inset-y-0 left-0 z-20">
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-surface-border">
          <div className="w-8 h-8 rounded-lg bg-brand-orange flex items-center justify-center shrink-0 animate-pulse-orange">
            <ShieldCheck size={17} className="text-white" />
          </div>
          <div>
            <span className="font-display text-lg font-bold text-white tracking-wide">SafeInspect</span>
            <p className="text-slate-500 text-[10px] uppercase tracking-widest leading-none mt-0.5">Height Safety</p>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-150 group',
                isActive
                  ? 'bg-brand-orange/15 text-brand-orange border border-brand-orange/25'
                  : 'text-slate-400 hover:text-white hover:bg-surface-overlay'
              )}
            >
              {({ isActive }) => (
                <>
                  <Icon size={18} className={isActive ? 'text-brand-orange' : 'text-slate-500 group-hover:text-slate-300'} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User + sign out */}
        <div className="p-3 border-t border-surface-border">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-overlay mb-2">
            <div className="w-8 h-8 rounded-lg bg-brand-blue flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold font-display">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{displayName}</p>
              <p className="text-slate-500 text-xs truncate">{profile?.position ?? 'Inspector'}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-surface-overlay text-sm transition-all"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Mobile Sidebar overlay ───────────────────────────── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex animate-fade-in">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Drawer */}
          <aside className="relative z-50 w-72 bg-surface-raised border-r border-surface-border flex flex-col animate-slide-up">
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-5 border-b border-surface-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-orange flex items-center justify-center">
                  <ShieldCheck size={17} className="text-white" />
                </div>
                <span className="font-display text-lg font-bold text-white">SafeInspect</span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-surface-overlay"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1">
              {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) => cn(
                    'flex items-center gap-3 px-3 py-3.5 rounded-xl text-sm font-medium transition-all',
                    isActive
                      ? 'bg-brand-orange/15 text-brand-orange border border-brand-orange/25'
                      : 'text-slate-400 hover:text-white hover:bg-surface-overlay'
                  )}
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={18} className={isActive ? 'text-brand-orange' : 'text-slate-500'} />
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="p-3 border-t border-surface-border">
              <div className="flex items-center gap-3 px-3 py-2.5 mb-2">
                <div className="w-8 h-8 rounded-lg bg-brand-blue flex items-center justify-center">
                  <span className="text-white text-xs font-bold font-display">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{displayName}</p>
                  <p className="text-slate-500 text-xs truncate">{profile?.position ?? 'Inspector'}</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-surface-overlay text-sm"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main Content Area ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64">
        {/* Mobile top bar */}
        <header className="lg:hidden h-14 bg-surface-raised border-b border-surface-border flex items-center justify-between px-4 sticky top-0 z-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-white hover:bg-surface-overlay"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-orange flex items-center justify-center">
              <ShieldCheck size={15} className="text-white" />
            </div>
            <span className="font-display text-base font-bold text-white">SafeInspect</span>
          </div>
          <button className="p-2 -mr-2 rounded-xl text-slate-400 hover:text-white hover:bg-surface-overlay relative">
            <Bell size={20} />
            {/* Notification dot */}
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-brand-orange" />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 pb-24 lg:pb-8">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile Bottom Navigation ──────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-10 bg-surface-raised border-t border-surface-border">
        {/* Safe area padding for iPhone home indicator */}
        <div className="flex items-center justify-around px-2 pt-2 pb-safe">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn(
                'flex flex-col items-center gap-1 min-w-[3.5rem] py-2 px-3 rounded-xl transition-all duration-150',
                isActive ? 'text-brand-orange' : 'text-slate-500 hover:text-slate-300'
              )}
            >
              {({ isActive }) => (
                <>
                  <div className={cn(
                    'w-8 h-8 rounded-xl flex items-center justify-center transition-all',
                    isActive ? 'bg-brand-orange/15' : ''
                  )}>
                    <Icon size={20} strokeWidth={isActive ? 2.5 : 1.75} />
                  </div>
                  <span className="text-[10px] font-medium tracking-wide leading-none">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
