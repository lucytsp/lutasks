# Task Wall

A colour-coded front end for Google Tasks, served from Google Apps Script.

Your lists stay in Google Tasks — this only changes how they look. Anything you
do here shows up in the Google Tasks app on your phone, and anything you do
there shows up here.

## Why Apps Script and not a normal web app

Apps Script removes the two hardest parts of building on the Tasks API:

- **No OAuth app to register.** No consent screen, no sensitive-scope
  verification review, no refresh tokens expiring every seven days. The script
  runs as the deploying account and colleagues never sign in to anything.
- **A free server-side store.** `PropertiesService` and `CacheService` are there
  if the board ever needs to remember something the Tasks API cannot hold.

## Colour without a colour field

The Tasks API has no colour, label, tag or priority field, and no way to add
one. Every colour here is derived from data you already have:

| Signal | Source | Shows as |
|---|---|---|
| List | which Google Tasks list the task is in | the card's paper tint |
| Category | `PREFIX:` at the start of the title | a chip, e.g. `TIMESHEETS` |
| Assignee | a trailing `(name)` matching someone in `CONFIG.PEOPLE` | a coloured initial |
| Age | the due date, graded rather than uniformly red | `8w over` |

So `TIMESHEETS: Don't show closed jobs in timesheet (Shehzad)` renders as a
rose-tinted card, chip `TIMESHEETS`, title `Don't show closed jobs in
timesheet`, and Shehzad's avatar — with no change to how you type tasks.

A trailing parenthetical that is *not* a known name is treated as a note, so
`(partially done)` and `(manual)` render as a dashed note chip instead of
inventing a colleague.

## Reading

- **Wall** — a masonry wall of every task, reflowing as cards expand.
- **Board** — one column per list, closer to the Google Calendar side panel.
- Descriptions sit at low opacity, clamped to two lines. Hovering lifts them;
  clicking a card opens it fully and the neighbouring cards slide out of the
  way rather than jumping.
- `/` focuses search. `Esc` closes an open card or the add form.

## Setup

1. Create a project at https://script.google.com.
2. Copy in `Code.gs`, `index.html` and `appsscript.json`.
3. **Services → +** → add **Google Tasks API** (advanced service, `Tasks`).
4. Edit `CONFIG` in `Code.gs`:
   - `LISTS` — the lists to show, in order, each with one of the eight colours
     (`rose indigo slate teal amber green violet cyan`). Leave it empty to show
     every list you have.
   - `INTAKE_LIST` — where the add form writes. Created if missing.
   - `PEOPLE` — names recognised in a trailing `(...)`.
5. **Deploy → New deployment → Web app**, execute as *Me*.
6. Share the URL.

With `clasp`: put your `scriptId` in `.clasp.json`, then `./deploy.sh`.

### Access

`appsscript.json` ships with `"access": "DOMAIN"` — anyone signed in to your
Google Workspace domain. Two reasons not to loosen this to `ANYONE`:

- The board shows your own task lists, notes included, to whoever has the URL.
- `Session.getActiveUser().getEmail()` returns an empty string for viewers
  outside the deploying account's domain, so *Reported by* would be blank.

## Known limits of the Tasks API

- **`due` is date-only.** A time of day is accepted and then discarded.
- **No push notifications.** There is no `watch` method, so refresh is manual.
- **Ordering is opaque.** `position` is a lexicographic string, not a number,
  and cannot be patched — reordering needs `tasks.move`. This board does not
  reorder tasks yet.
- **Subtasks are one level deep.**
- **Lists paginate at 100.** `listAllTasks_` follows `pageToken` to the end;
  without that loop the API returns 20 tasks and silently drops the rest.

## Files

    Code.gs             Apps Script backend — Tasks API, paginated
    index.html          the whole front end, one file, no build step
    appsscript.json     manifest: Tasks advanced service, domain access
    preview.html        generated; index.html minus the document wrapper
    tools/make-preview.sh   rebuilds preview.html
