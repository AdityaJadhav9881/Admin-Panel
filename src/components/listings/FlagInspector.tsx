import { useEffect } from 'react'
import type { Listing, User } from '../../data/mock'
import {
  LISTING_DELETE_TRUST_PENALTY,
  categoryLabel,
  formatTrustScore,
  priceDeviation,
  trustBand,
  trustPercent,
} from '../../data/mock'
import { formatMoney, initials } from '../../lib/format'
import { ArrowRightIcon, BanIcon, CheckIcon, CloseIcon, TrashIcon } from '../icons'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ListingThumb } from './ListingThumb'

interface FlagInspectorProps {
  listing: Listing | null
  seller: User | undefined
  fraudAgentEnabled: boolean
  onClose: () => void
  onApprove: (listing: Listing) => void
  onDelete: (listing: Listing) => void
  onBanSeller: (listing: Listing) => void
  onOpenSeller: (sellerId: string) => void
}

function deviationTone(deviation: number): 'success' | 'warning' | 'critical' {
  const magnitude = Math.abs(deviation)
  if (magnitude > 50) return 'critical'
  if (magnitude > 20) return 'warning'
  return 'success'
}

export function FlagInspector({
  listing,
  seller,
  fraudAgentEnabled,
  onClose,
  onApprove,
  onDelete,
  onBanSeller,
  onOpenSeller,
}: FlagInspectorProps) {
  useEffect(() => {
    if (!listing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Escape closes the top-most layer only — a confirm dialog wins over the drawer.
      const confirmOpen = document.querySelector('[data-confirm]')
      if (confirmOpen) return
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    const { body } = document
    const scrollY = window.scrollY
    const prevOverflow = body.style.overflow
    const prevPaddingRight = body.style.paddingRight
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      body.style.overflow = prevOverflow
      body.style.paddingRight = prevPaddingRight
      window.scrollTo(0, scrollY)
    }
  }, [listing, onClose])

  if (!listing) return null

  const deviation = priceDeviation(listing)
  const canApprove = listing.status === 'flagged' && listing.flag !== null
  const sellerBlocked = seller?.status === 'blocked'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inspector-title"
      className="fixed inset-0 z-[60]"
    >
      <div className="fade-in absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />

      <div className="drawer-enter absolute inset-y-0 right-0 flex w-full max-w-[470px] flex-col border-l border-line bg-surface shadow-[-24px_0_48px_-16px_rgba(16,24,40,0.25)]">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line px-5">
          <div className="min-w-0">
            <h2 id="inspector-title" className="text-[15px] leading-tight font-semibold text-ink">
              Listing inspector
            </h2>
            <p className="font-mono text-[12px] text-ink-faint">{listing.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close listing inspector"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
          >
            <CloseIcon size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Identity */}
          <section className="flex items-start gap-4">
            <ListingThumb listing={listing} size="lg" />
            <div className="min-w-0 flex-1">
              <h3 className="text-[15.5px] leading-snug font-semibold text-ink">{listing.title}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {listing.status === 'flagged' ? (
                  <Badge tone={listing.flag?.severity === 'high' ? 'critical' : 'warning'} withDot>
                    Flagged
                  </Badge>
                ) : listing.status === 'sold' ? (
                  <Badge tone="neutral" withDot>
                    Sold
                  </Badge>
                ) : (
                  <Badge tone="success" withDot>
                    Active
                  </Badge>
                )}
                <Badge tone="neutral">{categoryLabel[listing.category]}</Badge>
              </div>
              <p className="mt-2 text-[12.5px] text-ink-muted">Listed {listing.listed}</p>
            </div>
          </section>

          {/* Pricing */}
          <section>
            <p className="text-[10.5px] font-semibold tracking-[0.09em] text-ink-faint uppercase">
              Pricing check
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line bg-surface-2 p-3.5">
                <p className="text-[11.5px] text-ink-muted">Listed price</p>
                <p className="tabular mt-1 text-[20px] font-semibold text-ink">
                  {formatMoney(listing.price)}
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-2 p-3.5">
                <p className="text-[11.5px] text-ink-muted">AI suggested</p>
                <p className="tabular mt-1 text-[20px] font-semibold text-ink-muted">
                  {formatMoney(listing.aiPrice)}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[12.5px] text-ink-muted">Deviation from the AI estimate</p>
              <Badge tone={deviationTone(deviation)}>
                {deviation > 0 ? '+' : ''}
                {deviation}%
              </Badge>
            </div>
          </section>

          {/* Seller */}
          <section className="rounded-xl border border-line p-4">
            <p className="text-[10.5px] font-semibold tracking-[0.09em] text-ink-faint uppercase">
              Seller
            </p>
            {seller ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-[12.5px] font-semibold text-brand-strong">
                  {initials(seller.name)}
                </span>
                <div className="min-w-[160px] flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13.5px] font-medium text-ink">{seller.name}</p>
                    <Badge tone={seller.status === 'blocked' ? 'critical' : 'success'}>
                      {seller.status === 'blocked' ? 'Blocked' : 'Active'}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-2 whitespace-nowrap">
                    <span className="tabular text-[12.5px] text-ink-muted">
                      Trust {formatTrustScore(seller.trustScore)}
                    </span>
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
                      <span
                        className={`block h-full rounded-full ${
                          trustBand(seller.trustScore).tone === 'success'
                            ? 'bg-success'
                            : trustBand(seller.trustScore).tone === 'warning'
                              ? 'bg-warning'
                              : 'bg-critical'
                        }`}
                        style={{ width: `${trustPercent(seller.trustScore)}%` }}
                      />
                    </span>
                    <span className="text-[12px] text-ink-muted">
                      {trustBand(seller.trustScore).label}
                    </span>
                  </div>
                </div>
                <Button
                  className="h-8 px-3 text-[12.5px]"
                  onClick={() => onOpenSeller(listing.sellerId)}
                >
                  Open in Users
                  <ArrowRightIcon size={14} />
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-[13px] text-ink-muted">
                Unavailable — this seller no longer exists in the directory.
              </p>
            )}
          </section>

          {/* AI trust */}
          {listing.flag ? (
            <section
              className={`rounded-xl border p-4 ${
                listing.flag.severity === 'high'
                  ? 'border-critical/25 bg-critical-soft'
                  : 'border-warning/30 bg-warning-soft'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10.5px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
                  AI trust reason
                </p>
                <Badge tone={listing.flag.severity === 'high' ? 'critical' : 'warning'} withDot>
                  {listing.flag.severity === 'high' ? 'High severity' : 'Medium severity'}
                </Badge>
              </div>
              <p className="mt-2.5 text-[13.5px] leading-relaxed font-medium text-ink">
                {listing.flag.reason}
              </p>
              <p className="mt-2 text-[12px] text-ink-muted">Detected by {listing.flag.detectedBy}</p>
              {!fraudAgentEnabled && (
                <p className="mt-2 border-t border-critical/20 pt-2 text-[12px] font-medium text-critical">
                  Trust &amp; Fraud Detection Agent is paused — this flag may be stale.
                </p>
              )}
            </section>
          ) : (
            <section className="flex items-start gap-3 rounded-xl border border-line bg-success-soft p-4">
              <span className="mt-0.5 shrink-0 text-success">
                <CheckIcon size={16} />
              </span>
              <div>
                <p className="text-[13.5px] font-medium text-ink">No active trust flags</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">
                  The price sits within the AI-expected range and no policy keywords were detected.
                </p>
              </div>
            </section>
          )}

          {/* Record details */}
          <section>
            <p className="text-[10.5px] font-semibold tracking-[0.09em] text-ink-faint uppercase">
              Record
            </p>
            <dl className="mt-2.5 grid grid-cols-2 gap-x-6 gap-y-3.5">
              <Detail label="Listing ID" value={listing.id} mono />
              <Detail label="Category" value={categoryLabel[listing.category]} />
              <Detail
                label="Status"
                value={
                  listing.status === 'flagged' ? 'Flagged for review' : listing.status === 'sold' ? 'Sold' : 'Active'
                }
              />
              <Detail label="Listed on" value={listing.listed} />
            </dl>
          </section>
        </div>

        <footer className="shrink-0 space-y-2.5 border-t border-line bg-surface-2 p-4">
          <Button
            variant="primary"
            className="w-full justify-center"
            disabled={!canApprove}
            onClick={() => onApprove(listing)}
          >
            <CheckIcon size={15} />
            Approve listing
          </Button>
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              variant="danger-outline"
              className="justify-center"
              onClick={() => onDelete(listing)}
            >
              <TrashIcon size={15} />
              Delete
            </Button>
            <Button
              variant="danger-quiet"
              className="justify-center"
              disabled={sellerBlocked || !seller}
              onClick={() => onBanSeller(listing)}
            >
              <BanIcon size={15} />
              Ban seller
            </Button>
          </div>
          <p className="text-center text-[11.5px] text-ink-muted">
            {sellerBlocked || !seller
              ? 'Seller account is already blocked.'
              : `Deleting lowers the seller's trust score by ${LISTING_DELETE_TRUST_PENALTY} points.`}
          </p>
        </footer>
      </div>
    </div>
  )
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10.5px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
        {label}
      </dt>
      <dd className={`mt-1 text-[13px] text-ink ${mono ? 'font-mono' : 'font-medium'}`}>{value}</dd>
    </div>
  )
}
