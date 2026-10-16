import type {
  AlbumDetail,
  AlbumSummary,
  ArtistDetail,
  ArtistSummary,
  Track,
} from '../types/catalog'
import { json } from './utils'

export const ARTIST: ArtistSummary = { id: 'artist-1', name: 'Nova Drift', image_url: null }

export const ALBUM: AlbumSummary = {
  id: 'album-1',
  title: 'Neon Horizons',
  cover_url: 'https://img.example/neon.jpg',
  release_year: 2023,
  artist: ARTIST,
}

const track = (n: number, title: string, duration: number): Track => ({
  id: `track-${n}`,
  title,
  track_number: n,
  duration_sec: duration,
  audio_url: `https://audio.example/${n}.mp3`,
  preview_start_sec: 10,
  album: ALBUM,
  genres: ['Electronic'],
})

export const TRACKS: Track[] = [
  track(1, 'Afterglow', 200),
  track(2, 'City Lights Fade', 180),
  track(3, 'Midnight Circuit', 240),
]

export const ALBUM_DETAIL: AlbumDetail = { ...ALBUM, tracks: TRACKS }

export const ARTIST_DETAIL: ArtistDetail = {
  ...ARTIST,
  bio: 'Synth-driven electronic duo.',
  albums: [ALBUM],
  top_tracks: TRACKS,
}

/** Handlers for everything the Home page requests. */
export const homeApi = {
  // Shell-level requests every signed-in page makes.
  'GET /api/playlists': () => json([]),
  'GET /api/stories/feed': () => json([]),
  'GET /api/users/:username/stories': () => json([]),
  'GET /api/library/favorites/ids': () => json([]),
  'GET /api/library/recently-played?limit=12': () => json([]),
  'GET /api/tracks?sort=popular&limit=12': () => json(TRACKS),
  'GET /api/users/search?q=:q': () => json([]),
  'GET /api/albums?limit=12': () => json([ALBUM]),
  'GET /api/artists?limit=12': () => json([ARTIST]),
}
