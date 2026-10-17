import { useEffect, useMemo, useState } from 'react'
import type { AdminWantedUpdatePayload } from '../../api/client'
import type {
  Listing,
  ListingCategory,
  User,
  WantedMatchStatus,
  WantedRequest,
  WantedUrgency,
} from '../../data/mock'
import {
  ACADEMIC_BRANCHES,
  ACADEMIC_YEARS,
  MAHARASHTRA_COLLEGES,
  categoryLabel,
  formatCollegeBadge,
} from '../../data/mock'
import {
  CheckIcon,
  CloseIcon,
  DownloadIcon,
  EditIcon,
  MegaphoneIcon,
  SearchIcon,
  SparklesIcon,
  TargetIcon,
  TrashIcon,
} from '../icons'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Panel } from '../ui/Panel'
import { formatMoney, initials } from '../../lib/format'

interface WantedRequestsViewProps {
  requests: WantedRequest[]
  listings: Listing[]
  users: User[]
  onUpdate: (id: string, payload: AdminWantedUpdatePayload) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
  onFulfill: (id: string) => Promise<void> | void
  onMatchSeller: (wantedId: string, listingId: string, sellerName: string) => Promise<void> | void
}

const CATEGORIES: ListingCategory[] = [
  'textbooks',
  'electronics',
  'furniture',
  'transport',
  'supplies',
  'other',
]

const URGENCY_LEVELS: { id: WantedUrgency; label: string }[] = [
  { id: 'urgent', label: 'Urgent (< 24h)' },
  { id: 'moderate', label: 'Moderate' },
  { id: 'flexible', label: 'Flexible' },
]

export function WantedRequestsView({
  requests,
  listings,
  users,
  onUpdate,
  onDelete,
  onFulfill,
  onMatchSeller,
}: WantedRequestsViewProps) {
  const [urgencyFilter, setUrgencyFilter] = useState<WantedUrgency | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<WantedMatchStatus | 'all'>('all')
  const [campusFilter, setCampusFilter] = useState<string>('all')
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Edit Drawer state
  const [editingRequest, setEditingRequest] = useState<WantedRequest | null>(null)

  // Seller Match Modal state
  const [matchingRequest, setMatchingRequest] = useState<WantedRequest | null>(null)
  const [listingSearch, setListingSearch] = useState('')

  // Delete Confirm Dialog state
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!matchingRequest) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMatchingRequest(null)
      }
    }
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [matchingRequest])

  // Campuses list for filter dropdown
  const campusOptions = useMemo(() => {
    const map = new Map<string, { name: string; code: string; count: number }>()
    for (const r of requests) {
      const name = r.college_name || 'Government College of Engineering, Karad'
      const code = r.college_code || '6004'
      const existing = map.get(name)
      if (existing) {
        existing.count++
      } else {
        map.set(name, { name, code, count: 1 })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [requests])

  // Top metric stats
  const metrics = useMemo(() => {
    const total = requests.length
    const urgent = requests.filter((r) => r.urgency === 'urgent' && r.match_status !== 'fulfilled').length
    const matched = requests.filter((r) => r.match_status === 'matched').length
    const fulfilled = requests.filter((r) => r.match_status === 'fulfilled').length
    return { total, urgent, matched, fulfilled }
  }, [requests])

  // Filtered requests list
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const visible = useMemo(() => {
    return requests.filter((r) => {
      if (urgencyFilter !== 'all' && r.urgency !== urgencyFilter) return false
      if (statusFilter !== 'all' && r.match_status !== statusFilter) return false
      if (campusFilter !== 'all' && r.college_name !== campusFilter) return false
      if (branchFilter !== 'all' && r.branch !== branchFilter) return false
      if (yearFilter !== 'all' && r.academic_year !== yearFilter) return false

      if (normalizedQuery) {
        const title = r.title.toLowerCase()
        const desc = (r.description ?? '').toLowerCase()
        const sName = r.student_name.toLowerCase()
        const sEmail = r.student_email.toLowerCase()
        const cName = r.college_name.toLowerCase()
        const cCode = r.college_code.toLowerCase()
        const branch = (r.branch ?? '').toLowerCase()
        const year = (r.academic_year ?? '').toLowerCase()
        const cat = (categoryLabel[r.category] ?? r.category).toLowerCase()

        if (
          !title.includes(normalizedQuery) &&
          !desc.includes(normalizedQuery) &&
          !sName.includes(normalizedQuery) &&
          !sEmail.includes(normalizedQuery) &&
          !cName.includes(normalizedQuery) &&
          !cCode.includes(normalizedQuery) &&
          !branch.includes(normalizedQuery) &&
          !year.includes(normalizedQuery) &&
          !cat.includes(normalizedQuery)
        ) {
          return false
        }
      }
      return true
    })
  }, [requests, urgencyFilter, statusFilter, campusFilter, branchFilter, yearFilter, normalizedQuery])

  // Candidates for seller matching
  const matchingCandidates = useMemo(() => {
    if (!matchingRequest) return []
    const q = listingSearch.trim().toLowerCase()
    return listings
      .filter((l) => l.status === 'active' || l.status === 'flagged')
      .filter((l) => {
        if (!q) {
          // If no search query, prioritize same category or campus
          return (
            l.category === matchingRequest.category ||
            l.collegeName === matchingRequest.college_name ||
            l.branch === matchingRequest.branch
          )
        }
        const title = l.title.toLowerCase()
        const tags = (l.aiTags ?? '').toLowerCase()
        const notes = (l.aiConditionNotes ?? '').toLowerCase()
        const college = (l.collegeName ?? '').toLowerCase()
        const branch = (l.branch ?? '').toLowerCase()
        return (
          title.includes(q) ||
          tags.includes(q) ||
          notes.includes(q) ||
          college.includes(q) ||
          branch.includes(q)
        )
      })
  }, [listings, matchingRequest, listingSearch])

  // Export CSV Handler
  const handleExportCsv = () => {
    const headers = [
      'Request ID',
      'Item Title',
      'Max Budget (INR)',
      'Urgency',
      'Match Status',
      'Academic Branch',
      'Academic Year',
      'Category',
      'Student Name',
      'Student Email',
      'Student Phone',
      'Campus Name',
      'CET Code',
      'Matched Seller',
      'Created Date',
    ]

    const rows = visible.map((r) => {
      const escape = (val: string | null | undefined) =>
        `"${(val ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
      return [
        escape(r.id),
        escape(r.title),
        r.max_budget,
        escape(r.urgency),
        escape(r.match_status),
        escape(r.branch ?? 'Common / All'),
        escape(r.academic_year ?? 'All Years'),
        escape(categoryLabel[r.category] ?? r.category),
        escape(r.student_name),
        escape(r.student_email),
        escape(r.student_phone),
        escape(r.college_name),
        escape(r.college_code),
        escape(r.matched_seller_name),
        escape(r.created_at),
      ].join(',')
    })

    const csvData = [headers.join(','), ...rows].join('\r\n')
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `CampusMart-Wanted-Requests-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="view-enter space-y-6">
      {/* Metrics Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-ink-muted">Total Requests</span>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-surface-2 text-ink">
              <MegaphoneIcon size={14} />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-ink">{metrics.total}</p>
          <p className="mt-0.5 text-[11.5px] text-ink-faint">Student "Want to Buy" posts</p>
        </div>

        <div className="rounded-xl border border-critical/20 bg-critical-soft/30 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-critical">Urgent Needs</span>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-critical text-white">
              <TargetIcon size={14} />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-critical">{metrics.urgent}</p>
          <p className="mt-0.5 text-[11.5px] text-critical/80">&lt; 24h exam / lab assignment due</p>
        </div>

        <div className="rounded-xl border border-brand/20 bg-brand-soft/30 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-brand-strong">Matched with Seller</span>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-white">
              <SparklesIcon size={14} />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-brand-strong">{metrics.matched}</p>
          <p className="mt-0.5 text-[11.5px] text-brand-strong/80">Active seller connections linked</p>
        </div>

        <div className="rounded-xl border border-success/20 bg-success-soft/30 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-success">Fulfilled</span>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-success text-white">
              <CheckIcon size={14} />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-success">{metrics.fulfilled}</p>
          <p className="mt-0.5 text-[11.5px] text-success/80">Closed &amp; handed off</p>
        </div>
      </div>

      <Panel
        title="Wanted Board (Want to Buy / WTB)"
        caption="Monitor campus demand, match students with active sellers, and moderate academic requests."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleExportCsv}
              className="h-9 gap-1.5 px-3 text-[12.5px]"
              title="Download filtered wanted requests as CSV"
            >
              <DownloadIcon size={14} />
              Export CSV
            </Button>
          </div>
        }
      >
        {/* Search & Filter Bar */}
        <div className="border-b border-line bg-surface-2/40 px-5 py-3.5 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2.5 max-w-2xl">
              <div className="relative flex-1 min-w-[200px]">
                <SearchIcon
                  size={16}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
                />
                <input
                  type="search"
                  data-search-input="true"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search item title, student name, college, or branch…"
                  className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-[13px] text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-brand focus:outline-none"
                />
              </div>

              {/* Campus Selector */}
              <select
                value={campusFilter}
                onChange={(e) => setCampusFilter(e.target.value)}
                className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink transition-colors hover:border-line-strong focus:border-brand focus:outline-none"
              >
                <option value="all">🎓 All Campuses ({requests.length})</option>
                {campusOptions.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} · CET {c.code} ({c.count})
                  </option>
                ))}
              </select>

              {/* Branch Selector */}
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink transition-colors hover:border-line-strong focus:border-brand focus:outline-none"
              >
                <option value="all">📚 All Branches</option>
                {ACADEMIC_BRANCHES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>

              {/* Academic Year Selector */}
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink transition-colors hover:border-line-strong focus:border-brand focus:outline-none"
              >
                <option value="all">🏛️ All Years</option>
                {ACADEMIC_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y === 'All Years' ? 'Common (All Years)' : `Year: ${y}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 text-[12px] text-ink-muted">
              <span>Showing {visible.length} of {requests.length} requests</span>
              {(searchQuery ||
                urgencyFilter !== 'all' ||
                statusFilter !== 'all' ||
                campusFilter !== 'all' ||
                branchFilter !== 'all' ||
                yearFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setUrgencyFilter('all')
                    setStatusFilter('all')
                    setCampusFilter('all')
                    setBranchFilter('all')
                    setYearFilter('all')
                  }}
                  className="font-medium text-brand hover:underline"
                >
                  Reset filters
                </button>
              )}
            </div>
          </div>

          {/* Quick Filter Pill Rows */}
          <div className="flex flex-wrap items-center gap-4 pt-1">
            {/* Urgency tabs */}
            <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-[12px]">
              <button
                type="button"
                onClick={() => setUrgencyFilter('all')}
                className={`rounded-[6px] px-2.5 py-1 font-medium transition-colors ${
                  urgencyFilter === 'all'
                    ? 'bg-surface-2 text-ink shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                All Urgencies ({requests.length})
              </button>
              {URGENCY_LEVELS.map((u) => {
                const count = requests.filter((r) => r.urgency === u.id).length
                const active = urgencyFilter === u.id
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setUrgencyFilter(u.id)}
                    className={`rounded-[6px] px-2.5 py-1 font-medium transition-colors ${
                      active
                        ? u.id === 'urgent'
                          ? 'bg-critical text-white shadow-xs'
                          : 'bg-surface-2 text-ink shadow-xs'
                        : u.id === 'urgent' && count > 0
                          ? 'text-critical hover:bg-critical-soft'
                          : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {u.label}
                    <span className="ml-1 opacity-75">({count})</span>
                  </button>
                )
              })}
            </div>

            {/* Match status tabs */}
            <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-[12px]">
              {(['all', 'searching', 'matched', 'fulfilled'] as const).map((st) => {
                const active = statusFilter === st
                const count =
                  st === 'all' ? requests.length : requests.filter((r) => r.match_status === st).length
                const label =
                  st === 'all'
                    ? 'All Statuses'
                    : st === 'searching'
                      ? 'Searching 🔍'
                      : st === 'matched'
                        ? 'Matched ⚡'
                        : 'Fulfilled ✅'
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`rounded-[6px] px-2.5 py-1 font-medium transition-colors ${
                      active
                        ? 'bg-surface-2 text-ink shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {label} ({count})
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* List / Table Area */}
        {visible.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-surface-2 text-ink-muted">
              <MegaphoneIcon size={22} />
            </span>
            <p className="mt-3 text-[14px] font-semibold text-ink">No wanted requests found</p>
            <p className="mt-1 text-[13px] text-ink-muted">
              Try adjusting your search query, urgency filter, or campus selection.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Cards List */}
            <ul className="divide-y divide-line sm:hidden">
              {visible.map((req) => (
                <li key={req.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-[14px] font-semibold text-ink">{req.title}</h4>
                      <p className="text-[11.5px] font-mono text-ink-faint">{req.id}</p>
                    </div>
                    {req.urgency === 'urgent' ? (
                      <Badge tone="critical" withDot className="shrink-0">
                        Urgent
                      </Badge>
                    ) : req.urgency === 'moderate' ? (
                      <Badge tone="warning" className="shrink-0">
                        Moderate
                      </Badge>
                    ) : (
                      <Badge tone="neutral" className="shrink-0">
                        Flexible
                      </Badge>
                    )}
                  </div>

                  {req.description && (
                    <p className="text-[12.5px] text-ink-muted line-clamp-2">
                      {req.description}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded bg-brand-soft/80 px-2 py-0.5 font-medium text-brand-strong">
                      {formatCollegeBadge(req.college_name, req.college_code)}
                    </span>
                    {req.branch && (
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 font-medium text-ink-muted">
                        {req.branch}
                      </span>
                    )}
                    {req.academic_year && (
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 font-medium text-ink-muted">
                        {req.academic_year}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1 text-[12.5px]">
                    <div>
                      <span className="text-ink-muted">Budget: </span>
                      <span className="font-semibold text-ink">{formatMoney(req.max_budget)}</span>
                    </div>
                    <div>
                      {req.match_status === 'matched' ? (
                        <span className="inline-flex items-center gap-1 font-medium text-success">
                          <CheckIcon size={13} />
                          {req.matched_seller_name ? `Matched: ${req.matched_seller_name}` : 'Matched'}
                        </span>
                      ) : req.match_status === 'fulfilled' ? (
                        <span className="text-ink-muted">Fulfilled</span>
                      ) : (
                        <span className="font-medium text-warning">Searching…</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-line/60">
                    <Button
                      variant="outline"
                      className="flex-1 justify-center h-8 text-[12px]"
                      onClick={() => {
                        setMatchingRequest(req)
                        setListingSearch(req.title.split(' ')[0] || '')
                      }}
                    >
                      <TargetIcon size={13} />
                      Match Seller
                    </Button>
                    <Button
                      variant="outline"
                      className="h-8 px-2.5 text-[12px]"
                      onClick={() => setEditingRequest(req)}
                    >
                      <EditIcon size={13} />
                      Edit
                    </Button>
                    <Button
                      variant={req.match_status === 'fulfilled' ? 'outline' : 'primary'}
                      className="h-8 px-2.5 text-[12px]"
                      onClick={() => onFulfill(req.id)}
                      title={req.match_status === 'fulfilled' ? 'Mark unfulfilled' : 'Mark fulfilled'}
                    >
                      <CheckIcon size={13} />
                    </Button>
                    <Button
                      variant="danger-quiet"
                      className="h-8 px-2 text-[12px]"
                      onClick={() => setDeletingId(req.id)}
                      title="Delete request"
                    >
                      <TrashIcon size={14} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[1080px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    {[
                      'Wanted Item',
                      'Student / Campus',
                      'Discipline / Year',
                      'Max Budget',
                      'Urgency',
                      'Match Status',
                      '',
                    ].map((h, i) => (
                      <th
                        key={h || `col-${i}`}
                        className={`px-5 py-3 text-[10.5px] font-semibold tracking-[0.09em] text-ink-faint uppercase ${
                          i === 6 ? 'text-right' : ''
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((req) => (
                    <tr key={req.id} className="transition-colors hover:bg-surface-2/60">
                      {/* Item */}
                      <td className="px-5 py-3.5 max-w-[280px]">
                        <p className="truncate text-[13.5px] font-semibold text-ink" title={req.title}>
                          {req.title}
                        </p>
                        {req.description && (
                          <p className="mt-0.5 truncate text-[12px] text-ink-muted" title={req.description}>
                            {req.description}
                          </p>
                        )}
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-faint">
                          <span className="font-mono">{req.id}</span>
                          <span>•</span>
                          <span>{categoryLabel[req.category]}</span>
                          <span>•</span>
                          <span>{req.created_at}</span>
                        </div>
                      </td>

                      {/* Student & Campus */}
                      <td className="px-5 py-3.5 max-w-[240px]">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand-soft text-[10.5px] font-semibold text-brand-strong">
                            {initials(req.student_name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium text-ink">{req.student_name}</p>
                            <p className="truncate text-[11.5px] text-ink-muted" title={req.student_email}>
                              {req.student_email}
                            </p>
                          </div>
                        </div>
                        <div className="mt-1.5">
                          <span
                            className="inline-flex max-w-[220px] truncate items-center gap-1 rounded bg-brand-soft/70 px-2 py-0.5 text-[11px] font-medium text-brand-strong"
                            title={`${req.college_name} · CET ${req.college_code}`}
                          >
                            {formatCollegeBadge(req.college_name, req.college_code)}
                          </span>
                        </div>
                      </td>

                      {/* Discipline / Year */}
                      <td className="px-5 py-3.5">
                        <div className="space-y-1">
                          <span className="inline-block rounded bg-surface-2 px-2 py-0.5 text-[11.5px] font-medium text-ink">
                            {req.branch ?? 'Common / IT'}
                          </span>
                          <div>
                            <span className="inline-block rounded bg-brand-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-brand-strong">
                              Year: {req.academic_year ?? 'All'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Max Budget */}
                      <td className="tabular px-5 py-3.5 text-[14px] font-semibold text-ink">
                        {formatMoney(req.max_budget)}
                      </td>

                      {/* Urgency */}
                      <td className="px-5 py-3.5">
                        {req.urgency === 'urgent' ? (
                          <Badge tone="critical" withDot>
                            Urgent (&lt;24h)
                          </Badge>
                        ) : req.urgency === 'moderate' ? (
                          <Badge tone="warning">
                            Moderate
                          </Badge>
                        ) : (
                          <Badge tone="neutral">
                            Flexible
                          </Badge>
                        )}
                      </td>

                      {/* Match Status */}
                      <td className="px-5 py-3.5">
                        {req.match_status === 'matched' ? (
                          <div className="space-y-0.5">
                            <Badge tone="success" withDot>
                              Matched
                            </Badge>
                            {req.matched_seller_name && (
                              <p className="truncate text-[11.5px] font-medium text-success">
                                with {req.matched_seller_name}
                              </p>
                            )}
                          </div>
                        ) : req.match_status === 'fulfilled' ? (
                          <Badge tone="neutral">
                            Fulfilled
                          </Badge>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[12px] font-medium text-amber-600 dark:text-amber-400">
                            <span className="h-2 w-2 animate-ping rounded-full bg-amber-500" />
                            Searching
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            className="h-8 gap-1 px-2.5 text-[12px]"
                            onClick={() => {
                              setMatchingRequest(req)
                              setListingSearch(req.title.split(' ')[0] || '')
                            }}
                            title="Match with seller listing"
                          >
                            <TargetIcon size={13} />
                            Match
                          </Button>
                          <Button
                            variant="outline"
                            className="h-8 px-2 text-[12px]"
                            onClick={() => setEditingRequest(req)}
                            title="Edit request details"
                          >
                            <EditIcon size={13} />
                          </Button>
                          <Button
                            variant={req.match_status === 'fulfilled' ? 'outline' : 'primary'}
                            className="h-8 px-2 text-[12px]"
                            onClick={() => onFulfill(req.id)}
                            title={req.match_status === 'fulfilled' ? 'Mark unfulfilled' : 'Mark fulfilled'}
                          >
                            <CheckIcon size={13} />
                          </Button>
                          <Button
                            variant="danger-quiet"
                            className="h-8 px-2 text-[12px]"
                            onClick={() => setDeletingId(req.id)}
                            title="Delete spam/unwanted request"
                          >
                            <TrashIcon size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      {/* MATCH WITH SELLER MODAL */}
      {matchingRequest && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
        >
          <div
            className="fixed inset-0 bg-ink/50 backdrop-blur-xs"
            onClick={() => setMatchingRequest(null)}
          />
          <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-line bg-surface shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <header className="flex items-center justify-between border-b border-line px-5 py-4 bg-surface-2/60">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-brand text-white">
                    <TargetIcon size={13} />
                  </span>
                  <h3 className="text-[15px] font-semibold text-ink">Match Student Request with Active Seller</h3>
                </div>
                <p className="mt-0.5 truncate text-[12.5px] text-ink-muted">
                  Request: <span className="font-medium text-ink">{matchingRequest.title}</span> (Budget: {formatMoney(matchingRequest.max_budget)})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMatchingRequest(null)}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink"
              >
                <CloseIcon size={16} />
              </button>
            </header>

            {/* Search Listings Bar */}
            <div className="p-4 border-b border-line bg-surface">
              <div className="relative">
                <SearchIcon
                  size={15}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
                />
                <input
                  type="search"
                  value={listingSearch}
                  onChange={(e) => setListingSearch(e.target.value)}
                  placeholder="Search marketplace items to link with this buyer..."
                  className="h-9 w-full rounded-lg border border-line bg-surface-2 pr-3 pl-9 text-[13px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
                />
              </div>
            </div>

            {/* Listings List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {matchingCandidates.length === 0 ? (
                <div className="py-12 text-center text-[13px] text-ink-muted">
                  No active listings found matching "{listingSearch}". Try searching other keywords or view all items.
                </div>
              ) : (
                matchingCandidates.map((listing) => {
                  const seller = users.find((u) => u.id === listing.sellerId)
                  const sellerName = seller?.name ?? 'Marketplace Seller'
                  const isCurrentMatch = matchingRequest.matched_listing_id === listing.id

                  return (
                    <div
                      key={listing.id}
                      className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors ${
                        isCurrentMatch
                          ? 'border-success bg-success-soft/30'
                          : 'border-line hover:border-line-strong hover:bg-surface-2/40'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {listing.imageUrls[0] ? (
                          <img
                            src={listing.imageUrls[0]}
                            alt={listing.title}
                            className="h-11 w-11 shrink-0 rounded-lg object-cover border border-line"
                          />
                        ) : (
                          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-surface-2 text-[11px] font-semibold text-ink-muted">
                            IMG
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-semibold text-ink">{listing.title}</p>
                          <p className="truncate text-[12px] text-ink-muted">
                            Seller: <span className="font-medium text-ink">{sellerName}</span> ·{' '}
                            {formatCollegeBadge(listing.collegeName, listing.collegeCode)}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2 text-[11.5px]">
                            <span className="font-semibold text-ink">{formatMoney(listing.price)}</span>
                            {listing.branch && (
                              <span className="text-ink-faint">({listing.branch})</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {isCurrentMatch ? (
                          <Badge tone="success">
                            Currently Linked
                          </Badge>
                        ) : (
                          <Button
                            variant="primary"
                            className="h-8 px-3 text-[12px]"
                            onClick={async () => {
                              await onMatchSeller(matchingRequest.id, listing.id, sellerName)
                              setMatchingRequest(null)
                            }}
                          >
                            <SparklesIcon size={12} />
                            Link &amp; Match
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <footer className="border-t border-line px-5 py-3 bg-surface-2 flex items-center justify-between text-[12px] text-ink-muted">
              <span>Matching links the seller and changes status to "Matched".</span>
              <Button variant="outline" className="h-8 text-[12px]" onClick={() => setMatchingRequest(null)}>
                Close
              </Button>
            </footer>
          </div>
        </div>
      )}

      {/* EDIT WANTED REQUEST DRAWER */}
      {editingRequest && (
        <EditWantedRequestDrawer
          request={editingRequest}
          onClose={() => setEditingRequest(null)}
          onSave={async (id, payload) => {
            await onUpdate(id, payload)
            setEditingRequest(null)
          }}
        />
      )}

      {/* DELETE CONFIRM DIALOG */}
      <ConfirmDialog
        open={deletingId !== null}
        title="Delete Wanted Request"
        body="Are you sure you want to permanently delete this student request? This action removes the post from campus discovery."
        confirmLabel="Delete Request"
        onConfirm={async () => {
          if (deletingId) {
            await onDelete(deletingId)
            setDeletingId(null)
          }
        }}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  )
}

/* ============================================================
   EDIT WANTED REQUEST DRAWER COMPONENT
   ============================================================ */

interface EditWantedRequestDrawerProps {
  request: WantedRequest
  onClose: () => void
  onSave: (id: string, payload: AdminWantedUpdatePayload) => Promise<void> | void
}

function EditWantedRequestDrawer({ request, onClose, onSave }: EditWantedRequestDrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const [title, setTitle] = useState(request.title)
  const [description, setDescription] = useState(request.description ?? '')
  const [category, setCategory] = useState<ListingCategory>(request.category)
  const [budget, setBudget] = useState(String(request.max_budget))
  const [urgency, setUrgency] = useState<WantedUrgency>(request.urgency)
  const [branch, setBranch] = useState(request.branch ?? 'Computer / IT')
  const [year, setYear] = useState(request.academic_year ?? 'FE')
  const [matchStatus, setMatchStatus] = useState<WantedMatchStatus>(request.match_status)
  const [studentName, setStudentName] = useState(request.student_name)
  const [studentEmail, setStudentEmail] = useState(request.student_email)
  const [studentPhone, setStudentPhone] = useState(request.student_phone ?? '')

  // College matching
  const initialCollegeMatched = MAHARASHTRA_COLLEGES.find(
    (c) =>
      c.name.toLowerCase() === request.college_name.toLowerCase() ||
      c.code === request.college_code,
  )
  const [selectedCollegePreset, setSelectedCollegePreset] = useState<string>(
    initialCollegeMatched ? `${initialCollegeMatched.name}|${initialCollegeMatched.code}` : 'custom',
  )
  const [collegeName, setCollegeName] = useState(request.college_name)
  const [collegeCode, setCollegeCode] = useState(request.college_code)

  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleCollegeChange = (preset: string) => {
    setSelectedCollegePreset(preset)
    if (preset !== 'custom') {
      const [n, c] = preset.split('|')
      setCollegeName(n)
      setCollegeCode(c)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSaving(true)

    const parsedBudget = Number(budget)
    if (isNaN(parsedBudget) || parsedBudget < 0) {
      setErrorMsg('Please enter a valid maximum budget (₹).')
      setSaving(false)
      return
    }

    const payload: AdminWantedUpdatePayload = {
      title: title.trim(),
      description: description.trim(),
      category,
      max_budget: parsedBudget,
      urgency,
      branch: branch.trim(),
      academic_year: year.trim(),
      match_status: matchStatus,
      student_name: studentName.trim(),
      student_email: studentEmail.trim(),
      student_phone: studentPhone.trim() || undefined,
      college_name: collegeName.trim(),
      college_code: collegeCode.trim(),
    }

    try {
      await onSave(request.id, payload)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save request')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60]">
      <div className="fixed inset-0 bg-ink/40" onClick={onClose} />
      <div className="drawer-enter absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col border-l border-line bg-surface shadow-2xl">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-ink">Edit Wanted Request (God-Mode)</h2>
            <p className="font-mono text-[12px] text-ink-faint">{request.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink"
          >
            <CloseIcon size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {errorMsg && (
              <div className="rounded-lg border border-critical/30 bg-critical-soft p-3 text-[12.5px] font-medium text-critical">
                {errorMsg}
              </div>
            )}

            {/* Item Title */}
            <div>
              <label htmlFor="wanted-title" className="block text-[12px] font-medium text-ink-muted">
                Requested Item Title
              </label>
              <input
                id="wanted-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink focus:border-brand focus:outline-none"
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="wanted-desc" className="block text-[12px] font-medium text-ink-muted">
                Student Request Note / Condition requirements
              </label>
              <textarea
                id="wanted-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-surface p-2.5 text-[12.5px] text-ink focus:border-brand focus:outline-none resize-none"
              />
            </div>

            {/* Budget & Category */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="wanted-budget" className="block text-[12px] font-medium text-ink-muted">
                  Max Budget (₹)
                </label>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-faint">
                    ₹
                  </span>
                  <input
                    id="wanted-budget"
                    type="number"
                    min="0"
                    required
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-7 text-[13px] font-medium text-ink focus:border-brand focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="wanted-cat" className="block text-[12px] font-medium text-ink-muted">
                  Category
                </label>
                <select
                  id="wanted-cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ListingCategory)}
                  className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink focus:border-brand focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabel[c]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Urgency & Match Status */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="wanted-urgency" className="block text-[12px] font-medium text-ink-muted">
                  Urgency
                </label>
                <select
                  id="wanted-urgency"
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value as WantedUrgency)}
                  className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink focus:border-brand focus:outline-none"
                >
                  {URGENCY_LEVELS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="wanted-status" className="block text-[12px] font-medium text-ink-muted">
                  Match Status
                </label>
                <select
                  id="wanted-status"
                  value={matchStatus}
                  onChange={(e) => setMatchStatus(e.target.value as WantedMatchStatus)}
                  className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink focus:border-brand focus:outline-none"
                >
                  <option value="searching">Searching</option>
                  <option value="matched">Matched</option>
                  <option value="fulfilled">Fulfilled</option>
                </select>
              </div>
            </div>

            {/* Academic Branch & Year */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="wanted-branch" className="block text-[12px] font-medium text-ink-muted">
                  Academic Branch
                </label>
                <select
                  id="wanted-branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink focus:border-brand focus:outline-none"
                >
                  {ACADEMIC_BRANCHES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="wanted-year" className="block text-[12px] font-medium text-ink-muted">
                  Academic Year
                </label>
                <select
                  id="wanted-year"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink focus:border-brand focus:outline-none"
                >
                  {ACADEMIC_YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y === 'All Years' ? 'All Years (Common)' : `Year: ${y}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Student Contact Info */}
            <div className="rounded-xl border border-line bg-surface-2/40 p-3.5 space-y-3">
              <p className="text-[12px] font-semibold text-ink">Student Contact Information</p>
              <div>
                <label htmlFor="student-name" className="block text-[11px] text-ink-muted">
                  Student Name
                </label>
                <input
                  id="student-name"
                  type="text"
                  required
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="mt-0.5 h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink focus:border-brand focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="student-email" className="block text-[11px] text-ink-muted">
                    Email
                  </label>
                  <input
                    id="student-email"
                    type="email"
                    required
                    value={studentEmail}
                    onChange={(e) => setStudentEmail(e.target.value)}
                    className="mt-0.5 h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink focus:border-brand focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="student-phone" className="block text-[11px] text-ink-muted">
                    Phone
                  </label>
                  <input
                    id="student-phone"
                    type="text"
                    value={studentPhone}
                    onChange={(e) => setStudentPhone(e.target.value)}
                    placeholder="+91 98..."
                    className="mt-0.5 h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink focus:border-brand focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Campus Association */}
            <div className="rounded-xl border border-line bg-surface-2/40 p-3.5 space-y-3">
              <label htmlFor="wanted-college" className="block text-[12px] font-semibold text-ink">
                Campus / Institute
              </label>
              <select
                id="wanted-college"
                value={selectedCollegePreset}
                onChange={(e) => handleCollegeChange(e.target.value)}
                className="h-8.5 w-full rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink focus:border-brand focus:outline-none"
              >
                {MAHARASHTRA_COLLEGES.map((c) => (
                  <option key={c.code} value={`${c.name}|${c.code}`}>
                    {c.code} — {c.name}
                  </option>
                ))}
                <option value="custom">⚙️ Custom / Other Institute…</option>
              </select>

              {selectedCollegePreset === 'custom' && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[11px] text-ink-muted">Institute Name</label>
                    <input
                      type="text"
                      value={collegeName}
                      onChange={(e) => setCollegeName(e.target.value)}
                      className="mt-0.5 h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink focus:border-brand focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-ink-muted">CET Code</label>
                    <input
                      type="text"
                      value={collegeCode}
                      onChange={(e) => setCollegeCode(e.target.value)}
                      className="mt-0.5 h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink focus:border-brand focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <footer className="border-t border-line bg-surface-2 p-4 flex items-center justify-end gap-2.5 shrink-0">
            <Button variant="outline" type="button" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  )
}
