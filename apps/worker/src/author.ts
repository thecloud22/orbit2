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
import { asQuestion, type Note } from './note.ts';
import { asNumber } from './compare.ts';
import { asText, asValueName, calledIn, normaliseName, snapshot, type Seen } from './snapshot.ts';

/**
 * What the walk types into a field, taken from the step it just built.
 *
 * It used to be `inputs[p.value] ?? ''` — the author's example values, looked
 * up by whatever the model called the value. Three of the four kinds of thing
 * a step can carry are not in that map and never could be, so all three typed
 * an empty string:
 *
 *   A password. There is no example for one and there must not be, so the
 *   sign-in typed nothing into a required field, the browser refused the
 *   submit, and the walk sat on the login page for every remaining turn —
 *   mapping the rest of the procedure against a page it had never left.
 *
 *   The registered account, for the same reason.
 *
 *   A literal. A procedure naming the record it works on — "open the file
 *   ML-26-04502" — was looked up as `inputs["ML-26-04502"]`, so the loan
 *   number was never typed and the walk never reached the file.
 *
 * The step already says where its value comes from, and a walk that types what
 * the run will type is the only kind whose bindings mean anything. The
 * password is used here and nowhere else: what the step carries is the
 * credential's name.
 */
function toType(
  value: Extract<Step, { kind: 'enter' }>['value'],
  opts: { inputs: Record<string, string>; signsInAs?: string | null; signsInWith?: string | null },
): string {
  if (value.from === 'input') return opts.inputs[value.value] ?? '';
  if (value.from === 'account') return opts.signsInAs ?? '';
  if (value.from === 'secret') return opts.signsInWith ?? '';
  if (value.from === 'literal') {
    const l = value.literal;
    return l.type === 'text' ? l.text
      : l.type === 'number' ? String(l.number)
      : l.type === 'date' ? l.date
      : l.type === 'yesNo' ? (l.yesNo ? 'yes' : 'no')
      : '';
  }
  return '';
}

/**
 * Wait for the navigation a click causes, not for the document it is leaving.
 *
 * `waitForLoadState('domcontentloaded')` asks about the *current* document,
 * which has already loaded — so it returned at once, before the click's
 * navigation had begun, and the next turn mapped against the page the walk had
 * just left. On the portal's login page, whose submit handler assigns
 * `window.location.href`, that meant a turn read the brand block off `/login`
 * and called it "the pipeline has loaded": kept as a step, no question raised,
 * and a draft declaring a conclusion it had never reached.
 *
 * The ceiling is what tells a click that navigates apart from one that only
 * redraws. Nothing distinguishes them in advance, and waiting on an address
 * that will never change has to end somewhere. Two seconds is long enough for
 * a local application and short enough that a dozen turns do not stall on it.
 */
export async function settleAfterActivating(page: Page, wasAt: string): Promise<void> {
  await page.waitForURL((u) => u.toString() !== wasAt, { timeout: 2000 }).catch(() => undefined);
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
}

/**
 * Whether an act could possibly have meant this element.
 *
 * Used twice, and the order matters. It narrows the candidates *before* they
 * are counted, so something the act can never touch does not compete for a
 * name — a heading "Sign in" above a button "Sign in" is one candidate, not an
 * ambiguity. And it is the mismatch check afterwards, so an act that names the
 * only thing carrying a name still has to suit it.
 *
 * Decision 12 is untouched: two buttons called "Sign in" remain a refusal.
 */
export function couldMean(act: 'enter' | 'activate' | 'read' | 'done', s: Pick<Seen, 'what'>): boolean {
  return act === 'enter' ? s.what === 'field'
    : act === 'activate' ? s.what === 'button' || s.what === 'link'
    : act === 'read' ? s.what === 'value' || s.what === 'heading'
    : true;
}

/** Why that act cannot touch that element, in the terms the page uses. */
export function mismatchOf(act: string, it: Pick<Seen, 'what' | 'name'>): string {
  return act === 'enter' ? `${it.what} "${it.name}" is not something a value goes into`
    : act === 'activate' ? `${it.what} "${it.name}" is not something that can be pressed`
    : `${it.what} "${it.name}" is not a value to read`;
}

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
  /**
   * Whether carrying this act out commits something.
   *
   * Asked rather than assumed. It was hardcoded false, so a step pressing
   * "Approve file" declared that it changed nothing, and the version it was
   * published into inherited the same claim — the run page then told a reader
   * "It changed: Nothing" about a run that approved a loan. §7 makes this the
   * flag that decides what authority a version needs, so getting it wrong is
   * not a display problem.
   *
   * It is a judgement about what a control means, which makes it a mapping
   * question, which makes it the model's (Decision 11). Orbit still checks it
   * against the kind of element: nothing that is merely read or typed into can
   * change a record.
   */
  changesARecord: z.boolean().nullable(),
  /**
   * The conditions the procedure puts on this act.
   *
   * Without this the model has no way to say "it depends", so asked "what is
   * next?" on a page with an Approve button it proposes pressing it — and the
   * thresholds in the procedure are silently dropped. A workflow that reads a
   * credit score, ignores it and approves the loan is not a misreading of the
   * text; it is the only sentence the vocabulary could form.
   *
   * Each condition names a value an earlier step already read. Orbit checks
   * that, builds the branches, and decides what happens when one does not
   * hold — the model supplies a comparison, never control flow.
   */
  onlyIf: z.array(z.object({
    value: z.string(),
    is: z.enum(['isMoreThan', 'isAtLeast', 'isLessThan', 'isAtMost', 'is', 'isNot']),
    than: z.string(),
  })).nullable(),
  why: z.string(),
});
type Proposal = z.infer<typeof proposal>;

/**
 * What the procedure's conclusions are called, asked once at the end.
 *
 * The walk maps the work; it cannot map the conclusions, because a conclusion
 * is a business fact and not something on a page. Orbit used to add a single
 * unnamed ending and ask a person what to call it — which was honest, and left
 * every authored workflow with one outcome no matter what the text said.
 *
 * A procedure that says "if the file is there, record the rate; if there is no
 * such file, say so" has two conclusions, and Decision 14 item 2 already makes
 * the difference expressible: a `read` that may legitimately find nothing
 * produces *absent*, and a branch may test for that. So the one thing Orbit
 * needs is which value's absence separates the two, and what each side is
 * called — a naming task, which is a mapping task, which is the model's job.
 *
 * Orbit builds the branch. The model never supplies a step, an id or an
 * operator; it supplies names and points at a value it has already produced,
 * and every part of that is checked before anything is built.
 */
const conclusions = z.object({
  /** The conclusion reached when the work completed as expected. */
  whenFound: z.object({ outcome: z.string(), label: z.string() }),
  /** The other conclusion, if the procedure describes one. Null when the text
   *  admits only one way to finish — which is a real answer, not a failure. */
  whenAbsent: z.object({ outcome: z.string(), label: z.string() }).nullable(),
  /**
   * Which produced value being absent means the second conclusion.
   *
   * Named for what it holds rather than for what it is for. It was
   * `absenceOf`, which reads as "the absence of <the second conclusion>", and
   * the model answered it with an outcome name almost every time — a field
   * name is the strongest hint a schema gives, and that one pointed the wrong
   * way.
   */
  missingValue: z.string().nullable(),
  why: z.string(),
});
type Conclusions = z.infer<typeof conclusions>;

const conclusionsShape = {
  type: 'object',
  properties: {
    whenFound: { type: 'object',
      properties: { outcome: { type: 'string' }, label: { type: 'string' } },
      required: ['outcome', 'label'], additionalProperties: false },
    whenAbsent: { type: ['object', 'null'],
      properties: { outcome: { type: 'string' }, label: { type: 'string' } },
      required: ['outcome', 'label'], additionalProperties: false },
    missingValue: { type: ['string', 'null'] },
    why: { type: 'string' },
  },
  required: ['whenFound', 'whenAbsent', 'missingValue', 'why'],
  additionalProperties: false,
};

const CONCLUDE = [
  'You are naming the ways a business procedure can finish.',
  'An outcome is a short camelCase name; a label is how it reads to a person.',
  'If the procedure describes only one way to finish, set whenAbsent and missingValue to null.',
  'If it describes a second way that happens when something is NOT there — no such file,',
  'no matching record — name that conclusion in whenAbsent.',
  '',
  'missingValue is NOT an outcome name. It is the name of one of the values listed under',
  'VALUES PRODUCED below — the one that would be missing when the second conclusion happens.',
  'Copy it exactly from that list. If none of them would be missing, set it to null.',
  'A second conclusion is not a failure. "There is no such file" is a correct result.',
].join('\n');

const shape = {
  type: 'object',
  properties: {
    act: { type: 'string', enum: ['enter', 'activate', 'read', 'done'] },
    element: { type: ['string', 'null'] },
    value: { type: ['string', 'null'] },
    optional: { type: ['boolean', 'null'] },
    changesARecord: { type: ['boolean', 'null'] },
    onlyIf: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        properties: {
          value: { type: 'string' },
          is: { type: 'string', enum: ['isMoreThan', 'isAtLeast', 'isLessThan', 'isAtMost', 'is', 'isNot'] },
          than: { type: 'string' },
        },
        required: ['value', 'is', 'than'],
        additionalProperties: false,
      },
    },
    why: { type: 'string' },
  },
  required: ['act', 'element', 'value', 'optional', 'changesARecord', 'onlyIf', 'why'],
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
  /**
   * What Orbit could not settle, each with the kind of thing it is.
   *
   * §4 treats the four differently — a question is answered, an assumption
   * confirmed, an exception decided, a risk acknowledged — and everything was
   * being filed as a question. A caution then arrived on the confirmation
   * screen with a text box under it and no answer that could go in it.
   */
  questions: Note[];
  /** Derived from the steps rather than proposed: an input is a value an
   *  `enter` step takes from outside, and nothing else can be one. */
  declaredInputs: Array<{ name: string; label: string; type: 'text'; required: true }>;
}

const INSTRUCTION = [
  'You are helping turn a written business procedure into a list of steps that a machine will replay exactly.',
  'You are shown a web page as a numbered list of elements, and the procedure.',
  'Answer with the ONE next thing to do, as the schema.',
  '',
  'act=enter   put a value into a field. element=the field. value=the name of the input it comes from.',
  'act=activate press a button or link. element=that control.',
  '            changesARecord=true when pressing it commits something a person would have to undo:',
  '            approving, declining, submitting, saving, sending. false for searching, opening, filtering.',
  '',
  'If the procedure only permits an act under conditions — a score above a number, a ratio',
  'below one — put every one of them in onlyIf. Each names a value an EARLIER step already read.',
  'Do not press a button the procedure conditions and leave onlyIf empty: that drops the condition.',
  'onlyIf is null when the procedure puts no condition on the act.',
  'act=read    take a value off the screen. element=the value. value=a short camelCase name for it.',
  '            Orbit binds a read to whatever labels the value, not to the value, so that the',
  '            step reads what the page says now rather than checking it still says what it said.',
  '            optional=true if the procedure says this may legitimately not be there.',
  'act=done    the procedure is finished, or the page does not show what comes next.',
  '',
  'Each line of the page is:   kind — name',
  'element = the NAME only, the part after the dash. Not the kind, not the whole line.',
  'Never give a web address.',
  '',
  'Rules that matter:',
  '- Where the procedure says to sign in — with any user ID, with your credentials, as yourself —',
  '  use the account named under SIGNS IN AS below, exactly as written. That is the account this',
  '  agent is registered to act as, and a sign-in as anyone else is not the procedure.',
  '  For the password field, give any value: the registered password is filled in and never stored.',
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
  /** What the application's registry calls its password, if it has one. A
   *  sign-in step names this; without it Orbit has no secret to refer to and
   *  will not invent one. */
  credentialName?: string | null;
  /** The account the registry says this application signs in as. A field
   *  given exactly this value is the sign-in, not something a run supplies. */
  signsInAs?: string | null;
  /** The registered password, for typing into the page during the walk and
   *  nothing else. It never reaches a step, a note, a turn or the store — the
   *  step a password field produces names the credential (§2). */
  signsInWith?: string | null;
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
  /** Conditions the procedure puts on a step, kept aside until the conclusions
   *  are known — the path a failed condition takes is a conclusion, and those
   *  are named at the end. */
  // `of` carries the whole declared value, type included: a comparison is
  // typed by what the read produces, not by what the threshold looks like.
  const guards = new Map<string, Array<{ value: string; is: string; than: string;
    of: { name: string; label: string; type: string } }>>();
  const turns: Turn[] = [];
  const questions: Note[] = [];

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

    let finished = false;
    let lastRejection: string | null = null;
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
        finished = true;   // said in its own words below; not the ceiling
        questions.push(asQuestion('The page stopped changing, so the rest of the procedure could not be worked out here.'));
        break;
      }
      const done = steps.slice(1).map((s, i) => `${i + 1}. ${s.kind} — ${s.summary}`);
      // A rejected turn used to tell the model nothing, so it answered the
      // same way again — and again, until the ceiling. One session spent ten
      // of its twelve turns on the identical rejection, and another repeated
      // "element: heading" twice because nobody said that "heading" is the
      // kind and not the name. Saying what was wrong with the last answer is
      // not conceding anything: Orbit still rejects, and still keeps the
      // rejection on the record. It just stops asking the same question of
      // somebody it has not told.
      const correction = lastRejection
        ? `Your last answer could not be used: ${lastRejection}. Do not answer the same way again.`
        : '';

      const asking = done.length === 0
        ? [correction, 'Nothing has been done yet. What is the first thing to do?'].filter(Boolean).join('\n\n')
        : [`ALREADY DONE (do not repeat any of these):`, ...done, '', correction,
           unchanged >= 1
             ? 'The page has NOT changed since your last act. Either something else is needed first, or the procedure is finished.'
             : '', 'What is the next thing to do?'].filter(Boolean).join('\n');

      const answered = await model.propose(
        {
          purpose: 'propose the next step',
          instruction: INSTRUCTION,
          shown: [`PROCEDURE:\n${procedure}`, '',
                  `DECLARED INPUTS: ${Object.keys(inputs).join(', ') || 'none'}`,
                  // The registry's answer to "who is this agent". Withholding
                  // it meant a procedure that says "sign in with any user ID"
                  // had no user ID to give: the walk typed an empty string
                  // into a required field, the form refused, and every
                  // remaining turn mapped the procedure against the login
                  // page. Orbit does not guess which field is the account —
                  // it supplies a registered fact and the model maps it, and
                  // an entry matching this becomes a reference to the
                  // registered account rather than a declared input.
                  `SIGNS IN AS: ${opts.signsInAs || 'nothing registered — do not invent an account'}`,
                  '', `PAGE (${page.url()}):`, asText(seen), '', asking].join('\n'),
        },
        proposal, shape,
      );

      // Every verdict passes through here, so the correction fed to the next
      // turn cannot fall out of step with the rejection on the record.
      const record = (verdict: Turn['verdict'], why: string): Turn => {
        lastRejection = verdict === 'kept' ? null : why;
        return {
          turn, shown: { page: page.url(), elements: seen.length, asking },
          answered: answered.value, verdict, why,
          model: answered.model, provider: answered.provider,
          tokensIn: answered.tokensIn, tokensOut: answered.tokensOut, costMicros: answered.costMicros,
        };
      };

      if (!answered.value) {
        // Not an error. A call that produced nothing usable is recorded,
        // metered and retried — and it is kept, because a record that drops
        // its own failures is not a record.
        turns.push(record('discarded', answered.refusedBecause ?? 'no answer'));
        continue;
      }

      const p = answered.value;
      if (p.act === 'done') {
        finished = true;
        // Finished, or gave up? The difference is whether the last thing it
        // tried worked. Test case 1 asked for three things: sign in, confirm
        // the pipeline loads, and note how many files await a decision. The
        // walk did the first two, failed to name anything for the third, and
        // then said it was finished — producing a draft with no step for that
        // clause and nothing at all to say so. A draft that quietly does less
        // than the procedure is the same failure as one that claims a
        // conclusion it never reached, arriving by a different door.
        if (lastRejection) {
          questions.push(asQuestion(
            `The last thing Orbit tried here could not be used — ${lastRejection} — and the procedure was`
            + ' reported finished straight afterwards. Check the steps below against everything you wrote:'
            + ' something it asks for may have no step.'));
        }
        turns.push(record('kept', 'the model said the procedure is finished'));
        break;
      }

      const wanted = normaliseName(p.element ?? '');
      if (!wanted) {
        // It answered with the kind — "heading", "button" — which
        // `normaliseName` strips, leaving nothing. Reported as `named ""`,
        // which reads to an author like a bug in Orbit rather than what it
        // is: the line's format is `kind — name`, and only the name was
        // asked for.
        turns.push(record('rejected',
          `it gave "${(p.element ?? '').trim() || 'nothing'}" as the element, which is a kind of thing rather than the name of one`));
        continue;
      }

      // Counted among the things the act could possibly have meant, not among
      // everything that happens to share the name.
      //
      // A login page has a heading "Sign in" above a button "Sign in". Both
      // carried the name, so an `activate` naming it was refused as ambiguous
      // — on every ordinary login page there is, which is every one of these
      // procedures. The check that knows a heading cannot be pressed already
      // existed; it ran on the single survivor, one step too late to stop the
      // heading competing for the name in the first place.
      //
      // This is not breaking a tie, which Decision 12 forbids. Two *buttons*
      // called "Sign in" are still a refusal. What changes is that something
      // the act could never have acted on is not a candidate.
      const carrying = seen.filter((s) => calledIn(s) === wanted);
      const named = carrying.filter((s) => couldMean(p.act, s));

      if (named.length === 0 && carrying.length > 0) {
        // The name was on the page, on something this act cannot touch. Said
        // as the mismatch it is rather than as "not on the page", which would
        // send an author looking for a control that is sitting right there.
        turns.push(record('rejected', mismatchOf(p.act, carrying[0]!)));
        continue;
      }
      if (named.length === 0) {
        // It named something it was not shown. Rejected, not retried into
        // existence: the session's record is evidence either way.
        turns.push(record('rejected', `named "${wanted}", which was not on the page`));
        questions.push(asQuestion(`At turn ${turn} the page did not offer what the procedure asked for.`));
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
      if (!couldMean(p.act, element)) {
        turns.push(record('rejected', mismatchOf(p.act, element)));
        continue;
      }

      const made = makeStep(p, element, procedure,
        { credentialName: opts.credentialName ?? null, signsInAs: opts.signsInAs ?? null });
      if (!made) {
        const why = element.secret
          ? `"${element.labelledBy ?? element.name}" takes a password and no credential is registered for this application`
          : `${p.act} needs a value and "${p.value ?? ''}" is neither a name nor anything the procedure says`;
        turns.push(record('rejected', why));
        if (element.secret) {
          questions.push(asQuestion(
            `This procedure signs in, and no credential is registered for the application. `
            + 'Register one first — a password is never something a run is given, and never something Orbit stores in a workflow.'));
        }
        continue;
      }

      // A literal is faithful to what was written and is rarely what somebody
      // wants forever: it fixes the agent to one record. Orbit does not guess
      // which — it does the faithful thing and asks.
      if (made.kind === 'enter' && made.value.from === 'literal') {
        // Asked so it can be answered, not so it can be filed.
        //
        // This used to offer a choice: "is that right, or is it an example of
        // something supplied each time?" An author answered "it's an example,
        // it should be an input variable" — and nothing happened. The answer
        // is recorded against the note and read by nothing; the step stays a
        // literal, and `workflow.declared_inputs` is written once when the
        // draft is made and never updated, so neither Orbit nor the author can
        // turn it into an input afterwards. The version published fixed to one
        // loan file, with the answer saying otherwise on its own record.
        //
        // Until confirmation can change a draft, the question does not offer
        // what cannot be done. It says what will happen and what to do instead,
        // and what to do instead is the thing that works: give the value as an
        // example on the way in, and the step becomes an input.
        questions.push(asQuestion(
          `The procedure names "${made.value.literal.type === 'text' ? made.value.literal.text : ''}" specifically, so every run of this agent will use that one record. `
          + 'If it should be different each time, bring the procedure in again with that value filled in under '
          + '"An example to work through" — Orbit declares an input for a value it is given an example of, '
          + 'and cannot add one afterwards.'));
      }

      // Conditions are checked against what has actually been read, before the
      // act is kept. A condition naming a value no step produces is not a
      // condition — and an act kept without the condition the procedure put on
      // it is worse than no act at all.
      const conditions = p.onlyIf ?? [];
      const readSoFar = new Map(steps.flatMap((x) => (x.kind === 'read' ? [[x.produces.name, x.produces]] : [])));
      const unknown = conditions.filter((c) => !readSoFar.has(c.value));
      if (unknown.length > 0) {
        turns.push(record('rejected',
          `it conditioned this on ${unknown.map((c) => `"${c.value}"`).join(', ')}, which no earlier step reads`));
        questions.push(asQuestion(`The procedure conditions "${made.summary}" on ${unknown.map((c) => c.value).join(', ')}, and no step reads that. What should be read first?`));
        continue;
      }

      // A value the run will supply, that this walk had nothing to supply.
      //
      // The walk types what the run will type, and when an author gives no
      // example for a declared input it types an empty string — then carries
      // on mapping whatever the page does in response. Test case 2 searched
      // the pipeline with an empty box, stayed on the list, and recorded a
      // step pressing a loan number that a real search would have navigated
      // past; it published, and the run halted on `controlNotFound`.
      //
      // Orbit cannot know which inputs a procedure will declare until the
      // model names them, so it cannot ask beforehand. It can say so at the
      // moment it happens, which is the step the rest of the walk hangs off.
      if (made.kind === 'enter' && made.value.from === 'input'
          && !(made.value.value in inputs)) {
        questions.push(asQuestion(
          `"${made.value.value}" is supplied when a run starts, and no example was given for it, so Orbit`
          + ' walked the rest of this procedure with that field left empty. The steps after it are whatever'
          + ' the application did with nothing in that box — check they are the ones a real value would produce.'));
      }

      steps.push(made);
      if (conditions.length > 0) guards.set(made.id, conditions.map((c) => ({ ...c, of: readSoFar.get(c.value)! })));
      turns.push(record('kept', conditions.length > 0
        ? `step ${steps.length}: ${made.summary}, only if ${conditions.map((c) => `${c.value} ${c.is} ${c.than}`).join(' and ')}`
        : `step ${steps.length}: ${made.summary}`));

      // Do it, so the next turn sees the page the next step would meet.
      lastActMoved = p.act === 'activate';
      if (p.act === 'enter' && made.kind === 'enter') {
        await page.getByRole(element.role as 'textbox', { name: element.name, exact: true })
          .or(page.locator(`[name="${element.binding.name ?? ''}"]`)).first()
          .fill(toType(made.value, opts)).catch(() => undefined);
      } else if (p.act === 'activate') {
        const wasAt = page.url();
        await page.getByRole(element.role as 'button', { name: element.name, exact: true }).first()
          .click().catch(() => undefined);
        await settleAfterActivating(page, wasAt);
      }
    }

    // The walk ran out of turns rather than reaching the end of the procedure.
    //
    // It used to fall out of this loop in silence. What followed then named a
    // conclusion from the steps it happened to have, so a session that was cut
    // off two steps into a sign-in produced a draft reading `open`, `enter`,
    // `enter`, `end: Pipeline loaded` — a conclusion it never reached, with
    // nothing on the record to say the walk had been truncated. A draft that
    // stops early is recoverable; one that stops early and looks finished is
    // the thing this product exists not to produce.
    if (!finished) {
      questions.push(asQuestion(
        `Orbit worked through ${maxTurns} turns without reaching the end of this procedure, so what is below is`
        + ' only as far as it got. Check it against what you wrote, and say what should happen after the last step.'));
    }
  } finally {
    await page.close();
    await browser.close();
  }

  // Every path has to reach an ending (§4), and the session has none: the
  // model proposed the work, not the conclusion. Orbit adds the ending and
  // asks what it is called, rather than inventing a name for a business
  // conclusion — which is exactly the kind of plausible interpretation the
  // product refuses to publish.
  if (!steps.some((s) => s.kind === 'end')) {
    const produced = steps.flatMap((s) => (s.kind === 'read' ? [s.produces] : []));
    const published = produced.map((v) => v.name);

    // Where a guarded step is, everything from it onwards happens only if the
    // conditions hold. The conditions are collected in the order they were
    // imposed; one branch each, and any that fails leaves the guarded path.
    const guardedAt = steps.findIndex((x) => guards.has(x.id));

    // One branch per distinct condition, not one per guarded step.
    //
    // A procedure that says "if the loan-to-value is over 80%, attach PMI
    // before approving" puts the same condition on both acts, so both carried
    // it and two identical branches were chained in front of them: the run
    // evaluated the same comparison twice and wrote the same decision to the
    // record twice, which reads as two checks rather than one. Different
    // conditions on the same value — at least this, at most that — are not
    // duplicates and both survive; only an exact repeat is dropped.
    const seenConditions = new Set<string>();
    const allConditions = (guardedAt === -1 ? []
      : steps.slice(guardedAt).flatMap((x) => guards.get(x.id) ?? []))
      .filter((c) => {
        const key = `${c.value}|${c.is}|${c.than}`;
        if (seenConditions.has(key)) return false;
        seenConditions.add(key);
        return true;
      });

    const answered = await model.propose(
      {
        purpose: 'name the conclusions',
        instruction: CONCLUDE,
        shown: [`PROCEDURE:\n${procedure}`, '',
                'THE STEPS THAT WERE MAPPED:',
                ...steps.map((s, i) => `${i + 1}. ${s.kind} — ${s.summary}`), '',
                `VALUES PRODUCED: ${produced.map((v) => `${v.name}${v.required ? '' : ' (may be absent)'}`).join(', ') || 'none'}`,
                '', 'How can this procedure finish?'].join('\n'),
      },
      conclusions, conclusionsShape,
    );
    const turn = turns.length + 1;
    const said = answered.value;
    const record = (verdict: Turn['verdict'], why: string): Turn => ({
      turn, shown: { page: 'the mapped steps', elements: steps.length, asking: 'How can this procedure finish?' },
      answered: said as unknown as Proposal, verdict, why,
      model: answered.model, provider: answered.provider,
      tokensIn: answered.tokensIn, tokensOut: answered.tokensOut, costMicros: answered.costMicros,
    });

    // Every part of the answer is checked before a step is built from it. The
    // model named things; it did not get to decide whether they hold together.
    const found = said ? normaliseName(said.whenFound.outcome) : '';
    const absent = said?.whenAbsent ? normaliseName(said.whenAbsent.outcome) : null;
    const separator = said?.missingValue ? produced.find((v) => v.name === said.missingValue) : undefined;

    const refusal =
      !said ? (answered.refusedBecause ?? 'the model gave no answer')
      : !found ? 'it did not name the conclusion the procedure reaches when the work is done'
      : said.whenAbsent && !absent ? 'it described a second conclusion without naming it'
      : said.whenAbsent && !said.missingValue ? 'it described a second conclusion without saying what distinguishes it'
      : said.missingValue && !separator
        ? `it named "${said.missingValue}" as the value that would be missing, and no step produces a value by that name`
      : separator && separator.required ? `"${separator.name}" is always present, so its absence cannot separate two conclusions`
      : absent && absent === found ? 'it gave both conclusions the same name, which names neither'
      : null;

    if (allConditions.length > 0) {
      // The procedure conditions an act, so the workflow has two ways to
      // finish: the conditions held, or one of them did not. Orbit puts a
      // branch in front of the guarded steps for each condition; the model
      // named the two conclusions and supplied the comparisons.
      const prefix = steps.slice(0, guardedAt);
      const guarded = steps.slice(guardedAt);

      const passEnd: Step = { id: crypto.randomUUID(), kind: 'end',
        summary: said?.whenFound.label || 'Finish — this conclusion has no name yet',
        outcome: found || 'unnamed', publishes: published };
      // The path that leaves before the guarded steps can only report what
      // was read before them.
      //
      // Both endings published every value the walk read, including ones read
      // after the guard — so test case 6, which reads the loan program while
      // deciding on it, was refused at publication: "Step 14 uses
      // loanProgram, which is not produced on every path that reaches it."
      // The gate was right and the draft was wrong. A conditional procedure
      // that reads anything after its condition could not be published at
      // all, and the author was sent to fix something Orbit had built.
      const beforeGuard = new Set(prefix.flatMap((x) => (x.kind === 'read' ? [x.produces.name] : [])));
      const failEnd: Step = { id: crypto.randomUUID(), kind: 'end',
        summary: said?.whenAbsent?.label || 'Finish — this conclusion has no name yet',
        outcome: absent || 'unnamedOtherwise',
        publishes: published.filter((v) => beforeGuard.has(v)) };

      // A condition Orbit cannot turn into a comparison is not quietly made
      // into one that can never hold. It is dropped and said.
      const buildable = allConditions.filter((c) => comparisonFor(c, c.of) !== null);
      for (const c of allConditions) {
        if (comparisonFor(c, c.of) !== null) continue;
        questions.push(asQuestion(
          `The procedure conditions this on ${c.of.label} ${readable(c.is)} "${c.than}", and ${c.of.label} is`
          + ` recorded as ${c.of.type}. Orbit could not make that a comparison it can carry out, so the`
          + ' condition is not on the steps below. Say it another way, or say what should be compared.'));
      }

      const ids = buildable.map(() => crypto.randomUUID());
      const branches: Step[] = buildable.map((c, i) => ({
        id: ids[i]!, kind: 'branch',
        summary: `Is ${c.of.label} ${readable(c.is)} ${c.than}?`,
        when: comparisonFor(c, c.of)!,
        // Each condition passes to the next; the last passes to the act it
        // guards. Any that fails leaves the guarded path entirely, which is
        // what "only when" means.
        ifTrue: i + 1 < ids.length ? ids[i + 1]! : guarded[0]!.id,
        ifFalse: failEnd.id,
      }));

      steps.length = 0;
      steps.push(...prefix, ...branches, ...guarded, passEnd, failEnd);

      turns.push(record(refusal ? 'rejected' : 'kept',
        `${allConditions.length} condition${allConditions.length === 1 ? '' : 's'} guard ${guarded.length} step${guarded.length === 1 ? '' : 's'}: `
        + allConditions.map((c) => `${c.value} ${readable(c.is)} ${c.than}`).join(' and ')));

      if (!found || !absent) {
        questions.push(asQuestion('What are the two ways this finishes called? A run reports the conclusion by name, and nothing may invent one.'));
      }
      // Orbit watched one path. Where the procedure says to *do* something on
      // the other — decline the file, send it back — it has not seen that act
      // and will not guess at it.
      if (guarded.some((x) => x.kind === 'activate' && x.changesARecord)) {
        questions.push(asQuestion('When the conditions do not hold, this reports the conclusion and takes no action. If something must be done instead, say what, and it can be recorded.'));
      }
    } else if (refusal || !said || !said.whenAbsent || !separator || !absent) {
      // One ending. Either the procedure has one, or the model's account of the
      // second did not hold — and a rejected answer still leaves a workflow
      // that works, with a question against it.
      steps.push({ id: crypto.randomUUID(), kind: 'end',
        summary: said?.whenFound.label || 'Finish — this conclusion has no name yet',
        outcome: found || 'unnamed', publishes: published });
      if (refusal) {
        turns.push(record('rejected', refusal));
        questions.push(asQuestion(`Orbit could not use the second conclusion it was offered, because ${refusal}. Is there more than one way this finishes?`));
      } else {
        turns.push(record('kept', `one conclusion: ${found}`));
      }
      if (!found) {
        questions.push(asQuestion('What should this be called when it finishes this way? A run reports the conclusion by name, and nothing may invent one.'));
      }
    } else {
      // Two conclusions, separated by whether a value the steps already produce
      // was there. Orbit writes the branch and both endings; the model supplied
      // four words and pointed at a value.
      const foundEnd: Step = { id: crypto.randomUUID(), kind: 'end',
        summary: said.whenFound.label, outcome: found, publishes: published };
      const absentEnd: Step = { id: crypto.randomUUID(), kind: 'end',
        summary: said.whenAbsent.label, outcome: absent,
        // Nothing is published on this path: the value it is defined by is the
        // one that was not there.
        publishes: published.filter((v) => v !== separator.name) };
      steps.push({
        id: crypto.randomUUID(), kind: 'branch',
        summary: `Did ${separator.label} turn out to be there?`,
        when: { of: 'absence', operator: 'isNotAbsent', left: { from: 'step', value: separator.name } },
        ifTrue: foundEnd.id, ifFalse: absentEnd.id,
      }, foundEnd, absentEnd);
      turns.push(record('kept', `two conclusions, separated by whether ${separator.name} was there: ${found} / ${absent}`));
    }
  }

  const declaredInputs = [...new Set(
    steps.flatMap((s) => (s.kind === 'enter' && s.value.from === 'input' ? [s.value.value] : [])),
  )].map((name) => ({ name, label: name, type: 'text' as const, required: true as const }));

  return { steps, turns, questions, declaredInputs };
}

/**
 * A value is found by what labels it, never by what it currently says.
 *
 * The snapshot names a value element by its own text, which is right for
 * showing the model what is on the page and wrong for binding a `read` to it.
 * A binding of `name: "6.375%"` searches for the rate that was there the day
 * the workflow was authored: it can only ever report what it looked for, and
 * the day the rate changes it finds nothing. Publication refuses this now
 * (`readIsCircular`); authoring should not produce it in the first place.
 *
 * The label goes down the `structural` rung — find the label, take what sits
 * beside it — corroborated by the tag, because Decision 15 measured that rung
 * confidently wrong 28 times in 54 and refuses it uncorroborated.
 */
function regionFor(element: Seen): { label: string; binding: unknown } {
  if (!element.labelledBy || !element.tag) {
    // Nothing labels it, so there is no non-circular way to name it. Left as
    // it is and refused at publication, rather than invented here: a binding
    // Orbit guessed is worse than one it declined to make.
    return { label: element.name, binding: element.binding };
  }
  return {
    label: element.labelledBy,
    binding: { strategy: 'structural', name: element.labelledBy,
               corroborate: { tag: element.tag } },
  };
}

/**
 * What an `enter` step puts in, from what the model called it.
 *
 * The model is asked for "the name of the input it comes from", and a
 * procedure does not always have one. *"Open the file ML-26-04502"* names the
 * record it works on, so the honest answer is the number itself — which is not
 * a name, and went straight into a field the contract requires to be a
 * camelCase identifier. The whole interpretation was then discarded with a
 * message about lower-case letters, which tells the author nothing they can
 * act on.
 *
 * Three readings, in order of how sure Orbit can be:
 *
 *   It is already a name        — an input, as asked for.
 *   It is in the procedure text — the author wrote that value, so it is a
 *                                 literal. Faithful to what was written, and
 *                                 a question is raised about whether it
 *                                 should have been an input.
 *   It is neither               — a label given where a name was wanted.
 *                                 Turned into one, or the turn is rejected.
 */
function valueToEnter(given: string, procedure: string): Extract<Step, { kind: 'enter' }>['value'] | null {
  const said = given.trim();
  if (/^[a-z][a-zA-Z0-9]{0,63}$/.test(said)) return { from: 'input', value: said };

  // Shaped like data *and* demonstrably written by the author. Both halves are
  // needed: "Loan Number" appears inside "enter the loan number" and is a
  // label, not a value, so containment alone would type the words "Loan
  // Number" into the field. A code has no spaces and carries a digit —
  // ML-26-04502, SR-4417, 6.375% — which is what tells the two apart.
  const looksLikeData = !/\s/.test(said) && /\d/.test(said);
  if (looksLikeData && procedure.toLowerCase().includes(said.toLowerCase())) {
    return { from: 'literal', literal: { type: 'text', text: said.slice(0, 4096) } };
  }

  const asName = asValueName(said);
  return asName ? { from: 'input', value: asName } : null;
}

/** How a condition reads to a person, in the words the procedure used. */
function readable(is: string): string {
  return is === 'isMoreThan' ? 'above' : is === 'isAtLeast' ? 'at least'
    : is === 'isLessThan' ? 'below' : is === 'isAtMost' ? 'at most'
    : is === 'isNot' ? 'not' : 'exactly';
}

/**
 * A condition becomes a comparison of a declared type.
 *
 * The type is settled by what the threshold is, not by what the read declared
 * — a read declares `text` because that is what a screen gives, and "700" is
 * the author saying they mean a number. A threshold that is not a number can
 * only be compared for equality, so an ordering operator against one is a
 * condition Orbit cannot carry out and does not pretend to.
 */
/**
 * A condition becomes a comparison, typed by the value rather than by the
 * threshold.
 *
 * This read only the threshold: anything that parsed as a number made a number
 * comparison. So a condition on the income analyst's note against "1" compared
 * a paragraph of prose to the number one, published, and halted the run with
 * `valueNotOfDeclaredType` — "was compared as a number, and it is not one".
 *
 * The read declares what it produces, and Orbit has that here. A value
 * declared as text is compared as text whatever the threshold looks like; a
 * value declared as a number needs a threshold that is one, and where it is
 * not there is no comparison to build — `null`, so the caller refuses the
 * condition rather than inventing one that cannot hold.
 */
function comparisonFor(
  c: { value: string; is: string; than: string },
  produces?: { type: string } | null,
): Extract<Step, { kind: 'branch' }>['when'] | null {
  const said = (c.than ?? '').trim();
  if (!said) return null;                     // a comparison against nothing

  const left = { from: 'step' as const, value: c.value };
  const n = asNumber(said);
  const declared = produces?.type;

  if (declared === 'number' || (declared === undefined && n !== null)) {
    if (n === null) return null;              // a number against something that is not one
    return { of: 'number', operator: c.is as 'isMoreThan',
      left, right: { from: 'literal', literal: { type: 'number', number: n } } };
  }
  // Text, and anything else Orbit does not yet compare as itself. Only `is`
  // and `isNot` are meaningful, which is what the contract allows for text —
  // "at least" against a sentence is not a comparison that can be carried out,
  // and turning it into equality would make a branch that can never hold.
  if (c.is !== 'is' && c.is !== 'isNot') return null;
  return { of: 'text', operator: c.is,
    left, right: { from: 'literal', literal: { type: 'text', text: said } } };
}

/** A proposal becomes a step, with Orbit's binding rather than the model's. */
function makeStep(p: Proposal, element: Seen, procedure: string,
  registry: { credentialName: string | null; signsInAs: string | null }): Step | null {
  const { credentialName, signsInAs } = registry;
  const id = crypto.randomUUID();
  const target = { label: element.labelledBy ?? element.name, binding: element.binding };

  if (p.act === 'enter') {
    if (!p.value) return null;

    // A password is never a declared input. Making one was how the
    // confirmation screen came to ask an author to type a password into a
    // text box, which would then be stored as an example, copied into the
    // version, and written to run.inputs in plain text on every run. §2: a
    // secret never appears in inputs.
    if (element.secret) {
      if (!credentialName) return null;
      return { id, kind: 'enter', summary: `A secret, into ${target.label}`,
        into: target, value: { from: 'secret', credential: credentialName }, sensitive: true };
    }

    // The account is the other half of the sign-in, and it is recognised the
    // same way the recorder recognises it: by the value being the one the
    // registry already holds. It is not a declared input — nobody starting a
    // run should be asked to type the service account's name, or able to
    // choose a different one.
    if (signsInAs && p.value.trim() === signsInAs.trim()) {
      return { id, kind: 'enter', summary: `The registered account, into ${target.label}`,
        into: target, value: { from: 'account' }, sensitive: false };
    }

    const supplied = valueToEnter(p.value, procedure);
    if (!supplied) return null;
    // What the step will read as: the literal itself, or the input's name.
    const puts = supplied.from === 'input' ? supplied.value : p.value;
    return { id, kind: 'enter', summary: `${puts}, into ${target.label}`,
      into: target, value: supplied, sensitive: false };
  }

  if (p.act === 'activate') {
    // Only something pressable can commit anything, so a claim about a field
    // or a value is discarded rather than trusted. Orbit verifies; the model
    // maps.
    const commits = p.changesARecord === true
      && (element.what === 'button' || element.what === 'link');
    return { id, kind: 'activate', summary: element.name, control: target,
      then: { describe: 'the page moves on' }, changesARecord: commits };
  }
  if (p.act === 'read') {
    if (!p.value) return null;
    const region = regionFor(element);
    // What kind of value this is, from what the page is showing.
    //
    // It was `text` for every read, so the declared type carried no
    // information — and a comparison typed by it made a text match out of
    // "credit score at least 700", which decided false against 794. Typing it
    // by the threshold instead is how a paragraph of prose came to be compared
    // to the number one. Neither guess is needed: the value is on the page,
    // and whether it is a number is a fact about it.
    const showing = element.what === 'value' ? element.name : '';
    return { id, kind: 'read', summary: `${region.label}, into ${p.value}`, region,
      produces: { name: p.value, label: region.label,
        type: asNumber(showing) !== null ? 'number' : 'text', required: !p.optional } };
  }
  return null;
}

/** Reached by tests only: the rules worth pinning without driving a browser. */
export const forTest = {
  toType, comparisonFor, valueToEnter };
