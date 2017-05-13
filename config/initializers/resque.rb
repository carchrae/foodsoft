# Initializer to configure resque daemon
if ENV['REDIS_URL']
  #ensure you are also running the worker - rake resque:work QUEUE=foodsoft_notifier
  Resque.redis = ENV['REDIS_URL']
else
  puts 'Warning, no REDIS_URL defined, using inline'
  Resque.inline = true
end
