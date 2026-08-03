# Generic dispatcher for UserNotifier notifications (delayed order emails
# etc.). ApplicationJob takes care of selecting the right foodcoop scope.
class UserNotifierJob < ApplicationJob
  queue_as :foodsoft_notifier

  def perform(method_name, *args)
    Rails.logger.info("UserNotifierJob: #{method_name} #{args.inspect}")
    UserNotifier.send(method_name, args)
  end
end
