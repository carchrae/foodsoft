web: bundle exec puma -t 1:2 -p ${PORT:-3000} -e ${RACK_ENV:-development}
worker: bundle exec rake resque:start_workers