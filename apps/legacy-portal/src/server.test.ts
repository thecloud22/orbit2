import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MAX_DELAY_MS, delayFrom, startLegacyPortal, type LegacyPortal } from './server';

/**
 * The portal answering for itself, with no browser involved.
 *
 * What is worth checking here is the small amount of behaviour it actually has:
 * that each room is reachable, that a submit really redirects rather than
 * re-rendering in place, and that the delay knob delays. Whether the *markup* is
 * bindable is a different question, asked by the recorder's own suite against a
 * real browser — a page cannot answer that about itself.
 */
describe('the legacy portal', () => {
  let portal: LegacyPortal;
  let origin: string;

  beforeAll(async () => {
    // Port 0: this must never collide with a portal somebody is running.
    portal = await startLegacyPortal({ port: 0 });
    origin = `http://127.0.0.1:${String(portal.port)}`;
  });

  afterAll(async () => {
    await portal.close();
  });

  it.each([
    '/',
    '/login',
    '/login-bare',
    '/home',
    '/customer/new',
    '/customer/saved',
    '/customer/broken',
    '/inbox',
    '/media',
    '/ng',
    '/consent',
    '/consent-frame',
    '/frames',
    '/frame-nav',
    '/frame-body',
    '/search',
  ])('serves %s as HTML', async (path) => {
    const response = await fetch(`${origin}${path}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/text\/html/);
  });

  it('serves AngularJS from the package, so the framework page is the real thing', async () => {
    const response = await fetch(`${origin}/vendor/angular.min.js`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/javascript/);
    expect(await response.text()).toContain('AngularJS');
  });

  it('shows a result for a reference that was searched for', async () => {
    const found = await (await fetch(`${origin}/search?q=SR-4417`)).text();

    expect(found).toContain('SR-4417');
    expect(found).toContain('Infrastructure Operations');
  });

  it('answers an unknown path with 404 rather than something plausible', async () => {
    expect((await fetch(`${origin}/no-such-room`)).status).toBe(404);
  });

  it('redirects a sign-on to the menu, so the submit is a real navigation', async () => {
    const response = await fetch(`${origin}/login`, {
      method: 'POST',
      body: new URLSearchParams({ username: 'ada', password: 'secret' }),
      redirect: 'manual',
    });

    // 303 specifically: the POST becomes a GET, which is what makes the page
    // after a submit a fresh document rather than a resubmission prompt.
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/home');
  });

  it('shows what was saved after the redirect, so a run has something to read', async () => {
    await fetch(`${origin}/customer/new`, {
      method: 'POST',
      body: new URLSearchParams({ first_name: 'Ada', last_name: 'Lovelace', region: 'north' }),
      redirect: 'manual',
    });

    const saved = await (await fetch(`${origin}/customer/saved`)).text();

    expect(saved).toContain('Ada');
    expect(saved).toContain('Lovelace');
  });

  it('delays a submit when asked, which is the whole point of the knob', async () => {
    const started = Date.now();

    await fetch(`${origin}/customer/new?delay=300`, {
      method: 'POST',
      body: new URLSearchParams({ first_name: 'Grace', last_name: 'Hopper' }),
      redirect: 'manual',
    });

    // Generously below 300 so a loaded machine's clock cannot make this flaky
    // while still being impossible to pass without the delay happening.
    expect(Date.now() - started).toBeGreaterThan(200);
  });

  it('carries no test id anywhere, which is the reason this portal exists', async () => {
    for (const path of ['/login', '/login-bare', '/customer/new', '/inbox', '/media', '/home']) {
      expect(await (await fetch(`${origin}${path}`)).text()).not.toContain('data-testid');
    }
  });
});

describe('delayFrom', () => {
  it('reads a delay a form asked for', () => {
    expect(delayFrom(new URL('http://x/customer/new?delay=250'))).toBe(250);
  });

  it.each(['', 'abc', '0', '-5'])('treats %o as no delay rather than as an error', (value) => {
    expect(delayFrom(new URL(`http://x/customer/new?delay=${value}`))).toBe(0);
  });

  it('caps a delay, so a page cannot hold a suite open', () => {
    expect(delayFrom(new URL('http://x/customer/new?delay=999999'))).toBe(MAX_DELAY_MS);
  });
});
