import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

import { useUiStore } from '../../store/uiStore'
import { SidebarContent } from './SidebarContent'

export function MobileDrawer() {
  const open = useUiStore((s) => s.drawerOpen)
  const closeDrawer = useUiStore((s) => s.closeDrawer)
  const closeButton = useRef<HTMLButtonElement>(null)
  const location = useLocation()

  // Navigating anywhere dismisses the drawer.
  useEffect(() => {
    closeDrawer()
  }, [location.pathname, closeDrawer])

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    closeButton.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer()
    }
    document.addEventListener('keydown', onKeyDown)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previouslyFocused?.focus()
    }
  }, [open, closeDrawer])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div
        data-testid="drawer-backdrop"
        className="absolute inset-0 bg-black/60 backdrop-blur-xs"
        onClick={closeDrawer}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="glass-strong absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface"
      >
        <button
          ref={closeButton}
          type="button"
          aria-label="Close navigation"
          onClick={closeDrawer}
          className="absolute right-3 top-3 rounded-full p-2 text-ink-muted hover:bg-white/10 hover:text-ink"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        <SidebarContent />
      </div>
    </div>
  )
}
