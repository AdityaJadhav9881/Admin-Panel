import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'outline' | 'danger-outline' | 'danger-quiet' | 'danger-solid' | 'ghost'

const variants: Record<Variant, string> = {
  primary:
    'bg-brand text-white hover:bg-brand-strong active:bg-brand-strong shadow-[0_1px_2px_rgba(16,24,40,0.08)]',
  outline:
    'border border-line-strong bg-surface text-ink hover:bg-surface-2 hover:border-ink-faint active:bg-subtle',
  'danger-outline':
    'border border-critical/35 bg-surface text-critical hover:bg-critical-soft hover:border-critical/60',
  'danger-quiet':
    'border border-line-strong bg-surface text-ink-muted hover:border-critical/50 hover:bg-critical-soft hover:text-critical',
  'danger-solid': 'bg-critical text-white hover:bg-[#a52c24] active:bg-[#a52c24]',
  ghost: 'text-ink-muted hover:text-ink hover:bg-subtle',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export function Button({
  variant = 'outline',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-[13px] font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out-soft active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  )
}
