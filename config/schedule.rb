# Use this file to define all tasks, which should be executed by cron
# Learn more: http://github.com/javan/whenever

# Upcoming tasks notifier
every :day, at: '7:20 am' do
  rake 'multicoops:run TASK=foodsoft:notify_upcoming_tasks'
  rake 'multicoops:run TASK=foodsoft:notify_users_of_weekly_task'
  rake 'multicoops:run TASK=foodsoft:remind_settle'
end

# Import and assign bank transactions
every :weekday, at: %w[5:56am 6:04pm] do
  rake 'multicoops:run TASK=foodsoft:import_and_assign_bank_transactions'
end

# Weekly tasks
every :sunday, at: '7:14 am' do
  rake 'multicoops:run TASK=foodsoft:create_upcoming_periodic_tasks'
  rake 'multicoops:run TASKS=foodsoft:prune_old_attachments'
end

# Day-after-pickup delivery notification at 1pm
every :day, at: '1:00 pm' do
  rake 'multicoops:run TASK=foodsoft:send_delivery_notifications'
end

# Finish ended orders
every 1.minute do
  rake 'multicoops:run TASK=foodsoft:finish_ended_orders'
end

# check for nearly full emails
every 5.minutes do
  rake 'multicoops:run TASK=foodsoft:ordergroup:nearly_full_email'
end

# Monthly dues: DISABLED. The old cron referenced a nonexistent task
# (foodsoft:ordergroup:charge vs the actual foodsoft:ordergroup:dues) so it
# never ran in production. Review the amount/exclusions before enabling.
# every 1.month, at: 'start of the month' do
#   rake 'multicoops:run TASK=foodsoft:ordergroup:dues'
# end
