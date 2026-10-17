import { useMemo, useState } from 'react'
import type { AdminListingUpdatePayload } from '../../api/client'
import type { Listing, ListingCategory, User } from '../../data/mock'
import {
  ACADEMIC_BRANCHES,
  ACADEMIC_YEARS,
  LISTING_DELETE_TRUST_PENALTY,
  categoryLabel,
  formatCollegeBadge,
  formatTrustScore,
  priceDeviation,
} from '../../data/mock'
import { formatMoney, initials } from '../../lib/format'
import { FlagInspector } from '../listings/FlagInspector'
import { ListingThumb } from '../listings/ListingThumb'
import { DownloadIcon, EditIcon, SearchIcon } from '../icons'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Panel } from '../ui/Panel'

export type ListingFilter = 'all' | 'flagged' | 'active' | 'sold'

interface ListingsViewProps {
  listings: Listing[]
  users: User[]
  fraudAgentEnabled: boolean
  onApprove: (listing: Listing) => void
  onDelete: (listing: Listing) => void
  onBanSeller: (listing: Listing) => void
  onOpenSeller: (sellerId: string) => void
  onUpdateListing?: (listingId: string, payload: AdminListingUpdatePayload) => Promise<void> | void
}

const TABS: { id: ListingFilter; label: string }[] = [
  { id: 'all', label: 'All listings' },
  { id: 'flagged', label: 'Flagged by AI' },
  { id: 'active', label: 'Active' },
  { id: 'sold', label: 'Sold' },
]

const CATEGORY_FILTERS: { id: ListingCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All Categories' },
  { id: 'textbooks', label: 'Textbooks' },
  { id: 'electronics', label: 'Electronics' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'transport', label: 'Bikes & transport' },
  { id: 'supplies', label: 'Lab & supplies' },
  { id: 'other', label: 'Other' },
]

function deviationTone(deviation: number): 'success' | 'warning' | 'critical' {
  const magnitude = Math.abs(deviation)
  if (magnitude > 50) return 'critical'
  if (magnitude > 20) return 'warning'
  return 'success'
}

export function ListingsView({
  listings,
  users,
  fraudAgentEnabled,
  onApprove,
  onDelete,
  onBanSeller,
  onOpenSeller,
  onUpdateListing,
}: ListingsViewProps) {
  const [filter, setFilter] = useState<ListingFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<ListingCategory | 'all'>('all')
  const [collegeFilter, setCollegeFilter] = useState<string>('all')
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [academicYearFilter, setAcademicYearFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [inspectorMode, setInspectorMode] = useState<'view' | 'edit'>('view')
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'ban'; listing: Listing } | null>(null)

  const collegeOptions = useMemo(() => {
    const map = new Map<string, { name: string; code: string; count: number }>()
    for (const listing of listings) {
      const name = listing.collegeName || 'Government College of Engineering, Karad'
      const code = listing.collegeCode || '6004'
      const existing = map.get(name)
      if (existing) {
        existing.count++
      } else {
        map.set(name, { name, code, count: 1 })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [listings])

  const counts = {
    all: listings.length,
    flagged: listings.filter((l) => l.status === 'flagged').length,
    active: listings.filter((l) => l.status === 'active').length,
    sold: listings.filter((l) => l.status === 'sold').length,
  }

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const visible = listings.filter((listing) => {
    if (filter === 'flagged' && listing.status !== 'flagged') return false
    if (filter !== 'all' && filter !== 'flagged' && listing.status !== filter) return false
    if (categoryFilter !== 'all' && listing.category !== categoryFilter) return false
    if (collegeFilter !== 'all' && listing.collegeName !== collegeFilter) return false
    if (branchFilter !== 'all' && listing.branch !== branchFilter) return false
    if (academicYearFilter !== 'all' && listing.academic_year !== academicYearFilter) return false

    if (normalizedQuery) {
      const seller = users.find((user) => user.id === listing.sellerId)
      const sellerName = (seller?.name ?? '').toLowerCase()
      const title = listing.title.toLowerCase()
      const cat = (categoryLabel[listing.category] ?? listing.category).toLowerCase()
      const tags = (listing.aiTags ?? '').toLowerCase()
      const notes = (listing.aiConditionNotes ?? '').toLowerCase()
      const cName = (listing.collegeName ?? '').toLowerCase()
      const cCode = (listing.collegeCode ?? '').toLowerCase()
      const branch = (listing.branch ?? '').toLowerCase()
      const year = (listing.academic_year ?? '').toLowerCase()
      if (
        !title.includes(normalizedQuery) &&
        !sellerName.includes(normalizedQuery) &&
        !cat.includes(normalizedQuery) &&
        !tags.includes(normalizedQuery) &&
        !notes.includes(normalizedQuery) &&
        !cName.includes(normalizedQuery) &&
        !cCode.includes(normalizedQuery) &&
        !branch.includes(normalizedQuery) &&
        !year.includes(normalizedQuery)
      ) {
        return false
      }
    }
    return true
  })

  const selected = listings.find((listing) => listing.id === selectedId) ?? null
  const selectedSeller = selected ? users.find((user) => user.id === selected.sellerId) : undefined

  const resolveConfirm = () => {
    if (confirm) {
      if (confirm.kind === 'delete') onDelete(confirm.listing)
      else onBanSeller(confirm.listing)
    }
    setConfirm(null)
    setSelectedId(null)
  }

  const handleExportCsv = () => {
    const headers = [
      'Listing ID',
      'Title',
      'Seller Name',
      'Campus Name',
      'CET Code',
      'Academic Branch',
      'Academic Year',
      'Category',
      'Status',
      'Price (INR)',
      'AI Fair Price (INR)',
      'Deviation (%)',
      'AI Search Tags',
      'AI Condition Notes',
      'Trust Flag Reason',
      'Listed Date',
    ]

    const rows = visible.map((l) => {
      const seller = users.find((u) => u.id === l.sellerId)
      const dev = priceDeviation(l)
      const escape = (val: string | null | undefined) =>
        `"${(val ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
      return [
        escape(l.id),
        escape(l.title),
        escape(seller?.name ?? l.sellerId),
        escape(l.collegeName ?? 'Government College of Engineering, Karad'),
        escape(l.collegeCode ?? '6004'),
        escape(l.branch ?? 'All Branches / Common'),
        escape(l.academic_year ?? 'All Years'),
        escape(categoryLabel[l.category] ?? l.category),
        escape(l.status),
        l.price,
        l.aiPrice,
        `${dev > 0 ? '+' : ''}${dev}%`,
        escape(l.aiTags),
        escape(l.aiConditionNotes),
        escape(l.flag?.reason),
        escape(l.listed),
      ].join(',')
    })

    const csvData = [headers.join(','), ...rows].join('\r\n')
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `CampusMart-Listings-Report-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="view-enter space-y-6">
      <Panel
        title="Listing moderation"
        caption="Every listing is scored by the AI agents; flagged items open in the inspector with the trust reason."
        action={
          <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
            <div
              role="group"
              aria-label="Filter listings"
              className="inline-flex w-full flex-wrap rounded-lg border border-line bg-surface p-0.5 sm:w-auto"
            >
              {TABS.map((tab) => {
                const active = filter === tab.id
                const isFlagged = tab.id === 'flagged'
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(tab.id)}
                    className={`h-8 rounded-[7px] px-3 text-[13px] whitespace-nowrap transition-colors duration-150 ${
                      active
                        ? 'bg-brand-soft font-medium text-brand-strong'
                        : isFlagged && counts.flagged > 0
                          ? 'font-medium text-critical hover:bg-critical-soft'
                          : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                    }`}
                  >
                    {tab.label}
                    {isFlagged && counts.flagged > 0 ? (
                      <span className="tabular ml-1.5 rounded-md bg-critical-soft px-1.5 py-0.5 text-[11px] font-semibold text-critical">
                        {counts.flagged}
                      </span>
                    ) : (
                      <span className="tabular ml-1.5 text-[12px] opacity-70">
                        {counts[tab.id]}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <Button
              variant="outline"
              onClick={handleExportCsv}
              className="h-9 gap-1.5 px-3 text-[12.5px]"
              title="Download filtered listings report as CSV"
            >
              <DownloadIcon size={14} />
              Export CSV
            </Button>
          </div>
        }
      >
        {/* Search & Category Filter Bar */}
        <div className="border-b border-line bg-surface-2/40 px-5 py-3.5 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2.5 max-w-xl">
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
                  placeholder="Search title, seller, campus, category, or tags…"
                  aria-label="Search listings by title, seller, campus, category or tags"
                  className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-[13px] text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-brand"
                />
              </div>

              {/* College Dropdown Filter */}
              <select
                value={collegeFilter}
                onChange={(e) => setCollegeFilter(e.target.value)}
                className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink transition-colors hover:border-line-strong focus:border-brand focus:outline-none"
                aria-label="Filter by campus"
              >
                <option value="all">🎓 All Campuses ({listings.length})</option>
                {collegeOptions.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} · CET {c.code} ({c.count})
                  </option>
                ))}
              </select>

              {/* Branch Filter */}
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink transition-colors hover:border-line-strong focus:border-brand focus:outline-none"
                aria-label="Filter by branch"
              >
                <option value="all">📚 All Branches</option>
                {ACADEMIC_BRANCHES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>

              {/* Academic Year Filter */}
              <select
                value={academicYearFilter}
                onChange={(e) => setAcademicYearFilter(e.target.value)}
                className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink transition-colors hover:border-line-strong focus:border-brand focus:outline-none"
                aria-label="Filter by academic year"
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
              <span>Showing {visible.length} of {listings.length} listings</span>
              {(searchQuery || categoryFilter !== 'all' || collegeFilter !== 'all' || branchFilter !== 'all' || academicYearFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setCategoryFilter('all')
                    setCollegeFilter('all')
                    setBranchFilter('all')
                    setAcademicYearFilter('all')
                  }}
                  className="font-medium text-brand hover:underline"
                >
                  Reset filters
                </button>
              )}
            </div>
          </div>

          <div
            role="group"
            aria-label="Filter by category"
            className="flex flex-wrap items-center gap-1.5 pt-0.5"
          >
            {CATEGORY_FILTERS.map((cat) => {
              const active = categoryFilter === cat.id
              return (
                <button
                  key={cat.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`h-7 rounded-full border px-3 text-[12px] whitespace-nowrap transition-colors duration-150 ${
                    active
                      ? 'border-brand bg-brand-soft font-medium text-brand-strong'
                      : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink'
                  }`}
                >
                  {cat.label}
                </button>
              )
            })}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-[14px] font-semibold text-ink">No listings in this view</p>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-muted">
              {searchQuery || categoryFilter !== 'all' || collegeFilter !== 'all' || branchFilter !== 'all' || academicYearFilter !== 'all'
                ? 'No listings match the current search query, campus, branch, year, or category filters.'
                : filter === 'flagged'
                  ? 'No listing currently carries an AI trust flag. New flags appear here as agents scan the marketplace.'
                  : 'Nothing has this status right now.'}
            </p>
            <Button
              className="mt-4"
              onClick={() => {
                setFilter('all')
                setCategoryFilter('all')
                setCollegeFilter('all')
                setBranchFilter('all')
                setAcademicYearFilter('all')
                setSearchQuery('')
              }}
            >
              Clear filters and show all
            </Button>
          </div>
        ) : (
          <>
            {/* Mobile: stacked records instead of a compressed table */}
            <ul className="divide-y divide-line sm:hidden">
              {visible.map((listing) => {
                const seller = users.find((user) => user.id === listing.sellerId)
                const deviation = priceDeviation(listing)
                return (
                  <li
                    key={listing.id}
                    className={`px-5 py-4 ${listing.status === 'flagged' ? 'bg-critical-soft/40' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <ListingThumb listing={listing} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => setSelectedId(listing.id)}
                            className="min-w-0 flex-1 text-left text-[13.5px] font-medium text-ink transition-colors hover:text-brand"
                          >
                            {listing.title}
                          </button>
                          {listing.flag ? (
                            <Badge
                              tone={listing.flag.severity === 'high' ? 'critical' : 'warning'}
                              withDot
                              className="shrink-0"
                            >
                              {listing.flag.severity === 'high' ? 'High' : 'Medium'}
                            </Badge>
                          ) : listing.status === 'sold' ? (
                            <Badge tone="neutral" className="shrink-0">
                              Sold
                            </Badge>
                          ) : (
                            <Badge tone="success" className="shrink-0">
                              Active
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[12.5px] text-ink-muted">
                          {seller?.name ?? 'Unknown seller'} · {categoryLabel[listing.category]}
                        </p>
                        <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-brand-soft/80 px-2 py-0.5 text-[11px] font-medium text-brand-strong">
                          {formatCollegeBadge(listing.collegeName, listing.collegeCode)}
                        </p>
                        {(listing.branch || listing.academic_year) && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {listing.branch && (
                              <span className="inline-block rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-muted">
                                {listing.branch}
                              </span>
                            )}
                            {listing.academic_year && (
                              <span className="inline-block rounded bg-brand-soft px-1.5 py-0.5 text-[10.5px] font-medium text-brand-strong">
                                Year: {listing.academic_year}
                              </span>
                            )}
                          </div>
                        )}
                        <p className="tabular mt-1 text-[12.5px] text-ink-muted">
                          <span className="font-medium text-ink">{formatMoney(listing.price)}</span>
                          {' · AI '}
                          {formatMoney(listing.aiPrice)} ·{' '}
                          <span className={deviation > 20 || deviation < -20 ? 'text-critical' : ''}>
                            {deviation > 0 ? '+' : ''}
                            {deviation}%
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="mt-3.5 flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 justify-center h-8.5 text-[12.5px]"
                        onClick={() => {
                          setSelectedId(listing.id)
                          setInspectorMode('edit')
                        }}
                      >
                        <EditIcon size={13} />
                        Edit
                      </Button>
                      <Button
                        className="flex-1 justify-center h-8.5 text-[12.5px]"
                        onClick={() => {
                          setSelectedId(listing.id)
                          setInspectorMode('view')
                        }}
                      >
                        Inspect
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[1040px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    {['Listing', 'Seller', 'Campus / CET Code', 'Category', 'Listed price', 'AI price', 'Trust flag', ''].map(
                      (heading, index) => (
                        <th
                          key={heading || `col-${index}`}
                          scope="col"
                          className={`px-5 py-3 text-[10.5px] font-semibold tracking-[0.09em] text-ink-faint uppercase ${
                            index === 7 ? 'text-right' : ''
                          }`}
                        >
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((listing) => {
                    const seller = users.find((user) => user.id === listing.sellerId)
                    const deviation = priceDeviation(listing)
                    const flagged = listing.status === 'flagged'
                    return (
                      <tr
                        key={listing.id}
                        className={`transition-colors duration-150 ${
                          flagged
                            ? 'bg-critical-soft/40 hover:bg-critical-soft/70'
                            : 'hover:bg-surface-2'
                        }`}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <ListingThumb listing={listing} />
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => setSelectedId(listing.id)}
                                className="block max-w-[240px] truncate text-left text-[13.5px] font-medium text-ink transition-colors hover:text-brand"
                              >
                                {listing.title}
                              </button>
                              <p className="font-mono text-[11.5px] text-ink-faint">{listing.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand-soft text-[10.5px] font-semibold text-brand-strong">
                              {seller ? initials(seller.name) : '—'}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium text-ink">
                                {seller?.name ?? 'Unknown seller'}
                              </p>
                              <p className="text-[11.5px] text-ink-muted">
                                Trust {seller ? formatTrustScore(seller.trustScore) : '—'}
                                {seller?.status === 'blocked' && (
                                  <span className="text-critical"> · Blocked</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="max-w-[220px]">
                            <span
                              className="inline-flex items-center gap-1 rounded-md bg-brand-soft/70 px-2 py-0.5 text-[11.5px] font-medium text-brand-strong"
                              title={`${listing.collegeName ?? 'GCOE Karad'} · CET ${listing.collegeCode ?? '6004'}`}
                            >
                              <span className="truncate">{formatCollegeBadge(listing.collegeName, listing.collegeCode)}</span>
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-[13px] font-medium text-ink">
                            {categoryLabel[listing.category]}
                          </p>
                          {(listing.branch || listing.academic_year) && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {listing.branch && (
                                <span className="inline-block rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-muted">
                                  {listing.branch}
                                </span>
                              )}
                              {listing.academic_year && (
                                <span className="inline-block rounded bg-brand-soft px-1.5 py-0.5 text-[10.5px] font-medium text-brand-strong">
                                  {listing.academic_year}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="tabular px-5 py-3.5 text-[13.5px] font-medium text-ink">
                          {formatMoney(listing.price)}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="tabular text-[13px] text-ink-muted">
                              {formatMoney(listing.aiPrice)}
                            </span>
                            <Badge tone={deviationTone(deviation)}>
                              {deviation > 0 ? '+' : ''}
                              {deviation}%
                            </Badge>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          {listing.flag ? (
                            <Badge tone={listing.flag.severity === 'high' ? 'critical' : 'warning'} withDot>
                              {listing.flag.severity === 'high' ? 'Flagged · High' : 'Flagged · Medium'}
                            </Badge>
                          ) : (
                            <Badge tone="neutral" withDot>
                              Clear
                            </Badge>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              className="h-8 px-2.5 text-[12.5px]"
                              aria-label={`Edit ${listing.title}`}
                              onClick={() => {
                                setSelectedId(listing.id)
                                setInspectorMode('edit')
                              }}
                            >
                              <EditIcon size={14} />
                              Edit
                            </Button>
                            <Button
                              className="h-8 px-3 text-[12.5px]"
                              aria-label={`Inspect ${listing.title}`}
                              onClick={() => {
                                setSelectedId(listing.id)
                                setInspectorMode('view')
                              }}
                            >
                              Inspect
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2 px-5 py-3.5 text-[12.5px] text-ink-muted">
          <span>
            Showing {visible.length} of {listings.length} listings
          </span>
          <span>Approving clears the flag · deleting lowers the seller&apos;s trust score.</span>
        </div>
      </Panel>

      <FlagInspector
        listing={selected}
        seller={selectedSeller}
        fraudAgentEnabled={fraudAgentEnabled}
        allUsers={users}
        initialMode={inspectorMode}
        onClose={() => setSelectedId(null)}
        onApprove={(listing) => {
          onApprove(listing)
          setSelectedId(null)
        }}
        onDelete={(listing) => setConfirm({ kind: 'delete', listing })}
        onBanSeller={(listing) => setConfirm({ kind: 'ban', listing })}
        onOpenSeller={onOpenSeller}
        onUpdateListing={onUpdateListing}
      />

      {confirm?.kind === 'delete' &&
        (() => {
          const seller = users.find((user) => user.id === confirm.listing.sellerId)
          const after = seller
            ? Math.max(0, seller.trustScore - LISTING_DELETE_TRUST_PENALTY)
            : null
          return (
            <ConfirmDialog
              open
              title={`Delete “${confirm.listing.title}”?`}
              body={
                seller && after !== null
                  ? `The listing is removed from CampusMart. ${seller.name} loses ${LISTING_DELETE_TRUST_PENALTY} points of trust score (${formatTrustScore(seller.trustScore)} → ${formatTrustScore(after)}). This cannot be undone.`
                  : 'The listing is removed from CampusMart. This cannot be undone.'
              }
              confirmLabel="Delete listing"
              onCancel={() => setConfirm(null)}
              onConfirm={resolveConfirm}
            />
          )
        })()}

      {confirm?.kind === 'ban' &&
        (() => {
          const seller = users.find((user) => user.id === confirm.listing.sellerId)
          return (
            <ConfirmDialog
              open
              title={seller ? `Ban ${seller.name}?` : 'Ban seller?'}
              body="The account is blocked immediately — they can no longer list, buy or message on CampusMart. Existing listings stay visible until reviewed."
              confirmLabel="Ban seller"
              onCancel={() => setConfirm(null)}
              onConfirm={resolveConfirm}
            />
          )
        })()}
    </div>
  )
}
