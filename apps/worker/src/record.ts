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
import { chromium, type Page } from 'playwright';
import { asQuestion, asRisk, type Note } from './note.ts';
import { COLLECT, shape, type Raw, type Seen } from './snapshot.ts';

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
 * Marks the element the person acted on, so Orbit can find it in its own
 * snapshot rather than trusting a description the page computed. A page can
 * say anything about itself; the marker is only a pointer.
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
  const report = (kind, el, value, sensitive) => {
    document.querySelectorAll('[data-orbit-touched]').forEach((e) => e.removeAttribute('data-orbit-touched'));
    el.setAttribute('data-orbit-touched', '1');
    // Orbit's own view of the page, taken here rather than a moment later.
    // An application that navigates when you touch it — which is most of them
    // — has already replaced this document by the time an asynchronous
    // evaluate arrives, and every action was being lost to "execution context
    // was destroyed". The collector is the same one; only the moment differs.
    window.__orbitTouched({ kind, value, sensitive, seen: collect() });
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('button, a, input[type=submit], input[type=button], [role=button]');
    if (el) report('click', el, null, false);
  }, true);
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.matches || !el.matches('input, select, textarea')) return;
    // A password is a keystroke like any other, and this is the only place it
    // could have been kept. It is not kept.
    const sensitive = el.type === 'password' || el.autocomplete === 'current-password'
      || el.autocomplete === 'new-password';
    report('change', el, sensitive ? null : el.value, sensitive);
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
  return { page: await browser.newPage(), close: () => browser.close() };
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

  await page.exposeFunction('__orbitTouched', async (event: Touched) => {
    touched += 1;
    try {
    // Orbit derives the binding from its own view of the page. What the page
    // reported is a pointer to an element, never a description to be trusted.
    const seen = shape(event.seen ?? []);

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

    const step = stepFor(event, element);
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

  await page.addInitScript(WATCH);
  await page.goto(`${opts.origin}${opts.startPath}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(WATCH);
  // Re-arm after every navigation: a server-rendered application replaces the
  // document on every submit, and a listener bound to the old one is gone.
  page.on('framenavigated', () => { void page.evaluate(WATCH).catch(() => undefined); });

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

export function stepFor(event: Touched, element: Seen): Step | null {
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
    return { id, kind: 'enter', summary: `A secret, into ${target.label}`,
      into: target, value: { from: 'secret', credential: 'portalPassword' }, sensitive: true };
  }
  return { id, kind: 'enter', summary: `A value, into ${target.label}`,
    into: target, value: { from: 'input', value: nameFor(target.label) }, sensitive: false };
}

/** A declared input named after the field it goes into, for the author to rename. */
function nameFor(label: string): string {
  const camel = label.replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
  return /^[a-z]/.test(camel) ? camel.slice(0, 64) : `value${camel.slice(0, 58)}`;
}
