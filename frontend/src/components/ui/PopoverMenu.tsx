import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

const PANEL_HEIGHT_ESTIMATE = 320

interface PopoverMenuProps {
  /** Accessible name of the trigger button. */
  label: string
  icon: ReactNode
  children: (close: () => void) => ReactNode
}

/** A trigger button plus a menu: closes on Esc, outside click, scroll; arrow keys move focus. */
export function PopoverMenu({ label, icon, children }: PopoverMenuProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<CSSProperties>({})
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  const close = () => setOpen(false)

  const toggle = () => {
    if (!open && trigger.current) {
      const rect = trigger.current.getBoundingClientRect()
      const right = window.innerWidth - rect.right
      // Fixed positioning escapes scroll containers; flip above when there's no room below.
      setPosition(
        window.innerHeight - rect.bottom < PANEL_HEIGHT_ESTIMATE
          ? { right, bottom: window.innerHeight - rect.top + 4 }
          : { right, top: rect.bottom + 4 },
      )
    }
    setOpen((value) => !value)
  }

  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus()

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    const dismiss = () => setOpen(false)

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [open])

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const items = [...(panel.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])]
    if (items.length === 0) return
    event.preventDefault()
    const index = items.indexOf(document.activeElement as HTMLElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    items[(index + step + items.length) % items.length].focus()
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className="rounded-full p-2 text-ink-muted transition hover:text-ink"
      >
        {icon}
      </button>
      {open && (
        <div
          ref={panel}
          role="menu"
          aria-label={label}
          style={position}
          onKeyDown={onPanelKeyDown}
          className="glass-strong fixed z-[55] max-h-80 w-64 overflow-y-auto rounded-card bg-elevated p-1.5"
        >
          {children(close)}
        </div>
      )}
    </>
  )
}

export function MenuItem({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      disabled={disabled}
      onClick={onClick}
      className="block w-full truncate rounded-control px-3 py-2 text-left text-sm hover:bg-white/10 focus:bg-white/10 disabled:opacity-50"
    >
      {children}
    </button>
  )
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return (
    <p
      role="presentation"
      className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wider text-ink-faint"
    >
      {children}
    </p>
  )
}
