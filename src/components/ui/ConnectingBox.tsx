import { useEffect, useState } from 'react'

/** Shown once a request has been in flight long enough to be a cold start. */
export const WARMUP_MESSAGE =
  'Connecting to CampusMart Cloud Server — Hang tight! Waking up Render instance (takes ~30–60s on cold start)...'

interface ConnectingBoxProps {
  message?: string
  /** Secondary live line (e.g. the Super Admin self-heal steps). */
  detail?: string | null
  className?: string
}

export function ConnectingBox({
  message = WARMUP_MESSAGE,
  detail = null,
  className = '',
}: ConnectingBoxProps) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const startedAt = Date.now()
    const id = window.setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fade-in rounded-xl border border-brand/25 bg-brand-soft px-4 py-4 text-left ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-relaxed font-medium text-ink">{message}</p>
          {detail && (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">{detail}</p>
          )}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-brand/15">
            <span className="warm-sweep block h-full w-1/3 rounded-full bg-brand" />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-[11.5px] text-ink-muted">
            <span className="tracking-[0.08em] uppercase">Cold-start warmup</span>
            <span className="tabular">{elapsed}s elapsed</span>
          </div>
        </div>
      </div>
    </div>
  )
}
