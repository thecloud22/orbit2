/**
 * Runs one authoring session against the underwriting portal and prints what
 * it produced, turn by turn. A person runs this; the product will run it from
 * the "bring in a procedure" screen.
 */
import { modelFromEnvironment } from '@orbit/model';
import { authorFromProcedure } from './author.ts';

const model = modelFromEnvironment();
console.log(`Authoring with ${model.provider} ${model.model}\n`);

const draft = await authorFromProcedure({
  procedure: [
    'Open the underwriting pipeline and search for the file using the loan number the requester gave us.',
    'If the file is there, record the note rate.',
    'If there is no such file, say so — that happens a lot, it is not an error.',
  ].join(' '),
  origin: 'http://localhost:4101',
  startPath: '/pipeline',
  inputs: { loanNumber: 'ML-26-04471' },
  model,
});

console.log('STEPS PROPOSED\n');
for (const [i, s] of draft.steps.entries()) {
  const b = (s as { region?: { binding?: { strategy?: string } }; into?: { binding?: { strategy?: string } };
                    control?: { binding?: { strategy?: string } } });
  const by = b.region?.binding?.strategy ?? b.into?.binding?.strategy ?? b.control?.binding?.strategy;
  console.log(`  ${i + 1}. ${s.kind.padEnd(9)} ${s.summary}${by ? `   [by ${by}]` : ''}`);
}

console.log('\nTURNS\n');
let cost = 0, nothing = 0;
for (const t of draft.turns) {
  cost += t.costMicros;
  if (t.verdict !== 'kept') nothing += 1;
  const mark = t.verdict === 'kept' ? ' ' : '!';
  console.log(`  ${mark} ${String(t.turn).padStart(2)}  ${t.verdict.padEnd(9)} ${t.why}`);
  if (t.answered) console.log(`        "${t.answered.why.slice(0, 96)}"`);
}

console.log(`\n  ${draft.turns.length} turns, ${nothing} produced nothing usable`);
console.log(`  $${(cost / 1e6).toFixed(6)} on ${model.model}`);
if (draft.questions.length) {
  console.log('\n  QUESTIONS, which block confirmation until answered:');
  for (const q of draft.questions) console.log(`    · ${q}`);
}
