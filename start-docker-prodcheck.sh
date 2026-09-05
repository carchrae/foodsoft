#!/usr/bin/env bash
#
# Run foodsoft in production mode locally, to check that assets precompile and
# the app works as deployed, before pushing to the server.
#
#   ./start-docker-prodcheck.sh          # build if needed, precompile, serve on :3001
#   ./start-docker-prodcheck.sh -d       # detached
#   PRODCHECK_PORT=4000 ./start-docker-prodcheck.sh
#
# Uses the local postgres from local-settings.sh (../bin/docker-db.sh) and the
# redis service from docker-compose-dev.yml, which is started here if needed.
# Then open http://localhost:3001/f
#
# Precompiled assets land in a docker volume, not in public/assets, so the dev
# server is unaffected. To force a clean precompile:
#   docker compose -f docker-compose-prodcheck.yml down -v
set -euo pipefail
cd "$(dirname "$0")"

source local-settings.sh
export HOST_UID="$(id -u)" HOST_GID="$(id -g)"

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi

# redis from the dev stack (no-op if already running)
$COMPOSE -f docker-compose-dev.yml up -d redis

echo "Production check will be at http://localhost:${PRODCHECK_PORT:-3001}/f (asset precompile takes a few minutes first)"
exec $COMPOSE -f docker-compose-prodcheck.yml up --build "$@"
