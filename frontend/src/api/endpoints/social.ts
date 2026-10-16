import type { ProfileUpdate, UserProfile, UserSummary, Wrapped, WrappedPeriod } from '../../types/social'
import { request } from '../client'

const u = (username: string) => `/users/${encodeURIComponent(username)}`

export const getProfile = (username: string, signal?: AbortSignal) =>
  request<UserProfile>(u(username), { signal })

export const getWrapped = (username: string, period: WrappedPeriod, signal?: AbortSignal) =>
  request<Wrapped>(`${u(username)}/wrapped?period=${period}`, { signal })

export const getFollowers = (username: string, signal?: AbortSignal) =>
  request<UserSummary[]>(`${u(username)}/followers?limit=50`, { signal })

export const getFollowing = (username: string, signal?: AbortSignal) =>
  request<UserSummary[]>(`${u(username)}/following?limit=50`, { signal })

export const followUser = (username: string) =>
  request<UserProfile>(`${u(username)}/follow`, { method: 'PUT' })

export const unfollowUser = (username: string) =>
  request<UserProfile>(`${u(username)}/follow`, { method: 'DELETE' })

export const likeUser = (username: string) =>
  request<UserProfile>(`${u(username)}/like`, { method: 'PUT' })

export const unlikeUser = (username: string) =>
  request<UserProfile>(`${u(username)}/like`, { method: 'DELETE' })

export const searchUsers = (query: string, signal?: AbortSignal) =>
  request<UserSummary[]>(`/users/search?q=${encodeURIComponent(query)}`, { signal })

export const updateMyProfile = (input: ProfileUpdate) =>
  request<UserProfile>('/users/me', { method: 'PATCH', body: input })
