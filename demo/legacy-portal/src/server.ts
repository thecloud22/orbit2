import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

import {
  consentFramePage,
  consentPage,
  customerBrokenPage,
  customerNewPage,
  customerSavedPage,
  frameBodyPage,
  frameNavPage,
  framesetPage,
  homePage,
  inboxPage,
  loginBarePage,
  loginPage,
  mediaPage,
  ngPage,
  searchPage,
  cardsPage,
  sectionsPage,
  ticketsPage,
} from './pages';

/**
 * AngularJS, from the package rather than from a copy checked in here.
 *
 * Resolved rather than read from a guessed path, so the version is whatever the
 * lockfile pins and CI needs no network. A vendored copy in this repository
 * would be 170KB of minified source for the formatter and the linter to argue
 * about, to gain nothing.
 */
const ANGULAR_PATH = createRequire(import.meta.url).resolve('angular/angular.min.js');

/**
 * A practice target that behaves like a system nobody has touched since 2006.
 *
 * Server-rendered HTML, forms that POST and redirect, no framework on either
 * side. `node:http` rather than Fastify deliberately: routing a dozen fixed
 * paths needs nothing, and a modern dependency in the one application whose
 * value is having none would be an odd thing to explain later.
 *
 * Every route is read-only in the sense that matters — it holds one in-memory
 * record so a redirect has something to show, and it listens on loopback only.
 */

export const DEFAULT_PORT = 3040;

/** So a slow page cannot be used to hold a test open indefinitely. */
export const MAX_DELAY_MS = 10_000;

export interface LegacyPortal {
  readonly port: number;
  close(): Promise<void>;
}

export interface StartLegacyPortalOptions {
  /** 0 asks the operating system for a free port, which is what tests want. */
  readonly port?: number;
  readonly host?: string;
}

interface SavedCustomer {
  readonly first: string;
  readonly last: string;
  readonly region: string;
}

function html(response: ServerResponse, body: string, status = 200): void {
  response.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    // A page the recorder has to re-read after a navigation must not be served
    // from a cache that would hide a change a test just made.
    'cache-control': 'no-store',
  });
  response.end(body);
}

function redirect(response: ServerResponse, location: string): void {
  // 303 rather than 302: a POST must become a GET, which is what makes the
  // reload after a submit a real navigation rather than a resubmission.
  response.writeHead(303, { location });
  response.end();
}

async function readBody(request: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }

  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

/** `?delay=N`, clamped. Anything unparseable is no delay rather than an error. */
export function delayFrom(url: URL): number {
  const raw = Number.parseInt(url.searchParams.get('delay') ?? '', 10);

  if (Number.isNaN(raw) || raw <= 0) {
    return 0;
  }

  return Math.min(raw, MAX_DELAY_MS);
}

export async function startLegacyPortal(
  options: StartLegacyPortalOptions = {},
): Promise<LegacyPortal> {
  const host = options.host ?? '127.0.0.1';
  let saved: SavedCustomer = { first: '', last: '', region: '' };
  let signedOnAs = 'nobody';

  const server: Server = createServer((request, response) => {
    void handle(request, response).catch(() => {
      if (!response.headersSent) {
        response.writeHead(500, { 'content-type': 'text/plain' });
      }
      response.end('error');
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', `http://${host}`);
    const route = `${request.method ?? 'GET'} ${url.pathname}`;

    switch (route) {
      case 'GET /':
      case 'GET /login':
        return html(response, loginPage());

      case 'POST /login': {
        const form = await readBody(request);
        signedOnAs = form.get('username') ?? 'the operator';
        return redirect(response, '/home');
      }

      case 'GET /login-bare':
        return html(response, loginBarePage());

      case 'POST /login-bare': {
        const form = await readBody(request);
        signedOnAs = form.get('userid') ?? 'the operator';
        return redirect(response, '/home');
      }

      case 'GET /home':
        return html(response, homePage(signedOnAs));

      case 'GET /tickets':
        return html(response, ticketsPage());

      case 'GET /cards':
        return html(response, cardsPage());

      case 'GET /sections':
        return html(response, sectionsPage());

      case 'GET /customer/new':
        return html(response, customerNewPage(delayFrom(url)));

      case 'POST /customer/new': {
        const form = await readBody(request);
        saved = {
          first: form.get('first_name') ?? '',
          last: form.get('last_name') ?? '',
          region: form.get('region') ?? '',
        };

        // Before the redirect, not after: what this reproduces is a submit that
        // takes seconds to come back, which is when a recorder loses the value
        // somebody typed.
        const waitMs = delayFrom(url);
        if (waitMs > 0) {
          await delay(waitMs);
        }

        return redirect(response, '/customer/saved');
      }

      case 'GET /customer/saved':
        return html(response, customerSavedPage(saved.first, saved.last, saved.region));

      case 'GET /customer/broken':
        return html(response, customerBrokenPage());

      case 'GET /inbox':
        return html(response, inboxPage());

      case 'GET /media':
        return html(response, mediaPage());

      case 'GET /ng':
        return html(response, ngPage());

      case 'GET /vendor/angular.min.js': {
        response.writeHead(200, {
          'content-type': 'application/javascript; charset=utf-8',
          'cache-control': 'no-store',
        });
        response.end(await readFile(ANGULAR_PATH));
        return;
      }

      case 'GET /consent':
        return html(response, consentPage());

      case 'GET /consent-frame':
        return html(response, consentFramePage());

      case 'GET /frames':
        return html(response, framesetPage());

      case 'GET /frame-nav':
        return html(response, frameNavPage());

      case 'GET /frame-body':
        return html(response, frameBodyPage());

      case 'GET /search':
        return html(response, searchPage(url.searchParams.get('q')?.trim() ?? ''));

      default:
        return html(response, '<!doctype html><html><body><b>No such page</b></body></html>', 404);
    }
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? DEFAULT_PORT, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : (options.port ?? 0);

  return {
    port,
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
        // Without this a keep-alive connection from a finished test holds the
        // process open long past the point anything is using it.
        server.closeAllConnections();
      });
    },
  };
}
