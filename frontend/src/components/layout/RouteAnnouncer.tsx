import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Screen readers don't notice client-side navigation, so announce the new page's heading
 * (politely) once it has rendered, and give focus a sensible place to continue from.
 */
export function RouteAnnouncer() {
  const { pathname } = useLocation()
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Let the new page (and its first data) render before reading its heading.
    const timer = setTimeout(() => {
      const heading = document.querySelector('main h1')?.textContent?.trim()
      setMessage(heading ? `${heading}, page loaded` : '')
    }, 250)
    return () => clearTimeout(timer)
  }, [pathname])

  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="route-announcer">
      {message}
    </div>
  )
}
