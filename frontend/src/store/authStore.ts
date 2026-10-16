import { create } from 'zustand'

import type { User } from '../types/auth'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

interface AuthState {
  status: AuthStatus
  user: User | null
  /** Held in memory only; the long-lived credential is an httpOnly cookie. */
  accessToken: string | null
  setSession: (user: User, accessToken: string) => void
  /** Replace the signed-in user's details (after editing their profile). */
  updateUser: (user: Partial<User>) => void
  clearSession: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  user: null,
  accessToken: null,
  setSession: (user, accessToken) => set({ status: 'authenticated', user, accessToken }),
  updateUser: (changes) => set((s) => (s.user ? { user: { ...s.user, ...changes } } : s)),
  clearSession: () => set({ status: 'anonymous', user: null, accessToken: null }),
}))
