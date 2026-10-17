/* ============================================================
   DOMAIN MODEL — Master Control
   Presentation-ready types and shared helpers consumed by the
   views and by the API adapter layer (src/api/client.ts).
   All live data is fetched from the FastAPI /admin/* endpoints;
   SERVICE_CATALOG only defines *which* live probes run — every
   state/latency value is filled in by src/api/health.ts from real
   HTTP round-trip measurements (no placeholder readings).
   ============================================================ */

export type ViewId = 'overview' | 'listings' | 'users' | 'connections' | 'settings'
export type UserStatus = 'active' | 'blocked'
export type StatusTone = 'success' | 'warning' | 'critical' | 'neutral'
export type ServiceState = 'operational' | 'degraded' | 'unavailable' | 'pending'

export interface CollegeInfo {
  name: string
  shortName: string
  code: string
  city: string
  accentColor?: string
}

export const MAHARASHTRA_COLLEGES: CollegeInfo[] = [
  {
    name: 'Government College of Engineering, Karad',
    shortName: 'GCOE Karad',
    code: '6004',
    city: 'Karad',
  },
  {
    name: 'Dr. Daulatrao Aher College of Engineering, Karad',
    shortName: 'Dr. Daulatrao Aher COE Karad',
    code: '6545',
    city: 'Karad',
  },
  {
    name: 'AISSMS Institute of Information Technology, Pune',
    shortName: 'AISSMS IOIT Pune',
    code: '6282',
    city: 'Pune',
  },
  {
    name: 'COEP Technological University, Pune',
    shortName: 'COEP Tech Pune',
    code: '6006',
    city: 'Pune',
  },
  {
    name: 'Walchand College of Engineering, Sangli',
    shortName: 'WCE Sangli',
    code: '6007',
    city: 'Sangli',
  },
  {
    name: 'Pune Institute of Computer Technology, Pune',
    shortName: 'PICT Pune',
    code: '6271',
    city: 'Pune',
  },
  {
    name: 'Veermata Jijabai Technological Institute, Mumbai',
    shortName: 'VJTI Mumbai',
    code: '3012',
    city: 'Mumbai',
  },
  {
    name: 'Rajarambapu Institute of Technology, Islampur',
    shortName: 'RIT Islampur',
    code: '6214',
    city: 'Islampur',
  },
  {
    name: "Kolhapur Institute of Technology's College of Engineering",
    shortName: "KIT's COE Kolhapur",
    code: '6267',
    city: 'Kolhapur',
  },
]

export function inferCollege(idOrEmailOrSeed: string): CollegeInfo {
  const seed = String(idOrEmailOrSeed || 'campus').toLowerCase()
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return MAHARASHTRA_COLLEGES[hash % MAHARASHTRA_COLLEGES.length]
}

export function formatCollegeBadge(collegeName?: string, collegeCode?: string): string {
  const name = collegeName || 'GCOE Karad'
  const code = collegeCode ? ` · CET ${collegeCode}` : ''
  return `🎓 ${name}${code}`
}

export interface User {
  id: string
  name: string
  email: string
  trustScore: number
  status: UserStatus
  joined: string
  listings: number
  collegeName?: string
  collegeCode?: string
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
  /** `null` means no reading yet (or the probe timed out) — never render as 0. */
  latencyMs: number | null
  /** Human-readable probe result (record counts, agent counts, provider, …). */
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
    id: 'listing_intelligence',
    name: 'Listing Intelligence Agent',
    description: 'YOLOv8 + Vision — Auto-categorization & specs',
    enabled: true,
  },
  {
    id: 'price_prediction',
    name: 'Price Prediction Agent',
    description: 'Scikit-learn Regressor — Fair campus resale pricing',
    enabled: true,
  },
  {
    id: 'trust_fraud_detection',
    name: 'Trust & Fraud Detection Agent',
    description: 'LangGraph Guard — Anomaly & scam detection',
    enabled: true,
  },
]

/* --- Live probe targets (state/latency filled in by health.ts) --- */
export const SERVICE_CATALOG: Service[] = [
  {
    id: 'api',
    name: 'CampusMart API Gateway',
    state: 'pending',
    latencyMs: null,
    note: 'Timed GET / against the live API host',
  },
  {
    id: 'db',
    name: 'Neon PostgreSQL Primary',
    state: 'pending',
    latencyMs: null,
    note: 'GET /products/ — live listing record count',
  },
  {
    id: 'orchestrator',
    name: 'Multi-Agent Orchestrator',
    state: 'pending',
    latencyMs: null,
    note: 'GET /admin/ai-agents — active agent count',
  },
  {
    id: 'llm',
    name: 'Vision LLM & Config Engine',
    state: 'pending',
    latencyMs: null,
    note: 'GET /admin/ai-config — configured provider + model',
  },
  {
    id: 'storage',
    name: 'Cloudinary Object Storage',
    state: 'pending',
    latencyMs: null,
    note: 'Listing photos resolve from the Cloudinary CDN',
  },
]

/** How many listing photos the inspector gallery renders at once. */
export const PHOTO_GALLERY_MAX = 4

/* --- Derived helpers (single source for shared states) ----- */

export const stateTone: Record<ServiceState, StatusTone> = {
  operational: 'success',
  degraded: 'warning',
  unavailable: 'critical',
  pending: 'neutral',
}

export const stateLabel: Record<ServiceState, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  unavailable: 'Unavailable',
  pending: 'Not measured',
}

/** Postgres stores trust_score on a 0.0–5.0 scale. */
export const TRUST_SCALE_MAX = 5.0

export function trustBand(score: number): {
  label: string
  tone: 'success' | 'warning' | 'critical'
} {
  if (score >= 4.0) return { label: 'High', tone: 'success' }
  if (score >= 2.5) return { label: 'Moderate', tone: 'warning' }
  return { label: 'Low', tone: 'critical' }
}

/** Bar-fill percentage for a 0.0–5.0 trust score, clamped to 0–100. */
export function trustPercent(score: number): number {
  if (!Number.isFinite(score)) return 0
  return Math.min(100, Math.max(0, (score / TRUST_SCALE_MAX) * 100))
}

/** "4.9" / "3.05" → "4.9" / "3.1" for consistent table display. */
export function formatTrustScore(score: number): string {
  return Number.isFinite(score) ? score.toFixed(1) : '—'
}

export function overallServiceState(services: Service[]): ServiceState {
  if (services.length === 0) return 'pending'
  if (services.some((s) => s.state === 'unavailable')) return 'unavailable'
  if (services.some((s) => s.state === 'degraded')) return 'degraded'
  if (services.every((s) => s.state === 'pending')) return 'pending'
  return 'operational'
}

/** Rows that are actually broken — `pending` probes are not service issues. */
export function issueServiceCount(services: Service[]): number {
  return services.filter((s) => s.state === 'degraded' || s.state === 'unavailable').length
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
  /** Every angle the seller uploaded (Cloudinary), in upload order. */
  imageUrls: string[]
  /** Free-text search tags from the Listing Intelligence Agent. */
  aiTags: string | null
  /** Wear/defect notes from the vision model. */
  aiConditionNotes: string | null
  listed: string
  flag: ListingFlag | null
  collegeName?: string
  collegeCode?: string
}

/** Trust-score cost applied to the seller when a listing is deleted (0–5 scale). */
export const LISTING_DELETE_TRUST_PENALTY = 0.5

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
