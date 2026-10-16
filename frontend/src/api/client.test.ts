import { describe, expect, it, vi } from 'vitest'

import { callsTo, AUTH, json, mockApi } from '../test/utils'
import { ApiError, configureAuthBridge, request } from './client'

function bridge(token: string | null = 'old-token') {
  const spies = {
    getAccessToken: vi.fn(() => token),
    onSessionRefreshed: vi.fn(),
    onAuthFailure: vi.fn(),
  }
  configureAuthBridge(spies)
  return spies
}

const authHeader = (init: RequestInit) => (init.headers as Record<string, string>).Authorization

describe('request', () => {
  it('sends the bearer token, cookies and JSON body', async () => {
    bridge()
    const fetchMock = mockApi({ 'POST /api/things': () => json({ ok: true }) })

    await request('/things', { method: 'POST', body: { a: 1 } })

    const [, init] = fetchMock.mock.calls[0]
    expect(authHeader(init!)).toBe('Bearer old-token')
    expect(init).toMatchObject({ credentials: 'include', body: '{"a":1}' })
    expect((init!.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('omits Authorization when signed out', async () => {
    bridge(null)
    const fetchMock = mockApi({ 'GET /api/things': () => json([]) })
    await request('/things')
    expect(authHeader(fetchMock.mock.calls[0][1]!)).toBeUndefined()
  })

  it('returns undefined for 204 responses', async () => {
    bridge()
    mockApi({ 'DELETE /api/things/1': () => new Response(null, { status: 204 }) })
    await expect(request('/things/1', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('refreshes once on 401 and retries with the new token', async () => {
    const spies = bridge()
    let attempt = 0
    const fetchMock = mockApi({
      'GET /api/private': (init) => {
        attempt += 1
        return attempt === 1 ? json({ detail: 'expired' }, 401) : json({ secret: authHeader(init) })
      },
      'POST /api/auth/refresh': () => json(AUTH),
    })
    spies.getAccessToken.mockReturnValueOnce('old-token').mockReturnValue('access-1')

    await expect(request('/private')).resolves.toEqual({ secret: 'Bearer access-1' })

    expect(spies.onSessionRefreshed).toHaveBeenCalledWith(AUTH)
    expect(spies.onAuthFailure).not.toHaveBeenCalled()
    expect(callsTo(fetchMock, 'POST /api/auth/refresh')).toHaveLength(1)
  })

  it('shares a single refresh between concurrent 401s', async () => {
    bridge()
    const seen = new Set<string>()
    const fetchMock = mockApi({
      'GET /api/a': () => (seen.has('a') ? json({ a: 1 }) : (seen.add('a'), json({}, 401))),
      'GET /api/b': () => (seen.has('b') ? json({ b: 1 }) : (seen.add('b'), json({}, 401))),
      'POST /api/auth/refresh': async () => {
        await new Promise((r) => setTimeout(r, 10))
        return json(AUTH)
      },
    })

    const [a, b] = await Promise.all([request('/a'), request('/b')])

    expect(a).toEqual({ a: 1 })
    expect(b).toEqual({ b: 1 })
    expect(callsTo(fetchMock, 'POST /api/auth/refresh')).toHaveLength(1)
  })

  it('reports an auth failure when the refresh is rejected', async () => {
    const spies = bridge()
    mockApi({
      'GET /api/private': () => json({ detail: 'Invalid or expired token' }, 401),
      'POST /api/auth/refresh': () => json({ detail: 'Session expired' }, 401),
    })

    await expect(request('/private')).rejects.toMatchObject({
      status: 401,
      message: 'Invalid or expired token',
    })
    expect(spies.onAuthFailure).toHaveBeenCalledOnce()
  })

  it('does not attempt a refresh when skipRefresh is set', async () => {
    const spies = bridge()
    const fetchMock = mockApi({
      'POST /api/auth/login': () => json({ detail: 'Incorrect email or password' }, 401),
    })

    await expect(
      request('/auth/login', { method: 'POST', body: {}, skipRefresh: true }),
    ).rejects.toThrow('Incorrect email or password')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(spies.onAuthFailure).not.toHaveBeenCalled()
  })

  it('turns FastAPI validation errors into a readable message', async () => {
    bridge()
    mockApi({
      'POST /api/auth/register': () =>
        json({ detail: [{ msg: 'Value error, Password must contain a number' }] }, 422),
    })

    const error = await request('/auth/register', { method: 'POST', body: {}, skipRefresh: true }).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toBe('Password must contain a number')
  })

  it('falls back to the status text for non-JSON errors', async () => {
    bridge()
    mockApi({
      'GET /api/boom': () => new Response('<html>', { status: 502, statusText: 'Bad Gateway' }),
    })
    await expect(request('/boom')).rejects.toMatchObject({ status: 502, message: 'Bad Gateway' })
  })
})
