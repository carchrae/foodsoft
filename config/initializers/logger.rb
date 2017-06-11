# # Create logger that ignores messages containing “CACHE”
# class CacheFreeLogger < ::Logger
#   @@keys = "CACHE".split(' ')
#
#   def debug(message, *args, &block)
#     super unless @@keys.map {|key| message.include? key}.include?(true)
#   end
#   def debug(message, &block)
#     super unless @@keys.map {|key| message.include? key}.include?(true)
#   end
#   def debug(&block)
#     super
#   end
# end
#
# # Overwrite ActiveRecord’s logger
# ActiveRecord::Base.logger = ActiveSupport::TaggedLogging.new(CacheFreeLogger.new(STDOUT)) unless Rails.env.test?
# ActiveRecord::Base.logger = nil