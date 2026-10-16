import type { Piece, PublishInput, StudioUsage } from '../../types/studio'
import { request, uploadRequest } from '../client'

const id = encodeURIComponent

export const getStudioUsage = (signal?: AbortSignal) =>
  request<StudioUsage>('/studio/usage', { signal })

export const getPieces = (signal?: AbortSignal) => request<Piece[]>('/studio/pieces', { signal })

export const getPiece = (pieceId: string, signal?: AbortSignal) =>
  request<Piece>(`/studio/pieces/${id(pieceId)}`, { signal })

export interface UploadInput {
  audio: File
  title: string
  description: string
  cover: File | null
}

export function uploadPiece(
  input: UploadInput,
  options: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
) {
  const form = new FormData()
  form.append('audio', input.audio)
  if (input.title.trim()) form.append('title', input.title.trim())
  if (input.description.trim()) form.append('description', input.description.trim())
  if (input.cover) form.append('cover', input.cover)
  return uploadRequest<Piece>('/studio/pieces', form, options)
}

export const updatePiece = (pieceId: string, input: { title?: string; description?: string }) =>
  request<Piece>(`/studio/pieces/${id(pieceId)}`, { method: 'PATCH', body: input })

export function setPieceCover(pieceId: string, cover: File) {
  const form = new FormData()
  form.append('cover', cover)
  return uploadRequest<Piece>(`/studio/pieces/${id(pieceId)}/cover`, form, { method: 'PUT' })
}

export const removePieceCover = (pieceId: string) =>
  request<Piece>(`/studio/pieces/${id(pieceId)}/cover`, { method: 'DELETE' })

export const publishPiece = (pieceId: string, input: PublishInput) =>
  request<Piece>(`/studio/pieces/${id(pieceId)}/publish`, { method: 'POST', body: input })

export const unpublishPiece = (pieceId: string) =>
  request<Piece>(`/studio/pieces/${id(pieceId)}/unpublish`, { method: 'POST' })

export const deletePiece = (pieceId: string) =>
  request<void>(`/studio/pieces/${id(pieceId)}`, { method: 'DELETE' })
