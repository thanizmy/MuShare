import type { UserProfile, UserSummary, Wrapped, WrappedPeriod } from '../types/social'
import { USER, json, type RouteContext } from './utils'

export interface FakeUser {
  id: string
  username: string
  bio: string | null
  avatar_url: string | null
}

type Handler = (init: RequestInit, ctx: RouteContext) => Response | Promise<Response>

const key = (name: string) => name.toLowerCase()

/** In-memory stand-in for the social API, with the same rules as the real one. */
export function createFakeSocial(others: FakeUser[] = []) {
  const me: FakeUser = { id: USER.id, username: USER.username, bio: null, avatar_url: null }
  const users = new Map<string, FakeUser>([me, ...others].map((u) => [key(u.username), u]))
  const state = {
    follows: new Set<string>(), // "follower>following"
    likes: new Set<string>(), // "liker>liked"
    wrapped: new Map<string, Partial<Record<WrappedPeriod, Wrapped>>>(),
  }
  const gates = new Map<string, Promise<void>>()
  const failures = new Map<string, { status: number; detail: string }>()

  const find = (username: string) => users.get(key(username))
  const countWhere = (set: Set<string>, pick: (edge: string[]) => string, name: string) =>
    [...set].filter((edge) => pick(edge.split('>')) === key(name)).length

  const profile = (user: FakeUser): UserProfile => ({
    id: user.id,
    username: user.username,
    avatar_url: user.avatar_url,
    bio: user.bio,
    created_at: '2026-10-16T00:00:00Z',
    follower_count: countWhere(state.follows, (e) => e[1], user.username),
    following_count: countWhere(state.follows, (e) => e[0], user.username),
    like_count: countWhere(state.likes, (e) => e[1], user.username),
    is_me: user.id === me.id,
    is_following: state.follows.has(`${key(me.username)}>${key(user.username)}`),
    is_liked: state.likes.has(`${key(me.username)}>${key(user.username)}`),
  })

  const summary = (user: FakeUser): UserSummary => ({
    id: user.id,
    username: user.username,
    avatar_url: user.avatar_url,
    bio: user.bio,
    is_following: state.follows.has(`${key(me.username)}>${key(user.username)}`),
  })

  const notFound = () => json({ detail: 'User not found' }, 404)
  const routes: Record<string, Handler> = {}
  const define = (route: string, handler: Handler) => {
    routes[route] = async (init, ctx) => {
      await gates.get(route)
      const failure = failures.get(route)
      if (failure) {
        failures.delete(route)
        return json({ detail: failure.detail }, failure.status)
      }
      return handler(init, ctx)
    }
  }

  define('GET /api/users/:username', (_, { params }) => {
    const user = find(params.username)
    return user ? json(profile(user)) : notFound()
  })

  const edge = (set: Set<string>, selfMessage: string, add: boolean): Handler => (_, { params }) => {
    const user = find(params.username)
    if (!user) return notFound()
    if (user.id === me.id) return json({ detail: selfMessage }, 400)
    const id = `${key(me.username)}>${key(user.username)}`
    if (add) set.add(id)
    else set.delete(id)
    return json(profile(user))
  }
  define('PUT /api/users/:username/follow', edge(state.follows, "You can't follow yourself", true))
  define('DELETE /api/users/:username/follow', edge(state.follows, '', false))
  define('PUT /api/users/:username/like', edge(state.likes, "You can't like your own profile", true))
  define('DELETE /api/users/:username/like', edge(state.likes, '', false))

  define('GET /api/users/:username/followers?limit=50', (_, { params }) => {
    const user = find(params.username)
    if (!user) return notFound()
    const names = [...state.follows]
      .map((e) => e.split('>'))
      .filter(([, following]) => following === key(user.username))
      .map(([follower]) => find(follower)!)
    return json(names.map(summary))
  })
  define('GET /api/users/:username/following?limit=50', (_, { params }) => {
    const user = find(params.username)
    if (!user) return notFound()
    const names = [...state.follows]
      .map((e) => e.split('>'))
      .filter(([follower]) => follower === key(user.username))
      .map(([, following]) => find(following)!)
    return json(names.map(summary))
  })

  define('GET /api/users/search?q=:q', (_, { params }) => {
    const q = params.q.replace(/\+/g, ' ').toLowerCase()
    return json([...users.values()].filter((u) => u.username.toLowerCase().includes(q)).map(summary))
  })

  define('GET /api/users/:username/wrapped?period=:period', (_, { params }) => {
    const user = find(params.username)
    if (!user) return notFound()
    const period = params.period as WrappedPeriod
    const data = state.wrapped.get(key(user.username))?.[period]
    return json(
      data ?? {
        username: user.username,
        period,
        total_plays: 0,
        total_minutes: 0,
        top_artists: [],
        top_tracks: [],
        top_genres: [],
      },
    )
  })

  define('PATCH /api/users/me', (_, { body }) => {
    if ('bio' in body) me.bio = body.bio
    if ('avatar_url' in body) me.avatar_url = body.avatar_url
    return json(profile(me))
  })

  return {
    routes,
    state,
    me,
    follow: (follower: string, following: string) =>
      state.follows.add(`${key(follower)}>${key(following)}`),
    setWrapped: (username: string, period: WrappedPeriod, data: Wrapped) => {
      const existing = state.wrapped.get(key(username)) ?? {}
      state.wrapped.set(key(username), { ...existing, [period]: data })
    },
    hold(route: string) {
      let release!: () => void
      gates.set(route, new Promise<void>((resolve) => (release = resolve)))
      return () => {
        gates.delete(route)
        release()
      }
    },
    failNext(route: string, status: number, detail: string) {
      failures.set(route, { status, detail })
    },
  }
}
