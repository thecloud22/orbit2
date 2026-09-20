import { spawnSync } from 'node:child_process';

import { createX3270ExecutorFactory } from '@orbit/executor-x3270';
import { fingerprintOf, resolveAddress, type Screen } from '@orbit/screen-mapping';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTerminalPortal, type TerminalPortal } from './host';

/**
 * The practice host, driven the way Orbit drives it.
 *
 * The unit tests either side of this one check the portal against its own idea
 * of a 3270 data stream, which is exactly the check that cannot catch a
 * misunderstanding of the protocol: a host and a test that share one author
 * agree with each other whether or not either is right. Here the reader is
 * x3270 and the addressing is `@orbit/screen-mapping`'s, so what passes is the
 * portal being automatable by Orbit rather than by itself.
 *
 * Skipped without `b3270`, for the reason the executor's own suite skips: it is
 * a real dependency of this surface, and a machine without it should say so once
 * rather than fail a suite it was never able to run.
 */
const HAS_B3270 = spawnSync('b3270', ['--version'], { stdio: 'ignore' }).status !== null;

describe.skipIf(!HAS_B3270)('the practice host, through a real emulator', () => {
  let portal: TerminalPortal;

  beforeAll(async () => {
    // Port 0: the suite must not collide with a portal somebody is running.
    portal = await startTerminalPortal({ port: 0 });
  });

  afterAll(async () => {
    await portal?.close();
  });

  async function session(): Promise<{
    screen: () => Promise<Screen>;
    search: (requestNumber: string) => Promise<Screen>;
    close: () => Promise<void>;
  }> {
    const executor = await createX3270ExecutorFactory({ model: '3279-2' }).open();
    await executor.connect({ host: `127.0.0.1:${String(portal.port)}`, timeoutMs: 5_000 });

    return {
      screen: () => executor.screen(),
      search: async (requestNumber: string) => {
        const current = await executor.screen();
        const field = resolveAddress(current, {
          strategy: 'field_after_label',
          label: 'REQUEST NUMBER ===>',
        });

        if (!field.resolved) {
          throw new Error(`the lookup screen has a request number field: ${field.reason}`);
        }

        await executor.typeAt({
          position: field.field.start,
          value: requestNumber,
          timeoutMs: 5_000,
        });
        await executor.press({ key: 'enter', timeoutMs: 5_000 });

        return executor.screen();
      },
      close: () => executor.close(),
    };
  }

  it('opens on the lookup screen, with one field to type into', async () => {
    const open = await session();

    try {
      const screen = await open.screen();
      const field = resolveAddress(screen, {
        strategy: 'field_after_label',
        label: 'REQUEST NUMBER ===>',
      });

      expect(field.resolved).toBe(true);
      expect(field.resolved && field.field.attributes.protected).toBe(false);
      expect(fingerprintOf(screen).anchors.map((one) => one.text)).toContain(
        'SERVICE REQUEST LOOKUP',
      );
    } finally {
      await open.close();
    }
  });

  it('shows the record for a request number it knows', async () => {
    const open = await session();

    try {
      const screen = await open.search('SR-1001');
      const captions = fingerprintOf(screen).anchors.map((one) => one.text);

      expect(captions).toContain('SERVICE REQUEST DETAIL');
      expect(captions).toContain('IN PROGRESS');
      expect(captions).toContain('INFRASTRUCTURE OPERATIONS');
    } finally {
      await open.close();
    }
  });

  it('reads the record\u2019s values, which a real host protects', async () => {
    const open = await session();

    try {
      const screen = await open.search('SR-1001');
      const read = (label: string): string => {
        const found = resolveAddress(screen, {
          strategy: 'field_after_label',
          label,
          takes: 'value',
        });

        return found.resolved ? found.field.text.trim() : `<${found.reason}>`;
      };

      expect(read('STATUS')).toBe('IN PROGRESS');
      expect(read('ASSIGNED TEAM')).toBe('INFRASTRUCTURE OPERATIONS');
    } finally {
      await open.close();
    }
  });

  it('comes back with a message for one it does not', async () => {
    const open = await session();

    try {
      const screen = await open.search('SR-9999');

      expect(fingerprintOf(screen).anchors.map((one) => one.text)).toContain('REQUEST NOT FOUND');
    } finally {
      await open.close();
    }
  });

  it('distinguishes the two endings by a caption, which is what a branch binds to', async () => {
    const found = await session();
    const missing = await session();

    try {
      const foundAnchors = fingerprintOf(await found.search('SR-1001')).anchors;
      const missingAnchors = fingerprintOf(await missing.search('SR-9999')).anchors;

      // The property a terminal decision rests on: each ending puts a caption on
      // the screen that the other ending does not have, at a fixed position.
      const captionsOf = (anchors: readonly { text: string }[]): Set<string> =>
        new Set(anchors.map((one) => one.text));

      expect(captionsOf(foundAnchors).has('REQUEST NOT FOUND')).toBe(false);
      expect(captionsOf(missingAnchors).has('SERVICE REQUEST DETAIL')).toBe(false);
    } finally {
      await found.close();
      await missing.close();
    }
  });
});
