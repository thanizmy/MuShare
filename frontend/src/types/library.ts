import type { Track } from './catalog'

export interface OwnerSummary {
  id: string
  username: string
}

export interface PlaylistSummary {
  id: string
  title: string
  description: string | null
  is_public: boolean
  track_count: number
  cover_url: string | null
  owner: OwnerSummary
  created_at: string
}

export interface PlaylistEntry {
  entry_id: string
  position: number
  track: Track
}

export interface PlaylistDetail extends PlaylistSummary {
  entries: PlaylistEntry[]
}

export interface PlaylistInput {
  title: string
  description?: string | null
  is_public?: boolean
}
