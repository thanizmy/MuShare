import type { Track } from '../types/catalog'
import type { StoryPiece } from '../types/stories'
import type { Piece } from '../types/studio'

/** Ids of tracks built from an unpublished piece start with this, and exist nowhere else. */
export const PRIVATE_TRACK_PREFIX = 'studio:'

/** Whether a track only exists in someone's studio (so it can't be liked, logged or shared by id). */
export const isPrivateStudioTrack = (track: Pick<Track, 'id'>): boolean =>
  track.id.startsWith(PRIVATE_TRACK_PREFIX)

/**
 * Makes a studio piece playable by the normal player and queue.
 *
 * A published piece uses its real catalog ids, so everything that works on a catalog track
 * (links, likes, history) works on it. A private one gets stand-in ids that the UI recognises
 * and keeps away from features that need a real track.
 */
export function pieceToTrack(piece: Piece, artistName: string): Track {
  const live = piece.status === 'published' && piece.track_id && piece.album_id && piece.artist_id
  return {
    id: live ? (piece.track_id as string) : `${PRIVATE_TRACK_PREFIX}${piece.id}`,
    title: piece.title,
    track_number: 1,
    duration_sec: piece.duration_sec,
    audio_url: piece.audio_url,
    preview_start_sec: Math.min(45, Math.floor(piece.duration_sec / 4)),
    album: {
      id: live ? (piece.album_id as string) : `${PRIVATE_TRACK_PREFIX}${piece.id}`,
      title: piece.title,
      cover_url: piece.cover_url,
      release_year: null,
      artist: {
        id: live ? (piece.artist_id as string) : `${PRIVATE_TRACK_PREFIX}${piece.id}`,
        name: artistName,
        image_url: null,
      },
    },
    genres: [],
    is_hidden: false,
    studio_piece_id: piece.id,
  }
}

/**
 * The part of a piece that goes into a story. Links to the catalog are included only while
 * the piece is actually published, since a private piece has no page to link to.
 */
export function pieceToStoryPiece(piece: Piece): StoryPiece {
  const live = piece.status === 'published'
  return {
    id: piece.id,
    title: piece.title,
    cover_url: piece.cover_url,
    duration_sec: piece.duration_sec,
    album_id: live ? piece.album_id : null,
    artist_id: live ? piece.artist_id : null,
  }
}
