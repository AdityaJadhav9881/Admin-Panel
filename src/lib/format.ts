const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** Indian Rupee formatting with lakh/crore grouping — "₹1,24,500". */
export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '₹0'
  const amount = Number.isInteger(value)
    ? value.toLocaleString('en-IN')
    : value.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
  return `₹${amount}`
}

/** "2026-10-14T09:14:00Z" -> "14 Oct 2026". Returns the raw string when it cannot be parsed. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const day = String(date.getDate()).padStart(2, '0')
  return `${day} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

interface CollegeShortcut {
  match: string[]
  short: string
  code?: string
}

const KNOWN_COLLEGES: CollegeShortcut[] = [
  { match: ['aissms', '6282'], short: 'AISSMS IOIT, Pune', code: '6282' },
  { match: ['vishwakarma institute of information technology', 'viit', '6284'], short: 'VIIT, Pune', code: '6284' },
  { match: ['vishwakarma institute of technology', 'vit', '6273'], short: 'VIT, Pune', code: '6273' },
  { match: ['yeshwantrao chavan', 'ycce', '4149'], short: 'YCCE, Nagpur', code: '4149' },
  { match: ['somaiya', '3035'], short: 'KJ Somaiya, Mumbai', code: '3035' },
  { match: ['k. k. wagh', 'k.k. wagh', 'kk wagh', '5121'], short: 'KK Wagh, Nashik', code: '5121' },
  { match: ['government college of engineering, karad', 'gcoe karad', 'gcoek', '6004'], short: 'GCOE, Karad', code: '6004' },
  { match: ['daulatrao aher', 'dacoe', '6545'], short: 'DACOE, Karad', code: '6545' },
  { match: ['coep', 'college of engineering, pune', '6006'], short: 'COEP, Pune', code: '6006' },
  { match: ['pune institute of computer technology', 'pict', '6271'], short: 'PICT, Pune', code: '6271' },
  { match: ['walchand', 'wce', '6007'], short: 'WCE, Sangli', code: '6007' },
  { match: ['veermata', 'vjti', '3012'], short: 'VJTI, Mumbai', code: '3012' },
  { match: ['pimpri chinchwad', 'pccoe', '6175'], short: 'PCCOE, Pune', code: '6175' },
  { match: ['sardar patel', 'spit', '3215'], short: 'SPIT, Mumbai', code: '3215' },
  { match: ['sinhgad', 'scoe', '6178'], short: 'SCOE, Pune', code: '6178' },
  { match: ['iit bombay', 'indian institute of technology, bombay', 'iitb'], short: 'IIT Bombay', code: 'IITB' },
  { match: ['rajarambapu', 'rit', '6214'], short: 'RIT, Islampur', code: '6214' },
  { match: ['kolhapur institute of technology', 'kit', '6267'], short: 'KIT COE, Kolhapur', code: '6267' },
]

export function getShortCollegeName(collegeName?: string | null, collegeCode?: string | null): string {
  if (!collegeName || !collegeName.trim()) return 'GCOE, Karad'
  const raw = collegeName.trim()
  const lower = raw.toLowerCase()
  const codeStr = collegeCode ? String(collegeCode).trim() : ''

  // 1. Try known college matches
  for (const item of KNOWN_COLLEGES) {
    if (codeStr && item.code === codeStr) return item.short
    if (item.match.some((m) => lower.includes(m))) return item.short
  }

  // 2. Strip charitable trust / society prefixes
  let cleaned = raw.replace(/^.*?(?:Trust|Mandal|Sanstha|Society|Shikshan|Charitable)'s?\s*/i, '')

  // 3. Extract city if at the end (e.g. ", Pune")
  const cityMatch = cleaned.match(/,\s*([A-Za-z\s]+)$/)
  const city = cityMatch ? cityMatch[1].trim() : ''

  // 4. Common academic contractions
  cleaned = cleaned
    .replace(/,\s*[A-Za-z\s]+$/, '')
    .replace(/\bInstitute of Information Technology\b/gi, 'IOIT')
    .replace(/\bInstitute of Technology\b/gi, 'IT')
    .replace(/\bCollege of Engineering\b/gi, 'COE')
    .replace(/\bInstitute of Engineering and Technology\b/gi, 'IET')
    .replace(/\bInstitute of Engineering\b/gi, 'IOE')
    .replace(/\bTechnological University\b/gi, 'Tech')

  // Re-append city if found
  if (city && !cleaned.toLowerCase().includes(city.toLowerCase())) {
    cleaned = `${cleaned}, ${city}`
  }

  // Max 28 characters
  if (cleaned.length > 28) {
    cleaned = `${cleaned.slice(0, 26).trimEnd()}…`
  }

  return cleaned || 'GCOE, Karad'
}

export function formatShortCollege(
  collegeName?: string | null,
  collegeCode?: string | null,
): string {
  const shortName = getShortCollegeName(collegeName, collegeCode)
  const code = collegeCode ? String(collegeCode).trim() : ''
  if (!code || shortName.includes(code)) return shortName
  return `${shortName} · CET ${code}`
}

export function formatCollegeBadge(
  collegeName?: string | null,
  collegeCode?: string | null,
): string {
  return `🎓 ${formatShortCollege(collegeName, collegeCode)}`
}

