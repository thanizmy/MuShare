import { loginUser, logoutUser, registerUser } from '../api/endpoints/auth'
import { configureAuthBridge, refreshSession } from '../api/client'
import type { AuthResponse, LoginInput, RegisterInput } from '../types/auth'
import { useAuthStore } from './authStore'

/** Wire the HTTP client to the auth store. Idempotent; called once at startup. */
export function initSession() {
  configureAuthBridge({
    getAccessToken: () => useAuthStore.getState().accessToken,
    onSessionRefreshed: (s) => useAuthStore.getState().setSession(s.user, s.access_token),
    onAuthFailure: () => useAuthStore.getState().clearSession(),
  })
}

function adopt({ user, access_token }: AuthResponse) {
  useAuthStore.getState().setSession(user, access_token)
}

/** Resume a previous session from the refresh cookie, or settle as anonymous. */
export async function bootstrapSession(): Promise<void> {
  const session = await refreshSession()
  if (!session) useAuthStore.getState().clearSession()
}

export async function login(input: LoginInput): Promise<void> {
  adopt(await loginUser(input))
}

export async function register(input: RegisterInput): Promise<void> {
  adopt(await registerUser(input))
}

export async function logout(): Promise<void> {
  try {
    await logoutUser()
  } catch {
    // Best effort: the refresh cookie expires on its own if the server can't be reached.
  } finally {
    useAuthStore.getState().clearSession()
  }
}
