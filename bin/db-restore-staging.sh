#!/usr/bin/env bash
echo restoring from "${1:-db.production.sql}"
psql -h awa.intellecti.ca -U food-coop -d food-coop-staging < ${1:-db.production.sql}
