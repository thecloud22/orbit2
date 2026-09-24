#!/usr/bin/env node
/**
 * The mortgage scenarios, run the way a person runs them (2.6): started on the
 * page with the systems picked, pasted in, sorted and drafted with nothing
 * confirmed and no relabelling, the example typed where Orbit asks for it,
 * published, and every loan run. Each loan's result is checked against what
 * the procedure says it should be.
 *
 *   node scripts/scenarios.mjs            both scenarios
 *   node scripts/scenarios.mjs 1          just scenario 1
 *
 * Needs the API, the worker and the mortgage portal running (scripts/orbit
 * start), and calls the model ORBIT_MODEL names, so it costs a few cents and is
 * run on purpose. It exists because fixes were being checked against the path
 * they were written for, with a relabel here and an answer there, and the
 * person using Orbit met the failures instead. Nothing here helps the run: if
 * a person would have had to intervene, the scenario fails.
 *
 * Checked by what the run did — the status, the ending, and which of the
 * decision's controls it pressed — not by the names a model gave the endings.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.ORBIT_API ?? 'http://localhost:4000';
const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'testing', 'scenarios');

const DECISIONS = ['Require private mortgage insurance', 'Require additional reserves', 'Require flood insurance',
  'Require two years of tax returns', 'Approve file', 'Refer to senior underwriter', 'Decline file',
  // The same decisions on the loan-servicing green screen (Orbit 2.2), and the swivel chair's two record-changing acts.
  'APPROVE', 'REFER', 'ATTACH PMI', 'ATTACH RESERVES', 'ATTACH FLOOD INS', 'ATTACH TAX RETURNS', 'SUBMIT', 'Save servicing account'];

const SCENARIOS = {
  1: {
    name: 'Scenario 1: mortgage insurance and reserves',
    procedure: readFileSync(join(DIR, '01-pmi-and-reserves.part1.txt'), 'utf8').trimEnd() + ' '
      + readFileSync(join(DIR, '01-pmi-and-reserves.part2.txt'), 'utf8'),
    example: 'ML-26-04488',
    loans: {
      'ML-26-04488': { status: 'succeeded', pressed: ['Require private mortgage insurance', 'Require additional reserves', 'Approve file'] },
      'ML-26-04561': { status: 'succeeded', pressed: ['Require private mortgage insurance', 'Approve file'] },
      'ML-26-04471': { status: 'succeeded', pressed: ['Approve file'] },
      'ML-26-99999': { status: 'succeeded', pressed: [], ending: /not ?found|no ?such/i },
    },
  },
  // Scenario 1 with a line written to steer the model. It must be flagged,
  // kept out of the walk, and change nothing any loan does.
  3: {
    name: 'Scenario 3: scenario 1 with an injected instruction',
    procedure: readFileSync(join(DIR, '03-injected.txt'), 'utf8'),
    example: 'ML-26-04488',
    risks: 2,
    loans: {
      'ML-26-04488': { status: 'succeeded', pressed: ['Require private mortgage insurance', 'Require additional reserves', 'Approve file'] },
      'ML-26-04471': { status: 'succeeded', pressed: ['Approve file'] },
    },
  },
  // The plain case: read a value, or say there is no such file. It regressed
  // unnoticed once, when rule sentences were kept from the walk.
  4: {
    name: 'Scenario 4: note rate enquiry',
    procedure: readFileSync(join(DIR, '04-note-rate.txt'), 'utf8'),
    example: 'ML-26-04471',
    loans: {
      'ML-26-04471': { status: 'succeeded', pressed: [], outputs: { noteRate: '6.375%' } },
      'ML-26-99999': { status: 'succeeded', pressed: [], ending: /not ?found|no ?such/i },
    },
  },
  // The demo set (docs/testing/scenarios/README.md, 5-9).
  5: {
    name: 'Scenario 5: first-time buyer review',
    procedure: readFileSync(join(DIR, '05-first-time-buyer.txt'), 'utf8'),
    example: 'ML-26-04488',
    loans: {
      'ML-26-04488': { status: 'succeeded', pressed: ['Require private mortgage insurance', 'Require additional reserves', 'Approve file'] },
      'ML-26-04529': { status: 'succeeded', pressed: ['Refer to senior underwriter'] },
      'ML-26-04547': { status: 'succeeded', pressed: ['Refer to senior underwriter'] },
      'ML-26-04471': { status: 'succeeded', pressed: ['Approve file'] },
      // The procedure calls a missing file withdrawn, so the ending may too.
      'ML-26-99999': { status: 'succeeded', pressed: [], ending: /not ?found|no ?such|withdrawn/i },
    },
  },
  6: {
    name: 'Scenario 6: property risk review',
    procedure: readFileSync(join(DIR, '06-property-risk.txt'), 'utf8'),
    example: 'ML-26-04513',
    loans: {
      'ML-26-04513': { status: 'succeeded', pressed: ['Require flood insurance', 'Approve file'] },
      'ML-26-04561': { status: 'succeeded', pressed: ['Require flood insurance', 'Require private mortgage insurance', 'Approve file'] },
      'ML-26-04529': { status: 'succeeded', pressed: ['Require private mortgage insurance', 'Approve file'] },
      'ML-26-04547': { status: 'succeeded', pressed: ['Refer to senior underwriter'] },
      'ML-26-04471': { status: 'succeeded', pressed: ['Approve file'] },
    },
  },
  7: {
    name: 'Scenario 7: income and loan size review',
    procedure: readFileSync(join(DIR, '07-income-and-loan-size.txt'), 'utf8'),
    example: 'ML-26-04502',
    loans: {
      'ML-26-04534': { status: 'succeeded', pressed: ['Refer to senior underwriter'] },
      'ML-26-04502': { status: 'succeeded', pressed: ['Require two years of tax returns', 'Approve file'] },
      'ML-26-04529': { status: 'succeeded', pressed: ['Refer to senior underwriter'] },
      'ML-26-04570': { status: 'succeeded', pressed: ['Approve file'] },
      'ML-26-99999': { status: 'succeeded', pressed: [], ending: /not ?found|no ?such/i },
    },
  },
  8: {
    name: 'Scenario 8: broker rate and terms enquiry',
    procedure: readFileSync(join(DIR, '08-broker-enquiry.txt'), 'utf8'),
    example: 'ML-26-04534',
    objects: true,
    loans: {
      'ML-26-04534': { status: 'succeeded', pressed: [], outputs: { noteRate: '6.75%', amount: '$930,000' } },
      'ML-26-04471': { status: 'succeeded', pressed: [], outputs: { noteRate: '6.375%' } },
      'ML-26-99999': { status: 'succeeded', pressed: [], ending: /not ?found|no ?such/i },
    },
  },
  // Orbit 2.2: scenario 9's own words, attached to the loan-servicing green
  // screen. The same written procedure, the same conclusions, through TN3270.
  10: {
    name: 'Scenario 10: scenario 9, on the green screen',
    procedure: readFileSync(join(DIR, '09-live-edit.txt'), 'utf8'),
    example: 'ML-26-04561',
    on: 'servicing',
    loans: {
      'ML-26-04561': { status: 'succeeded', pressed: ['ATTACH PMI', 'APPROVE'] },
      'ML-26-04471': { status: 'succeeded', pressed: ['APPROVE'] },
      'ML-26-99999': { status: 'succeeded', pressed: [], ending: /not ?found|no ?such/i },
    },
  },
  // Orbit 2.3: scenario 9's own words again, on a real mainframe: MVS 3.8j
  // on Hercules, signed on through VTAM and TSO, the servicing screens a CICS
  // program under KICKS, the loans in VSAM (demo/mvs). The example is not one
  // of the loans run, because the walk presses what it maps, and on this host
  // an approval stays approved.
  13: {
    name: 'Scenario 13: scenario 9, on the mainframe (MVS, TSO, KICKS)',
    procedure: readFileSync(join(DIR, '09-live-edit.txt'), 'utf8'),
    example: 'ML-26-04561',
    on: 'mainframe',
    loans: {
      'ML-26-04488': { status: 'succeeded', pressed: ['ATTACH PMI', 'APPROVE'] },
      'ML-26-04471': { status: 'succeeded', pressed: ['APPROVE'] },
      'ML-26-99999': { status: 'succeeded', pressed: [], ending: /not ?found|no ?such/i },
    },
    // What the host holds afterwards, read from the loan file on MVS: a press
    // that the application refused leaves the loan as it was.
    host: {
      'ML-26-04488': { status: 'APPROVED', conditions: ['PMI'] },
      'ML-26-04471': { status: 'APPROVED', conditions: [] },
    },
    // Orbit 2.4: the same loans again, without reloading. What the first runs
    // did is still done, so the host refuses the first key that would change
    // it (LSV206E LOAN ALREADY APPROVED) and each run stops there: none may
    // say it approved anything, and the loan file is as the first runs left it.
    again: {
      'ML-26-04488': { status: 'failed', error: 'changeRefused', pressed: ['ATTACH PMI'] },
      'ML-26-04471': { status: 'failed', error: 'changeRefused', pressed: ['APPROVE'] },
      'ML-26-99999': { status: 'succeeded', pressed: [], ending: /not ?found|no ?such/i },
    },
  },
  // The swivel chair, part one: the web file, the borrower's existing loans on
  // the green screen, and the decision made back on the web.
  11: {
    name: 'Scenario 11: existing-loan check, web and green screen',
    procedure: readFileSync(join(DIR, '11-existing-loans.txt'), 'utf8'),
    example: 'ML-26-04561',
    attach: 'servicing',
    loans: {
      'ML-26-04488': { status: 'succeeded', pressed: ['Refer to senior underwriter'] },
      'ML-26-04561': { status: 'succeeded', pressed: ['Require private mortgage insurance', 'Approve file'] },
      'ML-26-04471': { status: 'succeeded', pressed: ['Approve file'] },
      'ML-26-04502': { status: 'succeeded', pressed: ['Approve file'] },
      'ML-26-99999': { status: 'succeeded', pressed: [], ending: /not ?found|no ?such/i },
    },
  },
  // The swivel chair, part two: read the approved file on the web, board it
  // on the green screen, and bring the servicing account back to the web file.
  12: {
    name: 'Scenario 12: board the approved loan, web to green screen and back',
    procedure: readFileSync(join(DIR, '12-board-the-loan.txt'), 'utf8'),
    example: 'ML-26-04471',
    attach: 'servicing',
    loans: {
      'ML-26-04471': { status: 'succeeded', pressed: ['SUBMIT', 'Save servicing account'], outputs: { account: '7704471' } },
      'ML-26-04561': { status: 'succeeded', pressed: ['SUBMIT', 'Save servicing account'], outputs: { account: '7704561' } },
    },
  },
  // Published, run, then changed on the page: the threshold is edited in
  // place, Orbit maps only that sentence, and version 2 decides differently.
  9: {
    name: 'Scenario 9: a live edit, published as version 2',
    procedure: readFileSync(join(DIR, '09-live-edit.txt'), 'utf8'),
    example: 'ML-26-04561',
    loans: {
      'ML-26-04561': { status: 'succeeded', pressed: ['Require private mortgage insurance', 'Approve file'] },
      'ML-26-04471': { status: 'succeeded', pressed: ['Approve file'] },
    },
    edit: {
      find: /^5\. If the loan-to-value is over 80%/,
      text: '5. If the loan-to-value is over 90%, attach the condition requiring private mortgage insurance.',
      loans: {
        'ML-26-04561': { status: 'succeeded', pressed: ['Approve file'] },
        'ML-26-04488': { status: 'succeeded', pressed: ['Require private mortgage insurance', 'Approve file'] },
      },
    },
  },
  // Orbit 2.5 (Decision 20): scenario 9's words, with the loan-to-value named
  // by the author, as a person does on the page, under a name no model would
  // pick. The name must reach the table's column, the walk's read and the
  // compiled branch, and every loan decide as before.
  14: {
    name: 'Scenario 14: scenario 9, with the loan-to-value named in its words',
    procedure: readFileSync(join(DIR, '09-live-edit.txt'), 'utf8'),
    example: 'ML-26-04561',
    names: [
      { find: /^4\. Read the loan-to-value/, phrase: 'the loan-to-value', value: 'ltvPercent' },
      { find: /^5\. If the loan-to-value/, phrase: 'the loan-to-value', value: 'ltvPercent' },
    ],
    loans: {
      'ML-26-04561': { status: 'succeeded', pressed: ['Require private mortgage insurance', 'Approve file'] },
      'ML-26-04471': { status: 'succeeded', pressed: ['Approve file'] },
      'ML-26-99999': { status: 'succeeded', pressed: [], ending: /not ?found|no ?such/i },
    },
  },
  2: {
    name: 'Scenario 2: underwriting risk review (PDF)',
    pdf: join(DIR, '02-risk-review.pdf'),
    example: 'ML-26-04513',
    loans: {
      'ML-26-04513': { status: 'succeeded', pressed: ['Require flood insurance', 'Approve file'] },
      'ML-26-04561': { status: 'succeeded', pressed: ['Require flood insurance', 'Approve file'] },
      'ML-26-04529': { status: 'succeeded', pressed: ['Refer to senior underwriter'] },
      'ML-26-04547': { status: 'succeeded', pressed: ['Approve file'] },
      'ML-26-04534': { status: 'succeeded', pressed: ['Approve file'] },
      'ML-26-04502': { status: 'succeeded', pressed: ['Approve file'] },
    },
  },
};

/**
 * The loan-servicing green screen, registered the way a person registers it in
 * Admin if it is not already (Orbit 2.2): TN3270 to the practice twin.
 */
async function servicing(apps) {
  const known = apps.find((a) => !a.retired_at && a.surface === 'terminal' && a.addresses.some((x) => x.host === 'localhost:3271'));
  if (known) return known;
  const made = await call('/api/applications', { name: 'Loan Servicing', surface: 'terminal',
    addresses: [{ host: 'tn3270://localhost:3271' }], signInAs: 'ADMIN', credentialValue: 'practice',
    terminal: { codePage: 'cp037', model: '3278-2' } });
  if (!made.body.id) throw new Error(`the green screen could not be registered: ${made.body.why ?? made.status}`);
  const again = (await call('/api/applications')).body.applications ?? [];
  return again.find((a) => a.id === made.body.id);
}

/**
 * The loan servicing on the mainframe (Orbit 2.3), registered the way a person
 * registers a green screen: TN3270 to the host demo/mvs runs, signing on as
 * the servicing account. Its files are loaded afresh first, as the twin's
 * session starts afresh: on this host what a run changes stays changed.
 */
async function mainframe(apps) {
  const host = await import('../demo/mvs/host.mjs');
  if (host.state() !== 'running') throw new Error('the mainframe is not running: node demo/mvs/host.mjs start');
  const { loadFiles, CLERK } = await import('../demo/mvs/servicing.mjs');
  await loadFiles();
  const known = apps.find((a) => !a.retired_at && a.surface === 'terminal' && a.addresses.some((x) => x.host === 'localhost:3272'));
  if (known) return known;
  const made = await call('/api/applications', { name: 'Loan Servicing (mainframe)', surface: 'terminal',
    addresses: [{ host: 'tn3270://localhost:3272' }], signInAs: CLERK.user, credentialValue: CLERK.password,
    terminal: { codePage: 'cp037', model: '3278-2' } });
  if (!made.body.id) throw new Error(`the mainframe could not be registered: ${made.body.why ?? made.status}`);
  const again = (await call('/api/applications')).body.applications ?? [];
  return again.find((a) => a.id === made.body.id);
}

async function call(path, body) {
  const res = await fetch(API + path, body === undefined ? {}
    : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(read, done, what, seconds = 600) {
  for (let i = 0; i < seconds / 2; i++) {
    const v = await read();
    if (done(v)) return v;
    await pause(2000);
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function run(key) {
  const s = SCENARIOS[key];
  const failures = [];
  console.log(`\n${s.name}`);

  const apps = (await call('/api/applications')).body.applications ?? [];
  // The portal, registered with an account to sign in as: a procedure that
  // signs in cannot be walked against a registration without one.
  const portal = apps.find((a) => !a.retired_at && a.sign_in_as && a.addresses.some((x) => x.host === 'localhost:4101'));
  if (!portal) throw new Error('no application at localhost:4101 registered with an account to sign in as');
  const app = s.on === 'servicing' ? await servicing(apps) : s.on === 'mainframe' ? await mainframe(apps) : portal;
  console.log(`  against "${app.name}", signing in as ${app.sign_in_as}`);

  // As a person starts one on the page (2.6): the systems picked first, the
  // procedure pasted or dropped in, and no example given — Orbit asks for one
  // at the step that needs it. Nothing is confirmed: it drafts straight away.
  const green = s.attach === 'servicing' ? await servicing(apps) : null;
  const brought = await call('/api/understanding', {
    name: `${s.name} (${new Date().toISOString().slice(0, 16)})`, applicationId: app.id, startPath: s.on ? '/' : '/login',
    ...(green ? { alsoOn: [{ applicationId: green.id, startPath: '/' }] } : {}),
    ...(s.pdf ? { pdf: readFileSync(s.pdf).toString('base64') } : { procedure: s.procedure }),
  });
  if (brought.status !== 202) throw new Error(`bring-in refused: ${brought.body.why}`);
  const W = brought.body.id;
  const fail = (why) => { console.log(`  FAIL  ${why}`); return [why]; };
  const read = () => call(`/api/workflows/${W}`).then((r) => r.body);

  // Sorted and drafted with nothing pressed; it stops only to say why.
  const landed = await until(read, (d) => d.understanding.status === 'refused' || d.understanding.not_drafted
    || (d.understanding.confirmed_at && ['brought in', 'refused'].includes(d.understanding.walk)), 'the sort and the draft');
  if (landed.understanding.status === 'refused') return fail(`the sort was refused: ${landed.understanding.refused}`);
  if (landed.understanding.not_drafted) return fail(`it was not drafted: ${landed.understanding.not_drafted}`);
  if (landed.understanding.walk !== 'brought in') return fail(`the draft was refused: ${landed.understanding.walk_refused}`);
  const answered = [];
  if (green) {
    const work = (landed.document ?? []).filter((x) => !x.withdrawn && (x.label === 'task' || x.label === 'rule'));
    console.log(`  placed: ${work.map((x) => `${x.number} ${x.application?.name === green.name ? 'green screen' : x.application ? 'web' : '?'}`).join(', ')}`);
  }

  /** Map changes, as a person presses it, and wait for it. */
  const mapChanges = async (why) => {
    const mapping = await call(`/api/workflows/${W}/map-changes`, {});
    if (mapping.status !== 202) return `map changes (${why}) was refused: ${mapping.body.why}`;
    const mapped = await until(() => call(`/api/authoring/${mapping.body.id}`).then((r) => r.body),
      (a) => ['brought in', 'refused'].includes(a.session.status), `the mapping (${why})`);
    return mapped.session.status === 'brought in' ? null : `the mapping (${why}) was refused: ${mapped.session.refused?.describe}`;
  };

  // The example Orbit stops for, typed in as a person types it; it carries on from there.
  for (let i = 0; i < 3; i++) {
    const asks = (await read()).notes.filter((n) => !n.resolved_at && n.action === 'giveExample');
    if (!asks.length) break;
    for (const n of asks) {
      const r = await call(`/api/workflows/${W}/answer-question`, { noteId: n.id, example: s.example });
      if (r.status !== 200) return fail(`the example could not be given: ${r.body.why}`);
      answered.push(`an example for ${n.candidates?.[0]?.name} at ${n.sentence}`);
    }
    const refused = await mapChanges('after the example');
    if (refused) return fail(refused);
  }

  // Whether the run waits for a person is asked on each such sentence; these procedures carry on.
  for (const n of (await read()).notes.filter((x) => !x.resolved_at && x.action === 'waitHere')) {
    const r = await call(`/api/workflows/${W}/answer-question`, { noteId: n.id, waits: false });
    if (r.status !== 200) return fail(`whether ${n.sentence} waits could not be answered: ${r.body.why}`);
    answered.push(`${n.sentence} carries on without waiting`);
  }

  // Values named in the words (Decision 20), as a person does by choosing the words on the page,
  // after the draft: the sort page is gone, so it is mapped again.
  if (s.names) {
    const doc = (await read()).document ?? [];
    const links = s.names.map((n) => {
      const at = doc.find((x) => !x.withdrawn && n.find.test(x.text));
      return at && { sentence: at.number, phrase: n.phrase, value: n.value };
    });
    if (links.some((l) => !l)) return [`a sentence to name a value in was not found: ${doc.map((x) => x.text).join(' | ')}`];
    const named = await call(`/api/workflows/${W}/link-value`, { links });
    if (named.status !== 200) return [`naming the values was refused: ${named.body.why}`];
    await until(read, (d) => d.understanding.status === 'sorted' || d.understanding.status === 'refused', 'the tables');
    const rules = (await read()).rules ?? [];
    const columns = rules.flatMap((t) => t.columns.map((c) => c.name));
    for (const v of new Set(s.names.map((n) => n.value))) {
      console.log(`  ${columns.includes(v) ? 'ok  ' : 'FAIL'}  the table compares ${v} (columns: ${columns.join(', ')})`);
      if (!columns.includes(v)) failures.push(`no table column is named ${v}`);
    }
    const refused = await mapChanges('the values named');
    if (refused) return fail(refused);
  }
  for (const a of answered) console.log(`  asked  ${a}`);
  // What the run is given, as the draft names it: the name the walk gave the loan it asked an example of.
  const given = ((await read()).workflow.declared_inputs ?? []).map((i) => i.name);
  const input = given.length === 1 ? given[0] : 'loanNumber';
  if (given.length !== 1) console.log(`  note  the draft asks for ${given.length ? given.join(', ') : 'nothing'}; runs are given loanNumber`);

  const draft = (await call(`/api/workflows/${W}`)).body;
  const open = draft.notes.filter((n) => !n.resolved_at);
  const risks = open.filter((n) => n.kind === 'risk').length;
  if ((s.risks ?? 0) !== risks) failures.push(`${risks} risk${risks === 1 ? '' : 's'} raised, wanted ${s.risks ?? 0}`);
  if (s.risks) console.log(`  ${risks === s.risks ? 'ok  ' : 'FAIL'}  ${risks} injected line${risks === 1 ? '' : 's'} flagged as a risk`);
  for (const n of open) console.log(`  note  ${n.body.slice(0, 150)}`);
  if (s.names) {
    const reads = draft.steps.filter((x) => x.kind === 'read').map((x) => x.declares.produces?.name);
    const branches = JSON.stringify(draft.steps.filter((x) => x.kind === 'branch').map((x) => x.declares));
    for (const v of new Set(s.names.map((n) => n.value))) {
      const ok = reads.includes(v) && branches.includes(`"${v}"`);
      console.log(`  ${ok ? 'ok  ' : 'FAIL'}  a step reads ${v} and a branch compares it (reads: ${reads.join(', ')})`);
      if (!ok) failures.push(`${v} was not read and compared under the author's name`);
    }
  }
  const published = await confirmAndPublish(W, s.example, input);
  if (!published.ok) return fail(published.why);
  await runLoans(published.version, s.loans, failures, s.objects, input);
  if (s.host) await checkHost(s.host, failures);
  if (s.again) {
    console.log('  again, without reloading: what is done is refused by the host');
    await runLoans(published.version, s.again, failures, false, input);
    await checkHost(s.host, failures);
  }

  // A live edit (scenario 9): back to editing on the same page, the words
  // changed in place, only that sentence mapped, and version 2 published.
  if (s.edit) {
    console.log('  editing: back to editing, then the threshold changed in place');
    await call(`/api/workflows/${W}/back-to-draft`, {});
    const doc = (await call(`/api/workflows/${W}`)).body.document;
    const target = doc.find((x) => s.edit.find.test(x.text));
    if (!target) return fail('the sentence to edit was not found');
    const revised = await call(`/api/workflows/${W}/revise-sentence`, { sentence: target.number, text: s.edit.text });
    if (revised.status !== 200) return fail(`the edit was refused: ${revised.body.why}`);
    await until(() => call(`/api/workflows/${W}`).then((r) => r.body), (d) => d.understanding.status === 'sorted', 'the sort of the change');
    const pending = (await call(`/api/workflows/${W}`)).body.pending;
    console.log(`  ${pending.length === 1 && pending[0] === target.number ? 'ok  ' : 'FAIL'}  only ${target.number} waits to be mapped (${pending.join(', ')})`);
    if (!(pending.length === 1 && pending[0] === target.number)) failures.push(`pending was ${pending.join(', ')}, wanted ${target.number}`);
    const mapping = await call(`/api/workflows/${W}/map-changes`, {});
    if (mapping.status !== 202) return fail(`map changes was refused: ${mapping.body.why}`);
    const mapped = await until(() => call(`/api/authoring/${mapping.body.id}`).then((r) => r.body),
      (a) => ['brought in', 'refused'].includes(a.session.status), 'the mapping');
    if (mapped.session.status !== 'brought in') return fail(`the mapping was refused: ${mapped.session.refused?.describe}`);
    const again = await confirmAndPublish(W, s.example, input);
    if (!again.ok) return fail(again.why);
    const versions = (await call(`/api/workflows/${W}`)).body.versions.map((v) => v.version);
    console.log(`  ${versions.includes(2) ? 'ok  ' : 'FAIL'}  published as version ${Math.max(...versions)}`);
    if (!versions.includes(2)) failures.push('no version 2');
    await runLoans(again.version, s.edit.loans, failures, false, input);
  }
  if (open.length || answered.length) console.log(`  (${open.length + answered.length} question${open.length + answered.length === 1 ? '' : 's'} a person would have had to answer)`);
  return failures;
}

/**
 * Confirm and publish, as a person does on the page. Questions are answered
 * only to let the loans run; the scenario still reports them, because each is
 * something a person would have had to do.
 */
async function confirmAndPublish(W, example, input = 'loanNumber') {
  const draft = (await call(`/api/workflows/${W}`)).body;
  const open = draft.notes.filter((n) => !n.resolved_at);
  const ends = draft.steps.filter((x) => x.kind === 'end');
  const confirmed = await call(`/api/workflows/${W}/confirm`, {
    // A person types the label into an empty box; the runner names it from the
    // ending's summary, within the 120 characters the box takes.
    endings: ends.map((e) => ({ stepId: e.id, outcome: e.declares.outcome, label: e.declares.summary.slice(0, 120).trim(),
      example: { [input]: example } })),
    answers: open.map((n) => ({ noteId: n.id, answer: 'Answered by the scenario runner.', acknowledged: false })),
    attested: true,
  });
  if (confirmed.status !== 200) return { ok: false, why: `confirm refused: ${confirmed.body.why ?? (confirmed.body.blockers ?? []).join('; ')}` };
  const published = await call(`/api/workflows/${W}/publish`, {});
  if (published.status !== 201) return { ok: false, why: `publish refused: ${(published.body.blockers ?? []).join('; ')}` };
  return { ok: true, version: (await call(`/api/workflows/${W}`)).body.versions[0].id };
}

/** What the host holds, read from the loan file on MVS (Orbit 2.3). */
async function checkHost(host, failures) {
  const { readLoans } = await import('../demo/mvs/servicing.mjs');
  const held = await readLoans();
  for (const [loan, want] of Object.entries(host)) {
    const got = held[loan];
    const same = got && got.status === want.status && got.conditions.join(',') === want.conditions.join(',');
    console.log(`  ${same ? 'ok  ' : 'FAIL'}  on the host ${loan} is ${got ? `${got.status}${got.conditions.length ? ` with ${got.conditions.join(', ')}` : ''}` : 'missing'}`);
    if (!same) failures.push(`${loan} on the host: ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
  }
}

/** Every loan run on one version, and checked by what it did. */
async function runLoans(version, loans, failures, objects, input = 'loanNumber') {
  const refs = {};
  for (const loan of Object.keys(loans)) refs[loan] = (await call(`/api/versions/${version}/runs`, { inputs: { [input]: loan } })).body.reference;
  for (const [loan, want] of Object.entries(loans)) {
    const r = await until(() => call(`/api/runs/${refs[loan]}`).then((x) => x.body),
      (x) => !['queued', 'running'].includes(x.run.status), `run ${refs[loan]}`);
    const pressed = r.events.filter((e) => e.kind === 'activated' && DECISIONS.includes(e.detail.control)).map((e) => e.detail.control);
    const wrong = [];
    if (r.run.status !== want.status) wrong.push(`status ${r.run.status}${r.run.error ? ` (${r.run.error.describe})` : ''}`);
    if (want.error && r.run.error?.kind !== want.error) wrong.push(`stopped ${r.run.error?.kind ?? 'on no error'}, wanted ${want.error}`);
    if (JSON.stringify(pressed) !== JSON.stringify(want.pressed)) wrong.push(`pressed [${pressed.join(', ')}], wanted [${want.pressed.join(', ')}]`);
    // A missing file is known by what the run did — the read that finds the
    // record came back absent — not by the name the model gave the ending
    // ("fileNotFound", "withdrawn", "fileAbsent" all mean it).
    const foundNothing = r.events.some((e) => e.kind === 'read.absent');
    if (want.ending && !foundNothing && !want.ending.test(r.run.outcome ?? '')) wrong.push(`ended ${r.run.outcome}`);
    for (const [k, v] of Object.entries(want.outputs ?? {})) {
      // Outputs come back as objects (R26): { loan: { noteRate } } is checked as loan.noteRate.
      const fields = Object.entries(r.run.outputs ?? {}).flatMap(([name, v]) => (v && typeof v === 'object'
        ? Object.entries(v).map(([f, x]) => [`${name}.${f}`, x]) : [[name, v]]));
      const got = fields.find(([name]) => name.toLowerCase().includes(k.toLowerCase()))?.[1];
      if (got !== v) wrong.push(`${k} was ${got ?? 'not published'}, wanted ${v}`);
    }
    // The outputs come back as objects (R26), not as loose values.
    if (objects && want.outputs && !Object.values(r.run.outputs ?? {}).some((v) => v && typeof v === 'object')) {
      wrong.push('its outputs were not handed back as objects');
    }
    const how = r.run.outcome ?? (r.run.error ? `${r.run.status}: ${r.run.error.describe}` : r.run.status);
    console.log(`  ${wrong.length ? 'FAIL' : 'ok  '}  ${loan} ${refs[loan]} ${how}${wrong.length ? ' — ' + wrong.join('; ') : ''}`);
    if (wrong.length) failures.push(`${loan}: ${wrong.join('; ')}`);
  }
}

// `node scripts/scenarios.mjs 5 6 7` runs those; `demo` runs the demo set, 5 to 9.
// `mainframe` runs 13, which needs demo/mvs's host up and so is not in the default run.
const asked = process.argv.slice(2);
const which = asked[0] === 'demo' ? ['5', '6', '7', '8', '9'] : asked[0] === 'green' ? ['10', '11', '12']
  : asked[0] === 'mainframe' ? ['13']
  : asked.length ? asked : Object.keys(SCENARIOS).filter((k) => SCENARIOS[k].on !== 'mainframe');
let failed = 0;
for (const k of which) failed += (await run(k)).length;
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
