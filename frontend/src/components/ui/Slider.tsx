import { useState, type CSSProperties } from 'react'

interface SliderProps {
  label: string
  value: number
  min?: number
  max: number
  step?: number
  /** Human-readable value for screen readers, e.g. "1:23 of 3:45". */
  valueText?: string
  disabled?: boolean
  /**
   * When true, onChange fires once on release (pointer up / key up) rather than on every
   * movement. Used for seeking, where each intermediate value would otherwise restart audio.
   */
  deferred?: boolean
  onChange: (value: number) => void
  className?: string
}

export function Slider({
  label,
  value,
  min = 0,
  max,
  step = 1,
  valueText,
  disabled,
  deferred = false,
  onChange,
  className = '',
}: SliderProps) {
  const [dragValue, setDragValue] = useState<number | null>(null)
  const shown = dragValue ?? value
  const span = max - min
  const percent = span > 0 ? Math.min(100, Math.max(0, ((shown - min) / span) * 100)) : 0

  const commit = () => {
    if (dragValue === null) return
    onChange(dragValue)
    setDragValue(null)
  }

  return (
    <input
      type="range"
      aria-label={label}
      aria-valuetext={valueText}
      min={min}
      max={span > 0 ? max : min + 1}
      step={step}
      value={shown}
      disabled={disabled || span <= 0}
      className={`range ${className}`}
      style={{ '--pct': `${percent}%` } as CSSProperties}
      onChange={(e) => {
        const next = Number(e.target.value)
        if (deferred) setDragValue(next)
        else onChange(next)
      }}
      onPointerUp={deferred ? commit : undefined}
      onKeyUp={deferred ? commit : undefined}
      onBlur={deferred ? commit : undefined}
    />
  )
}
