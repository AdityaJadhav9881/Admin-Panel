interface ToggleProps {
  checked: boolean
  onChange: () => void
  /** Required: switches must be labelled for screen readers. */
  label: string
  disabled?: boolean
}

export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className="group inline-flex h-11 w-12 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-subtle disabled:opacity-40"
    >
      <span
        className={`relative flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-out-soft ${
          checked ? 'bg-brand' : 'bg-[#8b95a7] group-hover:bg-ink-faint'
        }`}
      >
        <span
          className={`absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(16,24,40,0.25)] transition-transform duration-200 ease-out-soft ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  )
}
