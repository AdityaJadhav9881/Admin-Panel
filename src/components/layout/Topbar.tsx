import type { StatusTone } from '../../data/mock'
import { MenuIcon, RefreshIcon } from '../icons'

interface TopbarProps {
  title: string
  subtitle: string
  onOpenMenu: () => void
  health: { tone: StatusTone; label: string }
  onOpenHealth: () => void
  /** Live API when connected; offline when the FastAPI service is unreachable. */
  dataMode: 'live' | 'offline'
  /** Re-fetches live state from the backend. */
  onRefresh: () => void
  refreshing: boolean
}

export function Topbar({
  title,
  subtitle,
  onOpenMenu,
  health,
  onOpenHealth,
  dataMode,
  onRefresh,
  refreshing,
}: TopbarProps) {
  const healthTone: Record<StatusTone, string> = {
    success: 'bg-success',
    warning: 'bg-warning',
    critical: 'bg-critical',
    neutral: 'bg-ink-faint',
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-line bg-canvas px-5 lg:px-8">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open navigation"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-surface text-ink-muted transition-colors hover:text-ink lg:hidden"
      >
        <MenuIcon size={18} />
      </button>

      <div className="min-w-0">
        <h1 className="truncate text-[17px] leading-tight font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h1>
        <p className="hidden truncate text-[12.5px] text-ink-muted sm:block">{subtitle}</p>
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh live data"
          title="Re-fetch users, listings, agents and flags from the backend"
          className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-60"
        >
          <RefreshIcon size={15} className={refreshing ? 'animate-spin' : undefined} />
          <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh data'}</span>
        </button>
        <button
          type="button"
          onClick={onOpenHealth}
          className="hidden h-9 items-center gap-2 rounded-lg border border-line bg-surface pr-3 pl-3 text-[13px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-2 sm:flex"
        >
          <span className={`h-2 w-2 rounded-full ${healthTone[health.tone]}`} />
          {health.label}
        </button>
        <span
          title={
            dataMode === 'live'
              ? 'Live data from the FastAPI service'
              : 'The FastAPI service is unreachable — showing the last snapshot'
          }
          className={`hidden h-9 items-center rounded-lg border px-3 text-[12.5px] font-medium md:flex ${
            dataMode === 'live'
              ? 'border-success/30 bg-success-soft text-success'
              : 'border-warning/40 bg-warning-soft text-warning'
          }`}
        >
          {dataMode === 'live' ? 'Live API' : 'Offline'}
        </span>
        <span className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface text-[11.5px] font-semibold text-ink-muted">
          CM
        </span>
      </div>
    </header>
  )
}
