# <project> — working notes

<One line: what this script does and what it is attached to.>

**Kind:** container-bound to a <Sheet/Doc> · standalone web app · library · add-on
*(delete the wrong ones — it changes everything below)*

---

## The copies, and what moves between them

Nothing in this chain syncs itself. A person moves the code at each step.

    Claude's container  →  GitHub  →  your machine  →  Apps Script project
                git push     git pull       clasp push

Only GitHub and your machine persist. A Claude session's container is wiped
when the session ends, so **commit and push after every working change**, not
at the end.

The Apps Script project is a copy git knows nothing about. If anyone edits in
the browser editor, `clasp pull` before the next push or that edit is silently
overwritten.

---

## Files

    Config.example.gs   generic template — committed
    Config.gs           real names, emails, ids — GITIGNORED
    Code.gs             <what it does>
    appsscript.json     manifest: advanced services, scopes, access level
    .claspignore        which files reach Apps Script

---

## Config split — two rules that break the whole script when broken

**1. Never commit `Config.gs`.** Names, addresses, sheet ids, internal titles.
`Config.example.gs` is the shared, generic one. Fresh clone:
`cp Config.example.gs Config.gs`.

**2. `.claspignore` must exclude `Config.example.gs`.** Both declare
`const CONFIG`. Push both and Apps Script throws a redeclaration error and the
*entire project* fails to load. Load-bearing, not tidiness.

    **/**
    !Code.gs
    !Config.gs
    !appsscript.json

---

## Deploying

**Container-bound, or run from the editor and triggers:** there are no
deployments. `clasp push` is the whole story. Ignore `deploy.sh`.

**Web app or API executable:** always redeploy over the *existing* deployment
id — `clasp deploy -i <id>`. A bare `clasp deploy` creates a new deployment
with a new URL every time, so anyone holding the old link stays frozen on an
old version while you believe you shipped. Keep the id in `.clasp-deployment`
(gitignored) and let `deploy.sh` pass it.

    ./deploy.sh                    push only
    ./deploy.sh "what changed"     push, then publish

---

## Before claiming anything works

- **Read the reference, not your memory.** Ask for the docs page if it cannot
  be fetched. Every API belief worth checking has a caveat attached.
- **Read the whole page, not the paragraph you came for.** The bug is usually
  three lines below the answer you were looking for. Constraints on a field
  matter more than whether it exists.
- **Assert on pixels for visual bugs.** Computed style tells you what you
  asked the browser to do, not what it did. Screenshot it and look.
- **Never hardcode counts in tests.** Derive from state, or locate by text.
  A hardcoded `=== 4` breaks on the next feature and reports a regression
  that is not one.
- **Re-check environment capabilities, never cache them.** Anything the host
  injects asynchronously will be absent at parse time and present later.
- **A silent fallback is a bug.** If the code can degrade, it must say so on
  screen, and distinguish "expected here" from "should not happen here".
- **Ask for the cheap discriminating fact before forming a theory.** Once you
  have a theory you will collect evidence that fits it.
- **Fixtures are code and have bugs.** Suspect the fixture before the feature.

---

## Apps Script specifics worth remembering

- Advanced-service signature order: **request body, then path parameters in
  endpoint-URL order, then an optional-parameters object** — and any category
  the method lacks is omitted entirely. A method with no request body starts
  with its path parameters.
- `delete` in a Google API is `remove` in Apps Script (`delete` is reserved).
- Enable advanced services through the editor's **Services +**, not only the
  manifest — that path also enables the underlying Cloud API.
- `Session.getActiveUser().getEmail()` returns an empty string for viewers
  outside the deploying account's domain. Never assume you know who is looking.
- With `executeAs: USER_DEPLOYING` the script sees the *deployer's* data for
  every viewer. That is what makes a shared tool shared — and why it cannot
  also be a personal one.
- A web app runs in a sandboxed frame, so `window.location` cannot read the
  parent's query string. Use `google.script.url.getLocation`.
- Quotas are per-account and modest. Batch reads, avoid per-render calls.

---

## Style

British English. Comments explain *why*, never *what*. Match the surrounding
density.
