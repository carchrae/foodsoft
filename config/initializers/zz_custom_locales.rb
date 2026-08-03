# Our custom wording lives in config/locales/zz-custom.en.yml, which both adds
# new keys and OVERRIDES upstream en.yml keys. I18n resolves duplicate keys by
# load order (later wins), and Dir[] glob order is not guaranteed on all
# platforms — so force the file to the end of the load path.
Rails.application.config.after_initialize do
  path = Rails.root.join('config/locales/zz-custom.en.yml').to_s
  I18n.load_path = (I18n.load_path - [path]) + [path]
  I18n.backend.reload!
end
