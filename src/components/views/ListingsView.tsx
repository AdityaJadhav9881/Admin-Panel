import { useState } from 'react'
import type { Listing, User } from '../../data/mock'
import { LISTING_DELETE_TRUST_PENALTY, categoryLabel, priceDeviation } from '../../data/mock'
import { formatMoney, initials } from '../../lib/format'
import { FlagInspector } from '../listings/FlagInspector'
import { ListingThumb } from '../listings/ListingThumb'
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
}

const TABS: { id: ListingFilter; label: string }[] = [
  { id: 'all', label: 'All listings' },
  { id: 'flagged', label: 'Flagged by AI' },
  { id: 'active', label: 'Active' },
  { id: 'sold', label: 'Sold' },
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
}: ListingsViewProps) {
  const [filter, setFilter] = useState<ListingFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'ban'; listing: Listing } | null>(null)

  const counts = {
    all: listings.length,
    flagged: listings.filter((l) => l.status === 'flagged').length,
    active: listings.filter((l) => l.status === 'active').length,
    sold: listings.filter((l) => l.status === 'sold').length,
  }

  const visible = listings.filter((listing) => {
    if (filter === 'all') return true
    if (filter === 'flagged') return listing.status === 'flagged'
    return listing.status === filter
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

  return (
    <div className="view-enter space-y-6">
      <Panel
        title="Listing moderation"
        caption="Every listing is scored by the AI agents; flagged items open in the inspector with the trust reason."
        action={
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
                    <span className="tabular ml-1.5 text-[12px] opacity-70">{counts[tab.id]}</span>
                  )}
                </button>
              )
            })}
          </div>
        }
      >
        {visible.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-[14px] font-semibold text-ink">No listings in this view</p>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-muted">
              {filter === 'flagged'
                ? 'No listing currently carries an AI trust flag. New flags appear here as agents scan the marketplace.'
                : 'Nothing has this status right now.'}
            </p>
            <Button className="mt-4" onClick={() => setFilter('all')}>
              Show all listings
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
                    <Button
                      className="mt-3.5 w-full justify-center"
                      onClick={() => setSelectedId(listing.id)}
                    >
                      Inspect listing
                    </Button>
                  </li>
                )
              })}
            </ul>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[920px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    {['Listing', 'Seller', 'Category', 'Listed price', 'AI price', 'Trust flag', ''].map(
                      (heading, index) => (
                        <th
                          key={heading || `col-${index}`}
                          scope="col"
                          className={`px-5 py-3 text-[10.5px] font-semibold tracking-[0.09em] text-ink-faint uppercase ${
                            index === 6 ? 'text-right' : ''
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
                                Trust {seller?.trustScore ?? '—'}
                                {seller?.status === 'blocked' && (
                                  <span className="text-critical"> · Blocked</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-[13px] text-ink-muted">
                          {categoryLabel[listing.category]}
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
                          <div className="flex justify-end">
                            <Button
                              className="h-8 px-3 text-[12.5px]"
                              aria-label={`Inspect ${listing.title}`}
                              onClick={() => setSelectedId(listing.id)}
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
        onClose={() => setSelectedId(null)}
        onApprove={(listing) => {
          onApprove(listing)
          setSelectedId(null)
        }}
        onDelete={(listing) => setConfirm({ kind: 'delete', listing })}
        onBanSeller={(listing) => setConfirm({ kind: 'ban', listing })}
        onOpenSeller={onOpenSeller}
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
                  ? `The listing is removed from CampusMart. ${seller.name} loses ${LISTING_DELETE_TRUST_PENALTY} points of trust score (${seller.trustScore} → ${after}). This cannot be undone.`
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
