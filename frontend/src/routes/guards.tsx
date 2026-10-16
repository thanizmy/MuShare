import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { FullScreenLoader } from '../components/feedback/FullScreenLoader'
import { useAuth } from '../hooks/useAuth'

interface FromState {
  from?: { pathname: string; search?: string }
}

/** Only signed-in users pass; others are sent to /login and returned afterwards. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullScreenLoader />
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location } satisfies FromState} />
  }
  return <Outlet />
}

/** Login/register are for signed-out users; signed-in users bounce to where they were going. */
export function GuestOnly() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullScreenLoader />
  if (status === 'authenticated') {
    const from = (location.state as FromState | null)?.from
    return <Navigate to={from ? `${from.pathname}${from.search ?? ''}` : '/'} replace />
  }
  return <Outlet />
}
