import { startTerminalPortal } from './host';
import { LOAN_SERVICING } from './servicing';

/**
 * Runs the loan-servicing twin until it is stopped (Orbit 2.2).
 *
 * Its own port, beside the service desk's 3270, so the two practice hosts can
 * run together. Loopback only, like the service desk.
 */
export const SERVICING_PORT = 3271;
const port = Number.parseInt(process.env['ORBIT_SERVICING_PORT'] ?? '', 10);

const portal = await startTerminalPortal({
  port: Number.isNaN(port) ? SERVICING_PORT : port,
  application: LOAN_SERVICING as never,
  log: (message) => {
    process.stderr.write(`[loan-servicing] ${message}\n`);
  },
});

process.stderr.write(`[loan-servicing] listening on 127.0.0.1:${String(portal.port)}\n`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void portal.close().then(() => {
      process.exit(0);
    });
  });
}
