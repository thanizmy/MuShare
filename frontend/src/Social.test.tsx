import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { createFakeSocial, type FakeUser } from './test/fakeSocial'
import { ARTIST, TRACKS, homeApi } from './test/fixtures'
import { AUTH, json, mockApi, renderApp } from './test/utils'
import type { Wrapped } from './types/social'

const BOB: FakeUser = { id: 'u-bob', username: 'bobby', bio: 'Jazz is life', avatar_url: null }
const CARA: FakeUser = { id: 'u-cara', username: 'carol', bio: null, avatar_url: null }

function boot(path: string, others: FakeUser[] = [BOB, CARA]) {
  const social = createFakeSocial(others)
  const fetchMock = mockApi({
    'POST /api/auth/refresh': () => json(AUTH),
    ...homeApi,
    ...social.routes,
  })
  renderApp(path)
  return { social, fetchMock }
}

const followButton = (name: string) => screen.getByRole('button', { name: `Follow ${name}` })
const likeButton = (name: string) => screen.getByRole('button', { name: `Like ${name}'s profile` })
const toastRegion = () => screen.getAllByRole('status').find((el) => el.hasAttribute('aria-live'))!

const wrapped = (overrides: Partial<Wrapped> = {}): Wrapped => ({
  username: 'bobby',
  period: 'all',
  total_plays: 42,
  total_minutes: 175,
  top_artists: [
    { artist: ARTIST, plays: 30 },
    { artist: { id: 'artist-2', name: 'Kestrel Run', image_url: null }, plays: 12 },
  ],
  top_tracks: [
    { track: TRACKS[0], plays: 20 },
    { track: TRACKS[1], plays: 10 },
  ],
  top_genres: [
    { genre: 'Electronic', plays: 30 },
    { genre: 'Rock', plays: 12 },
    { genre: 'Jazz', plays: 3 },
  ],
  ...overrides,
})

// -------------------------------------------------------------------- profiles

describe('profile page', () => {
  it("shows another user's profile with follow and like controls", async () => {
    const { social } = boot('/u/bobby')
    social.follow('carol', 'bobby')
    social.state.likes.add('carol>bobby')

    expect(await screen.findByRole('heading', { level: 1, name: 'bobby' })).toBeInTheDocument()
    expect(screen.getByText('Jazz is life')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /followers/ })).toHaveAttribute('href', '/u/bobby/followers')
    expect(screen.getByRole('link', { name: /following/ })).toHaveAttribute('href', '/u/bobby/following')

    expect(followButton('bobby')).toHaveAttribute('aria-pressed', 'false')
    expect(likeButton('bobby')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument()
  })

  it('looks usernames up case-insensitively', async () => {
    boot('/u/BOBBY')
    expect(await screen.findByRole('heading', { level: 1, name: 'bobby' })).toBeInTheDocument()
  })

  it('shows not-found for an unknown user', async () => {
    boot('/u/ghost')
    expect(await screen.findByText('User not found')).toBeInTheDocument()
  })

  it('follows instantly, before the server answers, and unfollows again', async () => {
    const { social } = boot('/u/bobby')
    await screen.findByRole('heading', { level: 1, name: 'bobby' })
    const release = social.hold('PUT /api/users/:username/follow')

    await userEvent.click(followButton('bobby'))

    await waitFor(() => expect(followButton('bobby')).toHaveAttribute('aria-pressed', 'true'))
    expect(followButton('bobby')).toHaveTextContent('Following')
    expect(screen.getByRole('link', { name: /followers/ })).toHaveTextContent('1 followers')
    expect(social.state.follows.size).toBe(0) // still in flight

    release()
    await waitFor(() => expect(social.state.follows.has('ada_l>bobby')).toBe(true))
    expect(followButton('bobby')).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(followButton('bobby'))
    await waitFor(() => expect(followButton('bobby')).toHaveAttribute('aria-pressed', 'false'))
    await waitFor(() => expect(social.state.follows.size).toBe(0))
    expect(screen.getByRole('link', { name: /followers/ })).toHaveTextContent('0 followers')
  })

  it('rolls a failed follow back and explains', async () => {
    const { social } = boot('/u/bobby')
    await screen.findByRole('heading', { level: 1, name: 'bobby' })
    social.failNext('PUT /api/users/:username/follow', 500, 'Follow service down')

    await userEvent.click(followButton('bobby'))

    expect(await within(toastRegion()).findByText('Follow service down')).toBeInTheDocument()
    await waitFor(() => expect(followButton('bobby')).toHaveAttribute('aria-pressed', 'false'))
    expect(screen.getByRole('link', { name: /followers/ })).toHaveTextContent('0 followers')
  })

  it('likes and unlikes a profile independently of following', async () => {
    const { social } = boot('/u/bobby')
    await screen.findByRole('heading', { level: 1, name: 'bobby' })

    await userEvent.click(likeButton('bobby'))
    await waitFor(() => expect(likeButton('bobby')).toHaveAttribute('aria-pressed', 'true'))
    expect(likeButton('bobby')).toHaveTextContent('1')
    await waitFor(() => expect(social.state.likes.has('ada_l>bobby')).toBe(true))
    expect(followButton('bobby')).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(likeButton('bobby'))
    await waitFor(() => expect(likeButton('bobby')).toHaveAttribute('aria-pressed', 'false'))
    expect(likeButton('bobby')).toHaveTextContent('0')
  })

  it('rolls a failed like back', async () => {
    const { social } = boot('/u/bobby')
    await screen.findByRole('heading', { level: 1, name: 'bobby' })
    social.failNext('PUT /api/users/:username/like', 500, 'Like failed')

    await userEvent.click(likeButton('bobby'))

    expect(await within(toastRegion()).findByText('Like failed')).toBeInTheDocument()
    await waitFor(() => expect(likeButton('bobby')).toHaveAttribute('aria-pressed', 'false'))
  })

  it('reaches your own profile from the top bar and offers editing, not following', async () => {
    boot('/')
    await userEvent.click(await screen.findByRole('link', { name: 'Your profile' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'ada_l' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit profile' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Follow / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Like / })).not.toBeInTheDocument()
  })

  it('edits bio and picture, and updates the top bar avatar', async () => {
    const { social } = boot('/u/ada_l')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit profile' }))
    const modal = within(await screen.findByRole('dialog', { name: 'Edit profile' }))

    await userEvent.type(modal.getByLabelText('Bio'), 'Synth enjoyer')
    await userEvent.type(modal.getByLabelText('Profile picture link'), 'https://img.example/me.png')
    await userEvent.click(modal.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Synth enjoyer')).toBeInTheDocument()
    expect(social.me.bio).toBe('Synth enjoyer')
    expect(social.me.avatar_url).toBe('https://img.example/me.png')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // Decorative (alt=""), so it has no accessible role; query the element itself.
    const avatar = screen.getByRole('link', { name: 'Your profile' }).querySelector('img')
    expect(avatar).toHaveAttribute('src', 'https://img.example/me.png')
  })

  it('rejects a non-https picture link before sending anything', async () => {
    const { social } = boot('/u/ada_l')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit profile' }))
    const modal = within(await screen.findByRole('dialog', { name: 'Edit profile' }))

    await userEvent.type(modal.getByLabelText('Profile picture link'), 'http://insecure.example/a.png')
    expect(await modal.findByText('Use an https:// image link')).toBeInTheDocument()
    await userEvent.click(modal.getByRole('button', { name: 'Save' }))

    expect(social.me.avatar_url).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Edit profile' })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------- lists

describe('followers and following', () => {
  it('lists who follows a user, with follow buttons for everyone but you', async () => {
    const { social } = boot('/u/bobby/followers')
    social.follow('carol', 'bobby')
    social.follow('ada_l', 'bobby')

    const list = await screen.findByRole('list', { name: 'Followers' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByRole('link', { name: /carol/ })).toHaveAttribute('href', '/u/carol')
    expect(within(list).getByRole('button', { name: 'Follow carol' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    // You appear in the list but can't follow yourself.
    expect(within(list).queryByRole('button', { name: 'Follow ada_l' })).not.toBeInTheDocument()
  })

  it('follows from the list and flips the button optimistically', async () => {
    const { social } = boot('/u/bobby/followers')
    social.follow('carol', 'bobby')
    const list = await screen.findByRole('list', { name: 'Followers' })
    const release = social.hold('PUT /api/users/:username/follow')

    await userEvent.click(within(list).getByRole('button', { name: 'Follow carol' }))

    await waitFor(() =>
      expect(within(list).getByRole('button', { name: 'Follow carol' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    )
    release()
    await waitFor(() => expect(social.state.follows.has('ada_l>carol')).toBe(true))
  })

  it('lists who a user follows, and shows each empty state', async () => {
    const { social } = boot('/u/carol/following')
    social.follow('carol', 'bobby')
    const list = await screen.findByRole('list', { name: 'Following' })
    expect(within(list).getByText('bobby')).toBeInTheDocument()
    expect(within(list).getByText('Jazz is life')).toBeInTheDocument()
  })

  it('explains an empty followers list', async () => {
    boot('/u/bobby/followers')
    expect(await screen.findByText('No followers yet')).toBeInTheDocument()
  })

  it('explains an empty following list', async () => {
    boot('/u/bobby/following')
    expect(await screen.findByText('Not following anyone yet')).toBeInTheDocument()
  })

  it('shows not-found for an unknown user', async () => {
    boot('/u/ghost/followers')
    expect(await screen.findByText('User not found')).toBeInTheDocument()
  })

  it('links back to the profile', async () => {
    boot('/u/bobby/followers')
    await userEvent.click(await screen.findByRole('link', { name: 'bobby' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'bobby' })).toBeInTheDocument()
  })
})

// --------------------------------------------------------------------- search

describe('searching for people', () => {
  it('shows matching people and lets you follow them from the results', async () => {
    const { social } = boot('/')
    await screen.findByRole('heading', { name: 'Popular tracks' })
    // Catalog search is needed too; answer with an empty catalog result.
    mockApi({
      'POST /api/auth/refresh': () => json(AUTH),
      ...homeApi,
      ...social.routes,
      'GET /api/search?q=bob': () => json({ query: 'bob', tracks: [], artists: [], albums: [] }),
    })

    await userEvent.type(screen.getByRole('searchbox'), 'bob')

    const people = await screen.findByRole('list', { name: 'People results' })
    expect(within(people).getByRole('link', { name: /bobby/ })).toHaveAttribute('href', '/u/bobby')
    expect(screen.queryByText('No results')).not.toBeInTheDocument()

    await userEvent.click(within(people).getByRole('button', { name: 'Follow bobby' }))
    await waitFor(() => expect(social.state.follows.has('ada_l>bobby')).toBe(true))
  })

  it('still reports no results when neither the catalog nor people match', async () => {
    const social = createFakeSocial([BOB])
    mockApi({
      'POST /api/auth/refresh': () => json(AUTH),
      ...homeApi,
      ...social.routes,
      'GET /api/search?q=zzz': () => json({ query: 'zzz', tracks: [], artists: [], albums: [] }),
    })
    renderApp('/search?q=zzz')
    expect(await screen.findByText('No results')).toBeInTheDocument()
  })
})

// -------------------------------------------------------------------- wrapped

describe('wrapped', () => {
  it('shows totals, top artists, top songs and top genres', async () => {
    const { social } = boot('/u/bobby')
    social.setWrapped('bobby', 'all', wrapped())
    expect(await screen.findByRole("region", { name: "Wrapped" })).toBeInTheDocument()
    const panel = within(screen.getByRole('region', { name: 'Wrapped' }))

    expect(await panel.findByText('42')).toBeInTheDocument()
    expect(panel.getByText('175')).toBeInTheDocument()
    expect(panel.getByText('Minutes listened')).toBeInTheDocument()

    const artists = within(panel.getByRole('region', { name: 'Top artists' }))
    expect(artists.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Nova Drift'),
      expect.stringContaining('Kestrel Run'),
    ])
    expect(artists.getByText('30 plays')).toBeInTheDocument()

    const songs = within(panel.getByRole('list', { name: 'Top songs list' }))
    expect(songs.getAllByRole('listitem')[0]).toHaveTextContent('Afterglow')
    expect(songs.getByText('20 plays')).toBeInTheDocument()
  })

  it('draws genre bars in proportion to plays, with every value labelled', async () => {
    const { social } = boot('/u/bobby')
    social.setWrapped('bobby', 'all', wrapped())

    const genres = await screen.findByRole('list', { name: 'Top genres' })
    const items = within(genres).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Electronic'),
      expect.stringContaining('Rock'),
      expect.stringContaining('Jazz'),
    ])
    expect(within(genres).getByText('3 plays')).toBeInTheDocument()

    const widths = items.map((li) => (li.querySelector('[title]') as HTMLElement).style.width)
    expect(widths).toEqual(['100%', '40%', '10%'])
    expect(within(genres).getByTitle('Rock: 12 plays')).toBeInTheDocument()
  })

  it('switches between all time and the last 30 days', async () => {
    const { social, fetchMock } = boot('/u/bobby')
    social.setWrapped('bobby', 'all', wrapped())
    social.setWrapped(
      'bobby',
      '30d',
      wrapped({
        period: '30d',
        total_plays: 7,
        total_minutes: 31,
        top_genres: [{ genre: 'Jazz', plays: 7 }],
      }),
    )
    const panel = within(await screen.findByRole('region', { name: 'Wrapped' }))
    expect(await panel.findByText('42')).toBeInTheDocument()
    expect(panel.getByRole('button', { name: 'All time' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(panel.getByRole('button', { name: 'Last 30 days' }))

    expect(await panel.findByText('7')).toBeInTheDocument()
    expect(panel.getByRole('button', { name: 'Last 30 days' })).toHaveAttribute('aria-pressed', 'true')
    expect(panel.getByText('Minutes listened')).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(([url]) => url === '/api/users/bobby/wrapped?period=30d'),
    ).toBe(true)
  })

  it("explains an empty history differently for you and for others", async () => {
    boot('/u/bobby')
    expect(await screen.findByText('No listening history yet')).toBeInTheDocument()
    expect(screen.getByText(/bobby hasn't listened to anything yet/)).toBeInTheDocument()
  })

  it('tells you what to do when your own history is empty', async () => {
    boot('/u/ada_l')
    expect(await screen.findByText('No listening history yet')).toBeInTheDocument()
    expect(screen.getByText(/Listen to a few tracks/)).toBeInTheDocument()
  })

  it('shows an error with retry when wrapped fails', async () => {
    const { social } = boot('/u/bobby')
    social.setWrapped('bobby', 'all', wrapped())
    social.failNext('GET /api/users/:username/wrapped?period=:period', 503, 'Stats unavailable')

    expect(await screen.findByText('Stats unavailable')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('175')).toBeInTheDocument()
  })
})
