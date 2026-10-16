import type { PlaylistDetail, PlaylistInput, PlaylistSummary } from '../../types/library'
import { request } from '../client'

const id = encodeURIComponent

export const getPlaylists = (signal?: AbortSignal) =>
  request<PlaylistSummary[]>('/playlists', { signal })

export const getPlaylist = (playlistId: string, signal?: AbortSignal) =>
  request<PlaylistDetail>(`/playlists/${id(playlistId)}`, { signal })

export const createPlaylist = (input: PlaylistInput) =>
  request<PlaylistSummary>('/playlists', { method: 'POST', body: input })

export const updatePlaylist = (playlistId: string, input: Partial<PlaylistInput>) =>
  request<PlaylistSummary>(`/playlists/${id(playlistId)}`, { method: 'PATCH', body: input })

export const deletePlaylist = (playlistId: string) =>
  request<void>(`/playlists/${id(playlistId)}`, { method: 'DELETE' })

export const addPlaylistTrack = (playlistId: string, trackId: string) =>
  request<PlaylistDetail>(`/playlists/${id(playlistId)}/tracks`, {
    method: 'POST',
    body: { track_id: trackId },
  })

export const removePlaylistEntry = (playlistId: string, entryId: string) =>
  request<PlaylistDetail>(`/playlists/${id(playlistId)}/tracks/${id(entryId)}`, {
    method: 'DELETE',
  })

export const reorderPlaylist = (playlistId: string, entryIds: string[]) =>
  request<PlaylistDetail>(`/playlists/${id(playlistId)}/tracks/order`, {
    method: 'PUT',
    body: { entry_ids: entryIds },
  })
