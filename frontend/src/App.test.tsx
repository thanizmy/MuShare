import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { useAuthStore } from './store/authStore'
import { homeApi } from './test/fixtures'
import { AUTH, callsTo, json, mockApi, renderApp } from './test/utils'

const signedOut = { 'POST /api/auth/refresh': () => json({ detail: 'Not signed in' }, 401) }
const signedIn = { 'POST /api/auth/refresh': () => json(AUTH), ...homeApi }

describe('session bootstrap & route guards', () => {
  it('shows a loader, then the signed-in shell when the refresh cookie is valid', async () => {
    mockApi(signedIn)
    renderApp('/')

    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: /ada_l/ })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument()
    expect(screen.getByRole('contentinfo', { name: 'Player' })).toHaveTextContent(/nothing playing/i)
  })

  it('redirects anonymous visitors to the login page', async () => {
    mockApi(signedOut)
    const router = renderApp('/')

    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('refreshes only once even though StrictMode-style double bootstrap may occur', async () => {
    const fetchMock = mockApi(signedIn)
    renderApp('/')
    await screen.findByRole('heading', { name: /ada_l/ })
    expect(callsTo(fetchMock, 'POST /api/auth/refresh')).toHaveLength(1)
  })

  it('sends signed-in users away from the login page', async () => {
    mockApi(signedIn)
    const router = renderApp('/login')
    await screen.findByRole('heading', { name: /ada_l/ })
    expect(router.state.location.pathname).toBe('/')
  })

  it('returns users to the page they wanted after logging in', async () => {
    mockApi({ ...signedOut, 'POST /api/auth/login': () => json(AUTH) })
    const router = renderApp('/some/missing/page')

    await screen.findByRole('heading', { name: /welcome back/i })
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-9')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/some/missing/page')
  })
})

describe('login', () => {
  it('validates before calling the API', async () => {
    const fetchMock = mockApi(signedOut)
    renderApp('/login')
    await screen.findByRole('heading', { name: /welcome back/i })

    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(callsTo(fetchMock, 'POST /api/auth/login')).toHaveLength(0)
  })

  it('shows the server error and keeps the user on the form', async () => {
    mockApi({
      ...signedOut,
      'POST /api/auth/login': () => json({ detail: 'Incorrect email or password' }, 401),
    })
    renderApp('/login')
    await screen.findByRole('heading', { name: /welcome back/i })

    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-pass-1')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password')
    expect(useAuthStore.getState().status).toBe('anonymous')
  })

  it('stores the session in memory only and signs in on success', async () => {
    const fetchMock = mockApi({ ...signedOut, 'POST /api/auth/login': () => json(AUTH) })
    renderApp('/login')
    await screen.findByRole('heading', { name: /welcome back/i })

    await userEvent.type(screen.getByLabelText('Email'), '  ada@example.com ')
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-9')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    await screen.findByRole('heading', { name: /ada_l/ })
    expect(useAuthStore.getState().accessToken).toBe('access-1')
    expect(JSON.parse(callsTo(fetchMock, 'POST /api/auth/login')[0][1]!.body as string)).toEqual({
      email: 'ada@example.com',
      password: 'correct-horse-9',
    })
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('reports a network failure without crashing', async () => {
    mockApi({
      ...signedOut,
      'POST /api/auth/login': () => {
        throw new TypeError('Failed to fetch')
      },
    })
    renderApp('/login')
    await screen.findByRole('heading', { name: /welcome back/i })

    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-9')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i)
  })
})

describe('register', () => {
  async function openRegister() {
    mockApi({ ...signedOut, 'POST /api/auth/register': () => json(AUTH, 201) })
    renderApp('/register')
    await screen.findByRole('heading', { name: /create your account/i })
  }

  it('flags a weak password and a bad username once touched', async () => {
    await openRegister()

    await userEvent.type(screen.getByLabelText('Username'), 'a b')
    await userEvent.type(screen.getByLabelText('Password'), 'letters')
    await userEvent.tab()

    expect(await screen.findByText(/3-30 letters, numbers or underscores/i, { selector: '[role=alert]' }))
      .toBeInTheDocument()
    expect(screen.getByText(/at least 8 characters/i, { selector: '[role=alert]' })).toBeInTheDocument()
  })

  it('creates the account and lands in the app', async () => {
    await openRegister()

    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Username'), 'ada_l')
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-9')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByRole('heading', { name: /ada_l/ })).toBeInTheDocument()
  })

  it('shows conflicts reported by the server', async () => {
    mockApi({
      ...signedOut,
      'POST /api/auth/register': () => json({ detail: 'That username is taken' }, 409),
    })
    renderApp('/register')
    await screen.findByRole('heading', { name: /create your account/i })

    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Username'), 'ada_l')
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-9')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('That username is taken')
  })

  it('links between login and register', async () => {
    await openRegister()
    await userEvent.click(screen.getByRole('link', { name: /log in/i }))
    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
  })
})

describe('logout', () => {
  it('calls the API, clears the session and returns to login', async () => {
    const fetchMock = mockApi({
      ...signedIn,
      'POST /api/auth/logout': () => new Response(null, { status: 204 }),
    })
    const router = renderApp('/')
    await screen.findByRole('heading', { name: /ada_l/ })

    await userEvent.click(screen.getByRole('button', { name: /log out/i }))

    await screen.findByRole('heading', { name: /welcome back/i })
    expect(callsTo(fetchMock, 'POST /api/auth/logout')).toHaveLength(1)
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('still signs out locally when the server call fails', async () => {
    mockApi({
      ...signedIn,
      'POST /api/auth/logout': () => json({ detail: 'boom' }, 500),
    })
    renderApp('/')
    await screen.findByRole('heading', { name: /ada_l/ })

    await userEvent.click(screen.getByRole('button', { name: /log out/i }))

    await waitFor(() => expect(useAuthStore.getState().status).toBe('anonymous'))
    await screen.findByRole('heading', { name: /welcome back/i })
  })
})

describe('mobile drawer', () => {
  async function openApp() {
    mockApi(signedIn)
    renderApp('/')
    await screen.findByRole('heading', { name: /ada_l/ })
  }

  it('opens from the menu button and closes via the close button', async () => {
    await openApp()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /open navigation/i }))
    const dialog = screen.getByRole('dialog', { name: /navigation/i })
    expect(within(dialog).getByRole('link', { name: /home/i })).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')

    await userEvent.click(within(dialog).getByRole('button', { name: /close navigation/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
  })

  it('closes on Escape and returns focus to the menu button', async () => {
    await openApp()
    const menuButton = screen.getByRole('button', { name: /open navigation/i })
    await userEvent.click(menuButton)
    expect(screen.getByRole('button', { name: /close navigation/i })).toHaveFocus()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(menuButton).toHaveFocus()
  })

  it('closes when the backdrop is clicked', async () => {
    await openApp()
    await userEvent.click(screen.getByRole('button', { name: /open navigation/i }))
    await userEvent.click(screen.getByTestId('drawer-backdrop'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
