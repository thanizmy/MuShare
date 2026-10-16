import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { getAudioEngine } from './audio/AudioEngine'
import { playerStore } from './store/playerStore'
import { createFakeServer } from './test/fakeServer'
import { ALBUM_DETAIL, TRACKS, homeApi } from './test/fixtures'
import type { FakeEngine } from './test/FakeEngine'
import { AUTH, callsTo, json, mockApi, renderApp } from './test/utils'

const engine = () => getAudioEngine() as unknown as FakeEngine
const [A, B, C] = TRACKS

const OTHER = { id: 'user-2', username: 'disc_jockey' }

function boot(path: string) {
  const server = createFakeServer()
  const fetchMock = mockApi({
    'POST /api/auth/refresh': () => json(AUTH),
    ...homeApi,
    'GET /api/albums/album-1': () => json(ALBUM_DETAIL),
    ...server.routes,
  })
  return { server, fetchMock, render: () => renderApp(path) }
}

async function openAlbum() {
  const ctx = boot('/albums/album-1')
  ctx.render()
  await screen.findByRole('heading', { name: 'Neon Horizons' })
  return ctx
}

const heart = (title: string) => screen.getByRole('button', { name: `Save ${title} to Liked Songs` })
const rowMenu = (title: string) => screen.getByRole('button', { name: `More options for ${title}` })
const player = () => screen.getByRole('contentinfo', { name: 'Player' })
const dialog = (name: string) => screen.findByRole('dialog', { name })
const toastRegion = () => screen.getAllByRole('status').find((el) => el.hasAttribute('aria-live'))!

// ------------------------------------------------------------------ favorites

describe('favorites', () => {
  it('flips the heart instantly, before the server answers', async () => {
    const { server } = await openAlbum()
    const release = server.hold('PUT /api/library/favorites/:id')

    await userEvent.click(heart('Afterglow'))

    await waitFor(() => expect(heart('Afterglow')).toHaveAttribute('aria-pressed', 'true'))
    expect(server.state.favorites).toEqual([]) // request still in flight

    release()
    await waitFor(() => expect(server.state.favorites).toEqual([A.id]))
    expect(heart('Afterglow')).toHaveAttribute('aria-pressed', 'true')
  })

  it('rolls the heart back and says why when the request fails', async () => {
    const { server } = await openAlbum()
    server.failNext('PUT /api/library/favorites/:id', 500, 'Server exploded')

    await userEvent.click(heart('Afterglow'))

    expect(await within(toastRegion()).findByText('Server exploded')).toBeInTheDocument()
    await waitFor(() => expect(heart('Afterglow')).toHaveAttribute('aria-pressed', 'false'))
    expect(server.state.favorites).toEqual([])
  })

  it('shows existing favorites as liked and can unlike them', async () => {
    const { server } = boot('/albums/album-1')
    server.state.favorites = [B.id]
    renderApp('/albums/album-1')
    await screen.findByRole('heading', { name: 'Neon Horizons' })

    await waitFor(() =>
      expect(heart('City Lights Fade')).toHaveAttribute('aria-pressed', 'true'),
    )
    expect(heart('Afterglow')).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(heart('City Lights Fade'))
    await waitFor(() => expect(heart('City Lights Fade')).toHaveAttribute('aria-pressed', 'false'))
    await waitFor(() => expect(server.state.favorites).toEqual([]))
  })

  it('sends rapid like/unlike clicks in order and ends consistent', async () => {
    const { server, fetchMock } = await openAlbum()

    await userEvent.click(heart('Afterglow'))
    await userEvent.click(heart('Afterglow'))

    await waitFor(() => {
      expect(callsTo(fetchMock, `DELETE /api/library/favorites/${A.id}`)).toHaveLength(1)
    })
    const writes = fetchMock.mock.calls
      .filter(([url]) => String(url).includes('/library/favorites/track'))
      .map(([, init]) => init?.method)
    expect(writes).toEqual(['PUT', 'DELETE'])
    expect(server.state.favorites).toEqual([])
    expect(heart('Afterglow')).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps the player-bar heart and the row heart in sync', async () => {
    await openAlbum()
    await userEvent.click(screen.getByRole('button', { name: 'Play Afterglow' }))

    await userEvent.click(within(player()).getByRole('button', { name: 'Save Afterglow to Liked Songs' }))

    const rowHeart = within(screen.getByRole('list', { name: 'Tracks on Neon Horizons' })).getByRole(
      'button',
      { name: 'Save Afterglow to Liked Songs' },
    )
    await waitFor(() => expect(rowHeart).toHaveAttribute('aria-pressed', 'true'))
  })

  it('lists liked songs newest first with a count, and an empty state', async () => {
    const { server } = boot('/favorites')
    server.state.favorites = [C.id, A.id]
    renderApp('/favorites')

    const list = await screen.findByRole('list', { name: 'Liked songs' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Midnight Circuit'),
      expect.stringContaining('Afterglow'),
    ])
    expect(screen.getByText('2 songs')).toBeInTheDocument()
  })

  it('shows an empty state with no liked songs', async () => {
    boot('/favorites').render()
    expect(await screen.findByText('No liked songs yet')).toBeInTheDocument()
  })

  it('removes a track from Liked Songs when unliked there', async () => {
    const { server } = boot('/favorites')
    server.state.favorites = [A.id, B.id]
    renderApp('/favorites')
    await screen.findByRole('list', { name: 'Liked songs' })
    await waitFor(() => expect(heart('Afterglow')).toHaveAttribute('aria-pressed', 'true'))

    await userEvent.click(heart('Afterglow'))

    await waitFor(() => expect(screen.queryByText('Afterglow')).not.toBeInTheDocument())
    expect(screen.getByText('City Lights Fade')).toBeInTheDocument()
  })
})

// ------------------------------------------------------------------ playlists

describe('creating playlists', () => {
  it('validates the name, creates the playlist and opens it', async () => {
    const { server } = boot('/library')
    renderApp('/library')
    expect(await screen.findByText('Create your first playlist')).toBeInTheDocument()

    const main = within(screen.getByRole('main'))
    await userEvent.click(main.getAllByRole('button', { name: 'Create playlist' })[0])
    const modal = within(await dialog('Create playlist'))

    await userEvent.click(modal.getByRole('button', { name: 'Create' }))
    expect(await modal.findByText('Give your playlist a name')).toBeInTheDocument()
    expect(server.state.playlists).toHaveLength(0)

    await userEvent.type(modal.getByLabelText('Name'), '  Road Trip ')
    await userEvent.type(modal.getByLabelText(/Description/), 'Windows down')
    await userEvent.click(modal.getByLabelText(/Public playlist/))
    await userEvent.click(modal.getByRole('button', { name: 'Create' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Road Trip' })).toBeInTheDocument()
    expect(screen.getByText('Windows down')).toBeInTheDocument()
    expect(screen.getByText('Public playlist')).toBeInTheDocument()
    expect(server.state.playlists[0]).toMatchObject({
      title: 'Road Trip',
      description: 'Windows down',
      is_public: true,
    })
    expect(within(toastRegion()).getByText('Created “Road Trip”')).toBeInTheDocument()
    expect(screen.getByText('This playlist is empty')).toBeInTheDocument()
  })

  it('creates a playlist from the sidebar', async () => {
    const { server } = boot('/')
    renderApp('/')
    await screen.findByRole('heading', { name: 'Popular tracks' })

    const sidebar = within(screen.getByRole('region', { name: 'Playlists' }))
    await userEvent.click(sidebar.getByRole('button', { name: 'Create playlist' }))
    await userEvent.type(within(await dialog('Create playlist')).getByLabelText('Name'), 'Focus')
    await userEvent.keyboard('{Enter}')

    expect(await screen.findByRole('heading', { level: 1, name: 'Focus' })).toBeInTheDocument()
    expect(server.state.playlists).toHaveLength(1)
    expect(sidebar.getByRole('link', { name: 'Focus' })).toHaveAttribute(
      'href',
      `/playlists/${server.state.playlists[0].id}`,
    )
  })

  it('lists existing playlists in the sidebar and the library', async () => {
    const { server } = boot('/library')
    server.addPlaylist({ id: 'pl-1', title: 'Road Trip', tracks: [A.id, B.id] })
    server.addPlaylist({ id: 'pl-2', title: 'Focus' })
    renderApp('/library')

    const grid = await screen.findByRole('region', { name: 'Your playlists' })
    expect(await within(grid).findByRole('link', { name: /Road Trip/ })).toHaveTextContent('2 songs')
    expect(within(grid).getByRole('link', { name: /Focus/ })).toHaveTextContent('0 songs')
    const sidebar = within(screen.getByRole('region', { name: 'Playlists' }))
    expect(await sidebar.findByRole('link', { name: 'Road Trip' })).toBeInTheDocument()
  })
})

describe('adding tracks to playlists', () => {
  it('adds a track from its menu and reports it', async () => {
    const { server } = boot('/albums/album-1')
    server.addPlaylist({ id: 'pl-1', title: 'Road Trip' })
    renderApp('/albums/album-1')
    await screen.findByRole('heading', { name: 'Neon Horizons' })

    await userEvent.click(rowMenu('Afterglow'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Road Trip' }))

    expect(
      await within(toastRegion()).findByText('Added “Afterglow” to Road Trip'),
    ).toBeInTheDocument()
    expect(server.state.playlists[0].entries.map((e) => e.track_id)).toEqual([A.id])
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('explains a duplicate instead of failing loudly', async () => {
    const { server } = boot('/albums/album-1')
    server.addPlaylist({ id: 'pl-1', title: 'Road Trip', tracks: [A.id] })
    renderApp('/albums/album-1')
    await screen.findByRole('heading', { name: 'Neon Horizons' })

    await userEvent.click(rowMenu('Afterglow'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Road Trip' }))

    expect(
      await within(toastRegion()).findByText('This track is already in the playlist'),
    ).toBeInTheDocument()
    expect(server.state.playlists[0].entries).toHaveLength(1)
  })

  it('creates a new playlist and adds the track in one step', async () => {
    const { server } = await openAlbum()

    await userEvent.click(rowMenu('Afterglow'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'New playlist…' }))
    const modal = within(await dialog('Create playlist'))
    await userEvent.type(modal.getByLabelText('Name'), 'Night Drive')
    await userEvent.click(modal.getByRole('button', { name: 'Create and add' }))

    await waitFor(() => expect(server.state.playlists).toHaveLength(1))
    expect(server.state.playlists[0].title).toBe('Night Drive')
    await waitFor(() =>
      expect(server.state.playlists[0].entries.map((e) => e.track_id)).toEqual([A.id]),
    )
    expect(
      await within(toastRegion()).findByText('Added “Afterglow” to Night Drive'),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows a loading state, and a message when playlists cannot load', async () => {
    const { server } = await openAlbum()
    server.failNext('GET /api/playlists', 500, 'nope')

    await userEvent.click(rowMenu('Afterglow'))
    expect(await screen.findByText(/couldn.t load your playlists/i)).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'New playlist…' })).toBeInTheDocument()
  })

  it('closes the menu on Escape and returns focus to its button', async () => {
    await openAlbum()
    const trigger = rowMenu('Afterglow')
    await userEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes the menu when clicking elsewhere and supports arrow-key navigation', async () => {
    await openAlbum()
    await userEvent.click(rowMenu('Afterglow'))
    const items = await screen.findAllByRole('menuitem')
    expect(items[0]).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    expect(items[1]).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    expect(items[items.length - 1]).toHaveFocus()

    await userEvent.click(screen.getByRole('heading', { name: 'Neon Horizons' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('playlist page', () => {
  const seeded = () => {
    const ctx = boot('/playlists/pl-1')
    ctx.server.addPlaylist({
      id: 'pl-1',
      title: 'Road Trip',
      description: 'Windows down',
      tracks: [A.id, B.id, C.id],
    })
    return ctx
  }
  const order = () => {
    const list = screen.getByRole('list', { name: 'Tracks in Road Trip' })
    return within(list)
      .getAllByRole('listitem')
      .map((li) => (li.textContent ?? '').match(/Afterglow|City Lights Fade|Midnight Circuit/)?.[0])
  }

  it('shows the header and tracks in order', async () => {
    const { render } = seeded()
    render()

    expect(await screen.findByRole('heading', { level: 1, name: 'Road Trip' })).toBeInTheDocument()
    expect(screen.getByText('Windows down')).toBeInTheDocument()
    expect(screen.getByText(/3 songs, 10 min/)).toBeInTheDocument()
    expect(screen.getByText('Private playlist')).toBeInTheDocument()
    expect(order()).toEqual(['Afterglow', 'City Lights Fade', 'Midnight Circuit'])
  })

  it('plays the playlist from the top and queues it in order', async () => {
    const { render } = seeded()
    render()
    await screen.findByRole('heading', { level: 1, name: 'Road Trip' })

    await userEvent.click(within(screen.getByRole('main')).getByRole('button', { name: 'Play' }))
    expect(engine().lastLoad).toBe(A.audio_url)
    await userEvent.click(within(player()).getByRole('button', { name: 'Next track' }))
    expect(engine().lastLoad).toBe(B.audio_url)
  })

  it('removes a track from the menu', async () => {
    const { server, render } = seeded()
    render()
    await screen.findByRole('heading', { level: 1, name: 'Road Trip' })

    await userEvent.click(rowMenu('City Lights Fade'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove from this playlist' }))

    await waitFor(() => expect(order()).toEqual(['Afterglow', 'Midnight Circuit']))
    expect(server.state.playlists[0].entries.map((e) => e.track_id)).toEqual([A.id, C.id])
    expect(await within(toastRegion()).findByText('Removed from playlist')).toBeInTheDocument()
    expect(screen.getByText(/2 songs/)).toBeInTheDocument()
  })

  it('reorders with the move buttons and persists the new order', async () => {
    const { server, render } = seeded()
    render()
    await screen.findByRole('heading', { level: 1, name: 'Road Trip' })

    expect(screen.getByRole('button', { name: 'Move Afterglow up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Midnight Circuit down' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Move Afterglow down' }))
    await waitFor(() => expect(order()).toEqual(['City Lights Fade', 'Afterglow', 'Midnight Circuit']))
    await waitFor(() =>
      expect(server.state.playlists[0].entries.map((e) => e.track_id)).toEqual([B.id, A.id, C.id]),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Move Midnight Circuit up' }))
    await waitFor(() =>
      expect(server.state.playlists[0].entries.map((e) => e.track_id)).toEqual([B.id, C.id, A.id]),
    )
    expect(order()).toEqual(['City Lights Fade', 'Midnight Circuit', 'Afterglow'])
  })

  it('restores the order and says so when a reorder fails', async () => {
    const { server, render } = seeded()
    render()
    await screen.findByRole('heading', { level: 1, name: 'Road Trip' })
    server.failNext('PUT /api/playlists/:id/tracks/order', 409, 'The playlist changed.')

    await userEvent.click(screen.getByRole('button', { name: 'Move Afterglow down' }))

    expect(await within(toastRegion()).findByText('The playlist changed.')).toBeInTheDocument()
    await waitFor(() => expect(order()).toEqual(['Afterglow', 'City Lights Fade', 'Midnight Circuit']))
  })

  it('edits the name, description and visibility', async () => {
    const { server, render } = seeded()
    render()
    await screen.findByRole('heading', { level: 1, name: 'Road Trip' })

    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    const modal = within(await dialog('Edit playlist'))
    expect(modal.getByLabelText('Name')).toHaveValue('Road Trip')
    expect(modal.getByLabelText(/Description/)).toHaveValue('Windows down')

    await userEvent.clear(modal.getByLabelText('Name'))
    await userEvent.type(modal.getByLabelText('Name'), 'Night Drive')
    await userEvent.click(modal.getByLabelText(/Public playlist/))
    await userEvent.click(modal.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Night Drive' })).toBeInTheDocument()
    expect(server.state.playlists[0]).toMatchObject({ title: 'Night Drive', is_public: true })
    expect(screen.getByText('Public playlist')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps the edit dialog open and shows the error when saving fails', async () => {
    const { server, render } = seeded()
    render()
    await screen.findByRole('heading', { level: 1, name: 'Road Trip' })
    server.failNext('PATCH /api/playlists/:id', 500, 'Could not save right now')

    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    const modal = within(await dialog('Edit playlist'))
    await userEvent.click(modal.getByRole('button', { name: 'Save' }))

    expect(await modal.findByRole('alert')).toHaveTextContent('Could not save right now')
    expect(screen.getByRole('dialog', { name: 'Edit playlist' })).toBeInTheDocument()
  })

  it('deletes only after confirmation, then returns to the library', async () => {
    const { server, render } = seeded()
    render()
    await screen.findByRole('heading', { level: 1, name: 'Road Trip' })

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    let confirm = within(await dialog('Delete playlist?'))
    await userEvent.click(confirm.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(server.state.playlists).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    confirm = within(await dialog('Delete playlist?'))
    await userEvent.click(confirm.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('heading', { name: 'Your Library' })).toBeInTheDocument()
    expect(server.state.playlists).toHaveLength(0)
    expect(within(toastRegion()).getByText('Playlist deleted')).toBeInTheDocument()
  })

  it('shows an empty playlist with guidance', async () => {
    const { server, render } = boot('/playlists/pl-1')
    server.addPlaylist({ id: 'pl-1', title: 'Blank' })
    render()
    expect(await screen.findByText('This playlist is empty')).toBeInTheDocument()
    expect(screen.getByText(/menu on any track/i)).toBeInTheDocument()
  })

  it("lets others view a public playlist but never edit it", async () => {
    const { server, render } = boot('/playlists/pl-x')
    server.addPlaylist({
      id: 'pl-x',
      title: 'Open Decks',
      is_public: true,
      owner: OTHER,
      tracks: [A.id, B.id],
    })
    render()

    expect(await screen.findByRole('heading', { level: 1, name: 'Open Decks' })).toBeInTheDocument()
    expect(screen.getByText('disc_jockey')).toBeInTheDocument()
    expect(screen.getByText('Public playlist')).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByRole('button', { name: 'Play' })).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Move .* (up|down)/ })).not.toBeInTheDocument()

    await userEvent.click(rowMenu('Afterglow'))
    expect(await screen.findByRole('menuitem', { name: 'Add to queue' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Remove from this playlist' })).not.toBeInTheDocument()
  })

  it("treats someone else's private playlist as not found", async () => {
    const { server, render } = boot('/playlists/pl-secret')
    server.addPlaylist({ id: 'pl-secret', title: 'Secret', owner: OTHER, tracks: [A.id] })
    render()
    expect(await screen.findByText('Playlist not found')).toBeInTheDocument()
    expect(screen.queryByText('Secret')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------- queue

describe('queue', () => {
  it('starts playback when adding to an empty queue', async () => {
    await openAlbum()
    await userEvent.click(rowMenu('City Lights Fade'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Add to queue' }))

    expect(engine().lastLoad).toBe(B.audio_url)
    expect(within(toastRegion()).getByText('Added “City Lights Fade” to queue')).toBeInTheDocument()
  })

  it('appends to the end of the queue while something is playing', async () => {
    await openAlbum()
    act(() => playerStore.getState().play(A)) // a one-track queue
    await userEvent.click(rowMenu('Midnight Circuit'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Add to queue' }))

    expect(engine().loads).toHaveLength(1) // nothing restarted
    await userEvent.click(within(player()).getByRole('button', { name: 'Queue' }))
    const panel = within(await dialog('Queue'))
    const next = within(panel.getByRole('region', { name: 'Next up' }))
    expect(next.getByText('Midnight Circuit')).toBeInTheDocument()
  })

  it('shows now playing and what is next, and jumps when a row is clicked', async () => {
    await openAlbum()
    await userEvent.click(screen.getByRole('button', { name: 'Play Afterglow' }))

    await userEvent.click(within(player()).getByRole('button', { name: 'Queue' }))
    const panel = within(await dialog('Queue'))
    expect(
      within(panel.getByRole('region', { name: 'Now playing' })).getByText('Afterglow'),
    ).toBeInTheDocument()
    const next = within(panel.getByRole('region', { name: 'Next up' }))
    expect(next.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('City Lights Fade'),
      expect.stringContaining('Midnight Circuit'),
    ])

    await userEvent.click(next.getByRole('button', { name: 'Play Midnight Circuit' }))
    expect(engine().lastLoad).toBe(C.audio_url)
    expect(
      within(panel.getByRole('region', { name: 'Now playing' })).getByText('Midnight Circuit'),
    ).toBeInTheDocument()
    expect(next.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('explains an empty queue and closes with Escape', async () => {
    await openAlbum()
    await userEvent.click(within(player()).getByRole('button', { name: 'Queue' }))
    const panel = within(await dialog('Queue'))
    expect(panel.getByText('Nothing playing.')).toBeInTheDocument()
    expect(panel.getByText(/Nothing queued/)).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(player()).getByRole('button', { name: 'Queue' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })
})

// ------------------------------------------------------------- recently played

describe('recently played and history', () => {
  it('shows a Recently played shelf only when there is history', async () => {
    const { server } = boot('/')
    server.state.history = [A.id, B.id]
    renderApp('/')

    const shelf = await screen.findByRole('region', { name: 'Recently played' })
    expect(within(shelf).getAllByRole('article').map((a) => a.textContent)).toEqual([
      expect.stringContaining('City Lights Fade'), // most recent first
      expect.stringContaining('Afterglow'),
    ])
  })

  it('hides the shelf for a listener with no history', async () => {
    boot('/').render()
    await screen.findByRole('heading', { name: 'Popular tracks' })
    expect(screen.queryByRole('region', { name: 'Recently played' })).not.toBeInTheDocument()
  })

  it('records a play after 30 seconds of listening, once, and updates the shelf', async () => {
    const { server, fetchMock } = boot('/')
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Play Afterglow' }))

    engine().tick(5, 200)
    engine().tick(29, 200)
    expect(callsTo(fetchMock, 'POST /api/library/history')).toHaveLength(0)

    engine().tick(30, 200)
    await waitFor(() => expect(server.state.history).toEqual([A.id]))
    engine().tick(60, 200)
    engine().tick(90, 200)
    expect(callsTo(fetchMock, 'POST /api/library/history')).toHaveLength(1)

    const shelf = await screen.findByRole('region', { name: 'Recently played' })
    expect(within(shelf).getByText('Afterglow')).toBeInTheDocument()
  })

  it('does not count time while paused', async () => {
    const { fetchMock } = boot('/')
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Play Afterglow' }))
    await userEvent.click(within(player()).getByRole('button', { name: 'Pause' }))

    engine().tick(45, 200)
    expect(callsTo(fetchMock, 'POST /api/library/history')).toHaveLength(0)
  })

  it('counts a replay as a new play once the track restarts', async () => {
    const { server, fetchMock } = boot('/')
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Play Afterglow' }))

    engine().tick(31, 200)
    await waitFor(() => expect(server.state.history).toHaveLength(1))
    engine().tick(0.2, 200) // looped or restarted
    engine().tick(31, 200)
    await waitFor(() => expect(callsTo(fetchMock, 'POST /api/library/history')).toHaveLength(2))
  })

  it('never interrupts playback when the history call fails', async () => {
    const { server } = boot('/')
    server.failNext('POST /api/library/history', 500, 'down')
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Play Afterglow' }))

    engine().tick(40, 200)

    await waitFor(() => expect(server.state.history).toEqual([]))
    expect(playerStore.getState().isPlaying).toBe(true)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
