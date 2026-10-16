import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError } from '../api/client'
import {
  addFavorite,
  getFavoriteIds,
  getFavorites,
  getRecentlyPlayed,
  removeFavorite,
} from '../api/endpoints/library'
import {
  addPlaylistTrack,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  getPlaylists,
  removePlaylistEntry,
  reorderPlaylist,
  updatePlaylist,
} from '../api/endpoints/playlists'
import { toast } from '../store/toastStore'
import type { Track } from '../types/catalog'
import type { PlaylistDetail, PlaylistInput, PlaylistSummary } from '../types/library'

export const libraryKeys = {
  favoriteIds: ['favorites', 'ids'] as const,
  favorites: ['favorites', 'list'] as const,
  recent: ['recent'] as const,
  playlists: ['playlists'] as const,
  playlist: (id: string) => ['playlist', id] as const,
}

const messageOf = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback

// ------------------------------------------------------------------ favorites

export const useFavorites = () =>
  useQuery({ queryKey: libraryKeys.favorites, queryFn: ({ signal }) => getFavorites(signal) })

export const useFavoriteCount = () =>
  useQuery({
    queryKey: libraryKeys.favoriteIds,
    queryFn: ({ signal }) => getFavoriteIds(signal),
    select: (ids) => ids.length,
  })

/** Whether one track is liked. All hearts share a single cached id list. */
export function useIsFavorite(trackId: string): boolean {
  const { data } = useQuery({
    queryKey: libraryKeys.favoriteIds,
    queryFn: ({ signal }) => getFavoriteIds(signal),
    select: (ids) => ids.includes(trackId),
  })
  return data ?? false
}

/** Optimistic like/unlike: the heart flips instantly and rolls back if the request fails. */
export function useToggleFavorite(trackId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ track, favorite }: { track: Track; favorite: boolean }) =>
      favorite ? addFavorite(track.id) : removeFavorite(track.id),
    // Rapid clicks on the same heart run one after another, in order.
    scope: { id: `favorite:${trackId}` },
    onMutate: async ({ track, favorite }) => {
      await queryClient.cancelQueries({ queryKey: libraryKeys.favoriteIds })
      const previous = queryClient.getQueryData<string[]>(libraryKeys.favoriteIds)
      queryClient.setQueryData<string[]>(libraryKeys.favoriteIds, (ids = []) =>
        favorite ? [track.id, ...ids.filter((id) => id !== track.id)] : ids.filter((id) => id !== track.id),
      )
      return { previous }
    },
    onError: (error, { track, favorite }, context) => {
      queryClient.setQueryData(libraryKeys.favoriteIds, context?.previous)
      toast.error(messageOf(error, `Couldn't ${favorite ? 'like' : 'unlike'} “${track.title}”.`))
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.favoriteIds })
      void queryClient.invalidateQueries({ queryKey: libraryKeys.favorites })
    },
  })
}

// -------------------------------------------------------------------- history

export const useRecentlyPlayed = (limit = 12) =>
  useQuery({
    queryKey: [...libraryKeys.recent, limit],
    queryFn: ({ signal }) => getRecentlyPlayed(limit, signal),
  })

// ------------------------------------------------------------------ playlists

export const usePlaylists = () =>
  useQuery({ queryKey: libraryKeys.playlists, queryFn: ({ signal }) => getPlaylists(signal) })

export const usePlaylist = (id: string) =>
  useQuery({
    queryKey: libraryKeys.playlist(id),
    queryFn: ({ signal }) => getPlaylist(id, signal),
  })

export function useCreatePlaylist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PlaylistInput) => createPlaylist(input),
    onSuccess: (playlist) => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.playlists })
      toast.success(`Created “${playlist.title}”`)
    },
  })
}

export function useUpdatePlaylist(playlistId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<PlaylistInput>) => updatePlaylist(playlistId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.playlists })
      void queryClient.invalidateQueries({ queryKey: libraryKeys.playlist(playlistId) })
      toast.success('Playlist updated')
    },
  })
}

export function useDeletePlaylist(playlistId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => deletePlaylist(playlistId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: libraryKeys.playlist(playlistId) })
      void queryClient.invalidateQueries({ queryKey: libraryKeys.playlists })
      toast.success('Playlist deleted')
    },
    onError: (error) => toast.error(messageOf(error, "Couldn't delete the playlist.")),
  })
}

/** Replace the cached detail with the server's response and refresh list summaries. */
function useApplyDetail() {
  const queryClient = useQueryClient()
  return (detail: PlaylistDetail) => {
    queryClient.setQueryData(libraryKeys.playlist(detail.id), detail)
    void queryClient.invalidateQueries({ queryKey: libraryKeys.playlists })
  }
}

export function useAddToPlaylist() {
  const applyDetail = useApplyDetail()
  return useMutation({
    mutationFn: ({ playlist, track }: { playlist: PlaylistSummary; track: Track }) =>
      addPlaylistTrack(playlist.id, track.id),
    onSuccess: (detail, { playlist, track }) => {
      applyDetail(detail)
      toast.success(`Added “${track.title}” to ${playlist.title}`)
    },
    onError: (error) => {
      // "Already in the playlist" is information, not a failure.
      if (error instanceof ApiError && error.status === 409) toast.info(error.message)
      else toast.error(messageOf(error, "Couldn't add the track."))
    },
  })
}

export function useRemoveFromPlaylist(playlistId: string) {
  const applyDetail = useApplyDetail()
  return useMutation({
    mutationFn: (entryId: string) => removePlaylistEntry(playlistId, entryId),
    onSuccess: (detail) => {
      applyDetail(detail)
      toast.success('Removed from playlist')
    },
    onError: (error) => toast.error(messageOf(error, "Couldn't remove the track.")),
  })
}

export function useReorderPlaylist(playlistId: string) {
  const queryClient = useQueryClient()
  const applyDetail = useApplyDetail()
  const key = libraryKeys.playlist(playlistId)

  return useMutation({
    mutationFn: (entryIds: string[]) => reorderPlaylist(playlistId, entryIds),
    onMutate: async (entryIds) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<PlaylistDetail>(key)
      if (previous) {
        const byId = new Map(previous.entries.map((e) => [e.entry_id, e]))
        queryClient.setQueryData<PlaylistDetail>(key, {
          ...previous,
          entries: entryIds.flatMap((id, position) => {
            const entry = byId.get(id)
            return entry ? [{ ...entry, position }] : []
          }),
        })
      }
      return { previous }
    },
    onError: (error, _ids, context) => {
      queryClient.setQueryData(key, context?.previous)
      toast.error(messageOf(error, "Couldn't reorder the playlist."))
    },
    onSuccess: applyDetail,
  })
}
