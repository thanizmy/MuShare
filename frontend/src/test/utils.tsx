import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

import App from '../App'
import { routes } from '../routes/routes'
import type { AuthResponse, User } from '../types/auth'

export const USER: User = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'ada@example.com',
  username: 'ada_l',
  avatar_url: null,
  bio: null,
  created_at: '2026-10-16T00:00:00Z',
}

export const AUTH: AuthResponse = { user: USER, access_token: 'access-1', token_type: 'bearer' }

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export interface RouteContext {
  params: Record<string, string>
  /** Parsed JSON request body, if any. */
  body: any // eslint-disable-line @typescript-eslint/no-explicit-any
}

type Handler = (init: RequestInit, ctx: RouteContext) => Response | Promise<Response>

/** "GET /api/playlists/:id" -> matcher with named params. */
function compileRoute(key: string) {
  const names: string[] = []
  const source = key
    .split(/(:[A-Za-z_]+)/)
    .map((part) => {
      if (part.startsWith(':')) {
        names.push(part.slice(1))
        return '([^/?]+)'
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('')
  return { regex: new RegExp(`^${source}$`), names }
}

/**
 * Stub fetch with handlers keyed "METHOD /api/path". Keys with ":name" segments match
 * any value and expose it as ctx.params. Unhandled calls fail the test loudly.
 */
export function mockApi(handlers: Record<string, Handler>) {
  const patterns = Object.entries(handlers)
    .filter(([key]) => key.includes(':'))
    .map(([key, handler]) => ({ ...compileRoute(key), handler }))

  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    const exact = handlers[key]
    if (exact) return exact(init, { params: {}, body })
    for (const { regex, names, handler } of patterns) {
      const match = regex.exec(key)
      if (match) {
        const params = Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(match[i + 1])]))
        return handler(init, { params, body })
      }
    }
    throw new Error(`Unexpected request: ${key}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export const callsTo = (fetchMock: ReturnType<typeof mockApi>, key: string) =>
  fetchMock.mock.calls.filter(([url, init]) => `${init?.method ?? 'GET'} ${url}` === key)

export function renderApp(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<App router={router} queryClient={queryClient} />)
  return router
}
