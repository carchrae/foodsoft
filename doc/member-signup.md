# Setting up a new member

Handover notes for the work done on 2026-09-07.

`/join` is unchanged: it still explains the coop and links to the Google Form.
The form's response spreadsheet stays the intake. What is new is the admin
screen that turns a row of that spreadsheet into a real account.

| Screen | URL |
|---|---|
| Paste rows | `/f/admin/member_signups/new` (Administration → Set up a new member) |
| Check the parsed values | `POST /f/admin/member_signups/preview` |
| Create and email | `POST /f/admin/member_signups` |

## The flow

1. Copy one or more rows out of the sign-up spreadsheet and paste them into the
   text box. Including the header row is fine and gives the best results.
2. The next screen shows what was read from each row in editable fields, with
   the raw pasted row underneath so you can see what came in. Correct anything
   wrong, untick rows you do not want, and press **Create accounts and send
   welcome emails**.
3. For each ticked row this creates a `User`, an `Ordergroup` named after them,
   and the `Membership` joining the two — in one transaction, so a rejected row
   leaves nothing behind. Each new member gets a random password they never see
   and a welcome email with a link to choose their own.

Nothing is ever created without that confirmation step, and a row whose email
address is already in use, or whose name is missing, is refused with the reason
shown on the row.

## How a pasted row is read

`MemberSignup.parse` (`app/models/member_signup.rb`) splits the paste into rows
and cells itself: cells are tab separated and a cell containing a tab, newline
or quote is wrapped in double quotes with inner quotes doubled, which is what
Google Sheets and Excel put on the clipboard. Ruby 2.3's `CSV` cannot be told to
be lenient about stray quotes in free-text answers, hence the hand-written
scanner.

Columns are then matched in one of two ways:

* **With a header row** — patterns are tried in a fixed order so that
  "Email Address" is claimed by the email column before the address column gets
  to look at it, and each column can only be claimed once. The "who do you know
  in our group" column is claimed before the last-name column for the same
  reason: that question ends "first and last name please".
* **Without a header row** — the cells are inspected: the email is the cell that
  parses as an address, the phone the first cell that is only dialling
  characters, the name the first cell of two to four all-letter words, the
  household size the first bare number 1–20. The home address is *scored* rather
  than positional (starts with a house number, contains a postal code, contains
  a street word, contains a comma) because the free-text answers also contain
  digits and words; anything scoring 3 or more wins. Whoever referred them is
  named further down the form than they are, so of the remaining cells that read
  like a name, the last one is taken as the referral.

Both paths were checked against a full 17-column row from the current form and
produce the same result. The preview screen exists precisely so the guesses do
not have to be perfect.

The ordergroup is named after the member, cut to the 25 characters `Group`
allows, with " 2", " 3" … appended if that name is taken.

## Welcome email

`Mailer#welcome_new_member` reuses the existing password-reset token mechanism
with a 14 day expiry (people are slow to read welcome mail) and links to
`/f/login/new_password`. If the token has run out by the time they click it, the
mail tells them to use "Forgot password" instead. A mail failure is reported on
the results screen and never undoes the account, which already exists by then.

It is built from four blocks in `mailer.welcome_new_member.*`, joined so that
the optional ones can drop out without leaving a gap:

* `text` — the greeting, their login, and the link to choose a password.
* `referral` — only when the "who do you know in our group" answer was parsed
  or typed in. It quotes their answer back and asks them to make that person
  their go-to for questions. The answer is used for the email only; it is not
  stored on the user or the ordergroup.
* `mailing_list` — only when `mailing_list_url` is configured. It is followed by
  `mailing_list_by_email` when `mailing_list_subscribe` is also set.
* `signoff`.

### Why the mailing list is not automatic

`groups.google.com/g/mlbg` is a consumer Google Group, and consumer groups have
no API at all. The Admin SDK Directory API's `members.insert` only reaches
groups that belong to a Google Workspace domain, and needs a service account
with domain-wide delegation on that domain. The `<group>+subscribe@` address
does work, but only in a message sent *from* the member's own address, which is
not ours to send.

So the welcome email asks them to do it, both ways:

* `mailing_list_url` — the group's about page, "Join group" (needs a Google account).
* `mailing_list_subscribe` — an address they can email from their own account
  instead. This key already existed for the messages plugin, where it is only
  read when `mailing_list` is also set, so setting it alone changes nothing else.

Both live in `config/app_config.yml`, which is **gitignored** — the tracked
`config/app_config.yml.SAMPLE` documents them, but they have to be set on each
deployment, or stored per-coop in the settings table (they are not `protected`
keys, so `FoodsoftConfig[]=` accepts them). With neither set the email simply
leaves the mailing-list paragraphs out.

The results screen reminds the admin that a group manager can add the person
directly from the Google Groups UI if they would rather not wait.

## Case-insensitive email

Logging in and asking for a password reset used to be case sensitive, because
Postgres compares strings case sensitively and the lookups were plain
`find_by_email` / `find_by_nick`. Now:

* `User.find_by_login` and `User.find_by_email_case_insensitive` compare with
  `LOWER()` and strip surrounding whitespace; `User.authenticate` uses them.
* `User#normalize_email` (a `before_validation`) stores every address stripped
  and downcased, so no two accounts can differ only by case. Existing addresses
  are normalised the next time that user record is saved; until then the
  `LOWER()` lookups already make login work.
* `LoginController#reset_password` and `Invite#email_not_already_registered`
  use the case-insensitive lookup too.

## Files

New:

* `app/models/member_signup.rb`
* `app/controllers/admin/member_signups_controller.rb`
* `app/views/admin/member_signups/{new,preview,create}.html.haml`
* `app/views/mailer/welcome_new_member.text.haml`

Existing files touched (all additive, to keep the port to `custom-rebuild` easy):

* `app/models/user.rb` — `normalize_email`, `find_by_login`,
  `find_by_email_case_insensitive`; `authenticate` now calls `find_by_login`.
* `app/models/invite.rb`, `app/controllers/login_controller.rb` — one lookup each.
* `app/mailers/mailer.rb` — one new method.
* `config/routes.rb` — one `resources` block inside `namespace :admin`.
* `config/navigation.rb` — one menu item.
* `config/locales/en.yml` — `admin.member_signups`, `mailer.welcome_new_member`,
  `navigation.admin.member_signups`, `activemodel.attributes.member_signup`.
* `config/app_config.yml.SAMPLE` — documents `mailing_list_url`.

Not in git, but needed on every deployment (`config/app_config.yml`):

```yaml
  mailing_list_url: https://groups.google.com/g/mlbg/about
  mailing_list_subscribe: mlbg+subscribe@googlegroups.com
```
