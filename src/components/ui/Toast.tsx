import type { StatusTone } from '../../data/mock'

export interface ToastMessage {
  id: number
  text: string
  tone: StatusTone
}

const tones: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-critical',
  neutral: 'bg-rail-muted',
}

export function Toast({ message }: { message: ToastMessage | null }) {
  if (!message) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="toast-enter fixed right-4 bottom-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-xl border border-white/10 bg-ink px-4 py-3 text-[13px] font-medium text-white shadow-[0_16px_32px_-12px_rgba(16,24,40,0.45)] sm:right-6 sm:bottom-6"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${tones[message.tone]}`} />
      {message.text}
    </div>
  )
}
