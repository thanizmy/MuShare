import type { AlbumSummary, ArtistSummary, Track } from './catalog'

export interface StoryAuthor {
  id: string
  username: string
  avatar_url: string | null
}

export type StoryKind = 'track' | 'album' | 'artist' | 'piece'

/** What viewers see of a shared studio piece (links are signed and expire with the story). */
export interface StoryPiece {
  id: string
  title: string
  cover_url: string | null
  duration_sec: number
  /** Only once the owner has published it. */
  album_id: string | null
  artist_id: string | null
}

/** The audio that plays behind a story, whatever it is about. */
export interface StoryPreview {
  audio_url: string
  start_sec: number
}

export interface Story {
  id: string
  kind: StoryKind
  caption: string | null
  /** Two hex colours, "#RRGGBB,#RRGGBB". */
  background_color: string
  created_at: string
  expires_at: string
  user: StoryAuthor
  /** Whichever of these the story is about; the other two are null. */
  track: Track | null
  album: AlbumSummary | null
  artist: ArtistSummary | null
  piece: StoryPiece | null
  /** The catalog track behind an album/artist/track story. */
  preview_track: Track | null
  /** What actually plays; null when there is nothing to play. */
  preview: StoryPreview | null
}

export interface StoryGroup {
  user: StoryAuthor
  stories: Story[]
}

/** Exactly one of the four ids. */
export interface StoryInput {
  track_id?: string
  album_id?: string
  artist_id?: string
  piece_id?: string
  caption?: string | null
  background_color: string
}

/** What a person is about to share, before it becomes a story. */
export type StorySubject =
  | { kind: 'track'; track: Track }
  | { kind: 'album'; album: AlbumSummary }
  | { kind: 'artist'; artist: ArtistSummary }
  | { kind: 'piece'; piece: StoryPiece; ownerName: string }
