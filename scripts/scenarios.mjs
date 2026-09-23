#!/usr/bin/env node
/**
 * The mortgage scenarios, run the way a person runs them: brought in, sorted,
 * confirmed with no relabelling, walked, published, and every loan run. Each
 * loan's result is checked against what the procedure says it should be.
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
  'Require two years of tax returns', 'Approve file', 'Refer to senior underwriter', 'Decline file'];

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
  const app = apps.find((a) => !a.retired_at && a.sign_in_as && a.addresses.some((x) => x.host === 'localhost:4101'));
  if (!app) throw new Error('no application at localhost:4101 registered with an account to sign in as');
  console.log(`  against "${app.name}", signing in as ${app.sign_in_as}`);

  const brought = await call('/api/understanding', {
    name: `${s.name} (${new Date().toISOString().slice(0, 16)})`, applicationId: app.id, startPath: '/login',
    inputs: { loanNumber: s.example },
    ...(s.pdf ? { pdf: readFileSync(s.pdf).toString('base64') } : { procedure: s.procedure }),
  });
  if (brought.status !== 202) throw new Error(`bring-in refused: ${brought.body.why}`);
  const W = brought.body.id;
  await until(() => call(`/api/workflows/${W}/understanding`).then((r) => r.body), (u) => u.status === 'sorted' || u.status === 'refused', 'the sort');

  const confirmed = await call(`/api/workflows/${W}/understood`, {});
  const fail = (why) => { console.log(`  FAIL  ${why}`); return [why]; };
  if (confirmed.status !== 202) return fail(`the sort could not be confirmed without help: ${confirmed.body.why}`);
  const walk = await until(() => call(`/api/authoring/${confirmed.body.id}`).then((r) => r.body),
    (a) => ['brought in', 'refused'].includes(a.session.status), 'the walk');
  if (walk.session.status !== 'brought in') return fail(`walk refused: ${walk.session.refused?.describe}`);

  const draft = (await call(`/api/workflows/${W}`)).body;
  const open = draft.notes.filter((n) => !n.resolved_at);
  const risks = open.filter((n) => n.kind === 'risk').length;
  if ((s.risks ?? 0) !== risks) failures.push(`${risks} risk${risks === 1 ? '' : 's'} raised, wanted ${s.risks ?? 0}`);
  if (s.risks) console.log(`  ${risks === s.risks ? 'ok  ' : 'FAIL'}  ${risks} injected line${risks === 1 ? '' : 's'} flagged as a risk`);
  for (const n of open) console.log(`  note  ${n.body.slice(0, 150)}`);
  // Questions are answered only to let the loans run; the scenario still
  // reports them, because each is something a person would have had to do.
  const ends = draft.steps.filter((x) => x.kind === 'end');
  await call(`/api/workflows/${W}/confirm`, {
    endings: ends.map((e) => ({ stepId: e.id, outcome: e.declares.outcome, label: e.declares.summary,
      example: { loanNumber: s.example } })),
    answers: open.map((n) => ({ noteId: n.id, answer: 'Answered by the scenario runner.', acknowledged: false })),
    attested: true,
  });
  const published = await call(`/api/workflows/${W}/publish`, {});
  if (published.status !== 201) return fail(`publish refused: ${(published.body.blockers ?? []).join('; ')}`);
  const version = (await call(`/api/workflows/${W}`)).body.versions[0].id;

  const refs = {};
  for (const loan of Object.keys(s.loans)) refs[loan] = (await call(`/api/versions/${version}/runs`, { inputs: { loanNumber: loan } })).body.reference;
  for (const [loan, want] of Object.entries(s.loans)) {
    const r = await until(() => call(`/api/runs/${refs[loan]}`).then((x) => x.body),
      (x) => !['queued', 'running'].includes(x.run.status), `run ${refs[loan]}`);
    const pressed = r.events.filter((e) => e.kind === 'activated' && DECISIONS.includes(e.detail.control)).map((e) => e.detail.control);
    const wrong = [];
    if (r.run.status !== want.status) wrong.push(`status ${r.run.status}${r.run.error ? ` (${r.run.error.describe})` : ''}`);
    if (JSON.stringify(pressed) !== JSON.stringify(want.pressed)) wrong.push(`pressed [${pressed.join(', ')}], wanted [${want.pressed.join(', ')}]`);
    if (want.ending && !want.ending.test(r.run.outcome ?? '')) wrong.push(`ended ${r.run.outcome}`);
    console.log(`  ${wrong.length ? 'FAIL' : 'ok  '}  ${loan} ${refs[loan]} ${r.run.outcome ?? r.run.status}${wrong.length ? ' — ' + wrong.join('; ') : ''}`);
    if (wrong.length) failures.push(`${loan}: ${wrong.join('; ')}`);
  }
  if (open.length) console.log(`  (${open.length} question${open.length === 1 ? '' : 's'} a person would have had to answer)`);
  return failures;
}

const which = process.argv[2] ? [process.argv[2]] : Object.keys(SCENARIOS);
let failed = 0;
for (const k of which) failed += (await run(k)).length;
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
