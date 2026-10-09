require_relative '../spec_helper'

describe ArticleCategory do
  before { ArticleCategory.class_variable_set(:@@cache, {}) }

  it 'finds a category by a case-insensitive substring of its name' do
    category = create :article_category, name: 'Bulk Flours Organic'
    expect(ArticleCategory.find_match('flours organic')).to eq category
  end

  it 'returns the shortest of several matches' do
    create :article_category, name: 'Bulk Herbs & Spices - Organic'
    short = create :article_category, name: 'Herbs & Spices'
    expect(ArticleCategory.find_match('Herbs & Spices')).to eq short
  end

  it 'matches a phrase in the description, also with regexp characters' do
    category = create :article_category, name: 'Oils', description: 'Everland Oils (Virgin), Cooking Oils'
    expect(ArticleCategory.find_match('Everland Oils (Virgin)')).to eq category
  end

  it 'creates a missing category on demand' do
    expect {
      category = ArticleCategory.find_match('Bulk Nuts Organic')
      expect(category).to be_persisted
      expect(category.name).to eq 'Bulk Nuts Organic'
    }.to change { ArticleCategory.count }.by(1)
    expect(ArticleCategory.find_match('Bulk Nuts Organic')).to eq ArticleCategory.where(name: 'Bulk Nuts Organic').first
  end

  it 'tidies whitespace and cuts long names to the column size' do
    category = ArticleCategory.find_match('  Everland/Sweetcane Sweeteners  - Honey ' + 'x' * 300)
    expect(category).to be_persisted
    expect(category.name.length).to eq 255
    expect(category.name).to start_with 'Everland/Sweetcane Sweeteners - Honey'
  end

  it 'does not create anything for blank or very short names' do
    expect {
      expect(ArticleCategory.find_match(nil)).to be_nil
      expect(ArticleCategory.find_match('')).to be_nil
      expect(ArticleCategory.find_match('ab')).to be_nil
    }.not_to change { ArticleCategory.count }
  end

  it 'uses the created category for new articles synchronised from a spreadsheet' do
    supplier = create :supplier
    file = Tempfile.new(['articles', '.csv'])
    file.write ";1234;Avocado Oil 250 ml;;;;250 ml;9.95;5;0;1;;;Everland Oils & Vinegars\n"
    file.close
    _updated, _outlisted, new_articles = supplier.sync_from_file File.open(file.path), filename: file.path
    expect(new_articles.length).to eq 1
    expect(new_articles.first.article_category.name).to eq 'Everland Oils & Vinegars'
  ensure
    file.unlink if file
  end
end
