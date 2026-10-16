import type { AuthResponse } from '../types/auth'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** How the HTTP layer talks to whoever owns the session, without importing the store. */
export interface AuthBridge {
  getAccessToken(): string | null
  onSessionRefreshed(session: AuthResponse): void
  onAuthFailure(): void
}

const API_BASE = '/api'

let bridge: AuthBridge | null = null
let refreshInFlight: Promise<AuthResponse | null> | null = null

export function configureAuthBridge(next: AuthBridge | null) {
  bridge = next
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  /** Don't attempt a token refresh on 401 (login/register/refresh themselves). */
  skipRefresh?: boolean
}

function send(path: string, { method = 'GET', body, signal }: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = bridge?.getAccessToken()
  if (token) headers.Authorization = `Bearer ${token}`

  return fetch(`${API_BASE}${path}`, {
    method,
    signal,
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

/** Ask the server for a new access token using the httpOnly refresh cookie. */
export function refreshSession(): Promise<AuthResponse | null> {
  // Single-flight: concurrent callers share one request, because a refresh token is
  // single-use and a second rotation would invalidate the first.
  refreshInFlight ??= (async () => {
    try {
      const response = await send('/auth/refresh', { method: 'POST' })
      if (!response.ok) return null
      const session = (await response.json()) as AuthResponse
      bridge?.onSessionRefreshed(session)
      return session
    } catch {
      return null
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

/** The most useful message in an error body, or `fallback`. */
function messageFromPayload(payload: unknown, fallback: string): string {
  const detail = (payload as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{ msg: "Value error, ..." }, ...]
    const first = detail[0] as { msg?: string } | undefined
    if (first?.msg) return first.msg.replace(/^Value error, /, '')
  }
  return fallback
}

async function toApiError(response: Response): Promise<ApiError> {
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    // Non-JSON error body: keep the status text.
  }
  return new ApiError(
    response.status,
    messageFromPayload(payload, response.statusText || 'Request failed'),
  )
}

/** JSON fetch wrapper: bearer auth, one transparent refresh-and-retry on 401. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await send(path, options)

  if (response.status === 401 && !options.skipRefresh) {
    const session = await refreshSession()
    if (session) {
      response = await send(path, options)
    } else {
      bridge?.onAuthFailure()
    }
  }

  if (!response.ok) throw await toApiError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}


interface UploadOptions {
  method?: 'POST' | 'PUT'
  /** Called with 0..1 as the file goes up. */
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

interface UploadResult {
  status: number
  body: unknown
}

function sendUpload(path: string, form: FormData, options: UploadOptions): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    // fetch() can't report upload progress, so file uploads use XMLHttpRequest.
    const xhr = new XMLHttpRequest()
    xhr.open(options.method ?? 'POST', `${API_BASE}${path}`)
    xhr.withCredentials = true
    const token = bridge?.getAccessToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(event.loaded / event.total)
    }
    xhr.onload = () => {
      let body: unknown = null
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null
      } catch {
        // A proxy's HTML error page, say; the status is what matters.
      }
      resolve({ status: xhr.status, body })
    }
    xhr.onerror = () =>
      reject(new ApiError(0, 'Could not reach the server. Check your connection and try again.'))
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))

    const { signal } = options
    if (signal) {
      if (signal.aborted) return xhr.abort()
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }
    xhr.send(form)
  })
}

const UPLOAD_FALLBACKS: Record<number, string> = {
  413: 'That file is too large to upload.',
  429: "You're uploading too fast. Try again in a little while.",
}

/** Multipart upload with progress, bearer auth, and one transparent refresh on 401. */
export async function uploadRequest<T>(
  path: string,
  form: FormData,
  options: UploadOptions = {},
): Promise<T> {
  let result = await sendUpload(path, form, options)

  if (result.status === 401) {
    const session = await refreshSession()
    if (session) result = await sendUpload(path, form, options)
    else bridge?.onAuthFailure()
  }

  if (result.status >= 200 && result.status < 300) return result.body as T
  throw new ApiError(
    result.status,
    messageFromPayload(result.body, UPLOAD_FALLBACKS[result.status] ?? 'The upload failed.'),
  )
}
