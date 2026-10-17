import { useEffect, useMemo, useState } from 'react'
import type { AdminUserUpdatePayload } from '../../api/client'
import { isProtectedAdminEmail } from '../../api/client'
import type { User, UserStatus } from '../../data/mock'
import {
  MAHARASHTRA_COLLEGES,
  formatTrustScore,
  trustBand,
  trustPercent,
} from '../../data/mock'
import {
  AlertIcon,
  CheckIcon,
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  SearchIcon,
  ShieldIcon,
  TrashIcon,
} from '../icons'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

interface UserEditDrawerProps {
  user: User | null
  isOpen: boolean
  onClose: () => void
  onSave: (
    userId: string,
    payload: AdminUserUpdatePayload,
    updateListingsCollege?: boolean,
  ) => Promise<void> | void
  onDelete: (user: User) => void
}

export function UserEditDrawer({
  user,
  isOpen,
  onClose,
  onSave,
  onDelete,
}: UserEditDrawerProps) {
  useEffect(() => {
    if (!isOpen) return
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
  }, [isOpen, onClose])

  if (!isOpen || !user) return null

  return (
    <div className="fixed inset-0 z-60 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-full sm:max-w-xl flex pl-0 sm:pl-10">
        <UserEditForm
          key={user.id}
          user={user}
          onClose={onClose}
          onSave={onSave}
          onDelete={onDelete}
        />
      </div>
    </div>
  )
}

function UserEditForm({
  user,
  onClose,
  onSave,
  onDelete,
}: {
  user: User
  onClose: () => void
  onSave: (
    userId: string,
    payload: AdminUserUpdatePayload,
    updateListingsCollege?: boolean,
  ) => Promise<void> | void
  onDelete: (user: User) => void
}) {
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [phone, setPhone] = useState(user.phone ?? '')
  const [collegeName, setCollegeName] = useState(user.collegeName || 'Government College of Engineering, Karad')
  const [collegeCode, setCollegeCode] = useState(user.collegeCode || '6004')
  const [collegeSearch, setCollegeSearch] = useState('')
  const [showCollegePicker, setShowCollegePicker] = useState(false)
  const [updateListingsCollege, setUpdateListingsCollege] = useState(true)
  const [trustScore, setTrustScore] = useState(user.trustScore)
  const [status, setStatus] = useState<UserStatus>(user.status)
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Filter Maharashtra and All-India colleges based on search query
  const filteredColleges = useMemo(() => {
    const q = collegeSearch.trim().toLowerCase()
    if (!q) return MAHARASHTRA_COLLEGES
    return MAHARASHTRA_COLLEGES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.shortName.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q),
    )
  }, [collegeSearch])

  const isProtected = isProtectedAdminEmail(user.email)
  const band = trustBand(trustScore)

  const handleSelectCollege = (cName: string, cCode: string) => {
    setCollegeName(cName)
    setCollegeCode(cCode)
    setShowCollegePicker(false)
    setCollegeSearch('')
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload: AdminUserUpdatePayload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        college_name: collegeName.trim(),
        college_code: collegeCode.trim(),
        trust_score: Number(trustScore.toFixed(1)),
        status,
        new_password: newPassword.trim() || undefined,
      }
      await onSave(user.id, payload, updateListingsCollege)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="drawer-enter w-full max-w-full sm:max-w-xl bg-surface border-l border-line shadow-2xl flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 border-b border-line bg-surface-2/40 flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-soft text-brand-strong text-[12px] font-semibold">
              ⚡
            </span>
            <h2 className="text-[16px] font-bold text-ink truncate">
              Edit Student Profile &amp; College
            </h2>
            <Badge tone="brand">God Mode</Badge>
          </div>
          <p className="mt-1 text-[12.5px] text-ink-muted">
            Admin master override for credentials, college affiliation, and trust score.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-ink-faint hover:bg-surface-2 hover:text-ink transition-colors"
          aria-label="Close editor"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      {/* Form Body */}
      <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Identity & Contact Group */}
        <div className="space-y-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            Student Account Details
          </h3>

          {/* Full Name */}
          <div>
            <label className="block text-[12.5px] font-medium text-ink mb-1.5">
              Full Name <span className="text-critical">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aditya Kulkarni"
              className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink placeholder:text-ink-faint hover:border-line-strong focus:border-brand focus:outline-none transition-colors"
            />
          </div>

          {/* Email Address */}
          <div>
            <label className="block text-[12.5px] font-medium text-ink mb-1.5">
              Email Address <span className="text-critical">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. student@gcoek.ac.in"
              className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink placeholder:text-ink-faint hover:border-line-strong focus:border-brand focus:outline-none transition-colors"
            />
          </div>

          {/* Mobile / Contact Number */}
          <div>
            <label className="block text-[12.5px] font-medium text-ink mb-1.5">
              Mobile / WhatsApp Contact Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98221 04928"
              className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink placeholder:text-ink-faint hover:border-line-strong focus:border-brand focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* College & Campus Affiliation */}
        <div className="space-y-3 border-t border-line pt-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                Campus &amp; CET Cell Affiliation
              </h3>
              <p className="text-[12px] text-ink-muted">
                Assign student to verified Maharashtra CET or All-India college.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-7 px-2 text-[11.5px]"
              onClick={() => setShowCollegePicker(!showCollegePicker)}
            >
              {showCollegePicker ? 'Close Catalog' : '🔍 Browse CET Colleges'}
            </Button>
          </div>

          {/* Searchable Picker Dropdown */}
          {showCollegePicker && (
            <div className="rounded-xl border border-line bg-surface-2/60 p-3.5 space-y-2.5">
              <div className="relative">
                <SearchIcon
                  size={15}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
                />
                <input
                  type="search"
                  value={collegeSearch}
                  onChange={(e) => setCollegeSearch(e.target.value)}
                  placeholder="Type CET code (e.g. 6004, 6545) or city (Karad, Pune, Mumbai)..."
                  className="h-8.5 w-full rounded-lg border border-line bg-surface pr-3 pl-8.5 text-[12.5px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
                />
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-line/60 rounded-lg border border-line bg-surface">
                {filteredColleges.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => handleSelectCollege(c.name, c.code)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-brand-soft/50 transition-colors text-[12px]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink truncate">{c.name}</p>
                      <p className="text-[11px] text-ink-faint">
                        {c.shortName} · {c.city}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] font-semibold text-brand ml-2">
                      CET {c.code}
                    </span>
                  </button>
                ))}
                {filteredColleges.length === 0 && (
                  <div className="p-3 text-center text-[12px] text-ink-muted">
                    No CET catalog match. Enter custom college name below.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Direct Name & Code Override */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-[12px] font-medium text-ink mb-1">
                College / Institute Name
              </label>
              <input
                type="text"
                required
                value={collegeName}
                onChange={(e) => setCollegeName(e.target.value)}
                placeholder="e.g. Government College of Engineering, Karad"
                className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-[12.5px] text-ink focus:border-brand focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-ink mb-1">
                CET / Institute Code
              </label>
              <input
                type="text"
                value={collegeCode}
                onChange={(e) => setCollegeCode(e.target.value)}
                placeholder="e.g. 6004"
                className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-[12.5px] font-mono text-ink focus:border-brand focus:outline-none"
              />
            </div>
          </div>

          {/* Synchronize Listings Checkbox */}
          <label className="flex items-start gap-2.5 rounded-lg border border-brand/20 bg-brand-soft/30 p-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={updateListingsCollege}
              onChange={(e) => setUpdateListingsCollege(e.target.checked)}
              className="mt-0.5 rounded border-line text-brand focus:ring-brand"
            />
            <span className="text-[12px] leading-relaxed text-ink">
              <span className="font-semibold text-brand-strong">
                Also update college on all active listings by this student
              </span>
              <br />
              <span className="text-ink-muted">
                Automatically moves all products posted by this seller to the new campus.
              </span>
            </span>
          </label>
        </div>

        {/* Trust Score & Status */}
        <div className="space-y-4 border-t border-line pt-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            Reputation &amp; Account Status
          </h3>

          {/* Trust Score Slider */}
          <div className="space-y-2 rounded-xl border border-line bg-surface-2/40 p-3.5">
            <div className="flex items-center justify-between">
              <label className="text-[12.5px] font-medium text-ink">
                Student Trust Score
              </label>
              <div className="flex items-center gap-2">
                <span className="tabular font-mono text-[14px] font-bold text-ink">
                  {formatTrustScore(trustScore)} / 5.0
                </span>
                <Badge tone={band.tone}>{band.label}</Badge>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="5"
                step="0.1"
                value={trustScore}
                onChange={(e) => setTrustScore(Number(e.target.value))}
                className="flex-1 accent-brand cursor-pointer"
              />
              <input
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={trustScore}
                onChange={(e) => setTrustScore(Math.min(5, Math.max(0, Number(e.target.value))))}
                className="h-8 w-16 rounded border border-line bg-surface px-2 text-center font-mono text-[12.5px] text-ink focus:border-brand focus:outline-none"
              />
            </div>

            {/* Visual Bar */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
              <div
                className={`h-full rounded-full transition-all duration-150 ${
                  band.tone === 'success'
                    ? 'bg-success'
                    : band.tone === 'warning'
                      ? 'bg-warning'
                      : 'bg-critical'
                }`}
                style={{ width: `${trustPercent(trustScore)}%` }}
              />
            </div>
          </div>

          {/* Account Status Toggle */}
          <div>
            <label className="block text-[12.5px] font-medium text-ink mb-2">
              Account Status
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setStatus('active')}
                className={`flex items-center justify-center gap-2 h-9 rounded-lg border text-[13px] font-medium transition-colors ${
                  status === 'active'
                    ? 'border-success bg-success-soft text-success shadow-xs'
                    : 'border-line bg-surface text-ink-muted hover:border-line-strong'
                }`}
              >
                <CheckIcon size={15} />
                Active Account
              </button>
              <button
                type="button"
                onClick={() => setStatus('blocked')}
                disabled={isProtected}
                className={`flex items-center justify-center gap-2 h-9 rounded-lg border text-[13px] font-medium transition-colors ${
                  status === 'blocked'
                    ? 'border-critical bg-critical-soft text-critical shadow-xs'
                    : isProtected
                      ? 'border-line bg-surface text-ink-faint opacity-50 cursor-not-allowed'
                      : 'border-line bg-surface text-ink-muted hover:border-line-strong'
                }`}
              >
                <AlertIcon size={15} />
                Blocked / Suspended
              </button>
            </div>
            {isProtected && (
              <p className="mt-1.5 text-[11.5px] text-brand">
                Protected Super Admin account cannot be blocked.
              </p>
            )}
          </div>
        </div>

        {/* Password Reset (Optional) */}
        <div className="space-y-3 border-t border-line pt-5">
          <div className="flex items-center gap-2">
            <LockIcon size={15} className="text-ink-muted" />
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Admin Password Override (Optional)
            </h3>
          </div>
          <p className="text-[12px] text-ink-muted">
            Directly reset this student&apos;s password if they are locked out or cannot sign in.
          </p>

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Set new student password (leave blank to keep unchanged)"
              className="h-9 w-full rounded-lg border border-line bg-surface pr-10 pl-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-faint hover:text-ink transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          </div>
        </div>

        {/* Danger Zone: Permanent Account Deletion */}
        <div className="rounded-xl border border-critical/30 bg-critical-soft/30 p-4 space-y-3">
          <div className="flex items-center gap-2 text-critical">
            <ShieldIcon size={16} />
            <h4 className="text-[12.5px] font-semibold">Danger Zone · Permanent Deletion</h4>
          </div>
          <p className="text-[12px] text-ink-muted">
            Permanently purge this student record from the database. Frees their email address for re-registration.
          </p>

          {confirmDelete ? (
            <div className="space-y-2 border-t border-critical/20 pt-2.5">
              <p className="text-[12px] font-medium text-critical">
                Are you sure? This cannot be undone.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="danger-solid"
                  className="h-8 px-3 text-[12px]"
                  onClick={() => {
                    onDelete(user)
                    onClose()
                  }}
                >
                  Yes, Permanently Delete
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 px-3 text-[12px]"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="danger-outline"
              className="h-8 px-3 text-[12px] text-critical"
              disabled={isProtected}
              onClick={() => setConfirmDelete(true)}
            >
              <TrashIcon size={14} />
              {isProtected ? 'Protected Super Admin (Cannot Delete)' : 'Delete User Account'}
            </Button>
          )}
        </div>
      </form>

      {/* Footer Actions */}
      <div className="px-6 py-4 border-t border-line bg-surface flex items-center justify-between">
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={saving}
          onClick={handleSave}
          className="gap-2"
        >
          <CheckIcon size={15} />
          {saving ? 'Saving Changes…' : 'Save Student Profile'}
        </Button>
      </div>
    </div>
  )
}
