import type {
  AlbumDetail,
  AlbumSummary,
  ArtistDetail,
  ArtistSummary,
  SearchResults,
  Track,
  TrackSort,
} from '../../types/catalog'
import { request } from '../client'

interface Page {
  limit?: number
  offset?: number
}

function qs(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const getTracks = (params: Page & { sort?: TrackSort } = {}, signal?: AbortSignal) =>
  request<Track[]>(`/tracks${qs({ ...params })}`, { signal })

export const getAlbums = (params: Page = {}, signal?: AbortSignal) =>
  request<AlbumSummary[]>(`/albums${qs({ ...params })}`, { signal })

export const getArtists = (params: Page = {}, signal?: AbortSignal) =>
  request<ArtistSummary[]>(`/artists${qs({ ...params })}`, { signal })

export const getAlbum = (id: string, signal?: AbortSignal) =>
  request<AlbumDetail>(`/albums/${encodeURIComponent(id)}`, { signal })

export const getArtist = (id: string, signal?: AbortSignal) =>
  request<ArtistDetail>(`/artists/${encodeURIComponent(id)}`, { signal })

export const searchCatalog = (query: string, signal?: AbortSignal) =>
  request<SearchResults>(`/search${qs({ q: query })}`, { signal })
