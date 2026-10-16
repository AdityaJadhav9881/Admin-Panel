import { useCallback, useEffect, useRef, useState } from 'react'
import {
  API_HOST,
  ApiError,
  apiErrorMessage,
  approveListing as apiApproveListing,
  clearAdminSession,
  fetchAgents,
  fetchListings,
  fetchOverview,
  fetchUsers,
  isSuperAdminEmail,
  loginAdmin,
  persistAdminSession,
  readAdminSession,
  removeListing,
  setUserStatus,
  setAgentEnabled,
  type AdminSession,
  type LoginProgress,
} from './api/client'
import { probeImageSamples, runHealthProbes } from './api/health'
import { LoginView } from './components/auth/LoginView'
import { Sidebar } from './components/layout/Sidebar'
import { Topbar } from './components/layout/Topbar'
import { AlertIcon, RefreshIcon } from './components/icons'
import { Button } from './components/ui/Button'
import { ConnectingBox } from './components/ui/ConnectingBox'
import { Toast, type ToastMessage } from './components/ui/Toast'
import { ListingsView } from './components/views/ListingsView'
import { OverviewView } from './components/views/OverviewView'
import { SettingsView } from './components/views/SettingsView'
import { UsersView, type UserFilter } from './components/views/UsersView'
import {
  SERVICE_CATALOG,
  issueServiceCount,
  overallServiceState,
  stateTone,
  type Agent,
  type FlaggedTransaction,
  type Listing,
  type OverviewMetrics,
  type Service,
  type User,
  type UserStatus,
  type ViewId,
} from './data/mock'

const VIEW_META: Record<ViewId, { title: string; subtitle: string }> = {
  overview: {
    title: 'Overview',
    subtitle: 'Marketplace activity, flag queue and system health',
  },
  listings: {
    title: 'Listings & Moderation',
    subtitle: 'AI-flagged listings, pricing checks and seller actions',
  },
  users: {
    title: 'User management',
    subtitle: 'Review trust scores and block or unblock accounts',
  },
  settings: {
    title: 'AI & API settings',
    subtitle: 'Agent control and server health',
  },
}

const EMPTY_METRICS: OverviewMetrics = {
  totalActiveUsers: 0,
  listingsToday: 0,
  flaggedCount: 0,
}

/** How long a request may run in silence before the cold-start box appears. */
const WARM_NOTICE_MS = 2000

const PROTECTED_ADMIN_NOTICE = 'Super Admin (Protected) — this account cannot be blocked.'

export default function App() {
  /* --- Admin session (JWT gate) ----------------------------- */
  const [session, setSession] = useState<AdminSession | null>(() => readAdminSession())

  /* --- View state ------------------------------------------- */
  const [view, setView] = useState<ViewId>('overview')
  const [navOpen, setNavOpen] = useState(false)

  /* --- Single source of truth for every view ---------------- */
  const [users, setUsers] = useState<User[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [queue, setQueue] = useState<FlaggedTransaction[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [metrics, setMetrics] = useState<OverviewMetrics>(EMPTY_METRICS)
  /* Live probe rows — every state/latency is a real HTTP measurement. */
  const [services, setServices] = useState<Service[]>(SERVICE_CATALOG)
  const [probing, setProbing] = useState(false)
  const probeSeq = useRef(0)
  const listingsRef = useRef<Listing[]>([])

  /* --- User directory filters (shared with Overview) --------- */
  const [userQuery, setUserQuery] = useState('')
  const [userFilter, setUserFilter] = useState<UserFilter>('all')

  /* --- Backend connection ----------------------------------- */
  const [backendConnected, setBackendConnected] = useState(false)
  const [bootstrapped, setBootstrapped] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** True while a request has been silent for >2s — Render cold-start mode. */
  const [warming, setWarming] = useState(false)
  const loadSeq = useRef(0)
  const warmTimer = useRef<number | null>(null)

  /* --- Confirmation feedback -------------------------------- */
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const toastTimer = useRef<number | null>(null)
  const mutationInFlight = useRef(false)

  useEffect(() => {
    // Reset any leftover body scroll-lock from earlier drawer versions.
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.width = ''
    return () => {
      window.clearTimeout(toastTimer.current ?? undefined)
      if (warmTimer.current !== null) window.clearTimeout(warmTimer.current)
    }
  }, [])

  const showToast = useCallback((text: string, tone: ToastMessage['tone']) => {
    setToast({ id: Date.now(), text, tone })
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2800)
  }, [])

  /* --- Live data load (initial + manual refresh) ------------- */
  const loadData = useCallback(
    async (options?: { initial?: boolean }) => {
      const initial = options?.initial ?? false
      const seq = ++loadSeq.current
      // The initial load renders the loading panel via `bootstrapped`; only
      // manual refreshes need the refreshing flag (avoid sync setState in effects).
      if (!initial) setRefreshing(true)
      // Cold-start watch: after 2s of silence explain the Render wake-up
      // instead of leaving a silent spinner on screen.
      if (warmTimer.current !== null) window.clearTimeout(warmTimer.current)
      setWarming(false)
      warmTimer.current = window.setTimeout(() => setWarming(true), WARM_NOTICE_MS)

      try {
        const [overview, liveUsers, liveListings, liveAgents] = await Promise.all([
          fetchOverview(),
          fetchUsers(),
          fetchListings(),
          fetchAgents(),
        ])
        if (seq !== loadSeq.current) return

        const listingCounts = new Map<string, number>()
        for (const listing of liveListings) {
          listingCounts.set(listing.sellerId, (listingCounts.get(listing.sellerId) ?? 0) + 1)
        }

        setMetrics(overview.metrics)
        setQueue(overview.queue)
        setUsers(liveUsers.map((user) => ({ ...user, listings: listingCounts.get(user.id) ?? 0 })))
        setListings(liveListings)
        setAgents(liveAgents)
        setBackendConnected(true)
        setLoadError(null)
        showToast('Live data loaded from the CampusMart API.', 'success')
      } catch (error) {
        if (seq !== loadSeq.current) return
        // Expired/invalid JWT — drop back to the login gate instead of a dead shell.
        if (error instanceof ApiError && error.status === 401) {
          if (session?.fallback) {
            // Super Admin fallback session: stay signed in, report the failure.
            setBackendConnected(false)
            setLoadError(
              'Super Admin fallback session: the backend rejected the stored token, so live data cannot load. Sign in again once the login service accepts the account.',
            )
            showToast('Fallback session active — live data is unavailable.', 'warning')
            return
          }
          clearAdminSession()
          setSession(null)
          setBootstrapped(false)
          setBackendConnected(false)
          showToast('Session expired — sign in again to continue.', 'critical')
          return
        }
        setBackendConnected(false)
        setLoadError(apiErrorMessage(error))
        showToast(
          initial
            ? `Unable to reach the API at ${API_HOST}. Use Retry Connection when the server is up.`
            : 'Refresh failed — the CampusMart API is unreachable.',
          'critical',
        )
      } finally {
        if (seq === loadSeq.current) {
          if (warmTimer.current !== null) {
            window.clearTimeout(warmTimer.current)
            warmTimer.current = null
          }
          setWarming(false)
          setRefreshing(false)
          setBootstrapped(true)
        }
      }
    },
    [session, showToast],
  )

  useEffect(() => {
    if (!session) return
    void (async () => {
      // Yield first so the fetch starts outside the synchronous effect body.
      await Promise.resolve()
      await loadData({ initial: true })
    })()
  }, [loadData, session])

  /* --- Live server/API health probes ------------------------- */
  useEffect(() => {
    listingsRef.current = listings
  }, [listings])

  const runProbes = useCallback(async () => {
    const seq = ++probeSeq.current
    setProbing(true)
    try {
      const next = await runHealthProbes(probeImageSamples(listingsRef.current))
      if (seq !== probeSeq.current) return
      setServices(next)
    } catch {
      /* probes never reject — keep the last snapshot on a surprise failure */
    } finally {
      if (seq === probeSeq.current) setProbing(false)
    }
  }, [])

  // Probe once the first data load lands, so Cloudinary has real photo URLs to test.
  useEffect(() => {
    if (!bootstrapped || !backendConnected) return
    void (async () => {
      await Promise.resolve()
      await runProbes()
    })()
  }, [bootstrapped, backendConnected, runProbes])

  const handleLogin = useCallback(
    async (email: string, password: string, onProgress?: LoginProgress) => {
      const next = await loginAdmin(email, password, onProgress)
      persistAdminSession(next)
      if (next.fallback) {
        showToast(
          'Super Admin fallback session opened — Master Control stays reachable without a live backend session.',
          'warning',
        )
      }
      setSession(next)
    },
    [showToast],
  )

  const handleSignOut = useCallback(() => {
    clearAdminSession()
    setSession(null)
    setView('overview')
    setNavOpen(false)
    setUsers([])
    setListings([])
    setQueue([])
    setAgents([])
    setMetrics(EMPTY_METRICS)
    setUserQuery('')
    setUserFilter('all')
    setBackendConnected(false)
    setBootstrapped(false)
    setRefreshing(false)
    setLoadError(null)
    if (warmTimer.current !== null) {
      window.clearTimeout(warmTimer.current)
      warmTimer.current = null
    }
    setWarming(false)
    probeSeq.current += 1
    setServices(SERVICE_CATALOG)
    setProbing(false)
  }, [])

  const navigate = (next: ViewId) => {
    setView(next)
    setNavOpen(false)
    window.scrollTo({ top: 0 })
  }

  const withMutation = useCallback(
    async (fn: () => Promise<void>) => {
      if (mutationInFlight.current) return
      mutationInFlight.current = true
      try {
        await fn()
      } catch (error) {
        showToast(apiErrorMessage(error), 'critical')
      } finally {
        mutationInFlight.current = false
      }
    },
    [showToast],
  )

  /* --- User actions (PATCH /admin/users/{id}/status) --------- */
  const toggleUserStatus = (user: User) => {
    const next: UserStatus = user.status === 'active' ? 'blocked' : 'active'
    if (next === 'blocked' && isSuperAdminEmail(user.email)) {
      showToast(PROTECTED_ADMIN_NOTICE, 'warning')
      return
    }
    void withMutation(async () => {
      await setUserStatus(user.id, next)
      setUsers((prev) =>
        prev.map((item): User => (item.id === user.id ? { ...item, status: next } : item)),
      )
      showToast(
        next === 'blocked' ? `${user.name} blocked.` : `${user.name} unblocked.`,
        next === 'blocked' ? 'critical' : 'success',
      )
    })
  }

  /* --- Moderation actions ------------------------------------ */
  const approveListing = (listing: Listing) => {
    void withMutation(async () => {
      await apiApproveListing(listing.id)
      setListings((prev) =>
        prev.map((item): Listing =>
          item.id === listing.id ? { ...item, status: 'active', flag: null } : item,
        ),
      )
      if (listing.status === 'flagged') {
        setMetrics((prev) => ({ ...prev, flaggedCount: Math.max(0, prev.flaggedCount - 1) }))
      }
      showToast(`${listing.id} approved — flag cleared.`, 'success')
    })
  }

  const deleteListing = (listing: Listing) => {
    void withMutation(async () => {
      await removeListing(listing.id)
      setListings((prev) => prev.filter((item) => item.id !== listing.id))
      if (listing.status === 'flagged') {
        setMetrics((prev) => ({ ...prev, flaggedCount: Math.max(0, prev.flaggedCount - 1) }))
      }
      // The server applies the trust penalty — re-pull users so the scores stay truthful.
      try {
        const [liveUsers, liveListings] = await Promise.all([fetchUsers(), fetchListings()])
        const listingCounts = new Map<string, number>()
        for (const item of liveListings) {
          listingCounts.set(item.sellerId, (listingCounts.get(item.sellerId) ?? 0) + 1)
        }
        setUsers(
          liveUsers.map((user) => ({ ...user, listings: listingCounts.get(user.id) ?? 0 })),
        )
        setListings(liveListings)
      } catch {
        /* non-fatal — the next Refresh reloads authoritative scores */
      }
      const seller = users.find((user) => user.id === listing.sellerId)
      showToast(
        seller
          ? `${listing.id} deleted — ${seller.name}'s trust penalty was applied on the server.`
          : `${listing.id} deleted.`,
        'critical',
      )
    })
  }

  const banSeller = (listing: Listing) => {
    const seller = users.find((user) => user.id === listing.sellerId)
    if (!seller) {
      showToast('Unavailable — no account found for this seller.', 'warning')
      return
    }
    if (isSuperAdminEmail(seller.email)) {
      showToast(PROTECTED_ADMIN_NOTICE, 'warning')
      return
    }
    void withMutation(async () => {
      await setUserStatus(seller.id, 'blocked')
      setUsers((prev) =>
        prev.map((user): User =>
          user.id === seller.id ? { ...user, status: 'blocked' } : user,
        ),
      )
      showToast(`${seller.name} banned — account blocked.`, 'critical')
    })
  }

  const openSellerInUsers = (sellerId: string) => {
    const seller = users.find((user) => user.id === sellerId)
    setUserQuery(seller?.email ?? '')
    setUserFilter('all')
    navigate('users')
  }

  /* --- Agent actions (PATCH /admin/ai-agents/{key}) ---------- */
  const toggleAgent = (id: string) => {
    const agent = agents.find((item) => item.id === id)
    if (!agent) return
    const next = !agent.enabled
    void withMutation(async () => {
      await setAgentEnabled(id, next)
      setAgents((prev) =>
        prev.map((item) => (item.id === id ? { ...item, enabled: next } : item)),
      )
      showToast(
        next ? `${agent.name} resumed.` : `${agent.name} paused.`,
        next ? 'success' : 'warning',
      )
    })
  }

  const acknowledgeFlag = (id: string) => {
    setQueue((prev) => prev.map((tx) => (tx.id === id ? { ...tx, acknowledged: true } : tx)))
    setMetrics((prev) => ({ ...prev, flaggedCount: Math.max(0, prev.flaggedCount - 1) }))
    showToast(`${id} acknowledged.`, 'success')
  }

  /* --- Derived state ---------------------------------------- */
  const flaggedListings = listings.filter((listing) => listing.status === 'flagged').length
  const pausedAgents = agents.filter((agent) => !agent.enabled).length
  const fraudAgentEnabled =
    agents.find((agent) => agent.id === 'trust_fraud_detection')?.enabled ?? true
  const overall = overallServiceState(services)
  const issueCount = issueServiceCount(services)
  const health = {
    tone: stateTone[overall],
    label:
      overall === 'pending'
        ? 'Awaiting first probe'
        : issueCount === 0
          ? 'All systems operational'
          : `${issueCount} service issue${issueCount === 1 ? '' : 's'}`,
  }
  const backend = {
    connected: backendConnected,
    label: backendConnected
      ? `Backend connected · ${API_HOST}`
      : `Backend unreachable · ${API_HOST}`,
  }

  if (!session) {
    return (
      <div className="min-h-screen">
        <LoginView onLogin={handleLogin} />
        <Toast message={toast} />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Sidebar
        current={view}
        onNavigate={navigate}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        flaggedCount={metrics.flaggedCount}
        flaggedListings={flaggedListings}
        pausedAgents={pausedAgents}
        backend={backend}
        adminEmail={session.email}
        onSignOut={handleSignOut}
      />

      <div className="lg:pl-[272px]">
        <Topbar
          title={VIEW_META[view].title}
          subtitle={VIEW_META[view].subtitle}
          onOpenMenu={() => setNavOpen(true)}
          health={health}
          onOpenHealth={() => navigate('settings')}
          dataMode={backendConnected ? 'live' : 'offline'}
          onRefresh={() => void loadData()}
          refreshing={refreshing}
        />

        <main className="mx-auto w-full max-w-[1440px] px-5 py-6 lg:px-8 lg:py-8">
          {loadError && bootstrapped && (
            <div
              role="alert"
              className="mb-6 flex flex-col gap-4 rounded-xl border border-critical/25 bg-critical-soft p-4 sm:flex-row sm:items-center"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-critical/10 text-critical">
                <AlertIcon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-ink">Live data unavailable</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">{loadError}</p>
              </div>
              <Button
                variant="primary"
                className="shrink-0 justify-center"
                disabled={refreshing}
                onClick={() => void loadData()}
              >
                <RefreshIcon size={15} className={refreshing ? 'animate-spin' : undefined} />
                {refreshing ? 'Connecting…' : 'Retry Connection'}
              </Button>
            </div>
          )}

          {bootstrapped && warming && (
            <div className="mb-6">
              <ConnectingBox />
            </div>
          )}

          {!bootstrapped ? (
            <div className="grid min-h-[50vh] place-items-center rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              {warming ? (
                <div className="w-full max-w-[620px] px-5 py-6 sm:px-6">
                  <ConnectingBox />
                </div>
              ) : (
                <div className="px-6 text-center">
                  <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-line border-t-brand" />
                  <p className="mt-4 text-[14px] font-semibold text-ink">
                    Connecting to the CampusMart API…
                  </p>
                  <p className="mt-1 text-[13px] text-ink-muted">
                    Loading users, listings, agents and the flag queue from {API_HOST}.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <>
              {view === 'overview' && (
                <OverviewView
                  key="overview"
                  metrics={metrics}
                  queue={queue}
                  agents={agents}
                  services={services}
                  probing={probing}
                  onNavigate={navigate}
                  onAcknowledge={acknowledgeFlag}
                  onRunProbes={() => void runProbes()}
                />
              )}

              {view === 'listings' && (
                <ListingsView
                  key="listings"
                  listings={listings}
                  users={users}
                  fraudAgentEnabled={fraudAgentEnabled}
                  onApprove={approveListing}
                  onDelete={deleteListing}
                  onBanSeller={banSeller}
                  onOpenSeller={openSellerInUsers}
                />
              )}

              {view === 'users' && (
                <UsersView
                  key="users"
                  users={users}
                  query={userQuery}
                  filter={userFilter}
                  onQueryChange={setUserQuery}
                  onFilterChange={setUserFilter}
                  onToggleStatus={toggleUserStatus}
                />
              )}

              {view === 'settings' && (
                <SettingsView
                  key="settings"
                  agents={agents}
                  services={services}
                  probing={probing}
                  onToggleAgent={toggleAgent}
                  onRunProbes={() => void runProbes()}
                  onToast={showToast}
                />
              )}
            </>
          )}
        </main>
      </div>

      <Toast message={toast} />
    </div>
  )
}
