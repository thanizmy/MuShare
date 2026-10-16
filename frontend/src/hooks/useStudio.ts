import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'

import { ApiError } from '../api/client'
import {
  deletePiece,
  getPiece,
  getPieces,
  getStudioUsage,
  publishPiece,
  removePieceCover,
  setPieceCover,
  unpublishPiece,
  updatePiece,
  uploadPiece,
  type UploadInput,
} from '../api/endpoints/studio'
import { toast } from '../store/toastStore'
import type { Piece } from '../types/studio'

export const studioKeys = {
  all: ['studio'] as const,
  pieces: ['studio', 'pieces'] as const,
  piece: (id: string) => ['studio', 'piece', id] as const,
  usage: ['studio', 'usage'] as const,
}

// The signed audio and cover links in a piece last an hour, so don't let them go stale
// in the cache for anything like that long.
const PIECE_STALE_MS = 10 * 60_000

export const usePieces = () =>
  useQuery({
    queryKey: studioKeys.pieces,
    queryFn: ({ signal }) => getPieces(signal),
    staleTime: PIECE_STALE_MS,
  })

export const usePiece = (id: string) =>
  useQuery({
    queryKey: studioKeys.piece(id),
    queryFn: ({ signal }) => getPiece(id, signal),
    staleTime: PIECE_STALE_MS,
  })

export const useStudioUsage = () =>
  useQuery({ queryKey: studioKeys.usage, queryFn: ({ signal }) => getStudioUsage(signal) })

const messageOf = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback

/** Keep one piece, the list and the usage meter consistent after a change to a piece. */
function useStoreChange() {
  const queryClient = useQueryClient()
  return (piece: Piece) => {
    queryClient.setQueryData(studioKeys.piece(piece.id), piece)
    queryClient.setQueryData<Piece[]>(studioKeys.pieces, (list) =>
      list?.map((p) => (p.id === piece.id ? piece : p)),
    )
  }
}

/** Publishing, hiding and deleting change what everyone sees, so refetch whatever is on screen. */
function useRefreshEverything() {
  const queryClient = useQueryClient()
  return () => void queryClient.invalidateQueries()
}

export function useUploadPiece() {
  const queryClient = useQueryClient()
  const [progress, setProgress] = useState(0)
  const abort = useRef<AbortController | null>(null)

  const mutation = useMutation({
    mutationFn: (input: UploadInput) => {
      setProgress(0)
      abort.current = new AbortController()
      return uploadPiece(input, { onProgress: setProgress, signal: abort.current.signal })
    },
    onSuccess: (piece) => {
      queryClient.setQueryData(studioKeys.piece(piece.id), piece)
      void queryClient.invalidateQueries({ queryKey: studioKeys.pieces })
      void queryClient.invalidateQueries({ queryKey: studioKeys.usage })
    },
  })

  const cancel = useCallback(() => abort.current?.abort(), [])
  return { ...mutation, progress, cancel }
}

export function useUpdatePiece(id: string) {
  const store = useStoreChange()
  return useMutation({
    mutationFn: (input: { title?: string; description?: string }) => updatePiece(id, input),
    onSuccess: (piece) => {
      store(piece)
      toast.success('Details saved')
    },
  })
}

export function useSetCover(id: string) {
  const store = useStoreChange()
  return useMutation({
    mutationFn: (cover: File) => setPieceCover(id, cover),
    onSuccess: (piece) => {
      store(piece)
      toast.success('Cover updated')
    },
    onError: (error) => toast.error(messageOf(error, "Couldn't update the cover.")),
  })
}

export function useRemoveCover(id: string) {
  const store = useStoreChange()
  return useMutation({
    mutationFn: () => removePieceCover(id),
    onSuccess: (piece) => {
      store(piece)
      toast.success('Cover removed')
    },
    onError: (error) => toast.error(messageOf(error, "Couldn't remove the cover.")),
  })
}

export function usePublishPiece(id: string) {
  const store = useStoreChange()
  const refresh = useRefreshEverything()
  return useMutation({
    mutationFn: (input: { artistName?: string }) =>
      publishPiece(id, { rights_confirmed: true, artist_name: input.artistName }),
    onSuccess: (piece) => {
      store(piece)
      refresh()
      toast.success(`“${piece.title}” is now published`)
    },
  })
}

export function useUnpublishPiece(id: string) {
  const store = useStoreChange()
  const refresh = useRefreshEverything()
  return useMutation({
    mutationFn: () => unpublishPiece(id),
    onSuccess: (piece) => {
      store(piece)
      refresh()
      toast.success(`“${piece.title}” is hidden. You can publish it again any time.`)
    },
    onError: (error) => toast.error(messageOf(error, "Couldn't unpublish the piece.")),
  })
}

export function useDeletePiece(id: string) {
  const queryClient = useQueryClient()
  const refresh = useRefreshEverything()
  return useMutation({
    mutationFn: () => deletePiece(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: studioKeys.piece(id) })
      refresh()
      toast.success('Piece deleted')
    },
    onError: (error) => toast.error(messageOf(error, "Couldn't delete the piece.")),
  })
}
