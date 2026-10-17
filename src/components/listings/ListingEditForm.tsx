import { useState } from 'react'
import type { AdminListingUpdatePayload } from '../../api/client'
import type { Listing, ListingCategory, ListingStatus, User } from '../../data/mock'
import { MAHARASHTRA_COLLEGES, categoryLabel } from '../../data/mock'
import { CheckIcon, TrashIcon } from '../icons'
import { Button } from '../ui/Button'

interface ListingEditFormProps {
  listing: Listing
  seller?: User
  allUsers?: User[]
  onSave: (listingId: string, payload: AdminListingUpdatePayload) => Promise<void> | void
  onCancel: () => void
  onDelete: (listing: Listing) => void
}

const CATEGORIES: ListingCategory[] = [
  'textbooks',
  'electronics',
  'furniture',
  'transport',
  'supplies',
  'other',
]

const CONDITIONS = ['New', 'Like New', 'Good', 'Fair']

const STATUSES: { id: ListingStatus; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'flagged', label: 'Flagged' },
  { id: 'reserved', label: 'Reserved' },
  { id: 'sold', label: 'Sold' },
]

export function ListingEditForm({
  listing,
  seller,
  allUsers = [],
  onSave,
  onCancel,
  onDelete,
}: ListingEditFormProps) {
  const [title, setTitle] = useState(listing.title)
  const [description, setDescription] = useState(listing.description ?? '')
  const [category, setCategory] = useState<ListingCategory>(listing.category)
  const [condition, setCondition] = useState(listing.condition ?? 'Good')
  const [price, setPrice] = useState(String(listing.price))
  const [aiPrice, setAiPrice] = useState(String(listing.aiPrice))
  const [status, setStatus] = useState<ListingStatus>(listing.status)
  const [sellerId, setSellerId] = useState(listing.sellerId)

  // College selector
  const initialCollegeMatched = MAHARASHTRA_COLLEGES.find(
    (c) =>
      c.name.toLowerCase() === (listing.collegeName ?? '').toLowerCase() ||
      c.code === listing.collegeCode,
  )
  const [selectedCollegePreset, setSelectedCollegePreset] = useState<string>(
    initialCollegeMatched ? `${initialCollegeMatched.name}|${initialCollegeMatched.code}` : 'custom',
  )
  const [customCollegeName, setCustomCollegeName] = useState(
    listing.collegeName ?? 'Government College of Engineering, Karad',
  )
  const [customCollegeCode, setCustomCollegeCode] = useState(listing.collegeCode ?? '6004')

  // AI enrichment fields
  const [aiTags, setAiTags] = useState(listing.aiTags ?? '')
  const [aiConditionNotes, setAiConditionNotes] = useState(listing.aiConditionNotes ?? '')

  const [saving, setSaving] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleCollegePresetChange = (value: string) => {
    setSelectedCollegePreset(value)
    if (value !== 'custom') {
      const [name, code] = value.split('|')
      setCustomCollegeName(name)
      setCustomCollegeCode(code)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSaving(true)

    const parsedPrice = Number(price)
    const parsedAiPrice = Number(aiPrice)

    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setErrorMsg('Please enter a valid listed price (₹).')
      setSaving(false)
      return
    }

    const tagsArray = aiTags
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean)

    const payload: AdminListingUpdatePayload = {
      title: title.trim(),
      description: description.trim(),
      category,
      condition,
      listed_price: parsedPrice,
      suggested_price: isNaN(parsedAiPrice) ? parsedPrice : parsedAiPrice,
      college_name: customCollegeName.trim(),
      college_code: customCollegeCode.trim(),
      status,
      is_flagged: status === 'flagged',
      ai_tags: tagsArray,
      ai_condition_notes: aiConditionNotes.trim(),
      seller_id: sellerId,
    }

    try {
      await onSave(listing.id, payload)
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 2500)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update listing')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {/* Banner */}
        <div className="rounded-xl border border-brand/20 bg-brand-soft/40 p-3.5 text-[12.5px] text-brand-strong">
          <p className="font-semibold">⚡ Admin God-Mode Listing Editor</p>
          <p className="mt-0.5 text-ink-muted">
            Directly override product details, pricing, campus association, and AI condition analysis. Changes sync immediately.
          </p>
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-critical/30 bg-critical-soft p-3 text-[12.5px] font-medium text-critical">
            {errorMsg}
          </div>
        )}

        {savedSuccess && (
          <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success-soft p-3 text-[12.5px] font-medium text-success">
            <CheckIcon size={16} />
            Listing details saved and published successfully!
          </div>
        )}

        {/* Title */}
        <div>
          <label htmlFor="listing-title" className="block text-[12px] font-medium text-ink-muted">
            Product Title
          </label>
          <input
            id="listing-title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink focus:border-brand focus:outline-none"
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="listing-desc" className="block text-[12px] font-medium text-ink-muted">
            Description
          </label>
          <textarea
            id="listing-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Seller's item description, condition details, inclusions…"
            className="mt-1 w-full rounded-lg border border-line bg-surface p-2.5 text-[12.5px] text-ink focus:border-brand focus:outline-none resize-none"
          />
        </div>

        {/* Pricing Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="listing-price" className="block text-[12px] font-medium text-ink-muted">
              Listed Price (₹)
            </label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-faint">
                ₹
              </span>
              <input
                id="listing-price"
                type="number"
                min="0"
                step="1"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-7 text-[13px] font-medium text-ink focus:border-brand focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label htmlFor="listing-aiprice" className="block text-[12px] font-medium text-ink-muted">
              AI Fair Value (₹)
            </label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-faint">
                ₹
              </span>
              <input
                id="listing-aiprice"
                type="number"
                min="0"
                step="1"
                value={aiPrice}
                onChange={(e) => setAiPrice(e.target.value)}
                className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-7 text-[13px] text-ink-muted focus:border-brand focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Category & Condition */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="listing-category" className="block text-[12px] font-medium text-ink-muted">
              Category
            </label>
            <select
              id="listing-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ListingCategory)}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink focus:border-brand focus:outline-none"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {categoryLabel[cat]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="listing-condition" className="block text-[12px] font-medium text-ink-muted">
              Condition Grade
            </label>
            <select
              id="listing-condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink focus:border-brand focus:outline-none"
            >
              {CONDITIONS.map((cond) => (
                <option key={cond} value={cond}>
                  {cond}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Campus / Institute Picker */}
        <div className="rounded-xl border border-line bg-surface-2/60 p-3.5 space-y-3">
          <label htmlFor="listing-college" className="block text-[12px] font-semibold text-ink">
            Campus / Institute Association
          </label>
          <select
            id="listing-college"
            value={selectedCollegePreset}
            onChange={(e) => handleCollegePresetChange(e.target.value)}
            className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink focus:border-brand focus:outline-none"
          >
            {MAHARASHTRA_COLLEGES.map((c) => (
              <option key={c.code} value={`${c.name}|${c.code}`}>
                {c.code} — {c.name}
              </option>
            ))}
            <option value="custom">⚙️ Custom / Other Institute Override…</option>
          </select>

          {selectedCollegePreset === 'custom' && (
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <div className="col-span-2">
                <label className="block text-[11px] text-ink-faint">Institute Name</label>
                <input
                  type="text"
                  value={customCollegeName}
                  onChange={(e) => setCustomCollegeName(e.target.value)}
                  placeholder="e.g. COEP Technological University"
                  className="mt-0.5 h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink focus:border-brand focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-ink-faint">CET Code</label>
                <input
                  type="text"
                  value={customCollegeCode}
                  onChange={(e) => setCustomCollegeCode(e.target.value)}
                  placeholder="e.g. 6006"
                  className="mt-0.5 h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink focus:border-brand focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Status */}
        <div>
          <label className="block text-[12px] font-medium text-ink-muted mb-1.5">
            Listing Status
          </label>
          <div className="grid grid-cols-4 gap-2">
            {STATUSES.map((st) => {
              const active = status === st.id
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatus(st.id)}
                  className={`h-8.5 rounded-lg border text-[12px] font-medium transition-colors ${
                    active
                      ? st.id === 'flagged'
                        ? 'border-critical bg-critical text-white'
                        : st.id === 'active'
                          ? 'border-success bg-success text-white'
                          : 'border-brand bg-brand text-white'
                      : 'border-line bg-surface text-ink-muted hover:text-ink'
                  }`}
                >
                  {st.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Seller Reassignment */}
        {allUsers.length > 0 && (
          <div>
            <label htmlFor="listing-seller" className="block text-[12px] font-medium text-ink-muted">
              Assigned Seller
            </label>
            <select
              id="listing-seller"
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink focus:border-brand focus:outline-none"
            >
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
            {seller && seller.id !== sellerId && (
              <p className="mt-1 text-[11px] text-warning">
                Reassigning from original seller: {seller.name}
              </p>
            )}
          </div>
        )}

        {/* AI Analysis Override */}
        <div className="rounded-xl border border-line bg-surface-2/40 p-3.5 space-y-3">
          <p className="text-[12px] font-semibold text-ink">🤖 AI Vision & Search Meta Override</p>

          <div>
            <label htmlFor="listing-tags" className="block text-[11px] text-ink-muted">
              Search Tags (comma-separated)
            </label>
            <input
              id="listing-tags"
              type="text"
              value={aiTags}
              onChange={(e) => setAiTags(e.target.value)}
              placeholder="calculator, engineering, casio, fx-991"
              className="mt-1 h-8.5 w-full rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink focus:border-brand focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="listing-notes" className="block text-[11px] text-ink-muted">
              AI Condition Notes
            </label>
            <textarea
              id="listing-notes"
              rows={2}
              value={aiConditionNotes}
              onChange={(e) => setAiConditionNotes(e.target.value)}
              placeholder="e.g. Scanned 4 product photos: Clean display, functional solar cell, minor desk scuffs."
              className="mt-1 w-full rounded-md border border-line bg-surface p-2 text-[12px] text-ink focus:border-brand focus:outline-none resize-none"
            />
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="shrink-0 space-y-2 border-t border-line bg-surface-2 p-4">
        <Button
          type="submit"
          variant="primary"
          className="w-full justify-center h-9 text-[13px]"
          disabled={saving}
        >
          {saving ? 'Saving changes…' : 'Save Listing Changes'}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="justify-center h-8.5 text-[12.5px]"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger-outline"
            className="justify-center h-8.5 text-[12.5px] text-critical"
            onClick={() => onDelete(listing)}
          >
            <TrashIcon size={14} />
            Delete Listing
          </Button>
        </div>
      </div>
    </form>
  )
}
