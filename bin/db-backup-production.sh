#!/usr/bin/env bash
export FILENAME="db-backups/db.production.`date "+%Y-%m-%d-%H:%M:%S"`.sql"
echo saving to $FILENAME
pg_dump -h awa.intellecti.ca -d food-coop-production -U food-coop --clean > $FILENAME
rm -f db.production.sql
ln -s $FILENAME db.production.sql
ls -l $FILENAME

