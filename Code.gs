/**
 * Lutasks - a colour-coded board for Google Tasks.
 * Apps Script backend. Serves index.html and proxies the Tasks API.
 */

const CONFIG = {
  // Lists shown on the board, in order. Leave empty to show every list.
  // The colour key must be one of the eight in PALETTE below.
  LISTS: [
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
  INTAKE_LIST: 'JOBSMAN BUGS',

  // Names recognised in a trailing "(...)" and shown as an assignee chip.
  // Anything unrecognised renders as a plain note chip instead.
  PEOPLE: [
    'emma', 'muneeb', 'chris', 'peter', 'lyndsey', 'matt', 'naveed',
    'rubab', 'shehzad', 'tami', 'briony', 'walled', 'joe welch', 'lucy'
  ]
};

const PALETTE = ['rose', 'indigo', 'slate', 'teal', 'amber', 'green', 'violet', 'cyan'];

/** Serve the page. */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Task Wall')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Every task in a list, following pageToken to the end.
 *
 * The Tasks API returns 20 items per page by default and caps maxResults at
 * 100. Without this loop any list over 20 tasks is silently truncated.
 */
function listAllTasks_(listId) {
  const out = [];
  let pageToken = null;

  do {
    const page = Tasks.Tasks.list(listId, {
      maxResults: 100,
      showCompleted: true,
      showHidden: true,
      pageToken: pageToken
    });
    if (page.items) out.push.apply(out, page.items);
    pageToken = page.nextPageToken;
  } while (pageToken);

  return out;
}

/** Strip Google's task shape down to what the board needs. */
function toCard_(task, listId) {
  return {
    id: task.id,
    listId: listId,
    title: task.title || '(untitled)',
    notes: task.notes || '',
    completed: task.status === 'completed',
    due: task.due || null,
    updated: task.updated || null,
    completedAt: task.completed || null,
    parent: task.parent || null,
    position: task.position || ''
  };
}

/**
 * The whole board in one round trip: every configured list, every task.
 */
function getBoard() {
  const available = Tasks.Tasklists.list({ maxResults: 100 }).items || [];
  const byTitle = {};
  available.forEach(function (l) { byTitle[l.title] = l.id; });

  // Configured lists first, in order; otherwise everything we found.
  let wanted = CONFIG.LISTS.filter(function (c) { return byTitle[c.title]; });
  if (!wanted.length) {
    wanted = available.map(function (l, i) {
      return { title: l.title, colour: PALETTE[i % PALETTE.length] };
    });
  }

  const lists = wanted.map(function (cfg, i) {
    const id = byTitle[cfg.title];
    const tasks = listAllTasks_(id).map(function (t) { return toCard_(t, id); });
    return {
      id: id,
      title: cfg.title,
      colour: cfg.colour || PALETTE[i % PALETTE.length],
      tasks: tasks
    };
  });

  return {
    lists: lists,
    people: CONFIG.PEOPLE,
    fetchedAt: new Date().toISOString()
  };
}

/**
 * Add a task to the chosen list. Falls back to the intake list — creating it
 * if need be — when the caller names a list that no longer exists.
 */
function addTask(listId, title, notes) {
  try {
    title = (title || '').trim();
    if (!title) return { success: false, error: 'A title is required.' };

    const lists = Tasks.Tasklists.list({ maxResults: 100 }).items || [];
    const valid = lists.some(function (l) { return l.id === listId; });

    if (!valid) {
      const found = lists.filter(function (l) { return l.title === CONFIG.INTAKE_LIST; })[0];
      listId = found ? found.id
        : Tasks.Tasklists.insert({ title: CONFIG.INTAKE_LIST }).id;
    }

    // getEmail() returns '' for signed-out or off-domain viewers, so only
    // record the reporter when we actually know who they are.
    const reporter = Session.getActiveUser().getEmail();
    const stamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE || 'Europe/London', 'd MMM yyyy');

    let body = '';
    if ((notes || '').trim()) body += notes.trim() + '\n\n';
    body += reporter ? ('Reported by ' + reporter + ' on ' + stamp) : ('Reported ' + stamp);

    const created = Tasks.Tasks.insert(
      { title: title, notes: body, status: 'needsAction' },
      listId
    );
    return { success: true, task: toCard_(created, listId) };

  } catch (e) {
    Logger.log('addTask failed: ' + e);
    return { success: false, error: String(e.message || e) };
  }
}

/** Tick or untick a task. */
function setTaskStatus(listId, taskId, completed) {
  try {
    const patch = completed
      ? { status: 'completed' }
      : { status: 'needsAction', completed: null };
    const updated = Tasks.Tasks.patch(patch, listId, taskId);
    return { success: true, task: toCard_(updated, listId) };
  } catch (e) {
    Logger.log('setTaskStatus failed: ' + e);
    return { success: false, error: String(e.message || e) };
  }
}
