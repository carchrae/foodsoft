#!/usr/bin/env bash
#
# Launch the foodsoft dev server in docker (Ubuntu 18.04 + Ruby 2.6.6 image).
#
# Prerequisites: your postgres and redis containers must already be running
# on localhost (../bin/docker-db.sh starts them). Connection strings come
# from local-settings.sh.
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

exec $COMPOSE -f docker-compose-dev.yml up --build "$@"
