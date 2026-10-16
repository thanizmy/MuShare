# MuShare

A Spotify-style music streaming app with an Instagram-style stories layer.
React + TypeScript + Vite + Tailwind CSS 4 on the front; FastAPI + SQLAlchemy (async) + PostgreSQL on the back.

**What it does**

- Stream tracks with a full player: seek, volume, shuffle, repeat, queue, keyboard shortcuts, media keys.
- Search tracks, artists, albums and people, as you type.
- Favorites, playlists (reorder, public or private), listening history, recently played.
- Follow people, like profiles, and see anyone's **Wrapped**: top artists, songs and genres.
- Share a track, an album or an artist as a 24-hour **story** with a caption and gradient. Followers
  watch auto-advancing previews, and a quick-access link takes them to the album or artist page.

## Quick start (development)

```bash
cp .env.example .env        # set POSTGRES_PASSWORD, the password inside DATABASE_URL, and SECRET_KEY
cp .env backend/.env        # the backend reads backend/.env when run outside Docker
docker compose up --build   # db, api (migrates on start), web with hot reload
docker compose exec backend python -m app.seed.seed   # load the demo catalog
```

- App: http://localhost:5173
- API: http://localhost:8000/api/health (Swagger at `/docs` outside production)

Without Docker for the apps: start only Postgres with `docker compose up -d db`, then

```bash
cd backend  && uv sync && uv run alembic upgrade head && uv run python -m app.seed.seed --verify && uv run uvicorn app.main:app --reload
cd frontend && npm install && npm run dev
```

## Tests and checks

```bash
cd backend  && uv run pytest && uv run ruff check . && uv run alembic check
cd frontend && npm test && npm run typecheck && npm run build
```

Backend tests run against a real PostgreSQL database (`mushare_test`, built by the Alembic
migrations), not SQLite. CI (`.github/workflows/ci.yml`) runs everything above, plus
`npm audit --omit=dev` and a build of both production images.

## Run the production build locally

```bash
docker compose -f docker-compose.prod.yml --env-file .env up --build -d
# http://localhost:8080
```

nginx serves the built frontend and proxies `/api` to the API, so the browser only ever talks to
one origin. That matters: the refresh token lives in an httpOnly cookie scoped to `/api/auth`.

## Deploying

The API and the web tier are two containers. The web container's nginx proxies `/api/*` to the
API's private address (`API_UPSTREAM`, a `host:port`). Use whichever host you like:

| Host | Config | Notes |
|---|---|---|
| **Render** | [`render.yaml`](render.yaml) | New > Blueprint. Creates Postgres, a private API service and the public web service, and generates `SECRET_KEY`. |
| **Fly.io** | [`deploy/fly/`](deploy/fly) | Two apps; commands are in each file's header. The API is private at `mushare-api.internal:8000`. |
| **Vercel** (frontend only) | [`frontend/vercel.json`](frontend/vercel.json) | Replace `YOUR-API-HOST` with where the API runs (it must be reachable over HTTPS). Vercel's rewrite makes `/api` same-origin. |

Before going live:

1. **Secrets**: set a strong `SECRET_KEY`; never reuse the development one.
2. **`ENVIRONMENT=production`**: marks cookies `Secure` (HTTPS only) and disables API docs.
3. **HTTPS** must be terminated in front of the web tier (the platforms above do this).
4. **Demo catalog**: `SEED_CATALOG=true` loads fictional artists with SoundHelix audio on start.
   Turn it off once you have your own catalog.
5. **Migrations** run automatically on every API start (`alembic upgrade head`).

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | required | PostgreSQL. `postgres://` and `postgresql://` URLs (and `sslmode=`) are converted for asyncpg. |
| `SECRET_KEY` | required | JWT signing key, at least 32 characters. |
| `ENVIRONMENT` | `development` | `production` enables Secure cookies, hides `/docs` and `/openapi.json`. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` / `REFRESH_TOKEN_EXPIRE_DAYS` | 15 / 14 | Session lengths. |
| `STORY_TTL_HOURS` | 24 | How long a story lasts. |
| `STORY_PURGE_INTERVAL_SECONDS` | 600 | How often expired stories are deleted. They are hidden the moment they expire regardless. |
| `LOGIN_RATE_LIMIT_ATTEMPTS` / `LOGIN_RATE_LIMIT_WINDOW_SECONDS` | 5 / 900 | Failed sign-ins allowed per (IP, email) per window. |
| `FORWARDED_ALLOW_IPS` | `127.0.0.1` | Proxies whose `X-Forwarded-For` uvicorn trusts. Set to `*` only when the API is reachable solely through your own proxy. |
| `SEED_CATALOG` | `false` | Load the demo catalog on start. |
| `API_UPSTREAM` (web container) | `backend:8000` | `host:port` of the API. |

## Uploads and storage

My Studio lets people upload their own audio (MP3, M4A, OGG, WAV; 30 MB, 10 minutes, 25 pieces and
300 MB per person) and optional cover art. Uploads are private drafts until the owner publishes
them or shares them to a story. Audio is validated by parsing it (not by trusting the filename or
content type), and covers are re-encoded as JPEG with metadata stripped.

Files live behind a storage interface, chosen by `STORAGE_BACKEND`:

| Value | Where files go | Use when |
|---|---|---|
| `local` (default) | `MEDIA_ROOT` on disk (`/data/media` in the container) | One server with a persistent volume. `docker-compose*.yml` mount one. |
| `s3` | Any S3-compatible bucket: set `S3_BUCKET`, `S3_ENDPOINT_URL` (blank for AWS), `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Hosts with ephemeral disks (Render free tier, Fly without a volume), or several API instances. |

Access: published pieces are public. Unpublished ones are served only with a short-lived signed
link that the owner's session, or a story that shares the piece, hands out; a story's link stops
working when the story expires. With `s3` the API redirects to a presigned bucket URL, so keep the
bucket private. Unpublishing hides a piece (others see "Hidden by the artist"); deleting removes it
and its files for good.

Try S3 locally with `docker compose --profile s3 up -d s3` (SeaweedFS on port 9000, dev
credentials in `docker-compose.yml`). The S3 test in `backend/tests/test_storage.py` runs when
`S3_TEST_ENDPOINT`, `S3_TEST_BUCKET`, `S3_TEST_ACCESS_KEY` and `S3_TEST_SECRET_KEY` are set.

| Variable | Default | Purpose |
|---|---|---|
| `STUDIO_MAX_AUDIO_BYTES` / `STUDIO_MAX_COVER_BYTES` | 30 MB / 3 MB | Per-file limits. |
| `STUDIO_MAX_DURATION_SEC` | 600 | Longest piece. |
| `STUDIO_MAX_PIECES` / `STUDIO_MAX_TOTAL_BYTES` | 25 / 300 MB | Per-person quota. |
| `STUDIO_UPLOADS_PER_HOUR` | 10 | Upload rate limit per person. |

If you raise the audio limit, raise `client_max_body_size` for `/api/studio/` in
[`frontend/nginx.conf.template`](frontend/nginx.conf.template) too (40 MB now).

## Security notes

- Passwords are Argon2id hashed. Access tokens are short-lived and kept in memory only; the refresh
  token is a random value stored hashed, rotated on every use, and revoked everywhere if an old one
  is replayed.
- Failed sign-ins are throttled per (IP, email) and per IP. The counters live in the API process, so
  with several API instances each counts separately; a shared store such as Redis would be needed
  to enforce a global limit. Behind a platform proxy, nginx reports the proxy's address as the client,
  so the per-IP layer groups clients by proxy unless you configure nginx's `real_ip` module for it.
- Responses carry a strict Content-Security-Policy, `X-Frame-Options: DENY` and friends (see
  [`frontend/security-headers.inc`](frontend/security-headers.inc)).
- Stories are visible only to their author and the author's followers; other people's private
  playlists look like they don't exist.
- Wrapped, profiles and follower lists are public by design (the API serves them without a login;
  the web app itself requires you to sign in).
- `npm audit` is clean for both shipped and development dependencies.

## Layout

```
backend/    FastAPI app: api/routes -> services -> repositories -> models, plus Alembic and tests
frontend/   React app: pages, components (presentational), hooks (stateful), store (Zustand), api
deploy/     Fly.io configs;  render.yaml and docker-compose.prod.yml at the repo root
```

## Audio attribution

Demo tracks stream from [SoundHelix](https://www.soundhelix.com/) example songs (royalty-free).
Artist and album names in the seed data are fictional, and cover art comes from picsum.photos.
