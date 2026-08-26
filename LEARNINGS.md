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

## 10. Open question I could not settle

`Tasks.move` with a `destinationTasklist` should move a task between lists
while keeping its identity, and therefore its Gmail link. I could not reach
Google's docs from this sandbox to confirm it exists in the Apps Script
advanced service.

Rather than guess, `sendToList` tries it and falls back to copy-and-delete —
and *refuses* rather than falls back when the task has an email link, because
the fallback would silently destroy that link. An honest refusal beats quiet
data loss.

**Lesson.** When you cannot verify a capability, make the failure mode explicit
and lossless, and say which part is unverified.
