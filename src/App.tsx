import { useCallback, useEffect, useRef, useState } from 'react'
import {
  API_HOST,
  ApiError,
  apiErrorMessage,
  approveListing as apiApproveListing,
  clearAdminSession,
  fetchAgents,
  fetchCommunications,
  fetchListings,
  fetchOverview,
  fetchUsers,
  isProtectedAdminEmail,
  loginAdmin,
  persistAdminSession,
  readAdminSession,
  removeListing,
  deleteUser,
  setUserStatus,
  setAgentEnabled,
  updateAdminUser,
  updateAdminListing,
  updateAdminOrder,
  deleteAdminChatMessage,
  sendAdminInterventionNote,
  fetchWantedRequests,
  updateAdminWantedRequest,
  deleteAdminWantedRequest,
  matchWantedWithSeller,
  type AdminListingUpdatePayload,
  type AdminOrderUpdatePayload,
  type AdminSession,
  type AdminUserUpdatePayload,
  type AdminWantedUpdatePayload,
  type ConnectionThread,
  type LoginProgress,
} from './api/client'
import { probeImageSamples, runHealthProbes } from './api/health'
import { LoginView } from './components/auth/LoginView'
import { Sidebar } from './components/layout/Sidebar'
import { Topbar } from './components/layout/Topbar'
import {
  AgentsIcon,
  AlertIcon,
  ChatIcon,
  CloseIcon,
  MegaphoneIcon,
  OverviewIcon,
  RefreshIcon,
  TagIcon,
  UsersIcon,
} from './components/icons'
import { Button } from './components/ui/Button'
import { ConnectingBox } from './components/ui/ConnectingBox'
import { Toast, type ToastMessage } from './components/ui/Toast'
import { ConnectionsView } from './components/views/ConnectionsView'
import { ListingsView } from './components/views/ListingsView'
import { OverviewView } from './components/views/OverviewView'
import { SettingsView } from './components/views/SettingsView'
import { UsersView, type UserFilter } from './components/views/UsersView'
import { WantedRequestsView } from './components/views/WantedRequestsView'
import {
  SERVICE_CATALOG,
  issueServiceCount,
  overallServiceState,
  stateTone,
  type Agent,
  type FlaggedTransaction,
  type Listing,
  type ListingCategory,
  type ListingStatus,
  type OverviewMetrics,
  type Service,
  type User,
  type UserStatus,
  type ViewId,
  type WantedRequest,
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
  wanted: {
    title: 'Wanted Board (WTB)',
    subtitle: 'Campus student requests, max budgets, urgency, and seller matching',
  },
  users: {
    title: 'User management',
    subtitle: 'Review trust scores and block or unblock accounts',
  },
  connections: {
    title: 'Connections & Communications',
    subtitle: 'Live student buyer–seller pairs, active chat threads, call logs and order handshakes',
  },
  settings: {
    title: 'Settings & Profile',
    subtitle: 'Admin profile, password security, AI engine config, and live probes',
  },
}

function getViewFromHash(): ViewId {
  if (typeof window === 'undefined') return 'overview'
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase().trim()
  if (hash === 'profile') return 'settings'
  if (
    hash === 'overview' ||
    hash === 'listings' ||
    hash === 'wanted' ||
    hash === 'users' ||
    hash === 'connections' ||
    hash === 'settings'
  ) {
    return hash as ViewId
  }
  return 'overview'
}

const EMPTY_METRICS: OverviewMetrics = {
  totalActiveUsers: 0,
  listingsToday: 0,
  flaggedCount: 0,
}

/** How long a request may run in silence before the cold-start box appears. */
const WARM_NOTICE_MS = 2000

const PROTECTED_ADMIN_NOTICE = 'Protected Admin account — this user cannot be blocked.'

export default function App() {
  /* --- Admin session (JWT gate) ----------------------------- */
  const [session, setSession] = useState<AdminSession | null>(() => readAdminSession())

  /* --- View state with URL route syncing -------------------- */
  const [view, setView] = useState<ViewId>(() => getViewFromHash())
  const [navOpen, setNavOpen] = useState(false)
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false)

  useEffect(() => {
    const handleHashChange = () => {
      const next = getViewFromHash()
      setView(next)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  /* --- Single source of truth for every view ---------------- */
  const [users, setUsers] = useState<User[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [queue, setQueue] = useState<FlaggedTransaction[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [connections, setConnections] = useState<ConnectionThread[]>([])
  const [wantedRequests, setWantedRequests] = useState<WantedRequest[]>([])
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
        const [overview, liveUsers, liveListings, liveAgents, liveConnections, liveWanted] = await Promise.all([
          fetchOverview(),
          fetchUsers(),
          fetchListings(),
          fetchAgents(),
          fetchCommunications(),
          fetchWantedRequests(),
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
        setConnections(liveConnections)
        setWantedRequests(liveWanted)
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
    setConnections([])
    setWantedRequests([])
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

  const navigate = useCallback((next: ViewId) => {
    setView(next)
    setNavOpen(false)
    window.location.hash = `#/${next}`
    window.scrollTo({ top: 0 })
  }, [])

  /* --- Global Keyboard Shortcuts & Command Center ---------- */
  useEffect(() => {
    if (!session) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)

      if (e.key === 'Escape') {
        if (shortcutsHelpOpen) {
          setShortcutsHelpOpen(false)
          return
        }
        if (navOpen) {
          setNavOpen(false)
          return
        }
        if (isInput && target) {
          target.blur()
          return
        }
      }

      // Quick search focus with "/" (when not typing) or Cmd+K / Ctrl+K
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (!isInput && e.key === '/')) {
        e.preventDefault()
        const searchInput = document.querySelector<HTMLInputElement>('input[data-search-input="true"]')
        if (searchInput) {
          searchInput.focus()
          searchInput.select()
        }
        return
      }

      // Single-key hotkeys (disabled when typing or holding modifier keys)
      if (isInput || e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault()
        setShortcutsHelpOpen((prev) => !prev)
        return
      }

      if (e.key === '1') {
        navigate('overview')
      } else if (e.key === '2') {
        navigate('listings')
      } else if (e.key === '3') {
        navigate('wanted')
      } else if (e.key === '4') {
        navigate('users')
      } else if (e.key === '5') {
        navigate('connections')
      } else if (e.key === '6') {
        navigate('settings')
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        void loadData()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [session, shortcutsHelpOpen, navOpen, navigate, loadData])

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

  /* --- User actions (PATCH /admin/users/{id}/status & DELETE) - */
  const toggleUserStatus = (user: User) => {
    const next: UserStatus = user.status === 'active' ? 'blocked' : 'active'
    if (next === 'blocked' && isProtectedAdminEmail(user.email)) {
      showToast(PROTECTED_ADMIN_NOTICE, 'warning')
      return
    }
    void withMutation(async () => {
      await setUserStatus(user.id, next)
      setUsers((prev) =>
        prev.map((item): User => (item.id === user.id ? { ...item, status: next } : item)),
      )
      setMetrics((prev) => ({
        ...prev,
        totalActiveUsers:
          next === 'active'
            ? prev.totalActiveUsers + 1
            : Math.max(0, prev.totalActiveUsers - 1),
      }))
      showToast(
        next === 'blocked' ? `${user.name} blocked.` : `${user.name} unblocked.`,
        next === 'blocked' ? 'critical' : 'success',
      )
    })
  }

  const deleteUserAccount = (user: User) => {
    if (isProtectedAdminEmail(user.email)) {
      showToast('Protected administrator accounts cannot be deleted.', 'warning')
      return
    }
    void withMutation(async () => {
      try {
        await deleteUser(user.id)
      } catch (err) {
        if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
          setUsers((prev) => prev.filter((item) => item.id !== user.id))
          setMetrics((prev) => ({
            ...prev,
            totalActiveUsers: Math.max(0, prev.totalActiveUsers - 1),
          }))
          showToast(
            `${user.name} removed from session directory (backend DELETE route syncing).`,
            'warning',
          )
          return
        }
        throw err
      }
      setUsers((prev) => prev.filter((item) => item.id !== user.id))
      setMetrics((prev) => ({
        ...prev,
        totalActiveUsers: Math.max(0, prev.totalActiveUsers - 1),
      }))
      showToast(`${user.name} (${user.email}) permanently deleted.`, 'critical')
    })
  }

  const handleUpdateUser = (
    userId: string,
    payload: AdminUserUpdatePayload,
    updateListingsCollege?: boolean,
  ) => {
    void withMutation(async () => {
      await updateAdminUser(userId, payload)

      const oldUser = users.find((u) => u.id === userId)
      if (oldUser && payload.status && payload.status !== oldUser.status) {
        setMetrics((prev) => ({
          ...prev,
          totalActiveUsers:
            payload.status === 'active'
              ? prev.totalActiveUsers + 1
              : Math.max(0, prev.totalActiveUsers - 1),
        }))
      }

      // Optimistically update local users
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== userId) return u
          return {
            ...u,
            name: payload.name ?? u.name,
            email: payload.email ?? u.email,
            phone: payload.phone ?? u.phone,
            collegeName: payload.college_name ?? u.collegeName,
            collegeCode: payload.college_code ?? u.collegeCode,
            trustScore: payload.trust_score ?? u.trustScore,
            status: (payload.status as UserStatus) ?? u.status,
            role: payload.role ?? u.role,
          }
        }),
      )

      // Cascade college changes to listings if requested
      if (updateListingsCollege && payload.college_name) {
        setListings((prev) =>
          prev.map((l) => {
            if (l.sellerId !== userId) return l
            return {
              ...l,
              collegeName: payload.college_name,
              collegeCode: payload.college_code ?? l.collegeCode,
            }
          }),
        )
      }

      showToast('Student profile updated successfully.', 'success')
    })
  }

  const handleBulkUpdateCollege = (
    userIds: string[],
    collegeName: string,
    collegeCode: string,
  ) => {
    void withMutation(async () => {
      const idSet = new Set(userIds)
      for (const uid of userIds) {
        await updateAdminUser(uid, { college_name: collegeName, college_code: collegeCode })
      }

      setUsers((prev) =>
        prev.map((u) => (idSet.has(u.id) ? { ...u, collegeName, collegeCode } : u)),
      )

      setListings((prev) =>
        prev.map((l) => (idSet.has(l.sellerId) ? { ...l, collegeName, collegeCode } : l)),
      )

      showToast(`Reassigned ${userIds.length} students to ${collegeName}.`, 'success')
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
    if (isProtectedAdminEmail(seller.email)) {
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
      setMetrics((prev) => ({
        ...prev,
        totalActiveUsers: Math.max(0, prev.totalActiveUsers - 1),
      }))
      showToast(`${seller.name} banned — account blocked.`, 'critical')
    })
  }

  const openSellerInUsers = (sellerId: string) => {
    const seller = users.find((user) => user.id === sellerId)
    setUserQuery(seller?.email ?? '')
    setUserFilter('all')
    navigate('users')
  }

  const handleUpdateListing = (listingId: string, payload: AdminListingUpdatePayload) => {
    void withMutation(async () => {
      await updateAdminListing(listingId, payload)

      if (payload.status) {
        const oldListing = listings.find((l) => l.id === listingId)
        if (oldListing && oldListing.status !== payload.status) {
          if (oldListing.status === 'flagged' && payload.status !== 'flagged') {
            setMetrics((prev) => ({ ...prev, flaggedCount: Math.max(0, prev.flaggedCount - 1) }))
          } else if (oldListing.status !== 'flagged' && payload.status === 'flagged') {
            setMetrics((prev) => ({ ...prev, flaggedCount: prev.flaggedCount + 1 }))
          }
        }
      }

      setListings((prev) =>
        prev.map((l) => {
          if (l.id !== listingId) return l
          return {
            ...l,
            title: payload.title ?? l.title,
            description: payload.description ?? l.description,
            category: (payload.category as ListingCategory) ?? l.category,
            condition: payload.condition ?? l.condition,
            price: payload.listed_price ?? l.price,
            aiPrice: payload.suggested_price ?? l.aiPrice,
            collegeName: payload.college_name ?? l.collegeName,
            collegeCode: payload.college_code ?? l.collegeCode,
            status: (payload.status as ListingStatus) ?? l.status,
            aiTags: Array.isArray(payload.ai_tags) ? payload.ai_tags.join(', ') : (payload.ai_tags ?? l.aiTags),
            aiConditionNotes: payload.ai_condition_notes ?? l.aiConditionNotes,
            sellerId: payload.seller_id ?? l.sellerId,
            branch: payload.branch ?? l.branch,
            academic_year: payload.academic_year ?? l.academic_year,
            flag: payload.status === 'flagged' ? l.flag : null,
          }
        }),
      )

      showToast('Listing updated successfully.', 'success')
    })
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

  /* --- Connection, Chat & Order God-Mode Actions ----------- */
  const handleUpdateOrder = (orderId: string, payload: AdminOrderUpdatePayload) => {
    void withMutation(async () => {
      await updateAdminOrder(orderId, payload)

      setConnections((prev) =>
        prev.map((t) => {
          if (t.id === orderId || t.order?.id === orderId || t.product?.id === orderId) {
            return {
              ...t,
              payment_method: payload.payment_method ?? t.payment_method,
              order: {
                ...(t.order ?? {
                  id: orderId,
                  delivery_address: payload.delivery_address,
                  contact_phone: payload.contact_phone,
                  payment_method: payload.payment_method,
                  order_status: payload.order_status,
                  final_price: payload.final_price,
                }),
                ...payload,
              },
            }
          }
          return t
        }),
      )
    })
  }

  const handleDeleteChatMessage = (messageId: string) => {
    void withMutation(async () => {
      await deleteAdminChatMessage(messageId)

      setConnections((prev) =>
        prev.map((t) => ({
          ...t,
          messages: t.messages.filter((m) => m.id !== messageId),
          message_count: Math.max(0, t.messages.filter((m) => m.id !== messageId).length),
        })),
      )
    })
  }

  const handleSendAdminInterventionNote = (threadId: string, noteText: string) => {
    void withMutation(async () => {
      const newMsg = await sendAdminInterventionNote(threadId, noteText)

      setConnections((prev) =>
        prev.map((t) => {
          if (t.id !== threadId) return t
          return {
            ...t,
            messages: [...t.messages, newMsg],
            message_count: t.messages.length + 1,
            last_message: noteText,
            last_updated: 'Just now',
          }
        }),
      )
    })
  }

  /* --- Wanted Board (WTB) Handlers --------------------------- */
  const handleUpdateWantedRequest = (id: string, payload: AdminWantedUpdatePayload) => {
    void withMutation(async () => {
      await updateAdminWantedRequest(id, payload)
      setWantedRequests((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r
          return {
            ...r,
            title: payload.title ?? r.title,
            description: payload.description !== undefined ? payload.description : r.description,
            category: (payload.category as ListingCategory) ?? r.category,
            max_budget: payload.max_budget ?? r.max_budget,
            urgency: payload.urgency ?? r.urgency,
            branch: payload.branch ?? r.branch,
            academic_year: payload.academic_year ?? r.academic_year,
            match_status: payload.match_status ?? r.match_status,
            student_name: payload.student_name ?? r.student_name,
            student_email: payload.student_email ?? r.student_email,
            student_phone: payload.student_phone !== undefined ? payload.student_phone : r.student_phone,
            college_name: payload.college_name ?? r.college_name,
            college_code: payload.college_code ?? r.college_code,
            matched_listing_id: payload.matched_listing_id ?? r.matched_listing_id,
            matched_seller_name: payload.matched_seller_name ?? r.matched_seller_name,
          }
        }),
      )
      showToast('Wanted request updated successfully.', 'success')
    })
  }

  const handleDeleteWantedRequest = (id: string) => {
    void withMutation(async () => {
      await deleteAdminWantedRequest(id)
      setWantedRequests((prev) => prev.filter((r) => r.id !== id))
      showToast('Wanted request deleted.', 'warning')
    })
  }

  const handleFulfillWantedRequest = (id: string) => {
    void withMutation(async () => {
      const existing = wantedRequests.find((r) => r.id === id)
      const nextStatus = existing?.match_status === 'fulfilled' ? 'searching' : 'fulfilled'
      await updateAdminWantedRequest(id, { match_status: nextStatus })
      setWantedRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, match_status: nextStatus } : r)),
      )
      showToast(
        nextStatus === 'fulfilled' ? 'Request marked as fulfilled.' : 'Request reopened for searching.',
        'success',
      )
    })
  }

  const handleMatchWantedSeller = (wantedId: string, listingId: string, sellerName: string) => {
    void withMutation(async () => {
      await matchWantedWithSeller(wantedId, listingId, sellerName)
      setWantedRequests((prev) =>
        prev.map((r) =>
          r.id === wantedId
            ? {
                ...r,
                match_status: 'matched',
                matched_listing_id: listingId,
                matched_seller_name: sellerName,
              }
            : r,
        ),
      )
      showToast(`Linked with seller ${sellerName}.`, 'success')
    })
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
  const urgentWantedCount = wantedRequests.filter(
    (r) => r.urgency === 'urgent' && r.match_status !== 'fulfilled',
  ).length

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
        connectionsCount={connections.length}
        wantedCount={urgentWantedCount}
        backend={backend}
        adminEmail={session?.email || 'martaicampus@gmail.com'}
        onSignOut={handleSignOut}
        onOpenShortcuts={() => setShortcutsHelpOpen(true)}
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
          adminEmail={session?.email || 'martaicampus@gmail.com'}
          onOpenProfile={() => navigate('settings')}
          onOpenShortcuts={() => setShortcutsHelpOpen(true)}
        />

        <main className="mx-auto w-full max-w-[1440px] px-5 py-6 pb-24 lg:px-8 lg:py-8 lg:pb-8">
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
                  listings={listings}
                  users={users}
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
                  onUpdateListing={handleUpdateListing}
                />
              )}

              {view === 'wanted' && (
                <WantedRequestsView
                  key="wanted"
                  requests={wantedRequests}
                  listings={listings}
                  users={users}
                  onUpdate={handleUpdateWantedRequest}
                  onDelete={handleDeleteWantedRequest}
                  onFulfill={handleFulfillWantedRequest}
                  onMatchSeller={handleMatchWantedSeller}
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
                  onDeleteUser={deleteUserAccount}
                  onUpdateUser={handleUpdateUser}
                  onBulkUpdateCollege={handleBulkUpdateCollege}
                />
              )}

              {view === 'connections' && (
                <ConnectionsView
                  key="connections"
                  connections={connections}
                  onToast={showToast}
                  onUpdateOrder={handleUpdateOrder}
                  onDeleteChatMessage={handleDeleteChatMessage}
                  onSendInterventionNote={handleSendAdminInterventionNote}
                />
              )}

              {view === 'settings' && (
                <SettingsView
                  key="settings"
                  adminEmail={session?.email || 'martaicampus@gmail.com'}
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

      {/* Mobile Bottom Quick-Nav Bar (<1024px) */}
      <nav
        aria-label="Mobile quick navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-line bg-surface/95 px-2 backdrop-blur-md lg:hidden"
      >
        <button
          type="button"
          onClick={() => navigate('overview')}
          className={`relative flex flex-1 flex-col items-center justify-center py-1 text-center transition-colors cursor-pointer ${
            view === 'overview' ? 'text-brand font-semibold' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <OverviewIcon size={19} />
          <span className="mt-1 text-[10.5px]">Overview</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('listings')}
          className={`relative flex flex-1 flex-col items-center justify-center py-1 text-center transition-colors cursor-pointer ${
            view === 'listings' ? 'text-brand font-semibold' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <div className="relative">
            <TagIcon size={19} />
            {metrics.flaggedCount > 0 && (
              <span className="absolute -top-1 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-critical px-1 text-[9px] font-bold text-white">
                {metrics.flaggedCount}
              </span>
            )}
          </div>
          <span className="mt-1 text-[10.5px]">Listings</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('wanted')}
          className={`relative flex flex-1 flex-col items-center justify-center py-1 text-center transition-colors cursor-pointer ${
            view === 'wanted' ? 'text-brand font-semibold' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <div className="relative">
            <MegaphoneIcon size={19} />
            {urgentWantedCount > 0 && (
              <span className="absolute -top-1 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-warning px-1 text-[9px] font-bold text-white">
                {urgentWantedCount}
              </span>
            )}
          </div>
          <span className="mt-1 text-[10.5px]">Wanted</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('users')}
          className={`relative flex flex-1 flex-col items-center justify-center py-1 text-center transition-colors cursor-pointer ${
            view === 'users' ? 'text-brand font-semibold' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <UsersIcon size={19} />
          <span className="mt-1 text-[10.5px]">Users</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('connections')}
          className={`relative flex flex-1 flex-col items-center justify-center py-1 text-center transition-colors cursor-pointer ${
            view === 'connections' ? 'text-brand font-semibold' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <ChatIcon size={19} />
          <span className="mt-1 text-[10.5px]">Links</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('settings')}
          className={`relative flex flex-1 flex-col items-center justify-center py-1 text-center transition-colors cursor-pointer ${
            view === 'settings' ? 'text-brand font-semibold' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <AgentsIcon size={19} />
          <span className="mt-1 text-[10.5px]">Settings</span>
        </button>
      </nav>

      <Toast message={toast} />
      <KeyboardShortcutsModal
        open={shortcutsHelpOpen}
        onClose={() => setShortcutsHelpOpen(false)}
      />
    </div>
  )
}

function KeyboardShortcutsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    const orig = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = orig
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  const sections = [
    {
      title: 'Navigation',
      items: [
        { keys: ['1'], desc: 'Jump to Overview' },
        { keys: ['2'], desc: 'Jump to Listings & Moderation' },
        { keys: ['3'], desc: 'Jump to Wanted Board (WTB)' },
        { keys: ['4'], desc: 'Jump to Users & Campuses' },
        { keys: ['5'], desc: 'Jump to Connections & Chats' },
        { keys: ['6'], desc: 'Jump to Settings & AI Config' },
      ],
    },
    {
      title: 'Operations & Focus',
      items: [
        { keys: ['/'], desc: 'Quick-focus search input in current view' },
        { keys: ['⌘', 'K'], desc: 'Search shortcut (macOS / Windows Ctrl+K)' },
        { keys: ['R'], desc: 'Refresh live data from CampusMart API' },
        { keys: ['?'], desc: 'Open / close this keyboard shortcuts guide' },
        { keys: ['Esc'], desc: 'Close dialogs, drawers, and dismiss focus' },
      ],
    },
  ]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-70 flex items-center justify-center p-4"
    >
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <h2 className="text-[16px] font-semibold text-ink">Keyboard Shortcuts</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">
              Fast navigation and operation hotkeys for staff administrators
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink transition-colors"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="mt-5 space-y-6">
          {sections.map((sec) => (
            <div key={sec.title}>
              <h3 className="text-[11.5px] font-bold uppercase tracking-wider text-ink-faint">
                {sec.title}
              </h3>
              <div className="mt-2.5 divide-y divide-line/60 rounded-xl border border-line/70 bg-surface-2/40 px-3.5">
                {sec.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2.5 text-[13px]"
                  >
                    <span className="text-ink">{item.desc}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          className="inline-flex min-w-[22px] items-center justify-center rounded border border-line-strong bg-surface px-1.5 py-0.5 text-[11.5px] font-semibold text-ink shadow-2xs"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-line pt-4 text-[12px] text-ink-faint">
          <span>Tip: Hotkeys are paused while typing inside inputs.</span>
          <Button variant="outline" className="h-8 px-3 text-[12px]" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
