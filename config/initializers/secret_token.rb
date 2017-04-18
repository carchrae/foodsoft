
Rails.logger.warn('no secret token set') if ENV['SECRET'].blank?

if Rails.env ==='production'
  Foodsoft::Application.config.secret_token=ENV['SECRET']
  raise 'no environment variable SECRET defined, generate one with: openssl rand -hex 128' unless ENV['SECRET']
else
  Foodsoft::Application.config.secret_token=ENV['SECRET'] || 'NO_SECRET'
end



