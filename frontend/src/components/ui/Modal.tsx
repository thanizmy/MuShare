import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** "side" docks to the right edge (queue); "story" is a full-screen takeover (stories). */
  variant?: 'center' | 'side' | 'story'
}

/** Accessible modal: focus moves in and is trapped, Esc / backdrop close, focus returns after. */
export function Modal({ open, title, onClose, children, variant = 'center' }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel.current)?.focus()

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previouslyFocused?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  const trapTab = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !panel.current) return
    const focusable = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const side = variant === 'side'
  const story = variant === 'story'

  return (
    <div
      className={`fixed inset-0 z-[60] flex ${
        side || story
          ? `items-stretch ${story ? 'justify-center' : 'justify-end'}`
          : 'items-end justify-center p-4 sm:items-center'
      }`}
    >
      <div
        data-testid="modal-backdrop"
        className="absolute inset-0 bg-black/60 backdrop-blur-xs"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapTab}
        className={
          story
            ? 'relative h-full w-full overflow-hidden bg-black'
            : `glass-strong relative bg-surface ${
                side
                  ? 'h-full w-full max-w-sm overflow-y-auto p-5 pb-28'
                  : 'w-full max-w-md rounded-card p-6'
              }`
        }
      >
        <h2
          id={titleId}
          className={story ? 'sr-only' : 'mb-4 text-xl font-bold tracking-tight'}
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
