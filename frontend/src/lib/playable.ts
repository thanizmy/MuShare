import type { Track } from '../types/catalog'

/** A track can be played unless its artist hid it (which also blanks its audio link). */
export const isPlayable = (track: Pick<Track, 'is_hidden' | 'audio_url'>): boolean =>
  !track.is_hidden && track.audio_url !== ''
