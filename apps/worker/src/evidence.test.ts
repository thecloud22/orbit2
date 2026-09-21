/**
 * Where evidence lands must not depend on where a process was started.
 *
 * The worker is started in apps/worker and the API in apps/api. A relative
 * ORBIT_EVIDENCE_DIR — which is what .env.example shipped — is resolved
 * against the working directory, so the worker wrote every screenshot under
 * apps/worker and the API looked for them under apps/api. Runs completed,
 * evidence was captured, and every image was missing by the time anyone
 * opened the run page.
 *
 * It was fixed once by anchoring the *default*, and came straight back
 * through the variable that overrides it. This is the property rather than
 * the arithmetic: two processes, two working directories, one answer. It runs
 * them for real, because reimplementing the sum here would prove only that
 * this file can add up.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const repo = join(import.meta.dirname, '..', '..', '..');

/** What that process, started there, thinks the store is. */
const rootAccordingTo = (cwd: string, module: string, configured?: string) =>
  execFileSync(process.execPath,
    ['--experimental-strip-types', '--input-type=module', '-e',
     `const m = await import('./src/${module}'); console.log(m.evidenceRoot);`],
    { cwd: join(repo, cwd), encoding: 'utf8',
      env: { ...process.env, ...(configured === undefined ? {} : { ORBIT_EVIDENCE_DIR: configured }) } },
  ).trim();

test('a relative evidence directory means the same thing to both processes', () => {
  const worker = rootAccordingTo('apps/worker', 'evidence.ts', './data/evidence');
  const api = rootAccordingTo('apps/api', 'artefacts.ts', './data/evidence');

  assert.equal(worker, api, 'the worker writes where the API reads');
  // And it is the one setup creates, not a third place they happen to share.
  assert.equal(worker, join(repo, 'data', 'evidence'));
});

test('with nothing configured they still agree', () => {
  const worker = rootAccordingTo('apps/worker', 'evidence.ts');
  const api = rootAccordingTo('apps/api', 'artefacts.ts');

  assert.equal(worker, api);
  assert.equal(worker, join(repo, 'data', 'evidence'));
});

test('an absolute path is taken as given, not anchored to the repository', () => {
  const given = process.platform === 'win32' ? 'C:\\orbit-evidence' : '/var/lib/orbit/evidence';
  assert.equal(rootAccordingTo('apps/worker', 'evidence.ts', given), given);
  assert.equal(rootAccordingTo('apps/api', 'artefacts.ts', given), given);
});
