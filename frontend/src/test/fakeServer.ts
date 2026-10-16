import type { PlaylistDetail, PlaylistSummary } from '../types/library'
import { ALBUM, TRACKS } from './fixtures'
import { USER, json, type RouteContext } from './utils'

interface StoredPlaylist {
  id: string
  title: string
  description: string | null
  is_public: boolean
  owner: { id: string; username: string }
  entries: { entry_id: string; track_id: string }[]
}

type Handler = (init: RequestInit, ctx: RouteContext) => Response | Promise<Response>

const trackById = (id: string) => TRACKS.find((t) => t.id === id)

/**
 * A small in-memory stand-in for the library API (favorites, playlists, history) with the
 * same rules as the real one, plus hooks to hold or fail a request.
 */
export function createFakeServer() {
  const state = {
    favorites: [] as string[],
    history: [] as string[],
    playlists: [] as StoredPlaylist[],
  }
  const gates = new Map<string, Promise<void>>()
  const failures = new Map<string, { status: number; detail: string }>()
  let counter = 0
  const nextId = (prefix: string) => `${prefix}-${++counter}`

  const summary = (p: StoredPlaylist): PlaylistSummary => ({
    id: p.id,
    title: p.title,
    description: p.description,
    is_public: p.is_public,
    track_count: p.entries.length,
    cover_url: p.entries[0] ? ALBUM.cover_url : null,
    owner: p.owner,
    created_at: '2026-10-16T00:00:00Z',
  })

  const detail = (p: StoredPlaylist): PlaylistDetail => ({
    ...summary(p),
    entries: p.entries.map((e, position) => ({
      entry_id: e.entry_id,
      position,
      track: trackById(e.track_id)!,
    })),
  })

  const mine = () => state.playlists.filter((p) => p.owner.id === USER.id)
  const notFound = (what: string) => json({ detail: `${what} not found` }, 404)

  /** Look up a playlist as the signed-in user would see it. */
  const visible = (id: string) => {
    const playlist = state.playlists.find((p) => p.id === id)
    return playlist && (playlist.owner.id === USER.id || playlist.is_public) ? playlist : undefined
  }
  const owned = (id: string) => state.playlists.find((p) => p.id === id && p.owner.id === USER.id)

  const routes: Record<string, Handler> = {}
  const define = (key: string, handler: Handler) => {
    routes[key] = async (init, ctx) => {
      await gates.get(key)
      const failure = failures.get(key)
      if (failure) {
        failures.delete(key)
        return json({ detail: failure.detail }, failure.status)
      }
      return handler(init, ctx)
    }
  }

  // ---- favorites
  define('GET /api/library/favorites/ids', () => json(state.favorites))
  define('GET /api/library/favorites', () =>
    json(state.favorites.map((id) => trackById(id)).filter(Boolean)),
  )
  define('PUT /api/library/favorites/:id', (_, { params }) => {
    if (!trackById(params.id)) return notFound('Track')
    state.favorites = [params.id, ...state.favorites.filter((id) => id !== params.id)]
    return new Response(null, { status: 204 })
  })
  define('DELETE /api/library/favorites/:id', (_, { params }) => {
    state.favorites = state.favorites.filter((id) => id !== params.id)
    return new Response(null, { status: 204 })
  })

  // ---- history
  define('POST /api/library/history', (_, { body }) => {
    state.history.push(body.track_id)
    return new Response(null, { status: 204 })
  })
  define('GET /api/library/recently-played?limit=12', () => {
    const distinct = [...new Set([...state.history].reverse())]
    return json(distinct.map((id) => trackById(id)).filter(Boolean))
  })

  // ---- playlists
  define('GET /api/playlists', () => json(mine().map(summary)))
  define('POST /api/playlists', (_, { body }) => {
    const playlist: StoredPlaylist = {
      id: nextId('playlist'),
      title: body.title,
      description: body.description ?? null,
      is_public: body.is_public ?? false,
      owner: { id: USER.id, username: USER.username },
      entries: [],
    }
    state.playlists.unshift(playlist)
    return json(summary(playlist), 201)
  })
  define('GET /api/playlists/:id', (_, { params }) => {
    const playlist = visible(params.id)
    return playlist ? json(detail(playlist)) : notFound('Playlist')
  })
  define('PATCH /api/playlists/:id', (_, { params, body }) => {
    const playlist = owned(params.id)
    if (!playlist) return notFound('Playlist')
    if ('title' in body) playlist.title = body.title
    if ('description' in body) playlist.description = body.description || null
    if ('is_public' in body) playlist.is_public = body.is_public
    return json(summary(playlist))
  })
  define('DELETE /api/playlists/:id', (_, { params }) => {
    if (!owned(params.id)) return notFound('Playlist')
    state.playlists = state.playlists.filter((p) => p.id !== params.id)
    return new Response(null, { status: 204 })
  })
  define('POST /api/playlists/:id/tracks', (_, { params, body }) => {
    const playlist = owned(params.id)
    if (!playlist) return notFound('Playlist')
    if (!trackById(body.track_id)) return notFound('Track')
    if (playlist.entries.some((e) => e.track_id === body.track_id)) {
      return json({ detail: 'This track is already in the playlist' }, 409)
    }
    playlist.entries.push({ entry_id: nextId('entry'), track_id: body.track_id })
    return json(detail(playlist), 201)
  })
  define('DELETE /api/playlists/:id/tracks/:entry', (_, { params }) => {
    const playlist = owned(params.id)
    if (!playlist) return notFound('Playlist')
    playlist.entries = playlist.entries.filter((e) => e.entry_id !== params.entry)
    return json(detail(playlist))
  })
  define('PUT /api/playlists/:id/tracks/order', (_, { params, body }) => {
    const playlist = owned(params.id)
    if (!playlist) return notFound('Playlist')
    const byId = new Map(playlist.entries.map((e) => [e.entry_id, e]))
    playlist.entries = (body.entry_ids as string[]).map((id) => byId.get(id)!)
    return json(detail(playlist))
  })

  return {
    state,
    routes,
    /** Seed a playlist, by default one owned by someone else. */
    addPlaylist(init: Partial<StoredPlaylist> & { title: string; tracks?: string[] }) {
      const playlist: StoredPlaylist = {
        id: init.id ?? nextId('playlist'),
        title: init.title,
        description: init.description ?? null,
        is_public: init.is_public ?? false,
        owner: init.owner ?? { id: USER.id, username: USER.username },
        entries: (init.tracks ?? []).map((track_id) => ({ entry_id: nextId('entry'), track_id })),
      }
      state.playlists.push(playlist)
      return playlist
    },
    /** Make the next call to `key` wait until the returned function is called. */
    hold(key: string) {
      let release!: () => void
      gates.set(key, new Promise<void>((resolve) => (release = resolve)))
      return () => {
        gates.delete(key)
        release()
      }
    },
    /** Make the next call to `key` fail. */
    failNext(key: string, status: number, detail: string) {
      failures.set(key, { status, detail })
    },
  }
}

