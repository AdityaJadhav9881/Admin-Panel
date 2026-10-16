import { useState, type FormEvent } from 'react'
import {
  apiErrorMessage,
  changeAdminPassword,
  getAdminAccount,
} from '../../api/client'
import { initials } from '../../lib/format'
import { AlertIcon, CheckIcon, EyeIcon, EyeOffIcon, LockIcon, ShieldIcon } from '../icons'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import type { ToastMessage } from '../ui/Toast'

interface AdminProfilePanelProps {
  adminEmail: string
  onToast: (text: string, tone: ToastMessage['tone']) => void
}

export function AdminProfilePanel({ adminEmail, onToast }: AdminProfilePanelProps) {
  const account = getAdminAccount(adminEmail)
  const isSuper = account.role === 'super_admin'

  /* --- Change Password State --- */
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!currentPassword) {
      setError('Please enter your current password.')
      return
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }
    if (currentPassword === newPassword) {
      setError('New password cannot be identical to your current password.')
      return
    }

    setUpdating(true)
    try {
      const res = await changeAdminPassword(adminEmail, currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess('Password updated successfully. Use your new password on your next sign in.')
      onToast(res.message, 'success')
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setUpdating(false)
    }
  }

  return (
    <Panel
      id="admin-profile"
      title="Admin Profile & Security"
      caption="Manage your administrator profile details and login security credentials."
      action={
        <Badge tone={isSuper ? 'brand' : 'neutral'} withDot>
          {account.roleTitle}
        </Badge>
      }
    >
      <div className="space-y-6 p-5">
        {/* Profile Card */}
        <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <span
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[14px] font-bold tracking-tight text-white ${
                isSuper ? 'bg-brand' : 'bg-[#475467]'
              }`}
            >
              {initials(account.name)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-semibold text-ink">{account.name}</h3>
                <Badge tone={isSuper ? 'brand' : 'neutral'}>
                  {isSuper ? 'Master Control' : 'Administrator'}
                </Badge>
              </div>
              <p className="mt-0.5 text-[13px] text-ink-muted">{account.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start rounded-lg border border-line bg-surface px-3 py-1.5 sm:self-auto">
            <span className="h-2 w-2 rounded-full bg-success" />
            <span className="text-[12px] font-medium text-ink">Active Session</span>
          </div>
        </div>

        {/* Permissions Scope Notice */}
        <div className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
          <span className="mt-0.5 shrink-0 text-brand">
            <ShieldIcon size={18} />
          </span>
          <div className="text-[12.5px] leading-relaxed text-ink-muted">
            <p className="font-medium text-ink">
              {isSuper ? 'Super Admin Authority (Master Control)' : 'Marketplace Administrator Authority'}
            </p>
            <p className="mt-0.5">
              {isSuper
                ? 'Full administrative privileges: master AI vision & LLM configuration, multi-agent control, marketplace listing moderation, seller sanctioning, and live latency probing.'
                : 'Operational privileges: marketplace listing moderation, flag resolution, seller trust monitoring, and user status controls.'}
            </p>
          </div>
        </div>

        {/* Change Password Form */}
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center gap-2.5 border-b border-line pb-4">
            <span className="text-ink-muted">
              <LockIcon size={17} />
            </span>
            <div>
              <h4 className="text-[14px] font-semibold text-ink">Change Password</h4>
              <p className="text-[12px] text-ink-muted">
                Update the password used to access Master Control.
              </p>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-lg border border-critical/25 bg-critical-soft px-3.5 py-2.5"
            >
              <span className="mt-0.5 shrink-0 text-critical">
                <AlertIcon size={15} />
              </span>
              <p className="text-[12.5px] leading-relaxed text-ink">{error}</p>
            </div>
          )}

          {success && (
            <div
              role="status"
              className="mt-4 flex items-start gap-2.5 rounded-lg border border-success/30 bg-success-soft px-3.5 py-2.5"
            >
              <span className="mt-0.5 shrink-0 text-success">
                <CheckIcon size={15} />
              </span>
              <p className="text-[12.5px] leading-relaxed text-success font-medium">{success}</p>
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="current-password"
                className="block text-[11.5px] font-medium tracking-[0.02em] text-ink uppercase"
              >
                Current Password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="current-password"
                  type={showCurrent ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                  className="h-10 w-full rounded-lg border border-line bg-surface pr-10 pl-3 text-[13.5px] text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-brand"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-muted hover:text-ink"
                >
                  {showCurrent ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="new-password"
                  className="block text-[11.5px] font-medium tracking-[0.02em] text-ink uppercase"
                >
                  New Password
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="new-password"
                    type={showNew ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="h-10 w-full rounded-lg border border-line bg-surface pr-10 pl-3 text-[13.5px] text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-brand"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    aria-label={showNew ? 'Hide new password' : 'Show new password'}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-muted hover:text-ink"
                  >
                    {showNew ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-[11.5px] font-medium tracking-[0.02em] text-ink uppercase"
                >
                  Confirm New Password
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="confirm-password"
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="h-10 w-full rounded-lg border border-line bg-surface pr-10 pl-3 text-[13.5px] text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-brand"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-muted hover:text-ink"
                  >
                    {showConfirm ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12px] text-ink-muted">
                {newPassword.length > 0 && newPassword.length < 8 && (
                  <span className="text-warning">Minimum 8 characters required.</span>
                )}
                {newPassword.length >= 8 && confirmPassword.length > 0 && newPassword !== confirmPassword && (
                  <span className="text-critical">Passwords do not match.</span>
                )}
                {newPassword.length >= 8 && confirmPassword.length > 0 && newPassword === confirmPassword && (
                  <span className="text-success font-medium">Passwords match.</span>
                )}
              </p>

              <Button
                type="submit"
                variant="primary"
                className="justify-center"
                disabled={updating || !currentPassword || !newPassword || !confirmPassword}
              >
                {updating ? 'Updating Password…' : 'Update Password'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Panel>
  )
}

