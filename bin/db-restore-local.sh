#!/usr/bin/env bash
echo restoring from "${1:-db.production.sql}"
psql -h localhost -U food-coop -d food-coop < ${1:-db.production.sql}
