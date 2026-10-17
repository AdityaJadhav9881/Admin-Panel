/* ============================================================
   DOMAIN MODEL — Master Control
   Presentation-ready types and shared helpers consumed by the
   views and by the API adapter layer (src/api/client.ts).
   All live data is fetched from the FastAPI /admin/* endpoints;
   SERVICE_CATALOG only defines *which* live probes run — every
   state/latency value is filled in by src/api/health.ts from real
   HTTP round-trip measurements (no placeholder readings).
   ============================================================ */

export type ViewId = 'overview' | 'listings' | 'users' | 'connections' | 'wanted' | 'settings'
export type UserStatus = 'active' | 'blocked'
export type StatusTone = 'success' | 'warning' | 'critical' | 'neutral'
export type ServiceState = 'operational' | 'degraded' | 'unavailable' | 'pending'

export const ACADEMIC_BRANCHES = [
  'Computer / IT',
  'Mechanical',
  'Civil',
  'Electrical',
  'Electronics & Telecommunication (E&TC)',
  'First Year (Common)',
  'Chemical',
  'Other',
] as const

export type AcademicBranch = (typeof ACADEMIC_BRANCHES)[number]

export const ACADEMIC_YEARS = ['FE', 'SE', 'TE', 'BE', 'All Years'] as const

export type AcademicYear = (typeof ACADEMIC_YEARS)[number]

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
  {
    name: 'Pimpri Chinchwad College of Engineering, Pune',
    shortName: 'PCCOE Pune',
    code: '6175',
    city: 'Pune',
  },
  {
    name: 'Vishwakarma Institute of Technology, Pune',
    shortName: 'VIT Pune',
    code: '6273',
    city: 'Pune',
  },
  {
    name: 'Vishwakarma Institute of Information Technology, Pune',
    shortName: 'VIIT Pune',
    code: '6284',
    city: 'Pune',
  },
  {
    name: 'Sardar Patel Institute of Technology, Mumbai',
    shortName: 'SPIT Mumbai',
    code: '3215',
    city: 'Mumbai',
  },
  {
    name: 'Sinhgad College of Engineering, Pune',
    shortName: 'SCOE Pune',
    code: '6178',
    city: 'Pune',
  },
  {
    name: 'Indian Institute of Technology, Bombay',
    shortName: 'IIT Bombay',
    code: 'IITB',
    city: 'Mumbai',
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
  phone?: string
  trustScore: number
  status: UserStatus
  joined: string
  listings: number
  collegeName?: string
  collegeCode?: string
  role?: string
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

export type ListingStatus = 'active' | 'sold' | 'flagged' | 'reserved'
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
  description?: string
  condition?: string
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
  branch?: string
  academic_year?: string
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

/* ============================================================
   WANTED BOARD (WANT TO BUY / WTB REQUESTS)
   ============================================================ */

export type WantedUrgency = 'urgent' | 'moderate' | 'flexible'
export type WantedMatchStatus = 'matched' | 'searching' | 'fulfilled'

export interface WantedRequest {
  id: string
  title: string
  category: ListingCategory
  description?: string
  max_budget: number
  urgency: WantedUrgency
  branch?: string
  academic_year?: string
  student_id: string
  student_name: string
  student_email: string
  student_phone?: string
  college_name: string
  college_code: string
  match_status: WantedMatchStatus
  matched_listing_id?: string
  matched_seller_name?: string
  created_at: string
}

export const FALLBACK_WANTED_REQUESTS: WantedRequest[] = [
  {
    id: 'wtb-101',
    title: 'Higher Engineering Mathematics (B.S. Grewal) 44th Edition',
    category: 'textbooks',
    description:
      'Looking for a clean copy of BS Grewal with unmarked integration & differential equations chapters for Semester 3 math exam.',
    max_budget: 450,
    urgency: 'urgent',
    branch: 'Computer / IT',
    academic_year: 'SE',
    student_id: 'usr-101',
    student_name: 'Aditya Patil',
    student_email: 'aditya.patil@gcekarad.ac.in',
    student_phone: '+91 98221 04928',
    college_name: 'Government College of Engineering, Karad',
    college_code: '6004',
    match_status: 'searching',
    created_at: '2 hours ago',
  },
  {
    id: 'wtb-102',
    title: 'Mini Drafter with Metal Clamp + Engineering Drawing Compass',
    category: 'supplies',
    description:
      'First year engineering graphics assignment due this Friday. Need a sturdy Omega/Rolson mini drafter in good working condition.',
    max_budget: 350,
    urgency: 'urgent',
    branch: 'First Year (Common)',
    academic_year: 'FE',
    student_id: 'usr-104',
    student_name: 'Tanvi Joshi',
    student_email: 'tanvi.joshi@dacoe.ac.in',
    student_phone: '+91 94210 88312',
    college_name: 'Dr. Daulatrao Aher College of Engineering, Karad',
    college_code: '6545',
    match_status: 'matched',
    matched_listing_id: 'prod-004',
    matched_seller_name: 'Omkar Salunkhe',
    created_at: '5 hours ago',
  },
  {
    id: 'wtb-103',
    title: 'Casio fx-991EX ClassWiz or fx-991CW Scientific Calculator',
    category: 'electronics',
    description:
      'Must have matrix, equation solver, and QR features allowed in SPPU / Shivaji University exam hall.',
    max_budget: 850,
    urgency: 'urgent',
    branch: 'Mechanical',
    academic_year: 'TE',
    student_id: 'usr-107',
    student_name: 'Rohit Shinde',
    student_email: 'rohit.s@coep.ac.in',
    student_phone: '+91 97654 32109',
    college_name: 'COEP Technological University, Pune',
    college_code: '6006',
    match_status: 'matched',
    matched_listing_id: 'prod-001',
    matched_seller_name: 'Sanket Deshmukh',
    created_at: 'Yesterday',
  },
  {
    id: 'wtb-104',
    title: 'Hero / Montra Geared Bicycle for Campus Commute',
    category: 'transport',
    description:
      'Need a reliable 21-speed hybrid/MTB cycle for daily travel between Sangli city hostel and WCE college gate.',
    max_budget: 3500,
    urgency: 'moderate',
    branch: 'Civil',
    academic_year: 'BE',
    student_id: 'usr-109',
    student_name: 'Prathamesh Kulkarni',
    student_email: 'prathamesh.k@walchandsangli.ac.in',
    student_phone: '+91 99230 45678',
    college_name: 'Walchand College of Engineering, Sangli',
    college_code: '6007',
    match_status: 'searching',
    created_at: '2 days ago',
  },
  {
    id: 'wtb-105',
    title: 'Official Navy Blue Workshop Apron + Safety Gloves (Size L)',
    category: 'supplies',
    description:
      'Required for central workshop lathe machine & carpentry session. Official RIT logo preferred.',
    max_budget: 250,
    urgency: 'moderate',
    branch: 'Mechanical',
    academic_year: 'FE',
    student_id: 'usr-113',
    student_name: 'Pooja Kadam',
    student_email: 'pooja.kadam@ritindia.edu',
    student_phone: '+91 91580 12345',
    college_name: 'Rajarambapu Institute of Technology, Islampur',
    college_code: '6214',
    match_status: 'fulfilled',
    created_at: '3 days ago',
  },
  {
    id: 'wtb-106',
    title: 'Operating Systems Concepts (Galvin) & Computer Networks (Tanenbaum)',
    category: 'textbooks',
    description:
      'Looking for 9th or 10th edition for GATE / semester exam preparation in PICT hostel.',
    max_budget: 600,
    urgency: 'flexible',
    branch: 'Computer / IT',
    academic_year: 'TE',
    student_id: 'usr-111',
    student_name: 'Snehal More',
    student_email: 'snehal.more@pict.edu',
    student_phone: '+91 98901 23456',
    college_name: 'Pune Institute of Computer Technology, Pune',
    college_code: '6271',
    match_status: 'searching',
    created_at: '4 days ago',
  },
  {
    id: 'wtb-107',
    title: 'Foldable Wooden Study Desk or Bedside Laptop Stand',
    category: 'furniture',
    description:
      'Compact study table suitable for 3-sharing hostel room in AISSMS campus.',
    max_budget: 800,
    urgency: 'flexible',
    branch: 'Electronics & Telecommunication (E&TC)',
    academic_year: 'SE',
    student_id: 'usr-105',
    student_name: 'Kunal Jadhav',
    student_email: 'kunal.j@aissmsioit.org',
    student_phone: '+91 96041 67890',
    college_name: 'AISSMS Institute of Information Technology, Pune',
    college_code: '6282',
    match_status: 'searching',
    created_at: '5 days ago',
  },
]
