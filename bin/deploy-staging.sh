#!/usr/bin/env bash
set -e

REMOTE="staging"
REMOTE_BRANCH="master"

LOCAL_FROM_BRANCH="master"
LOCAL_TO_BRANCH="heroku-staging"

source "`dirname $0`/deploy.sh"