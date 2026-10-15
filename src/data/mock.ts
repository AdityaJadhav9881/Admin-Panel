/* ============================================================
   DOMAIN MODEL — Master Control
   Presentation-ready types and shared helpers consumed by the
   views and by the API adapter layer (src/api/client.ts).
   All live data is fetched from the FastAPI /admin/* endpoints;
   only PLACEHOLDER_SERVICES holds static values (service probes
   are not wired to a backend endpoint yet — labelled as such in
   the Settings view).
   ============================================================ */

export type ViewId = 'overview' | 'listings' | 'users' | 'settings'
export type UserStatus = 'active' | 'blocked'
export type StatusTone = 'success' | 'warning' | 'critical' | 'neutral'
export type ServiceState = 'operational' | 'degraded' | 'unavailable'

export interface User {
  id: string
  name: string
  email: string
  trustScore: number
  status: UserStatus
  joined: string
  listings: number
}

export interface FlaggedTransaction {
  id: string
  listing: string
  amount: number
  reason: string
  confidence: number
  reportedBy: string
  opened: string
  severity: 'high' | 'medium'
  acknowledged: boolean
}

export interface Agent {
  id: string
  name: string
  description: string
  enabled: boolean
}

export interface Service {
  id: string
  name: string
  state: ServiceState
  /** `null` means no reading — never render as 0. */
  latencyMs: number | null
  note: string
}

export interface OverviewMetrics {
  totalActiveUsers: number
  listingsToday: number
  flaggedCount: number
}

/* --- AI agent catalogue (names/descriptions for display) ---- */
export const AGENT_CATALOG: Agent[] = [
  {
    id: 'price-prediction',
    name: 'Price Prediction Agent',
    description: 'Suggests a fair price range when sellers create a listing.',
    enabled: true,
  },
  {
    id: 'listing-moderation',
    name: 'Listing Moderation Agent',
    description: 'Screens images and text against campus marketplace policy.',
    enabled: true,
  },
  {
    id: 'fraud-detection',
    name: 'Fraud Detection Agent',
    description: 'Scores transactions and opens items in the flag queue.',
    enabled: true,
  },
  {
    id: 'search-ranking',
    name: 'Search Ranking Agent',
    description: 'Orders search results by relevance and seller trust.',
    enabled: true,
  },
  {
    id: 'demand-forecast',
    name: 'Demand Forecast Agent',
    description: 'Forecasts category demand for the weekly seller digest.',
    enabled: false,
  },
]

/* --- Placeholder server / API health rows -------------------- */
export const PLACEHOLDER_SERVICES: Service[] = [
  {
    id: 'api',
    name: 'FastAPI core',
    state: 'operational',
    latencyMs: null,
    note: 'REST + WebSocket gateway',
  },
  {
    id: 'db',
    name: 'PostgreSQL primary',
    state: 'operational',
    latencyMs: null,
    note: 'Listings, users, transactions',
  },
  {
    id: 'cache',
    name: 'Redis cache',
    state: 'operational',
    latencyMs: null,
    note: 'Sessions and rate limiting',
  },
  {
    id: 'inference',
    name: 'Inference cluster',
    state: 'operational',
    latencyMs: null,
    note: 'Agent inference and scoring',
  },
  {
    id: 'storage',
    name: 'Object storage',
    state: 'operational',
    latencyMs: null,
    note: 'Listing images and exports',
  },
]

/* --- Derived helpers (single source for shared states) ----- */

export const stateTone: Record<ServiceState, StatusTone> = {
  operational: 'success',
  degraded: 'warning',
  unavailable: 'critical',
}

export const stateLabel: Record<ServiceState, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  unavailable: 'Unavailable',
}

export function trustBand(score: number): {
  label: string
  tone: 'success' | 'warning' | 'critical'
} {
  if (score >= 80) return { label: 'Strong', tone: 'success' }
  if (score >= 55) return { label: 'Fair', tone: 'warning' }
  return { label: 'Low', tone: 'critical' }
}

export function overallServiceState(services: Service[]): ServiceState {
  if (services.some((s) => s.state === 'unavailable')) return 'unavailable'
  if (services.some((s) => s.state === 'degraded')) return 'degraded'
  return 'operational'
}

/* ============================================================
   LISTINGS & MODERATION
   ============================================================ */

export type ListingStatus = 'active' | 'sold' | 'flagged'
export type ListingCategory =
  | 'textbooks'
  | 'electronics'
  | 'furniture'
  | 'transport'
  | 'supplies'
  | 'other'

export interface ListingFlag {
  reason: string
  severity: 'high' | 'medium'
  detectedBy: string
}

export interface Listing {
  id: string
  title: string
  /** References a user in the directory — seller data is never duplicated. */
  sellerId: string
  category: ListingCategory
  price: number
  /** Fair-value estimate from the Price Prediction Agent. */
  aiPrice: number
  status: ListingStatus
  hasImage: boolean
  listed: string
  flag: ListingFlag | null
}

/** Trust-score cost applied to the seller when a listing is deleted. */
export const LISTING_DELETE_TRUST_PENALTY = 8

export const categoryLabel: Record<ListingCategory, string> = {
  textbooks: 'Textbooks',
  electronics: 'Electronics',
  furniture: 'Furniture',
  transport: 'Bikes & transport',
  supplies: 'Lab & supplies',
  other: 'Other',
}

/** Signed percentage difference between the listed and AI-suggested price. */
export function priceDeviation(listing: Listing): number {
  if (listing.aiPrice === 0) return 0
  return Math.round(((listing.price - listing.aiPrice) / listing.aiPrice) * 100)
}
