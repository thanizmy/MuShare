export type PieceStatus = 'draft' | 'published' | 'hidden'

export interface Piece {
  id: string
  title: string
  description: string | null
  status: PieceStatus
  duration_sec: number
  audio_bytes: number
  /** Signed, valid for an hour; plays even while the piece is private. */
  audio_url: string
  cover_url: string | null
  created_at: string
  updated_at: string
  published_at: string | null
  /** Present once published (and kept while hidden). */
  track_id: string | null
  album_id: string | null
  artist_id: string | null
}

export interface StudioUsage {
  pieces_used: number
  pieces_limit: number
  bytes_used: number
  bytes_limit: number
  max_audio_bytes: number
  max_cover_bytes: number
  max_duration_sec: number
  allowed_types: string[]
  artist_name: string | null
}

export interface PublishInput {
  rights_confirmed: true
  artist_name?: string
}
