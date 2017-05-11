# config/initializers/lograge.rb
# OR
# config/environments/production.rb
Rails.application.configure do
  config.lograge.enabled = true
  # config.lograge.ignore_custom = lambda do |event|
  #   # return true here if you want to ignore based on the event
  #   puts "event=#{event.as_json}"
  #   # true
  # end
end

