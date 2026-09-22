/**
 * The sort, measured against labels a person gave (2.1-h).
 *
 *   pnpm eval:sort                      every fixture in docs/testing/sort
 *   ORBIT_MODEL=<model> pnpm eval:sort  the same, against another model
 *
 * Calls the model named in the environment, so it costs money and is only run
 * when somebody asks for it; nothing in the test suite calls it. For each
 * procedure it prints agreement, every disagreement, what would not reach the
 * walk, the calls that produced nothing usable, and what the sort cost — the
 * evidence a change of model is decided on.
 *
 * A fixture is `<name>.txt`, the procedure as written, beside
 * `<name>.labels.json`, `{ "labels": { "1.1": "background", … } }`, labelled
 * by somebody who knows the procedure.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sentenceLabel, z, type SentenceLabel } from '@orbit/contract';
import { modelFromEnvironment } from '@orbit/model';
import { segment } from '@orbit/procedure';
import { sortSentences } from './sort.ts';
import { score } from './sort-score.ts';

const fixture = z.object({ labels: z.record(z.string(), sentenceLabel) }).passthrough();

const dir = process.argv[2] ?? 'docs/testing/sort';
const model = modelFromEnvironment();
console.log(`Sorting with ${model.provider} ${model.model}\n`);

let total = 0, agreed = 0, calls = 0, useless = 0, cost = 0, costUnknown = false;
const lost: string[] = [];

for (const file of readdirSync(dir).filter((f) => f.endsWith('.txt')).sort()) {
  const name = file.replace(/\.txt$/, '');
  const person = fixture.parse(JSON.parse(readFileSync(join(dir, `${name}.labels.json`), 'utf8'))).labels;
  const sentences = segment(readFileSync(join(dir, file), 'utf8'))
    .map((s) => ({ number: `1.${s.n}`, text: s.text, kind: s.kind }));

  const started = Date.now();
  const sorted = await sortSentences(sentences, model);
  const took = ((Date.now() - started) / 1000).toFixed(1);
  calls += sorted.turns.length;
  useless += sorted.turns.filter((t) => t.verdict !== 'kept').length;
  for (const t of sorted.turns) { if (t.costMicros === null) costUnknown = true; else cost += t.costMicros; }
  const spent = sorted.turns.reduce((n, t) => n + (t.costMicros ?? 0), 0);

  if (!sorted.ok) {
    console.log(`${name}: NOT SORTED after ${sorted.turns.length} calls — ${sorted.describe}\n`);
    continue;
  }
  const s = score(person, new Map(sorted.labels.map((l) => [l.sentence, l.label as SentenceLabel])));
  total += s.total; agreed += s.agreed; lost.push(...s.lostFromTheWalk.map((n) => `${name} ${n}`));

  console.log(`${name}: ${s.agreed} of ${s.total} agree (${pct(s.agreed, s.total)}), `
    + `${sorted.turns.length} call${sorted.turns.length === 1 ? '' : 's'}, ${took}s, $${(spent / 1e6).toFixed(5)}`);
  const text = new Map(sentences.map((x) => [x.number, x.text]));
  for (const d of s.disagreements) {
    console.log(`  ${d.sentence.padEnd(5)} person ${d.person.padEnd(10)} model ${d.model.padEnd(10)} ${text.get(d.sentence)?.slice(0, 70)}`);
  }
  console.log('');
}

console.log(`OVERALL: ${agreed} of ${total} agree (${pct(agreed, total)}); ${calls} calls, ${useless} produced nothing usable; `
  + (costUnknown ? `cost not known for ${model.model}` : `$${(cost / 1e6).toFixed(5)}`));
if (lost.length) console.log(`Would not reach the walk though the person marked them for Orbit: ${lost.join(', ')}`);

function pct(a: number, b: number) { return b === 0 ? '—' : `${Math.round((a / b) * 100)}%`; }
