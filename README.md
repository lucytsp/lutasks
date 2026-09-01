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

## The board finds your lists itself

`tasklists.list` returns every list on the account, so you do not have to tell
the board what you have. `CONFIG.LISTS` only *pins* order and colour for the
lists you care about; anything else appears automatically, appended
alphabetically, coloured from a hash of its title so it keeps the same colour
every time. `CONFIG.HIDE_LISTS` is the only thing that excludes a list.

This was originally a whitelist, which meant a list you created in Google Tasks
silently never showed up — a bad way to find out you had made one.

One limit worth knowing: the web app runs as **you** (`executeAs:
USER_DEPLOYING`), so the API always returns *your* lists, whoever is looking.
That is what makes it a shared board. Showing each colleague their own tasks
instead would mean `executeAs: USER_ACCESSING`, which is a different product —
everyone would authorise individually and see only their own lists, and none of
your board.

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

## Views

- **Wall** — a masonry wall of every task, reflowing as cards expand.
- **Board** — one column per list, closer to the Google Calendar side panel.
- **Looking back** — seven consecutive days ending on today, oldest first, so
  the week reads left to right the way a diary does. Weekends are included: an
  empty Saturday is information too, and they are dimmed rather than dropped.
  Each column lists what was closed that day and why. It is separated from Wall
  and Board in the control and sits on its own recessed ground, because it shows
  the past and the other two show what is outstanding.
- Descriptions sit at low opacity, clamped to two lines. Hovering lifts them;
  clicking a card opens it fully and the neighbouring cards slide out of the
  way rather than jumping.
- `/` focuses search. `Esc` closes an open card, the add form, or a note prompt.
- **Easy read** enlarges the text, loosens the leading to 1.85 and switches the
  titles to the plainer of the two faces.
- **Theme** follows the system by default and can be pinned to light or dark.
  Both, plus the view and Easy read, are remembered between visits.

## Closing a task

Ticking is instant — the note is optional and never blocks it. The toast that
follows offers **Add a note** and **Undo**, and the note is stored on the task
itself:

    ✓ 26 Aug: did not fix — superseded by the new timesheet screen

so it reads correctly in the Google Tasks app too, and shows on the card
without needing to open it. Reopening a task clears the note.

## Seniors

Anyone listed in `CONFIG.SENIORS` (matched on full email address) also gets:

- **Comments**, stored one per line on the task itself:
  `» 26 Aug · matt: blocked on the fee review change`
- **Reordering** within a list — Top, Up, Down, via `Tasks.move`.
- **Send to Today**, which moves a task into the `TODAY` list and back.
- **Move to…**, a chip for every other list, one click to file a task.
- **Drag to reorder**, in Board view: drag a card up or down its column to
  change its order, or across into another column to move it there and place
  it at the same time. `tasks.move` takes `destinationTasklist` and `previous`
  together, so both happen in one call and the task keeps its identity — and
  therefore its link back to the original email.

Dragging is Board view only. On the Wall, cards from every list are
interleaved, so a gap between two of them does not correspond to a position in
any list. Top/Up/Down remain on every open card and are the keyboard path.

All of these offer Undo.

Everyone else gets a read-and-add board. Because comments live in the task's
own notes rather than a side table, they survive losing this script and are
readable from any Google Tasks client.

## Every task gets a due date

The compose form's due date defaults to **today**. A task with no due date is
effectively invisible in the Google apps — you cannot even tell when it was
added — so the default is a date rather than nothing. Push it out if it can
wait. `dueStamp_` sends midnight UTC, since the API keeps the date and drops
any time of day.

## New tasks land in UNSORTED

`CONFIG.INTAKE_LIST` is `UNSORTED`, and the compose form defaults to it, so a
task written in a hurry has somewhere to go that is not the wrong list. File it
later from the board.

## Handing a task to Claude

An open card offers a **copy icon** and **Ask Claude**. Both produce the same
brief, which opens by saying what it is and then gives labelled fields:

    This is a task from my task list that I would like help with.

    Title: Don't show closed jobs in timesheet
    Category: TIMESHEETS
    Requester: Shehzad
    List: JOBSMAN BUGS
    Was due: 10 Jun 2026 (11 weeks ago)
    Status: still open

    Details:
    ...

    Comments from colleagues:
    - matt (24 Aug): ...

    Links:
    - Original message: https://mail.google.com/...

    Background:
    Jobsman is the practice management system we use at TS Partners...

The closing paragraph comes from `CONFIG.CLAUDE_CONTEXT`, so the standing
context goes with every task instead of being retyped. A closed task reports
`Status: closed on 25 Aug 2026` and `Closed because: …` instead.

The Ask Claude link has a URL length limit, so when a brief is too long the
*details* are trimmed and every labelled field survives. The link
carries a truncated version because URLs have limits; the copy button carries
everything.

The clipboard API is blocked in some embedded frames. There is a
`document.execCommand` fallback, and if both fail the board says so and points
you at Ask Claude instead.

## Tasks that came in from email

A task created from Gmail carries a `links[]` entry back to the message. Those
render as an **Open the email** chip, and the link is preserved through
everything here — which is why `sendToList` refuses to move an email-linked
task when it would have to fall back to copy-and-delete.

## Linking to a view

The board reads query parameters, so a filtered view can be sent to someone:

    ?view=board&lists=JOBSMAN%20TODO,TODAY
    ?view=week
    ?q=timesheet&done=1

`view` is `wall`, `board` or `week`; `lists` is a comma-separated list of list
titles; `q` prefills the search; `done=1` shows completed tasks.

An Apps Script page runs inside a sandboxed frame, so the address bar is not
readable with `window.location` — this uses `google.script.url.getLocation`,
with a 1.5s timeout so a slow response never leaves the board hanging.

### Getting a nicer URL than /macros/s/AKfycb…

Apps Script gives you no control over the deployment URL. Three ways round it,
cheapest first:

1. **Google Sites.** Make a site at `sites.google.com`, embed the web app, and
   publish to `sites.google.com/tspartners.co.uk/tasks`. No code, and it keeps
   the Workspace sign-in.
2. **A redirect on your own domain.** Point `tasks.tspartners.co.uk` at a
   Cloudflare Worker (free) or any redirect service that 302s to the `/exec`
   URL, preserving the query string. This gives the tidiest links to share.
3. **A bookmark per view.** Not a real URL, but it costs nothing.

Whichever you pick, the `/exec` URL changes each time you deploy a *new*
version, so redeploy over the existing deployment rather than creating one.

## Typefaces

Five pairings, picked from the **Display** menu and remembered per browser:
**Ledger** (Newsreader over Public Sans, the default), **Notebook** (Fraunces
over Source Sans 3), **Grotesque** (Archivo over IBM Plex Sans), **Editorial**
(Instrument Serif over Instrument Sans) and **Plain** (Public Sans throughout).

Each sets its own title size, weight, leading and tracking — one set of metrics
does not suit a 20px display serif and a 16px grotesque equally. All nine
families come from a single stylesheet and the browser fetches only the faces
actually rendered.

## If the board shows sample data

A banner reading **"Not connected"** means the page could not reach Google
Tasks and nothing you do is being saved. On a deployment that is a fault —
check the Apps Script execution log. A banner reading **"Preview"** is the
standalone copy behaving correctly, with no backend behind it.

The page decides which it is from the host: Apps Script serves user content
from `googleusercontent.com`, so there it waits up to eight seconds for the
sandbox to inject `google.script` before giving up. Anywhere else it does not
wait at all.

## Your settings stay yours

`Config.gs` holds your list names, your colleagues and your email addresses. It
is **gitignored** — it lives on your machine and in your Apps Script project and
never reaches GitHub. What is shared is `Config.example.gs`, a generic template.

    cp Config.example.gs Config.gs

Do that first on any fresh clone, then fill it in. `deploy.sh` refuses to run
without it rather than pushing a broken project.

Only one of the two is ever sent to Apps Script: `.claspignore` allows
`Config.gs` and excludes the template, because two files each declaring
`const CONFIG` is a redeclaration error and the whole script would fail.

## Setup

1. Create a project at https://script.google.com.
2. Copy in `Config.gs` (from the template above), `Code.gs`, `index.html` and
   `appsscript.json`.
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

Checked against the `tasks.list` and `tasks.move` reference pages.

- **Three list defaults drop data silently.** `maxResults` is 20 (max 100),
  `showHidden` is false — and tasks completed in Google's own apps are
  *hidden*, so `showCompleted` alone is not enough — and `showAssigned` is
  false, so tasks assigned from Docs or Chat Spaces never appear at all.
  `listAllTasks_` overrides all three and follows `pageToken` to the end.
- **Repeating tasks cannot be moved between lists.** Documented explicitly,
  and the only reason "Send to Today" can fail. It reports that in words
  rather than copying the task, which would lose its Gmail link.
- **`due` is date-only.** A time of day is accepted and then discarded.
- **No push notifications.** There is no `watch` method, so refresh is manual.
- **Ordering is opaque.** `position` is a lexicographic string, not a number.
  Reordering goes through `tasks.move` with `previous` (omit it for first
  position). A task that is both completed and hidden can only move to
  position 0, so this board reorders top-level uncompleted tasks only.
- **Ceilings.** Titles 1,024 characters, notes 8,192, 20,000 non-hidden tasks
  per list, 100,000 in total, 2,000 subtasks per task. The notes ceiling is the
  live one here: comments and closing notes are appended to a task's notes, so
  a long-running task can grow into it. Both writes check first and say so
  rather than failing at the API.
- **`links[]` is output-only.** A task created from Gmail carries a link back
  to the message and there is no way to write one. This is why a task is never
  copied between lists — a copy could not carry its link.
- **`due` is a scheduled date, not a deadline.** The documentation is explicit:
  it is the day the task should be done and appears on the calendar grid. The
  Claude brief says "Scheduled for" rather than "Was due" for that reason.
- **Assigned tasks cannot carry notes.** Tasks assigned from Google Docs have
  no notes field, so the board does not offer a comment box on them, and a
  closing note on one is refused after the task is ticked rather than silently
  dropped. They show an "Assigned from a document / Chat space" chip linking
  back to where they came from.
- **`position`, `parent`, `hidden` and `links` are all read-only.**

### Worth doing later

`tasks.list` accepts `completedMin` / `completedMax`, so the Week view could
ask for just the last five days of completions instead of filtering the whole
board client-side. Also `dueMin` / `dueMax` and `updatedMin` for incremental
polling.

## Files

    Config.example.gs   the shared template — generic, safe to publish
    Config.gs           your real settings — gitignored, never committed
    Code.gs             Apps Script backend — Tasks API, paginated
    LEARNINGS.md        mistakes made building this, and what they taught
    index.html          the whole front end, one file, no build step
    appsscript.json     manifest: Tasks advanced service, domain access
    preview.html        generated; index.html minus the document wrapper
    tools/make-preview.sh   rebuilds preview.html
