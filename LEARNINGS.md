# What went wrong building this, and what it taught me

Kept because the mistakes are more useful than the finished code.

## 1. I recommended the wrong architecture before looking

Asked how to build a nicer front end for Google Tasks, I wrote a long answer
recommending a Vite/React SPA with Google Identity Services, and spent half of
it on the OAuth consent screen, sensitive-scope verification, and the seven-day
refresh-token expiry in testing mode.

Then I saw the existing Apps Script bug tracker. Apps Script already solves
every one of those problems — no OAuth app, no consent screen, no expiring
tokens, and a free server-side store. The SPA would have reintroduced all of
it to gain nothing.

**Lesson.** Ask what already exists before recommending a stack. "Empty repo"
is not the same as "nothing exists" — the working system was in a different
repo, and one screenshot changed the entire recommendation.

## 2. The same SVG bug, fixed wrongly, twice

The hand-drawn tick hides itself with `stroke-dasharray` and
`stroke-dashoffset`, animating the offset to zero to draw the stroke on.

- **First attempt:** `dasharray:100; dashoffset:100`. A round line-cap paints a
  dot even on a zero-length dash, so every unticked box had a blue speck.
- **Second attempt:** `dashoffset:101`. This looked right and the test passed,
  but `dasharray:100` repeats with a period of 200 — an offset of 101 wraps the
  *end* of the path back into view. The speck came back, in a new place.
- **Correct:** `dasharray:100 300`. An explicit gap longer than the path means
  the pattern cannot wrap into the visible range at all.

**Lesson.** With `stroke-dasharray`, a single value is a repeating pattern, not
a length. If you are offsetting to hide something, the gap must be longer than
the path.

## 3. My test asserted the wrong thing entirely

The check for that speck was:

    every(m => parseFloat(getComputedStyle(m).strokeDashoffset) > 100)

It passed while the dot was plainly visible in a screenshot, because it tested
the *input* to the rendering, not the rendering. Replacing it with a scan for
pen-blue pixels inside each checkbox caught it immediately.

**Lesson.** For a visual bug, assert on pixels. Computed style tells you what
you asked the browser to do, not what it did.

## 4. Hard-coded counts in tests, three times over

`swatches list every list === 4`, `board renders columns === 4`,
`toast button length === 1`, `done cards === 1`. Every one of these broke as
soon as a list or a toast button was added — and each time the suite reported a
FAIL that looked like a regression and was not.

Worse, one of them actively misled: the test clicked `.toast button` to press
Undo, and once a second button existed it was clicking "Add a note" instead,
then reporting that undo did not work.

**Lesson.** Derive expectations from state (`state.lists.length`) or from
identity (`locator('button', {hasText:'Undo'})`), never from a count that was
true at the time of writing. A brittle test costs more than no test, because it
spends attention on false alarms.

## 5. I blamed the feature when the fixture was broken

The Week view showed 2/1/0/0/0 tasks across five days instead of one per day.
Two fixture bugs, not view bugs:

- Timestamps built as `now - days*86400000 + 36000000`. Adding ten hours to the
  *current* time rolls into the next day whenever it is after 2pm.
- One task placed four calendar days back, which landed on a Saturday — a day
  the view deliberately does not show.

The grouping logic was correct throughout. It grouped exactly what it was given.

**Lesson.** Test fixtures are code and have bugs. When output looks wrong,
check the input before rewriting the thing that produced it. "Days ago" and
"working days ago" are different, and date arithmetic should start from
midnight, not from now.

## 6. Re-rendering destroyed the animation I had just written

`toggleDone` called `render()` immediately, which rebuilt the DOM. The 440ms
stroke animation could never play, because the element it was running on was
replaced within a frame.

The fix was to mutate the existing element's classes in place, let the stroke
run, and rearrange the board only once it had finished.

**Lesson.** Optimistic re-render and animation are in direct conflict. Decide
which owns the element during the transition.

## 7. Things I got right by checking rather than assuming

- The 20-task pagination limit was real: JOBSMAN BUGS (31), SHELVED (24) and
  JOBSMAN TODO (23) were all being silently truncated. Confirmed from the list
  counts in a screenshot rather than assumed from the docs.
- `&#xA3;1000.00` was *not* an escaping bug — `escapeHtml` was correct and the
  stored title genuinely contained entity codes. Reading the code before
  "fixing" it avoided breaking working behaviour.
- The categories and assignees the board colours by were already in the task
  titles. Looking at the real data beat designing a tagging system.

## 8. A silent no-op in my own tooling

I patch files with Python `str.replace`, asserting the target exists first. In
one batch I forgot the assert:

    s = s.replace("var PALETTE = [...]", "...'sand']", 1)   # no assert

The file said `const PALETTE`, not `var`, so the replace matched nothing and
changed nothing — silently. It only surfaced later when I happened to read the
file for another reason, and only did not cause a bug because every list in
`CONFIG.LISTS` names its colour explicitly and never falls back to `PALETTE`.

**Lesson.** A search-and-replace that matches nothing is indistinguishable from
one that worked, unless you check. Assert on every single one; the one you skip
is the one that misses.

## 9. Working from memory instead of the documentation

The largest one. I built against the Google Tasks API from recall, because
`developers.google.com` is unreachable from this sandbox, and wrote
"verify this before committing to it" in a few places rather than stopping.

That is backwards. Unverifiable and unverified are different: the first is a
reason to stop and ask, the second is a decision to guess. Concretely I guessed
at `maxResults` defaults, at whether `Tasks.move` accepts a
`destinationTasklist`, and — most dangerous, because it fails at runtime rather
than in review — at the argument order of the Apps Script advanced service
(`Tasks.Tasks.patch(resource, tasklist, task)`).

**Lesson.** Never build against an API from memory. If the docs cannot be
reached, say so and ask for them before writing the code, not after.

## 10. What the documentation actually said

Lucy sent the reference pages. Scoring my guesses:

**Right:** `maxResults` defaults to 20 and caps at 100, so the pagination fix
was necessary and correctly bounded. `position` is opaque and reordering goes
through `tasks.move` with `previous`. `destinationTasklist` does exist, so
cross-list moves keep the task's identity and its Gmail link.

**Wrong, and it was costing data:** `tasks.list` has a *third* silent default I
did not know about — `showAssigned` is false, so tasks assigned from Docs or
Chat Spaces were never being returned at all. Exactly the same class of bug as
the 20-task truncation I had been pleased with myself for catching, sitting
right next to it in the same parameter list. I had read that list looking for
pagination and stopped once I found it.

**Wrong in a way that mattered less:** I described completed tasks as "hidden by
default". `showCompleted` actually defaults to *true*; it is `showHidden` that
defaults to false, and tasks completed in Google's own apps are hidden. Same
practical outcome, but I had the mechanism backwards.

**Unsupported claims I had made anyway:** that subtasks are one level deep (the
docs say 2,000 subtasks per task and say nothing about depth), and vague
hand-waving about quotas when the real ceilings are 20,000 non-hidden tasks per
list and 100,000 overall.

**A constraint I would never have guessed:** repeating tasks cannot be moved
between lists. My copy-and-delete fallback would have hit exactly this case and
silently destroyed the Gmail link on a recurring email-derived task. Reading the
docs let me delete the fallback entirely — there is now no lossy path at all,
just an honest error.

**Lesson.** Reading the reference for the one parameter you came for is not
reading the reference. The bug I missed was three lines below the one I found.

## 11. The last unverified thing, verified

Lucy sent *How method signatures are determined*. The rule is that an Apps
Script advanced-service call takes, in order: the request body, then path
parameters as individual arguments in the order they appear in the endpoint
URL, then a media Blob, then optional (query) parameters as one object, then
headers — **and any category the method has no items in is omitted entirely**.

Checked against all fourteen call sites in `Code.gs`, across seven distinct
signatures. Every one was already right:

| Call | Endpoint | Why it is right |
|---|---|---|
| `Tasks.list(listId, opts)` | `GET /lists/{tasklist}/tasks` | no body, one path param, query object |
| `Tasklists.list(opts)` | `GET /users/@me/lists` | no body, no path params at all |
| `Tasks.get(listId, taskId)` | `GET /lists/{tasklist}/tasks/{task}` | two path params in URL order |
| `Tasks.patch(body, listId, taskId)` | `PATCH /lists/{tasklist}/tasks/{task}` | body first, then both path params |
| `Tasks.insert(body, listId)` | `POST /lists/{tasklist}/tasks` | body first, then path |
| `Tasklists.insert(body)` | `POST /users/@me/lists` | body only |
| `Tasks.move(listId, taskId, opts)` | `POST …/{task}/move` | body **must be empty**, so omitted |

`move` is the one I would have got wrong by pattern-matching. It sits next to
`insert` and `patch`, which both lead with a body, but its request body must be
empty — so the body slot vanishes and the path parameters move to the front. It
looks inconsistent and is not.

**Lesson.** This is the happiest possible outcome and also the least
instructive: I was right, but I was right by convention rather than by
knowledge, and I could not tell the difference from the inside. The convention
happened to hold. Being unable to distinguish "I know this" from "this is what
usually happens" is the actual finding — and the only fix is to go and read,
which is what happened here.

Worth recording that reading paid for itself anyway: the same round of
documents turned up `showAssigned`, which was silently dropping tasks.

## 12. The last page found two more bugs

The `Task` resource page settled the open question — `due` is not marked output
only, so it is writable, and default-to-today works. It also turned up two
things I had not thought to ask about:

**Notes have an 8,192 character ceiling.** Comments and closing notes are
appended to a task's own notes, one line at a time, forever. A task with a long
thread would eventually hit the limit and the patch would fail — at the API,
with a raw error, at the moment someone pressed Comment. Both write paths now
check first and explain. I had designed an append-only log into a bounded field
and never looked up the bound.

**Assigned tasks cannot have notes at all.** Tasks assigned from Google Docs
have no notes field. I had *just* enabled `showAssigned`, so those tasks had
started arriving on the board for the first time — complete with a comment box
that would have failed on every one. Fixing one bug had quietly armed another.
The comment box is now hidden for them, a closing note is refused after the
tick rather than instead of it, and they carry a chip linking back to the
document or Chat space they came from.

Also corrected: `due` is documented as the day a task should be done and shows
on the calendar grid, and explicitly *not* a deadline. The brief now says
"Scheduled for" rather than "Was due".

**Lesson.** "Can I write this field?" was the question I went in with, and it
was the least valuable thing on the page. The ceilings and the read-only flags
— the constraints on a field rather than its existence — were where the actual
bugs were. Reading a resource definition for one answer and stopping is the
same mistake as reading `tasks.list` for pagination and missing `showAssigned`,
which is now the third time in this project.

## 13. Open question I could not settle

Nothing outstanding on the Tasks API. Everything this board depends on has now
been checked against the reference rather than recalled.

What remains unverified is operational, not documented: whether the OAuth
`auth/tasks` scope is classed sensitive for a Workspace-internal deployment,
and whether `Session.getActiveUser().getEmail()` really returns empty for
off-domain viewers. Both only bite at deployment, and both are visible the
first time someone outside the domain opens the board.
