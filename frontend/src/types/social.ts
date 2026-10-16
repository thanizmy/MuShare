import type { ArtistSummary, Track } from './catalog'

export interface UserSummary {
  id: string
  username: string
  avatar_url: string | null
  bio: string | null
  is_following: boolean
}

export interface UserProfile {
  id: string
  username: string
  avatar_url: string | null
  bio: string | null
  created_at: string
  follower_count: number
  following_count: number
  like_count: number
  is_me: boolean
  is_following: boolean
  is_liked: boolean
}

export interface ProfileUpdate {
  bio?: string | null
  avatar_url?: string | null
}

export type WrappedPeriod = 'all' | '30d'

export interface TopArtist {
  artist: ArtistSummary
  plays: number
}

export interface TopTrack {
  track: Track
  plays: number
}

export interface TopGenre {
  genre: string
  plays: number
}

export interface Wrapped {
  username: string
  period: WrappedPeriod
  total_plays: number
  total_minutes: number
  top_artists: TopArtist[]
  top_tracks: TopTrack[]
  top_genres: TopGenre[]
}
