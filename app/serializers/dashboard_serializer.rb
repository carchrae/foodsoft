# Builds the JSON consumed by the modern (Vue) dashboard (dashboard_app.js).
#
# Like OrderingSerializer this is the boundary between browser and server: it
# gathers the same information the classic home page renders (home/index,
# shared/_open_orders, shared/_closed_orders, home/_start_nav) into one plain
# structure. No model logic lives here; anything expensive is guarded so a
# single failing statistic never breaks the whole dashboard.
class DashboardSerializer
  # The classic home page warns when available credit drops below this (hard-coded there too).
  LOW_CREDIT_THRESHOLD = 200
  RECENT_TRANSACTIONS = 5

  def initialize(user, view)
    @user = user
    @ordergroup = user.ordergroup
    @view = view
  end

  def as_json(*)
    {
      user: {name: @user.name, first_name: @user.first_name},
      ordergroup: ordergroup_json,
      tasks: tasks_json,
      open_orders: Order.open_reverse.map { |o| order_json(o, open: true) },
      finished_orders: Order.finished_not_closed.map { |o| order_json(o, open: false) },
      transactions: transactions_json,
      apples: apples_json,
      notice: notice_json,
      wiki_links_html: wiki_links_html,
      messages: messages_json,
      quick_links: quick_links,
      config: {
        currency_unit: FoodsoftConfig[:currency_unit] || '',
        charge_members_manually: !!FoodsoftConfig[:charge_members_manually],
        use_nick: !!FoodsoftConfig[:use_nick],
        name: FoodsoftConfig[:name],
      },
      urls: {
        legacy: @view.root_path(classic: 1),
        profile: @view.my_profile_path,
        orders: @view.group_orders_path,
        orders_archive: @view.archive_group_orders_path,
        tasks: @view.tasks_path,
        my_tasks: @view.user_tasks_path,
      },
    }
  end

  private

  # ---- account -----------------------------------------------------------------

  def ordergroup_json
    return nil if @ordergroup.nil?
    available = @ordergroup.get_available_funds
    {
      id: @ordergroup.id,
      name: @ordergroup.name,
      account_balance: money(@ordergroup.account_balance),
      available_funds: money(available),
      value_of_open_orders: money(@ordergroup.value_of_open_orders),
      value_of_finished_orders: money(@ordergroup.value_of_finished_orders),
      low_credit_threshold: LOW_CREDIT_THRESHOLD,
      credit_ok: available >= LOW_CREDIT_THRESHOLD,
      account_updated: @ordergroup.account_updated.try(:iso8601),
      not_enough_apples: safely(false) { @ordergroup.not_enough_apples? },
      urls: {
        statement: @view.my_ordergroup_path,
        payments: wiki_url('Payments'),
      },
    }
  end

  def transactions_json
    return [] if @ordergroup.nil?
    multiple_types = safely(false) { FinancialTransactionType.has_multiple_types }
    @ordergroup.financial_transactions.includes(:user, financial_transaction_type: :financial_transaction_class)
      .limit(RECENT_TRANSACTIONS).order('created_on DESC').map do |ft|
      {
        id: ft.id,
        created_on: ft.created_on.try(:iso8601),
        created_on_human: @view.format_time(ft.created_on),
        user: @view.show_user(ft.user),
        type: (multiple_types ? ft.financial_transaction_type.try(:name) : nil),
        klass: safely(nil) { ft.financial_transaction_type.financial_transaction_class.display },
        note: ft.note,
        amount: money(ft.amount),
      }
    end
  end

  def apples_json
    return nil unless @ordergroup && FoodsoftConfig[:use_apple_points]
    safely(nil) do
      bar = AppleBar.new(@ordergroup)
      {
        points: bar.apples,
        bar_state: bar.group_bar_state,
        bar_width: bar.group_bar_width,
        mean_order_amount_per_job: money(bar.mean_order_amount_per_job),
        stop_ordering_under: FoodsoftConfig[:stop_ordering_under],
        more_info_url: FoodsoftConfig[:applepear_url],
      }
    end
  end

  # ---- tasks ---------------------------------------------------------------------

  def tasks_json
    {
      mine: Task.order(:due_date).next_assigned_tasks_for(@user).map { |t| task_json(t) },
      to_accept: Task.order(:due_date).unaccepted_tasks_for(@user).map { |t| task_json(t) },
      open: Task.order(:due_date).next_unassigned_tasks_for(@user).map { |t| task_json(t) },
    }
  end

  def task_json(task)
    {
      id: task.id,
      name: task.name,
      title: @view.task_title(task),
      description: task.description.presence,
      due_date: task.due_date.try(:iso8601),
      due_date_human: (task.due_date && @view.l(task.due_date, format: I18n.t('home.index.due_date_format'))),
      duration: task.duration,
      periodic: task.periodic?,
      workgroup: task.workgroup.try(:name),
      required_users: task.required_users,
      still_required: task.still_required_users,
      assignees: task.assignments.includes(:user).map { |a| {name: @view.show_user(a.user), accepted: a.accepted?} },
      accepted_by_me: task.is_accepted?(@user),
      assigned_to_me: task.is_assigned?(@user),
      urls: {
        show: @view.task_path(task),
        accept: @view.accept_task_path(task),
        reject: @view.reject_task_path(task),
        done: @view.set_done_task_path(task),
      },
    }
  end

  # ---- orders ------------------------------------------------------------------------

  def order_json(order, open:)
    group_order = @ordergroup && order.group_order(@ordergroup)
    {
      id: order.id,
      name: order.name,
      note_html: linkified(order.note),
      ends: order.ends.try(:iso8601),
      ends_human: @view.format_time(order.ends),
      pickup: order.pickup.try(:iso8601),
      pickup_human: @view.format_date(order.pickup),
      open: open,
      stockit: order.stockit?,
      my_order: group_order && {
        id: group_order.id,
        price: money(group_order.price),
        updated_by: @view.show_user(group_order.updated_by),
        updated_on: group_order.updated_on.try(:iso8601),
        updated_on_human: @view.format_time(group_order.updated_on),
      },
      stats: order_stats(order),
      urls: order_urls(order, group_order, open),
    }
  end

  def order_urls(order, group_order, open)
    urls = {show: (group_order && @view.group_order_path(group_order))}
    if open && @ordergroup
      urls[:order] = if group_order
                       @view.edit_group_order_path(group_order, order_id: order.id)
                     else
                       @view.new_group_order_path(order_id: order.id)
                     end
      urls[:order_modern] = @view.ordering_path(order)
    end
    urls
  end

  # Same figures as the badges on shared/_open_orders; each guarded separately.
  def order_stats(order)
    ordered = order.order_articles.ordered
    supplier_total = safely(nil) { order.stockit? ? nil : order.supplier.sum_on_pickup_date(order.pickup, :gross) }
    min_order_value = safely(0) { order.stockit? ? 0 : order.supplier.min_order_quantity.to_s.sub('$', '').to_f }
    {
      items_filled: safely(nil) { ordered.count },
      # note: Relation#count ignores a block on Rails 4.2, hence to_a
      cases_to_fill: safely(nil) { order.order_articles.to_a.count { |oa| oa.missing_units > 0 } },
      full_cases: safely(nil) { ordered.sum(:units_to_order) },
      coop_total: safely(nil) { money(order.sum(:gross)) },
      supplier_total: money(supplier_total),
      min_order_value: (min_order_value > 0 ? money(min_order_value) : nil),
      min_order_met: (min_order_value > 0 && supplier_total ? supplier_total.to_f > min_order_value : nil),
      splits: safely(nil) { order.split_effort },
    }
  end

  # ---- misc ------------------------------------------------------------------------------

  # The wiki's dashboard page, which the classic home page shows at the top.
  def notice_json
    return nil unless wiki_enabled? && @view.respond_to?(:wikified_body)
    safely(nil) do
      page = Page.respond_to?(:dashboard) ? Page.dashboard : nil
      return nil if page.nil? || page.body.blank?
      {title: page.title, html: @view.wikified_body(page.body, page.title).to_s, url: wiki_url(page.permalink)}
    end
  end

  # Wiki front page (usually a list of links), shown in the classic sidebar.
  def wiki_links_html
    return nil unless wiki_enabled? && @view.respond_to?(:wikified_body)
    safely(nil) do
      page = Page.find_by_permalink('Main_Page')
      page && page.body.present? ? @view.wikified_body(page.body, page.title).to_s : nil
    end
  end

  # Latest public messages, as on the classic home page (messages plugin).
  def messages_json
    return nil unless defined?(FoodsoftMessages) && FoodsoftMessages.enabled?
    safely(nil) do
      list = Message.pub.order('created_at DESC').limit(5).map do |m|
        {
          id: m.id,
          subject: m.subject,
          sender: m.sender_name,
          created_at: m.created_at.try(:iso8601),
          created_at_human: @view.format_time(m.created_at),
          urls: {show: @view.message_path(m), reply: @view.new_message_path(message: {reply_to: m.id})},
        }
      end
      {list: list, urls: {all: @view.messages_path, threads: @view.message_threads_path, new: @view.new_message_path}}
    end
  end

  def wiki_url(permalink)
    return nil unless wiki_enabled? && @view.respond_to?(:wiki_page_path)
    safely(nil) { @view.wiki_page_path(permalink: permalink) }
  end

  # `defined?(Page)` would not autoload the model, so ask the plugin instead.
  def wiki_enabled?
    return false unless defined?(FoodsoftWiki)
    FoodsoftWiki.respond_to?(:enabled?) ? FoodsoftWiki.enabled? : true
  end

  # Role-based shortcuts, mirroring home/_start_nav.
  def quick_links
    groups = []
    groups << {title: I18n.t('home.start_nav.foodcoop'), items: [
      {label: I18n.t('home.start_nav.members'), url: @view.foodcoop_users_path},
      {label: I18n.t('home.start_nav.tasks'), url: @view.user_tasks_path},
    ]}
    if @ordergroup || @user.role_orders?
      items = []
      items << {label: I18n.t('home.start_nav.orders.overview'), url: @view.group_orders_path} if @ordergroup
      items << {label: I18n.t('home.start_nav.orders.end'), url: @view.orders_path} if @user.role_orders?
      groups << {title: I18n.t('home.start_nav.orders.title'), items: items}
    end
    if @user.role_article_meta? || @user.role_suppliers?
      groups << {title: I18n.t('home.start_nav.products.title'), items: [
        {label: I18n.t('home.start_nav.products.edit'), url: @view.suppliers_path},
        {label: I18n.t('home.start_nav.products.edit_stock'), url: @view.stock_articles_path},
      ]}
    end
    if @user.role_finance?
      groups << {title: I18n.t('home.start_nav.finances.title'), items: [
        {label: I18n.t('home.start_nav.finances.accounts'), url: @view.finance_new_transaction_collection_path},
        {label: I18n.t('home.start_nav.finances.settle'), url: @view.finance_root_path},
      ]}
    end
    if @user.role_admin?
      groups << {title: I18n.t('home.start_nav.admin'), items: [
        {label: I18n.t('home.start_nav.new_ordergroup'), url: @view.new_admin_ordergroup_path},
        {label: I18n.t('home.start_nav.new_user'), url: @view.new_admin_user_path},
      ]}
    end
    groups
  rescue StandardError => e
    Rails.logger.warn("DashboardSerializer#quick_links: #{e.message}")
    []
  end

  # Escapes the text, then turns http(s) URLs into links (classic page linkifies unescaped text).
  def linkified(text)
    return nil if text.blank?
    escaped = ERB::Util.html_escape(text)
    escaped.gsub(URI::DEFAULT_PARSER.make_regexp(%w[http https])) { |url| %(<a href="#{url}" target="_blank" rel="noopener">#{url}</a>) }
  end

  def safely(fallback)
    yield
  rescue StandardError => e
    Rails.logger.warn("DashboardSerializer: #{e.class}: #{e.message}")
    fallback
  end

  def money(value)
    return nil if value.nil?
    return nil if value.respond_to?(:infinite?) && value.infinite?
    value.to_f.round(2)
  end
end
