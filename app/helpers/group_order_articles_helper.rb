module GroupOrderArticlesHelper
  # return an edit field for a GroupOrderArticle result
  def group_order_article_edit_result(goa)
    result = number_with_precision goa.result, strip_insignificant_zeros: true
    if goa.group_order.order.finished? && current_user.role_finance?
      simple_form_for goa, remote: true, html: { 'data-submit-onchange' => 'changed', class: 'delta-input' } do |f|
        f.input_field :result, as: :delta, class: 'input-nano', data: { min: 0 }, id: "r_#{goa.id}", value: result
      end
    else
      result
    end
  end

  # show result quantity with its physical unit where the unit is parseable
  def group_order_article_show_amount(goa)
    unit = goa.order_article.article.unit
    fc_unit = (::Unit.new(unit) rescue nil) || (::Unit.new(unit.downcase) rescue nil)
    if fc_unit.nil?
      goa.result
    else
      goa.result * fc_unit
    end
  end

  def group_order_article_total_amount(total, order_article)
    unit = order_article.article.unit
    fc_unit = (::Unit.new(unit) rescue nil) || (::Unit.new(unit.downcase) rescue nil)
    if fc_unit.nil?
      total
    else
      total * fc_unit
    end
  end
end
