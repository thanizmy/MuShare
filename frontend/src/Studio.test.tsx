import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BOB, createFakeStories, makePieceStory } from './test/fakeStories'
import { homeApi } from './test/fixtures'
import { AUTH, callsTo, json, mockApi, renderApp } from './test/utils'
import { isPrivateStudioTrack, pieceToTrack } from './lib/pieceTrack'
import { formatBytes } from './lib/format'
import type { StoryGroup } from './types/stories'
import type { Piece, StudioUsage } from './types/studio'

const PIECE: Piece = {
  id: 'piece-1',
  title: 'Night Drive',
  description: null,
  status: 'draft',
  duration_sec: 125,
  audio_bytes: 2_000_000,
  audio_url: '/api/media/pieces/piece-1/audio?token=t',
  cover_url: null,
  created_at: '2026-10-16T00:00:00Z',
  updated_at: '2026-10-16T00:00:00Z',
  published_at: null,
  track_id: null,
  album_id: null,
  artist_id: null,
}

const USAGE: StudioUsage = {
  pieces_used: 1,
  pieces_limit: 25,
  bytes_used: 2_000_000,
  bytes_limit: 300 * 1024 * 1024,
  max_audio_bytes: 30 * 1024 * 1024,
  max_cover_bytes: 3 * 1024 * 1024,
  max_duration_sec: 600,
  allowed_types: ['audio/mpeg'],
  artist_name: null,
}

function boot(path: string, pieces: Piece[] = [PIECE], usage: StudioUsage = USAGE) {
  const state = { pieces: [...pieces] }
  const stories = createFakeStories([])
  const fetchMock = mockApi({
    'POST /api/auth/refresh': () => json(AUTH),
    ...homeApi,
    ...stories.routes,
    'GET /api/studio/usage': () => json(usage),
    'GET /api/studio/pieces': () => json(state.pieces),
    'GET /api/studio/pieces/:id': (_i, { params }) => {
      const found = state.pieces.find((p) => p.id === params.id)
      return found ? json(found) : json({ detail: 'Not found' }, 404)
    },
    'POST /api/studio/pieces/:id/publish': (_i, { params, body }) => {
      const piece: Piece = {
        ...state.pieces.find((p) => p.id === params.id)!,
        status: 'published',
        track_id: 'track-x',
        album_id: 'album-x',
        artist_id: 'artist-x',
        published_at: '2026-10-17T00:00:00Z',
      }
      state.pieces = state.pieces.map((p) => (p.id === piece.id ? piece : p))
      expect(body.rights_confirmed).toBe(true)
      return json(piece)
    },
    'POST /api/studio/pieces/:id/unpublish': (_i, { params }) => {
      const piece: Piece = { ...state.pieces.find((p) => p.id === params.id)!, status: 'hidden' }
      state.pieces = state.pieces.map((p) => (p.id === piece.id ? piece : p))
      return json(piece)
    },
    'DELETE /api/studio/pieces/:id': (_i, { params }) => {
      state.pieces = state.pieces.filter((p) => p.id !== params.id)
      return new Response(null, { status: 204 })
    },
  })
  renderApp(path)
  return { state, fetchMock }
}

// ---------------------------------------------------------------- fake XHR

class FakeXhr {
  static instances: FakeXhr[] = []
  upload: { onprogress: ((e: unknown) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  status = 0
  responseText = ''
  withCredentials = false
  headers: Record<string, string> = {}
  method = ''
  url = ''
  body: FormData | null = null
  constructor() {
    FakeXhr.instances.push(this)
  }
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v
  }
  send(body: FormData) {
    this.body = body
  }
  abort() {
    this.onabort?.()
  }
  respond(status: number, payload: unknown) {
    this.status = status
    this.responseText = JSON.stringify(payload)
    this.onload?.()
  }
}

beforeEach(() => {
  FakeXhr.instances = []
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
})
afterEach(() => vi.unstubAllGlobals())

const audioFile = (name = 'night_drive.mp3', size = 1000) =>
  new File([new Uint8Array(size)], name, { type: 'audio/mpeg' })

// ---------------------------------------------------------------- pure helpers

describe('helpers', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2 * 1024 * 1024)).toMatch(/2(\.0)? MB/)
  })

  it('gives a private piece stand-in ids and a published one its real ids', () => {
    const draft = pieceToTrack(PIECE, 'Ada')
    expect(isPrivateStudioTrack(draft)).toBe(true)
    expect(draft.album.artist.name).toBe('Ada')

    const live = pieceToTrack(
      { ...PIECE, status: 'published', track_id: 't', album_id: 'a', artist_id: 'r' },
      'Ada',
    )
    expect(live.id).toBe('t')
    expect(isPrivateStudioTrack(live)).toBe(false)
  })
})

// ---------------------------------------------------------------- studio list

describe('My Studio page', () => {
  it('lists pieces with status and usage', async () => {
    boot('/studio')
    const list = await screen.findByRole('list', { name: 'Pieces' })
    expect(within(list).getByText('Night Drive')).toBeInTheDocument()
    expect(within(list).getByText('Draft')).toBeInTheDocument()
    expect(await screen.findByText(/1 of 25/)).toBeInTheDocument()
  })

  it('shows an empty state with an upload action', async () => {
    boot('/studio', [])
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument()
  })

  it('disables upload when the studio is full', async () => {
    boot('/studio', [PIECE], { ...USAGE, pieces_used: 25 })
    expect(await screen.findByText(/Your studio is full/, { selector: 'p' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Upload' })[0]).toBeDisabled()
  })

  it('plays a private piece in the player', async () => {
    boot('/studio')
    await userEvent.click(await screen.findByRole('button', { name: 'Play Night Drive' }))
    expect(await screen.findByRole('button', { name: 'Pause Night Drive' })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------- upload

describe('uploading a piece', () => {
  const openDialog = async () => {
    await userEvent.click((await screen.findAllByRole('button', { name: 'Upload' }))[0])
    return screen.findByRole('dialog', { name: 'Upload a piece' })
  }

  it('rejects a non-audio file and an oversized one', async () => {
    boot('/studio')
    const dialog = await openDialog()
    const input = within(dialog).getByLabelText('Audio file')

    await userEvent.upload(input, new File(['x'], 'notes.txt', { type: 'text/plain' }), {
      applyAccept: false,
    })
    expect(await within(dialog).findByText('Choose an MP3, M4A, OGG or WAV file.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Upload' })).toBeDisabled()

    const big = audioFile('big.mp3', 10)
    Object.defineProperty(big, 'size', { value: 31 * 1024 * 1024 })
    await userEvent.upload(input, big)
    expect(await within(dialog).findByText(/The limit is 30(\.0)? MB/)).toBeInTheDocument()
  })

  it('uploads with progress, then opens the new draft', async () => {
    const { state } = boot('/studio', [])
    const dialog = await openDialog()
    await userEvent.upload(within(dialog).getByLabelText('Audio file'), audioFile())
    expect(within(dialog).getByLabelText('Title')).toHaveValue('night drive')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Upload' }))
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1))
    const xhr = FakeXhr.instances[0]
    expect(xhr.method).toBe('POST')
    expect(xhr.url).toBe('/api/studio/pieces')
    expect(xhr.headers.Authorization).toBe('Bearer access-1')
    expect((xhr.body as FormData).get('title')).toBe('night drive')

    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 })
    await waitFor(() =>
      expect(within(dialog).getByRole('progressbar', { name: 'Upload progress' })).toHaveAttribute(
        'aria-valuenow',
        '50',
      ),
    )

    state.pieces = [PIECE]
    xhr.respond(201, PIECE)
    expect(await screen.findByRole('heading', { name: 'Night Drive' })).toBeInTheDocument()
  })

  it('shows the server error and keeps the dialog open', async () => {
    boot('/studio', [])
    const dialog = await openDialog()
    await userEvent.upload(within(dialog).getByLabelText('Audio file'), audioFile())
    await userEvent.click(within(dialog).getByRole('button', { name: 'Upload' }))
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1))
    FakeXhr.instances[0].respond(422, { detail: 'That file is not valid audio.' })
    expect(await within(dialog).findByText('That file is not valid audio.')).toBeInTheDocument()
  })

  it('cancels an upload in flight', async () => {
    boot('/studio', [])
    const dialog = await openDialog()
    await userEvent.upload(within(dialog).getByLabelText('Audio file'), audioFile())
    await userEvent.click(within(dialog).getByRole('button', { name: 'Upload' }))
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Cancel upload' }))
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Upload' })).toBeInTheDocument(),
    )
    expect(within(dialog).queryByText('The upload failed. Try again.')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------- one piece

describe('a piece page', () => {
  it('publishes only after the rights box is ticked', async () => {
    const { fetchMock } = boot('/studio/piece-1')
    await userEvent.click(await screen.findByRole('button', { name: 'Publish' }))
    const dialog = await screen.findByRole('dialog', { name: 'Publish to the catalog' })
    const submit = within(dialog).getByRole('button', { name: 'Publish' })
    expect(submit).toBeDisabled()

    await userEvent.click(within(dialog).getByRole('checkbox'))
    await userEvent.click(submit)

    expect(await screen.findByText(/Published\. Everyone can find/)).toBeInTheDocument()
    const [, init] = callsTo(fetchMock, 'POST /api/studio/pieces/piece-1/publish')[0]
    expect(JSON.parse(init!.body as string)).toMatchObject({ rights_confirmed: true })
    expect(screen.getByRole('link', { name: 'View it in the catalog' })).toHaveAttribute(
      'href',
      '/albums/album-x',
    )
  })

  it('unpublishes after confirmation and offers to publish again', async () => {
    boot('/studio/piece-1', [
      { ...PIECE, status: 'published', track_id: 't', album_id: 'a', artist_id: 'r' },
    ])
    await userEvent.click(await screen.findByRole('button', { name: 'Unpublish' }))
    const dialog = await screen.findByRole('dialog', { name: 'Unpublish this piece?' })
    expect(dialog).toHaveTextContent('Hidden by the artist')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Unpublish' }))
    expect(await screen.findByRole('button', { name: 'Publish again' })).toBeInTheDocument()
    expect(screen.getByText(/Hidden from the catalog/)).toBeInTheDocument()
  })

  it('warns that deleting is permanent, then returns to the studio', async () => {
    const { state } = boot('/studio/piece-1', [{ ...PIECE, status: 'hidden' }])
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this piece?' })
    expect(dialog).toHaveTextContent('permanently')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument()
    expect(state.pieces).toHaveLength(0)
  })

  it('shows a friendly page for a piece that is not yours', async () => {
    boot('/studio/nope')
    expect(await screen.findByText('Piece not found')).toBeInTheDocument()
  })

  it('edits the title', async () => {
    const { state } = boot('/studio/piece-1')
    mockApiPatch(state)
    await userEvent.click(await screen.findByRole('button', { name: 'Edit details' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit details' })
    const title = within(dialog).getByLabelText('Title')
    await userEvent.clear(title)
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.type(title, 'Dawn')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('heading', { name: 'Dawn' })).toBeInTheDocument()
  })
})

function mockApiPatch(state: { pieces: Piece[] }) {
  const original = globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    if (init.method === 'PATCH' && url === '/api/studio/pieces/piece-1') {
      const patch = JSON.parse(init.body as string)
      state.pieces = state.pieces.map((p) => ({ ...p, ...patch }))
      return json(state.pieces[0])
    }
    return original(url, init)
  })
}

// ---------------------------------------------------------------- hidden by the artist

describe('hidden tracks elsewhere', () => {
  it('greys a hidden favorite out and does not let it play', async () => {
    const hidden = {
      id: 'track-h',
      title: 'Gone Song',
      track_number: 1,
      duration_sec: 100,
      audio_url: '',
      preview_start_sec: 0,
      album: { id: 'album-h', title: 'Gone', cover_url: null, release_year: null, artist: { id: 'artist-h', name: 'Zed', image_url: null } },
      genres: [],
      is_hidden: true,
    }
    mockApi({
      'POST /api/auth/refresh': () => json(AUTH),
      ...homeApi,
      'GET /api/library/favorites': () => json([hidden]),
    })
    renderApp('/favorites')
    expect(await screen.findByText('Gone Song')).toBeInTheDocument()
    expect(screen.getByText('Hidden by the artist')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Play Gone Song/ })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------- stories

describe('piece stories', () => {
  it('shares a private piece to a story by its id alone', async () => {
    const { stories } = bootWithStories('/studio/piece-1', [])
    await userEvent.click(await screen.findByRole('button', { name: 'Share to story' }))
    const modal = within(await screen.findByRole('dialog', { name: 'Share to your story' }))
    await userEvent.click(modal.getByRole('button', { name: 'Share to story' }))
    await waitFor(() => expect(stories.state.posted).toHaveLength(1))
    expect(stories.state.posted[0]).toMatchObject({ piece_id: 'piece-1' })
    expect(stories.state.posted[0]).not.toHaveProperty('track_id')
  })

  it('offers no catalog link while the piece is a draft, and one once published', async () => {
    const draft = makePieceStory(BOB)
    bootWithStories('/', [{ user: BOB, stories: [draft] }])
    await userEvent.click(await screen.findByRole('button', { name: 'View bobby story' }))
    const dialog = await screen.findByRole('dialog', { name: /stories$/ })
    expect(within(dialog).getByText('Zephyr Lullaby')).toBeInTheDocument()
    expect(within(dialog).queryByRole('link', { name: /Open|View|Go to/ })).not.toBeInTheDocument()
  })

  it('links a published piece story to its album', async () => {
    const live = makePieceStory(BOB, {
      piece: { id: 'piece-1', title: 'Zephyr Lullaby', cover_url: null, duration_sec: 90, album_id: 'album-z', artist_id: 'artist-z' },
    })
    bootWithStories('/', [{ user: BOB, stories: [live] }])
    await userEvent.click(await screen.findByRole('button', { name: 'View bobby story' }))
    const dialog = await screen.findByRole('dialog', { name: /stories$/ })
    const links = within(dialog).getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(links).toContain('/albums/album-z')
  })
})

function bootWithStories(path: string, groups: StoryGroup[]) {
  const stories = createFakeStories(groups)
  mockApi({
    'POST /api/auth/refresh': () => json(AUTH),
    ...homeApi,
    ...stories.routes,
    'GET /api/studio/usage': () => json(USAGE),
    'GET /api/studio/pieces': () => json([PIECE]),
    'GET /api/studio/pieces/:id': () => json(PIECE),
  })
  renderApp(path)
  return { stories }
}
