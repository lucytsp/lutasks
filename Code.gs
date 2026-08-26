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

/**
 * Comments live in the task's own notes, one per line, in a shape that still
 * reads properly in the Google Tasks app on a phone:
 *
 *   » 26 Aug · Matt: blocked on the fee review change
 *
 * Keeping them in the task rather than in a side table means they survive a
 * lost script, and seniors can read them without this board.
 */
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
    // Tasks created from Gmail carry a link back to the message.
    links: (task.links || []).map(function (l) {
      return { type: l.type || 'link', description: l.description || '', link: l.link || '' };
    }).filter(function (l) { return l.link; }),
    completed: task.status === 'completed',
    due: task.due || null,
    updated: task.updated || null,
    completedAt: task.completed || null,
    parent: task.parent || null,
    position: task.position || ''
  };
}

/** Who is looking, and may they reorder and comment? */
function viewer_() {
  var email = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch (e) { email = ''; }
  var seniors = (CONFIG.SENIORS || []).map(function (s) { return s.toLowerCase(); });
  return {
    email: email,
    isSenior: !!email && seniors.indexOf(email.toLowerCase()) > -1
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
    // position is an opaque lexicographic string, and it is what the Google
    // Tasks app orders by — so sort on it rather than on fetch order.
    tasks.sort(function (a, b) {
      return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
    });
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
    if (!who.isSenior) return { success: false, error: 'Only seniors can comment.' };

    text = (text || '').trim().replace(/[\r\n]+/g, ' ');
    if (!text) return { success: false, error: 'Write something first.' };

    var task = Tasks.Tasks.get(listId, taskId);
    var stamp = Utilities.formatDate(new Date(), 'Europe/London', 'd MMM');
    var name = who.email.split('@')[0];
    var line = '» ' + stamp + ' · ' + name + ': ' + text;

    var notes = (task.notes || '');
    notes = notes ? notes + '\n' + line : line;

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
 * Cross-list moves go through Tasks.move with a destinationTasklist, which
 * keeps the task's identity and therefore its Gmail link. Should that not be
 * available, the fallback copies and deletes, and that DOES lose the link
 * back to the original email — so a linked task is refused rather than
 * quietly stripped, and the caller is told why.
 */
function sendToList(listId, taskId, targetTitle) {
  try {
    var who = viewer_();
    if (!who.isSenior) return { success: false, error: 'Only seniors can move tasks between lists.' };

    var lists = Tasks.Tasklists.list({ maxResults: 100 }).items || [];
    var target = lists.filter(function (l) { return l.title === targetTitle; })[0];
    if (!target) {
      target = Tasks.Tasklists.insert({ title: targetTitle });
    }
    if (target.id === listId) {
      return { success: true, noop: true };
    }

    var original = Tasks.Tasks.get(listId, taskId);

    try {
      var moved = Tasks.Tasks.move(listId, taskId, { destinationTasklist: target.id });
      return { success: true, task: toCard_(moved, target.id), listId: target.id };
    } catch (moveErr) {
      Logger.log('destinationTasklist unavailable, falling back: ' + moveErr);

      if ((original.links || []).length) {
        return {
          success: false,
          error: 'This task came from an email, and moving it the long way ' +
                 'round would lose the link back to that message. Left where it is.'
        };
      }

      var copy = Tasks.Tasks.insert({
        title: original.title,
        notes: original.notes || '',
        due: original.due || null,
        status: original.status || 'needsAction'
      }, target.id);
      Tasks.Tasks.remove(listId, taskId);
      return { success: true, task: toCard_(copy, target.id), listId: target.id, copied: true };
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
 * Reorder a task within its list. Seniors only.
 *
 * position cannot be patched — reordering goes through Tasks.move, which
 * places the task after `previous` (or first in the list when omitted).
 */
function moveTask(listId, taskId, direction) {
  try {
    var who = viewer_();
    if (!who.isSenior) return { success: false, error: 'Only seniors can reorder.' };

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
      const stamp = Utilities.formatDate(new Date(), 'Europe/London', 'd MMM');
      const kept = (task.notes || '').split('\n')
        .filter(function (l) { return !CLOSED_LINE.test(l); });
      kept.push('✓ ' + stamp + ': ' + note);
      patch.notes = kept.join('\n').replace(/^\n+/, '');
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
