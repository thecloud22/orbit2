/**
 * An address carries its scheme.
 *
 * Every origin in the product used to be built as `http://` plus the host.
 * Registering an https system was accepted, and then the recorder opened it
 * over http and landed on an error page — after registration, which is the
 * wrong place to find out. The scheme had been typed, understood, and thrown
 * away by the very code that normalised it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { address, originOf } from './address.ts';

test('an address with no scheme is http, as every one written before this meant', () => {
  assert.equal(originOf({ host: 'portal.example.com' }), 'http://portal.example.com');
  assert.equal(originOf({ host: 'portal.example.com', scheme: null }), 'http://portal.example.com');
});

test('https is honoured, which is the whole point', () => {
  assert.equal(originOf({ host: 'portal.example.com', scheme: 'https' }), 'https://portal.example.com');
  assert.equal(originOf({ host: 'portal.example.com:8443', scheme: 'https' }),
    'https://portal.example.com:8443');
});

test('anything else is http, rather than a scheme the browser cannot open', () => {
  // These come back out of jsonb written by older code. A row saying
  // something unexpected must still produce an origin somebody can reach.
  assert.equal(originOf({ host: 'h', scheme: 'ftp' }), 'http://h');
  assert.equal(originOf({ host: 'h', scheme: 'HTTPS' }), 'http://h');
});

test('the stored shape defaults its scheme, so an old record still parses', () => {
  const parsed = address.parse({ host: 'portal.example.com' });
  assert.equal(parsed.scheme, 'http');
  assert.equal(parsed.pathPrefix, '/');
  assert.equal(originOf(parsed), 'http://portal.example.com');
});
