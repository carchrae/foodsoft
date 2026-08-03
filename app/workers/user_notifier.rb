# This plain ruby class should handle all user notifications, called by
# various models. Delivery runs through UserNotifierJob (ActiveJob) —
# formerly direct Resque; delayed emails need resque-scheduler in production.
class UserNotifier
  # enqueue a notification after a delay; delays are shortened in development
  def self.enqueue_in(delay, method_name, *args)
    delay = 1.second if Rails.env.development?
    UserNotifierJob.set(wait: delay).perform_later(method_name, *args)
  end

  def self.queue_order_updated_email(delay:, group_order_id:, message:)
    enqueue_in(delay, 'email_updated_group_order', group_order_id, message)
  end

  # when the order has been 'closed' (finished and sent to supplier)
  def self.finished_order(args)
    email_updated_orders(args.push('The order has been closed and sent to supplier.'))
  end

  # when the order has been settled
  def self.closed_order(args)
    email_updated_orders(args.push('Here are your final order charges.'))
  end

  # day after pickup delivery notification
  def self.delivery_day_after_notification(args)
    email_updated_orders(args.push('The order is not yet finalized but here are your final charges. If anything does not look correct, please email the ordering person by replying to this email.'))
  end

  # when the order has been updated
  def self.updated_order(args)
    email_updated_orders(args.push('There were updates to your order, please review any changes.'))
  end

  # any time the order changes we send an email to members; Mailer.order_result
  # cancels itself when nothing changed for that group since the last email
  def self.email_updated_orders(args)
    order_id, message = args.first(2)
    Order.find(order_id).group_orders.each do |group_order|
      next if group_order.ordergroup.nil?

      group_order.ordergroup.users.each do |user|
        Mailer.deliver_now_with_user_locale user do
          Mailer.order_result(user, group_order, message)
        end
      rescue Mailer::MailCancelled => e
        Rails.logger.info("mail was cancelled/no mail required #{e.message}")
      rescue StandardError => e
        Rails.logger.error("email_updated_orders - problem occurred #{e} #{e.backtrace&.first(5)}")
      end
    end
  end

  def self.email_updated_group_order(args)
    group_order_id, message = args
    group_order = GroupOrder.find(group_order_id)
    return unless group_order.ordergroup

    group_order.ordergroup.users.each do |user|
      Mailer.deliver_now_with_user_locale user do
        Mailer.order_result(user, group_order, message)
      end
    rescue Mailer::MailCancelled => e
      Rails.logger.info("mail was cancelled/no mail required #{e.message}")
    rescue StandardError => e
      Rails.logger.error("email_updated_group_order: problem occurred #{e}")
    end
  end

  # If this order group's account balance is made negative by the given/last
  # transaction, a message is sent to all users who have enabled notification.
  def self.negative_balance(args)
    ordergroup_id, transaction_id = args
    transaction = FinancialTransaction.find transaction_id

    Ordergroup.find(ordergroup_id).users.each do |user|
      if user.settings.notify['negative_balance']
        Mailer.deliver_now_with_user_locale user do
          Mailer.negative_balance(user, transaction)
        end
      end
    end
  end
end
