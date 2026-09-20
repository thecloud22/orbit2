/**
 * The pages, written the way the web was written before any of this was easy.
 *
 * Tables for layout, `<font>` for emphasis, inline styles, forms that POST and
 * reload the whole document. **Nothing here carries a `data-testid`**, and that
 * is the entire point: every other portal in this repository is a target Orbit
 * was given an easy way to bind, and every reliability gap found so far came
 * from a page that offered none.
 *
 * Each page is one shape the recorder has to survive, and each is paired with a
 * test that says which strategy should reach it — or that nothing should, which
 * is just as much a property worth pinning.
 *
 * Page scripts live inside these strings rather than in a `.js` file beside
 * them. Two reasons, both real: a loose script under an app directory would be
 * linted as repository source with no browser globals declared, and keeping
 * every line of in-page script inside an HTML string keeps the recorder's "one
 * file injects script" boundary visibly true.
 */

const STYLE = `<style>
  body { font-family: Verdana, Geneva, sans-serif; font-size: 12px; background: #f4f4f0; margin: 0; }
  table.frame { width: 100%; border-collapse: collapse; }
  td.head { background: #1f3a5f; color: #fff; padding: 8px 12px; font-weight: bold; }
  td.body { padding: 12px; vertical-align: top; }
  table.form td { padding: 3px 6px; }
  .bar a { color: #1f3a5f; margin-right: 14px; }
  hr { border: 0; border-top: 1px solid #bbb; }
</style>`;

/** The chrome every page shares, so a page is a body and nothing else. */
function page(title: string, body: string): string {
  return `<!doctype html>
<html>
<head><title>${title}</title>${STYLE}</head>
<body>
<table class="frame">
  <tr><td class="head">NORTHWIND SERVICE DESK &nbsp;&nbsp; <font size="1">release 4.2c</font></td></tr>
  <tr><td class="body">${body}</td></tr>
</table>
</body>
</html>`;
}

/**
 * Sign in, named only by `autocomplete`.
 *
 * No label, no id, no `name` worth reading — the shape a real login takes when
 * the page was built for a password manager to fill rather than a person to
 * read. A POST here redirects, so the recorder has to survive a real navigation
 * to record anything at all.
 */
export function loginPage(): string {
  return page(
    'Sign on',
    `<b>Sign on</b>
    <hr>
    <form method="post" action="/login">
      <table class="form">
        <tr><td>User</td><td><input type="text" autocomplete="username" size="24"></td></tr>
        <tr><td>Password</td><td><input type="password" autocomplete="current-password" size="24"></td></tr>
        <tr><td></td><td><input type="submit" value="Sign on"></td></tr>
      </table>
    </form>`,
  );
}

/**
 * The same sign-on, with only `name` to go on.
 *
 * Older still: the page predates `autocomplete` entirely, so the only thing on
 * either field is the attribute the form needs to submit.
 */
export function loginBarePage(): string {
  return page(
    'Sign on (classic)',
    `<b>Sign on</b>
    <hr>
    <form method="post" action="/login-bare">
      <table class="form">
        <tr><td>User</td><td><input type="text" name="userid" size="24"></td></tr>
        <tr><td>Password</td><td><input type="password" name="passwd" size="24"></td></tr>
        <tr><td></td><td><input type="submit" value="Sign on"></td></tr>
      </table>
    </form>`,
  );
}

export function homePage(user: string): string {
  return page(
    'Main menu',
    `<b>Main menu</b>
    <hr>
    <p>Signed on as <font color="#1f3a5f"><b>${user}</b></font>.</p>
    <p class="bar">
      <a href="/customer/new">New customer</a>
      <a href="/search">Find a request</a>
      <a href="/inbox">Work queues</a>
    </p>`,
  );
}

/**
 * A form whose every field carries nothing but `name`.
 *
 * `delay` is written into the form's own action so a submit can be made slow
 * without making anything else slow. It exists to prove that holding an
 * interaction until it has been derived survives a page that takes
 * seconds to come back — the shape that loses a typed value on a real site.
 */
export function customerNewPage(delayMs: number): string {
  const action = delayMs > 0 ? `/customer/new?delay=${String(delayMs)}` : '/customer/new';

  return page(
    'New customer',
    `<b>New customer</b>
    <hr>
    <form method="post" action="${action}">
      <table class="form">
        <tr><td>First name</td><td><input type="text" name="first_name" size="20"></td></tr>
        <tr><td>Last name</td><td><input type="text" name="last_name" size="20"></td></tr>
        <tr><td>Region</td><td>
          <select name="region">
            <option value="">-- select --</option>
            <option value="north">North</option>
            <option value="south">South</option>
          </select>
        </td></tr>
        <tr><td></td><td><input type="submit" value="Save customer"></td></tr>
      </table>
    </form>`,
  );
}

export function customerSavedPage(first: string, last: string, region: string): string {
  return page(
    'Customer saved',
    `<b>Customer saved</b>
    <hr>
    <table class="form">
      <tr><td>First name</td><td><font color="#1f3a5f">${first}</font></td></tr>
      <tr><td>Last name</td><td><font color="#1f3a5f">${last}</font></td></tr>
      <tr><td>Region</td><td><font color="#1f3a5f">${region}</font></td></tr>
    </table>
    <p class="bar"><a href="/customer/new">Add another</a></p>`,
  );
}

/**
 * Markup that is simply wrong, and has to be refused rather than guessed at.
 *
 * Two fields share a `name`. A form like this submits something — the browser
 * sends both — but nothing here can say which one a step meant, so the honest
 * answer is that neither is bindable.
 */
export function customerBrokenPage(): string {
  return page(
    'Contact details',
    `<b>Contact details</b>
    <hr>
    <form method="post" action="/customer/new">
      <table class="form">
        <tr><td>Phone (day)</td><td><input type="text" name="phone" size="20"></td></tr>
        <tr><td>Phone (evening)</td><td><input type="text" name="phone" size="20"></td></tr>
        <tr><td></td><td><input type="submit" value="Save contact"></td></tr>
      </table>
    </form>`,
  );
}

/**
 * A work-queue menu built from anchors with handlers and no `href`.
 *
 * The shape the whole `text` strategy exists for. "Work queue" appears twice,
 * in the bar and again in the footer, because a duplicated nav is ordinary and
 * refusing it is the behaviour worth proving. "Sent items" is direct text;
 * "Drafts" is wrapped in a `<font>`, which is what decides *which* element a
 * binding names.
 */
export function inboxPage(): string {
  return page(
    'Work queues',
    `<b>Work queues</b>
    <hr>
    <p class="bar" id="bar">
      <a onclick="show('Work queue')">Work queue</a>
      <a onclick="show('Sent items')">Sent items</a>
      <a onclick="show('Drafts')"><font>Drafts</font></a>
      <a href="javascript:void(0)" onclick="show('Archive')">Archive</a>
    </p>
    <hr>
    <p>Showing: <font color="#1f3a5f"><b id="showing">nothing yet</b></font></p>
    <table border="1" cellspacing="0" class="form">
      <tr><td><b>Request</b></td><td><b>Raised by</b></td><td><b>Value</b></td></tr>
      <tr><td>SR-4417</td><td>Ada Lovelace</td><td>412000</td></tr>
    </table>
    <hr>
    <p class="bar" id="footer"><a onclick="show('Work queue')">Work queue</a></p>
    <script>
      function show(what) { document.getElementById('showing').textContent = what; }
    </script>`,
  );
}

/**
 * Controls named only by the attributes a page author writes for a person.
 *
 * A search box with a placeholder and no label; an icon link whose only word is
 * its `alt`; an image submit button, which is the one place `alt` reaches a
 * control a scan enumerates; and a toolbar icon with nothing but a `title`.
 * Each is ordinary on an old page and unbindable without this tier.
 */
export function mediaPage(): string {
  return page(
    'Catalogue',
    `<b>Catalogue</b>
    <hr>
    <form method="get" action="/media">
      <table class="form">
        <tr>
          <td><input type="text" placeholder="Search catalogue" size="28"></td>
          <td><input type="image" alt="Run the search" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></td>
        </tr>
      </table>
    </form>
    <hr>
    <p class="bar">
      <a href="/media"><img alt="Open the catalogue" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" border="0"></a>
      <a href="/media" title="Refresh the listing">&#9851;</a>
    </p>`,
  );
}

/**
 * A real AngularJS 1.x screen, not an imitation of one.
 *
 * The framework is served from the vendored package rather than mimicked,
 * because the questions this room answers are about how Angular actually binds
 * and rerenders. Two of them:
 *
 * - `ng-click` binds through jqLite's `.on('click')`, which is a native
 *   `addEventListener`. Orbit holds a click, derives the element, then replays
 *   it — so the replayed event has to reach Angular's handler and run a digest,
 *   or the step records something the page never did.
 * - A hash route changes the screen without a navigation. Orbit records no
 *   navigation for it, which is a real gap; the test pins it rather than
 *   letting it be discovered on a demo.
 */
export function ngPage(): string {
  return page(
    'Tasks (Angular)',
    `<div ng-app="desk" ng-controller="TasksController as vm">
      <b>Tasks</b>
      <hr>
      <p class="bar">
        <a ng-click="vm.open('atasks')">Active tasks</a>
        <a ng-click="vm.open('ctasks')">Closed tasks</a>
        <a href="#!/summary">Summary</a>
      </p>
      <hr>
      <p>Queue: <font color="#1f3a5f"><b id="queue">{{ vm.queue }}</b></font></p>
      <div id="panel" ng-show="vm.queue !== 'none'">
        <table border="1" cellspacing="0" class="form">
          <tr><td><b>Reference</b></td><td><b>Owner</b></td></tr>
          <tr ng-repeat="task in vm.tasks"><td>{{ task.ref }}</td><td>{{ task.owner }}</td></tr>
        </table>
      </div>
      <p>Filter: <input type="text" ng-model="vm.filter" placeholder="Owner contains"></p>
      <p id="route">route: {{ vm.route }}</p>
    </div>
    <script src="/vendor/angular.min.js"></script>
    <script>
      angular.module('desk', []).controller('TasksController', ['$scope', '$location',
        function ($scope, $location) {
          var vm = this;
          vm.queue = 'none';
          vm.filter = '';
          vm.route = $location.path() || '/';
          vm.tasks = [];
          vm.open = function (which) {
            vm.queue = which === 'atasks' ? 'Active tasks' : 'Closed tasks';
            vm.tasks = which === 'atasks'
              ? [{ ref: 'SR-4417', owner: 'Ada Lovelace' }]
              : [{ ref: 'SR-1002', owner: 'Grace Hopper' }];
          };
          $scope.$on('$locationChangeSuccess', function () {
            vm.route = $location.path() || '/';
          });
        }]);
    </script>`,
  );
}

/**
 * A page behind a consent banner served in an iframe.
 *
 * Same-origin, so the frame can dismiss itself — which is what a real banner
 * does, and what makes this a test rather than a picture of one. The property
 * being checked is that Orbit's capture script does not install itself inside
 * the frame: if it did, the banner's own Accept handler would be intercepted,
 * held, and replayed by a recorder instead of running, and a frame navigating
 * internally would be reported as the page navigating.
 */
export function consentPage(): string {
  return page(
    'Requests',
    `<div id="banner" style="border:2px solid #1f3a5f; margin-bottom:10px;">
      <iframe src="/consent-frame" width="100%" height="70" frameborder="0" title="Cookie notice"></iframe>
    </div>
    <b>Requests</b>
    <hr>
    <p><a onclick="document.getElementById('picked').textContent = 'SR-4417'">SR-4417</a></p>
    <p>Picked: <font color="#1f3a5f"><b id="picked">nothing</b></font></p>`,
  );
}

export function consentFramePage(): string {
  return `<!doctype html>
<html>
<head>${STYLE}</head>
<body style="margin:6px">
  We use cookies. <button type="button" onclick="dismiss()">Accept all</button>
  <script>
    function dismiss() {
      var banner = window.parent.document.getElementById('banner');
      if (banner) { banner.parentNode.removeChild(banner); }
    }
  </script>
</body>
</html>`;
}

/**
 * A `<frameset>` page.
 *
 * Here to pin the behaviour rather than to work. What matters is that a click
 * inside a frame produces nothing — no capture, no failure, and above all no
 * hang — so an operator meets an empty recording rather than a wedged browser.
 */
export function framesetPage(): string {
  return `<!doctype html>
<html>
<frameset cols="180,*">
  <frame name="nav" src="/frame-nav">
  <frame name="body" src="/frame-body">
</frameset>
</html>`;
}

export function frameNavPage(): string {
  return `<!doctype html><html><head>${STYLE}</head><body>
    <p class="bar"><a href="/frame-body" target="body">Requests</a></p>
  </body></html>`;
}

export function frameBodyPage(): string {
  return `<!doctype html><html><head>${STYLE}</head><body>
    <b>Requests</b><hr><p>Nothing selected.</p>
  </body></html>`;
}

/**
 * A results table whose cells carry nothing at all.
 *
 * The room for `extract`: a figure a workflow has to read, in a cell with no
 * id, no test id and no attribute of any kind. What names it is its row and its
 * column to a person, and to Orbit its accessible name — which for a bare cell
 * is the value itself, an honest limitation rather than something to paper over.
 */
export function searchPage(query: string): string {
  const rows =
    query === ''
      ? '<tr><td colspan="4">Enter a reference and press Find.</td></tr>'
      : `<tr><td>${query}</td><td>In progress</td><td>Infrastructure Operations</td><td>412000</td></tr>`;

  return page(
    'Find a request',
    `<b>Find a request</b>
    <hr>
    <form method="get" action="/search">
      <table class="form">
        <tr>
          <td>Reference</td>
          <td><input type="text" name="q" size="18" value="${query}"></td>
          <td><input type="submit" value="Find"></td>
        </tr>
      </table>
    </form>
    <hr>
    <table border="1" cellspacing="0" class="form">
      <tr><td><b>Reference</b></td><td><b>Status</b></td><td><b>Team</b></td><td><b>Value</b></td></tr>
      ${rows}
    </table>`,
  );
}

/**
 * A real data table, with a header row and no test ids anywhere.
 *
 * The eleventh room, and the one a collect step is proven against. Every other
 * table in this portal is a *layout* table — `<tr><td>label</td><td>value` —
 * which is what a 1998 form looks like. This is the other legacy shape: a
 * result grid, rendered server-side, whose columns are distinguished to a
 * person by the words in the header row and to a machine by nothing else at
 * all. No `data-testid`, no `id`, no class on a cell.
 *
 * That is exactly the case that makes header addressing necessary rather than
 * merely nicer. There is no attribute on a cell to bind to, so the only honest
 * way to say "the ticket number column" is to say those words and let the page
 * resolve them.
 *
 * Row 4 is deliberately missing its owner: an unassigned ticket genuinely has
 * no owner, and a collected table has to render that as an observed blank
 * rather than refusing or inventing one.
 *
 * **Rendered outside the frame wrapper every other room uses**, and that is a
 * finding rather than a convenience. The wrapper is itself a layout `<table>`,
 * and a row of it *contains* the grid — so `getByRole('cell')` inside that row
 * reaches straight through into the grid's own cells, and a `rows` locator of
 * `role_and_name=row` collects the wrapper's rows as though they were records.
 * Nested layout tables defeat a row locator on their own; what fixes it is a
 * row locator scoped to the grid, which nothing in the vocabulary can express
 * for a table carrying no attributes at all. Left here, in the open, as the
 * thing the recorder has to solve rather than papered over.
 */
export function ticketsPage(): string {
  const rows = [
    ['TCK-4401', 'Printer offline in Accounts', 'Open', 'R. Alvarez'],
    ['TCK-4402', 'VPN drops every few minutes', 'In Progress', 'D. Okafor'],
    ['TCK-4403', 'New starter account request', 'In Progress', 'R. Alvarez'],
    ['TCK-4404', 'Meeting room display flickers', 'Open', ''],
    ['TCK-4405', 'Shared drive permissions', 'Resolved', 'P. Nandi'],
    ['TCK-4406', 'Laptop will not charge', 'Resolved', 'D. Okafor'],
    ['TCK-4407', 'Email quota exceeded', 'Open', 'P. Nandi'],
  ];

  return `<!doctype html>
<html><head><title>Open tickets</title></head>
<body>
      <h2>Open tickets</h2>
      <table class="grid" border="1" cellpadding="3" cellspacing="0">
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Summary</th>
            <th>State</th>
            <th>Owner</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
            .join('\n          ')}
        </tbody>
      </table>
      <p><a href="/home">Back</a></p>
</body></html>
`;
}

/**
 * Repeating cards, not a table, and one of them holding a nested list.
 *
 * The shape that tests whether "walk up to the repeating ancestor" is a rule or
 * a guess. A `<table>` makes it easy: `<tr>` has seven like siblings
 * and everything above it has one, so the signal is unmistakable. Real pages
 * are rarely that kind.
 *
 * Three hazards are built in deliberately:
 *
 * 1. **Cards, not rows.** The repeating unit is a `<div>` among `<div>`s, and
 *    the wrapper is also a `<div>`. Tag name alone cannot separate them.
 * 2. **A nested repeating list.** Each card holds a `<ul>` of labels, so a walk
 *    that started inside one would find *that* list's repetition first. Which
 *    is correct depends on what was demonstrated, and a rule that cannot tell
 *    the two apart is a rule that picks the wrong scope silently.
 * 3. **An uneven card.** The last one has no owner line at all — not blank,
 *    absent — so a column reached inside it genuinely finds nothing.
 */
export function cardsPage(): string {
  const cards = [
    ['REQ-8801', 'Replace failed disk', 'Open', 'R. Alvarez', ['hardware', 'urgent']],
    ['REQ-8802', 'Restore mailbox from backup', 'In Progress', 'D. Okafor', ['mail']],
    ['REQ-8803', 'Decommission old switch', 'Open', 'P. Nandi', ['network', 'change']],
    ['REQ-8804', 'Audit shared folders', 'Open', null, ['security']],
  ];

  return `<!doctype html>
<html><head><title>Requests</title></head>
<body>
  <h2>Requests</h2>
  <div class="list">
    ${cards
      .map(
        ([ref, summary, state, owner, tags]) => `
    <div class="card">
      <div class="ref">${String(ref)}</div>
      <div class="summary">${String(summary)}</div>
      <div class="state">${String(state)}</div>
      ${owner === null ? '' : `<div class="owner">${String(owner)}</div>`}
      <ul class="tags">
        ${(tags as string[]).map((tag) => `<li>${tag}</li>`).join('')}
      </ul>
    </div>`,
      )
      .join('\n')}
  </div>
</body></html>
`;
}

/**
 * Two tables on one page, each inside a repeating section.
 *
 * The case that breaks "walk up to the outermost repeating ancestor". From a
 * cell, the walk passes `TR` (many alike) *and then* `DIV.section` (two alike),
 * so a rule that takes the highest repetition picks the section — collecting
 * two rows, one per section, instead of the rows of a table.
 *
 * Kept as a fixture rather than fixed in the rule, because the lesson is that
 * no counting heuristic settles it: which repetition is "the records" is a
 * question about what somebody meant, and the honest answers are to have them
 * demonstrate two fields of one record, or to ask.
 */
export function sectionsPage(): string {
  const section = (title: string, rows: readonly (readonly string[])[]) => `
    <div class="section">
      <h3>${title}</h3>
      <table class="grid" border="1" cellpadding="3" cellspacing="0">
        <thead><tr><th>Ref</th><th>Summary</th><th>State</th></tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  return `<!doctype html>
<html><head><title>By queue</title></head>
<body>
  <h2>Requests by queue</h2>
${section('Network', [
  ['REQ-9001', 'Switch port flapping', 'Open'],
  ['REQ-9002', 'VLAN change request', 'Open'],
  ['REQ-9003', 'Firewall rule review', 'In Progress'],
])}
${section('Desktop', [
  ['REQ-9101', 'Laptop replacement', 'Open'],
  ['REQ-9102', 'Monitor arm request', 'Resolved'],
])}
</body></html>
`;
}
