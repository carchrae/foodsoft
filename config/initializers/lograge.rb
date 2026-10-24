# One line per request instead of the Started / Processing / Rendered /
# Completed spread. Development and production only; test keeps the default.
Rails.application.configure do
  next if Rails.env.test?
  next unless defined?(Lograge)

  config.lograge.enabled = true
  config.lograge.custom_options = lambda do |event|
    params = event.payload[:params].except('controller', 'action', 'format', 'utf8', 'authenticity_token')
    options = {}
    options[:params] = params.to_query.truncate(400) unless params.empty?
    options[:exception] = event.payload[:exception].first if event.payload[:exception]
    options
  end
end
