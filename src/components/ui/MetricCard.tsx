import type { ReactNode } from 'react'
import { ArrowRightIcon } from '../icons'

interface MetricCardProps {
  label: string
  value: string
  context?: string
  contextTone?: 'success' | 'warning' | 'critical' | 'muted'
  icon: ReactNode
  footnote?: string
  action?: { label: string; onClick: () => void }
}

const contextTones = {
  success: 'text-success',
  warning: 'text-warning',
  critical: 'text-critical',
  muted: 'text-ink-faint',
}

export function MetricCard({
  label,
  value,
  context,
  contextTone = 'muted',
  icon,
  footnote,
  action,
}: MetricCardProps) {
  return (
    <article className="group flex flex-col rounded-xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors duration-200 hover:border-line-strong">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[11px] font-semibold tracking-[0.09em] text-ink-faint uppercase">
          {label}
        </p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-faint">
          {icon}
        </span>
      </div>

      <p className="tabular mt-4 text-[34px] leading-none font-semibold tracking-[-0.02em] text-ink">
        {value}
      </p>
      {context && <p className={`mt-2 text-[12.5px] ${contextTones[contextTone]}`}>{context}</p>}

      {(action || footnote) && (
        <div className="mt-auto border-t border-line pt-3.5">
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              className="flex w-full items-center justify-between gap-2 text-[13px] font-medium text-brand transition-colors duration-150 hover:text-brand-strong"
            >
              {action.label}
              <ArrowRightIcon
                size={15}
                className="transition-transform duration-200 ease-out-soft group-hover:translate-x-0.5"
              />
            </button>
          ) : (
            <p className="text-[13px] text-ink-muted">{footnote}</p>
          )}
        </div>
      )}
    </article>
  )
}
