/**
 * Makes sure something is listening where .env says the database is.
 *
 *   node scripts/database.mjs
 *
 * Called by `pnpm run setup` and by `scripts/orbit start`, so that "start
 * Orbit" means Orbit starts rather than Orbit starts and then explains that
 * the database did not.
 *
 * It does not manage a database it did not start. If something already
 * answers at that address, this says so and stops — a machine with its own
 * PostgreSQL, or one pointed at a server in a data centre, must not have a
 * container brought up underneath it. The container is for a machine that has
 * nothing, which is the one being handed to somebody new.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tty = process.stdout.isTTY;
const ok = (m) => console.log(`  ${tty ? '\x1b[32m✓\x1b[0m' : '+'} ${m}`);
const no = (m) => console.log(`  ${tty ? '\x1b[31m✗\x1b[0m' : '-'} ${m}`);
const note = (m) => console.log(`    ${m}`);

/** A connection, not a query: whether anything is there at all. */
const answering = (host, port) => new Promise((resolve) => {
  const socket = connect({ host, port, timeout: 1500 });
  const done = (result) => { socket.destroy(); resolve(result); };
  socket.on('connect', () => done(true));
  socket.on('error', () => done(false));
  socket.on('timeout', () => done(false));
});

/**
 * Asked again every second until it answers or the time is up. Docker
 * Desktop takes a while to wake, and on macOS a container's port is forwarded
 * a moment after the container says it is healthy: one look was a false "no".
 * ORBIT_DB_WAIT in .env sets how long, in seconds.
 */
const waitFor = async (check, what) => {
  const seconds = Number(process.env['ORBIT_DB_WAIT'] ?? 60);
  for (let i = 0; i < seconds; i++) {
    if (await check()) return true;
    if (i === 0) note(`waiting for ${what} (up to ${seconds}s)…`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  return check();
};
const dockerAnswers = () => spawnSync('docker', ['info'], { encoding: 'utf8' }).status === 0;

const env = join(ROOT, '.env');
if (!existsSync(env)) { no('.env is not here yet — run `pnpm run setup` first'); process.exit(1); }
process.loadEnvFile(env);

const url = process.env['ORBIT_OWNER_DATABASE_URL'];
if (!url) { no('ORBIT_OWNER_DATABASE_URL is not set in .env'); process.exit(1); }

const { hostname, port } = new URL(url);
const host = hostname || 'localhost';
const at = `${host}:${port || 5432}`;

if (await answering(host, Number(port || 5432))) {
  ok(`postgres is answering at ${at}`);
  process.exit(0);
}

// Nothing there. The container is the only thing this can offer, and only if
// Docker is here — on a machine with a local PostgreSQL that is simply
// stopped, starting a container would put a second, empty server in its place.
//
// `docker info` rather than `docker compose version`: the second answers from
// the CLI alone and says yes on a machine where Docker is installed and not
// running, which sent the failure down the wrong path entirely — it reported
// a port conflict at somebody whose daemon was asleep.
const installed = spawnSync('docker', ['--version'], { encoding: 'utf8' }).status === 0;
// Installed but not answering yet is usually Docker Desktop still starting: wait for it.
if (!(installed ? await waitFor(dockerAnswers, 'Docker to start') : false)) {
  no(`nothing is listening at ${at}`);
  if (installed) {
    note('Docker is installed but did not answer — start Docker Desktop, then run this again.');
  } else {
    note('Start your own postgres, or install Docker and run this again.');
  }
  note('That address is ORBIT_OWNER_DATABASE_URL in .env.');
  process.exit(1);
}

console.log(`  nothing at ${at} — starting the one in docker-compose.yml`);
const up = spawnSync('docker', ['compose', 'up', '-d', '--wait', 'db'],
  { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ORBIT_PG_PORT: String(port || 5432) } });

if (up.status !== 0) {
  no('could not start the postgres container');
  for (const line of `${up.stdout}${up.stderr}`.trim().split('\n').slice(-4)) note(line);
  note(`If your own postgres already holds port ${port || 5432}, start that instead,`);
  note('or set ORBIT_PG_PORT and point the three ORBIT_*DATABASE_URL lines at it.');
  process.exit(1);
}

// --wait honours the healthcheck, which is pg_isready rather than "the
// container started". Confirmed from out here anyway, because the thing that
// matters is whether *this* process can reach it.
if (!(await waitFor(() => answering(host, Number(port || 5432)), `postgres to answer at ${at}`))) {
  no(`the container started but nothing is answering at ${at}`);
  process.exit(1);
}
ok(`postgres started in docker, answering at ${at}`);
