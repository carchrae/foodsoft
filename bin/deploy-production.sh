#!/usr/bin/env bash
set -e

REMOTE="heroku"
REMOTE_BRANCH="master"

LOCAL_FROM_BRANCH="master"
LOCAL_TO_BRANCH="heroku-production"

source "`dirname $0`/deploy.sh"