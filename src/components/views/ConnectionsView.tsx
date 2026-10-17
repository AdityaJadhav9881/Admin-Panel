import { useMemo, useState } from 'react'
import type { AdminOrderUpdatePayload, ConnectionThread } from '../../api/client'
import { formatCollegeBadge, formatTrustScore } from '../../data/mock'
import { formatMoney, initials } from '../../lib/format'
import {
  AlertIcon,
  CheckIcon,
  CloseIcon,
  EditIcon,
  PhoneIcon,
  SearchIcon,
  ShieldIcon,
  TrashIcon,
} from '../icons'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { MetricCard } from '../ui/MetricCard'
import { Panel } from '../ui/Panel'
import type { ToastMessage } from '../ui/Toast'

interface ConnectionsViewProps {
  connections: ConnectionThread[]
  onToast: (text: string, tone: ToastMessage['tone']) => void
  onUpdateOrder?: (orderId: string, payload: AdminOrderUpdatePayload) => Promise<void> | void
  onDeleteChatMessage?: (messageId: string) => Promise<void> | void
  onSendInterventionNote?: (threadId: string, note: string) => Promise<void> | void
}

type ConnectionTab = 'all' | 'orders' | 'calls' | 'same_college' | 'cross_campus'

const TABS: Array<{ id: ConnectionTab; label: string }> = [
  { id: 'all', label: 'All Connections' },
  { id: 'orders', label: 'Order Handshakes (📦/💳)' },
  { id: 'calls', label: 'With Calls (📞)' },
  { id: 'same_college', label: 'Same Campus (🏫)' },
  { id: 'cross_campus', label: 'Cross-Campus (🌐)' },
]

interface OrderEditInlineFormProps {
  thread: ConnectionThread
  onSave: (orderId: string, payload: AdminOrderUpdatePayload) => Promise<void> | void
  onCancel: () => void
  onToast: (text: string, tone: ToastMessage['tone']) => void
}

function OrderEditInlineForm({ thread, onSave, onCancel, onToast }: OrderEditInlineFormProps) {
  const currentOrder = thread.order
  const [finalPrice, setFinalPrice] = useState(String(currentOrder?.final_price ?? thread.product.price))
  const [deliveryAddress, setDeliveryAddress] = useState(currentOrder?.delivery_address ?? 'Campus Central Library Lawn')
  const [contactPhone, setContactPhone] = useState(currentOrder?.contact_phone ?? '+91 98221 04928')
  const [paymentMethod, setPaymentMethod] = useState<'cash_on_meetup' | 'gpay_upi'>(
    (currentOrder?.payment_method as 'cash_on_meetup' | 'gpay_upi') ?? (thread.payment_method ?? 'cash_on_meetup'),
  )
  const [orderStatus, setOrderStatus] = useState(currentOrder?.order_status ?? 'Confirmed')
  const [saving, setSaving] = useState(false)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const parsedPrice = Number(finalPrice)
    const payload: AdminOrderUpdatePayload = {
      final_price: isNaN(parsedPrice) ? thread.product.price : parsedPrice,
      delivery_address: deliveryAddress.trim(),
      contact_phone: contactPhone.trim(),
      payment_method: paymentMethod,
      order_status: orderStatus,
    }

    try {
      await onSave(currentOrder?.id ?? thread.id, payload)
      onToast('Order details updated successfully.', 'success')
      onCancel()
    } catch {
      onToast('Failed to update order.', 'critical')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="mt-3 space-y-3 rounded-xl border border-brand/30 bg-surface-2/60 p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-brand-strong">Edit Order Handshake Details</span>
        <button type="button" onClick={onCancel} className="text-[11.5px] text-ink-muted hover:text-ink cursor-pointer">
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[11px] text-ink-muted">Final Price (₹)</label>
          <input
            type="number"
            min="0"
            required
            value={finalPrice}
            onChange={(e) => setFinalPrice(e.target.value)}
            className="mt-0.5 h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[12.5px] text-ink font-semibold"
          />
        </div>
        <div>
          <label className="block text-[11px] text-ink-muted">Order Status</label>
          <select
            value={orderStatus}
            onChange={(e) => setOrderStatus(e.target.value)}
            className="mt-0.5 h-8 w-full rounded-md border border-line bg-surface px-2 text-[12px] text-ink"
          >
            <option value="Confirmed">Confirmed</option>
            <option value="Pending Meetup">Pending Meetup</option>
            <option value="Completed / Handover Done">Completed / Handover Done</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[11px] text-ink-muted">Delivery / Meetup Spot</label>
          <input
            type="text"
            required
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
            className="mt-0.5 h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink"
          />
        </div>
        <div>
          <label className="block text-[11px] text-ink-muted">Buyer Phone</label>
          <input
            type="text"
            required
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className="mt-0.5 h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink font-mono"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] text-ink-muted">Payment Method</label>
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as 'cash_on_meetup' | 'gpay_upi')}
          className="mt-0.5 h-8 w-full rounded-md border border-line bg-surface px-2 text-[12px] text-ink"
        >
          <option value="cash_on_meetup">Cash on Meetup</option>
          <option value="gpay_upi">GPay / UPI Handshake</option>
        </select>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" className="h-7.5 px-3 text-[11.5px]" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" className="h-7.5 px-3 text-[11.5px]" disabled={saving}>
          {saving ? 'Saving…' : 'Save Order'}
        </Button>
      </div>
    </form>
  )
}

export function ConnectionsView({
  connections,
  onToast,
  onUpdateOrder,
  onDeleteChatMessage,
  onSendInterventionNote,
}: ConnectionsViewProps) {
  const [activeTab, setActiveTab] = useState<ConnectionTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [collegeFilter, setCollegeFilter] = useState<string>('all')
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [flaggedThreads, setFlaggedThreads] = useState<Record<string, boolean>>({})
  const [isEditingOrder, setIsEditingOrder] = useState(false)
  const [adminNoteText, setAdminNoteText] = useState('')
  const [sendingNote, setSendingNote] = useState(false)

  // Network Metrics
  const totalPairs = connections.length
  const sameCollegeCount = connections.filter(
    (c) => c.buyer.college_name === c.seller.college_name,
  ).length
  const crossCampusCount = connections.filter(
    (c) => c.buyer.college_name !== c.seller.college_name,
  ).length
  const activeOrdersCount = connections.filter((c) => c.has_order).length
  const totalCallsCount = connections.reduce((sum, c) => sum + c.call_count, 0)

  // College dropdown options
  const collegeOptions = useMemo(() => {
    const set = new Set<string>()
    for (const c of connections) {
      if (c.buyer.college_name) set.add(c.buyer.college_name)
      if (c.seller.college_name) set.add(c.seller.college_name)
    }
    return Array.from(set).sort()
  }, [connections])

  // Filtering
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const visible = useMemo(() => {
    return connections.filter((thread) => {
      // Tab filter
      if (activeTab === 'orders' && !thread.has_order) return false
      if (activeTab === 'calls' && thread.call_count === 0) return false
      if (activeTab === 'same_college' && thread.buyer.college_name !== thread.seller.college_name)
        return false
      if (activeTab === 'cross_campus' && thread.buyer.college_name === thread.seller.college_name)
        return false

      // College filter
      if (collegeFilter !== 'all') {
        const matchesCollege =
          thread.buyer.college_name === collegeFilter ||
          thread.seller.college_name === collegeFilter
        if (!matchesCollege) return false
      }

      // Search Query
      if (normalizedQuery) {
        const buyerName = thread.buyer.name.toLowerCase()
        const buyerEmail = thread.buyer.email.toLowerCase()
        const sellerName = thread.seller.name.toLowerCase()
        const sellerEmail = thread.seller.email.toLowerCase()
        const title = thread.product.title.toLowerCase()
        const buyerCollege = (thread.buyer.college_name || '').toLowerCase()
        const sellerCollege = (thread.seller.college_name || '').toLowerCase()

        if (
          !buyerName.includes(normalizedQuery) &&
          !buyerEmail.includes(normalizedQuery) &&
          !sellerName.includes(normalizedQuery) &&
          !sellerEmail.includes(normalizedQuery) &&
          !title.includes(normalizedQuery) &&
          !buyerCollege.includes(normalizedQuery) &&
          !sellerCollege.includes(normalizedQuery)
        ) {
          return false
        }
      }

      return true
    })
  }, [connections, activeTab, collegeFilter, normalizedQuery])

  const selectedThread = connections.find((c) => c.id === selectedThreadId) ?? null

  const toggleFlagThread = (threadId: string) => {
    const isNowFlagged = !flaggedThreads[threadId]
    setFlaggedThreads((prev) => ({ ...prev, [threadId]: isNowFlagged }))
    if (isNowFlagged) {
      onToast(`Conversation ${threadId} flagged for compliance review.`, 'warning')
    } else {
      onToast(`Flag removed from conversation ${threadId}.`, 'success')
    }
  }

  const handleSendIntervention = async () => {
    if (!adminNoteText.trim() || !selectedThread) return
    setSendingNote(true)
    try {
      if (onSendInterventionNote) {
        await onSendInterventionNote(selectedThread.id, adminNoteText.trim())
      }
      setAdminNoteText('')
      onToast('Official Admin note posted to this conversation.', 'success')
    } catch {
      onToast('Failed to send admin note.', 'critical')
    } finally {
      setSendingNote(false)
    }
  }

  return (
    <div className="view-enter space-y-6">
      {/* PART A: TOP NETWORK METRICS BAR */}
      <section aria-label="Network metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Active Buyer–Seller Pairs"
          value={totalPairs.toLocaleString('en-US')}
          icon={<span className="text-brand">👥</span>}
          footnote="Live connected student pairs in negotiation"
        />
        <MetricCard
          label="Campus Distribution"
          value={`${sameCollegeCount} Same · ${crossCampusCount} Cross`}
          icon={<span className="text-brand">🏫</span>}
          footnote="Local hostel trades vs inter-campus connections"
        />
        <MetricCard
          label="Active Order Handshakes"
          value={activeOrdersCount.toLocaleString('en-US')}
          icon={<span className="text-success">📦</span>}
          context={`${activeOrdersCount} checkout handshakes placed`}
          contextTone="success"
        />
        <MetricCard
          label="Calls Logged"
          value={totalCallsCount.toLocaleString('en-US')}
          icon={<PhoneIcon size={17} />}
          footnote="Voice/video meetup consultations recorded"
        />
      </section>

      {/* PART B: INTERACTIVE CONNECTION MATRIX ("WHO IS IN TOUCH WITH WHOM") */}
      <Panel
        title="Student Communications & Network Intelligence"
        caption="Audit student buyer–seller links, ongoing negotiations, call logs, and order handshakes across campuses."
        action={
          <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto sm:justify-end">
            {/* College Dropdown Filter */}
            <select
              value={collegeFilter}
              onChange={(e) => setCollegeFilter(e.target.value)}
              className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink transition-colors hover:border-line-strong focus:border-brand focus:outline-none"
              aria-label="Filter by campus"
            >
              <option value="all">🎓 All Campuses</option>
              {collegeOptions.map((cName) => (
                <option key={cName} value={cName}>
                  {cName}
                </option>
              ))}
            </select>

            {/* Search Input */}
            <div className="relative">
              <SearchIcon
                size={16}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
              />
              <input
                type="search"
                data-search-input="true"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search buyer, seller, item…"
                aria-label="Search connections by student or product"
                className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-[13px] text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-brand sm:w-60"
              />
            </div>
          </div>
        }
      >
        {/* TABS ROW */}
        <div className="flex flex-wrap gap-1.5 border-b border-line px-5 py-3">
          {TABS.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  active
                    ? 'bg-brand text-white shadow-sm'
                    : 'bg-surface text-ink-muted hover:bg-surface-2 hover:text-ink border border-line'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {visible.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-subtle text-ink-faint">
              <SearchIcon size={20} />
            </span>
            <p className="mt-3.5 text-[14px] font-semibold text-ink">No connection threads found</p>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-muted">
              {normalizedQuery || collegeFilter !== 'all'
                ? 'Nothing matches your current search criteria or campus filter.'
                : 'No conversations currently active in this category.'}
            </p>
            <Button
              className="mt-4"
              onClick={() => {
                setSearchQuery('')
                setCollegeFilter('all')
                setActiveTab('all')
              }}
            >
              Reset Filters
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {visible.map((thread) => {
              const isSameCollege = thread.buyer.college_name === thread.seller.college_name
              const isFlagged = Boolean(flaggedThreads[thread.id])

              return (
                <div
                  key={thread.id}
                  className={`flex flex-col gap-3 p-4 transition-colors hover:bg-surface-2/60 lg:flex-row lg:items-center lg:justify-between ${
                    isFlagged ? 'bg-critical-soft/20' : ''
                  }`}
                >
                  {/* BUYER <--> PRODUCT <--> SELLER LINKAGE */}
                  <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                    {/* Buyer Block */}
                    <div className="min-w-0 sm:w-52 lg:w-56">
                      <div className="flex items-center gap-2">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft font-mono text-[11px] font-bold text-brand-strong">
                          {initials(thread.buyer.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-ink">
                            {thread.buyer.name}
                          </p>
                          <p className="text-[10px] font-medium text-ink-faint uppercase">Buyer</p>
                        </div>
                      </div>
                      <div className="mt-1">
                        <span className="inline-block truncate rounded-md bg-subtle px-1.5 py-0.5 text-[10.5px] font-medium text-ink-muted max-w-full">
                          {formatCollegeBadge(thread.buyer.college_name, thread.buyer.college_code)}
                        </span>
                      </div>
                    </div>

                    {/* Arrow / Product Center */}
                    <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/40 px-3 py-2 min-w-0 sm:flex-1">
                      <span className="text-[13px] font-bold text-brand">➔</span>
                      {thread.product.image_url ? (
                        <img
                          src={thread.product.image_url}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-md object-cover border border-line"
                        />
                      ) : (
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-subtle text-[14px]">
                          📦
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium text-ink">
                          {thread.product.title}
                        </p>
                        <p className="font-mono text-[12px] font-semibold text-brand">
                          {formatMoney(thread.product.price)}
                        </p>
                      </div>
                      <span className="text-[13px] font-bold text-brand">➔</span>
                    </div>

                    {/* Seller Block */}
                    <div className="min-w-0 sm:w-52 lg:w-56 text-left sm:text-right">
                      <div className="flex items-center gap-2 sm:flex-row-reverse">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-success-soft font-mono text-[11px] font-bold text-success">
                          {initials(thread.seller.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-ink">
                            {thread.seller.name}
                          </p>
                          <p className="text-[10px] font-medium text-ink-faint uppercase">Seller</p>
                        </div>
                      </div>
                      <div className="mt-1 sm:text-right">
                        <span className="inline-block truncate rounded-md bg-subtle px-1.5 py-0.5 text-[10.5px] font-medium text-ink-muted max-w-full">
                          {formatCollegeBadge(thread.seller.college_name, thread.seller.college_code)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* BADGES & ACTIONS */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2 lg:border-t-0 lg:pt-0 lg:justify-end">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Campus Relation Pill */}
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          isSameCollege
                            ? 'bg-success-soft text-success border border-success/20'
                            : 'bg-brand-soft text-brand-strong border border-brand/20'
                        }`}
                      >
                        {isSameCollege ? '🏫 Same Campus' : '🌐 Cross-Campus'}
                      </span>

                      {/* Messages Count Badge */}
                      <span className="rounded-md bg-subtle px-2 py-0.5 font-mono text-[11px] text-ink-muted">
                        💬 {thread.message_count} msgs
                      </span>

                      {/* Calls Count Badge */}
                      {thread.call_count > 0 && (
                        <span className="rounded-md bg-warning-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-warning">
                          📞 {thread.call_count} call{thread.call_count === 1 ? '' : 's'}
                        </span>
                      )}

                      {/* Order Handshake Badge */}
                      {thread.has_order && (
                        <span className="rounded-md bg-success-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-success">
                          {thread.payment_method === 'cash_on_meetup' ? '💵 Cash' : '💳 GPay'}
                        </span>
                      )}

                      {/* Flagged Badge */}
                      {isFlagged && (
                        <span className="rounded-md bg-critical-soft px-2 py-0.5 text-[11px] font-semibold text-critical">
                          ⚠ Flagged
                        </span>
                      )}
                    </div>

                    <Button
                      variant="primary"
                      className="h-8 px-3 text-[12px]"
                      onClick={() => setSelectedThreadId(thread.id)}
                    >
                      Inspect Chat &amp; Handshake
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2 px-5 py-3 text-[12px] text-ink-muted">
          <span>
            Showing {visible.length} of {connections.length} live buyer–seller links
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldIcon size={14} className="text-brand" />
            Audit trail active for campus safety and fraud protection
          </span>
        </div>
      </Panel>

      {/* PART C: LIVE CONVERSATION & ORDER INSPECTOR DRAWER (RIGHT SLIDE-OVER) */}
      {selectedThread && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-ink/40 backdrop-blur-xs flex justify-end">
          <div
            className="fixed inset-0"
            onClick={() => setSelectedThreadId(null)}
            aria-hidden="true"
          />

          <aside className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-line bg-surface shadow-2xl transition-all duration-300">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] font-bold text-brand">
                    {selectedThread.id}
                  </span>
                  <Badge tone={selectedThread.has_order ? 'success' : 'neutral'} withDot>
                    {selectedThread.has_order ? 'Order Placed' : 'Active Negotiation'}
                  </Badge>
                </div>
                <h3 className="truncate text-[15px] font-semibold text-ink mt-0.5">
                  Transcript: {selectedThread.buyer.name} ➔ {selectedThread.seller.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedThreadId(null)}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-2 hover:text-ink"
                aria-label="Close inspector"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            {/* Drawer Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Both Students Side-by-Side Profiles */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Buyer Card */}
                <div className="rounded-xl border border-line bg-surface-2/40 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold tracking-wider text-ink-faint uppercase">
                      Buyer Profile
                    </span>
                    <Badge tone="brand">★ {formatTrustScore(selectedThread.buyer.trust_score)} / 5</Badge>
                  </div>
                  <div>
                    <p className="text-[13.5px] font-semibold text-ink">
                      {selectedThread.buyer.name}
                    </p>
                    <a
                      href={`mailto:${selectedThread.buyer.email}`}
                      className="text-[12px] text-ink-muted hover:text-brand hover:underline"
                    >
                      {selectedThread.buyer.email}
                    </a>
                  </div>
                  <div className="pt-1">
                    <span className="inline-block rounded-md border border-brand/20 bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-strong">
                      {formatCollegeBadge(
                        selectedThread.buyer.college_name,
                        selectedThread.buyer.college_code,
                      )}
                    </span>
                  </div>
                </div>

                {/* Seller Card */}
                <div className="rounded-xl border border-line bg-surface-2/40 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold tracking-wider text-ink-faint uppercase">
                      Seller Profile
                    </span>
                    <Badge tone="success">★ {formatTrustScore(selectedThread.seller.trust_score)} / 5</Badge>
                  </div>
                  <div>
                    <p className="text-[13.5px] font-semibold text-ink">
                      {selectedThread.seller.name}
                    </p>
                    <a
                      href={`mailto:${selectedThread.seller.email}`}
                      className="text-[12px] text-ink-muted hover:text-brand hover:underline"
                    >
                      {selectedThread.seller.email}
                    </a>
                  </div>
                  <div className="pt-1">
                    <span className="inline-block rounded-md border border-brand/20 bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-strong">
                      {formatCollegeBadge(
                        selectedThread.seller.college_name,
                        selectedThread.seller.college_code,
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Linked Product & Handshake Info */}
              <div className="rounded-xl border border-line bg-surface p-4">
                <div className="flex items-center gap-3">
                  {selectedThread.product.image_url ? (
                    <img
                      src={selectedThread.product.image_url}
                      alt=""
                      className="h-14 w-14 rounded-lg object-cover border border-line shrink-0"
                    />
                  ) : (
                    <div className="grid h-14 w-14 place-items-center rounded-lg bg-subtle text-[22px] shrink-0">
                      📦
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-[10.5px] font-bold text-ink-faint uppercase">
                      Associated Marketplace Listing
                    </span>
                    <h4 className="text-[14px] font-semibold text-ink truncate">
                      {selectedThread.product.title}
                    </h4>
                    <p className="font-mono text-[14px] font-bold text-brand">
                      {formatMoney(selectedThread.product.price)}
                    </p>
                  </div>
                  {selectedThread.has_order && (
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1.5 justify-end">
                        <span className="inline-flex items-center gap-1 rounded-md bg-success-soft px-2.5 py-1 text-[11.5px] font-bold text-success border border-success/30">
                          <CheckIcon size={14} />
                          {selectedThread.order?.order_status || 'Order Confirmed'}
                        </span>
                        <Button
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => setIsEditingOrder(!isEditingOrder)}
                        >
                          <EditIcon size={12} />
                          {isEditingOrder ? 'Close' : 'Edit Order'}
                        </Button>
                      </div>
                      <p className="mt-1 text-[11px] text-ink-muted capitalize">
                        {selectedThread.order?.payment_method?.replace(/_/g, ' ') || selectedThread.payment_method?.replace(/_/g, ' ') || 'Meetup'} · {selectedThread.order?.delivery_address || 'Central Campus'}
                      </p>
                    </div>
                  )}
                </div>

                {isEditingOrder && (
                  <OrderEditInlineForm
                    thread={selectedThread}
                    onSave={onUpdateOrder ?? (() => {})}
                    onCancel={() => setIsEditingOrder(false)}
                    onToast={onToast}
                  />
                )}
              </div>

              {/* Chronological Chat Messages & Handshake Stream */}
              <div className="space-y-3">
                <p className="text-[11px] font-bold tracking-wider text-ink-faint uppercase">
                  Chronological Chat History &amp; Handshake Logs
                </p>

                <div className="space-y-2.5 rounded-xl border border-line bg-surface-2/40 p-4">
                  {selectedThread.messages.map((msg) => {
                    const isBuyer = msg.sender_id === selectedThread.buyer.id

                    if (msg.is_admin_note) {
                      return (
                        <div
                          key={msg.id}
                          className="my-3 rounded-xl border border-brand/40 bg-brand-soft/40 p-3.5 shadow-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 font-bold text-[12px] text-brand-strong">
                              <ShieldIcon size={14} />
                              Official CampusMart Moderation Note
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteChatMessage?.(msg.id)
                                onToast('Admin note removed.', 'neutral')
                              }}
                              title="Delete notice"
                              className="text-ink-faint hover:text-critical p-0.5 transition-colors cursor-pointer"
                            >
                              <TrashIcon size={13} />
                            </button>
                          </div>
                          <p className="mt-1.5 text-[13px] leading-relaxed text-ink font-medium">
                            {msg.message}
                          </p>
                          <span className="mt-1 block text-[10.5px] text-ink-faint">{msg.created_at}</span>
                        </div>
                      )
                    }

                    if (msg.is_order_card) {
                      return (
                        <div
                          key={msg.id}
                          className="my-3 rounded-lg border border-success/30 bg-success-soft/30 p-3.5 text-center shadow-xs"
                        >
                          <span className="inline-block rounded-full bg-success text-white p-1 mb-1">
                            <CheckIcon size={14} />
                          </span>
                          <p className="font-mono text-[12.5px] font-bold text-success">
                            {msg.message}
                          </p>
                          <span className="text-[10.5px] text-ink-faint mt-1 block">
                            {msg.created_at} · Verified Handshake Log
                          </span>
                        </div>
                      )
                    }

                    if (msg.is_call_log) {
                      return (
                        <div
                          key={msg.id}
                          className="my-2.5 flex items-center justify-center gap-2 rounded-lg border border-warning/30 bg-warning-soft/20 py-2 px-3 text-[12px] text-warning"
                        >
                          <PhoneIcon size={14} />
                          <span className="font-medium">{msg.message}</span>
                          <span className="text-[10.5px] text-ink-faint">({msg.created_at})</span>
                        </div>
                      )
                    }

                    return (
                      <div
                        key={msg.id}
                        className={`group flex flex-col ${isBuyer ? 'items-start' : 'items-end'}`}
                      >
                        <div className="flex items-center gap-1.5 text-[11px] text-ink-faint mb-0.5">
                          <span className="font-semibold text-ink-muted">{msg.sender_name}</span>
                          <span>·</span>
                          <span>{msg.created_at}</span>
                          <button
                            type="button"
                            title="Delete inappropriate message"
                            onClick={() => {
                              onDeleteChatMessage?.(msg.id)
                              onToast('Message deleted by admin.', 'neutral')
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-ink-faint hover:text-critical p-0.5 cursor-pointer ml-1"
                          >
                            <TrashIcon size={11} />
                          </button>
                        </div>
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                            isBuyer
                              ? 'rounded-tl-none bg-surface border border-line text-ink'
                              : 'rounded-tr-none bg-brand text-white shadow-xs'
                          }`}
                        >
                          {msg.message}
                          {msg.image_url && (
                            <img
                              src={msg.image_url}
                              alt="Attachment"
                              className="mt-2 rounded-lg max-h-48 object-cover border border-white/20"
                            />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Official Admin Intervention Note Box */}
              <div className="rounded-xl border border-brand/30 bg-surface-2/70 p-3.5 space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-[12px] text-ink">
                  <ShieldIcon size={14} className="text-brand-strong" />
                  Post Official Admin Intervention Note
                </div>
                <p className="text-[11.5px] text-ink-muted">
                  Inject an official moderation warning or meetup notice visible to both students.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={adminNoteText}
                    onChange={(e) => setAdminNoteText(e.target.value)}
                    placeholder="e.g. Please verify item in daylight before completing handover…"
                    className="h-8.5 flex-1 rounded-lg border border-line bg-surface px-3 text-[12px] text-ink focus:border-brand focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && adminNoteText.trim()) {
                        handleSendIntervention()
                      }
                    }}
                  />
                  <Button
                    variant="primary"
                    className="h-8.5 px-3 text-[12px] whitespace-nowrap"
                    disabled={!adminNoteText.trim() || sendingNote}
                    onClick={handleSendIntervention}
                  >
                    <ShieldIcon size={13} />
                    {sendingNote ? 'Sending…' : 'Send Note'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2 px-5 py-4">
              <div className="flex items-center gap-2">
                <Button
                  variant={flaggedThreads[selectedThread.id] ? 'danger-solid' : 'danger-outline'}
                  className="h-8 text-[12px]"
                  onClick={() => toggleFlagThread(selectedThread.id)}
                >
                  <AlertIcon size={14} />
                  {flaggedThreads[selectedThread.id] ? 'Flagged for Review' : 'Flag Conversation'}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`mailto:${selectedThread.buyer.email}?subject=CampusMart%20Moderation%20Inquiry%20#${selectedThread.id}`}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-line bg-surface px-3 text-[12px] font-medium text-ink hover:bg-surface-2"
                >
                  Email Buyer
                </a>
                <a
                  href={`mailto:${selectedThread.seller.email}?subject=CampusMart%20Moderation%20Inquiry%20#${selectedThread.id}`}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-line bg-surface px-3 text-[12px] font-medium text-ink hover:bg-surface-2"
                >
                  Email Seller
                </a>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
