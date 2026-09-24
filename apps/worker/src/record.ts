/**
 * Recording a demonstration — §5's other way in.
 *
 * A person does the job by hand while Orbit watches. It records what they
 * *touched*, not what it guessed they meant, which is why this is the more
 * accurate route on an old application: the question the model-driven session
 * spends its whole effort on — which control did that instruction mean — is
 * answered by the click.
 *
 * What it does not change: the binding is still derived by Orbit from the
 * ladder Decision 15 measured, and the draft still goes through confirmation
 * and the publish gate. A recording is a way of proposing steps, not a way of
 * skipping the checks.
 *
 * Three things it must get right, each a defect if discovered late:
 *
 *   A recording captures keystrokes, and a password is a keystroke. The field
 *   is remembered and the value never reaches this process (§2).
 *
 *   One recording is one path. It shows the ending that happened; the others
 *   are described or recorded separately, and §4 will not publish a path that
 *   reaches no conclusion.
 *
 *   The person records as themselves and the agent runs as the registered
 *   credential, so a control visible to them may not be visible to it. Every
 *   recorded binding is re-resolved as that account before publication.
 */
import type { Step } from '@orbit/contract';
import { chromium, type Frame, type Page } from 'playwright';
import { asQuestion, asRisk, type Note } from './note.ts';
import { settlePage, watchRequests } from './looking-browser.ts';
import { asValueName, COLLECT, frameOf, nameControls, shape, type Raw, type Seen } from './snapshot.ts';

export interface Touched {
  kind: 'click' | 'change';
  /** Absent for anything the page marks as a secret. */
  value: string | null;
  sensitive: boolean;
  /** Orbit's own collection of the page, taken at the instant of the act. */
  seen?: Raw[];
}

export interface Recording {
  steps: Step[];
  /** What Orbit could not turn into a step, said plainly rather than dropped. */
  questions: Note[];
  touched: number;
}

/**
 * How long a press is held while Orbit names the page it is on. A ceiling:
 * naming takes a fraction of it, and if it ever takes longer the press goes
 * ahead regardless — losing a step is bad, a page somebody cannot click is
 * worse. Orbit 1 held for the same reason.
 */
export const HOLD_MS = 4000;

/**
 * Marks the element the person acted on, so Orbit can find it in its own
 * snapshot rather than trusting a description the page computed. A page can
 * say anything about itself; the marker is only a pointer.
 *
 * What it does not do is name anything. Names come from Playwright
 * (`nameControls`), and an element only appears in the collection once it has
 * one — so an element that was not on the page when it was last named was not
 * in the collection at all, and a press of it was reported as something Orbit
 * "could not name". That was every field on an application that draws its
 * screen after the document arrives. So when the page has changed since it was
 * named, or the element has no name, the act is held, the page is named again,
 * and only then collected; a press is re-issued once that is done. That is how
 * Orbit 1 recorded, and it recorded these applications.
 */
export const WATCH = `
(() => {
  // Armed once per document. It is injected on load, again after the first
  // navigation, and again on every one after that — because a server-rendered
  // application replaces the document on every submit and a listener bound to
  // the old one is gone. An application that navigates without replacing the
  // document keeps its listeners, so without this guard they stack up and
  // every action is recorded as many times as the page has moved.
  if (window.__orbitWatching) return;
  window.__orbitWatching = true;

  const collect = () => ${COLLECT};

  // What pressing something means. It was buttons, links and role=button, so
  // a span or a div with a click handler — which is how most of the
  // applications Orbit is for build their buttons — was never reported at all:
  // not as a step, not as a question. Now anything the page marks as
  // pressable, and failing that the element where the pointer cursor starts,
  // which is how a page shows a person that something can be clicked.
  const PRESSABLE = 'button, a, summary, input[type=submit], input[type=button], input[type=image],'
    + ' input[type=reset], [role=button], [role=link], [role=tab],'
    + ' [role=menuitem], [role=option], [role=checkbox], [role=radio], [role=switch], [onclick]';
  // The path through any shadow roots, innermost first. event.target stops at
  // the outside of a web component, and closest() cannot see into one.
  const path = (e) => (e.composedPath ? e.composedPath() : [e.target]).filter((n) => n && n.nodeType === 1);
  const pressed = (e) => {
    const through = path(e);
    const marked = through.find((el) => el.matches(PRESSABLE));
    if (marked) return marked;
    let pointer = null;
    for (const el of through) {
      if (el === document.body || el === document.documentElement) break;
      if (getComputedStyle(el).cursor !== 'pointer') { if (pointer) break; continue; }
      pointer = el;
    }
    return pointer;
  };

  // Whether the page has changed since it was last named. Attributes are not
  // watched: naming writes them, and would count as a change to itself.
  let changed = true;
  new MutationObserver(() => { changed = true; })
    .observe(document, { childList: true, subtree: true, characterData: true });
  const name = async () => {
    changed = false;
    if (typeof window.__orbitName === 'function') await window.__orbitName();
  };
  window.__orbitRename = name;

  let marked = null;
  const mark = (el) => {
    if (marked && marked !== el) marked.removeAttribute('data-orbit-touched');
    // An earlier document's marker, left by a page that kept its elements.
    document.querySelectorAll('[data-orbit-touched]').forEach((e) => { if (e !== el) e.removeAttribute('data-orbit-touched'); });
    el.setAttribute('data-orbit-touched', '1');
    marked = el;
  };
  const clean = (el) => !changed && el.hasAttribute('data-orbit-role');

  // Everything reported, in order. A press waits on it, so the field filled
  // before it is named before the press can navigate away with it.
  let outstanding = 0;
  let pending = Promise.resolve();
  const enqueue = (work) => {
    outstanding += 1;
    const run = pending.then(work).catch(() => undefined).finally(() => { outstanding -= 1; });
    pending = run;
    return run;
  };
  const bounded = (promise) => new Promise((done) => {
    promise.then(done, done);
    setTimeout(done, ${HOLD_MS});
  });

  // Orbit's own view of the page, taken here rather than a moment later. An
  // application that navigates when you touch it — which is most of them — has
  // already replaced this document by the time an asynchronous evaluate
  // arrives, and every action was being lost to "execution context was
  // destroyed". Synchronous when the page is already named; otherwise after
  // naming, with the act held so the document is still this one.
  const act = (kind, el, value, sensitive) => async () => {
    mark(el);
    if (!clean(el)) await name();
    window.__orbitTouched({ kind, value, sensitive, seen: collect() });
  };

  let replaying = false;
  document.addEventListener('click', (e) => {
    if (replaying) return;
    const el = pressed(e);
    if (!el) return;
    const work = act('click', el, null, false);
    if (outstanding === 0 && clean(el)) { work(); return; }

    // Held, not cancelled, and re-issued once the page is named.
    const target = path(e)[0] || el;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    bounded(enqueue(work)).then(() => {
      replaying = true;
      try {
        if (typeof target.click === 'function') target.click();
        else target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window }));
      } finally { replaying = false; }
    });
  }, true);

  document.addEventListener('change', (e) => {
    const el = path(e)[0];
    if (!el || !el.matches('input, select, textarea')) return;
    // A password is a keystroke like any other, and this is the only place it
    // could have been kept. It is not kept.
    const sensitive = el.type === 'password' || el.autocomplete === 'current-password'
      || el.autocomplete === 'new-password';
    const work = act('change', el, sensitive ? null : el.value, sensitive);
    if (outstanding === 0 && clean(el)) work(); else enqueue(work);
  }, true);

  // Pressing Enter in a field submits without a click, so a field still being
  // named would be lost to the navigation the form causes. Held only then.
  let resubmitting = false;
  document.addEventListener('submit', (e) => {
    if (resubmitting || outstanding === 0) return;
    const form = e.target;
    const by = e.submitter;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    bounded(pending).then(() => {
      resubmitting = true;
      try {
        try { form.requestSubmit(by || undefined); } catch { form.requestSubmit(); }
      } finally { resubmitting = false; }
    });
  }, true);
})()
`;

/**
 * Where the browser the person drives comes from.
 *
 * Handed in so that a test can supply a page it is also holding — the one
 * thing a recorder is hard to check is whether it actually captures, and it
 * cannot be checked while the recorder owns the only reference to the window.
 * The default is the real thing: a browser somebody can see and use.
 */
export type OpenForPerson = () => Promise<{ page: Page; close: () => Promise<void> }>;

const aWindowTheyCanSee: OpenForPerson = async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  watchRequests(page);
  return { page, close: () => browser.close() };
};

export async function record(opts: {
  origin: string;
  startPath: string;
  /** Resolves when the person says they are finished. */
  until: Promise<void>;
  /** Each step as it is derived, with the screen it was derived on. */
  onStep?: (step: Step, on: string) => void;
  /** What could not be turned into a step, as it happens rather than at the
   *  end — an action Orbit could not name is worth knowing while the person
   *  is still standing in front of the page it happened on. */
  onNote?: (note: Note) => void;
  open?: OpenForPerson;
  /** What the application's registry calls its password. A recorded sign-in
   *  names it; without one the sign-in cannot be recorded at all. */
  credentialName?: string | null;
  /** The account the registry says this application signs in as. A field
   *  filled in with exactly this value is the sign-in, not run data. */
  signsInAs?: string | null;
}): Promise<Recording> {
  const { page, close } = await (opts.open ?? aWindowTheyCanSee)();
  const steps: Step[] = [];
  const questions: Note[] = [];
  const raise = (note: Note) => { questions.push(note); opts.onNote?.(note); };
  let touched = 0;

  steps.push({
    id: crypto.randomUUID(), kind: 'open', summary: `Open ${opts.startPath}`,
    application: 'app', path: opts.startPath,
    arrives: { describe: 'the page is showing' }, changesARecord: false,
  });

  // A binding rather than a function, so Orbit knows which frame the act came
  // from: an application inside an iframe is found again inside that frame.
  await page.exposeBinding('__orbitTouched', async ({ frame }, event: Touched) => {
    touched += 1;
    try {
    // Orbit derives the binding from its own view of the page. What the page
    // reported is a pointer to an element, never a description to be trusted.
    const inFrame = frameOf(frame);
    const seen = shape((event.seen ?? []).map((r) => (inFrame ? { ...r, frame: inFrame } : r)));

    // The marked element, found by the marker rather than by a name computed
    // from it. Matching by name was the bug: the name of a field that has just
    // been filled in is the value that was typed into it, so the recorder
    // looked for a control called "ML-26-04502" and found none — and quietly
    // turned every demonstration into a list of questions.
    const element = seen.find((s) => s.touched);
    if (!element) {
      raise(asQuestion(`Something was ${event.kind === 'click' ? 'pressed' : 'filled in'} that Orbit could not name on the page. What is it called?`));
      return;
    }

    const step = stepFor(event, element, {
      credentialName: opts.credentialName ?? null, signsInAs: opts.signsInAs ?? null });
    if (!step && event.sensitive) {
      raise(asQuestion('A password was typed and no credential is registered for this application. '
        + 'Register one first — the value is never kept, so Orbit needs a name to look it up by at run time.'));
      return;
    }
    if (step) { steps.push(step); opts.onStep?.(step, page.url()); }
    } catch (error) {
      // An action that could not be turned into a step is said, not dropped.
      // It used to throw into the page-side callback and vanish, so a
      // demonstration could be watched from end to end and produce nothing at
      // all — with no question to say why, which is the worst way to fail:
      // silently, and looking like the person did nothing.
      raise(asQuestion(`Something was ${event.kind === 'click' ? 'pressed' : 'filled in'} that Orbit could not record: ${String(error)}`));
    }
  });

  // One naming at a time. Two passes interleaved would number the same
  // elements twice and stamp each with the other's answers.
  let naming: Promise<number> = Promise.resolve(0);
  const nameEverything = (frame: Page | Frame = page) => (naming = naming.then(() => nameControls(frame)).catch(() => 0));
  // Named where the act happened: a frame's controls are named in that frame.
  await page.exposeBinding('__orbitName', ({ frame }) => nameEverything(frame));

  await page.addInitScript(WATCH);
  await page.goto(`${opts.origin}${opts.startPath}`, { waitUntil: 'domcontentloaded' });
  await settlePage(page);
  await page.evaluate(WATCH);

  /**
   * Ask Playwright what everything is called, before anybody touches it.
   *
   * It cannot be asked after a click has gone through. A click on this kind
   * of application navigates, and by the time anything asynchronous runs the
   * document is the next one — asking then times out, which was measured
   * rather than assumed. So the names are on the elements before the person
   * acts, and the click handler reads them off the element it marked,
   * synchronously, in the same breath as marking it. Where the page has
   * changed since, the click is held while it is named again (WATCH).
   */
  const rename = () => page.evaluate('window.__orbitRename && window.__orbitRename()').catch(() => undefined);
  await rename();

  // Re-arm after every navigation of the page itself: a server-rendered
  // application replaces the document on every submit, and a listener bound to
  // the old one is gone — and so are the names, which belonged to elements that
  // no longer exist. Not for a frame inside it: an analytics or sign-in iframe
  // navigating is not the page moving, and renamed the whole page each time.
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    void settlePage(page).then(() => page.evaluate(WATCH)).then(rename).catch(() => undefined);
  });

  try { await opts.until; } finally { await close().catch(() => undefined); }

  if (!steps.some((s) => s.kind === 'end')) {
    steps.push({ id: crypto.randomUUID(), kind: 'end',
      summary: 'Finish — this conclusion has no name yet', outcome: 'unnamed', publishes: [] });
    questions.push(asQuestion('What should this be called when it finishes this way? A run reports the conclusion by name, and nothing may invent one.'));
    // Not a question. There is no sentence a person can type that makes a
    // second path exist — it is something to have seen before attesting, which
    // §4 calls a risk and settles by acknowledgement rather than by an answer.
    questions.push(asRisk('This recording shows one way the procedure can end. Any other way it can finish has to be recorded or described separately.'));
  }

  return { steps, questions, touched };
}

export function stepFor(
  event: Touched,
  element: Seen,
  registry?: { credentialName?: string | null; signsInAs?: string | null } | null,
): Step | null {
  const credentialName = registry?.credentialName ?? null;
  const signsInAs = registry?.signsInAs ?? null;
  const id = crypto.randomUUID();
  const target = { label: element.labelledBy ?? element.name, binding: element.binding };

  if (event.kind === 'click') {
    return { id, kind: 'activate', summary: element.name, control: target,
      then: { describe: 'the page moves on' },
      // What a person clicked may well change a record, and Orbit cannot tell
      // from the click. It proposes false and the author confirms it, which is
      // the same arrangement as every other mapping.
      changesARecord: false };
  }
  if (event.sensitive) {
    // The field is remembered. The value never was.
    //
    // It named `portalPassword` whatever the application was — a credential
    // nobody registered, so the reference parsed and pointed at nothing. It
    // names the registered one, and where there is none the step is not made:
    // a secret Orbit cannot find later is worse than a refusal now.
    if (!credentialName) return null;
    return { id, kind: 'enter', summary: `A secret, into ${target.label}`,
      into: target, value: { from: 'secret', credential: credentialName }, sensitive: true };
  }
  // The other half of the sign-in. A password is recognised by the page — it
  // says the field is a secret — and there is no such marker on the box above
  // it, so the account is recognised by what was typed: the person
  // demonstrating typed the name the registry already holds for this
  // application. That is evidence rather than a guess about the label, and a
  // field filled in with anything else stays what it looks like, a value
  // supplied per run.
  //
  // Without this the recorder declared `userId` as a run input, which asked
  // whoever started a run to type the service account's name and let them
  // choose a different one.
  if (signsInAs && event.value?.trim() === signsInAs.trim()) {
    return { id, kind: 'enter', summary: `The registered account, into ${target.label}`,
      into: target, value: { from: 'account' }, sensitive: false };
  }

  return { id, kind: 'enter', summary: `A value, into ${target.label}`,
    into: target, value: { from: 'input', value: asValueName(target.label) || 'aValue' }, sensitive: false };
}

