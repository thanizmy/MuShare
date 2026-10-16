import { logout } from '../store/session'
import { useAuthStore } from '../store/authStore'

/** Read-only view of the session plus the sign-out action. */
export function useAuth() {
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  return { status, user, isAuthenticated: status === 'authenticated', logout }
}
