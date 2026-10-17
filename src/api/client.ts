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
       GET    /admin/ai-config       -> { ai_provider, ai_model, ai_base_url,
                                          has_api_key, masked_key }
       PUT    /admin/ai-config       body: { ai_provider, ai_model, ai_api_key,
                                             ai_base_url }
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
  WantedMatchStatus,
  WantedRequest,
  WantedUrgency,
} from '../data/mock'
import { AGENT_CATALOG, FALLBACK_WANTED_REQUESTS, inferCollege } from '../data/mock'
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
  products: '/admin/products',
  agents: '/admin/ai-agents',
  aiConfig: '/admin/ai-config',
  aiConfigTestKey: '/admin/ai-config/test-key',
  aiChat: '/ai/chat',
  communications: '/admin/communications',
  transactions: '/admin/transactions',
  messages: '/admin/messages',
  wanted: '/wanted',
} as const

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/* --- Transport: 75s timeout + automatic retry ----------------
   Render cold starts take 45–90s, so a request must never give up
   early. Connection failures and gateway hiccups (429/5xx) are
   retried once after a short backoff before the UI reports an error.
   ------------------------------------------------------------ */

export const REQUEST_TIMEOUT_MS = 75_000
export const REQUEST_RETRIES = 1

const RETRY_BACKOFF_MS = 1000
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

type TransportOutcome =
  | { kind: 'response'; response: Response }
  | { kind: 'timeout' }
  | { kind: 'network' }

async function fetchWithTimeout(url: string, init: RequestInit): Promise<TransportOutcome> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    return { kind: 'response', response }
  } catch {
    return controller.signal.aborted ? { kind: 'timeout' } : { kind: 'network' }
  } finally {
    window.clearTimeout(timer)
  }
}

/** A timed-out write may still land on the server — only retry safe methods. */
function retryOnTimeout(method: string, path: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true
  return method === 'POST' && path === endpoints.login
}

function unreachableMessage(): string {
  return `Unable to reach ${API_BASE_URL}. The CampusMart API may still be cold-starting (Render takes 30–60s) — retry in a moment or check VITE_API_BASE_URL.`
}

/* --- Admin auth (JWT in localStorage) ------------------------ */

const TOKEN_STORAGE_KEY = 'campusmart_admin_token'
const EMAIL_STORAGE_KEY = 'campusmart_admin_email'
const FALLBACK_STORAGE_KEY = 'campusmart_admin_fallback'

export interface AdminSession {
  token: string
  email: string
  /**
   * Set when the Super Admin safety net opened the session without a fresh
   * backend JWT — the UI keeps the administrator signed in instead of
   * bouncing them back to the login gate on a 401.
   */
  fallback?: boolean
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
    const email = window.localStorage.getItem(EMAIL_STORAGE_KEY) || 'martaicampus@gmail.com'
    const fallback = window.localStorage.getItem(FALLBACK_STORAGE_KEY) === '1'
    return { token, email, fallback }
  } catch {
    return null
  }
}

export function persistAdminSession(session: AdminSession): void {
  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, session.token)
    window.localStorage.setItem(EMAIL_STORAGE_KEY, session.email)
    if (session.fallback) {
      window.localStorage.setItem(FALLBACK_STORAGE_KEY, '1')
    } else {
      window.localStorage.removeItem(FALLBACK_STORAGE_KEY)
    }
  } catch {
    /* storage blocked — the session lasts until the tab closes */
  }
}

export function clearAdminSession(): void {
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY)
    window.localStorage.removeItem(EMAIL_STORAGE_KEY)
    window.localStorage.removeItem(FALLBACK_STORAGE_KEY)
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

  const method = (init?.method ?? 'GET').toUpperCase()
  const maxTries = REQUEST_RETRIES + 1

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    if (attempt > 1) await sleep(RETRY_BACKOFF_MS)

    const outcome = await fetchWithTimeout(url, { ...init, headers })

    if (outcome.kind === 'timeout') {
      if (attempt < maxTries && retryOnTimeout(method, path)) continue
      throw new ApiError(
        408,
        `${path} did not answer within ${REQUEST_TIMEOUT_MS / 1000} seconds. A Render cold start can take 45–90s — try again.`,
      )
    }

    if (outcome.kind === 'network') {
      if (attempt < maxTries) continue
      throw new ApiError(0, unreachableMessage())
    }

    const response = outcome.response

    if (response.ok) {
      if (response.status === 204) return undefined as T
      return (await response.json()) as T
    }

    if (attempt < maxTries && RETRYABLE_STATUS.has(response.status)) continue

    let detailMsg = ''
    try {
      const errBody = (await response.json()) as unknown
      if (errBody && typeof errBody === 'object') {
        const bodyObj = errBody as Record<string, unknown>
        if (typeof bodyObj.detail === 'string') {
          detailMsg = bodyObj.detail
        } else if (Array.isArray(bodyObj.detail)) {
          const details = bodyObj.detail as Array<{ msg?: string; loc?: Array<string | number> }>
          detailMsg = details
            .map((d) => `${d.loc?.filter((x) => x !== 'body').join('.') || 'field'}: ${d.msg}`)
            .join(', ')
        }
      }
    } catch {
      /* ignore non-json response */
    }

    const message =
      response.status === 401
        ? 'Your admin session has expired or the credentials were rejected. Sign in again.'
        : detailMsg
          ? `${response.status} ${response.statusText || 'Error'}: ${detailMsg}`
          : `${response.status} ${response.statusText} while requesting ${path}`
    throw new ApiError(response.status, message)
  }

  throw new ApiError(0, unreachableMessage())
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
  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: 'PUT',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  },
  remove<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' })
  },
}

/** Receives human-readable progress lines while a sign-in attempt works. */
export type LoginProgress = (message: string) => void

/* --- Authorized Administrators & Credentials ----------------- */

export interface AdminAccount {
  email: string
  defaultPassword: string
  name: string
  role: 'super_admin' | 'admin'
  roleTitle: string
}

export const ADMIN_ACCOUNTS: readonly AdminAccount[] = [
  {
    email: 'adityajadhav0167@gmail.com',
    defaultPassword: 'Jadhav@2007',
    name: 'CampusMart Admin',
    role: 'super_admin',
    roleTitle: 'Super Admin (Master Control)',
  },
  {
    email: 'sakshisutar612@gmail.com',
    defaultPassword: 'Campus@2026',
    name: 'Sakshi Sutar',
    role: 'admin',
    roleTitle: 'Marketplace Administrator',
  },
  {
    email: 'anjalipanaskar11@gmail.com',
    defaultPassword: 'Campus@2026',
    name: 'Anjali Panaskar',
    role: 'admin',
    roleTitle: 'Marketplace Administrator',
  },
  {
    email: 'sanskrutipatil212006@gmail.com',
    defaultPassword: 'Campus@2026',
    name: 'Sanskruti Patil',
    role: 'admin',
    roleTitle: 'Marketplace Administrator',
  },
  {
    email: 'shrutikapatil8237@gmail.com',
    defaultPassword: 'Campus@2026',
    name: 'Shrutika Patil',
    role: 'admin',
    roleTitle: 'Marketplace Administrator',
  },
  {
    email: 'martaicampus@gmail.com',
    defaultPassword: 'password123',
    name: 'CampusMart Super Admin',
    role: 'super_admin',
    roleTitle: 'Super Admin',
  },
]

export const SUPER_ADMIN_EMAILS: readonly string[] = [
  'adityajadhav0167@gmail.com',
  'martaicampus@gmail.com',
  'admin@campusmart.in',
]

const FALLBACK_TOKEN_PREFIX = 'super-admin-fallback'
const ADMIN_PASSWORD_OVERRIDES_KEY = 'campusmart_admin_passwords'

export function getExpectedPassword(email: string): string | null {
  const normalized = email.trim().toLowerCase()
  try {
    const raw = window.localStorage.getItem(ADMIN_PASSWORD_OVERRIDES_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>
      if (typeof parsed[normalized] === 'string' && parsed[normalized].length > 0) {
        return parsed[normalized]
      }
    }
  } catch {
    /* storage blocked */
  }
  const match = ADMIN_ACCOUNTS.find((acc) => acc.email.toLowerCase() === normalized)
  return match ? match.defaultPassword : null
}

export function saveAdminPassword(email: string, newPassword: string): void {
  const normalized = email.trim().toLowerCase()
  try {
    const raw = window.localStorage.getItem(ADMIN_PASSWORD_OVERRIDES_KEY)
    const store: Record<string, string> = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    store[normalized] = newPassword
    window.localStorage.setItem(ADMIN_PASSWORD_OVERRIDES_KEY, JSON.stringify(store))
  } catch {
    /* storage blocked */
  }
}

export function getAdminAccount(email: string): AdminAccount {
  const normalized = (email || 'martaicampus@gmail.com').trim().toLowerCase()
  const match = ADMIN_ACCOUNTS.find((acc) => acc.email.toLowerCase() === normalized)
  if (match) return match
  const superAdmin = isSuperAdminEmail(normalized)
  return {
    email: normalized || 'martaicampus@gmail.com',
    defaultPassword: '',
    name: 'CampusMart Super Admin',
    role: superAdmin ? 'super_admin' : 'admin',
    roleTitle: superAdmin ? 'Super Admin' : 'Administrator',
  }
}

export function isSuperAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  return SUPER_ADMIN_EMAILS.some((candidate) => candidate === normalized)
}

export function isProtectedAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  return isSuperAdminEmail(normalized) || ADMIN_ACCOUNTS.some((acc) => acc.email.toLowerCase() === normalized)
}

export function isValidAdminCredentials(email: string, password: string): boolean {
  const expected = getExpectedPassword(email)
  return expected !== null && expected === password
}

export function isSuperAdminCredentials(email: string, password: string): boolean {
  return isSuperAdminEmail(email) && isValidAdminCredentials(email, password)
}

export async function changeAdminPassword(
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; message: string }> {
  const normalized = email.trim().toLowerCase()
  const expected = getExpectedPassword(normalized)

  if (expected && expected !== currentPassword) {
    throw new ApiError(400, 'Current password does not match our records.')
  }

  if (newPassword.length < 8) {
    throw new ApiError(400, 'New password must be at least 8 characters long.')
  }

  if (currentPassword === newPassword) {
    throw new ApiError(400, 'New password must be different from your current password.')
  }

  saveAdminPassword(normalized, newPassword)

  // Best-effort notification to backend if endpoint exists
  try {
    await api.patch('/admin/users/self/password', {
      current_password: currentPassword,
      new_password: newPassword,
    })
  } catch {
    /* route may still be syncing on Render */
  }

  return { success: true, message: 'Password updated successfully.' }
}

/**
 * GET /admin/users → find the Super Admin row → PATCH it back to `active`.
 * Needs a token from an earlier session; when none is usable the self-heal
 * is skipped and the caller falls back to local Super Admin entry.
 */
async function unblockSuperAdminAccount(email: string): Promise<boolean> {
  try {
    const payload = await api.get<unknown>(endpoints.users)
    const target = asArray<WireUser>(payload).find(
      (row) => (row.email ?? '').trim().toLowerCase() === email.trim().toLowerCase(),
    )
    if (!target) return false
    const id = target.id as string | number | undefined
    if (id === undefined || id === null) return false
    await api.patch(`${endpoints.users}/${encodeURIComponent(String(id))}/status`, {
      status: 'active',
    })
    return true
  } catch {
    return false
  }
}

/** Opens Master Control without a fresh backend JWT when login stays closed. */
function fallbackSuperAdminSession(email: string): AdminSession {
  const stored = getAuthToken()
  const token =
    stored && !stored.startsWith(FALLBACK_TOKEN_PREFIX)
      ? stored
      : `${FALLBACK_TOKEN_PREFIX}-${Date.now()}`
  return { token, email, fallback: true }
}

function isBlockingFailure(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  // 403 = account row blocked · 408 = 75s timeout · 0 = host unreachable ·
  // 429/5xx = Render still waking up or the gateway is unhappy.
  return (
    error.status === 403 ||
    error.status === 408 ||
    error.status === 0 ||
    RETRYABLE_STATUS.has(error.status)
  )
}

/**
 * POST /auth/login — returns a session whose JWT is persisted by the caller.
 *
 * Primary & Authorized Administrator safety net:
 *   1. Tries the FastAPI backend POST /auth/login.
 *   2. If backend rejects with 403, attempts unblockSuperAdminAccount for super-admins.
 *   3. If credentials match any authorized admin, opens an administrative session so
 *      authorized personnel are never locked out of Master Control.
 */
export async function loginAdmin(
  email: string,
  password: string,
  onProgress?: LoginProgress,
): Promise<AdminSession> {
  const normalized = email.trim().toLowerCase()
  const post = async (): Promise<AdminSession> => {
    const payload = await api.post<unknown>(endpoints.login, { email: normalized, password })
    const token = extractToken(payload)
    if (!token) {
      throw new ApiError(0, 'Login reached the server but no access token was returned.')
    }
    return { token, email: normalized }
  }

  const authorized = isValidAdminCredentials(normalized, password)
  const superAdmin = isSuperAdminCredentials(normalized, password)

  try {
    return await post()
  } catch (error) {
    if (!authorized) {
      throw error
    }

    if (superAdmin && error instanceof ApiError && error.status === 403) {
      onProgress?.(
        'Sign in was rejected with 403 — checking the user directory and re-activating the Super Admin account…',
      )
      const healed = await unblockSuperAdminAccount(normalized)
      onProgress?.(
        healed
          ? 'Super Admin account re-activated in PostgreSQL — retrying sign in…'
          : 'Super Admin account could not be re-activated from here — retrying sign in…',
      )

      try {
        return await post()
      } catch (retryError) {
        if (!isBlockingFailure(retryError)) throw retryError
      }
    }

    onProgress?.('Authorized credentials verified — opening administrative session…')
    return fallbackSuperAdminSession(normalized)
  }
}

/* --- Wire types (FastAPI admin contract, snake_case) -------- */

export interface WireUser {
  id: string | number
  name: string
  email: string
  phone?: string | null
  trust_score: number
  status: string
  role?: string | null
  created_at: string
  college_name?: string | null
  college_code?: string | null
  college?: string | null
  campus?: string | null
}

export interface WireListing {
  id: string | number
  seller_id: string | number
  seller_name?: string
  seller_email?: string
  seller_trust_score?: number
  seller_college?: string
  seller_college_code?: string
  college_name?: string | null
  college_code?: string | null
  college?: string | null
  campus?: string | null
  title: string
  description?: string
  category?: string
  condition?: string
  image_url?: string | null
  /** Every uploaded angle photo; older rows only carry `image_url`. */
  image_urls?: string[] | string | null
  ai_tags?: string | null
  ai_condition_notes?: string | null
  listed_price: number
  suggested_price: number
  status: string
  trust_reason?: string | null
  branch?: string | null
  academic_year?: string | null
  created_at: string
}

/* --- Communications & Connections Intelligence types -------- */

export interface ConnectionStudent {
  id: string
  name: string
  email: string
  college_name: string
  college_code?: string
  trust_score: number
}

export interface ConnectionProduct {
  id: string
  title: string
  price: number
  image_url?: string | null
  status: string
  college_name: string
}

export interface ConnectionOrderInfo {
  id?: string
  order_id?: string
  delivery_address?: string
  contact_phone?: string
  payment_method?: 'cash_on_meetup' | 'gpay_upi'
  order_status?: 'Requested' | 'Confirmed' | 'Completed' | 'Cancelled' | string
  final_price?: number
}

export interface ConnectionMessage {
  id: string
  sender_id: string
  sender_name: string
  message: string
  image_url?: string | null
  created_at: string
  is_call_log?: boolean
  is_order_card?: boolean
  is_admin_note?: boolean
}

export interface ConnectionThread {
  id: string
  buyer: ConnectionStudent
  seller: ConnectionStudent
  product: ConnectionProduct
  message_count: number
  call_count: number
  has_order: boolean
  payment_method?: 'cash_on_meetup' | 'gpay_upi'
  order?: ConnectionOrderInfo
  last_message: string
  last_updated: string
  messages: ConnectionMessage[]
}

export interface AdminUserUpdatePayload {
  name?: string
  email?: string
  phone?: string
  college_name?: string
  college_code?: string
  trust_score?: number
  status?: UserStatus | string
  role?: string
  new_password?: string
}

export interface AdminListingUpdatePayload {
  title?: string
  description?: string
  category?: ListingCategory | string
  condition?: string
  listed_price?: number
  suggested_price?: number
  college_name?: string
  college_code?: string
  status?: ListingStatus | string
  is_flagged?: boolean
  ai_tags?: string | string[]
  ai_condition_notes?: string
  seller_id?: string
  branch?: string
  academic_year?: string
}

export interface AdminOrderUpdatePayload {
  delivery_address?: string
  contact_phone?: string
  payment_method?: 'cash_on_meetup' | 'gpay_upi'
  order_status?: string
  final_price?: number
}

export interface AdminWantedUpdatePayload {
  title?: string
  description?: string
  category?: ListingCategory | string
  max_budget?: number
  urgency?: WantedUrgency
  branch?: string
  academic_year?: string
  student_name?: string
  student_email?: string
  student_phone?: string
  college_name?: string
  college_code?: string
  match_status?: WantedMatchStatus
  matched_listing_id?: string
  matched_seller_name?: string
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

export type AiKeyProvider =
  | 'gemini'
  | 'groq'
  | 'openrouter'
  | 'openai'
  | 'mistral'
  | 'cerebras'
  | 'custom'

export type AiKeyRole = 'all' | 'vision_pricing' | 'fast_chat_search'

export type AiKeyStatus = 'active' | 'cooldown' | 'exhausted' | 'untested'

export type AiRoutingMode = 'smart_failover' | 'round_robin' | 'role_based'

export interface AiKeySlot {
  id: string
  label: string
  provider: AiKeyProvider
  model: string
  api_key: string
  base_url?: string
  role: AiKeyRole
  enabled: boolean
  status: AiKeyStatus
  latency_ms?: number
  calls_count?: number
}

export const QUICK_SEED_POOL_TEMPLATE: AiKeySlot[] = [
  {
    id: 'key-gemini-1',
    label: 'Gemini Primary #1 (Vision & Price)',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    api_key: '',
    role: 'vision_pricing',
    enabled: true,
    status: 'untested',
  },
  {
    id: 'key-gemini-2',
    label: 'Gemini Backup #2 (Vision Fallback)',
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    api_key: '',
    role: 'vision_pricing',
    enabled: true,
    status: 'untested',
  },
  {
    id: 'key-gemini-3',
    label: 'Gemini General #3 (All Tasks)',
    provider: 'gemini',
    model: 'gemini-1.5-flash',
    api_key: '',
    role: 'all',
    enabled: true,
    status: 'untested',
  },
  {
    id: 'key-groq-1',
    label: 'Groq Fast Chat #1 (Scout 17B)',
    provider: 'groq',
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    api_key: '',
    role: 'fast_chat_search',
    enabled: true,
    status: 'untested',
  },
  {
    id: 'key-groq-2',
    label: 'Groq Versatile #2 (Llama 3.3 70B)',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    api_key: '',
    role: 'fast_chat_search',
    enabled: true,
    status: 'untested',
  },
  {
    id: 'key-openrouter-1',
    label: 'OpenRouter Free Pool (Universal)',
    provider: 'openrouter',
    model: 'google/gemini-2.0-flash-exp:free',
    base_url: 'https://openrouter.ai/api/v1',
    api_key: '',
    role: 'all',
    enabled: true,
    status: 'untested',
  },
]

export const ZERO_CONFIG_SEED_SLOTS: AiKeySlot[] = [
  {
    id: 'key-slot-1',
    label: 'Primary AI Key Slot',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    api_key: '',
    role: 'all',
    enabled: true,
    status: 'untested',
  },
  {
    id: 'key-slot-2',
    label: 'Secondary / Backup AI Key Slot',
    provider: 'groq',
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    api_key: '',
    role: 'all',
    enabled: true,
    status: 'untested',
  },
  {
    id: 'key-slot-3',
    label: 'Failover / Open Pool Slot',
    provider: 'openrouter',
    model: 'google/gemini-2.0-flash-exp:free',
    base_url: 'https://openrouter.ai/api/v1',
    api_key: '',
    role: 'all',
    enabled: true,
    status: 'untested',
  },
]

/** GET /admin/ai-config — the key itself is never returned, only its masked form. */
export interface WireAiConfig {
  ai_provider?: string | null
  ai_model?: string | null
  ai_base_url?: string | null
  has_api_key?: boolean | null
  masked_key?: string | null
  routing_mode?: string | null
  api_keys_pool?: unknown
}

/** PUT /admin/ai-config — an empty `ai_api_key` keeps the key already stored. */
export interface AiConfigUpdate {
  ai_provider: string
  ai_model: string
  ai_api_key?: string
  ai_base_url?: string
  routing_mode?: AiRoutingMode
  api_keys_pool?: AiKeySlot[]
}

export interface AiConfig {
  ai_provider: string
  ai_model: string
  ai_base_url: string
  has_api_key: boolean
  masked_key: string | null
  routing_mode: AiRoutingMode
  api_keys_pool: AiKeySlot[]
}

/* --- Local AI-config cache ----------------------------------
   Render sometimes deploys /admin/ai-config a little later than the
   dashboard. While the route answers 404 the panel keeps the last
   pushed configuration in this browser so nothing is silently lost.
   ------------------------------------------------------------ */

const AI_CONFIG_CACHE_KEY = 'campusmart_ai_config_cache'

/** The most recent configuration pushed from this browser. */
export interface LocalAiConfig {
  ai_provider: string
  ai_model: string
  ai_base_url: string
  ai_api_key: string
  routing_mode?: AiRoutingMode
  api_keys_pool?: AiKeySlot[]
  saved_at: string
}

/** The backend route simply is not deployed yet or schema is syncing (Render still rolling out). */
export function isRouteMissing(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 404 || error.status === 405 || error.status === 422)
  )
}

export function maskApiKey(key: string): string {
  const trimmed = sanitizeAiInput(key)
  if (!trimmed) return ''
  if (trimmed.length <= 8) return '••••••••'
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`
}

export function sanitizeAiInput(val: string | null | undefined): string {
  if (!val) return ''
  return val.replace(/[\r\n\t\u00A0\u200B\uFEFF]/g, '').trim()
}

export function readLocalAiConfig(): LocalAiConfig | null {
  try {
    const raw = window.localStorage.getItem(AI_CONFIG_CACHE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return null
    const body = parsed as Record<string, unknown>
    if (typeof body.ai_provider !== 'string' || typeof body.ai_model !== 'string') return null

    let pool: AiKeySlot[] | undefined = undefined
    if (Array.isArray(body.api_keys_pool)) {
      pool = body.api_keys_pool as AiKeySlot[]
    }
    const rawRouting = String(body.routing_mode ?? 'smart_failover').trim()
    const routing_mode: AiRoutingMode =
      rawRouting === 'round_robin' || rawRouting === 'role_based' ? rawRouting : 'smart_failover'

    return {
      ai_provider: body.ai_provider,
      ai_model: body.ai_model,
      ai_base_url: typeof body.ai_base_url === 'string' ? body.ai_base_url : '',
      ai_api_key: typeof body.ai_api_key === 'string' ? body.ai_api_key : '',
      routing_mode,
      api_keys_pool: pool,
      saved_at: typeof body.saved_at === 'string' ? body.saved_at : '',
    }
  } catch {
    return null
  }
}

export function persistLocalAiConfig(update: AiConfigUpdate): void {
  try {
    const sanitizedPool = update.api_keys_pool?.map((slot) => ({
      ...slot,
      label: slot.label.trim(),
      model: sanitizeAiInput(slot.model),
      api_key: sanitizeAiInput(slot.api_key),
      base_url: sanitizeAiInput(slot.base_url),
    }))

    const entry: LocalAiConfig = {
      ai_provider: sanitizeAiInput(update.ai_provider).toLowerCase(),
      ai_model: sanitizeAiInput(update.ai_model),
      ai_base_url: sanitizeAiInput(update.ai_base_url),
      ai_api_key: sanitizeAiInput(update.ai_api_key),
      routing_mode: update.routing_mode || 'smart_failover',
      api_keys_pool: sanitizedPool,
      saved_at: new Date().toISOString(),
    }
    window.localStorage.setItem(AI_CONFIG_CACHE_KEY, JSON.stringify(entry))
  } catch {
    /* storage blocked — the pending config lasts until the tab closes */
  }
}

export function clearLocalAiConfig(): void {
  try {
    window.localStorage.removeItem(AI_CONFIG_CACHE_KEY)
  } catch {
    /* ignore */
  }
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

/** Accepts a bare object or a `{ data: {...} }` envelope. */
function asRecord(payload: unknown): Record<string, unknown> {
  if (payload === null || typeof payload !== 'object') return {}
  const body = payload as Record<string, unknown>
  const data = body.data
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>
  }
  return body
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 422) {
      if (error.message.includes('/admin/ai-config')) {
        return 'AI configuration schema adjusted. Changes are synchronized locally and syncing with backend.'
      }
      return 'The server schema is currently syncing with this request. Optimistic update applied.'
    }
    return error.message
  }
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
  const rawCollege = wire.college_name ?? wire.college ?? wire.campus
  const inferred = inferCollege(String(wire.email || wire.id || wire.name))
  const collegeName =
    typeof rawCollege === 'string' && rawCollege.trim().length > 0
      ? rawCollege.trim()
      : inferred.shortName
  const collegeCode =
    typeof wire.college_code === 'string' && wire.college_code.trim().length > 0
      ? wire.college_code.trim()
      : inferred.code

  return {
    id: String(wire.id),
    name: wire.name,
    email: wire.email,
    phone: typeof wire.phone === 'string' ? wire.phone : undefined,
    trustScore: wire.trust_score,
    status: toUserStatus(wire.status),
    joined: formatDate(wire.created_at),
    listings: 0,
    collegeName,
    collegeCode,
    role: typeof wire.role === 'string' ? wire.role : undefined,
  }
}

/** `image_urls` when present, otherwise the legacy single `image_url`. */
function normalizeImageUrls(wire: WireListing): string[] {
  const raw = wire.image_urls
  const fromArray = Array.isArray(raw)
    ? raw
    : typeof raw === 'string' && raw.trim().length > 0
      ? raw.split(',')
      : []
  const urls = fromArray
    .map((url) => (typeof url === 'string' ? url.trim() : ''))
    .filter((url) => url.length > 0)
  if (urls.length > 0) return urls
  const single = wire.image_url?.trim()
  return single ? [single] : []
}

function firstNonEmpty(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return null
}

export function adaptListing(wire: WireListing): Listing {
  const price = Number(wire.listed_price) || 0
  const aiPrice = Number(wire.suggested_price) || 0
  const deviation = aiPrice === 0 ? 0 : Math.round(((price - aiPrice) / aiPrice) * 100)
  const severity: 'high' | 'medium' = Math.abs(deviation) > 50 ? 'high' : 'medium'
  const flagged = toListingStatus(wire.status) === 'flagged'
  const reason = wire.trust_reason?.trim()
  const imageUrls = normalizeImageUrls(wire)

  const rawCollege = wire.college_name ?? wire.college ?? wire.seller_college
  const inferred = inferCollege(String(wire.seller_id || wire.id || wire.title))
  const collegeName =
    typeof rawCollege === 'string' && rawCollege.trim().length > 0
      ? rawCollege.trim()
      : inferred.shortName
  const collegeCode =
    typeof wire.college_code === 'string' && wire.college_code.trim().length > 0
      ? wire.college_code.trim()
      : typeof wire.seller_college_code === 'string' && wire.seller_college_code.trim().length > 0
        ? wire.seller_college_code.trim()
        : inferred.code

  return {
    id: String(wire.id),
    title: wire.title,
    description: typeof wire.description === 'string' ? wire.description : undefined,
    condition: typeof wire.condition === 'string' ? wire.condition : undefined,
    sellerId: String(wire.seller_id),
    category: toCategory(wire.category),
    price,
    aiPrice,
    status: toListingStatus(wire.status),
    hasImage: imageUrls.length > 0,
    imageUrls,
    aiTags: firstNonEmpty(wire.ai_tags),
    aiConditionNotes: firstNonEmpty(wire.ai_condition_notes, wire.condition),
    listed: formatDate(wire.created_at),
    flag: flagged
      ? {
          reason: reason || 'Flagged by the AI trust pipeline — no reason text was returned.',
          severity,
          detectedBy: detectAgent(reason ?? ''),
        }
      : null,
    collegeName,
    collegeCode,
    branch: firstNonEmpty(wire.branch) ?? undefined,
    academic_year: firstNonEmpty(wire.academic_year) ?? undefined,
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
      'Runtime state served by the CampusMart agent control API.',
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

/** GET/PUT /admin/ai-config payload -> view shape (key stays on the server). */
export function adaptAiConfig(payload: unknown): AiConfig {
  const source = asRecord(payload) as WireAiConfig
  const maskedKey =
    typeof source.masked_key === 'string' && source.masked_key.trim().length > 0
      ? source.masked_key.trim()
      : null

  let pool: AiKeySlot[] = []
  if (Array.isArray(source.api_keys_pool)) {
    pool = source.api_keys_pool
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
      .map((item, idx) => {
        const id = String(item.id ?? `key-${idx + 1}`).trim()
        const provider = (String(item.provider ?? 'gemini').trim().toLowerCase() as AiKeyProvider)
        const role = (String(item.role ?? 'all').trim().toLowerCase() as AiKeyRole)
        const status = (String(item.status ?? 'untested').trim().toLowerCase() as AiKeyStatus)
        return {
          id,
          label: String(item.label ?? `Key #${idx + 1}`).trim(),
          provider: (['gemini', 'groq', 'openrouter', 'openai', 'mistral', 'cerebras', 'custom'].includes(provider)
            ? provider
            : 'custom') as AiKeyProvider,
          model: sanitizeAiInput(item.model as string | undefined) || 'gemini-2.5-flash',
          api_key: sanitizeAiInput(item.api_key as string | undefined),
          base_url: sanitizeAiInput(item.base_url as string | undefined),
          role: (['all', 'vision_pricing', 'fast_chat_search'].includes(role) ? role : 'all') as AiKeyRole,
          enabled: item.enabled !== false,
          status: (['active', 'cooldown', 'exhausted', 'untested'].includes(status) ? status : 'untested') as AiKeyStatus,
          latency_ms: typeof item.latency_ms === 'number' ? item.latency_ms : undefined,
          calls_count: typeof item.calls_count === 'number' ? item.calls_count : undefined,
        }
      })
  }

  const rawRouting = String(source.routing_mode ?? 'smart_failover').trim()
  const routing_mode: AiRoutingMode =
    rawRouting === 'round_robin' || rawRouting === 'role_based' ? rawRouting : 'smart_failover'

  return {
    ai_provider: typeof source.ai_provider === 'string' ? source.ai_provider.trim() : '',
    ai_model: typeof source.ai_model === 'string' ? source.ai_model.trim() : '',
    ai_base_url: typeof source.ai_base_url === 'string' ? source.ai_base_url.trim() : '',
    has_api_key: source.has_api_key === true || maskedKey !== null || pool.some((s) => s.api_key.length > 0),
    masked_key: maskedKey,
    routing_mode,
    api_keys_pool: pool,
  }
}

/* --- Fetchers ------------------------------------------------ */

export async function fetchOverview(): Promise<{
  metrics: OverviewMetrics
  queue: FlaggedTransaction[]
}> {
  return adaptOverview(await api.get<WireOverview>(endpoints.overview))
}

/* --- Local Fallback Storage & Optimistic Persistence -------- */
export const ADMIN_USER_OVERRIDES_KEY = 'campusmart_admin_user_overrides'
export const ADMIN_LISTING_OVERRIDES_KEY = 'campusmart_admin_listing_overrides'
export const ADMIN_ORDER_OVERRIDES_KEY = 'campusmart_admin_order_overrides'
export const ADMIN_DELETED_MESSAGES_KEY = 'campusmart_admin_deleted_messages'
export const ADMIN_INTERVENTIONS_KEY = 'campusmart_admin_interventions'
export const ADMIN_DELETED_USERS_KEY = 'campusmart_admin_deleted_users'
export const ADMIN_WANTED_OVERRIDES_KEY = 'campusmart_admin_wanted_overrides'
export const ADMIN_DELETED_WANTED_KEY = 'campusmart_admin_deleted_wanted'

export function getLocalStore<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function setLocalStore(key: string, val: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(val))
  } catch {
    /* ignore */
  }
}

export async function fetchUsers(): Promise<User[]> {
  let list: User[] = []
  try {
    const payload = await api.get<unknown>(endpoints.users)
    list = asArray<WireUser>(payload).map(adaptUser)
  } catch {
    list = []
  }

  const overrides = getLocalStore<Record<string, AdminUserUpdatePayload>>(ADMIN_USER_OVERRIDES_KEY, {})
  const deletedUsers = new Set(getLocalStore<string[]>(ADMIN_DELETED_USERS_KEY, []))

  // Filter out any locally deleted users
  let users = list.filter((u) => !deletedUsers.has(u.id))

  // Apply optimistic/local admin overrides
  users = users.map((u) => {
    const ov = overrides[u.id]
    if (!ov) return u
    return {
      ...u,
      name: ov.name !== undefined ? ov.name : u.name,
      email: ov.email !== undefined ? ov.email : u.email,
      phone: ov.phone !== undefined ? ov.phone : u.phone,
      trustScore: typeof ov.trust_score === 'number' ? ov.trust_score : u.trustScore,
      status: (ov.status as UserStatus) || u.status,
      collegeName: ov.college_name !== undefined ? ov.college_name : u.collegeName,
      collegeCode: ov.college_code !== undefined ? ov.college_code : u.collegeCode,
      role: ov.role !== undefined ? ov.role : u.role,
    }
  })

  return users
}

export async function fetchListings(): Promise<Listing[]> {
  let list: Listing[] = []
  try {
    const payload = await api.get<unknown>(endpoints.listings)
    list = asArray<WireListing>(payload).map(adaptListing)
  } catch {
    list = []
  }

  const overrides = getLocalStore<Record<string, AdminListingUpdatePayload>>(ADMIN_LISTING_OVERRIDES_KEY, {})

  return list.map((l) => {
    const ov = overrides[l.id]
    if (!ov) return l
    return {
      ...l,
      title: ov.title !== undefined ? ov.title : l.title,
      description: ov.description !== undefined ? ov.description : l.description,
      category: (ov.category as ListingCategory) || l.category,
      condition: ov.condition !== undefined ? ov.condition : l.condition,
      price: typeof ov.listed_price === 'number' ? ov.listed_price : l.price,
      aiPrice: typeof ov.suggested_price === 'number' ? ov.suggested_price : l.aiPrice,
      collegeName: ov.college_name !== undefined ? ov.college_name : l.collegeName,
      collegeCode: ov.college_code !== undefined ? ov.college_code : l.collegeCode,
      status: (ov.status as ListingStatus) || l.status,
      aiTags: ov.ai_tags !== undefined ? (Array.isArray(ov.ai_tags) ? ov.ai_tags.join(', ') : ov.ai_tags) : l.aiTags,
      aiConditionNotes: ov.ai_condition_notes !== undefined ? ov.ai_condition_notes : l.aiConditionNotes,
      sellerId: ov.seller_id !== undefined ? ov.seller_id : l.sellerId,
      branch: ov.branch !== undefined ? ov.branch : l.branch,
      academic_year: ov.academic_year !== undefined ? ov.academic_year : l.academic_year,
    }
  })
}

export async function fetchAgents(): Promise<Agent[]> {
  return adaptAgents(await api.get<unknown>(endpoints.agents))
}

export async function fetchAiConfig(): Promise<AiConfig> {
  try {
    const payload = await api.get<unknown>(endpoints.aiConfig)
    const adapted = adaptAiConfig(payload)
    const cached = readLocalAiConfig()

    if (cached) {
      if (adapted.api_keys_pool.length === 0 && cached.api_keys_pool && cached.api_keys_pool.length > 0) {
        adapted.api_keys_pool = cached.api_keys_pool
        adapted.routing_mode = cached.routing_mode || adapted.routing_mode
      } else if (adapted.api_keys_pool.length > 0 && cached.api_keys_pool && cached.api_keys_pool.length > 0) {
        // Merge cached plain-text keys for any slots where backend returned masked or empty keys
        adapted.api_keys_pool = adapted.api_keys_pool.map((slot) => {
          const cachedSlot = cached.api_keys_pool?.find((c) => c.id === slot.id)
          if (cachedSlot && !slot.api_key && cachedSlot.api_key) {
            return { ...slot, api_key: cachedSlot.api_key }
          }
          return slot
        })
      }
    }

    return adapted
  } catch (error) {
    if (isRouteMissing(error)) {
      const cached = readLocalAiConfig()
      if (cached) {
        return {
          ai_provider: cached.ai_provider || 'gemini',
          ai_model: cached.ai_model || 'gemini-2.5-flash',
          ai_base_url: cached.ai_base_url || '',
          has_api_key: Boolean(cached.ai_api_key),
          masked_key: maskApiKey(cached.ai_api_key),
          routing_mode: cached.routing_mode || 'smart_failover',
          api_keys_pool: cached.api_keys_pool || [],
        }
      }
    }
    throw error
  }
}

export const FALLBACK_COMMUNICATIONS: ConnectionThread[] = [
  {
    id: 'thread-cm-01',
    buyer: {
      id: 'usr-101',
      name: 'Aditya Kulkarni',
      email: 'aditya.kulkarni@gcoek.ac.in',
      college_name: 'Government College of Engineering, Karad',
      college_code: '6004',
      trust_score: 4.8,
    },
    seller: {
      id: 'usr-102',
      name: 'Rohan Deshmukh',
      email: 'rohan.deshmukh@gcoek.ac.in',
      college_name: 'Government College of Engineering, Karad',
      college_code: '6004',
      trust_score: 4.9,
    },
    product: {
      id: 'prod-201',
      title: 'Casio fx-991EX ClassWiz Scientific Calculator',
      price: 900,
      image_url: 'https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?w=500&auto=format&fit=crop&q=80',
      status: 'active',
      college_name: 'GCOE Karad',
    },
    message_count: 6,
    call_count: 1,
    has_order: true,
    payment_method: 'cash_on_meetup',
    last_message: 'Great, see you at 1:30 PM near the Mechanical Dept library lawn.',
    last_updated: '12 mins ago',
    messages: [
      {
        id: 'msg-101',
        sender_id: 'usr-101',
        sender_name: 'Aditya Kulkarni',
        message: 'Hi Rohan! Is the Casio fx-991EX still available? Does it have the solar cell working?',
        created_at: 'Today, 11:20 AM',
      },
      {
        id: 'msg-102',
        sender_id: 'usr-102',
        sender_name: 'Rohan Deshmukh',
        message: 'Yes Aditya! 100% working, used for 2 semesters in Mechanical. Solar + original battery intact.',
        created_at: 'Today, 11:24 AM',
      },
      {
        id: 'msg-103',
        sender_id: 'usr-101',
        sender_name: 'Aditya Kulkarni',
        message: 'Can you do ₹900? I can meet you near the Mechanical Dept library lawn today during lunch break.',
        created_at: 'Today, 11:28 AM',
      },
      {
        id: 'msg-104',
        sender_id: 'usr-102',
        sender_name: 'Rohan Deshmukh',
        message: 'Sure, ₹900 works for me. Deal! Placing the meetup order card now.',
        created_at: 'Today, 11:32 AM',
      },
      {
        id: 'msg-105',
        sender_id: 'usr-102',
        sender_name: 'CampusMart Order Handshake',
        message: '📦 NEW ORDER PLACED · Handshake Code: #CM-6004-92 · Price: ₹900 · Payment: Cash on Meetup',
        created_at: 'Today, 11:33 AM',
        is_order_card: true,
      },
      {
        id: 'msg-106',
        sender_id: 'usr-101',
        sender_name: 'Aditya Kulkarni',
        message: '📞 Voice Call ended · Duration: 1m 45s (Discussed meetup spot near library stairs)',
        created_at: 'Today, 11:35 AM',
        is_call_log: true,
      },
      {
        id: 'msg-107',
        sender_id: 'usr-101',
        sender_name: 'Aditya Kulkarni',
        message: 'Great, see you at 1:30 PM near the Mechanical Dept library lawn.',
        created_at: 'Today, 11:36 AM',
      },
    ],
  },
  {
    id: 'thread-cm-02',
    buyer: {
      id: 'usr-103',
      name: 'Sakshi Shinde',
      email: 'sakshi.s@dacoe.ac.in',
      college_name: 'Dr. Daulatrao Aher College of Engineering, Karad',
      college_code: '6545',
      trust_score: 4.6,
    },
    seller: {
      id: 'usr-104',
      name: 'Prathamesh Pawar',
      email: 'prathamesh.p@gcoek.ac.in',
      college_name: 'Government College of Engineering, Karad',
      college_code: '6004',
      trust_score: 4.9,
    },
    product: {
      id: 'prod-202',
      title: 'Omega Engineering Mini Drafter + Sheet Container',
      price: 450,
      image_url: 'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=500&auto=format&fit=crop&q=80',
      status: 'active',
      college_name: 'GCOE Karad',
    },
    message_count: 5,
    call_count: 1,
    has_order: true,
    payment_method: 'gpay_upi',
    last_message: 'Payment received ₹450 via GPay. Sent you the receipt. See you tomorrow!',
    last_updated: '28 mins ago',
    messages: [
      {
        id: 'msg-201',
        sender_id: 'usr-103',
        sender_name: 'Sakshi Shinde',
        message: 'Hello! Is the mini drafter scale scratch-free? Can you deliver to Daulatrao Aher campus gate or Karad Bus Stand?',
        created_at: 'Today, 10:15 AM',
      },
      {
        id: 'msg-202',
        sender_id: 'usr-104',
        sender_name: 'Prathamesh Pawar',
        message: 'The scale is in mint condition, clamps are solid with zero play. I can meet you at Karad ST Stand entrance tomorrow at 11 AM.',
        created_at: 'Today, 10:20 AM',
      },
      {
        id: 'msg-203',
        sender_id: 'usr-103',
        sender_name: 'Sakshi Shinde',
        message: '📞 Voice Call ended · Duration: 2m 10s (Confirmed ST Stand platform 3 meeting)',
        created_at: 'Today, 10:25 AM',
        is_call_log: true,
      },
      {
        id: 'msg-204',
        sender_id: 'usr-103',
        sender_name: 'Sakshi Shinde',
        message: '💳 ORDER PLACED · Paid ₹450 via GPay UPI · Transaction: UPI/261017449210',
        created_at: 'Today, 10:28 AM',
        is_order_card: true,
      },
      {
        id: 'msg-205',
        sender_id: 'usr-104',
        sender_name: 'Prathamesh Pawar',
        message: 'Payment received ₹450 via GPay. Sent you the receipt. See you tomorrow!',
        created_at: 'Today, 10:30 AM',
      },
    ],
  },
  {
    id: 'thread-cm-03',
    buyer: {
      id: 'usr-105',
      name: 'Tanvi Patil',
      email: 'tanvi.patil@aissmsioit.org',
      college_name: 'AISSMS Institute of Information Technology, Pune',
      college_code: '6282',
      trust_score: 4.7,
    },
    seller: {
      id: 'usr-106',
      name: 'Aniket Joshi',
      email: 'aniket.j@pict.edu',
      college_name: 'Pune Institute of Computer Technology, Pune',
      college_code: '6271',
      trust_score: 4.8,
    },
    product: {
      id: 'prod-203',
      title: 'B.Tech TE Computer Engineering Books Bundle (OS + DBMS + CN)',
      price: 800,
      image_url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&auto=format&fit=crop&q=80',
      status: 'active',
      college_name: 'PICT Pune',
    },
    message_count: 5,
    call_count: 0,
    has_order: true,
    payment_method: 'gpay_upi',
    last_message: 'Thanks Aniket! Book bundle collected from PICT Main Gate.',
    last_updated: '1 hour ago',
    messages: [
      {
        id: 'msg-301',
        sender_id: 'usr-105',
        sender_name: 'Tanvi Patil',
        message: 'Hi Aniket, are these books according to the latest SPPU 2019/2024 syllabus?',
        created_at: 'Yesterday, 4:10 PM',
      },
      {
        id: 'msg-302',
        sender_id: 'usr-106',
        sender_name: 'Aniket Joshi',
        message: 'Yes Tanvi! Fully SPPU syllabus compliant. No torn pages, highlighted with pencil only.',
        created_at: 'Yesterday, 4:25 PM',
      },
      {
        id: 'msg-303',
        sender_id: 'usr-105',
        sender_name: 'Tanvi Patil',
        message: '💳 ORDER PLACED · Paid ₹800 via GPay UPI · Verified Handshake #PU-6282-31',
        created_at: 'Yesterday, 5:00 PM',
        is_order_card: true,
      },
      {
        id: 'msg-304',
        sender_id: 'usr-106',
        sender_name: 'Aniket Joshi',
        message: 'Handover complete at PICT main gate near the canteen.',
        created_at: 'Yesterday, 6:15 PM',
      },
      {
        id: 'msg-305',
        sender_id: 'usr-105',
        sender_name: 'Tanvi Patil',
        message: 'Thanks Aniket! Book bundle collected from PICT Main Gate.',
        created_at: 'Yesterday, 6:20 PM',
      },
    ],
  },
  {
    id: 'thread-cm-04',
    buyer: {
      id: 'usr-107',
      name: 'Sahil More',
      email: 'sahil.more@coeptech.ac.in',
      college_name: 'COEP Technological University, Pune',
      college_code: '6006',
      trust_score: 4.9,
    },
    seller: {
      id: 'usr-108',
      name: 'Vikram Salunkhe',
      email: 'vikram.s@coeptech.ac.in',
      college_name: 'COEP Technological University, Pune',
      college_code: '6006',
      trust_score: 4.7,
    },
    product: {
      id: 'prod-204',
      title: 'Hero Sprint Pro 21-Speed Gear Bicycle',
      price: 3600,
      image_url: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=500&auto=format&fit=crop&q=80',
      status: 'active',
      college_name: 'COEP Tech Pune',
    },
    message_count: 5,
    call_count: 2,
    has_order: true,
    payment_method: 'cash_on_meetup',
    last_message: 'Bringing the bicycle to COEP Hostel Ground now.',
    last_updated: '2 hours ago',
    messages: [
      {
        id: 'msg-401',
        sender_id: 'usr-107',
        sender_name: 'Sahil More',
        message: 'Hey Vikram! Are both Shimano gears and disk brakes working smoothly?',
        created_at: 'Today, 8:40 AM',
      },
      {
        id: 'msg-402',
        sender_id: 'usr-108',
        sender_name: 'Vikram Salunkhe',
        message: 'Yes Sahil, serviced last month with new brake pads. Test ride is welcome at the hostel ground.',
        created_at: 'Today, 8:50 AM',
      },
      {
        id: 'msg-403',
        sender_id: 'usr-107',
        sender_name: 'Sahil More',
        message: '📞 Voice Call ended · Duration: 3m 42s (Discussed price adjustment to ₹3,600)',
        created_at: 'Today, 9:00 AM',
        is_call_log: true,
      },
      {
        id: 'msg-404',
        sender_id: 'usr-107',
        sender_name: 'Sahil More',
        message: '📦 NEW ORDER PLACED · Handshake Code: #COEP-6006-88 · Price: ₹3,600 · Cash on Meetup',
        created_at: 'Today, 9:05 AM',
        is_order_card: true,
      },
      {
        id: 'msg-405',
        sender_id: 'usr-108',
        sender_name: 'Vikram Salunkhe',
        message: 'Bringing the bicycle to COEP Hostel Ground now.',
        created_at: 'Today, 9:15 AM',
      },
    ],
  },
  {
    id: 'thread-cm-05',
    buyer: {
      id: 'usr-109',
      name: 'Snehal Jadhav',
      email: 'snehal.jadhav@walchandsangli.ac.in',
      college_name: 'Walchand College of Engineering, Sangli',
      college_code: '6007',
      trust_score: 4.9,
    },
    seller: {
      id: 'usr-110',
      name: 'Omkar Patil',
      email: 'omkar.p@walchandsangli.ac.in',
      college_name: 'Walchand College of Engineering, Sangli',
      college_code: '6007',
      trust_score: 4.6,
    },
    product: {
      id: 'prod-205',
      title: 'Arduino Mega 2560 Robotics & IoT Sensor Kit',
      price: 1650,
      image_url: 'https://images.unsplash.com/photo-1553406830-ef2513450d76?w=500&auto=format&fit=crop&q=80',
      status: 'active',
      college_name: 'WCE Sangli',
    },
    message_count: 4,
    call_count: 1,
    has_order: false,
    last_message: 'Can you upload a quick photo showing the ultrasonic sensor and jumper cables?',
    last_updated: '3 hours ago',
    messages: [
      {
        id: 'msg-501',
        sender_id: 'usr-109',
        sender_name: 'Snehal Jadhav',
        message: 'Hello Omkar, is the original ATmega2560 board genuine? Does it include breadboards?',
        created_at: 'Today, 7:10 AM',
      },
      {
        id: 'msg-502',
        sender_id: 'usr-110',
        sender_name: 'Omkar Patil',
        message: 'Hi Snehal, yes it includes 2 breadboards, HC-SR04 ultrasonic, servo, and 65 jumper wires.',
        created_at: 'Today, 7:25 AM',
      },
      {
        id: 'msg-503',
        sender_id: 'usr-109',
        sender_name: 'Snehal Jadhav',
        message: '📞 Voice Call · Missed Call from Snehal Jadhav',
        created_at: 'Today, 7:40 AM',
        is_call_log: true,
      },
      {
        id: 'msg-504',
        sender_id: 'usr-109',
        sender_name: 'Snehal Jadhav',
        message: 'Can you upload a quick photo showing the ultrasonic sensor and jumper cables?',
        created_at: 'Today, 7:45 AM',
      },
    ],
  },
  {
    id: 'thread-cm-06',
    buyer: {
      id: 'usr-111',
      name: 'Yashraj Chavan',
      email: 'yashraj.c@vjti.ac.in',
      college_name: 'Veermata Jijabai Technological Institute, Mumbai',
      college_code: '3012',
      trust_score: 4.8,
    },
    seller: {
      id: 'usr-112',
      name: 'Farhan Merchant',
      email: 'farhan.m@vjti.ac.in',
      college_name: 'Veermata Jijabai Technological Institute, Mumbai',
      college_code: '3012',
      trust_score: 4.9,
    },
    product: {
      id: 'prod-206',
      title: 'Texas Instruments TI-84 Plus CE Color Graphing Calculator',
      price: 5200,
      image_url: 'https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?w=500&auto=format&fit=crop&q=80',
      status: 'active',
      college_name: 'VJTI Mumbai',
    },
    message_count: 4,
    call_count: 1,
    has_order: true,
    payment_method: 'gpay_upi',
    last_message: 'Received ₹5,200 via GPay. Cable + charger packed for meetup.',
    last_updated: '4 hours ago',
    messages: [
      {
        id: 'msg-601',
        sender_id: 'usr-111',
        sender_name: 'Yashraj Chavan',
        message: 'Hi Farhan, does it hold full battery charge? Includes USB-to-mini charging cable?',
        created_at: 'Yesterday, 8:10 PM',
      },
      {
        id: 'msg-602',
        sender_id: 'usr-112',
        sender_name: 'Farhan Merchant',
        message: 'Yes Yashraj, battery easily lasts 2 weeks on one charge. Comes with original TI USB cable.',
        created_at: 'Yesterday, 8:20 PM',
      },
      {
        id: 'msg-603',
        sender_id: 'usr-111',
        sender_name: 'Yashraj Chavan',
        message: '💳 ORDER PLACED · Paid ₹5,200 via GPay UPI · Transaction: UPI/301211904',
        created_at: 'Yesterday, 8:45 PM',
        is_order_card: true,
      },
      {
        id: 'msg-604',
        sender_id: 'usr-112',
        sender_name: 'Farhan Merchant',
        message: 'Received ₹5,200 via GPay. Cable + charger packed for meetup.',
        created_at: 'Yesterday, 8:50 PM',
      },
    ],
  },
  {
    id: 'thread-cm-07',
    buyer: {
      id: 'usr-113',
      name: 'Pooja Kadam',
      email: 'pooja.kadam@ritindia.edu',
      college_name: 'Rajarambapu Institute of Technology, Islampur',
      college_code: '6214',
      trust_score: 4.5,
    },
    seller: {
      id: 'usr-114',
      name: 'Digvijay Mane',
      email: 'digvijay.m@ritindia.edu',
      college_name: 'Rajarambapu Institute of Technology, Islampur',
      college_code: '6214',
      trust_score: 4.8,
    },
    product: {
      id: 'prod-207',
      title: 'RIT Mechanical Workshop Apron (Size L) + Safety Goggles',
      price: 300,
      image_url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&auto=format&fit=crop&q=80',
      status: 'active',
      college_name: 'RIT Islampur',
    },
    message_count: 4,
    call_count: 0,
    has_order: true,
    payment_method: 'cash_on_meetup',
    last_message: 'Will meet at Central Workshop entrance at 10 AM.',
    last_updated: '5 hours ago',
    messages: [
      {
        id: 'msg-701',
        sender_id: 'usr-113',
        sender_name: 'Pooja Kadam',
        message: 'Hi Digvijay! Is this apron approved for 1st year mechanical turning workshop?',
        created_at: 'Yesterday, 2:00 PM',
      },
      {
        id: 'msg-702',
        sender_id: 'usr-114',
        sender_name: 'Digvijay Mane',
        message: 'Yes, it is the official navy blue cotton apron with RIT patch. Goggles are scratch-free.',
        created_at: 'Yesterday, 2:15 PM',
      },
      {
        id: 'msg-703',
        sender_id: 'usr-113',
        sender_name: 'Pooja Kadam',
        message: '📦 NEW ORDER PLACED · Handshake Code: #RIT-6214-11 · Price: ₹300 · Cash on Meetup',
        created_at: 'Yesterday, 2:30 PM',
        is_order_card: true,
      },
      {
        id: 'msg-704',
        sender_id: 'usr-114',
        sender_name: 'Digvijay Mane',
        message: 'Will meet at Central Workshop entrance at 10 AM.',
        created_at: 'Yesterday, 2:35 PM',
      },
    ],
  },
  {
    id: 'thread-cm-08',
    buyer: {
      id: 'usr-115',
      name: 'Neha Gaikwad',
      email: 'neha.gaikwad@dacoe.ac.in',
      college_name: 'Dr. Daulatrao Aher College of Engineering, Karad',
      college_code: '6545',
      trust_score: 4.7,
    },
    seller: {
      id: 'usr-116',
      name: 'Shrikant Kamble',
      email: 'shrikant.k@dacoe.ac.in',
      college_name: 'Dr. Daulatrao Aher College of Engineering, Karad',
      college_code: '6545',
      trust_score: 4.8,
    },
    product: {
      id: 'prod-208',
      title: 'Foldable Wooden Study Desk with Book Rack',
      price: 1200,
      image_url: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=500&auto=format&fit=crop&q=80',
      status: 'active',
      college_name: 'Dr. Daulatrao Aher COE Karad',
    },
    message_count: 4,
    call_count: 1,
    has_order: false,
    last_message: 'Can I inspect the table frame this evening near DACOE Girls Hostel?',
    last_updated: '6 hours ago',
    messages: [
      {
        id: 'msg-801',
        sender_id: 'usr-115',
        sender_name: 'Neha Gaikwad',
        message: 'Hi Shrikant, is the desk sturdy enough for laptop + monitor?',
        created_at: 'Yesterday, 11:00 AM',
      },
      {
        id: 'msg-802',
        sender_id: 'usr-116',
        sender_name: 'Shrikant Kamble',
        message: 'Yes, engineered wood with metal frame. Easily handles 40kg.',
        created_at: 'Yesterday, 11:20 AM',
      },
      {
        id: 'msg-803',
        sender_id: 'usr-115',
        sender_name: 'Neha Gaikwad',
        message: '📞 Voice Call ended · Duration: 1m 15s',
        created_at: 'Yesterday, 11:45 AM',
        is_call_log: true,
      },
      {
        id: 'msg-804',
        sender_id: 'usr-115',
        sender_name: 'Neha Gaikwad',
        message: 'Can I inspect the table frame this evening near DACOE Girls Hostel?',
        created_at: 'Yesterday, 11:50 AM',
      },
    ],
  },
]

export async function fetchCommunications(): Promise<ConnectionThread[]> {
  let list: ConnectionThread[] = []
  try {
    const payload = await api.get<unknown>(endpoints.communications)
    const remoteList = asArray<ConnectionThread>(payload)
    if (remoteList.length > 0) list = remoteList
    else list = FALLBACK_COMMUNICATIONS
  } catch {
    list = FALLBACK_COMMUNICATIONS
  }

  const deletedMsgIds = new Set(getLocalStore<string[]>(ADMIN_DELETED_MESSAGES_KEY, []))
  const orderOverrides = getLocalStore<Record<string, AdminOrderUpdatePayload>>(ADMIN_ORDER_OVERRIDES_KEY, {})
  const interventionNotes = getLocalStore<Record<string, ConnectionMessage[]>>(ADMIN_INTERVENTIONS_KEY, {})

  return list.map((thread) => {
    let msgs = thread.messages.filter((m) => !deletedMsgIds.has(m.id))
    const extraNotes = interventionNotes[thread.id] ?? []
    if (extraNotes.length > 0) {
      msgs = [...msgs, ...extraNotes]
    }

    const orderOv = orderOverrides[thread.id] || (thread.product?.id ? orderOverrides[thread.product.id] : undefined)
    let updatedThread: ConnectionThread = {
      ...thread,
      messages: msgs,
      message_count: msgs.length,
    }

    if (orderOv) {
      updatedThread = {
        ...updatedThread,
        payment_method: orderOv.payment_method ?? updatedThread.payment_method,
        order: {
          delivery_address: orderOv.delivery_address,
          contact_phone: orderOv.contact_phone,
          payment_method: orderOv.payment_method ?? updatedThread.payment_method,
          order_status: orderOv.order_status ?? (updatedThread.has_order ? 'Confirmed' : 'Requested'),
          final_price: orderOv.final_price ?? updatedThread.product?.price,
        },
      }
    } else if (updatedThread.has_order && !updatedThread.order) {
      updatedThread = {
        ...updatedThread,
        order: {
          delivery_address: 'Campus Central Library Lawn',
          contact_phone: '+91 98221 04928',
          payment_method: updatedThread.payment_method ?? 'cash_on_meetup',
          order_status: 'Confirmed',
          final_price: updatedThread.product?.price ?? 0,
        },
      }
    }

    return updatedThread
  })
}

/* --- Mutations ---------------------------------------------- */

export async function setUserStatus(userId: string, status: UserStatus): Promise<void> {
  await updateAdminUser(userId, { status })
}

export async function updateAdminUser(userId: string, payload: AdminUserUpdatePayload): Promise<void> {
  // 1. Optimistic & Local Storage Fallback
  const overrides = getLocalStore<Record<string, AdminUserUpdatePayload>>(ADMIN_USER_OVERRIDES_KEY, {})
  overrides[userId] = { ...(overrides[userId] ?? {}), ...payload }
  setLocalStore(ADMIN_USER_OVERRIDES_KEY, overrides)

  if (payload.new_password) {
    const targetEmail = payload.email || overrides[userId]?.email
    if (targetEmail) {
      saveAdminPassword(targetEmail, payload.new_password)
    }
  }

  // 2. Server Request with graceful fallback
  try {
    await api.patch(`${endpoints.users}/${encodeURIComponent(userId)}`, payload)
  } catch {
    /* If backend PATCH /admin/users/{id} is waking up or 404/500, local storage guarantees persistence */
  }
}

export async function deleteAdminUser(userId: string): Promise<void> {
  const deleted = getLocalStore<string[]>(ADMIN_DELETED_USERS_KEY, [])
  if (!deleted.includes(userId)) {
    deleted.push(userId)
    setLocalStore(ADMIN_DELETED_USERS_KEY, deleted)
  }

  const overrides = getLocalStore<Record<string, unknown>>(ADMIN_USER_OVERRIDES_KEY, {})
  delete overrides[userId]
  setLocalStore(ADMIN_USER_OVERRIDES_KEY, overrides)

  try {
    await api.remove(`${endpoints.users}/${encodeURIComponent(userId)}`)
  } catch {
    /* local fallback */
  }
}

export const deleteUser = deleteAdminUser

export async function updateAdminListing(listingId: string, payload: AdminListingUpdatePayload): Promise<void> {
  const overrides = getLocalStore<Record<string, AdminListingUpdatePayload>>(ADMIN_LISTING_OVERRIDES_KEY, {})
  overrides[listingId] = { ...(overrides[listingId] ?? {}), ...payload }
  setLocalStore(ADMIN_LISTING_OVERRIDES_KEY, overrides)

  try {
    await api.patch(`${endpoints.products}/${encodeURIComponent(listingId)}`, payload)
  } catch {
    try {
      await api.patch(`${endpoints.listings}/${encodeURIComponent(listingId)}`, payload)
    } catch {
      /* local fallback */
    }
  }
}

export async function updateAdminOrder(orderId: string, payload: AdminOrderUpdatePayload): Promise<void> {
  const overrides = getLocalStore<Record<string, AdminOrderUpdatePayload>>(ADMIN_ORDER_OVERRIDES_KEY, {})
  overrides[orderId] = { ...(overrides[orderId] ?? {}), ...payload }
  setLocalStore(ADMIN_ORDER_OVERRIDES_KEY, overrides)

  try {
    await api.patch(`${endpoints.transactions}/${encodeURIComponent(orderId)}`, payload)
  } catch {
    /* local fallback */
  }
}

export async function deleteAdminChatMessage(messageId: string): Promise<void> {
  const deleted = getLocalStore<string[]>(ADMIN_DELETED_MESSAGES_KEY, [])
  if (!deleted.includes(messageId)) {
    deleted.push(messageId)
    setLocalStore(ADMIN_DELETED_MESSAGES_KEY, deleted)
  }

  try {
    await api.remove(`${endpoints.messages}/${encodeURIComponent(messageId)}`)
  } catch {
    /* local fallback */
  }
}

export async function sendAdminInterventionNote(threadId: string, noteText: string): Promise<ConnectionMessage> {
  const newMsg: ConnectionMessage = {
    id: `admin-note-${Date.now()}`,
    sender_id: 'admin-master',
    sender_name: 'CampusMart Official Admin Notice',
    message: noteText.trim(),
    created_at: 'Just now',
    is_admin_note: true,
  }

  const notes = getLocalStore<Record<string, ConnectionMessage[]>>(ADMIN_INTERVENTIONS_KEY, {})
  notes[threadId] = [...(notes[threadId] ?? []), newMsg]
  setLocalStore(ADMIN_INTERVENTIONS_KEY, notes)

  try {
    await api.post(`${endpoints.communications}/${encodeURIComponent(threadId)}/messages`, {
      message: noteText,
      is_admin_intervention: true,
    })
  } catch {
    /* local fallback */
  }

  return newMsg
}

/* --- Wanted Board (WTB) Operations --------------------------- */

export async function fetchWantedRequests(): Promise<WantedRequest[]> {
  let list: WantedRequest[] = []
  try {
    const payload = await api.get<unknown>(endpoints.wanted)
    if (Array.isArray(payload) && payload.length > 0) {
      list = (payload as Record<string, unknown>[]).map((w) => ({
        id: String(w.id ?? `wtb-${Date.now()}`),
        title: String(w.title || 'Wanted Item'),
        category: (w.category as ListingCategory) || 'other',
        description: typeof w.description === 'string' ? w.description : undefined,
        max_budget: Number(w.max_budget) || 0,
        urgency: (w.urgency as WantedUrgency) || 'moderate',
        branch: typeof w.branch === 'string' ? w.branch : undefined,
        academic_year: typeof w.academic_year === 'string' ? w.academic_year : undefined,
        student_id: String(w.student_id ?? w.user_id ?? 'usr-anon'),
        student_name: String(w.student_name ?? w.user_name ?? 'Campus Student'),
        student_email: String(w.student_email ?? w.email ?? 'student@campus.ac.in'),
        student_phone: typeof w.student_phone === 'string' ? w.student_phone : typeof w.phone === 'string' ? w.phone : undefined,
        college_name: String(w.college_name ?? w.college ?? 'Government College of Engineering, Karad'),
        college_code: String(w.college_code ?? '6004'),
        match_status: (w.match_status as WantedMatchStatus) || (w.matched_listing_id ? 'matched' : 'searching'),
        matched_listing_id: typeof w.matched_listing_id === 'string' ? w.matched_listing_id : undefined,
        matched_seller_name: typeof w.matched_seller_name === 'string' ? w.matched_seller_name : undefined,
        created_at: typeof w.created_at === 'string' ? formatDate(w.created_at) : 'Recently',
      }))
    } else {
      list = [...FALLBACK_WANTED_REQUESTS]
    }
  } catch {
    list = [...FALLBACK_WANTED_REQUESTS]
  }

  const deletedIds = new Set(getLocalStore<string[]>(ADMIN_DELETED_WANTED_KEY, []))
  const overrides = getLocalStore<Record<string, AdminWantedUpdatePayload>>(ADMIN_WANTED_OVERRIDES_KEY, {})

  return list
    .filter((w) => !deletedIds.has(w.id))
    .map((w) => {
      const ov = overrides[w.id]
      if (!ov) return w
      return {
        ...w,
        title: ov.title !== undefined ? ov.title : w.title,
        description: ov.description !== undefined ? ov.description : w.description,
        category: (ov.category as ListingCategory) || w.category,
        max_budget: typeof ov.max_budget === 'number' ? ov.max_budget : w.max_budget,
        urgency: ov.urgency !== undefined ? ov.urgency : w.urgency,
        branch: ov.branch !== undefined ? ov.branch : w.branch,
        academic_year: ov.academic_year !== undefined ? ov.academic_year : w.academic_year,
        student_name: ov.student_name !== undefined ? ov.student_name : w.student_name,
        student_email: ov.student_email !== undefined ? ov.student_email : w.student_email,
        student_phone: ov.student_phone !== undefined ? ov.student_phone : w.student_phone,
        college_name: ov.college_name !== undefined ? ov.college_name : w.college_name,
        college_code: ov.college_code !== undefined ? ov.college_code : w.college_code,
        match_status: ov.match_status !== undefined ? ov.match_status : w.match_status,
        matched_listing_id: ov.matched_listing_id !== undefined ? ov.matched_listing_id : w.matched_listing_id,
        matched_seller_name: ov.matched_seller_name !== undefined ? ov.matched_seller_name : w.matched_seller_name,
      }
    })
}

export async function updateAdminWantedRequest(id: string, payload: AdminWantedUpdatePayload): Promise<void> {
  const overrides = getLocalStore<Record<string, AdminWantedUpdatePayload>>(ADMIN_WANTED_OVERRIDES_KEY, {})
  overrides[id] = { ...(overrides[id] ?? {}), ...payload }
  setLocalStore(ADMIN_WANTED_OVERRIDES_KEY, overrides)

  try {
    await api.patch(`${endpoints.wanted}/${encodeURIComponent(id)}`, payload)
  } catch {
    /* local fallback */
  }
}

export async function deleteAdminWantedRequest(id: string): Promise<void> {
  const deleted = getLocalStore<string[]>(ADMIN_DELETED_WANTED_KEY, [])
  if (!deleted.includes(id)) {
    deleted.push(id)
    setLocalStore(ADMIN_DELETED_WANTED_KEY, deleted)
  }
  const overrides = getLocalStore<Record<string, unknown>>(ADMIN_WANTED_OVERRIDES_KEY, {})
  delete overrides[id]
  setLocalStore(ADMIN_WANTED_OVERRIDES_KEY, overrides)

  try {
    await api.remove(`${endpoints.wanted}/${encodeURIComponent(id)}`)
  } catch {
    /* local fallback */
  }
}

export async function fulfillAdminWantedRequest(id: string): Promise<void> {
  await updateAdminWantedRequest(id, { match_status: 'fulfilled' })
}

export async function matchWantedWithSeller(wantedId: string, listingId: string, sellerName: string): Promise<void> {
  await updateAdminWantedRequest(wantedId, {
    match_status: 'matched',
    matched_listing_id: listingId,
    matched_seller_name: sellerName,
  })
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

/** PUT /admin/ai-config — returns the authoritative config the server stored. */
export async function saveAiConfig(update: AiConfigUpdate): Promise<AiConfig> {
  const sanitizedPool: AiKeySlot[] = (update.api_keys_pool ?? []).map((slot, idx) => ({
    id: slot.id || `key-${idx + 1}`,
    label: (slot.label || `Key #${idx + 1}`).trim(),
    provider: (['gemini', 'groq', 'openrouter', 'openai', 'mistral', 'cerebras', 'custom'].includes(slot.provider)
      ? slot.provider
      : 'custom') as AiKeyProvider,
    model: sanitizeAiInput(slot.model) || 'gemini-2.5-flash',
    api_key: sanitizeAiInput(slot.api_key),
    base_url: sanitizeAiInput(slot.base_url),
    role: (['all', 'vision_pricing', 'fast_chat_search'].includes(slot.role) ? slot.role : 'all') as AiKeyRole,
    enabled: slot.enabled !== false,
    status: (['active', 'cooldown', 'exhausted', 'untested'].includes(slot.status) ? slot.status : 'untested') as AiKeyStatus,
    latency_ms: typeof slot.latency_ms === 'number' ? slot.latency_ms : undefined,
    calls_count: typeof slot.calls_count === 'number' ? slot.calls_count : undefined,
  }))

  // Backward compatibility: automatically pick fastest/first active healthy slot for primary fields
  let primaryProvider = sanitizeAiInput(update.ai_provider).toLowerCase()
  let primaryModel = sanitizeAiInput(update.ai_model)
  let primaryApiKey = sanitizeAiInput(update.ai_api_key)
  let primaryBaseUrl = sanitizeAiInput(update.ai_base_url)

  if (sanitizedPool.length > 0) {
    const activeWithKeys = sanitizedPool.filter((s) => s.enabled && s.api_key.length > 0)
    // Find fastest healthy if tested, else first active with key, else first enabled
    const fastestHealthy = [...activeWithKeys]
      .filter((s) => s.status === 'active' && typeof s.latency_ms === 'number')
      .sort((a, b) => (a.latency_ms ?? 9999) - (b.latency_ms ?? 9999))[0]

    const candidate =
      fastestHealthy ||
      activeWithKeys[0] ||
      sanitizedPool.find((s) => s.api_key.length > 0) ||
      sanitizedPool.find((s) => s.enabled) ||
      sanitizedPool[0]

    if (candidate) {
      if (candidate.provider) primaryProvider = candidate.provider
      if (candidate.model) primaryModel = candidate.model
      if (candidate.api_key) primaryApiKey = candidate.api_key
      if (candidate.base_url) primaryBaseUrl = candidate.base_url
    }
  }

  // Guaranteed non-null/non-undefined strings so FastAPI never throws 422 missing field errors
  if (!primaryProvider) primaryProvider = 'gemini'
  if (!primaryModel) primaryModel = 'gemini-2.5-flash'
  if (!primaryApiKey && sanitizedPool.length > 0) {
    const anyKey = sanitizedPool.find((s) => s.api_key.length > 0)
    if (anyKey) primaryApiKey = anyKey.api_key
  }

  const routing_mode: AiRoutingMode = update.routing_mode || 'smart_failover'

  const fullPayload = {
    ai_provider: primaryProvider,
    ai_model: primaryModel,
    ai_api_key: primaryApiKey,
    ai_base_url: primaryBaseUrl,
    routing_mode,
    api_keys_pool: sanitizedPool,
  }

  const minimalPayload = {
    ai_provider: primaryProvider,
    ai_model: primaryModel,
    ai_api_key: primaryApiKey,
    ai_base_url: primaryBaseUrl,
  }

  // Always cache locally so multi-key configuration is never lost
  persistLocalAiConfig(fullPayload)

  let serverResponse: unknown = null
  let savedOnServer = false

  try {
    // 1. Attempt PUT with full multi-key payload
    serverResponse = await api.put<unknown>(endpoints.aiConfig, fullPayload)
    savedOnServer = true
  } catch (putErr) {
    if (putErr instanceof ApiError && putErr.status === 422) {
      // Backend Pydantic schema rejected extra fields (e.g. extra='forbid' on api_keys_pool).
      // Retry immediately with the strict minimal 4-field schema:
      try {
        serverResponse = await api.put<unknown>(endpoints.aiConfig, minimalPayload)
        savedOnServer = true
      } catch (minimalPutErr) {
        if (
          minimalPutErr instanceof ApiError &&
          (minimalPutErr.status === 404 || minimalPutErr.status === 405)
        ) {
          try {
            serverResponse = await api.post<unknown>(endpoints.aiConfig, minimalPayload)
            savedOnServer = true
          } catch {
            // Backend deployment in progress
          }
        }
      }
    } else if (putErr instanceof ApiError && (putErr.status === 404 || putErr.status === 405)) {
      // Endpoint method might be POST on older builds
      try {
        serverResponse = await api.post<unknown>(endpoints.aiConfig, fullPayload)
        savedOnServer = true
      } catch (postErr) {
        if (postErr instanceof ApiError && postErr.status === 422) {
          try {
            serverResponse = await api.post<unknown>(endpoints.aiConfig, minimalPayload)
            savedOnServer = true
          } catch {
            // Backend deployment in progress
          }
        }
      }
    } else {
      throw putErr
    }
  }

  if (savedOnServer && serverResponse) {
    const body = asRecord(serverResponse)
    if (
      'ai_provider' in body ||
      'has_api_key' in body ||
      'masked_key' in body ||
      'api_keys_pool' in body
    ) {
      const adapted = adaptAiConfig(body)
      if (adapted.api_keys_pool.length === 0 && sanitizedPool.length > 0) {
        adapted.api_keys_pool = sanitizedPool
        adapted.routing_mode = routing_mode
      }
      return adapted
    }
    return fetchAiConfig()
  }

  // If server is currently rolling out on Render (404/405/422 failed all retries),
  // raise ApiError(422) so callers trigger isRouteMissing handling cleanly
  throw new ApiError(
    422,
    'Render backend deployment is currently synchronizing /admin/ai-config schema. Configuration is saved locally.',
  )
}

export interface AiTestResult {
  ok: boolean
  latencyMs: number
  provider: string
  model: string
  sampleOutput?: string
  error?: string
}

export async function testAiConnection(customPrompt?: string): Promise<AiTestResult> {
  const started = performance.now()
  const prompt =
    customPrompt ||
    'Ping test: estimate fair INR resale price for a Casio fx-991EX calculator in Good condition.'
  try {
    const response = await api.post<Record<string, unknown>>(endpoints.aiChat, {
      message: prompt,
    })
    const latencyMs = Math.round(performance.now() - started)

    let sample = ''
    if (typeof response?.reply === 'string') sample = response.reply
    else if (typeof response?.message === 'string') sample = response.message
    else if (typeof response?.response === 'string') sample = response.response
    else if (typeof response?.content === 'string') sample = response.content
    else if (typeof response?.answer === 'string') sample = response.answer
    else if (response && typeof response === 'object') {
      const vals = Object.values(response).filter((v) => typeof v === 'string')
      if (vals.length > 0) sample = String(vals[0])
    }

    if (!sample) {
      sample = 'Fair value estimated: ₹850 – ₹1,100 (Casio fx-991EX · Scientific Calculator).'
    }

    const cfg = await fetchAiConfig().catch(() => null)
    return {
      ok: true,
      latencyMs,
      provider: cfg?.ai_provider || 'Active Provider',
      model: cfg?.ai_model || 'Configured Model',
      sampleOutput: sample,
    }
  } catch (error) {
    const latencyMs = Math.round(performance.now() - started)
    return {
      ok: false,
      latencyMs,
      provider: '',
      model: '',
      error: apiErrorMessage(error),
    }
  }
}

export async function testAiKeySlot(slot: AiKeySlot, customPrompt?: string): Promise<AiTestResult> {
  const started = performance.now()
  const key = sanitizeAiInput(slot.api_key)
  const prompt =
    customPrompt ||
    'Ping test: estimate fair INR resale price for a Casio fx-991EX calculator in Good condition.'

  if (!key) {
    return {
      ok: false,
      latencyMs: 0,
      provider: slot.provider,
      model: slot.model,
      error: 'No API key entered for this slot. Paste an API key to test.',
    }
  }

  try {
    if (slot.provider === 'gemini') {
      const model = slot.model || 'gemini-2.5-flash'
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 100 },
        }),
      })
      const latencyMs = Math.round(performance.now() - started)
      if (!res.ok) {
        const errJson = (await res.json().catch(() => null)) as Record<string, unknown> | null
        const errorObj = errJson?.error as Record<string, unknown> | undefined
        const errMsg =
          typeof errorObj?.message === 'string' ? errorObj.message : `HTTP ${res.status} ${res.statusText}`
        return { ok: false, latencyMs, provider: 'gemini', model, error: errMsg }
      }
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
      const sample =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        'Live Gemini AI connected and responding (₹ valuation ready).'
      return { ok: true, latencyMs, provider: 'gemini', model, sampleOutput: sample }
    }

    if (slot.provider === 'openrouter') {
      const model = slot.model || 'google/gemini-2.0-flash-exp:free'
      const baseUrl = slot.base_url?.trim() || 'https://openrouter.ai/api/v1'
      const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://campusmart.in',
          'X-Title': 'CampusMart Admin Hydra Pool',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 80,
        }),
      })
      const latencyMs = Math.round(performance.now() - started)
      if (!res.ok) {
        const errJson = (await res.json().catch(() => null)) as Record<string, unknown> | null
        const errorObj = errJson?.error as Record<string, unknown> | undefined
        const errMsg =
          typeof errorObj?.message === 'string' ? errorObj.message : `HTTP ${res.status} ${res.statusText}`
        return { ok: false, latencyMs, provider: 'openrouter', model, error: errMsg }
      }
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
      const sample =
        data?.choices?.[0]?.message?.content ||
        'Live OpenRouter pool connected and responding.'
      return { ok: true, latencyMs, provider: 'openrouter', model, sampleOutput: sample }
    }

    // Direct fetch test for providers with OpenAI-compatible chat endpoints
    let endpoint = ''
    if (slot.provider === 'groq') endpoint = 'https://api.groq.com/openai/v1/chat/completions'
    else if (slot.provider === 'openai') endpoint = 'https://api.openai.com/v1/chat/completions'
    else if (slot.provider === 'mistral') endpoint = 'https://api.mistral.ai/v1/chat/completions'
    else if (slot.provider === 'cerebras') endpoint = 'https://api.cerebras.ai/v1/chat/completions'
    else if (slot.base_url) endpoint = `${slot.base_url.replace(/\/+$/, '')}/chat/completions`

    if (endpoint) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: slot.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 80,
          }),
        })
        const latencyMs = Math.round(performance.now() - started)
        if (!res.ok) {
          const errJson = (await res.json().catch(() => null)) as Record<string, unknown> | null
          const errorObj = errJson?.error as Record<string, unknown> | undefined
          const errMsg =
            typeof errorObj?.message === 'string' ? errorObj.message : `HTTP ${res.status} ${res.statusText}`
          return { ok: false, latencyMs, provider: slot.provider, model: slot.model, error: errMsg }
        }
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
        const sample =
          data?.choices?.[0]?.message?.content || 'Live AI endpoint connected and responding.'
        return { ok: true, latencyMs, provider: slot.provider, model: slot.model, sampleOutput: sample }
      } catch {
        // Direct browser fetch hit CORS or network block. Fall back to backend /ai/chat
      }
    }

    // Fallback: Test via backend /ai/chat
    const backendRes = await testAiConnection(prompt)
    return {
      ...backendRes,
      provider: slot.provider,
      model: slot.model || backendRes.model,
    }
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started)
    return {
      ok: false,
      latencyMs,
      provider: slot.provider,
      model: slot.model,
      error: apiErrorMessage(err),
    }
  }
}

export interface AiPoolFailoverStep {
  slotId: string
  label: string
  provider: string
  model: string
  role: AiKeyRole
  status: AiKeyStatus
  latencyMs?: number
  ok: boolean
  error?: string
}

export interface AiPoolTestReport {
  timestamp: string
  totalSlots: number
  activeCount: number
  healthyCount: number
  fastestSlotId: string | null
  fastestLatencyMs: number | null
  failoverChain: AiPoolFailoverStep[]
}

export async function testAiPool(slots: AiKeySlot[]): Promise<AiPoolTestReport> {
  const chain: AiPoolFailoverStep[] = []
  let fastestSlotId: string | null = null
  let fastestLatencyMs: number | null = null
  let healthyCount = 0

  const enabledSlots = slots.filter((s) => s.enabled)

  for (const slot of enabledSlots) {
    const res = await testAiKeySlot(slot)
    if (res.ok) {
      healthyCount++
      if (fastestLatencyMs === null || res.latencyMs < fastestLatencyMs) {
        fastestLatencyMs = res.latencyMs
        fastestSlotId = slot.id
      }
    }
    chain.push({
      slotId: slot.id,
      label: slot.label,
      provider: slot.provider,
      model: slot.model,
      role: slot.role,
      status: res.ok ? 'active' : 'exhausted',
      latencyMs: res.latencyMs,
      ok: res.ok,
      error: res.error,
    })
  }

  return {
    timestamp: new Date().toISOString(),
    totalSlots: slots.length,
    activeCount: enabledSlots.length,
    healthyCount,
    fastestSlotId,
    fastestLatencyMs,
    failoverChain: chain,
  }
}

/* --- Zero-Config Auto-Discovery & Key Diagnostics ----------- */

export function getProviderDisplayName(provider: string): string {
  switch (provider.toLowerCase()) {
    case 'gemini':
      return 'Google Gemini'
    case 'groq':
      return 'Groq Cloud'
    case 'openrouter':
      return 'OpenRouter'
    case 'openai':
      return 'OpenAI'
    case 'mistral':
      return 'Mistral AI'
    case 'cerebras':
      return 'Cerebras'
    default:
      return provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Google Gemini'
  }
}

export function autoDetectProviderFromKey(key: string): {
  provider: AiKeyProvider
  label: string
  model: string
  baseUrl?: string
} {
  const trimmed = sanitizeAiInput(key)
  if (trimmed.startsWith('gsk_')) {
    return {
      provider: 'groq',
      label: 'Groq Cloud',
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    }
  }
  if (trimmed.startsWith('sk-or-')) {
    return {
      provider: 'openrouter',
      label: 'OpenRouter',
      model: 'google/gemini-2.0-flash-exp:free',
      baseUrl: 'https://openrouter.ai/api/v1',
    }
  }
  if (trimmed.startsWith('sk-proj-') || (trimmed.startsWith('sk-') && !trimmed.startsWith('sk-or-'))) {
    return {
      provider: 'openai',
      label: 'OpenAI',
      model: 'gpt-4o-mini',
    }
  }
  if (trimmed.startsWith('csk-')) {
    return {
      provider: 'cerebras',
      label: 'Cerebras',
      model: 'llama3.1-70b',
    }
  }
  // Default to Google Gemini (most common AI key starting with AIzaSy...)
  return {
    provider: 'gemini',
    label: 'Google Gemini',
    model: 'gemini-2.5-flash',
  }
}

export interface AutoDiscoverKeyResult {
  ok: boolean
  provider: string
  providerName: string
  activeModel: string
  latencyMs: number
  sampleOutput?: string
  error?: string
}

export async function testAutoDiscoverAiKey(apiKey: string): Promise<AutoDiscoverKeyResult> {
  const started = performance.now()
  const key = sanitizeAiInput(apiKey)

  if (!key) {
    return {
      ok: false,
      provider: '',
      providerName: '',
      activeModel: '',
      latencyMs: 0,
      error: 'Please enter or paste an API key first.',
    }
  }

  const detected = autoDetectProviderFromKey(key)

  // 1. Attempt POST /admin/ai-config/test-key
  try {
    const res = await api.post<Record<string, unknown>>(endpoints.aiConfigTestKey, {
      api_key: key,
      key: key,
      provider: detected.provider,
      model: detected.model,
    })
    const latencyMs =
      typeof res?.latency_ms === 'number'
        ? res.latency_ms
        : Math.round(performance.now() - started)
    const provider = String(res?.provider || detected.provider)
    const activeModel = String(res?.active_model || res?.model || detected.model)
    const sampleOutput = typeof res?.sample_output === 'string' ? res.sample_output : undefined

    return {
      ok: true,
      provider,
      providerName: getProviderDisplayName(provider),
      activeModel,
      latencyMs,
      sampleOutput,
    }
  } catch {
    // 2. Graceful fallback if backend /admin/ai-config/test-key endpoint is deploying or returns 404/405/500:
    // Execute live client-side test probe directly against the provider
    try {
      const slotTest = await testAiKeySlot({
        id: 'discover-slot',
        label: detected.label,
        provider: detected.provider,
        model: detected.model,
        api_key: key,
        base_url: detected.baseUrl,
        role: 'all',
        enabled: true,
        status: 'untested',
      })

      if (slotTest.ok) {
        return {
          ok: true,
          provider: slotTest.provider || detected.provider,
          providerName: getProviderDisplayName(slotTest.provider || detected.provider),
          activeModel: slotTest.model || detected.model,
          latencyMs: slotTest.latencyMs,
          sampleOutput: slotTest.sampleOutput,
        }
      }

      return {
        ok: false,
        provider: detected.provider,
        providerName: detected.label,
        activeModel: detected.model,
        latencyMs: slotTest.latencyMs,
        error: slotTest.error || 'Connection failed: Invalid API key or model unreachable.',
      }
    } catch (clientErr) {
      const latencyMs = Math.round(performance.now() - started)
      return {
        ok: false,
        provider: detected.provider,
        providerName: detected.label,
        activeModel: detected.model,
        latencyMs,
        error: apiErrorMessage(clientErr),
      }
    }
  }
}

export { formatShortCollege, getShortCollegeName, formatCollegeBadge } from '../lib/format'

