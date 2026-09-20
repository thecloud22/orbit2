/**
 * The authoring session: a written procedure becomes a draft.
 *
 * Decision 6 permits a model to drive a browser **while a person is
 * authoring**, and never while a published version executes. Decision 11 says
 * how: Orbit runs the loop and holds both connections. The model has no
 * connection to the browser, no tool that accepts an address, and no say in
 * how a control will be found again.
 *
 * What it does have is one question at a time: *here is the page as text, here
 * is the next thing the procedure says — which numbered element is that, and
 * what kind of step is it?* Everything else is Orbit's.
 *
 * Every turn is recorded, including the ones that produce nothing usable
 * (§12). The reasoning record is the deliverable as much as the draft is,
 * because it is what a reviewer reads to answer "why does the workflow say
 * that?".
 */
import { z, type Step } from '@orbit/contract';
import type { ModelProvider } from '@orbit/model';
import { chromium, type Page } from 'playwright';
import { asText, calledIn, normaliseName, snapshot, type Seen } from './snapshot.ts';

/**
 * What the model may answer. Note what is absent: no URL, no selector, no
 * strategy, no free text that becomes a locator. An address cannot be supplied
 * because no field accepts one.
 */
const proposal = z.object({
  act: z.enum(['enter', 'activate', 'read', 'done']),
  /** The element's name, exactly as it appeared in the list it was shown.
   *  A name rather than an index: the model reasons about names, and asking
   *  it to carry a number alongside is an indirection Orbit introduced and
   *  can therefore remove. It still chooses which element; it simply says so
   *  in the words it was already using. */
  element: z.string().nullable(),
  /** For `enter`: which declared input goes in. For `read`: what to call it. */
  value: z.string().nullable(),
  /** Whether a read may legitimately find nothing — the absent case. */
  optional: z.boolean().nullable(),
  why: z.string(),
});
type Proposal = z.infer<typeof proposal>;

const shape = {
  type: 'object',
  properties: {
    act: { type: 'string', enum: ['enter', 'activate', 'read', 'done'] },
    element: { type: ['string', 'null'] },
    value: { type: ['string', 'null'] },
    optional: { type: ['boolean', 'null'] },
    why: { type: 'string' },
  },
  required: ['act', 'element', 'value', 'optional', 'why'],
  additionalProperties: false,
};

export interface Turn {
  turn: number;
  shown: { page: string; elements: number; asking: string };
  answered: Proposal | null;
  verdict: 'kept' | 'discarded' | 'rejected';
  why: string;
  model: string;
  provider: string;
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
}

export interface AuthoredDraft {
  steps: Step[];
  turns: Turn[];
  /** What it could not work out, which blocks confirmation until answered. */
  questions: string[];
}

const INSTRUCTION = [
  'You are helping turn a written business procedure into a list of steps that a machine will replay exactly.',
  'You are shown a web page as a numbered list of elements, and the procedure.',
  'Answer with the ONE next thing to do, as the schema.',
  '',
  'act=enter   put a value into a field. element=the field. value=the name of the input it comes from.',
  'act=activate press a button or link. element=that control.',
  'act=read    take a value off the screen. element=the value. value=a short camelCase name for it.',
  '            optional=true if the procedure says this may legitimately not be there.',
  'act=done    the procedure is finished, or the page does not show what comes next.',
  '',
  'Each line of the page is:   kind — name',
  'element = the NAME only, the part after the dash. Not the kind, not the whole line.',
  'Never give a web address.',
  '',
  'Rules that matter:',
  '- Every declared input must be entered into a field before anything is searched for.',
  '- Never repeat a step you have already taken. If the page has not changed and you have',
  '  already acted on it, the next act is done.',
  '- Only read a value the procedure actually asks for. Do not read a name or a title',
  '  because it happens to be on the page.',
].join('\n');

export async function authorFromProcedure(opts: {
  procedure: string;
  origin: string;
  startPath: string;
  inputs: Record<string, string>;
  model: ModelProvider;
  maxTurns?: number;
}): Promise<AuthoredDraft> {
  const { procedure, origin, startPath, inputs, model } = opts;
  // A ceiling, for the same reason `for each` has one: without it nobody can
  // say what an authoring session could have cost.
  const maxTurns = opts.maxTurns ?? 12;

  const browser = await chromium.launch();
  const page: Page = await browser.newPage();
  const steps: Step[] = [];
  const turns: Turn[] = [];
  const questions: string[] = [];

  // How many turns in a row the page has looked the same. A session that keeps
  // acting on an unchanged page is stuck, and saying so is more useful than
  // letting it spend its ceiling finding that out.
  let unchanged = 0;
  let lastFingerprint = '';
  let lastActMoved = false;

  const openId = crypto.randomUUID();
  steps.push({
    id: openId, kind: 'open', summary: `Open ${startPath}`,
    application: 'app', path: startPath,
    arrives: { describe: 'the page is showing' }, changesARecord: false,
  });

  try {
    await page.goto(`${origin}${startPath}`, { waitUntil: 'domcontentloaded' });

    for (let turn = 1; turn <= maxTurns; turn++) {
      const seen = await snapshot(page);
      // Only an act that is *supposed* to move the page counts towards being
      // stuck. Typing into a field changes nothing visible, and holding that
      // against the session would end it halfway through a form.
      const fingerprint = `${page.url()}|${seen.map((s) => s.name).join('|')}`;
      if (lastActMoved) {
        unchanged = fingerprint === lastFingerprint ? unchanged + 1 : 0;
      }
      lastFingerprint = fingerprint;
      if (unchanged >= 2) {
        questions.push('The page stopped changing, so the rest of the procedure could not be worked out here.');
        break;
      }
      const done = steps.slice(1).map((s, i) => `${i + 1}. ${s.kind} — ${s.summary}`);
      const asking = done.length === 0
        ? 'Nothing has been done yet. What is the first thing to do?'
        : [`ALREADY DONE (do not repeat any of these):`, ...done, '',
           unchanged >= 1
             ? 'The page has NOT changed since your last act. Either something else is needed first, or the procedure is finished.'
             : '', 'What is the next thing to do?'].filter(Boolean).join('\n');

      const answered = await model.propose(
        {
          purpose: 'propose the next step',
          instruction: INSTRUCTION,
          shown: [`PROCEDURE:\n${procedure}`, '', `DECLARED INPUTS: ${Object.keys(inputs).join(', ')}`,
                  '', `PAGE (${page.url()}):`, asText(seen), '', asking].join('\n'),
        },
        proposal, shape,
      );

      const record = (verdict: Turn['verdict'], why: string): Turn => ({
        turn, shown: { page: page.url(), elements: seen.length, asking },
        answered: answered.value, verdict, why,
        model: answered.model, provider: answered.provider,
        tokensIn: answered.tokensIn, tokensOut: answered.tokensOut, costMicros: answered.costMicros,
      });

      if (!answered.value) {
        // Not an error. A call that produced nothing usable is recorded,
        // metered and retried — and it is kept, because a record that drops
        // its own failures is not a record.
        turns.push(record('discarded', answered.refusedBecause ?? 'no answer'));
        continue;
      }

      const p = answered.value;
      if (p.act === 'done') { turns.push(record('kept', 'the model said the procedure is finished')); break; }

      const wanted = normaliseName(p.element ?? '');
      const named = seen.filter((s) => calledIn(s) === wanted);
      if (named.length === 0) {
        // It named something it was not shown. Rejected, not retried into
        // existence: the session's record is evidence either way.
        turns.push(record('rejected', `named "${wanted}", which was not on the page`));
        questions.push(`At turn ${turn} the page did not offer what the procedure asked for.`);
        continue;
      }
      if (named.length > 1) {
        // Two things on the page carry that name, so it identifies neither —
        // the same refusal the publish gate makes, made earlier.
        turns.push(record('rejected', `"${wanted}" is on the page ${named.length} times, so it names neither`));
        continue;
      }
      const element = named[0]!;

      // An act has to suit the thing it names. Typing into a button and
      // pressing a cell are not slips to be tolerated — they are the model
      // reaching past what it was offered, and Orbit is the one that knows
      // which is which.
      const mismatch =
        p.act === 'enter' && element.what !== 'field' ? `${element.what} "${element.name}" is not something a value goes into`
        : p.act === 'activate' && element.what !== 'button' && element.what !== 'link' ? `${element.what} "${element.name}" is not something that can be pressed`
        : p.act === 'read' && element.what !== 'value' && element.what !== 'heading' ? `${element.what} "${element.name}" is not a value to read`
        : null;
      if (mismatch) {
        turns.push(record('rejected', mismatch));
        continue;
      }

      const made = makeStep(p, element);
      if (!made) {
        turns.push(record('rejected', `${p.act} needs a value name and none was given`));
        continue;
      }

      steps.push(made);
      turns.push(record('kept', `step ${steps.length}: ${made.summary}`));

      // Do it, so the next turn sees the page the next step would meet.
      lastActMoved = p.act === 'activate';
      if (p.act === 'enter') {
        await page.getByRole(element.role as 'textbox', { name: element.name, exact: true })
          .or(page.locator(`[name="${element.binding.name ?? ''}"]`)).first()
          .fill(inputs[p.value ?? ''] ?? '').catch(() => undefined);
      } else if (p.act === 'activate') {
        await page.getByRole(element.role as 'button', { name: element.name, exact: true }).first()
          .click().catch(() => undefined);
        await page.waitForLoadState('domcontentloaded').catch(() => undefined);
      }
    }
  } finally {
    await page.close();
    await browser.close();
  }

  return { steps, turns, questions };
}

/** A proposal becomes a step, with Orbit's binding rather than the model's. */
function makeStep(p: Proposal, element: Seen): Step | null {
  const id = crypto.randomUUID();
  const target = { label: element.labelledBy ?? element.name, binding: element.binding };

  if (p.act === 'enter') {
    if (!p.value) return null;
    return { id, kind: 'enter', summary: `${p.value}, into ${target.label}`,
      into: target, value: { from: 'input', value: p.value }, sensitive: false };
  }
  if (p.act === 'activate') {
    return { id, kind: 'activate', summary: element.name, control: target,
      then: { describe: 'the page moves on' }, changesARecord: false };
  }
  if (p.act === 'read') {
    if (!p.value) return null;
    return { id, kind: 'read', summary: `${target.label}, into ${p.value}`, region: target,
      produces: { name: p.value, label: target.label, type: 'text', required: !p.optional } };
  }
  return null;
}
