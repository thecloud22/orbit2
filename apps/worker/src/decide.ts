/**
 * The confirmed rule tables, compiled into the draft (Orbit 2.1-d and f).
 *
 * A walk follows the one path its example takes, so a procedure that decides
 * — decline, refer, or approve — was drafted as the example's path and nothing
 * else. The confirmed tables already hold the whole decision. Orbit builds it
 * from them, without a model: each row's conditions become branches in the
 * order the procedure gives them, and each row's action follows. A model is
 * asked one thing per table: which value the walk read is each column, and
 * which control on the page carries out each action. Both answers are checked
 * — a value from the list of what was read, a control that is on the page
 * exactly once — or the table is not compiled and a person is asked.
 *
 * How the rows behave, stated so it can be checked against a procedure:
 *  - a row whose action ends the procedure (decline, refer) is exclusive: when
 *    its conditions hold it acts and finishes under its own conclusion;
 *  - a row whose action does not end it (attach a condition) adds its action
 *    and carries on to the next row;
 *  - `otherwise` runs after the rows, unless a row ended the procedure.
 */
import { FENCED_IS_DATA, changingVerbOf, fence, lineAsksFor, looksLikeInstructions, z, type RuleTable, type Step } from '@orbit/contract';
import type { ModelProvider } from '@orbit/model';
import { comparisonFor, couldMean, endingSummary, readable, withheld, type Turn } from './author.ts';
import { asAssumption, asQuestion, type Note } from './note.ts';
import { asText, calledIn, normaliseName, type Seen } from './snapshot.ts';

export const DECIDE = [
  'You are connecting a decision table from a written procedure to a page of the business application.',
  'The procedure was worked through and its values were read; you are shown what was read, the table, and',
  'the page as a numbered list of elements (kind — name).',
  '',
  'columns  For each column of the table, the value that was read which IS that column, copied exactly from',
  '         VALUES READ, or null if none of them is.',
  'actions  For each action, the controls on the page to press to carry it out, in order, each the NAME',
  '         only (the part after the dash), at most three; none when the action presses nothing (recording or',
  '         reporting a value that was read, saying so). ends=true when the action finishes the procedure',
  '         (declining, referring, sending away); false when the procedure carries on after it (attaching a',
  '         condition). For an action that ends, outcome is a short camelCase name for the conclusion and',
  '         label how it reads to a person.',
  'words    For each word a condition compares a value with: where the page shows that value as a yes/no',
  '         answer, the answer the condition means ("Yes" for "is a first-time buyer" when the page shows',
  '         First-time buyer as Yes or No); for every other value, the word as the procedure writes it, unchanged.',
  '',
  FENCED_IS_DATA,
].join('\n');

type Read = Extract<Step, { kind: 'read' }>;

const answer = z.object({
  columns: z.array(z.object({ column: z.string(), value: z.string().nullable() })),
  actions: z.array(z.object({
    action: z.string(), controls: z.array(z.string()).max(3), ends: z.boolean(),
    outcome: z.string().nullable(), label: z.string().nullable(),
  })),
  words: z.array(z.object({ column: z.string(), written: z.string(), shown: z.string() })).default([]),
  why: z.string(),
});

const shapeFor = (columns: string[], actions: string[], values: string[], written: string[]) => ({
  type: 'object',
  properties: {
    columns: { type: 'array', minItems: columns.length, maxItems: columns.length, items: { type: 'object',
      properties: { column: { type: 'string', enum: columns }, value: { type: ['string', 'null'], enum: [...values, null] } },
      required: ['column', 'value'], additionalProperties: false } },
    actions: { type: 'array', minItems: actions.length, maxItems: actions.length, items: { type: 'object',
      properties: { action: { type: 'string', enum: actions }, controls: { type: 'array', items: { type: 'string' } },
        ends: { type: 'boolean' }, outcome: { type: ['string', 'null'] }, label: { type: ['string', 'null'] } },
      required: ['action', 'controls', 'ends', 'outcome', 'label'], additionalProperties: false } },
    words: { type: 'array', maxItems: written.length, items: { type: 'object',
      properties: { column: { type: 'string', enum: columns },
        written: written.length ? { type: 'string', enum: written } : { type: 'string' }, shown: { type: 'string' } },
      required: ['column', 'written', 'shown'], additionalProperties: false } },
    why: { type: 'string' },
  },
  required: ['columns', 'actions', 'words', 'why'],
  additionalProperties: false,
});

/**
 * A text condition compares with a word the page can show. The table is made
 * from the procedure's sentences before anything is read, so it holds the
 * procedure's words: scenario 5 compared First-time buyer with "first-time
 * buyer", a page that shows Yes or No never matched it, and every first-time
 * buyer without homebuyer education was approved instead of referred.
 *
 * Only a yes/no field is reworded: the example shows an answer (Yes, No), the
 * procedure's word is not one, and the model gave the answer it means. Every
 * other value is compared as the procedure writes it. A first version also took
 * any rewording equal to the value the example showed, and the model turned
 * "anything other than X" into "anything other than AE" — the example's own
 * flood zone, which the page always shows, so it proved nothing.
 */
const ANSWERS = [['yes', 'no'], ['true', 'false'], ['y', 'n']];
export function asThePageWritesIt(written: string, shown: string | undefined, example: string | undefined):
  { word: string; taken: boolean; unsure: boolean } {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const answers = example === undefined ? undefined : ANSWERS.find((pair) => pair.some((w) => same(w, example)));
  if (!answers || !shown || same(shown, written) || answers.some((w) => same(w, written))) {
    return { word: written, taken: false, unsure: false };
  }
  if (answers.some((w) => same(w, shown))) return { word: shown.trim(), taken: true, unsure: false };
  return { word: written, taken: false, unsure: true };
}

/** A table the absence check already handles: every row is "the record is not there". */
const onlyAbsence = (t: RuleTable) => t.rows.every((r) => r.when.length === 1 && r.when[0]!.is === 'isAbsent');

export async function compileTables(opts: {
  tables: readonly RuleTable[];
  steps: Step[];
  provenance: Record<string, string>;
  /** Every sentence number, in the procedure's order. */
  order: readonly string[];
  seen: Seen[];
  pageUrl: string;
  model: ModelProvider;
  firstTurn: number;
  /**
   * Across applications (Orbit 2.2): the application these tables' controls
   * are on. Where the run has focus on another at the point a table goes in,
   * the table opens its own first and, when the procedure carries on after
   * it, goes back — the steps after were drafted on that one's screen.
   */
  on?: { application: string; path: string };
}): Promise<{ steps: Step[]; turns: Turn[]; questions: Note[]; compiled: number }> {
  const turns: Turn[] = [];
  const questions: Note[] = [];
  const at = (n: string) => opts.order.indexOf(n);
  let steps = [...opts.steps];
  let compiled = 0;

  for (const table of opts.tables.filter((t) => !onlyAbsence(t))) {
    const reads = steps.filter((x): x is Read => x.kind === 'read');
    const values = reads.map((r) => r.produces.name);
    const actionsSaid = [...new Set([...table.rows.map((r) => r.then), ...(table.otherwise ? [table.otherwise.then] : [])])];
    const written = [...new Set(table.rows.flatMap((r) => r.when
      .filter((w) => (w.is === 'is' || w.is === 'isNot') && w.value).map((w) => w.value!)))];
    const asking = `Connect "${table.question}" to the page.`;

    type Answer = z.infer<typeof answer>;
    type Act = { steps: Step[]; ends: boolean; outcome: string; label: string };
    let answered!: Awaited<ReturnType<typeof opts.model.propose<Answer>>>;
    let said: Answer | null = null;
    let problems: string[] = [];
    let valueOf = new Map<string, Read>();
    let acts = new Map<string, Act>();
    let reworded: Array<{ label: string; written: string; shown: string; taken: boolean; example: string | undefined }> = [];
    let comparisons: Array<Array<ReturnType<typeof comparisonFor> | { of: 'absence'; operator: 'isAbsent'; left: { from: 'step'; value: string } } | null>> = [];
    const record = (verdict: Turn['verdict'], why: string) => turns.push({
      turn: opts.firstTurn + turns.length, shown: { page: opts.pageUrl, elements: opts.seen.length, asking },
      answered: said as never, verdict, why, model: answered.model, provider: answered.provider,
      tokensIn: answered.tokensIn, tokensOut: answered.tokensOut,
      tokensCached: answered.tokensCached, tokensCacheWritten: answered.tokensCacheWritten,
      costMicros: answered.costUnknown ? null : answered.costMicros,
    });


    // Asked twice at most: a first answer that leaves an action out or names
    // something not on the page is told what was wrong, as the sort is.
    let correction = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      answered = await opts.model.propose(
        { purpose: 'connect a rule table', instruction: DECIDE,
          shown: [
            `VALUES READ: ${reads.map((r) => `${r.produces.name} (${r.produces.label})`).join(', ') || 'none'}`, '',
            'TABLE:', fence('PROCEDURE', [
              `QUESTION: ${table.question}`,
              `COLUMNS: ${table.columns.map((c) => `${c.name} (${c.label})`).join(', ')}`,
              ...table.rows.map((r, i) => `ROW ${i + 1}: when ${r.when.map((w) => `${w.column} ${w.is} ${w.value ?? ''}`.trim()).join(' and ')} → ${r.then}`),
              ...(table.otherwise ? [`OTHERWISE → ${table.otherwise.then}`] : []),
              `ACTIONS: ${actionsSaid.map((a) => `"${a}"`).join(', ')}`].join('\n')), '',
            `PAGE (${opts.pageUrl}):`, fence('PAGE', asText(withheld(opts.seen))), '', asking,
            ...(correction ? ['', correction] : [])].join('\n') },
        answer, shapeFor(table.columns.map((c) => c.name), actionsSaid, values, written));

      problems = [];
      said = answered.value;
      valueOf = new Map<string, Read>();
      // Which value a column is matters only if the table presses something.
      // "If the file is there, record the note rate; if not, say so" presses
      // nothing — the walk's reads and endings already carry it — and was
      // refused because "file is there" is not a value anybody reads.
      const pressesNothing = Boolean(said) && actionsSaid.every((a) => said!.actions.find((x) => x.action === a)?.controls.length === 0);
      for (const c of table.columns) {
        const named = said?.columns.find((x) => x.column === c.name)?.value;
        const read = reads.find((r) => r.produces.name === named);
        if (read) valueOf.set(c.name, read);
        else if (!pressesNothing) problems.push(`no value that was read is "${c.label}"`);
      }
      acts = new Map();
      for (const action of actionsSaid) {
        const a = said?.actions.find((x) => x.action === action);
        if (!a) { problems.push(`nothing was said about "${action}"`); continue; }
        const made: Step[] = [];
        for (const control of a.controls) {
          const wanted = normaliseName(control);
          const named = opts.seen.filter((s) => !looksLikeInstructions(s.name) && calledIn(s) === wanted && couldMean('activate', s));
          if (named.length !== 1) {
            problems.push(named.length === 0 ? `"${control}" is not something on the page that can be pressed`
              : `"${control}" is on the page ${named.length} times, so it names neither`);
            continue;
          }
          const e = named[0]!;
          // The control must be one the action asks for: "Decline file" for
          // "decline the file", never whatever the page suggested.
          if (!lineAsksFor(e.name, action)) {
            problems.push(`"${e.name}" is not what "${action}" asks for`);
            continue;
          }
          made.push({ id: crypto.randomUUID(), kind: 'activate', summary: e.name,
            control: { label: e.labelledBy ?? e.name, binding: e.binding },
            then: { describe: 'the page moves on' },
            // Pressing a control that carries out a rule's action is taken to
            // commit something: approving, declining and referring all do.
            changesARecord: true });
        }
        // An action that asks for something to be done on the page must press
        // something, unless a step the walk already made does it. Scenario 6:
        // "attach the condition requiring private mortgage insurance" came
        // back naming no control, and was built as a row that matched every
        // condominium over 80% and did nothing to it. Scenario 11's "otherwise,
        // approve the file" names nothing, rightly: the walk's own "Approve
        // file" step follows the table, and pressing it here as well left that
        // step unreachable.
        const doneByAStep = steps.some((x) => x.kind === 'activate' && changingVerbOf(x.summary) && lineAsksFor(x.summary, action));
        if (a.controls.length === 0 && changingVerbOf(action) && !doneByAStep) {
          problems.push(`"${action}" asks for something to be done on the page, and names nothing to press`);
        }
        const outcome = a.outcome && /^[a-z][a-zA-Z0-9]*$/.test(a.outcome) ? a.outcome : null;
        if (a.ends && !outcome) problems.push(`"${action}" ends the procedure and has no name for that conclusion`);
        acts.set(action, { steps: made, ends: a.ends, outcome: outcome ?? '', label: endingSummary(a.label?.trim() || action) });
      }

      // Every condition must become a comparison Orbit can carry out.
      reworded = [];
      comparisons = table.rows.map((r) => r.when.map((w) => {
        const read = valueOf.get(w.column);
        if (!read) return null;
        if (w.is === 'isAbsent' || w.is === 'isPresent') {
          return { of: 'absence' as const, operator: (w.is === 'isAbsent' ? 'isAbsent' : 'isNotAbsent') as 'isAbsent',
            left: { from: 'step' as const, value: read.produces.name } };
        }
        let than = withoutUnit(w.value ?? '', read.produces.type);
        if (read.produces.type === 'text' && (w.is === 'is' || w.is === 'isNot') && w.value) {
          const shown = said?.words.find((x) => x.column === w.column && x.written === w.value)?.shown;
          const example = opts.seen.find((e) => e.what === 'value'
            && normaliseName(calledIn(e)).toLowerCase() === read.region.label.toLowerCase())?.name;
          const page = asThePageWritesIt(w.value, shown, example);
          than = withoutArticle(page.word, 'text');
          if (page.taken || page.unsure) reworded.push({ label: read.produces.label, written: w.value, shown: shown!, taken: page.taken, example });
        }
        const made = comparisonFor({ value: read.produces.name, is: w.is, than }, read.produces);
        if (!made) problems.push(`"${read.produces.label} ${readable(w.is)} ${w.value}" is not a comparison Orbit can carry out`);
        return made;
      }));
      if (said && !problems.length) break;
      if (attempt === 0) {
        record(said ? 'rejected' : 'discarded', said ? problems.join('; ') : (answered.refusedBecause ?? 'no answer'));
        correction = `Your last answer could not be used: ${said ? problems.join('; ') : 'it was not an answer'}. Answer again, `
          + 'saying something about every action and naming only controls that are on the page.';
      }
    }

    // A table none of whose actions presses anything decides nothing the
    // walk's reads and endings have not already covered.
    if (said && !problems.length && [...acts.values()].every((a) => a.steps.length === 0)) {
      record('kept', `"${table.question}" presses nothing, so there is nothing to build`);
      continue;
    }
    if (!said || problems.length) {
      record(said ? 'rejected' : 'discarded', said ? problems.join('; ') : (answered.refusedBecause ?? 'no answer'));
      questions.push(asQuestion(`Orbit could not build "${table.question}" (${table.sentences.join(', ')}) into the steps: `
        + `${said ? problems.join('; ') : 'the model gave no usable answer'}. Those rules are not in the draft yet.`));
      continue;
    }

    // Where the table goes: before the first step drafted from a sentence
    // that comes after the table's last sentence, or before the final ending.
    const last = Math.max(...table.sentences.map(at));
    let insertAt = steps.findIndex((x) => opts.provenance[x.id] !== undefined && at(opts.provenance[x.id]!) > last);
    if (insertAt === -1) insertAt = steps.map((x) => x.kind === 'end').indexOf(true);
    if (insertAt === -1) insertAt = steps.length;
    // The final ending, or the "not found" check, is never displaced by a table.
    const before = steps.slice(0, insertAt);
    const after = steps.slice(insertAt);
    const readBefore = before.flatMap((x) => (x.kind === 'read' ? [x.produces.name] : []));
    type Open = Extract<Step, { kind: 'open' }>;
    const focus = [...before].reverse().find((x): x is Open => x.kind === 'open');
    const switching = opts.on && (focus?.application ?? 'app') !== opts.on.application ? opts.on : null;
    const into: Open | null = switching ? { id: crypto.randomUUID(), kind: 'open', summary: `Go to ${switching.application} for "${table.question}"`,
      application: switching.application, path: switching.path, arrives: { describe: 'the application is showing' }, changesARecord: false } : null;
    const back: Open | null = switching && focus && after.some((x) => x.kind !== 'end')
      ? { id: crypto.randomUUID(), kind: 'open', summary: `Back to ${focus.application}`, application: focus.application, path: focus.path,
          arrives: { describe: 'the application is showing' }, changesARecord: false } : null;

    const block: Step[] = [];
    const rowEntry: string[] = table.rows.map(() => crypto.randomUUID());
    const AFTER = `after-${crypto.randomUUID()}`;
    const otherwise = table.otherwise ? acts.get(table.otherwise.then)! : null;
    const afterRows = otherwise?.steps[0]?.id ?? AFTER;
    table.rows.forEach((row, i) => {
      const conds = comparisons[i]!;
      const ids = conds.map((_, j) => (j === 0 ? rowEntry[i]! : crypto.randomUUID()));
      const act = acts.get(row.then)!;
      const actSteps = act.steps.map((x) => ({ ...x, id: crypto.randomUUID() }));
      const next = i + 1 < table.rows.length ? rowEntry[i + 1]! : afterRows;
      conds.forEach((when, j) => block.push({
        id: ids[j]!, kind: 'branch',
        summary: `${table.question} Row ${i + 1}: ${row.when[j]!.column} ${readable(row.when[j]!.is)} ${row.when[j]!.value ?? ''}`.trim(),
        when: when!, ifTrue: j + 1 < ids.length ? ids[j + 1]! : (actSteps[0]?.id ?? next), ifFalse: next,
      }));
      for (const [k, x] of actSteps.entries()) { opts.provenance[x.id] = row.sentence; block.push(x); void k; }
      if (act.ends) {
        block.push({ id: crypto.randomUUID(), kind: 'end', summary: act.label, outcome: act.outcome, publishes: readBefore });
      }
    });
    if (otherwise) {
      for (const x of otherwise.steps) { if (table.otherwise?.sentence) opts.provenance[x.id] = table.otherwise.sentence; block.push(x); }
      // An "otherwise" that presses nothing concludes without doing anything,
      // so it ends the procedure only where nothing else follows the table.
      // Scenario 10's table said "otherwise, no PMI condition" and ended there:
      // placed after ATTACH PMI, it caught every file that needed PMI before
      // it was approved.
      const goesOn = after.some((x) => x.kind !== 'end');
      if (otherwise.ends && (otherwise.steps.length > 0 || !goesOn)) {
        block.push({ id: crypto.randomUUID(), kind: 'end', summary: otherwise.label, outcome: otherwise.outcome, publishes: readBefore });
      }
    }

    if (into) block.unshift(into);
    if (back) block.push(back);
    steps = [...before, ...block, ...after];
    const afterId = after[0]?.id;
    // Inserted before a step, so it is also inserted before every jump to that
    // step: a later table placed ahead of an earlier table's "otherwise" was
    // being jumped straight past.
    if (afterId) {
      const inBlock = new Set(block.map((x) => x.id));
      for (const x of steps) {
        if (x.kind !== 'branch' || inBlock.has(x.id)) continue;
        if (x.ifTrue === afterId) x.ifTrue = block[0]!.id;
        if (x.ifFalse === afterId) x.ifFalse = block[0]!.id;
      }
    }
    for (const x of steps) {
      if (x.kind !== 'branch') continue;
      if (x.ifTrue === AFTER || x.ifFalse === AFTER) {
        if (!afterId && !back) { problems.push('nothing follows the table'); break; }
        const resume = back?.id ?? afterId!;
        if (x.ifTrue === AFTER) x.ifTrue = resume;
        if (x.ifFalse === AFTER) x.ifFalse = resume;
      }
    }
    compiled += 1;
    for (const r of [...new Map(reworded.map((x) => [`${x.label}|${x.written}`, x])).values()]) {
      questions.push(r.taken
        ? asAssumption(`"${r.written}" in "${table.question}" is compared as "${r.shown}", the way the page writes ${r.label}.`,
          `Taken from the page, which showed ${r.label} as "${r.example}". Check it reads as the procedure means.`)
        : asQuestion(`"${table.question}" compares ${r.label} with "${r.written}", as the procedure writes it. `
          + `The page may write it as "${r.shown}", but the example showed ${r.example ? `"${r.example}"` : 'no value'}, so Orbit could not tell. What does the page show?`));
    }
    record('kept', `"${table.question}": ${table.rows.length} row${table.rows.length === 1 ? '' : 's'}`
      + `${table.otherwise ? ' and otherwise' : ''}, from ${table.sentences.join(', ')}`);
    questions.push(asAssumption(
      `"${table.question}" is built from the rules as confirmed (${table.sentences.join(', ')}): rows are tried in order; a row that ends the procedure decides it, a row that does not adds its action and carries on${table.otherwise ? ', and otherwise follows' : ''}.`,
      'Taken from the confirmed table. Check each branch against the procedure.'));
  }
  return { steps: withoutUnreachableEndings(steps), turns, questions, compiled };
}

/**
 * An ending nothing can reach is dropped. When a table's rows and its
 * "otherwise" each finish the procedure, the ending the walk put at the end
 * is never reached, and publication rightly refuses an outcome no run could
 * report. Only endings are dropped: anything else unreachable is a fault a
 * person should see, and publication names it.
 */
function withoutUnreachableEndings(steps: Step[]): Step[] {
  const index = new Map(steps.map((x, i) => [x.id, i]));
  const seen = new Set<number>();
  const queue = [0];
  while (queue.length) {
    const i = queue.pop()!;
    if (seen.has(i) || i >= steps.length) continue;
    seen.add(i);
    const x = steps[i]!;
    if (x.kind === 'end' || (x.kind === 'handOff' && !x.waits)) continue;
    if (x.kind === 'branch') {
      for (const t of [x.ifTrue, x.ifFalse]) { const n = index.get(t); if (n !== undefined) queue.push(n); }
    } else queue.push(i + 1);
  }
  return steps.filter((x, i) => x.kind !== 'end' || seen.has(i));
}

/**
 * "a condominium", "an ARM": a kind of thing as a sentence names it. The page
 * writes the kind — Condominium — so the article is dropped from a text value.
 * Scenario 6's table compared Property type with "a condominium", the page
 * said Condominium, and two condominiums over 80% were approved without PMI.
 * Only "a" and "an", and only before a word: "The Villages" is a name, and a
 * grade of A is a value.
 */
export function withoutArticle(value: string, type: string): string {
  if (type !== 'text') return value;
  const m = /^\s*an?\s+(\S.*)$/i.exec(value);
  return m ? m[1]!.trim() : value;
}

/**
 * "6 months", "90 days": a number with the unit the procedure writes it in.
 * The page shows the number, so the unit is dropped — only where the value is
 * a number, and only a trailing word, never anything inside the figure.
 */
export function withoutUnit(value: string, type: string): string {
  if (type !== 'number') return value;
  const m = /^\s*([$£€]?\s?[\d,]*\.?\d+\s?%?)\s+[a-z][a-z ]*$/i.exec(value);
  return m ? m[1]!.trim() : value;
}
