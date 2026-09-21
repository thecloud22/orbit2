/**
 * One real call, doing the shape of work authoring needs: read a page as
 * structure, and say which control an instruction means.
 *
 * Not a ping. A 200 from the provider says the key works; it says nothing
 * about whether the configured model can hold the task.
 */
import { z } from '@orbit/contract';
import { modelFromEnvironment, priceFor } from './index.ts';

const proposal = z.object({
  control: z.string(),
  strategy: z.enum(['roleAndName', 'label', 'formName', 'text', 'structural']),
  role: z.string().nullable(),
  why: z.string(),
});

const shape = {
  type: 'object',
  properties: {
    control: { type: 'string' },
    strategy: { type: 'string', enum: ['roleAndName', 'label', 'formName', 'text', 'structural'] },
    role: { type: ['string', 'null'] },
    why: { type: 'string' },
  },
  required: ['control', 'strategy', 'role', 'why'],
  additionalProperties: false,
};

const model = modelFromEnvironment();
console.log(`provider=${model.provider} model=${model.model}`);

// Said before the call, not after. Whether a rate is held is the one thing
// this can answer without spending anything, and finding out afterwards means
// finding out from a session whose cost is already recorded as unknown.
const rate = priceFor(model.model);
console.log(rate
  ? `rate: $${rate.in}/M in, $${rate.out}/M out\n`
  : `rate: NONE HELD — every session on this model will record its cost as unknown.\n`
    + `      Add it to PRICE in packages/model/src/index.ts.\n`);

const answered = await model.propose(
  {
    purpose: 'map an instruction to a control',
    instruction:
      'You are shown a web page as an accessibility tree. The author wrote an instruction. '
      + 'Say which single control on the page that instruction means, and how you would find it again. '
      + 'Use roleAndName when the element has a role and an accessible name. Answer only with the schema.',
    shown: [
      'INSTRUCTION: "type the loan number into the search box"',
      '',
      'PAGE:',
      '  heading "Underwriting pipeline"',
      '  text "Open a file by loan number"',
      '  textbox "Open a file by loan number"',
      '  button "Open file"',
      '  table:',
      '    columnheader "Loan number"',
      '    columnheader "Borrower"',
      '    cell "ML-26-04471"',
    ].join('\n'),
  },
  proposal, shape,
);

if (answered.value) {
  console.log('  kept:', JSON.stringify(answered.value, null, 2).split('\n').join('\n  '));
} else {
  console.log('  nothing usable —', answered.refusedBecause);
}
console.log(`\n  answered by: ${answered.model}`);
console.log(`  tokens: ${answered.tokensIn} in, ${answered.tokensOut} out`);
console.log(`  cost: ${answered.costUnknown ? 'not known — no rate held for this model'
  : `$${(answered.costMicros / 1e6).toFixed(6)}`}`);
