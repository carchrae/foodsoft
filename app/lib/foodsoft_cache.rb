# Tiny redis-backed key/value store used for email change-tracking and
# once-only markers. Degrades to a no-op when redis is unavailable so a
# missing redis never takes pages down.
class FoodsoftCache
  require 'redis'
  @@prefix = 'FoodsoftCache:'

  def self.redis
    @@redis ||= Redis.new(url: ENV['REDIS_URL'])
  end

  def self.get(key)
    redis.get(to_key(key))
  rescue StandardError => e
    Rails.logger.warn("FoodsoftCache.get failed (#{e.class}): #{e.message}")
    nil
  end

  def self.set(key, value)
    redis.set(to_key(key), value)
  rescue StandardError => e
    Rails.logger.warn("FoodsoftCache.set failed (#{e.class}): #{e.message}")
    nil
  end

  def self.to_key(key)
    @@prefix + key
  end
end
