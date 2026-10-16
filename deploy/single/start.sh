#!/bin/bash
# Runs the API and nginx in one container; if either stops, the container stops.
set -e

# The shared nginx template proxies to ${API_UPSTREAM}; here that is uvicorn on localhost.
sed 's#${API_UPSTREAM}#127.0.0.1:8000#' /etc/nginx/site.conf.template > /tmp/mushare-site.conf

PORT=8000 ./docker-entrypoint.sh &
api=$!
nginx -c /etc/nginx/nginx.single.conf -g 'daemon off;' &
web=$!

trap 'kill "$api" "$web" 2>/dev/null' TERM INT
wait -n "$api" "$web"
kill "$api" "$web" 2>/dev/null || true
exit 1
