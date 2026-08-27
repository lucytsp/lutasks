/**
 * Task Wall — configuration template.
 *
 * Copy this to Config.gs and fill in your own values:
 *
 *     cp Config.example.gs Config.gs
 *
 * Config.gs is gitignored, so your colleagues' names and email addresses stay
 * on your machine and in your Apps Script project, and never reach GitHub.
 * This file is the one that is shared, so keep it generic.
 *
 * Apps Script shares one global scope across files, and CONFIG is only read
 * inside functions at request time, so the order the files load in does not
 * matter. Only ONE of these two files is ever pushed to Apps Script —
 * .claspignore allows Config.gs and excludes this template — because two
 * files both declaring `const CONFIG` would be a redeclaration error.
 */

const CONFIG = {
  // Pins the order and colour of the lists you care about. This is NOT a
  // whitelist — every list on the account appears, and anything not named here
  // is appended alphabetically with a colour derived from its title, so it
  // stays the same colour each time. Titles must match Google Tasks exactly,
  // including case; one that does not match is simply not pinned.
  // The colour key must be one of the nine in PALETTE below.
  LISTS: [
    { title: 'UNSORTED',  colour: 'sand'   },
    { title: 'BUGS',      colour: 'rose'   },
    { title: 'TODO',      colour: 'indigo' },
    { title: 'TODAY',     colour: 'green'  },
    { title: 'PROPOSALS', colour: 'amber'  },
    { title: 'SYSADMIN',  colour: 'teal'   },
    { title: 'SHELVED',   colour: 'slate'  }
  ],

  // Lists never shown, whatever else you have. Everything not listed here
  // appears automatically, so a list you make in Google Tasks turns up on the
  // board without you editing this file.
  HIDE_LISTS: [],

  // Where the add form writes by default. Created if it does not exist.
  INTAKE_LIST: 'UNSORTED',

  // Today's shortlist. "Send to Today" moves a task here and back out again.
  TODAY_LIST: 'TODAY',

  // Colleagues who may reorder tasks and leave comments. Everyone else gets a
  // read-and-add board. Match on full email address, lower case.
  SENIORS: [
    'you@example.com'
  ],

  // Names recognised in a trailing "(...)" and shown as a coloured chip.
  // "Fix the timesheet totals (sam)" becomes a task with Sam's initials on it.
  // Anything unrecognised renders as a plain note instead, so "(on hold)"
  // does not invent a colleague. Lower case; one word or two.
  PEOPLE: [
    'alex', 'sam', 'jordan', 'priya', 'chris', 'robin'
  ],

  // Appended to every "Ask Claude" brief so a conversation starts with the
  // standing context instead of you retyping it. Keep it to a sentence or two.
  CLAUDE_CONTEXT:
    'These tasks are bugs and improvements for our internal system, ' +
    'reported by colleagues.'
};

// Card tints. 'sand' is the unfiled one — it reads as not-yet-triaged.
const PALETTE = ['rose', 'indigo', 'slate', 'teal', 'amber',
                 'green', 'violet', 'cyan', 'sand'];
