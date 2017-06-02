module Finance::InvoicesHelper
  def format_delivery_item delivery
    format_date(delivery.delivered_on)
  end
  def format_order_item order
    begin
      "#{format_date(order.ends)} (#{number_to_currency(order.sum)})"
    rescue => e
      Rails.logger.error("format_order_item of order=#{order.inspect} failed: #{e.message}")
      '?'
    end
  end
end
