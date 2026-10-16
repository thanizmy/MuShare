import { describe, expect, it } from 'vitest'

import { ALBUM, ARTIST, TRACKS } from '../test/fixtures'
import type { Story } from '../types/stories'
import { displayForStory, displayForSubject, subjectOfStory, subjectToInput } from './storyDisplay'

const base: Omit<Story, 'kind' | 'track' | 'album' | 'artist' | 'piece'> = {
  id: 's1',
  caption: null,
  background_color: '#1DB954,#0B3D2E',
  created_at: '2026-10-16T00:00:00Z',
  expires_at: '2026-10-17T00:00:00Z',
  user: { id: 'u1', username: 'ada', avatar_url: null },
  preview_track: TRACKS[0],
  preview: { audio_url: TRACKS[0].audio_url, start_sec: 10 },
}

describe('displayForSubject', () => {
  it('shows a track with its album cover and links to the album', () => {
    expect(displayForSubject({ kind: 'track', track: TRACKS[0] })).toEqual({
      label: 'Track',
      title: 'Afterglow',
      subtitle: 'Nova Drift',
      imageUrl: ALBUM.cover_url,
      round: false,
      href: '/albums/album-1',
      linkLabel: 'Open album',
    })
  })

  it('shows an album with its cover, artist and year, and links to the album', () => {
    expect(displayForSubject({ kind: 'album', album: ALBUM })).toEqual({
      label: 'Album',
      title: 'Neon Horizons',
      subtitle: 'Nova Drift · 2023',
      imageUrl: ALBUM.cover_url,
      round: false,
      href: '/albums/album-1',
      linkLabel: 'Open album',
    })
  })

  it('leaves the year out when an album has none', () => {
    const display = displayForSubject({ kind: 'album', album: { ...ALBUM, release_year: null } })
    expect(display.subtitle).toBe('Nova Drift')
  })

  it('shows an artist with a round profile picture and links to their page', () => {
    const artist = { ...ARTIST, image_url: 'https://img.example/nova.jpg' }
    expect(displayForSubject({ kind: 'artist', artist })).toEqual({
      label: 'Artist',
      title: 'Nova Drift',
      subtitle: 'Artist',
      imageUrl: 'https://img.example/nova.jpg',
      round: true,
      href: '/artists/artist-1',
      linkLabel: 'View artist',
    })
  })
})

describe('story helpers', () => {
  it('reads the subject out of a story by kind', () => {
    const album: Story = {
      ...base,
      kind: 'album',
      track: null,
      album: ALBUM,
      artist: null,
      piece: null,
    }
    expect(subjectOfStory(album)).toEqual({ kind: 'album', album: ALBUM })
    expect(displayForStory(album)?.linkLabel).toBe('Open album')
  })

  it('returns null for a story whose subject is missing', () => {
    const broken: Story = {
      ...base,
      kind: 'artist',
      track: null,
      album: null,
      artist: null,
      piece: null,
    }
    expect(subjectOfStory(broken)).toBeNull()
    expect(displayForStory(broken)).toBeNull()
  })

  it('shows a studio piece as an original, linking to the album only once published', () => {
    const piece = {
      id: 'p1',
      title: 'Zephyr Lullaby',
      cover_url: 'https://img.example/z.jpg',
      duration_sec: 90,
      album_id: null,
      artist_id: null,
    }
    const draft = displayForSubject({ kind: 'piece', piece, ownerName: 'maker' })
    expect(draft).toMatchObject({
      label: 'Original',
      title: 'Zephyr Lullaby',
      subtitle: 'by maker',
      imageUrl: 'https://img.example/z.jpg',
      round: false,
      href: null,
    })
    const live = displayForSubject({
      kind: 'piece',
      piece: { ...piece, album_id: 'alb-9', artist_id: 'art-9' },
      ownerName: 'maker',
    })
    expect(live.href).toBe('/albums/alb-9')
  })

  it('reads a piece story and names its owner from the story author', () => {
    const story: Story = {
      ...base,
      kind: 'piece',
      track: null,
      album: null,
      artist: null,
      piece: { id: 'p1', title: 'T', cover_url: null, duration_sec: 5, album_id: null, artist_id: null },
    }
    expect(subjectOfStory(story)).toMatchObject({ kind: 'piece', ownerName: 'ada' })
  })

  it('maps a subject to exactly the one id the API expects', () => {
    expect(subjectToInput({ kind: 'track', track: TRACKS[1] })).toEqual({ track_id: 'track-2' })
    expect(subjectToInput({ kind: 'album', album: ALBUM })).toEqual({ album_id: 'album-1' })
    expect(subjectToInput({ kind: 'artist', artist: ARTIST })).toEqual({ artist_id: 'artist-1' })
    expect(
      subjectToInput({
        kind: 'piece',
        ownerName: 'x',
        piece: { id: 'p1', title: 'T', cover_url: null, duration_sec: 5, album_id: null, artist_id: null },
      }),
    ).toEqual({ piece_id: 'p1' })
  })
})
