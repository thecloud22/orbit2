/**
 * Everything a machine needs before `scripts/orbit start` will work.
 *
 *   pnpm run setup
 *
 * Node rather than bash, so that "another developer can install this" does not
 * quietly mean "another developer on macOS or Linux". The one thing this
 * script may assume is a Node, because it is the thing being set up to run on
 * one — and Node is the same program on every platform, where `sed -i`, `cp`
 * and `$(whoami)` are three different programs or none.
 *
 * `pnpm run setup`, not `pnpm setup`: pnpm has a built-in command by that name
 * which manages pnpm's own installation, and it wins.
 *
 * Safe to run twice. It creates what is missing and leaves what is there, so
 * running it again after a failure picks up where it stopped rather than
 * starting an argument about what already exists.
 *
 * It does not write secrets. `.env` is copied from `.env.example` if it is
 * absent and then left alone — a setup script that invents a model key is a
 * setup script somebody has to audit.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { userInfo } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Colour only when something is there to read it. A log file full of escape
// codes is worse than a log file without them.
const tty = process.stdout.isTTY;
const green = (s) => (tty ? `\x1b[32m${s}\x1b[0m` : s);
const red = (s) => (tty ? `\x1b[31m${s}\x1b[0m` : s);
const ok = (m) => console.log(`  ${green('✓')} ${m}`);
const no = (m) => console.log(`  ${red('✗')} ${m}`);
const note = (m) => console.log(`    ${m}`);
const step = (m) => console.log(`\n${m}`);
const die = (code = 1) => process.exit(code);

/**
 * Runs a command, without a shell.
 *
 * Named rather than spawned through a shell because two of the arguments below
 * are a database URL out of `.env`, and a URL carrying a password will carry
 * whatever characters that password is made of. Through a shell those are
 * concatenated, not escaped — which Node now warns about — and a `$` or a
 * backtick in a password would be interpreted rather than sent.
 *
 * Windows is why this needs saying at all: pnpm there is `pnpm.cmd`, and
 * spawning `pnpm` without a shell finds nothing. Naming the file is the fix
 * that does not reopen the quoting.
 */
const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const run = (command, args, options = {}) =>
  spawnSync(command, args, { encoding: 'utf8', cwd: ROOT, ...options });

step('Checking what is installed');

// Node 22.6 is where --experimental-strip-types arrives, and every process
// here is started with it. An older Node fails at the first import with a
// syntax error about a type annotation, which reads like a broken repository.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major > 22 || (major === 22 && minor >= 6)) {
  ok(`node v${process.versions.node}`);
} else {
  no(`node v${process.versions.node} — 22.6 or newer is needed for --experimental-strip-types`);
  die();
}

const pnpm = run(PNPM, ['--version']);
if (pnpm.status === 0) {
  ok(`pnpm ${pnpm.stdout.trim()}`);
} else {
  no("pnpm is not installed — 'npm install -g pnpm@9.15.0', or 'corepack enable'");
  die();
}

// No postgres client is checked for, because none is used. Creating a database
// and migrating it both go through the driver this repository already ships,
// so whether a server answers is a question about .env, asked below where .env
// is read.

step('Settings');

const env = join(ROOT, '.env');
if (existsSync(env)) {
  ok('.env is already here — leaving it alone');
} else {
  copyFileSync(join(ROOT, '.env.example'), env);
  // The database URLs in the example name a user called "you".
  const me = userInfo().username;
  writeFileSync(env, readFileSync(env, 'utf8').replaceAll('postgres://you@', `postgres://${me}@`));
  ok('.env written from .env.example, with your database user in it');
  note('Two values are deliberately blank and only you can fill them:');
  note('  OPENAI_API_KEY        — needed to bring a procedure in. A run needs none.');
  note('  ORBIT_CREDENTIAL_KEY  — encrypts registered passwords. Any long random string.');
  note('And check the three ORBIT_*DATABASE_URL lines. They assume a postgres');
  note(`installed locally answering as ${me}; one in a container is a`);
  note('different role over TCP. .env.example shows that shape.');
}

step('Dependencies');

if (run(PNPM, ['install', '--silent'], { stdio: 'inherit' }).status !== 0) {
  no('pnpm install failed');
  die();
}
ok('workspace installed');

// Playwright ships the driver with the package and the browser separately, so
// a successful install still leaves nothing to drive.
if (run(PNPM, ['--filter', '@orbit/worker', 'exec', 'playwright', 'install', 'chromium']).status === 0) {
  ok('chromium installed for Playwright');
} else {
  no("could not install chromium — try 'pnpm --filter @orbit/worker exec playwright install chromium'");
}

step('Databases');

// Read from .env rather than assumed. Creating `orbit2_dev` and migrating
// `postgres://<you>@localhost/...` works on exactly one kind of machine: a
// postgres installed locally, on a socket, with a role named after you. One in
// a container has none of those, so these three URLs are the truth.
process.loadEnvFile(env);
const api = join(ROOT, 'apps', 'api');

for (const variable of ['ORBIT_OWNER_DATABASE_URL', 'ORBIT_TEST_DATABASE_URL']) {
  const url = process.env[variable];
  if (!url) { no(`${variable} is not set in .env`); die(); }
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));

  const made = run(process.execPath, ['--experimental-strip-types', 'src/create-database.ts', url], { cwd: api });
  if (made.status === 0) {
    ok(`${name} — ${made.stdout.trim()}`);
  } else {
    no(`could not create ${name}`);
    // The commonest failure by far, and the one worth naming: the URLs written
    // from the example guess a postgres installed locally under your own name,
    // and nobody has looked at them yet.
    note(`Orbit read ${variable} from .env and could not reach the server it names.`);
    note('Check it is up, that the role may create a database, and — if your');
    note('postgres is in a container — that the URL is not still the local one');
    note('this script guessed. .env.example shows the containerised shape.');
    for (const line of `${made.stderr}`.trim().split('\n').slice(-3)) note(`  ${line}`);
    die();
  }
}

step('Schema');

// Migrations run as the owner. The application connects as orbit_app, which
// migration 0001 creates and which holds INSERT and SELECT on the immutable
// tables and nothing else — that is what makes a published version impossible
// to rewrite, and it only works if migrations are not run as it.
for (const variable of ['ORBIT_OWNER_DATABASE_URL', 'ORBIT_TEST_DATABASE_URL']) {
  const url = process.env[variable];
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));

  const applied = run(process.execPath, ['--experimental-strip-types', 'src/migrate.ts', url], { cwd: api });
  if (applied.status === 0) {
    const count = (applied.stdout.match(/\.sql/g) ?? []).length;
    ok(`${name} — ${count > 0 ? `${count} migrations applied` : 'already up to date'}`);
  } else {
    no(`${name} — migrations failed`);
    for (const line of `${applied.stdout}${applied.stderr}`.trim().split('\n').slice(-5)) note(line);
    die();
  }
}

mkdirSync(join(ROOT, 'data', 'evidence'), { recursive: true });
mkdirSync(join(ROOT, 'var', 'log'), { recursive: true });
ok('evidence store and logs ready');

step('Ready');
console.log(`  1. Put your OPENAI_API_KEY and an ORBIT_CREDENTIAL_KEY in .env.
  2. scripts/orbit start
  3. Open http://localhost:5173/admin and register the demo application:
       Name        Mortgage Portal
       Surface     browser
       Address     localhost:4101   path /
       Signs in as admin
       Password    anything — the demo portal accepts any value
  4. Open http://localhost:5173/bring-in and write a procedure.

  scripts/orbit status | stop | restart | logs [api|worker|web|portal]`);
