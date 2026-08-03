# ActionMailer class that handles all emails for Foodsoft.
class Mailer < ActionMailer::Base
  # XXX Quick fix to allow the use of show_user. Proper take would be one of
  #     (1) Use draper, decorate user
  #     (2) Create a helper with this method, include here and in ApplicationHelper
  helper :application
  helper :group_orders
  include ApplicationHelper

  # raised to abort sending when nothing changed since the last order email
  class MailCancelled < StandardError; end

  layout 'email' # Use views/layouts/email.txt.erb

  default from: "#{I18n.t('layouts.foodsoft')} <#{FoodsoftConfig[:email_sender]}>",
          'X-Auto-Response-Suppress' => 'All'

  # Sends an email with instructions on how to reset the password.
  # Assumes user.setResetPasswordToken has been successfully called already.
  def reset_password(user)
    @user = user
    @link = new_password_url(id: @user.id, token: @user.reset_password_token)

    mail to: user,
         subject: I18n.t('mailer.reset_password.subject', username: show_user(user))
  end

  # Sends an invite email.
  def invite(invite)
    @invite = invite
    @link = accept_invitation_url(token: @invite.token)

    mail to: invite.email,
         subject: I18n.t('mailer.invite.subject')
  end

  # Notify user of upcoming task.
  def upcoming_tasks(user, task)
    @user = user
    @task = task
    @next_tasks = Task.order(:due_date).next_assigned_tasks_for(user)

    mail to: user,
         subject: I18n.t('mailer.upcoming_tasks.subject')
  end

  # Sends a welcome email with instructions on how to reset the password.
  # Assumes user.setResetPasswordToken has been successfully called already.
  def welcome(user)
    @user = user
    @additional_text = additonal_welcome_text(user)
    @link = new_password_url(id: @user.id, token: @user.reset_password_token)

    mail to: user,
         subject: I18n.t('mailer.welcome.subject')
  end

  # credit: https://gist.github.com/henrik/146844#gistcomment-2267142
  def deep_diff(a, b)
    (a.keys | b.keys).each_with_object({}) do |k, diff|
      if a[k] != b[k]
        if a[k].is_a?(Hash) && b[k].is_a?(Hash)
          diff[k] = deep_diff(a[k], b[k])
        else
          diff[k] = [a[k], b[k]]
        end
      end
      diff
    end
  end

  # Snapshot the group order into redis and return what changed since the
  # last email (false on the first one) so order emails highlight changes
  # and are skipped entirely when nothing changed.
  def compute_changed_since_last_email(group_order, user)
    email_key = email_key(group_order, user)

    group_order_current = group_order.group_order_articles.map do |goa|
      [goa.id,
       {
         quantity: goa.quantity,
         tolerance: goa.tolerance,
         result: goa.result,
         fc_price: goa.order_article.price.fc_price,
         name: goa.order_article.article.name,
         unit: goa.order_article.article.unit
       }]
    end

    # add the overall totals to the diff
    total_min = group_order.group_order_articles.map { |goa| goa.order_article.price.fc_price * goa.quantity }.sum
    total_max = total_min + group_order.group_order_articles.map { |goa| goa.order_article.price.fc_price * goa.tolerance }.sum
    group_order_current << ['totals', {
      total: group_order.group_order_articles.map { |goa| goa.order_article.price.fc_price * goa.result }.sum,
      'min-total': total_min,
      'max-total': total_max
    }]

    group_order_current_json = group_order_current.to_h.to_json
    # re-parse to stringify keys, and other quirks
    group_order_current = JSON.parse(group_order_current_json)

    group_order_previous_json = FoodsoftCache.get(email_key)
    FoodsoftCache.set(email_key, group_order_current_json)
    return false if group_order_previous_json.blank?

    group_order_previous = JSON.parse(group_order_previous_json)
    diff = begin
      deep_diff(group_order_previous, group_order_current)
    rescue StandardError
      {}
    end
    # keep just the old value in the hash
    diff.each do |id, changes|
      if !diff[id].is_a?(Hash)
        diff.delete(id)
      else
        changes.each do |prop, change|
          changes[prop] = change[0] if change
        end
      end
    end
    diff
  end

  # Sends order result for specific Ordergroup, threaded onto the previous
  # email and cancelled when nothing changed since then.
  def order_result(user, group_order, message = '')
    @order = group_order.order
    @group_order = group_order
    @message = message
    @user = user
    @diff = compute_changed_since_last_email(group_order, user)
    @updated_by = @order.updated_by || @order.created_by

    raise MailCancelled, user.email.to_s if @diff && @diff.size == 0

    message_id = FoodsoftCache.get(email_id_key(group_order, user))

    if message_id
      mail to: user,
           is_reply: true,
           'IN-REPLY-TO': "<#{message_id}>",
           subject: I18n.t('mailer.order_result.subject', name: group_order.order.name, pickup: group_order.order.pickup),
           reply_to: @updated_by.email
    else
      message_result = mail to: user,
                            subject: I18n.t('mailer.order_result.subject', name: group_order.order.name, pickup: group_order.order.pickup),
                            reply_to: @updated_by.email
      FoodsoftCache.set(email_id_key(group_order, user), message_result.message_id)
      message_result
    end
  end

  # Sends order received info for specific Ordergroup
  def order_received(user, group_order)
    @order        = group_order.order
    @group_order  = group_order

    order_articles = @order.order_articles.reject { |oa| oa.units_received.nil? }
    @abundant_articles = order_articles.select { |oa| oa.difference_received_ordered.positive? }
    @scarce_articles = order_articles.select { |oa| oa.difference_received_ordered.negative? }

    mail to: user,
         subject: I18n.t('mailer.order_received.subject', name: group_order.order.name)
  end

  # Sends order result to the supplier
  def order_result_supplier(user, order, options = {})
    @user     = user
    @order    = order
    @supplier = order.supplier

    add_order_result_attachments order, options

    subject = I18n.t('mailer.order_result_supplier.subject', name: order.supplier.name)
    subject += " (#{I18n.t('activerecord.attributes.order.pickup')}: #{format_date(order.pickup)})" if order.pickup

    # replies go to the group inbox, not the individual orderer; bcc keeps a copy
    mail to: order.supplier.email,
         cc: user,
         bcc: FoodsoftConfig[:email_from],
         reply_to: FoodsoftConfig[:email_from],
         subject: subject
  end

  # Notify user if account balance is less than zero
  def negative_balance(user, transaction)
    @group        = user.ordergroup
    @transaction  = transaction

    mail to: user,
         subject: I18n.t('mailer.negative_balance.subject')
  end

  def not_enough_users_assigned(task, user)
    @task = task
    @user = user

    mail to: user,
         subject: I18n.t('mailer.not_enough_users_assigned.subject', task: task.name)
  end

  def remind_order_not_settled(user, late_orders)
    @user = user
    @late_orders = late_orders
    mail to: user,
         subject: 'You have orders that need to be settled'
  end

  def nearly_full_articles_email(order, user)
    @order = order
    @user = user
    @order_name = order.name
    @items = @order.nearly_full_order_articles
    mail(to: user.email, subject: "#{order.name} Nearly Full Cases")
  end

  def mail(args)
    args[:message_id] ||= "<#{Mail.random_tag}@#{default_url_options[:host]}>"
    args[:subject] = "[#{FoodsoftConfig[:name]}] #{args[:subject]}"
    args[:subject] = "Re: #{args[:subject]}" if args.delete(:is_reply)

    if args[:from].is_a? User
      args[:reply_to] ||= args[:from]
      args[:from] =
        format_address(FoodsoftConfig[:email_sender], I18n.t('mailer.from_via_foodsoft', name: show_user(args[:from])))
    end

    %i[bcc cc reply_to sender to].each do |k|
      user = args[k]
      args[k] = format_address(user.email, show_user(user)) if user.is_a? User
    end

    if contact_email = FoodsoftConfig[:contact][:email]
      args[:reply_to] ||= format_address(contact_email, FoodsoftConfig[:name])
    end

    reply_email_domain = FoodsoftConfig[:reply_email_domain]
    if reply_email_domain && !args[:return_path] && args[:to].is_a?(String)
      address = Mail::Parsers::AddressListsParser.parse(args[:to]).addresses.first
      args[:return_path] = "<#{FoodsoftConfig.scope}.bounce+#{address.local}=#{address.domain}@#{reply_email_domain}>"
    end

    super
  end

  def self.deliver_now_with_user_locale(user, &block)
    I18n.with_locale(user.settings['profile']['language']) do
      deliver_now(&block)
    end
  end

  def self.deliver_now_with_default_locale(&block)
    I18n.with_locale(FoodsoftConfig[:default_locale]) do
      deliver_now(&block)
    end
  end

  def self.deliver_now
    message = yield
    message.deliver_now
  rescue MailCancelled => e
    Rails.logger.info("mail was cancelled (no changes): #{e.message}")
  rescue StandardError => e
    MailDeliveryStatus.create email: message.to[0], message: e.message
  end

  # separate method to allow plugins to mess with the attachments
  def add_order_result_attachments(order, options = {})
    attachments['order.pdf'] = OrderFax.new(order, options).to_pdf
    # suppliers only want the PDF; the csv attachment just confused people
    # attachments['order.csv'] = OrderCsv.new(order, options).to_csv
  end

  # separate method to allow plugins to mess with the text
  def additonal_welcome_text(user); end

  protected

  def email_key(group_order, user)
    "email-update-#{group_order.id}-#{user.id}"
  end

  def email_id_key(group_order, user)
    "email-id-#{group_order.id}-#{user.id}"
  end

  private

  def format_address(email, name)
    address = Mail::Address.new email
    address.display_name = name
    address.format
  end
end
