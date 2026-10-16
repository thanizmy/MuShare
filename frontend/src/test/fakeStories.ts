import type { Story, StoryAuthor, StoryGroup } from '../types/stories'
import { ALBUM, ARTIST, TRACKS } from './fixtures'
import { USER, json, type RouteContext } from './utils'

type Handler = (init: RequestInit, ctx: RouteContext) => Response | Promise<Response>

export const ME: StoryAuthor = { id: USER.id, username: USER.username, avatar_url: null }
export const BOB: StoryAuthor = { id: 'u-bob', username: 'bobby', avatar_url: null }
export const CARA: StoryAuthor = { id: 'u-cara', username: 'carol', avatar_url: null }

let counter = 0

function baseStory(user: StoryAuthor, overrides: Partial<Story>): Story {
  counter += 1
  const story: Story = {
    id: `story-${counter}`,
    kind: 'track',
    caption: null,
    background_color: '#1DB954,#0B3D2E',
    created_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
    expires_at: new Date(Date.now() + 21 * 3600_000).toISOString(),
    user,
    track: null,
    album: null,
    artist: null,
    piece: null,
    preview_track: null,
    preview: null,
    ...overrides,
  }
  // What plays follows the catalog track behind the story, as the real API does it,
  // unless a test sets it explicitly.
  if (!('preview' in overrides) && story.preview_track && !story.preview_track.is_hidden) {
    story.preview = {
      audio_url: story.preview_track.audio_url,
      start_sec: story.preview_track.preview_start_sec,
    }
  }
  return story
}

/** A story about one track. */
export function makeStory(user: StoryAuthor, trackIndex = 0, overrides: Partial<Story> = {}): Story {
  const track = TRACKS[trackIndex]
  return baseStory(user, { kind: 'track', track, preview_track: track, ...overrides })
}

/** A story about an album; its first track plays behind it unless overridden. */
export function makeAlbumStory(user: StoryAuthor, overrides: Partial<Story> = {}): Story {
  return baseStory(user, { kind: 'album', album: ALBUM, preview_track: TRACKS[0], ...overrides })
}

/** A story about an artist; their top track plays behind it unless overridden. */
export function makeArtistStory(user: StoryAuthor, overrides: Partial<Story> = {}): Story {
  return baseStory(user, {
    kind: 'artist',
    artist: { ...ARTIST, image_url: 'https://img.example/nova.jpg' },
    preview_track: TRACKS[1],
    ...overrides,
  })
}

/** A story about one of the author's own studio pieces; it plays a signed link. */
export function makePieceStory(user: StoryAuthor, overrides: Partial<Story> = {}): Story {
  return baseStory(user, {
    kind: 'piece',
    piece: {
      id: 'piece-1',
      title: 'Zephyr Lullaby',
      cover_url: 'https://img.example/zephyr.jpg',
      duration_sec: 90,
      album_id: null,
      artist_id: null,
    },
    preview: { audio_url: '/api/media/pieces/piece-1/audio?token=signed', start_sec: 22 },
    ...overrides,
  })
}

/** In-memory stand-in for the stories API. */
export function createFakeStories(initial: StoryGroup[] = []) {
  const state = {
    groups: initial.map((g) => ({ ...g, stories: [...g.stories] })),
    /** Bodies of every POST /api/stories, for asserting exactly what was sent. */
    posted: [] as Array<Record<string, unknown>>,
  }
  const failures = new Map<string, { status: number; detail: string }>()
  const routes: Record<string, Handler> = {}

  const define = (key: string, handler: Handler) => {
    routes[key] = (init, ctx) => {
      const failure = failures.get(key)
      if (failure) {
        failures.delete(key)
        return json({ detail: failure.detail }, failure.status)
      }
      return handler(init, ctx)
    }
  }

  define('GET /api/stories/feed', () => json(state.groups))

  define('POST /api/stories', (_, { body }) => {
    state.posted.push(body)
    const common = {
      caption: body.caption ?? null,
      background_color: body.background_color,
      created_at: new Date().toISOString(),
    }
    let story: Story
    if (body.track_id) {
      const index = TRACKS.findIndex((t) => t.id === body.track_id)
      if (index < 0) return json({ detail: 'Track not found' }, 404)
      story = makeStory(ME, index, common)
    } else if (body.album_id) {
      if (body.album_id !== ALBUM.id) return json({ detail: 'Album not found' }, 404)
      story = makeAlbumStory(ME, common)
    } else if (body.artist_id) {
      if (body.artist_id !== ARTIST.id) return json({ detail: 'Artist not found' }, 404)
      story = makeArtistStory(ME, common)
    } else if (body.piece_id) {
      story = makePieceStory(ME, {
        ...common,
        piece: {
          id: body.piece_id,
          title: 'Shared piece',
          cover_url: null,
          duration_sec: 90,
          album_id: null,
          artist_id: null,
        },
      })
    } else {
      return json({ detail: 'Share exactly one of track_id, album_id or artist_id' }, 422)
    }
    const mine = state.groups.find((g) => g.user.id === ME.id)
    if (mine) mine.stories.push(story)
    else state.groups.unshift({ user: ME, stories: [story] })
    return json(story, 201)
  })

  define('DELETE /api/stories/:id', (_, { params }) => {
    for (const group of state.groups) {
      const index = group.stories.findIndex((s) => s.id === params.id)
      if (index >= 0 && group.user.id === ME.id) {
        group.stories.splice(index, 1)
        state.groups = state.groups.filter((g) => g.stories.length > 0)
        return new Response(null, { status: 204 })
      }
    }
    return json({ detail: 'Story not found' }, 404)
  })

  define('GET /api/users/:username/stories', (_, { params }) => {
    const group = state.groups.find(
      (g) => g.user.username.toLowerCase() === params.username.toLowerCase(),
    )
    return json(group?.stories ?? [])
  })

  return {
    routes,
    state,
    failNext: (key: string, status: number, detail: string) =>
      failures.set(key, { status, detail }),
  }
}
