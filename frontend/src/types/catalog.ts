export interface ArtistSummary {
  id: string
  name: string
  image_url: string | null
}

export interface AlbumSummary {
  id: string
  title: string
  cover_url: string | null
  release_year: number | null
  artist: ArtistSummary
}

export interface Track {
  id: string
  title: string
  track_number: number
  duration_sec: number
  audio_url: string
  preview_start_sec: number
  album: AlbumSummary
  genres: string[]
  /** The artist pulled this from the catalog. It can't be played; it's shown greyed out. */
  is_hidden?: boolean
  /** Client-only: set on tracks built from a My Studio piece, so the UI knows where it came from. */
  studio_piece_id?: string
}

export interface ArtistDetail extends ArtistSummary {
  bio: string | null
  albums: AlbumSummary[]
  top_tracks: Track[]
}

export interface AlbumDetail extends AlbumSummary {
  tracks: Track[]
}

export interface SearchResults {
  query: string
  tracks: Track[]
  artists: ArtistSummary[]
  albums: AlbumSummary[]
}

export type TrackSort = 'popular' | 'title'
