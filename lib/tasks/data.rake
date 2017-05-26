
# put in here all foodsoft tasks
# => :environment loads the environment an gives easy access to the application
namespace :foodsoft do
  desc 'Clean note fields'
  task :clean_notes => :environment do
    articles = Article.includes(:article_category).all.select{ |a| (a.note && a.note.length<20 && a.note.length > 1) }
    puts "there are #{articles.count} articles to update"
    articles.each{ |a| puts "#{a.id} - old note: #{a.note} - #{(a.note=''|| 1) &&  a.save(validate: false)}" }
  end

  desc 'Clean up deleted articles'
  task :clean_articles => :environment do
    articleIdsInUse = OrderArticle.all.map{|a| [a.article_id,true] }.to_h
    to_delete = Article.where('deleted_at IS NOT NULL').map{|a| articleIdsInUse[a.id]?nil:a.id}.compact
    puts "found #{to_delete.count} deleted articles that are not used."
    to_delete.each{|id| Article.destroy(id)}
    puts "deleted #{to_delete.count} articles that were not being used (in open or past orders)."
  end


end