import { useEffect } from 'react'
import { AlertIcon } from '../icons'
import { Button } from './Button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      data-confirm="true"
      className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center"
    >
      <div
        className="absolute inset-0 bg-ink/35"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="view-enter relative w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-[0_24px_48px_-12px_rgba(16,24,40,0.28)]"
      >
        <div className="flex items-start gap-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-critical-soft text-critical">
            <AlertIcon size={18} />
          </span>
          <div>
            <h2 id="confirm-title" className="text-[15px] font-semibold text-ink">
              {title}
            </h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">{body}</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <Button autoFocus onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger-solid" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
