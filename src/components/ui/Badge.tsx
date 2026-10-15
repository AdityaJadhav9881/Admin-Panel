import type { ReactNode } from 'react'
import type { StatusTone } from '../../data/mock'

export type BadgeTone = StatusTone | 'brand'

const tones: Record<BadgeTone, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  critical: 'bg-critical-soft text-critical',
  neutral: 'bg-subtle text-ink-muted',
  brand: 'bg-brand-soft text-brand-strong',
}

const dots: Record<BadgeTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-critical',
  neutral: 'bg-ink-faint',
  brand: 'bg-brand',
}

interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  withDot?: boolean
  className?: string
}

export function Badge({ tone = 'neutral', children, withDot = false, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium leading-none whitespace-nowrap ${tones[tone]} ${className}`}
    >
      {withDot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dots[tone]}`} />}
      {children}
    </span>
  )
}
