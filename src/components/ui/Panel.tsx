import type { ReactNode } from 'react'

interface PanelProps {
  id?: string
  title: string
  caption?: string
  action?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

export function Panel({ id, title, caption, action, children, footer }: PanelProps) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
    >
      <div className="flex flex-col gap-3.5 border-b border-line px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] leading-tight font-semibold text-ink">{title}</h2>
          {caption && <p className="mt-1 text-[12.5px] text-ink-muted">{caption}</p>}
        </div>
        {action && <div className="w-full sm:w-auto sm:shrink-0">{action}</div>}
      </div>
      {children}
      {footer && (
        <div className="border-t border-line bg-surface-2 px-5 py-3.5 text-[12.5px] text-ink-muted">
          {footer}
        </div>
      )}
    </section>
  )
}
