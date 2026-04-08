# encoding: utf-8
class Finance::BalancingController < Finance::BaseController

  def index
    @orders = Order.finished.page(params[:page]).per(@per_page).order('ends DESC')
  end

  def new
    @order = Order.find(params[:order_id])

    # this is unpleasant - and not where this code should belong, but solves the case where
    # an order points to an invoice that has been deleted
    if @order.invoice.nil? && !@order.invoice_id.nil?
      @order.invoice_id = nil
      @order.save
    end

    flash.now.alert = t('finance.balancing.new.alert') if @order.closed?
    @comments = @order.comments

    @articles = @order.order_articles.ordered_or_member.includes(:article, :article_price,
                                                                 group_order_articles: {group_order: :ordergroup})

    sort_param = params['sort'] || 'name'
    @articles = case sort_param
                when 'name' then
                  @articles.order('articles.name ASC')
                when 'name_reverse' then
                  @articles.order('articles.name DESC')
                when 'order_number' then
                  @articles.order('articles.order_number ASC')
                when 'order_number_reverse' then
                  @articles.order('articles.order_number DESC')
                else
                  @articles
                end

    render layout: false if request.xhr?
  end

  def update
    @order = Order.find(params[:id])
    # order_charge = params[:order][:order_charge].to_f
    order_charge = params[:order].try(:[], :order_charge).to_f
    order_charge_name = params[:order].try(:[], :order_charge_name)
    @order.distribute_charge(order_charge_name, order_charge) if order_charge
    flash[:notice] = "Distributed charge of #{order_charge} to members"
    redirect_to new_finance_order_url(order_id: @order.id)
  end

  def new_on_order_article_create # See publish/subscribe design pattern in /doc.
    @order_article = OrderArticle.find(params[:order_article_id])

    render :layout => false
  end

  def new_on_order_article_update # See publish/subscribe design pattern in /doc.
    @order_article = OrderArticle.find(params[:order_article_id])

    render :layout => false
  end

  def update_summary
    @order = Order.find(params[:id])
  end

  def edit_note
    @order = Order.find(params[:id])
    render :layout => false
  end

  def update_note
    @order = Order.find(params[:id])
    if @order.update_attributes(params[:order])
      render :layout => false
    else
      render :action => :edit_note, :layout => false
    end
  end

  # before the order will booked, a view lists all Ordergroups and its order_prices
  def confirm
    @order = Order.find(params[:id])
  end

  # Balances the Order, Update of the Ordergroup.account_balances
  def close
    @order = Order.find(params[:id])
    @type = FinancialTransactionType.find_by_id(params.permit(:type)[:type])
    @order.close!(@current_user, @type)
    redirect_to finance_order_index_url, notice: t('finance.balancing.close.notice')

  rescue => error
    redirect_to new_finance_order_url(order_id: @order.id), alert: t('finance.balancing.close.alert', message: error.message)
  end

  # Close the order directly, without automaticly updating ordergroups account balances
  def close_direct
    @order = Order.find(params[:id])
    @order.close_direct!(@current_user)
    redirect_to finance_order_index_url, notice: t('finance.balancing.close_direct.notice')
  rescue => error
    redirect_to finance_order_index_url, alert: t('finance.balancing.close_direct.alert', message: error.message)
  end

  def reduce_price_to_supplier
    @order = Order.find(params[:id])
    @order_article = OrderArticle.find(params[:order_article_id])

    member_total = @order_article.group_orders_sum
    actual_price_per = @order_article.price.price_rounded_up(
      price: @order_article.total_supplier_charge,
      quantity: member_total[:quantity]
    )

    @order_article.article_price.update_attribute(:price, actual_price_per)
    @order_article.order.group_orders.each(&:update_price!)

    @group_order_article = @order_article.group_order_articles.first
    render 'group_order_articles/update'
  end

  def write_off_to_group_expenses
    @order = Order.find(params[:id])
    @order_article = OrderArticle.find(params[:order_article_id])

    expenses_group = Ordergroup.where("name LIKE ?", "Z - Group%").first
    raise "Z - Group Expenses ordergroup not found" unless expenses_group

    group_order = GroupOrder.where(order_id: @order.id, ordergroup_id: expenses_group.id).first_or_initialize
    unless group_order.persisted?
      group_order.price = 0
      group_order.save!
    end

    total_units_ordered = @order_article.units * @order_article.article_price.unit_quantity
    member_total = @order_article.group_orders_sum
    missing_units = total_units_ordered - member_total[:quantity]

    goa = GroupOrderArticle.where(group_order_id: group_order.id, order_article_id: @order_article.id).first_or_initialize
    goa.result = (goa.result || 0) + missing_units
    goa.save!
    group_order.update_price!

    @group_order_article = goa
    render 'group_order_articles/create'
  end

  # Balances the Order, Update of the Ordergroup.account_balances
  def reopen
    @order = Order.find(params[:id])
    @order.reopen!(@current_user)
    redirect_to finance_order_index_url, notice: t('finance.balancing.reopen.notice')
  rescue => error
    redirect_to new_finance_order_url(order_id: @order.id), alert: t('finance.balancing.reopen.alert', message: error.message)
  end

end
