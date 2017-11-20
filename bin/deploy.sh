#!/usr/bin/env bash
git stash
git checkout $LOCAL_TO_BRANCH
git merge $LOCAL_FROM_BRANCH -m "merge from $LOCAL_FROM_BRANCH to $LOCAL_TO_BRANCH"
git push $REMOTE $LOCAL_TO_BRANCH:master
git checkout $LOCAL_FROM_BRANCH
git stash pop
