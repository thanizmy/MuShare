import { useId, type InputHTMLAttributes } from 'react'

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string
  error?: string
  hint?: string
  onValueChange: (value: string) => void
}

export function TextField({ label, error, hint, onValueChange, className = '', ...input }: TextFieldProps) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onValueChange(e.target.value)}
        className={`w-full rounded-control border bg-elevated px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition hover:bg-hover focus:bg-hover ${
          error ? 'border-danger' : 'border-line focus:border-accent'
        } ${className}`}
        {...input}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
