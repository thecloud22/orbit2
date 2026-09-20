import { DEFAULT_PORT, startLegacyPortal } from './server';

/**
 * Runs the practice target until it is stopped.
 *
 * Loopback only, for the reason the terminal portal is: a practice copy that
 * answered on every interface would be something anyone on the network could
 * drive, which is not what practice means.
 */
const port = Number.parseInt(process.env['ORBIT_LEGACY_PORTAL_PORT'] ?? '', 10);

const portal = await startLegacyPortal({ port: Number.isNaN(port) ? DEFAULT_PORT : port });

process.stderr.write(`[legacy-portal] listening on 127.0.0.1:${String(portal.port)}\n`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void portal.close().then(() => {
      process.exit(0);
    });
  });
}
