import type { ComponentType } from 'react'
import { getAdminAccount } from '../../api/client'
import type { ViewId } from '../../data/mock'
import {
  AgentsIcon,
  ChatIcon,
  CloseIcon,
  OverviewIcon,
  ShieldIcon,
  SignOutIcon,
  TagIcon,
  UsersIcon,
} from '../icons'

interface NavItem {
  id: ViewId
  label: string
  icon: ComponentType<{ size?: number }>
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: OverviewIcon },
  { id: 'listings', label: 'Listings & Moderation', icon: TagIcon },
  { id: 'users', label: 'Users & Campuses', icon: UsersIcon },
  { id: 'connections', label: 'Connections & Chats', icon: ChatIcon },
  { id: 'settings', label: 'Settings & Profile', icon: AgentsIcon },
]

interface SidebarProps {
  current: ViewId
  onNavigate: (view: ViewId) => void
  open: boolean
  onClose: () => void
  flaggedCount: number
  flaggedListings: number
  pausedAgents: number
  connectionsCount?: number
  backend: { connected: boolean; label: string }
  adminEmail: string
  onSignOut: () => void
}

export function Sidebar({
  current,
  onNavigate,
  open,
  onClose,
  flaggedCount,
  flaggedListings,
  pausedAgents,
  connectionsCount,
  backend,
  adminEmail,
  onSignOut,
}: SidebarProps) {
  const badges: Partial<Record<ViewId, { count: number; className: string }>> = {
    overview: flaggedCount > 0 ? { count: flaggedCount, className: 'bg-critical-soft text-critical' } : undefined,
    listings:
      flaggedListings > 0 ? { count: flaggedListings, className: 'bg-critical-soft text-critical' } : undefined,
    connections:
      connectionsCount && connectionsCount > 0
        ? { count: connectionsCount, className: 'bg-brand-soft text-brand-strong' }
        : undefined,
    settings: pausedAgents > 0 ? { count: pausedAgents, className: 'bg-warning-soft text-warning' } : undefined,
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-rail-line bg-rail transition-transform duration-300 ease-out-soft lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-rail-line px-5">
          <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-brand text-[11px] font-bold tracking-tight text-white">
            CM
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13.5px] leading-tight font-semibold text-rail-ink">
              CampusMart AI
            </p>
            <p className="text-[10.5px] tracking-[0.1em] text-rail-muted uppercase">
              Master Control
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-rail-muted transition-colors hover:bg-white/5 hover:text-rail-ink lg:hidden"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <nav aria-label="Primary" className="px-3 pt-5">
          <p className="px-3 pb-2 text-[10.5px] font-semibold tracking-[0.12em] text-rail-muted uppercase">
            Navigation
          </p>
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = current === item.id
              const badge = badges[item.id]
              const Icon = item.icon
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onNavigate(item.id)}
                    className={`relative flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[13.5px] transition-colors duration-150 ${
                      active
                        ? 'bg-white/[0.07] font-medium text-rail-ink'
                        : 'text-rail-muted hover:bg-white/[0.04] hover:text-rail-ink'
                    }`}
                  >
                    {active && (
                      <span className="absolute top-1/2 -left-3 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
                    )}
                    <Icon size={18} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {badge && (
                      <span
                        className={`tabular rounded-md px-1.5 py-0.5 text-[11px] leading-none font-semibold ${badge.className}`}
                      >
                        {badge.count}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="mt-auto border-t border-rail-line p-4">
          {(() => {
            const adminAccount = getAdminAccount(adminEmail)
            return (
              <div className="rounded-lg bg-white/[0.04] p-3 transition-colors hover:bg-white/[0.07]">
                <button
                  type="button"
                  onClick={() => onNavigate('settings')}
                  className="flex w-full items-center gap-3 text-left focus:outline-none"
                  title="Open Admin Profile & Settings"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/20 text-[#9db9ff]">
                    <ShieldIcon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-rail-ink">
                      {adminAccount.name}
                    </p>
                    <p className="truncate text-[11.5px] text-rail-muted">
                      {adminAccount.roleTitle}
                    </p>
                  </div>
                </button>
                {adminEmail && (
                  <p
                    className="mt-2 truncate px-1 text-[11.5px] text-rail-muted"
                    title={adminEmail}
                  >
                    {adminEmail}
                  </p>
                )}
                <button
                  type="button"
                  onClick={onSignOut}
                  aria-label="Sign out of the admin dashboard"
                  className="mt-2.5 flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-rail-line text-[12.5px] font-medium text-rail-muted transition-colors hover:border-[#3a4660] hover:bg-white/[0.06] hover:text-rail-ink"
                >
                  <SignOutIcon size={14} />
                  Sign out
                </button>
              </div>
            )
          })()}
          <p className="mt-3 flex items-center gap-2 px-1 text-[11.5px] text-rail-muted">
            <span
              className={`h-1.5 w-1.5 rounded-full ${backend.connected ? 'bg-success' : 'bg-ink-faint'}`}
            />
            {backend.label}
          </p>
          <p className="mt-1.5 px-1 text-[11px]">
            <a
              href="mailto:martaicampus@gmail.com?subject=CampusMart%20Admin%20Support"
              className="text-rail-muted hover:text-rail-ink transition-colors block truncate"
              title="Contact Master Control Support"
            >
              Support: martaicampus@gmail.com
            </a>
          </p>
        </div>
      </aside>
    </>
  )
}
