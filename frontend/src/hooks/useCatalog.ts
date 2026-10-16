import { keepPreviousData, useQuery } from '@tanstack/react-query'

import {
  getAlbum,
  getAlbums,
  getArtist,
  getArtists,
  getTracks,
  searchCatalog,
} from '../api/endpoints/catalog'

export const catalogKeys = {
  tracks: (sort: string, limit: number) => ['tracks', sort, limit] as const,
  albums: (limit: number) => ['albums', limit] as const,
  artists: (limit: number) => ['artists', limit] as const,
  album: (id: string) => ['album', id] as const,
  artist: (id: string) => ['artist', id] as const,
  search: (query: string) => ['search', query] as const,
}

export const usePopularTracks = (limit = 12) =>
  useQuery({
    queryKey: catalogKeys.tracks('popular', limit),
    queryFn: ({ signal }) => getTracks({ sort: 'popular', limit }, signal),
  })

export const useAlbums = (limit = 12) =>
  useQuery({
    queryKey: catalogKeys.albums(limit),
    queryFn: ({ signal }) => getAlbums({ limit }, signal),
  })

export const useArtists = (limit = 12) =>
  useQuery({
    queryKey: catalogKeys.artists(limit),
    queryFn: ({ signal }) => getArtists({ limit }, signal),
  })

export const useAlbum = (id: string) =>
  useQuery({ queryKey: catalogKeys.album(id), queryFn: ({ signal }) => getAlbum(id, signal) })

export const useArtist = (id: string) =>
  useQuery({ queryKey: catalogKeys.artist(id), queryFn: ({ signal }) => getArtist(id, signal) })

/** Live search. Keeps the previous results on screen while the next query loads. */
export const useSearch = (query: string) => {
  const trimmed = query.trim()
  return useQuery({
    queryKey: catalogKeys.search(trimmed),
    queryFn: ({ signal }) => searchCatalog(trimmed, signal),
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
  })
}
