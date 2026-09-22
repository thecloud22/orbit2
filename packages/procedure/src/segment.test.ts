/**
 * Two kinds of test. The invariant — Orbit never rewrites or loses the
 * author's words — is checked over every piece of real procedure text in this
 * repository, because a rule that holds on the fixtures it was written against
 * has not been shown to hold. The boundaries are checked on fixtures shaped
 * like the SOPs Orbit will actually be given.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { segment, type Segmented } from './segment.ts';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Nothing rewritten, nothing lost, nothing counted twice, nothing out of order. */
function assertKeepsEveryWord(source: string, found: Segmented[], what: string): void {
  let covered = 0;
  found.forEach((s, i) => {
    assert.equal(s.n, i + 1, `${what}: numbered from 1 without gaps`);
    assert.equal(s.text, source.slice(s.start, s.end), `${what} ${s.n}: the text as written`);
    assert.ok(s.text.length > 0 && s.text === s.text.trim(), `${what} ${s.n}: no surrounding space`);
    assert.ok(s.start >= covered, `${what} ${s.n}: in order and not overlapping`);
    assert.equal(source.slice(covered, s.start).trim(), '', `${what} ${s.n}: nothing skipped before it`);
    covered = s.end;
  });
  assert.equal(source.slice(covered).trim(), '', `${what}: nothing skipped at the end`);
}

const texts = (): Array<[string, string]> => {
  const read = (path: string) => readFileSync(join(repo, path), 'utf8');
  const quoted = (path: string) => [...read(path).matchAll(/'((?:Search|Open)[^']{40,})'/g)].map((m) => m[1]!);
  return [
    ['the Write It Out suite', read('docs/testing/testcases-01.md')],
    ['the 2.1 plan', read('docs/plans/2026-09-22-orbit-2.1-procedure-model.md')],
    ['the functional specification', read('docs/orbit-2.0-functional-specification.md')],
    ...quoted('apps/api/src/seed.ts').map((t): [string, string] => ['seed.ts', t]),
    ...quoted('apps/api/src/seed-executable.ts').map((t): [string, string] => ['seed-executable.ts', t]),
  ];
};

describe('Orbit never rewrites or loses the author\'s words', () => {
  for (const [what, source] of texts()) {
    test(what, () => {
      const found = segment(source);
      assert.ok(found.length > 0);
      assertKeepsEveryWord(source, found, what);
    });
  }

  test('with Windows line endings, tabs and stray space', () => {
    const source = '  Purpose\r\n\r\n\tLog in.  Search for the claim.\r\n - Call the requester \r\n';
    assertKeepsEveryWord(source, segment(source), 'mixed whitespace');
  });

  test('whitespace alone is no sentences at all', () => {
    assert.deepEqual(segment(''), []);
    assert.deepEqual(segment(' \n\t\n '), []);
  });
});

const texts_ = (source: string) => segment(source).map((s) => s.text);

describe('where one sentence ends and the next begins', () => {
  test('at a full stop, question or exclamation followed by a new sentence', () => {
    assert.deepEqual(texts_('Log into Claims Central. Search for the claim! Is it there? Say so.'),
      ['Log into Claims Central.', 'Search for the claim!', 'Is it there?', 'Say so.']);
  });

  test('not inside amounts, rates, section numbers or loan numbers', () => {
    assert.deepEqual(texts_('Refer anything over $10,000.00 to a lead. The rate is 6.375% here. See section 4.2.1 first. Open ML-26-04471.'),
      ['Refer anything over $10,000.00 to a lead.', 'The rate is 6.375% here.', 'See section 4.2.1 first.', 'Open ML-26-04471.']);
  });

  test('not after an abbreviation or an initial', () => {
    assert.deepEqual(texts_('Use a reference, e.g. The claim number. Ask Dr. Patel or J. Smith. Check file No. 5 today.'),
      ['Use a reference, e.g. The claim number.', 'Ask Dr. Patel or J. Smith.', 'Check file No. 5 today.']);
  });

  test('etc. can end a sentence', () => {
    assert.deepEqual(texts_('Collect letters, forms, etc. Then sign out.'),
      ['Collect letters, forms, etc.', 'Then sign out.']);
  });

  test('not at an ellipsis', () => {
    assert.deepEqual(texts_('Wait for the batch... Then check again.'), ['Wait for the batch... Then check again.']);
  });

  test('after a closing quote or bracket', () => {
    assert.deepEqual(texts_('Mark it "closed." Then tell the requester (by email.) Done.'),
      ['Mark it "closed."', 'Then tell the requester (by email.)', 'Done.']);
  });

  test('a lower-case word after a stop does not start a new sentence', () => {
    assert.deepEqual(texts_('Approve it, i.e. mark it approved. then stop.'), ['Approve it, i.e. mark it approved. then stop.']);
  });

  test('a hard-wrapped line break ends nothing', () => {
    const source = 'Sign in to Meridian Home Lending, then open loan ML-26-04471. If the\ncredit score is below 620, decline the file citing a low credit score;\notherwise approve it outright.';
    assert.deepEqual(texts_(source), [
      'Sign in to Meridian Home Lending, then open loan ML-26-04471.',
      'If the\ncredit score is below 620, decline the file citing a low credit score;\notherwise approve it outright.',
    ]);
  });
});

describe('the shape of a real SOP', () => {
  const sop = [
    'Claims Enquiry Procedure',
    '',
    'Purpose',
    'This procedure explains how to answer a claim status enquiry. It applies to all desks.',
    '',
    'Steps',
    '1. Log into Claims Central with your own account.',
    '2. Search for the claim using the number the requester gave. If there is no',
    '   such claim, say so. That happens a lot.',
    '3) Read the status and the outstanding amount',
    '- If the claim is closed, do not touch it',
    '• Pass it to the claims team with what you found.',
    '(a) Claims over $10,000.00 go to a team lead.',
    'Step 4: Record the outcome.',
    '',
    'Escalate the following:',
    'Disputed claims and anything from Legal.',
    '',
    '## B. Rules',
    '---',
    'If the claim was reopened within 30 days of',
  ].join('\n');
  const found = segment(sop);
  const by = (text: string) => found.find((s) => s.text === text);

  test('keeps every word', () => assertKeepsEveryWord(sop, found, 'the SOP'));

  test('titles and section names are headings', () => {
    for (const heading of ['Claims Enquiry Procedure', 'Purpose', 'Steps', '## B. Rules', '---']) {
      assert.equal(by(heading)?.kind, 'heading', heading);
    }
  });

  test('each step and bullet is its own, marker included, wrapped lines joined', () => {
    assert.equal(by('1. Log into Claims Central with your own account.')?.kind, 'item');
    assert.equal(by('2. Search for the claim using the number the requester gave.')?.kind, 'item');
    assert.equal(by('If there is no\n   such claim, say so.')?.kind, 'prose', 'the rest of a step is prose within it');
    assert.equal(by('That happens a lot.')?.kind, 'prose');
    assert.equal(by('3) Read the status and the outstanding amount')?.kind, 'item', 'a step needs no full stop');
    assert.equal(by('- If the claim is closed, do not touch it')?.kind, 'item');
    assert.equal(by('• Pass it to the claims team with what you found.')?.kind, 'item');
    assert.equal(by('(a) Claims over $10,000.00 go to a team lead.')?.kind, 'item');
    assert.equal(by('Step 4: Record the outcome.')?.kind, 'item');
  });

  test('a line ending in a colon introduces what follows', () => {
    assert.equal(by('Escalate the following:')?.kind, 'leadIn');
    assert.ok(by('Disputed claims and anything from Legal.'));
    assert.deepEqual(texts_('Fifty descriptions, written the way an author types one:\nplain language, specific enough.'),
      ['Fifty descriptions, written the way an author types one:\nplain language, specific enough.'],
      'a wrapped line that breaks after a colon carries on');
  });

  test('a part that stops mid-sentence says so, and only its last sentence', () => {
    const last = found.at(-1)!;
    assert.equal(last.text, 'If the claim was reopened within 30 days of');
    assert.equal(last.unterminated, true);
    assert.equal(found.filter((s) => s.unterminated).length, 1);
  });

  test('a step cut at a page break is unterminated; a step without a full stop is not', () => {
    assert.equal(segment('Steps\n2. Search the pipeline and open the').at(-1)!.unterminated, true);
    assert.equal(segment('Steps\n- Call the requester').at(-1)!.unterminated, false);
  });

  test('a heading straight after a finished sentence, as text from a PDF arrives', () => {
    const pdfText = 'It covers motor and home claims.\nBefore you start\nYou will need the claim number.\nProcedure\n1. Log in.';
    const found = segment(pdfText);
    assert.deepEqual(found.map((s) => [s.kind, s.text]), [
      ['prose', 'It covers motor and home claims.'], ['heading', 'Before you start'],
      ['prose', 'You will need the claim number.'], ['heading', 'Procedure'], ['item', '1. Log in.'],
    ]);
  });

  test('a part that ends properly, or on a step, is not unterminated', () => {
    assert.equal(segment('Log in. Search.').at(-1)!.unterminated, false);
    assert.equal(segment('Steps\n- Call the requester').at(-1)!.unterminated, false);
  });
});
