import { DEFAULT_PORT, startTerminalPortal } from './host';

/**
 * Runs the practice host until it is stopped.
 *
 * Bound to the loopback interface unless told otherwise. A practice copy that
 * answered on every interface would be a green screen anyone on the network
 * could drive, which is not what "practice" means.
 */
const port = Number.parseInt(process.env['ORBIT_TERMINAL_PORTAL_PORT'] ?? '', 10);

const portal = await startTerminalPortal({
  port: Number.isNaN(port) ? DEFAULT_PORT : port,
  log: (message) => {
    process.stderr.write(`[terminal-portal] ${message}\n`);
  },
});

process.stderr.write(`[terminal-portal] listening on 127.0.0.1:${String(portal.port)}\n`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void portal.close().then(() => {
      process.exit(0);
    });
  });
}
