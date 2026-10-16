/* ============================================================
   LIVE HEALTH PROBES — Master Control
   Real HTTP round-trip measurements against VITE_API_BASE_URL.
   Every row in the Server & API health panel comes from here; no
   value is invented and no reading is ever rendered as 0 ms.

   Probes run in parallel and never throw — a probe that cannot
   reach its target reports `unavailable`/`degraded` with an
   honest note instead of failing the whole panel.
   ============================================================ */

import type { Service } from '../data/mock'
import { SERVICE_CATALOG } from '../data/mock'
import {
  adaptAgents,
  adaptAiConfig,
  API_BASE_URL,
  API_HOST,
  getAuthToken,
} from './client'

/** Probes are independent of the data load — a shorter cap keeps the panel responsive. */
export const PROBE_TIMEOUT_MS = 20_000

const IMAGE_TIMEOUT_MS = 8_000
const IMAGE_SAMPLE_LIMIT = 3
const URL_SAMPLE_LIMIT = 12

type ProbeOutcome =
  | { kind: 'response'; response: Response; ms: number }
  | { kind: 'timeout'; ms: number }
  | { kind: 'network'; ms: number }

function catalogRow(id: string): Service {
  return SERVICE_CATALOG.find((service) => service.id === id) ?? SERVICE_CATALOG[0]
}

async function probeFetch(path: string): Promise<ProbeOutcome> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  const headers = new Headers({ Accept: 'application/json' })
  if (path.startsWith('/admin')) {
    const token = getAuthToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  const startedAt = performance.now()
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: controller.signal,
    })
    return { kind: 'response', response, ms: Math.round(performance.now() - startedAt) }
  } catch {
    const ms = Math.round(performance.now() - startedAt)
    return controller.signal.aborted ? { kind: 'timeout', ms } : { kind: 'network', ms }
  } finally {
    window.clearTimeout(timer)
  }
}

function unreachableNote(): string {
  return `No answer from ${API_HOST} — Render may still be cold-starting`
}

/** Records in a bare array or a `{ data: [...] }` envelope. */
function countRecords(payload: unknown): number | null {
  if (Array.isArray(payload)) return payload.length
  if (payload !== null && typeof payload === 'object') {
    const data = (payload as { data?: unknown }).data
    if (Array.isArray(data)) return data.length
  }
  return null
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

/* --- Individual probes -------------------------------------- */

/** FastAPI Core Gateway — any HTTP answer proves the ASGI app is serving. */
async function probeGateway(): Promise<Service> {
  const base = catalogRow('api')
  const outcome = await probeFetch('/')
  if (outcome.kind === 'timeout') {
    return {
      ...base,
      state: 'unavailable',
      latencyMs: null,
      note: `GET / timed out after ${PROBE_TIMEOUT_MS / 1000}s — Render may still be cold-starting`,
    }
  }
  if (outcome.kind === 'network') {
    return { ...base, state: 'unavailable', latencyMs: null, note: unreachableNote() }
  }
  const { status } = outcome.response
  if (status >= 500) {
    return { ...base, state: 'degraded', latencyMs: outcome.ms, note: `GET / answered HTTP ${status}` }
  }
  return {
    ...base,
    state: 'operational',
    latencyMs: outcome.ms,
    note: `Gateway reachable · GET / → HTTP ${status}`,
  }
}

/** Neon PostgreSQL Primary — the listing table behind GET /products/. */
async function probeDatabase(): Promise<Service> {
  const base = catalogRow('db')
  const outcome = await probeFetch('/products/')
  if (outcome.kind === 'timeout') {
    return { ...base, state: 'unavailable', latencyMs: null, note: `GET /products/ timed out after ${PROBE_TIMEOUT_MS / 1000}s` }
  }
  if (outcome.kind === 'network') {
    return { ...base, state: 'unavailable', latencyMs: null, note: unreachableNote() }
  }
  if (outcome.response.status === 404 || outcome.response.status === 405) {
    return {
      ...base,
      state: 'degraded',
      latencyMs: outcome.ms,
      note: `GET /products/ returned HTTP ${outcome.response.status} — route not deployed yet`,
    }
  }
  if (!outcome.response.ok) {
    return {
      ...base,
      state: 'degraded',
      latencyMs: outcome.ms,
      note: `GET /products/ answered HTTP ${outcome.response.status}`,
    }
  }
  const count = countRecords(await readJson(outcome.response))
  return {
    ...base,
    state: 'operational',
    latencyMs: outcome.ms,
    note:
      count === null
        ? 'Reachable · record count unavailable'
        : `Live table reachable · ${count.toLocaleString('en-US')} product${count === 1 ? '' : 's'}`,
  }
}

/** Multi-Agent Orchestrator — runtime agent switches behind /admin/ai-agents. */
async function probeOrchestrator(): Promise<Service> {
  const base = catalogRow('orchestrator')
  const outcome = await probeFetch('/admin/ai-agents')
  if (outcome.kind === 'timeout') {
    return { ...base, state: 'unavailable', latencyMs: null, note: `GET /admin/ai-agents timed out after ${PROBE_TIMEOUT_MS / 1000}s` }
  }
  if (outcome.kind === 'network') {
    return { ...base, state: 'unavailable', latencyMs: null, note: unreachableNote() }
  }
  if (outcome.response.status === 401 || outcome.response.status === 403) {
    return {
      ...base,
      state: 'degraded',
      latencyMs: outcome.ms,
      note: `Rejected the stored admin token (HTTP ${outcome.response.status}) — sign in again`,
    }
  }
  if (!outcome.response.ok) {
    return {
      ...base,
      state: 'degraded',
      latencyMs: outcome.ms,
      note: `GET /admin/ai-agents answered HTTP ${outcome.response.status}`,
    }
  }
  const agents = adaptAgents(await readJson(outcome.response))
  const enabled = agents.filter((agent) => agent.enabled).length
  return {
    ...base,
    state: 'operational',
    latencyMs: outcome.ms,
    note: `Orchestrator reachable · ${enabled} of ${agents.length} agents active`,
  }
}

/** Vision LLM & Config Engine — provider + model behind /admin/ai-config. */
async function probeAiConfig(): Promise<Service> {
  const base = catalogRow('llm')
  const outcome = await probeFetch('/admin/ai-config')
  if (outcome.kind === 'timeout') {
    return { ...base, state: 'unavailable', latencyMs: null, note: `GET /admin/ai-config timed out after ${PROBE_TIMEOUT_MS / 1000}s` }
  }
  if (outcome.kind === 'network') {
    return { ...base, state: 'unavailable', latencyMs: null, note: unreachableNote() }
  }
  if (outcome.response.status === 404 || outcome.response.status === 405) {
    return {
      ...base,
      state: 'degraded',
      latencyMs: outcome.ms,
      note: 'Pending backend deploy',
    }
  }
  if (outcome.response.status === 401 || outcome.response.status === 403) {
    return {
      ...base,
      state: 'degraded',
      latencyMs: outcome.ms,
      note: `Rejected the stored admin token (HTTP ${outcome.response.status}) — sign in again`,
    }
  }
  if (!outcome.response.ok) {
    return {
      ...base,
      state: 'degraded',
      latencyMs: outcome.ms,
      note: `GET /admin/ai-config answered HTTP ${outcome.response.status}`,
    }
  }
  const config = adaptAiConfig(await readJson(outcome.response))
  const label = [config.ai_provider, config.ai_model].filter((part) => part.trim().length > 0)
  if (label.length === 0) {
    return { ...base, state: 'operational', latencyMs: outcome.ms, note: 'Route live · no provider configured yet' }
  }
  return {
    ...base,
    state: 'operational',
    latencyMs: outcome.ms,
    note: `${label.join(' · ')}${config.has_api_key ? '' : ' · no API key stored'}`,
  }
}

/**
 * Loads a real image through the browser so a 404, a hot-link block or a
 * dead CDN all read as failures — not as "probably fine".
 */
function imageResolves(url: string, timeoutMs: number): Promise<{ ok: boolean; ms: number }> {
  return new Promise((resolve) => {
    const startedAt = performance.now()
    const img = new Image()
    let settled = false
    const timer = window.setTimeout(() => settle(false), timeoutMs)
    function settle(ok: boolean) {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      img.onload = null
      img.onerror = null
      resolve({ ok, ms: Math.round(performance.now() - startedAt) })
    }
    img.onload = () => settle(true)
    img.onerror = () => settle(false)
    img.src = url
  })
}

/** Cloudinary Object Storage — do the listing photos actually load? */
async function probeStorage(imageUrls: string[]): Promise<Service> {
  const base = catalogRow('storage')
  const samples = imageUrls.slice(0, IMAGE_SAMPLE_LIMIT)
  if (samples.length === 0) {
    return {
      ...base,
      state: 'pending',
      latencyMs: null,
      note: 'No listing photos available to verify yet',
    }
  }

  const results = await Promise.all(samples.map((url) => imageResolves(url, IMAGE_TIMEOUT_MS)))
  const loaded = results.filter((result) => result.ok)

  if (loaded.length === 0) {
    const host = safeHost(samples[0])
    return {
      ...base,
      state: 'unavailable',
      latencyMs: null,
      note: `0 of ${samples.length} sample photos loaded from ${host}`,
    }
  }

  const latency = Math.round(loaded.reduce((sum, result) => sum + result.ms, 0) / loaded.length)
  const host = safeHost(samples[0])
  const partial = loaded.length < samples.length
  return {
    ...base,
    state: partial ? 'degraded' : 'operational',
    latencyMs: latency,
    note: `${loaded.length} of ${samples.length} photos loaded from ${host}`,
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'the image CDN'
  }
}

/* --- Entry point -------------------------------------------- */

/** Unique photo URLs used as the Cloudinary probe samples. */
export function probeImageSamples(listings: { imageUrls: string[] }[]): string[] {
  const unique: string[] = []
  for (const listing of listings) {
    for (const url of listing.imageUrls) {
      if (url && !unique.includes(url)) unique.push(url)
      if (unique.length >= URL_SAMPLE_LIMIT) return unique
    }
  }
  return unique
}

/** Runs all five probes in parallel; never rejects. */
export async function runHealthProbes(imageUrls: string[]): Promise<Service[]> {
  const [api, db, orchestrator, llm, storage] = await Promise.all([
    probeGateway(),
    probeDatabase(),
    probeOrchestrator(),
    probeAiConfig(),
    probeStorage(imageUrls),
  ])
  return [api, db, orchestrator, llm, storage]
}
