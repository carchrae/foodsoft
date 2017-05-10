secret = FoodsoftConfig[:secret] || ENV['SECRET'] || ENV['SECRET_KEY_BASE']
Rails.logger.warn('no secret token set') if secret.blank?

if Rails.env ==='production'
  Foodsoft::Application.config.secret_key_base=secret
  raise 'no environment variable SECRET defined, generate one with: openssl rand -hex 128' unless secret
else
  Foodsoft::Application.config.secret_key_base=secret || 'you really really need to change me! you really really need to change me! development only'
end



