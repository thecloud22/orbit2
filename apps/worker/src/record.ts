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
import { snapshot, type Seen } from './snapshot.ts';

export interface Touched {
  kind: 'click' | 'change';
  /** Absent for anything the page marks as a secret. */
  value: string | null;
  sensitive: boolean;
}

export interface Recording {
  steps: Step[];
  /** What Orbit could not turn into a step, said plainly rather than dropped. */
  questions: string[];
  touched: number;
}

/**
 * Marks the element the person acted on, so Orbit can find it in its own
 * snapshot rather than trusting a description the page computed. A page can
 * say anything about itself; the marker is only a pointer.
 */
export const WATCH = `
(() => {
  const report = (kind, el, value, sensitive) => {
    document.querySelectorAll('[data-orbit-touched]').forEach((e) => e.removeAttribute('data-orbit-touched'));
    el.setAttribute('data-orbit-touched', '1');
    window.__orbitTouched({ kind, value, sensitive });
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

export async function record(opts: {
  origin: string;
  startPath: string;
  /** Resolves when the person says they are finished. */
  until: Promise<void>;
  onStep?: (step: Step) => void;
}): Promise<Recording> {
  const browser = await chromium.launch({ headless: false });
  const page: Page = await browser.newPage();
  const steps: Step[] = [];
  const questions: string[] = [];
  let touched = 0;

  steps.push({
    id: crypto.randomUUID(), kind: 'open', summary: `Open ${opts.startPath}`,
    application: 'app', path: opts.startPath,
    arrives: { describe: 'the page is showing' }, changesARecord: false,
  });

  await page.exposeFunction('__orbitTouched', async (event: Touched) => {
    touched += 1;
    // Orbit derives the binding from its own view of the page. What the page
    // reported is a pointer to an element, never a description to be trusted.
    const seen = await snapshot(page);
    const marked = await page.locator('[data-orbit-touched]').first();
    const name = await marked.evaluate((el): string => {
      const input = el as unknown as { labels?: ArrayLike<{ textContent: string | null }>; value?: string };
      const labelled = input.labels?.[0]?.textContent?.trim();
      return labelled || el.getAttribute('aria-label') || input.value || el.textContent?.trim() || '';
    }).catch(() => '');

    const element = seen.find((s) => s.name === name)
      ?? seen.find((s) => s.labelledBy === name);
    if (!element) {
      questions.push(`Something was ${event.kind === 'click' ? 'pressed' : 'filled in'} that Orbit could not name on the page. It needs a name before this can publish.`);
      return;
    }

    const step = stepFor(event, element);
    if (step) { steps.push(step); opts.onStep?.(step); }
  });

  await page.addInitScript(WATCH);
  await page.goto(`${opts.origin}${opts.startPath}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(WATCH);
  // Re-arm after every navigation: a server-rendered application replaces the
  // document on every submit, and a listener bound to the old one is gone.
  page.on('framenavigated', () => { void page.evaluate(WATCH).catch(() => undefined); });

  try { await opts.until; } finally { await page.close().catch(() => undefined); await browser.close(); }

  if (!steps.some((s) => s.kind === 'end')) {
    steps.push({ id: crypto.randomUUID(), kind: 'end',
      summary: 'Finish — this conclusion has no name yet', outcome: 'unnamed', publishes: [] });
    questions.push('What should this be called when it finishes this way? A run reports the conclusion by name, and nothing may invent one.');
    questions.push('This recording shows one way the procedure can end. The others must be recorded or described before it can publish.');
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
