import { useEffect, useRef, useState, type FormEvent } from 'react'
import { apiErrorMessage, type LoginProgress } from '../../api/client'
import { AlertIcon, ShieldIcon } from '../icons'
import { Button } from '../ui/Button'
import { ConnectingBox } from '../ui/ConnectingBox'

const SLOW_NOTICE_MS = 2000

interface LoginViewProps {
  onLogin: (email: string, password: string, onProgress: LoginProgress) => Promise<void>
}

export function LoginView({ onLogin }: LoginViewProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [slow, setSlow] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const slowTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (slowTimer.current !== null) window.clearTimeout(slowTimer.current)
    }
  }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      setError('Enter both an email and a password to continue.')
      return
    }
    setError(null)
    setProgress(null)
    setSlow(false)
    setSubmitting(true)
    if (slowTimer.current !== null) window.clearTimeout(slowTimer.current)
    slowTimer.current = window.setTimeout(() => setSlow(true), SLOW_NOTICE_MS)
    try {
      await onLogin(trimmedEmail, password, setProgress)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      if (slowTimer.current !== null) {
        window.clearTimeout(slowTimer.current)
        slowTimer.current = null
      }
      setSlow(false)
      setProgress(null)
      setSubmitting(false)
    }
  }

  const showWarmup = submitting && (slow || progress !== null)

  return (
    <div className="view-enter grid min-h-screen place-items-center bg-rail px-5 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[11px] bg-brand text-[13px] font-bold tracking-tight text-white">
            CM
          </span>
          <div>
            <p className="text-[15px] leading-tight font-semibold text-rail-ink">
              CampusMart AI
            </p>
            <p className="text-[11px] tracking-[0.12em] text-rail-muted uppercase">
              Master Control
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-rail-line bg-surface p-6 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.45)]">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-strong">
              <ShieldIcon size={17} />
            </span>
            <div>
              <h1 className="text-[16px] leading-tight font-semibold text-ink">
                Admin sign in
              </h1>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                Authorised CampusMart administrators only. Sessions expire with the
                backend JWT.
              </p>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-lg border border-critical/25 bg-critical-soft px-3 py-2.5"
            >
              <span className="mt-0.5 shrink-0 text-critical">
                <AlertIcon size={15} />
              </span>
              <p className="text-[12.5px] leading-relaxed text-ink">{error}</p>
            </div>
          )}

          <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="admin-email"
                className="block text-[12px] font-medium text-ink"
              >
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter admin email address"
                className="mt-1.5 h-10 w-full rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-brand"
              />
            </div>
            <div>
              <label
                htmlFor="admin-password"
                className="block text-[12px] font-medium text-ink"
              >
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="mt-1.5 h-10 w-full rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-brand"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center"
              disabled={submitting}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          {showWarmup && (
            <div className="mt-4">
              <ConnectingBox detail={progress} />
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-[12px] tracking-[0.08em] text-rail-muted uppercase">
          CampusMart AI · Authorized Administration Portal
        </p>
      </div>
    </div>
  )
}
