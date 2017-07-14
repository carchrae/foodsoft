# put in here all foodsoft tasks
# => :environment loads the environment an gives easy access to the application
namespace :foodsoft do
  desc "Notify users of upcoming tasks"
  task :notify_upcoming_tasks => :environment do
    tasks = Task.where(done: false, due_date: 1.day.from_now.to_date)
    for task in tasks
      rake_say "Send notifications for #{task.name} to .."
      for user in task.users
        begin
          Mailer.upcoming_tasks(user, task).deliver_now if user.settings.notify['upcoming_tasks'] == 1
        rescue
          rake_say "deliver aborted for #{user.email}.."
        end
      end
    end
  end

  desc "Notify workgroup of upcoming weekly task"
  task :notify_users_of_weekly_task => :environment do
    for workgroup in Workgroup.all
      for task in workgroup.tasks.where(due_date: 7.days.from_now.to_date)
        unless task.enough_users_assigned?
          puts "Notify workgroup: #{workgroup.name} for task #{task.name}"
          for user in workgroup.users
            if user.settings.messages['send_as_email'] == "1" && !user.email.blank?
              begin
                Mailer.not_enough_users_assigned(task, user).deliver_now
              rescue
                rake_say "deliver aborted for #{user.email}"
              end
            end
          end
        end
      end
    end
  end

  desc "Create upcoming periodic tasks"
  task :create_upcoming_periodic_tasks => :environment do
    for tg in PeriodicTaskGroup.all
      created_until = tg.create_tasks_for_upfront_days
      rake_say "created until #{created_until}"
    end
  end

  desc "Set user emails to public"
  task :set_email_to_public => :environment do
    User.all.each do |user|
      if (user.settings.profile[:email_is_public])
        rake_say "#{user.name} already public"
      else
        user.settings.merge!(:profile, { "email_is_public"=>true})
        rake_say "changed #{user.name} to email public"
      end
    end
  end

  desc "Set user phone to public"
  task :set_phone_to_public => :environment do
    User.all.each do |user|
      if (user.settings.profile[:phone_is_public])
        rake_say "#{user.name} already public"
      else
        user.settings.merge!(:profile, { "phone_is_public"=>true})
        rake_say "changed #{user.name} to phone public"
      end
    end
  end

  desc "Set notify negative balance"
  task :set_notify_negative => :environment do
    User.all.each do |user|
      if (user.settings.notify[:negative_balance])
        rake_say "#{user.name} already negative_balance"
      else
        user.settings.merge!(:notify, { "negative_balance"=>true})
        rake_say "changed #{user.name} to notify negative balance"
      end
    end
  end

  desc "Set notify order_finished"
  task :set_notify_order_finished => :environment do
    User.all.each do |user|
      if (user.settings.notify[:order_finished])
        rake_say "#{user.name} already order_finished"
      else
        user.settings.merge!(:notify, { "order_finished"=>true})
        rake_say "changed #{user.name} to notify order_finished"
      end
    end
  end
end

# Helper
def rake_say(message)
  puts message unless Rake.application.options.silent
end
