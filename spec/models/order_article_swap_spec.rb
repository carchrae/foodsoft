require 'spec_helper'

describe OrderArticleSwap do
  let(:user) { create :user }
  let(:supplier) { create :supplier }
  let(:bags) { create :article, supplier: supplier, unit: '3LB', unit_quantity: 12, price: 5 }
  let(:loose) { create :article, supplier: supplier, unit: 'CT', unit_quantity: 54, price: 1 }
  let(:order) { create :order, supplier: supplier, article_ids: [bags.id] }
  let(:oa) { order.order_articles.find_by_article_id(bags.id) }
  let(:go1) { create :group_order, order: order }
  let(:go2) { create :group_order, order: order }
  let(:goa1) { create :group_order_article, group_order: go1, order_article: oa }
  let(:goa2) { create :group_order_article, group_order: go2, order_article: oa }

  before do
    goa1.update_quantities(10, 0)
    goa2.update_quantities(2, 0)
    oa.update_results!
    order.finish!(user)
    [oa, goa1, goa2].each(&:reload)
  end

  def swap(factor)
    OrderArticleSwap.new(OrderArticle.find(oa.id), loose, factor, user).apply!
    [oa, goa1, goa2].each(&:reload)
  end

  it 'is only allowed on closed supplier orders' do
    expect(OrderArticleSwap.allowed?(order)).to be true
    expect(OrderArticleSwap.allowed?(create(:order))).to be false
  end

  context 'from 12x3LB bags to a case of 54CT' do
    before { swap(4.5) }

    it 'moves the price snapshot to the new article' do
      expect(oa.article).to eq loose
      expect(oa.article_price.article_id).to eq loose.id
      expect(oa.price.unit_quantity).to eq 54
    end

    it 'keeps the case count' do
      expect(oa.units_to_order).to eq 1
    end

    it 'scales the results' do
      expect(goa1.result).to eq 45
      expect(goa2.result).to eq 9
      expect(goa1.result_computed).to eq 45
    end

    it 'updates what members are charged' do
      expect(go2.reload.price).to eq(9 * loose.fc_price)
    end

    it 'leaves a comment naming the old article' do
      expect(order.comments.last.text).to include bags.name
    end
  end

  it 'rounds results to whole units that add up to the scaled total' do
    swap(56.0 / 12)
    expect(goa1.result).to eq 47
    expect(goa2.result).to eq 9
  end

  it 'gives the last unit of a tie to the earliest entry' do
    goa1.update_attribute(:result, 1)
    goa2.update_attribute(:result, 1)
    swap(1.5)
    expect(goa1.result).to eq 2
    expect(goa2.result).to eq 1
  end

  it 'keeps a hand edit marked as one' do
    goa2.update_attribute(:result, 1)
    swap(3)
    expect(goa2.result).to eq 3
    expect(goa2.result_computed).to eq 6
    expect(goa2.result_manually_changed?).to be true
  end

  it 'converts received units to the new case size' do
    oa.update_attribute(:units_received, 0.5)
    swap(1)
    expect(oa.units_received).to eq((0.5 * 12 / 54).round(5))
  end

  it 'keeps at least one case when the new case is not filled' do
    swap(1)
    expect(oa.units_to_order).to eq 1
    expect(goa1.result).to eq 10
  end

  it 'stays one case when the new case is slightly too small' do
    swap(60.0 / 12)
    expect(oa.units_to_order).to eq 1
  end

  it 'refuses an article already on the order' do
    order.order_articles.create!(article: loose)
    expect { swap(1) }.to raise_error(ActiveRecord::RecordInvalid)
    expect(goa1.reload.result).to eq 10
    expect(order.comments.count).to eq 0
  end
end
