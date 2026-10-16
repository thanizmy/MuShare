import type { AuthResponse, LoginInput, RegisterInput } from '../../types/auth'
import { request } from '../client'

export const registerUser = (input: RegisterInput) =>
  request<AuthResponse>('/auth/register', { method: 'POST', body: input, skipRefresh: true })

export const loginUser = (input: LoginInput) =>
  request<AuthResponse>('/auth/login', { method: 'POST', body: input, skipRefresh: true })

export const logoutUser = () =>
  request<void>('/auth/logout', { method: 'POST', skipRefresh: true })
