import type { Track } from '../../types/catalog'
import { request } from '../client'

export const getFavoriteIds = (signal?: AbortSignal) =>
  request<string[]>('/library/favorites/ids', { signal })

export const getFavorites = (signal?: AbortSignal) =>
  request<Track[]>('/library/favorites', { signal })

export const addFavorite = (trackId: string) =>
  request<void>(`/library/favorites/${encodeURIComponent(trackId)}`, { method: 'PUT' })

export const removeFavorite = (trackId: string) =>
  request<void>(`/library/favorites/${encodeURIComponent(trackId)}`, { method: 'DELETE' })

export const recordPlay = (trackId: string) =>
  request<void>('/library/history', { method: 'POST', body: { track_id: trackId } })

export const getRecentlyPlayed = (limit: number, signal?: AbortSignal) =>
  request<Track[]>(`/library/recently-played?limit=${limit}`, { signal })
