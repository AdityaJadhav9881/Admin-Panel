/* ============================================================
   API CLIENT — Master Control
   Centralised access to the CampusMart FastAPI backend.

   Configuration (.env):
     VITE_API_BASE_URL=http://127.0.0.1:8000

   USE_MOCK_DATA = false (live mode). When the server is
   unreachable the UI shows an error banner with a
   "Retry Connection" button and keeps the last snapshot.

   Endpoints wired to the FastAPI admin contract:
      POST   /auth/login            (JWT; token stored in localStorage)
      GET    /admin/overview
      GET    /admin/users
      PATCH  /admin/users/{user_id}/status
      GET    /admin/listings
      PATCH  /admin/listings/{product_id}/approve
      DELETE /admin/listings/{product_id}
      GET    /admin/ai-agents       (dict of booleans or list of {key, enabled})
      PATCH  /admin/ai-agents/{agent_key}   body: { enabled: boolean }
   ============================================================ */

import type {
  Agent,
  FlaggedTransaction,
  Listing,
  ListingCategory,
  ListingStatus,
  OverviewMetrics,
  User,
  UserStatus,
} from '../data/mock'
import { AGENT_CATALOG } from '../data/mock'
import { formatDate } from '../lib/format'

export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

/** Live mode is the default — the dashboard reads the FastAPI /admin endpoints. */
export const USE_MOCK_DATA: boolean = false

/** Host part of the base URL, safe to render in the UI. */
export const API_HOST: string = (() => {
  try {
    return new URL(API_BASE_URL).host
  } catch {
    return API_BASE_URL
  }
})()

export const endpoints = {
  login: '/auth/login',
  overview: '/admin/overview',
  users: '/admin/users',
  listings: '/admin/listings',
  agents: '/admin/ai-agents',
} as const

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/* --- Admin auth (JWT in localStorage) ------------------------ */

const TOKEN_STORAGE_KEY = 'campusmart_admin_token'
const EMAIL_STORAGE_KEY = 'campusmart_admin_email'

export interface AdminSession {
  token: string
  email: string
}

export function getAuthToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function readAdminSession(): AdminSession | null {
  try {
    const token = window.localStorage.getItem(TOKEN_STORAGE_KEY)
    if (!token) return null
    const email = window.localStorage.getItem(EMAIL_STORAGE_KEY) ?? ''
    return { token, email }
  } catch {
    return null
  }
}

export function persistAdminSession(session: AdminSession): void {
  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, session.token)
    window.localStorage.setItem(EMAIL_STORAGE_KEY, session.email)
  } catch {
    /* storage blocked — the session lasts until the tab closes */
  }
}

export function clearAdminSession(): void {
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY)
    window.localStorage.removeItem(EMAIL_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Accepts `{access_token|token|jwt}` at the top level or nested under `data`. */
function extractToken(payload: unknown): string | null {
  if (payload === null || typeof payload !== 'object') return null
  const body = payload as Record<string, unknown>
  for (const key of ['access_token', 'token', 'jwt', 'accessToken']) {
    const value = body[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return extractToken(body.data)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')
  if (init?.body !== undefined) headers.set('Content-Type', 'application/json')
  if (path.startsWith('/admin')) {
    const token = getAuthToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  let response: Response
  try {
    response = await fetch(url, { ...init, headers })
  } catch {
    throw new ApiError(
      0,
      `Unable to reach ${API_BASE_URL}. Start the FastAPI server or set VITE_API_BASE_URL.`,
    )
  }

  if (!response.ok) {
    const message =
      response.status === 401
        ? 'Your admin session has expired or the credentials were rejected. Sign in again.'
        : `${response.status} ${response.statusText} while requesting ${path}`
    throw new ApiError(response.status, message)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** Generic verbs for mutations (PATCH / DELETE against FastAPI). */
export const api = {
  get<T>(path: string, init?: RequestInit): Promise<T> {
    return request<T>(path, { ...init, method: 'GET' })
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  },
  remove<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' })
  },
}

/** POST /auth/login — returns a session whose JWT is persisted by the caller. */
export async function loginAdmin(email: string, password: string): Promise<AdminSession> {
  const payload = await api.post<unknown>(endpoints.login, { email, password })
  const token = extractToken(payload)
  if (!token) {
    throw new ApiError(0, 'Login reached the server but no access token was returned.')
  }
  return { token, email }
}

/* --- Wire types (FastAPI admin contract, snake_case) -------- */

export interface WireUser {
  id: string | number
  name: string
  email: string
  trust_score: number
  status: string
  created_at: string
}

export interface WireListing {
  id: string | number
  seller_id: string | number
  seller_name?: string
  seller_email?: string
  seller_trust_score?: number
  title: string
  description?: string
  category?: string
  condition?: string
  image_url?: string | null
  listed_price: number
  suggested_price: number
  status: string
  trust_reason?: string | null
  created_at: string
}

export interface WireAgent {
  key?: string
  id?: string
  name?: string
  description?: string
  enabled?: boolean
}

export interface WireOverview {
  total_active_users?: number
  listings_today?: number
  flagged_count?: number
  recent_flags?: unknown
}

export interface WireRecentFlag {
  id?: string | number
  transaction_id?: string | number
  listing_id?: string | number
  listing?: string
  listing_title?: string
  title?: string
  amount?: number
  reason?: string
  confidence?: number
  reported_by?: string
  created_at?: string
  severity?: string
  acknowledged?: boolean
}

/* --- Adapters (wire shape -> view shape) -------------------- */

/** Accepts a bare array or a `{ data: [...] }` envelope. */
function asArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (payload !== null && typeof payload === 'object') {
    const data = (payload as { data?: unknown }).data
    if (Array.isArray(data)) return data as T[]
  }
  return []
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'Unexpected error while talking to the API.'
}

const CATEGORY_ALIASES: Record<string, ListingCategory> = {
  textbook: 'textbooks',
  textbooks: 'textbooks',
  books: 'textbooks',
  electronics: 'electronics',
  tech: 'electronics',
  furniture: 'furniture',
  transport: 'transport',
  bike: 'transport',
  bikes: 'transport',
  bikes_and_transport: 'transport',
  supplies: 'supplies',
  lab: 'supplies',
  lab_supplies: 'supplies',
}

function toCategory(raw: string | null | undefined): ListingCategory {
  return CATEGORY_ALIASES[(raw ?? '').trim().toLowerCase()] ?? 'other'
}

function toListingStatus(raw: string | null | undefined): ListingStatus {
  return raw === 'flagged' || raw === 'sold' ? raw : 'active'
}

function toUserStatus(raw: string | null | undefined): UserStatus {
  return raw === 'blocked' ? 'blocked' : 'active'
}

/** Best-effort agent attribution from the trust-reason text. */
function detectAgent(reason: string): string {
  const text = reason.toLowerCase()
  if (text.includes('price') || text.includes('deviation') || text.includes('suggested')) {
    return 'Price Prediction Agent'
  }
  if (text.includes('keyword') || text.includes('policy') || text.includes('moderation')) {
    return 'Listing Moderation Agent'
  }
  if (
    text.includes('fraud') ||
    text.includes('suspicious') ||
    text.includes('blocked') ||
    text.includes('transfer')
  ) {
    return 'Fraud Detection Agent'
  }
  return 'AI trust pipeline'
}

export function adaptUser(wire: WireUser): User {
  return {
    id: String(wire.id),
    name: wire.name,
    email: wire.email,
    trustScore: wire.trust_score,
    status: toUserStatus(wire.status),
    joined: formatDate(wire.created_at),
    listings: 0,
  }
}

export function adaptListing(wire: WireListing): Listing {
  const price = Number(wire.listed_price) || 0
  const aiPrice = Number(wire.suggested_price) || 0
  const deviation = aiPrice === 0 ? 0 : Math.round(((price - aiPrice) / aiPrice) * 100)
  const severity: 'high' | 'medium' = Math.abs(deviation) > 50 ? 'high' : 'medium'
  const flagged = toListingStatus(wire.status) === 'flagged'
  const reason = wire.trust_reason?.trim()

  return {
    id: String(wire.id),
    title: wire.title,
    sellerId: String(wire.seller_id),
    category: toCategory(wire.category),
    price,
    aiPrice,
    status: toListingStatus(wire.status),
    hasImage: Boolean(wire.image_url),
    listed: formatDate(wire.created_at),
    flag: flagged
      ? {
          reason: reason || 'Flagged by the AI trust pipeline — no reason text was returned.',
          severity,
          detectedBy: detectAgent(reason ?? ''),
        }
      : null,
  }
}

export function adaptAgent(wire: WireAgent): Agent {
  const key = String(wire.key ?? wire.id ?? '')
  const catalog = AGENT_CATALOG.find((agent) => agent.id === key)
  return {
    id: key,
    name: wire.name ?? catalog?.name ?? key,
    description:
      wire.description ??
      catalog?.description ??
      'Runtime state served by the FastAPI agent control API.',
    enabled: wire.enabled ?? true,
  }
}

type AgentRuntimeState = { key: string; enabled: boolean }

/**
 * The backend may return either:
 *   - a dict of booleans `{ "listing_intelligence": true, ... }`
 *   - a list of `{ key, enabled }` items (optionally under `{ data: [] }`)
 */
function parseAgentRuntime(payload: unknown): AgentRuntimeState[] {
  if (Array.isArray(payload)) {
    const rows: AgentRuntimeState[] = []
    for (const item of payload) {
      if (item === null || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const key = String(row.key ?? row.id ?? row.name ?? '').trim()
      if (!key) continue
      rows.push({ key, enabled: row.enabled !== false })
    }
    return rows
  }
  if (payload !== null && typeof payload === 'object') {
    const envelope = payload as Record<string, unknown>
    if (envelope.data !== undefined) return parseAgentRuntime(envelope.data)
    if (envelope.agents !== undefined) return parseAgentRuntime(envelope.agents)
    const entries = Object.entries(envelope)
    if (entries.length > 0 && entries.every(([, value]) => typeof value === 'boolean')) {
      return entries.map(([key, enabled]) => ({ key, enabled: enabled as boolean }))
    }
  }
  return []
}

/**
 * Always yields the three core agents (catalog metadata) merged with whatever
 * runtime state the server returned, so the UI never shows "0 of 0 active".
 */
export function adaptAgents(payload: unknown): Agent[] {
  const runtime = parseAgentRuntime(payload)
  const enabledByKey = new Map(runtime.map((row) => [row.key, row.enabled]))
  const agents: Agent[] = AGENT_CATALOG.map((catalogAgent) => ({
    ...catalogAgent,
    enabled: enabledByKey.get(catalogAgent.id) ?? catalogAgent.enabled,
  }))
  for (const row of runtime) {
    if (AGENT_CATALOG.some((catalogAgent) => catalogAgent.id === row.key)) continue
    agents.push(adaptAgent({ key: row.key, enabled: row.enabled }))
  }
  return agents
}

function adaptRecentFlag(wire: WireRecentFlag, index: number): FlaggedTransaction {
  const confidence = Number(wire.confidence ?? 0)
  const rawSeverity = (wire.severity ?? '').toLowerCase()
  const severity: 'high' | 'medium' =
    rawSeverity === 'high' || rawSeverity === 'medium'
      ? rawSeverity
      : confidence >= 85
        ? 'high'
        : 'medium'

  return {
    id: String(wire.id ?? wire.transaction_id ?? `FLAG-${index + 1}`),
    listing: String(
      wire.listing_title ?? wire.title ?? wire.listing ?? wire.listing_id ?? 'Untitled listing',
    ),
    amount: Number(wire.amount ?? 0),
    reason: wire.reason ?? 'Flagged by the AI trust pipeline.',
    confidence,
    reportedBy: wire.reported_by ?? 'AI agent',
    opened: wire.created_at ? formatDate(wire.created_at) : '—',
    severity,
    acknowledged: wire.acknowledged ?? false,
  }
}

export function adaptOverview(wire: WireOverview): {
  metrics: OverviewMetrics
  queue: FlaggedTransaction[]
} {
  const queue = asArray<WireRecentFlag>(wire.recent_flags).map(adaptRecentFlag)
  return {
    metrics: {
      totalActiveUsers: Number(wire.total_active_users ?? 0),
      listingsToday: Number(wire.listings_today ?? 0),
      flaggedCount: Number(wire.flagged_count ?? queue.filter((tx) => !tx.acknowledged).length),
    },
    queue,
  }
}

/* --- Fetchers ------------------------------------------------ */

export async function fetchOverview(): Promise<{
  metrics: OverviewMetrics
  queue: FlaggedTransaction[]
}> {
  return adaptOverview(await api.get<WireOverview>(endpoints.overview))
}

export async function fetchUsers(): Promise<User[]> {
  const payload = await api.get<unknown>(endpoints.users)
  return asArray<WireUser>(payload).map(adaptUser)
}

export async function fetchListings(): Promise<Listing[]> {
  const payload = await api.get<unknown>(endpoints.listings)
  return asArray<WireListing>(payload).map(adaptListing)
}

export async function fetchAgents(): Promise<Agent[]> {
  return adaptAgents(await api.get<unknown>(endpoints.agents))
}

/* --- Mutations ---------------------------------------------- */

export async function setUserStatus(userId: string, status: UserStatus): Promise<void> {
  await api.patch(`${endpoints.users}/${encodeURIComponent(userId)}/status`, { status })
}

export async function approveListing(productId: string): Promise<void> {
  await api.patch(`${endpoints.listings}/${encodeURIComponent(productId)}/approve`)
}

export async function removeListing(productId: string): Promise<void> {
  await api.remove(`${endpoints.listings}/${encodeURIComponent(productId)}`)
}

export async function setAgentEnabled(agentKey: string, enabled: boolean): Promise<void> {
  await api.patch(`${endpoints.agents}/${encodeURIComponent(agentKey)}`, { enabled })
}
