/**
 * Task Wall — configuration.
 *
 * Everything you are likely to change lives here, away from the plumbing.
 * Apps Script shares one global scope across files, and CONFIG is only read
 * inside functions at request time, so the order the files load in does not
 * matter.
 */

const CONFIG = {
  // Lists shown on the board, in order. Leave empty to show every list.
  // The colour key must be one of the nine in PALETTE below.
  LISTS: [
    { title: 'UNSORTED',          colour: 'sand'   },
    { title: 'JOBSMAN BUGS',      colour: 'rose'   },
    { title: 'JOBSMAN TODO',      colour: 'indigo' },
    { title: 'TODAY',             colour: 'green'  },
    { title: 'Proposals TODO',    colour: 'amber'  },
    { title: 'sysadmin todo',     colour: 'teal'   },
    { title: 'DB / appsheet todo', colour: 'violet' },
    { title: 'clawd',             colour: 'cyan'   },
    { title: 'SHELVED',           colour: 'slate'  }
  ],

  // List that the "Report a bug" form writes into. Created if missing.
  INTAKE_LIST: 'UNSORTED',

  // Today's shortlist. "Send to Today" moves a task here and back out again.
  TODAY_LIST: 'TODAY',

  // Colleagues who may reorder tasks and leave comments. Everyone else gets
  // a read-and-add board. Match on full email address.
  SENIORS: [
    'lucy@tspartners.co.uk'
  ],

  // Sent at the end of every "Ask Claude" brief so a conversation starts with
  // the standing context instead of you retyping it. Keep it short.
  CLAUDE_CONTEXT:
    'Jobsman is the practice management system we use at TS Partners, a UK ' +
    'accountancy firm. Tasks on this board are bugs and improvements for it, ' +
    'reported by colleagues.',

  // Names recognised in a trailing "(...)" and shown as an assignee chip.
  // Anything unrecognised renders as a plain note chip instead.
  PEOPLE: [
    'emma', 'muneeb', 'chris', 'peter', 'lyndsey', 'matt', 'naveed',
    'rubab', 'shehzad', 'tami', 'briony', 'walled', 'joe welch', 'lucy'
  ]
};

// Card tints. 'sand' is the unfiled one — it reads as not-yet-triaged.
const PALETTE = ['rose', 'indigo', 'slate', 'teal', 'amber',
                 'green', 'violet', 'cyan', 'sand'];
