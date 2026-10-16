#!/bin/sh
set -e

# Bring the schema up to date before serving traffic.
alembic upgrade head

# Optional: load the demo catalog (idempotent, so safe on every start).
if [ "${SEED_CATALOG:-false}" = "true" ]; then
  python -m app.seed.seed
fi

exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --proxy-headers \
  --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-127.0.0.1}"
