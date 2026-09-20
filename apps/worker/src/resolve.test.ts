/**
 * The refusals, against a real page.
 *
 * These need the underwriting portal running on 4101. They are skipped if it
 * is not, because a test that silently passes when the thing it tests is
 * absent is worse than no test.
 */
import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { describeBlocker, type Step } from '@orbit/contract';
import { resolveForPublication } from './resolve.ts';

const origin = 'http://localhost:4101';
const up = await fetch(`${origin}/pipeline`).then((r) => r.ok).catch(() => false);

const id = () => crypto.randomUUID();
const open = (): Step => ({ id: id(), kind: 'open', summary: 'the pipeline',
  application: 'underwriting', path: '/pipeline',
  arrives: { describe: 'the pipeline is showing' }, changesARecord: false });

describe('resolving a name against the page it will be used on', { skip: !up && 'portal not running on 4101' }, () => {
  test('a name that fits more than one thing is refused, with the count', async () => {
    // "Conventional" is the program on six of the loans in the pipeline, so it
    // names six cells. A name that fits six identifies none of them, and
    // picking the first would be Orbit guessing on the operator's behalf.
    const steps: Step[] = [open(), {
      id: id(), kind: 'read', summary: 'the program',
      region: { label: 'Program', binding: { strategy: 'text', name: 'Conventional',
                                             corroborate: { text: 'Conventional' } } },
      produces: { name: 'program', label: 'Program', type: 'text', required: true },
    }];
    const report = await resolveForPublication(steps, origin, {});
    const blocker = report.blockers[0];
    assert.equal(blocker?.kind, 'nameMatchedMoreThanOne');
    assert.ok(blocker.matched >= 2, `matched ${blocker.matched}`);
    assert.match(describeBlocker(blocker), /identifies neither/);
    assert.equal(report.stoppedAt, 2, 'and it says which step stopped it');
  });

  test('a name that fits nothing is refused', async () => {
    const steps: Step[] = [open(), {
      id: id(), kind: 'read', summary: 'a thing that is not there',
      region: { label: 'Escrow waiver', binding: { strategy: 'roleAndName', role: 'heading', name: 'Escrow waiver' } },
      produces: { name: 'waiver', label: 'Escrow waiver', type: 'text', required: true },
    }];
    const report = await resolveForPublication(steps, origin, {});
    assert.equal(report.blockers[0]?.kind, 'nameMatchedNothing');
  });

  test('a way of naming that can return the wrong thing is refused before the page is read', async () => {
    // Decision 15: `structural` returned one confidently-wrong element 28
    // times out of 181, so it is refused outright without corroboration.
    const steps: Step[] = [open(), {
      id: id(), kind: 'read', summary: 'the rate',
      region: { label: 'Note rate', binding: { strategy: 'structural', name: 'Note rate' } },
      produces: { name: 'rate', label: 'Note rate', type: 'text', required: true },
    }];
    const report = await resolveForPublication(steps, origin, {});
    assert.equal(report.blockers[0]?.kind, 'bindingNeedsCorroboration');
    assert.match(describeBlocker(report.blockers[0]!), /can return the wrong thing/);
  });

  test('a read the author declared as not required may find nothing, and that is not a blocker', async () => {
    // Without this, "the record does not exist" could never be published.
    const steps: Step[] = [open(), {
      id: id(), kind: 'read', summary: 'a notice that is only there sometimes',
      region: { label: 'No file matches that loan number.',
                binding: { strategy: 'text', name: 'No file matches that loan number.',
                           corroborate: { text: 'No file matches' } } },
      produces: { name: 'notFound', label: 'Not found', type: 'text', required: false },
    }];
    const report = await resolveForPublication(steps, origin, {});
    assert.deepEqual(report.blockers, []);
  });
});
