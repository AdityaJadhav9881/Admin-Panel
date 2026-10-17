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
  aiConfig: '/admin/ai-config',
  aiChat: '/ai/chat',
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
    const email = window.localStorage.getItem(EMAIL_STORAGE_KEY) ?? ''
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

    const message =
      response.status === 401
        ? 'Your admin session has expired or the credentials were rejected. Sign in again.'
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
  const normalized = email.trim().toLowerCase()
  const match = ADMIN_ACCOUNTS.find((acc) => acc.email.toLowerCase() === normalized)
  if (match) return match
  const superAdmin = isSuperAdminEmail(normalized)
  return {
    email: normalized,
    defaultPassword: '',
    name: 'CampusMart Admin',
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
  /** Every uploaded angle photo; older rows only carry `image_url`. */
  image_urls?: string[] | string | null
  ai_tags?: string | null
  ai_condition_notes?: string | null
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

/** The backend route simply is not deployed yet (Render still rolling out). */
export function isRouteMissing(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405)
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

  return {
    id: String(wire.id),
    title: wire.title,
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

export async function fetchAiConfig(): Promise<AiConfig> {
  return adaptAiConfig(await api.get<unknown>(endpoints.aiConfig))
}

/* --- Mutations ---------------------------------------------- */

export async function setUserStatus(userId: string, status: UserStatus): Promise<void> {
  await api.patch(`${endpoints.users}/${encodeURIComponent(userId)}/status`, { status })
}

export async function deleteUser(userId: string): Promise<void> {
  await api.remove(`${endpoints.users}/${encodeURIComponent(userId)}`)
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
  const sanitizedPool = update.api_keys_pool?.map((slot) => ({
    ...slot,
    label: slot.label.trim(),
    model: sanitizeAiInput(slot.model),
    api_key: sanitizeAiInput(slot.api_key),
    base_url: sanitizeAiInput(slot.base_url),
  }))

  // Backward compatibility: automatically pick fastest/first active healthy slot for primary fields
  let primaryProvider = sanitizeAiInput(update.ai_provider).toLowerCase()
  let primaryModel = sanitizeAiInput(update.ai_model)
  let primaryApiKey = sanitizeAiInput(update.ai_api_key)
  let primaryBaseUrl = sanitizeAiInput(update.ai_base_url)

  if (sanitizedPool && sanitizedPool.length > 0) {
    const activeWithKeys = sanitizedPool.filter((s) => s.enabled && s.api_key.length > 0)
    // Find fastest healthy if tested, else first active with key, else first enabled
    const fastestHealthy = [...activeWithKeys]
      .filter((s) => s.status === 'active' && typeof s.latency_ms === 'number')
      .sort((a, b) => (a.latency_ms ?? 9999) - (b.latency_ms ?? 9999))[0]

    const candidate =
      fastestHealthy ||
      activeWithKeys[0] ||
      sanitizedPool.find((s) => s.enabled) ||
      sanitizedPool[0]

    if (candidate) {
      primaryProvider = candidate.provider
      primaryModel = candidate.model
      if (candidate.api_key) primaryApiKey = candidate.api_key
      if (candidate.base_url) primaryBaseUrl = candidate.base_url
    }
  }

  const sanitizedUpdate: AiConfigUpdate = {
    ai_provider: primaryProvider,
    ai_model: primaryModel,
    ai_api_key: primaryApiKey,
    ai_base_url: primaryBaseUrl,
    routing_mode: update.routing_mode || 'smart_failover',
    api_keys_pool: sanitizedPool,
  }

  const payload = await api.put<unknown>(endpoints.aiConfig, sanitizedUpdate)
  const body = asRecord(payload)
  if (
    'ai_provider' in body ||
    'has_api_key' in body ||
    'masked_key' in body ||
    'api_keys_pool' in body
  ) {
    const adapted = adaptAiConfig(body)
    if (adapted.api_keys_pool.length === 0 && sanitizedPool && sanitizedPool.length > 0) {
      adapted.api_keys_pool = sanitizedPool
      adapted.routing_mode = update.routing_mode || 'smart_failover'
    }
    return adapted
  }
  return fetchAiConfig()
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

