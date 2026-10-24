#!/bin/sh
set -e

# allow re-using the instance - https://stackoverflow.com/a/38732187/2866660
if [ -f tmp/pids/server.pid ]; then
  rm tmp/pids/server.pid
fi

# The dev and prodcheck stacks keep gems in a named volume mounted over
# BUNDLE_PATH, which hides what the image build installed. After a Gemfile
# change the volume is stale, so top it up before starting.
if [ -n "$BUNDLE_PATH" ] && ! bundle check >/dev/null 2>&1; then
  echo "bundle volume is missing gems, running bundle install"
  bundle install -j "$(nproc)"
fi

exec "$@"
