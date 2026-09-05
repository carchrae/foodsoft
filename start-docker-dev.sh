#!/usr/bin/env bash
#
# Launch the foodsoft dev server in docker (Ubuntu 18.04 + Ruby 2.6.6 image).
#
# Prerequisites: your postgres container must already be running on localhost
# (../bin/docker-db.sh starts it). Redis is part of this compose stack and
# starts automatically on localhost:6379. Connection strings come from
# local-settings.sh.
#
# Usage:
#   ./start-docker-dev.sh                    # build (if needed) and run web on :3000
#   ./start-docker-dev.sh -d                 # run detached
#   ./start-docker-dev.sh --profile worker   # also run the resque worker
#
# After changing the Gemfile, re-install gems into the bundle volume with:
#   docker compose -f docker-compose-dev.yml run --rm foodsoft bundle install
# Run migrations with:
#   docker compose -f docker-compose-dev.yml run --rm foodsoft bundle exec rake db:migrate
set -euo pipefail
cd "$(dirname "$0")"

source local-settings.sh

# build the image with your uid/gid so files in the mounted source stay yours
export HOST_UID="$(id -u)" HOST_GID="$(id -g)"

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi

# Keep the stack alive: the compose services carry `restart: unless-stopped`
# so docker itself restarts a crashed container, and this loop restarts
# `compose up` if the compose process itself dies (e.g. daemon hiccup).
# Ctrl+C exits cleanly instead of looping.
trap 'echo; echo "stopped by user"; exit 130' INT TERM

while true; do
  $COMPOSE -f docker-compose-dev.yml up --build "$@" && rc=0 || rc=$?
  # detached mode returns immediately once containers are up; nothing to babysit
  for arg in "$@"; do [ "$arg" = "-d" ] || [ "$arg" = "--detach" ] && exit "$rc"; done
  echo "compose exited with status $rc; restarting in 5s (Ctrl+C to stop)..."
  sleep 5
done
