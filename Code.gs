/**
 * Task Wall — Apps Script backend.
 *
 * Serves index.html and proxies the Google Tasks API. Settings live in
 * Config.gs; this file is the plumbing.
 */

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
 * Three defaults in tasks.list drop data unless you override them, and all
 * three fail silently rather than erroring:
 *   maxResults    defaults to 20 (max 100) — anything past page one vanishes
 *   showHidden    defaults to false — and completed tasks from the Google
 *                 apps are hidden, so showCompleted alone is not enough
 *   showAssigned  defaults to false — tasks assigned from Docs or Chat
 *                 Spaces never appear at all
 *
 * Limits, for reference: 20,000 non-hidden tasks per list, 100,000 overall.
 */
function listAllTasks_(listId) {
  const out = [];
  let pageToken = null;

  do {
    const page = Tasks.Tasks.list(listId, {
      maxResults: 100,
      showCompleted: true,
      showHidden: true,
      showAssigned: true,
      pageToken: pageToken
    });
    if (page.items) out.push.apply(out, page.items);
    pageToken = page.nextPageToken;
  } while (pageToken);

  return out;
}

/**
 * Comments live in the task's own notes, one per line, in a shape that still
 * reads properly in the Google Tasks app on a phone:
 *
 *   » 26 Aug · Matt: blocked on the fee review change
 *
 * Keeping them in the task rather than in a side table means they survive a
 * lost script, and seniors can read them without this board.
 */
// Documented maxima on the Task resource. notes matters most here: comments
// and closing notes are appended to it, so a long-running task can grow into
// the ceiling and the patch would fail.
var NOTES_MAX = 8192;
var TITLE_MAX = 1024;

var COMMENT_LINE = /^\s*»\s*(.+?)\s*·\s*(.+?):\s*([\s\S]*)$/;

/* Why a task was closed, written the same way, on its own line:
 *   ✓ 26 Aug: did not fix — superseded by the new timesheet screen        */
var CLOSED_LINE = /^\s*✓\s*(.+?):\s*([\s\S]*)$/;

function splitNotes_(notes) {
  var body = [], comments = [], closeNote = null;
  (notes || '').split('\n').forEach(function (line) {
    var c = line.match(COMMENT_LINE);
    if (c) { comments.push({ when: c[1], who: c[2], text: c[3] }); return; }
    var d = line.match(CLOSED_LINE);
    if (d) { closeNote = { when: d[1], text: d[2] }; return; }
    body.push(line);
  });
  return { body: body.join('\n').trim(), comments: comments, closeNote: closeNote };
}

/** Strip Google's task shape down to what the board needs. */
function toCard_(task, listId) {
  var split = splitNotes_(task.notes);
  return {
    id: task.id,
    listId: listId,
    title: task.title || '(untitled)',
    notes: split.body,
    comments: split.comments,
    closeNote: split.closeNote,
    // links[] is output-only: a task created from Gmail carries a link back to
    // the message, and there is no way to write one. That is why a task is
    // never copied between lists — a copy could not carry its link.
    links: (task.links || []).map(function (l) {
      return { type: l.type || 'generic', description: l.description || '', link: l.link || '' };
    }).filter(function (l) { return l.link; }),
    // Assigned tasks (from Docs or Chat) arrive now that showAssigned is set.
    // They cannot be edited the usual way, so the board needs to know.
    assignment: task.assignmentInfo ? {
      link: task.assignmentInfo.linkToTask || '',
      surface: task.assignmentInfo.surfaceType || ''
    } : null,
    completed: task.status === 'completed',
    due: task.due || null,
    updated: task.updated || null,
    completedAt: task.completed || null,
    parent: task.parent || null,
    position: task.position || ''
  };
}

/**
 * Who is looking, and may they change things?
 *
 * getActiveUser() is who is viewing and returns an EMPTY STRING for anyone
 * outside the deploying account's domain — and sometimes inside it. Gating
 * writes on it alone means the buttons are there and silently refuse, which
 * is exactly what happened.
 *
 * getEffectiveUser() is whose authority the script runs under. With
 * executeAs: USER_DEPLOYING that is always the owner, and it is reliable.
 *
 * EDIT_ACCESS decides who may reorder, move and comment:
 *   'everyone' (default) — anyone who can open the board. The web app is
 *                          already domain-restricted, so they can read every
 *                          task anyway; withholding reordering from them is
 *                          not a security boundary, only an obstacle.
 *   'seniors'            — the owner, plus CONFIG.SENIORS.
 */
function viewer_() {
  var email = '', owner = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch (e) { email = ''; }
  try { owner = Session.getEffectiveUser().getEmail() || ''; } catch (e) { owner = ''; }

  var seniors = (CONFIG.SENIORS || []).map(function (s) { return s.toLowerCase(); });
  var isOwner = !!email && !!owner && email.toLowerCase() === owner.toLowerCase();
  var isSenior = isOwner || (!!email && seniors.indexOf(email.toLowerCase()) > -1);
  var restricted = (CONFIG.EDIT_ACCESS || 'everyone') === 'seniors';

  return {
    email: email,
    owner: owner,
    isOwner: isOwner,
    isSenior: isSenior,
    canEdit: restricted ? isSenior : true,
    // Why not, in words, so the board can say so instead of failing quietly.
    why: restricted && !isSenior
      ? (email
          ? email + ' is not listed in CONFIG.SENIORS.'
          : 'Google did not say who you are — getActiveUser() returned nothing, ' +
            'which happens outside the owner\'s domain.')
      : ''
  };
}

/**
 * The whole board in one round trip: every configured list, every task.
 */
/** A stable colour for a list we were not told about. */
function colourFor_(title) {
  var h = 0;
  for (var i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/**
 * Every list the account has, in a sensible order.
 *
 * CONFIG.LISTS pins order and colour for the lists you care about; anything
 * else you create in Google Tasks still shows up, coloured from a hash of its
 * title so it keeps the same colour every time. Only CONFIG.HIDE_LISTS is
 * excluded. Making CONFIG.LISTS a whitelist meant a new list silently never
 * appeared, which is a bad way to find out you had made one.
 */
function orderedLists_(available) {
  const hidden = {};
  (CONFIG.HIDE_LISTS || []).forEach(function (t) { hidden[t.toLowerCase()] = true; });

  const byTitle = {};
  available.forEach(function (l) { byTitle[l.title] = l; });

  const out = [], seen = {};

  (CONFIG.LISTS || []).forEach(function (cfg) {
    const found = byTitle[cfg.title];
    if (!found || hidden[cfg.title.toLowerCase()]) return;
    out.push({ id: found.id, title: found.title, colour: cfg.colour || colourFor_(found.title) });
    seen[found.id] = true;
  });

  available
    .filter(function (l) { return !seen[l.id] && !hidden[l.title.toLowerCase()]; })
    .sort(function (a, b) { return a.title.localeCompare(b.title); })
    .forEach(function (l) {
      out.push({ id: l.id, title: l.title, colour: colourFor_(l.title) });
    });

  return out;
}

function getBoard() {
  const available = Tasks.Tasklists.list({ maxResults: 100 }).items || [];

  const lists = orderedLists_(available).map(function (cfg) {
    const id = cfg.id;
    const tasks = listAllTasks_(id).map(function (t) { return toCard_(t, id); });
    // position is an opaque lexicographic string, and it is what the Google
    // Tasks app orders by — so sort on it rather than on fetch order.
    tasks.sort(function (a, b) {
      return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
    });
    return { id: id, title: cfg.title, colour: cfg.colour, tasks: tasks };
  });

  return {
    lists: lists,
    people: CONFIG.PEOPLE,
    context: CONFIG.CLAUDE_CONTEXT || '',
    viewer: viewer_(),
    fetchedAt: new Date().toISOString()
  };
}

/**
 * Append a comment to a task. Seniors only.
 */
function addComment(listId, taskId, text) {
  try {
    var who = viewer_();
    if (!who.canEdit) return { success: false, error: 'You cannot comment here. ' + who.why };

    text = (text || '').trim().replace(/[\r\n]+/g, ' ');
    if (!text) return { success: false, error: 'Write something first.' };

    var task = Tasks.Tasks.get(listId, taskId);

    // Tasks assigned from Google Docs cannot have notes at all.
    if (task.assignmentInfo) {
      return {
        success: false,
        error: 'This task was assigned from ' +
               (task.assignmentInfo.surfaceType === 'SPACE' ? 'a Chat space' : 'a document') +
               ', and assigned tasks cannot carry notes. Comment where it came from instead.'
      };
    }

    var stamp = Utilities.formatDate(new Date(), 'Europe/London', 'd MMM');
    var name = who.email.split('@')[0];
    var line = '» ' + stamp + ' · ' + name + ': ' + text;

    var notes = (task.notes || '');
    notes = notes ? notes + '\n' + line : line;

    if (notes.length > NOTES_MAX) {
      return {
        success: false,
        error: 'The notes on this task are full (' + NOTES_MAX + ' characters). ' +
               'Tidy up the older comments before adding another.'
      };
    }

    var updated = Tasks.Tasks.patch({ notes: notes }, listId, taskId);
    return { success: true, task: toCard_(updated, listId) };
  } catch (e) {
    Logger.log('addComment failed: ' + e);
    return { success: false, error: String(e.message || e) };
  }
}

/**
 * Move a task into TODAY — or back to where it came from.
 *
 * tasks.move takes a destinationTasklist, so the task keeps its identity and
 * therefore its link back to the original Gmail message. There is no
 * copy-and-delete path here on purpose: copying would silently drop that
 * link, and an honest error is worth more than a lossy success.
 *
 * The one documented exception is that recurring tasks cannot be moved
 * between lists, so that failure is reported in plain words.
 */
function sendToList(listId, taskId, targetTitle) {
  try {
    var who = viewer_();
    if (!who.canEdit) return { success: false, error: 'You cannot move tasks here. ' + who.why };

    var lists = Tasks.Tasklists.list({ maxResults: 100 }).items || [];
    var target = lists.filter(function (l) { return l.title === targetTitle; })[0];
    if (!target) {
      target = Tasks.Tasklists.insert({ title: targetTitle });
    }
    if (target.id === listId) {
      return { success: true, noop: true };
    }

    try {
      var moved = Tasks.Tasks.move(listId, taskId, { destinationTasklist: target.id });
      return { success: true, task: toCard_(moved, target.id), listId: target.id };
    } catch (moveErr) {
      Logger.log('move to ' + targetTitle + ' failed: ' + moveErr);
      return {
        success: false,
        error: 'Could not move this one. Repeating tasks cannot be moved ' +
               'between lists — tick it here and add it to ' + targetTitle + ' instead.'
      };
    }
  } catch (e) {
    Logger.log('sendToList failed: ' + e);
    return { success: false, error: String(e.message || e) };
  }
}

/** Shorthand for the common case. */
function sendToToday(listId, taskId) {
  return sendToList(listId, taskId, CONFIG.TODAY_LIST);
}

/**
 * Put a task at a specific position, optionally in a different list.
 * Seniors only.
 *
 * One call does both: tasks.move takes destinationTasklist and previous
 * together. Omitting previous means "first in the list". The task keeps its
 * identity either way, so a task that came from Gmail keeps its link.
 */
function placeTask(listId, taskId, targetListId, previousId) {
  try {
    var who = viewer_();
    if (!who.canEdit) return { success: false, error: 'You cannot reorder here. ' + who.why };

    var args = {};
    var destination = listId;
    if (targetListId && targetListId !== listId) {
      args.destinationTasklist = targetListId;
      destination = targetListId;
    }
    if (previousId) args.previous = previousId;

    try {
      var moved = Tasks.Tasks.move(listId, taskId, args);
      return { success: true, task: toCard_(moved, destination), listId: destination };
    } catch (moveErr) {
      Logger.log('placeTask failed: ' + moveErr);
      return {
        success: false,
        error: args.destinationTasklist
          ? 'Could not move this one. Repeating tasks cannot be moved between lists.'
          : 'Could not reorder this one: ' + String(moveErr.message || moveErr)
      };
    }
  } catch (e) {
    Logger.log('placeTask failed: ' + e);
    return { success: false, error: String(e.message || e) };
  }
}

/**
 * Reorder a task within its list. Seniors only.
 *
 * position cannot be patched — reordering goes through Tasks.move, which
 * places the task after `previous` (or first in the list when omitted).
 */
function moveTask(listId, taskId, direction) {
  try {
    var who = viewer_();
    if (!who.canEdit) return { success: false, error: 'You cannot reorder here. ' + who.why };

    // Only top-level, uncompleted tasks are reordered here: a completed and
    // hidden task can only move to position 0 (previous must be empty), and
    // nesting has its own rules that this board does not expose.
    var siblings = listAllTasks_(listId)
      .filter(function (t) { return t.status !== 'completed' && !t.parent; })
      .sort(function (a, b) {
        return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
      });

    var i = -1;
    for (var n = 0; n < siblings.length; n++) {
      if (siblings[n].id === taskId) { i = n; break; }
    }
    if (i === -1) return { success: false, error: 'That task is no longer in this list.' };

    var previous = null;
    if (direction === 'top') {
      if (i === 0) return { success: true, task: toCard_(siblings[i], listId) };
    } else if (direction === 'up') {
      if (i === 0) return { success: true, task: toCard_(siblings[i], listId) };
      previous = i >= 2 ? siblings[i - 2].id : null;
    } else if (direction === 'down') {
      if (i >= siblings.length - 1) return { success: true, task: toCard_(siblings[i], listId) };
      previous = siblings[i + 1].id;
    } else {
      return { success: false, error: 'Unknown direction.' };
    }

    var args = previous ? { previous: previous } : {};
    var moved = Tasks.Tasks.move(listId, taskId, args);
    return { success: true, task: toCard_(moved, listId) };
  } catch (e) {
    Logger.log('moveTask failed: ' + e);
    return { success: false, error: String(e.message || e) };
  }
}

/**
 * Add a task to the chosen list. Falls back to the intake list — creating it
 * if need be — when the caller names a list that no longer exists.
 */
function addTask(listId, title, notes, due) {
  try {
    title = (title || '').trim();
    if (!title) return { success: false, error: 'A title is required.' };
    if (title.length > TITLE_MAX) {
      return { success: false, error: 'That title is too long — the limit is ' +
                                      TITLE_MAX + ' characters.' };
    }

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

    // Every task gets a due date, defaulting to today. A task with no due date
    // is effectively invisible in the Google apps — you cannot even tell when
    // it was added. The API keeps the date and discards any time of day.
    const created = Tasks.Tasks.insert(
      { title: title, notes: body, status: 'needsAction', due: dueStamp_(due) },
      listId
    );
    return { success: true, task: toCard_(created, listId) };

  } catch (e) {
    Logger.log('addTask failed: ' + e);
    return { success: false, error: String(e.message || e) };
  }
}

/**
 * An RFC 3339 timestamp for a yyyy-mm-dd date, or for today when none is
 * given. The Tasks API keeps the date and drops the time, so midnight UTC is
 * the conventional thing to send.
 */
function dueStamp_(date) {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(date || '')
    ? date
    : Utilities.formatDate(new Date(), CONFIG.TIMEZONE || 'Europe/London', 'yyyy-MM-dd');
  return iso + 'T00:00:00.000Z';
}

/**
 * Tick or untick a task, optionally recording why it was closed.
 *
 * Reopening strips any previous closing note, so "did not fix" does not
 * linger on a task that is back in play.
 */
function setTaskStatus(listId, taskId, completed, note) {
  try {
    const patch = completed
      ? { status: 'completed' }
      : { status: 'needsAction', completed: null };

    note = (note || '').trim().replace(/[\r\n]+/g, ' ');

    if (completed && note) {
      const task = Tasks.Tasks.get(listId, taskId);
      if (task.assignmentInfo) {
        // Still tick it — just without the note, which cannot be stored.
        Tasks.Tasks.patch({ status: 'completed' }, listId, taskId);
        return {
          success: false,
          error: 'Marked done, but assigned tasks cannot carry notes, so the ' +
                 'reason was not saved.'
        };
      }
      const stamp = Utilities.formatDate(new Date(), 'Europe/London', 'd MMM');
      const kept = (task.notes || '').split('\n')
        .filter(function (l) { return !CLOSED_LINE.test(l); });
      kept.push('✓ ' + stamp + ': ' + note);
      const merged = kept.join('\n').replace(/^\n+/, '');
      if (merged.length > NOTES_MAX) {
        Tasks.Tasks.patch({ status: 'completed' }, listId, taskId);
        return {
          success: false,
          error: 'Marked done, but the notes on this task are full, so the ' +
                 'reason was not saved.'
        };
      }
      patch.notes = merged;
    } else if (!completed) {
      const existing = Tasks.Tasks.get(listId, taskId);
      if (CLOSED_LINE.test(existing.notes || '')) {
        patch.notes = (existing.notes || '').split('\n')
          .filter(function (l) { return !CLOSED_LINE.test(l); })
          .join('\n').trim();
      }
    }

    const updated = Tasks.Tasks.patch(patch, listId, taskId);
    return { success: true, task: toCard_(updated, listId) };
  } catch (e) {
    Logger.log('setTaskStatus failed: ' + e);
    return { success: false, error: String(e.message || e) };
  }
}
