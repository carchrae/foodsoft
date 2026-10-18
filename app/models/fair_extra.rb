# Shares the extra of a finished order fairly between households.
#
# When a case is filled with members' "extra" (tolerance), foodsoft hands the
# surplus to whoever typed their extra first (GroupOrderArticle#calculate_result).
# Over a whole order that leaves some households carrying a lot of extra and
# others none. This class recomputes the results so that the extra each
# household pays, as a share of what it wanted to spend, is as even as possible
# across the order: $5 on a $50 order and $20 on a $200 order are both 10%.
# Very small orders are measured against the order's typical size (the median
# wanted spend) instead of their own, or one $8 pack would swing a $11 order by
# 70 points and dictate who gets what.
#
# 1. Everyone keeps what they wanted; only the surplus beyond the sum of wanted
#    amounts is shared, and only among households that asked for extra on that
#    article, up to the extra they asked for.
# 2. Greedy pass: hand out one unit at a time, always to the household with the
#    lowest share so far, giving it the cheapest article it still has room on.
#    Ties go to the household that asked for extra on fewer articles, then to
#    the earlier entry.
# 3. Rebalance pass: the greedy order can still leave a household behind. Take
#    the household with the lowest share, look at the articles where it asked
#    for extra but has room left, and move one unit from the household with the
#    highest share on that article whenever both end up below that share.
#    Repeat until no such move exists; the highest share only ever goes down,
#    so this terminates.
#
# A line with nothing wanted and only extra ("0 + 2") is a filler: it helped
# the case get ordered, so it receives only what the households that wanted
# the article cannot take, and it is left out of the balance altogether.
#
# Articles short of the wanted total, stock articles and articles with
# hand-edited fractional results are left untouched, but their extra still
# counts towards each household's total so the balance is over the whole order.
#
# Split cases come first: an article whose demand fills a split case (12 of a
# splittable 24CT, see CaseFill#units) has 0 whole cases on the books until it
# is received, so its members would get nothing. Until something is received or
# billed, the split amount is taken as delivered and the results are recomputed
# for it the way receiving does (GroupOrderArticle#calculate_result), before
# the extra is shared.
#
# Plain Ruby, no model changes: #plan is a dry run, #apply! saves the results.
class FairExtra
  MAX_MOVES = 10_000

  Line = Struct.new(:goa, :ordergroup_id, :wanted, :tolerance, :old_result, :result, :price) do
    def extra; result - wanted; end
    def room; tolerance - extra; end
  end

  attr_reader :order, :articles, :lines, :households

  def initialize(order)
    @order = order
    @households = {}   # ordergroup_id -> {name:, base:, before:, after:, fixed:, filler:}
    @articles = []     # articles whose surplus is shared: {oa:, lines:, surplus:, fillers:, filler:}
    @lines = []        # every line of the order with wanted or extra
    @units = 0         # surplus units shared out
    @split = []        # [order_article, total units] of split cases taken as delivered
    load
  end

  # The redistribution without saving it. Returns a Hash for the page.
  def plan
    @plan ||= begin
      greedy
      moves = rebalance
      {
        households: households.values.map { |h| h.merge(pct_before: pct(h[:before], h[:base]), pct_after: pct(h[:after], h[:base])) }.sort_by { |h| h[:name].to_s.downcase },
        changes: changed_lines.map { |l| {id: l.goa.id, article: l.goa.order_article.article.name, ordergroup: households[l.ordergroup_id][:name], from: l.old_result, to: l.result} },
        articles: articles.size,
        units: @units,
        split_articles: @split.size,
        moves: moves,
        spread_before: spread(:before),
        spread_after: spread(:after),
        floor: floor.round(2),
        target_pct: target_pct,
        pinned: households.values.any? { |h| h[:fixed] > 0 },
        fillers: households.values.any? { |h| h[:filler] > 0 },
      }
    end
  end

  # Saves the planned results, then refreshes the households' totals.
  def apply!
    plan
    GroupOrderArticle.transaction do
      # split cases first, so members of a half case get their amounts even
      # when there is no extra to share on it
      @split.each do |oa, total|
        oa.group_order_articles.each { |goa| goa.save_results!(total) }
      end
      changed_lines.each do |l|
        l.goa.update_attributes!(result: l.result, result_computed: l.result)
      end
    end
    order.group_orders.each(&:update_price!)
    order.ordergroups.each(&:update_stats!)
    plan
  end

  private

  def load
    order.order_articles.includes(:article, :article_price, group_order_articles: {group_order: :ordergroup}).each do |oa|
      next if oa.article.is_a?(StockArticle)
      price = oa.price.fc_price.to_f
      unit_size = oa.price.unit_quantity.to_i
      goas = oa.group_order_articles.select { |g| g.quantity.to_i > 0 || g.tolerance.to_i > 0 }
      split_total, simulate = split_total_for(oa, unit_size)
      article_lines = goas.map do |g|
        og = g.group_order.ordergroup
        households[og.id] ||= {id: og.id, name: og.name, base: 0.0, before: 0.0, after: 0.0, fixed: 0.0, filler: 0.0, filler_before: 0.0}
        # a split case not yet taken as delivered: start from what receiving it would give
        current = simulate ? g.calculate_result(split_total)[:total].to_f : g.result.to_f
        Line.new(g, og.id, g.quantity.to_i, g.tolerance.to_i, current, current, price)
      end
      article_lines.each do |l|
        # what the household wanted to spend, and the extra it carries today
        households[l.ordergroup_id][:base] += [l.old_result, l.wanted].min * price
        households[l.ordergroup_id][:before] += [l.old_result - l.wanted, 0].max * price
        households[l.ordergroup_id][:filler_before] += l.old_result * price if l.wanted == 0
      end
      lines.concat(article_lines)

      total = split_total || oa.units.to_f * unit_size
      whole = ->(v) { (v - v.round).abs < 1e-6 }
      # Lines edited by hand keep their amount: fractional results, or results
      # outside wanted..wanted+extra (e.g. a household added at pickup).
      pinned, free = article_lines.partition { |l| !whole.call(l.old_result) || l.old_result < l.wanted || l.old_result > l.wanted + l.tolerance }
      # "0 + extra" lines only take what the households that wanted the article cannot
      fillers, free = free.partition { |l| l.wanted == 0 }
      wanted = free.sum(&:wanted)
      left = total.round - pinned.sum(&:old_result).round
      # what an automatic distribution hands out: the wanted amounts plus the
      # surplus, as far as the extra asked for covers it
      surplus = [[left - wanted, 0].max, free.sum(&:tolerance) + fillers.sum(&:tolerance)].min
      filler = [surplus - free.sum(&:tolerance), 0].max
      surplus -= filler
      shareable = total > 0 && whole.call(total) && wanted <= left && surplus + filler > 0 &&
                  # a total that is not the automatic one was edited by hand: leave it
                  whole.call(free.sum(&:old_result) + fillers.sum(&:old_result) - (wanted + surplus + filler))
      unless shareable
        # stays as it is, but still counts towards the household's extra
        article_lines.each { |l| households[l.ordergroup_id][:fixed] += [l.old_result - l.wanted, 0].max * price }
        next
      end
      pinned.each { |l| households[l.ordergroup_id][:fixed] += [l.old_result - l.wanted, 0].max * price }
      @units += surplus + filler
      # start from "everyone gets what they wanted"; the passes add the extra
      (free + fillers).each { |l| l.result = l.wanted.to_f }
      articles << {oa: oa, lines: free, surplus: surplus, fillers: fillers, filler: filler}
    end
  end

  # [units of the split case the demand fills, whether the results still have
  # to be recomputed for it] when nothing has been received or billed yet and
  # nobody has edited the results by hand; nil otherwise. Once the results add
  # up to the split amount (a previous run, or receiving) they are taken as is.
  def split_total_for(oa, unit_size)
    return nil unless oa.units_received.nil? && oa.units_billed.nil? && unit_size > 1
    fill = CaseFill.new(oa)
    return nil unless fill.split && fill.units > oa.units_to_order
    return nil if oa.group_order_articles.any? { |g| g.result_manually_changed? }
    total = (fill.units * unit_size).round
    simulate = oa.group_order_articles.map { |g| g.result.to_f }.sum < total - 1e-6
    @split << [oa, total] if simulate
    [total, simulate]
  end

  # running extra cost per household, counting articles that are not shared
  # but never "0 + extra" lines, which are left out of the balance
  def cost
    @cost ||= begin
      c = Hash.new(0.0)
      lines.each { |l| c[l.ordergroup_id] += [l.result - l.wanted, 0].max * l.price if l.wanted > 0 }
      c
    end
  end

  def tolerance_count
    @tolerance_count ||= lines.each_with_object(Hash.new(0)) { |l, h| h[l.ordergroup_id] += 1 if l.tolerance > 0 && l.wanted > 0 }
  end

  # what each household gets on "0 + extra" lines, whether shared here or not
  def filler_cost
    c = Hash.new(0.0)
    lines.each { |l| c[l.ordergroup_id] += [l.result, 0].max * l.price if l.wanted == 0 }
    c
  end

  # "0 + extra" lines take what nobody who wanted the article can: one unit at
  # a time to the line that has used the smallest part of its extra
  def fill
    articles.each do |a|
      a[:filler].times do
        line = a[:fillers].select { |l| l.room > 0 }.min_by { |l| [l.extra.to_f / l.tolerance, l.goa.id] }
        break unless line
        line.result += 1
      end
    end
  end

  # the order's typical size: the median of what households wanted to spend
  def floor
    @floor ||= begin
      bases = households.values.map { |h| h[:base] }.select { |b| b > 0 }.sort
      bases.empty? ? 0.0 : (bases[(bases.size - 1) / 2] + bases[bases.size / 2]) / 2.0
    end
  end

  # what a household's share is measured against: its wanted spend, but at
  # least the typical order size, and never less than one currency unit
  def measure(ordergroup_id)
    [households[ordergroup_id][:base], floor, 1.0].max
  end

  # extra as a share of the household's measure
  def share(ordergroup_id, extra = cost[ordergroup_id])
    extra / measure(ordergroup_id)
  end

  # the share everyone would pay if the balanced extra were spread perfectly
  def target_pct
    extra = households.values.sum { |h| h[:after] - h[:filler] }
    total = households.keys.sum { |id| measure(id) }
    total > 0 ? (100.0 * extra / total).round(1) : 0.0
  end

  def rank(ordergroup_id)
    [share(ordergroup_id), tolerance_count[ordergroup_id], ordergroup_id]
  end

  def pct(extra, base)
    base > 0 ? (100.0 * extra / base).round(1) : 0.0
  end

  def give(line, article)
    line.result += 1
    article[:surplus] -= 1
    cost[line.ordergroup_id] += line.price
  end

  def take(line, article)
    line.result -= 1
    article[:surplus] += 1
    cost[line.ordergroup_id] -= line.price
  end

  def greedy
    fill
    loop do
      # every (household, article) pair that can still take a unit
      open = []
      articles.each do |a|
        next unless a[:surplus] > 0
        a[:lines].each { |l| open << [l, a] if l.room > 0 }
      end
      break if open.empty?
      line, article = open.min_by { |l, _| rank(l.ordergroup_id) + [l.price, l.goa.id] }
      give(line, article)
    end
  end

  # Moves a unit from the household with the highest share to the one with the
  # lowest on an article where the latter still has room, as long as both end up
  # below the donor's share. Returns the number of moves made.
  def rebalance
    moves = 0
    while moves < MAX_MOVES
      moved = false
      households.keys.sort_by { |id| rank(id) }.each do |low|
        articles.each do |a|
          mine = a[:lines].find { |l| l.ordergroup_id == low && l.room > 0 }
          next unless mine
          donor = a[:lines].select { |l| l.ordergroup_id != low && l.extra > 0 }.max_by { |l| rank(l.ordergroup_id) }
          next unless donor && share(low, cost[low] + mine.price) < share(donor.ordergroup_id) - 1e-9
          take(donor, a)
          give(mine, a)
          moves += 1
          moved = true
          break
        end
        break if moved
      end
      break unless moved
    end
    filler = filler_cost
    households.each do |id, h|
      h[:filler] = filler[id].round(2)
      h[:filler_before] = h[:filler_before].round(2)
      h[:after] = (cost[id] + filler[id]).round(2)
      h[:before] = h[:before].round(2)
      h[:fixed] = h[:fixed].round(2)
    end
    moves
  end

  def changed_lines
    lines.select { |l| (l.result - l.old_result).abs > 1e-9 }
  end

  # gap in percentage points between the highest and lowest share of the extra
  # that can be balanced ("0 + extra" fillers are outside the balance),
  # measured the way the balance measures it
  def spread(key)
    values = households.map { |id, h| pct(h[key] - h[key == :before ? :filler_before : :filler], measure(id)) }
    values.empty? ? 0.0 : (values.max - values.min).round(1)
  end
end
