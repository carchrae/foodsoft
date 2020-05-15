# This plain ruby class should handle all user notifications, called by various models
class UserNotifier
  @queue = :foodsoft_notifier

  # this enqueues a notification but also removes any duplicates
  # eg, if enqueue_in is called several times within the first delay,
  # it will only execute the notification once
  def self.enqueue_in(delay, *args)
    args = args.unshift(FoodsoftConfig.scope)
    Resque.remove_delayed(UserNotifier, *args)
    Resque.enqueue_in(delay, UserNotifier, *args)
  end


  # Resque style method to perform every class method defined here
  def self.perform(foodcoop, method_name, *args)
    puts ("Performing action  #{method_name} with args #{args.as_json} on foodcoop #{foodcoop}")
    FoodsoftConfig.select_foodcoop(foodcoop) if FoodsoftConfig[:multi_coop_install]
    self.send method_name, args
  end

  # when the order has been 'closed'
  def self.finished_order(args)
    # just delegate, one email template for all
    UserNotifier.email_updated_orders(args.push('Order has been closed and sent to supplier.'))
  end

  # when the order has been settled
  def self.closed_order(args)
    # just delegate, one email template for all
    UserNotifier.email_updated_orders(args.push('Here are your final order charges.'))
  end

  # when the order has been updated
  def self.updated_order(args)
    # just delegate, one email template for all
    UserNotifier.email_updated_orders(args.push('The ordering person has updated the order, please review any changes.'))
  end

  # when the order has been edited by the user
  def self.user_edited_order(args)
    # just delegate, one email template for all
    UserNotifier.email_updated_order(args.push('Your order has been saved.  Here is a copy for your records.'))
  end

  # any time the order changes we send an email to members
  def self.email_updated_orders(args)
    puts "email_updated_orders #{args.as_json}"
    order_id, message = args.first(2)
    Order.find(order_id).group_orders.each do |group_order|
      next if group_order.ordergroup.nil?
      group_order.ordergroup.users.each do |user|
        # if user.settings.notify['order_finished']
          puts "email_updated_orders emailing user #{user.email}"
          Mailer.deliver_now_with_user_locale user do
            Mailer.order_result(user, group_order, message)
          end
        # end
      end
    end
  end

  # any time the order changes we send an email to members
  def self.email_updated_order(args)
    puts "email_updated_order #{args.as_json}"
    order_id, ordergroup_id, message = args.first(3)
    group_order = Order.find(order_id).group_orders.where(ordergroup_id: ordergroup_id).first
    unless group_order.ordergroup.nil?
      group_order.ordergroup.users.each do |user|
        # if user.settings.notify['order_finished'] || true
        puts "email_updated_order emailing user #{user.email}"
        Mailer.deliver_now_with_user_locale user do
          Mailer.order_result(user, group_order, message)
        end
        # end
      end
    end
  end

  # If this order group's account balance is made negative by the given/last transaction,
  # a message is sent to all users who have enabled notification.
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
