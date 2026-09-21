/**
 * What the model is shown, and what it is allowed to say back.
 *
 * Two decisions shape this, and the second is the one that matters.
 *
 * **Show structure, not pixels** (Decision 6 constraint 5): cheaper, and it
 * makes what the model saw reviewable as text six months later. A page is
 * reduced to the elements a workflow could plausibly act on — a `legacy-portal`
 * page has around two hundred nodes and perhaps fifteen worth naming, and the
 * rest is haystack.
 *
 * **The model says which element; Orbit decides how to find it again.** The
 * model picks an index off this list. It never chooses a strategy, never
 * writes a selector and never sees one. The binding is derived by Orbit from
 * the measured ladder (Decision 15), so the safety of a workflow does not
 * depend on a model having picked the safe rung.
 */
import type { Frame, Page } from 'playwright';
import type { Binding, Strategy } from './binder.ts';

export interface Seen {
  /** What the model refers to. Meaningless outside this snapshot, and never
   *  stored: an index is converted to a durable binding before anything keeps it. */
  index: number;
  what: 'field' | 'button' | 'link' | 'value' | 'heading';
  role: string;
  name: string;
  /** For a value: the label beside it, which is how a person names it. */
  labelledBy?: string;
  /**
   * The page declared this field a secret.
   *
   * Carried because authoring could not see it and so made a password into a
   * declared input — which put it on the confirmation screen as a box to type
   * a password into, and would have written it to `run.inputs` in plain text
   * on every test run. The recorder has checked this since it was written;
   * authoring is the path that could not.
   */
  secret?: boolean;
  /** What kind of element it is. Carried so that a binding made from the
   *  label can be corroborated against it — Decision 15 refuses the
   *  structural rung uncorroborated, and the tag is what is knowable here. */
  tag?: string;
  /**
   * This is the element the recorder marked as just acted on.
   *
   * The marker is a pointer, which is the whole reason it exists — a page can
   * say anything about itself, so Orbit finds the element in its own snapshot
   * rather than trusting a description. The recorder was matching by name
   * instead, and the name it computed for a filled field was the value that
   * had just been typed into it. It then looked for a control called
   * "ML-26-04502" and of course found none.
   */
  touched?: boolean;
  /** For a grid cell: its row and its column heading. */
  row?: string;
  column?: string;
  /** Filled by Orbit, never proposed by the model. */
  binding: Binding;
}

/**
 * `data-testid` is deliberately absent from everything below. These portals
 * carry them for their own test suites; an application a customer runs will
 * not, and binding to one would make the binder look solved.
 */
export const COLLECT = `
(() => {
  const out = [];
  const text = (el) => (el.textContent || '').trim().replace(/\\s+/g, ' ');
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // Fields, buttons and links: the things a step can act on.
  //
  // Named by Playwright, not here. nameControls() has already asked it what
  // each of these is called and written the answer onto the element, so this
  // reads data-orbit-role and data-orbit-name rather than guessing from
  // labels, titles and placeholders in an order that did not match the
  // specification. An element with no stamp is one Playwright did not
  // recognise as a control, or one that appeared after the page was named.
  for (const el of document.querySelectorAll('[data-orbit-role]')) {
    const acted = el.hasAttribute('data-orbit-touched');
    if (!visible(el) && !acted) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' && el.type === 'hidden' && !acted) continue;

    const role = el.getAttribute('data-orbit-role');
    const name = el.getAttribute('data-orbit-name') || '';

    // The label in the cell beside it, which is what an old two-column form
    // gives you and often the only name a person would use.
    let beside = '';
    const cell = el.closest('td');
    if (cell && cell.previousElementSibling) beside = text(cell.previousElementSibling);

    // A name this long is a subtree that got collapsed rather than a name.
    // Shortened rather than dropped for the element somebody just acted on:
    // an awkward name is something an author can correct, and no name at all
    // is a demonstration that lost a step without saying so.
    let called = name.trim();
    if (called.length > 80) {
      if (!acted) continue;
      called = called.slice(0, 80).trim();
    }

    out.push({
      touched: el.hasAttribute('data-orbit-touched'),
      tag,
      type: el.type || null,
      secret: el.type === 'password'
        || el.autocomplete === 'current-password' || el.autocomplete === 'new-password',
      what: role === 'link' ? 'link'
        : ['button', 'tab', 'menuitem', 'option', 'switch'].includes(role) ? 'button'
        : 'field',
      role,
      name: called,
      formName: el.getAttribute('name') || null,
      labelledBy: beside || null,
      row: null, column: null,
    });
  }

  // Values a workflow could read: a labelled figure, and a grid cell.
  for (const el of document.querySelectorAll('td, dd')) {
    if (!visible(el)) continue;
    if (el.querySelector('input, select, textarea, button, a')) continue;
    const value = text(el);
    if (!value || value.length > 120) continue;

    const table = el.closest('table');
    let row = null, column = null;
    if (table) {
      const tr = el.closest('tr');
      const position = Array.from(tr.children).indexOf(el);
      const headerRow = table.querySelector('tr');
      const header = headerRow && headerRow.children[position];
      column = header ? text(header) : null;
      row = tr.children[0] && tr.children[0] !== el ? text(tr.children[0]) : null;
    }
    const before = el.previousElementSibling;
    out.push({
      touched: el.hasAttribute('data-orbit-touched'),
      tag: el.tagName.toLowerCase(), type: null, what: 'value', role: 'cell',
      name: value, formName: null,
      labelledBy: before && !before.querySelector('input,button,a') ? text(before) : null,
      row, column,
    });
  }

  // A labelled figure that is not in a table: <div>label</div><div>value</div>.
  for (const el of document.querySelectorAll('div, span, p')) {
    if (!visible(el)) continue;
    if (el.children.length > 0) continue;
    const before = el.previousElementSibling;
    if (!before || before.children.length > 0) continue;
    const label = text(before), value = text(el);
    // A label is short; a value need not be. The ceiling was 60 characters on
    // both, so a labelled paragraph — "INCOME ANALYST NOTE" over the analyst's
    // actual note — was dropped for being long, and a procedure asking Orbit
    // to read that note had nothing to name. The model then bound the read to
    // the nearest heading instead, which the publish gate refuses as circular.
    // The label stays short, because something long is not a label; the grid
    // collector beside this one already allows 120 in a cell.
    if (!label || !value || label.length > 60 || value.length > 300) continue;

    // Two elements side by side are a label and its value only when they are
    // the whole of what their parent says. Anything else the parent carries in
    // its own right — a separator, a conjunction, the rest of a sentence —
    // means these are words inside prose, and the one before is not a label.
    //
    // The loan file's subtitle is a span holding the borrower, then " & ",
    // then a span holding the co-borrower, then the address. The co-borrower
    // was paired
    // with the borrower as its label, so "read the borrower name" bound to
    // "Adaeze Nwachukwu" and returned Chidi — the wrong person, on a step
    // whose summary named the right one. The borrower itself, having no
    // element before it, was offered as nothing at all.
    //
    // Excluding the pair means the page offers no borrower name, which is the
    // truth: nothing on it labels one. A procedure asking for it now gets a
    // question instead of somebody else's name.
    const parent = el.parentElement;
    if (!parent) continue;
    const own = text(parent).replace(/\\s+/g, '');
    if (own !== (label + value).replace(/\\s+/g, '')) continue;
    out.push({
      // Its real tag. This said 'div' whatever it found, for a selector that
      // matches div, span and p alike — so a binding corroborated on the tag
      // and the run looked for a <div> that was a <p>. It halted with
      // "Income analyst note could not be identified: found a <p>, expected a
      // <div>", after publication had passed. A snapshot that describes the
      // page inaccurately is worse than one that describes less of it: every
      // rung of the ladder is built on what this says.
      touched: el.hasAttribute('data-orbit-touched'), tag: el.tagName.toLowerCase(),
      type: null, what: 'value', role: 'text',
      name: value, formName: null, labelledBy: label, row: null, column: null });
  }

  for (const el of document.querySelectorAll('h1, h2, h3')) {
    if (!visible(el)) continue;
    out.push({
      touched: el.hasAttribute('data-orbit-touched'), tag: el.tagName.toLowerCase(), type: null, what: 'heading',
      role: 'heading', name: text(el), formName: null, labelledBy: null, row: null, column: null });
  }
  return out;
})()
`;

export interface Raw {
  tag: string; type: string | null; what: Seen['what']; role: string;
  name: string; formName: string | null; labelledBy: string | null; touched?: boolean;
  secret?: boolean;
  row: string | null; column: string | null;
}

/**
 * Orbit's choice of rung, taken in the order Decision 15 measured, from what
 * this element actually offers. The model is not consulted.
 */
function bindingFor(raw: Raw, seenNames: Map<string, number>): Binding {
  // Counted as the rung actually locates: role *and* name together.
  //
  // It used to count names alone, across every kind of element. A login page
  // has a heading "Sign in" above a button "Sign in", so the name counted
  // twice, `roleAndName` was rejected as ambiguous, and the binding fell all
  // the way to `text` — the rung Decision 15 measured as wrong most often.
  // That binding then matched both at run time and the run failed with
  // `controlAmbiguous`, after publication had passed.
  //
  // Two things sharing a name do not make `roleAndName` ambiguous unless they
  // share the role as well; `getByRole('button', { name: 'Sign in' })` finds
  // one thing on that page. Where the role does match — two buttons both
  // called "Approve" — the rung is still refused, exactly as before.
  const unique = (key: string) => (seenNames.get(key) ?? 0) === 1;

  // `text` is Orbit's own word for a bit of text on a page, not an ARIA role.
  // getByRole('text') matches nothing at all, so a labelled figure with a
  // name nothing else shared went out bound by a role the page cannot have,
  // and the read resolved to nothing — at run time, after publication, which
  // is the whole class of failure the publish gate exists to prevent. It now
  // falls to `structural`, which is the rung a labelled figure belongs on.
  const resolvable = raw.role && raw.role !== 'text';

  if (raw.name && resolvable && unique(`${raw.role}|${raw.name}`)) {
    return { strategy: 'roleAndName' as Strategy, role: raw.role, name: raw.name };
  }
  if (raw.formName) return { strategy: 'formName', name: raw.formName };
  if (raw.labelledBy && raw.what === 'field') {
    return { strategy: 'controlBeside', name: raw.labelledBy };
  }
  if (raw.row && raw.column) return { strategy: 'rowAndColumn', row: raw.row, column: raw.column };
  if (raw.labelledBy) {
    // The rung measured at 28 wrong binds out of 181, so it never goes out
    // without something that must also be true.
    return { strategy: 'structural', name: raw.labelledBy, corroborate: { text: raw.name.slice(0, 24) } };
  }
  return { strategy: 'text', name: raw.name, corroborate: { text: raw.name.slice(0, 24) } };
}

/**
 * Elements whose role and name Playwright is asked for.
 *
 * Roles are in the query beside tags because an application that builds its
 * buttons out of divs is the normal case on the systems Orbit exists for.
 */
const CONTROLS = 'input, select, textarea, button, a, [role], [onclick],'
  + ' [tabindex]:not([tabindex="-1"]), [data-orbit-touched]';

/** One element of an aria snapshot: `- textbox "User ID"`, or with no name. */
const FIRST_LINE = /^-\s+([a-z]+)(?:\s+"((?:[^"\\]|\\.)*)")?/;

/**
 * Asks Playwright what every control on the page is called, and writes the
 * answers onto the page for COLLECT to read.
 *
 * Orbit used to compute this itself, in the page, with a chain of fallbacks
 * that approximated the accessible-name algorithm and got it wrong. It had no
 * support for aria-labelledby at all, put title before placeholder where the
 * specification is the other way round, and skipped any control holding more
 * than one child element — which is what a button with an icon and a label
 * is. On a four-element page with an aria-labelledby input, a div button and
 * an icon button, Playwright found three controls and Orbit found none.
 *
 * That was worse than a bad approximation, because the other half of Orbit
 * was never approximating: every binding is resolved with getByRole, which
 * uses Playwright's real implementation. So the page was read with one set of
 * names and looked up with another, and nothing made them agree.
 *
 * They agree now by construction, because it is one implementation.
 *
 * Written back as attributes rather than returned, because of the recorder:
 * on an application that navigates when you touch it the document is gone
 * before anything asynchronous can ask, so the name has to be sitting on the
 * element at the moment of the click. Proved rather than assumed — asking
 * Playwright from inside the click handler times out, the page having already
 * become the next one.
 */
export async function nameControls(page: Page | Frame): Promise<number> {
  // Passed as source rather than as a function, like COLLECT above it and for
  // the same reason: this package is not compiled against the DOM, because the
  // only code here that touches one runs somewhere else.
  const count = await page.evaluate(`((controls) => {
    let i = 0;
    for (const el of document.querySelectorAll(controls)) el.setAttribute('data-orbit-i', String(i++));
    return i;
  })(${JSON.stringify(CONTROLS)})`) as number;

  const named: Array<[number, string, string]> = [];
  for (let i = 0; i < count; i += 1) {
    // One call per control, measured at about 3ms — 17 controls on a real
    // page in 49ms, beside an authoring turn that spends seconds in a model.
    const said = await page.locator(`[data-orbit-i="${i}"]`).first()
      .ariaSnapshot({ timeout: 2000 }).catch(() => '');
    const m = said.trim().match(FIRST_LINE);
    // `generic` is the accessibility tree saying this element is not a
    // control. Left unstamped, so COLLECT falls back rather than binding a
    // step to a role that resolves to nothing.
    if (!m || !m[1] || m[1] === 'generic' || m[1] === 'none') continue;
    named.push([i, m[1], (m[2] ?? '').replace(/\\(.)/g, '$1')]);
  }

  await page.evaluate(`((named) => {
    for (const entry of named) {
      const el = document.querySelector('[data-orbit-i="' + entry[0] + '"]');
      if (!el) continue;
      el.setAttribute('data-orbit-role', entry[1]);
      el.setAttribute('data-orbit-name', entry[2]);
    }
  })(${JSON.stringify(named)})`);

  return named.length;
}

export async function snapshot(page: Page | Frame): Promise<Seen[]> {
  await nameControls(page);
  return shape(await page.evaluate(COLLECT) as Raw[]);
}

/**
 * The same shaping, applied to a collection made elsewhere.
 *
 * The recorder cannot collect from here: on an application that navigates when
 * you touch it — which is most of them — the page is gone by the time an
 * asynchronous evaluate arrives, and every action was being lost to
 * "execution context was destroyed". So it runs COLLECT synchronously inside
 * the event, and hands the result here. Orbit still derives the binding from
 * its own view of the page; it just takes that view at the instant of the act
 * rather than a moment later.
 */
export function shape(raw: Raw[]): Seen[] {
  const counts = new Map<string, number>();
  for (const r of raw) {
    const key = `${r.role}|${r.name}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return raw
    // A control with no accessible name is not a control nobody can act on.
    //
    // This kept only what had one, which on an application written this
    // decade is everything. On the ones Orbit exists for it is not:
    //
    //     <td>User</td><td><input name="username"></td>
    //
    // That input has no label element, no aria-label and no placeholder, so
    // its accessible name is empty and it was thrown away here — leaving a
    // sign-in page showing the word "User" as a table cell and no box to type
    // it into. The ladder below has had a rung for exactly this since it was
    // measured, `formName`, and nothing ever reached it.
    //
    // So what survives is what can still be found again: an accessible name,
    // the name the form itself uses, or the label in the cell beside it.
    .filter((r) => r.name.length > 0 || r.formName || r.labelledBy)
    .map((r, index) => {
      const seen: Seen = {
        index: index + 1, what: r.what, role: r.role,
        // What a person calls it, which is not always what the page calls it.
        // The binding is still derived from the raw element below, so a field
        // with no accessible name binds by the form's name and not by this —
        // putting this in the binding would send getByRole looking for a name
        // the page does not have.
        name: r.name || r.labelledBy || r.formName || '',
        binding: bindingFor(r, counts),
      };
      if (r.labelledBy) seen.labelledBy = r.labelledBy;
      if (r.tag) seen.tag = r.tag;
      if (r.secret) seen.secret = true;
      if (r.touched) seen.touched = true;
      if (r.row) seen.row = r.row;
      if (r.column) seen.column = r.column;
      return seen;
    });
}

/** How the page reaches the model: text, numbered, and nothing else. */
export function asText(seen: Seen[]): string {
  // One unambiguous name per line, after the dash. An earlier format put the
  // kind and quotes on the same line and the model copied all of it — which
  // was the format's fault, not the model's.
  return seen.map((s) => {
    // A value is named by its LABEL, not by what it currently says. "Note
    // rate" is what a procedure calls it; "6.375%" is what it happens to hold
    // today, and naming it that way would be naming the answer.
    const called = s.what === 'value' && s.labelledBy ? s.labelledBy
      : s.what === 'value' && s.column ? s.column
      : s.name;
    const extra = s.what === 'value' && s.row && s.column ? `  (row ${s.row})`
      : s.what === 'value' && s.name !== called ? `  (currently ${s.name.slice(0, 40)})` : '';
    return `${s.what.padEnd(7)} — ${called}${extra}`;
  }).join('\n');
}

/** What the model calls this element: a value goes by its label. */
export function calledIn(s: Seen): string {
  if (s.what === 'value' && s.labelledBy) return s.labelledBy;
  if (s.what === 'value' && s.column) return s.column;
  return s.name;
}

/** Tolerates a name copied with its kind or its quotes still attached. */
/**
 * A value name, from whatever a person or a model called something.
 *
 * `name` in the contract is a camelCase identifier, and both ways in produce
 * labels instead: a recording has "Open a file by loan number", a model
 * answers with whatever reads naturally. Shared because authoring and
 * recording were solving it separately and only one of them was solving it.
 */
export function asValueName(label: string): string {
  const camel = label.replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
  return /^[a-z][a-zA-Z0-9]*$/.test(camel) ? camel.slice(0, 64) : '';
}

export function normaliseName(given: string): string {
  return given
    .replace(/^(field|button|link|value|heading)\s*[\u2014-]?\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}
