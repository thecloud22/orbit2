#!/usr/bin/env node
/**
 * The faithful green-screen host (Orbit 2.3): a real IBM operating system,
 * MVS 3.8j, as the TK5 distribution, on the Hercules emulator, in Docker.
 *
 * What it is for: the loan-servicing twin in demo/terminal-portal speaks
 * TN3270 but was written by us, so it can only ever behave the way we expect.
 * This one was not: VTAM, TSO, JES2, VSAM and a CICS-compatible transaction
 * monitor (KICKS) behave the way IBM's did, including the ways we did not
 * expect. It is still not z/OS; see README.md for what it cannot prove.
 *
 *   node demo/mvs/host.mjs start            run the host (first time: create it)
 *   node demo/mvs/host.mjs stop             shut MVS down cleanly, then the container
 *   node demo/mvs/host.mjs status           whether it is up and taking logons
 *   node demo/mvs/host.mjs submit job.jcl   run a batch job; print its listing and return codes
 *   node demo/mvs/host.mjs console 'cmd'    a Hercules command (prefix / for an MVS one)
 *
 * Nothing is exposed beyond this machine: every port is bound to 127.0.0.1.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { get } from 'node:http';

export const CONTAINER = 'orbit-mvs';
/** Pinned: TK5 Update 4, Hercules 4.8, for arm64 and amd64. */
export const IMAGE = 'praths/mvs-tk5@sha256:acd4520773523da72705b7d0d32091dd1fa2b525198b792e42c530d2fffc97a8';
/** The disks, kept in a volume so what is installed outlives the container. */
export const VOLUME = 'orbit-mvs-dasd';
export const TN3270_PORT = Number(process.env.ORBIT_MVS_PORT ?? 3272);
export const CONSOLE_PORT = 8038;

const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function state() {
  const r = docker('inspect', '-f', '{{.State.Status}}', CONTAINER);
  return r.status === 0 ? r.stdout.trim() : 'absent';
}

/** The console log since a moment, as Hercules writes it. */
function log(since) {
  const r = docker('logs', '--since', since, CONTAINER);
  return r.stdout + r.stderr;
}

export async function start() {
  const now = state();
  if (now === 'absent') {
    const r = docker('run', '-d', '--name', CONTAINER, '--cap-add', 'SYS_NICE',
      '-p', `127.0.0.1:${TN3270_PORT}:3270`, '-p', `127.0.0.1:${CONSOLE_PORT}:8038`,
      '-v', `${VOLUME}:/opt/tk5/dasd`, IMAGE);
    if (r.status !== 0) throw new Error(`docker run failed: ${r.stderr.trim()}`);
  } else if (now !== 'running') {
    const r = docker('start', CONTAINER);
    if (r.status !== 0) throw new Error(`docker start failed: ${r.stderr.trim()}`);
  }
  await ready();
  await automate();
}

/** Until VTAM takes logons: TCAS says so on the console. */
export async function ready(ceilingMs = 300_000) {
  const until = Date.now() + ceilingMs;
  const started = docker('inspect', '-f', '{{.State.StartedAt}}', CONTAINER).stdout.trim();
  while (Date.now() < until) {
    if (/IKT005I TCAS IS INITIALIZED/.test(log(started))) return;
    await sleep(3000);
  }
  throw new Error('MVS did not come up: TCAS never said it was initialized');
}

/** Hercules' web console ends its header lines with a bare LF, which fetch refuses. */
export function consoleCommand(command) {
  const url = `http://127.0.0.1:${CONSOLE_PORT}/cgi-bin/tasks/cmd?cmd=${encodeURIComponent(command)}`;
  return new Promise((resolve, reject) => {
    get(url, { insecureHTTPParser: true }, (res) => {
      let body = '';
      res.setEncoding('latin1').on('data', (c) => { body += c; }).on('end', () =>
        resolve(body.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')));
    }).on('error', reject);
  });
}

/**
 * What a z/OS TN3270 server does and Hercules does not: tell VTAM when a
 * client comes and goes. Without it a dropped client's TSO session lives on
 * (TSO holds it for a reconnect) and the next sign-on as that user is
 * refused IN USE. So, by the Hercules Automatic Operator: when a client
 * disconnects from a terminal, VTAM deactivates it, which ends its session,
 * and reactivates it; when a client connects, VTAM activates it, in case a
 * reactivation was lost (one issued while the deactivation was completing
 * is). The rules live in Hercules's memory, so every start applies them.
 */
export const RULES = [
  ['HHC01022I 0:0(0C[0-6]) COMM: client .* connection closed', '/V NET,INACT,ID=CUU$1,I'],
  ['IST105I +CUU(0C[0-6]) +NODE NOW INACTIVE', '/V NET,ACT,ID=CUU$1'],
  ['HHC01018I 0:0(0C[0-6]) COMM: client .* connected', '/V NET,ACT,ID=CUU$1'],
];

export async function automate() {
  const listed = await consoleCommand('hao list');
  for (const [target, command] of RULES) {
    if (listed.includes(`target ${target} ->`)) continue;
    await consoleCommand(`hao tgt ${target}`);
    await consoleCommand(`hao cmd ${command}`);
  }
  // Whatever state an earlier drop left the terminals in.
  for (const cuu of ['0C0', '0C1', '0C2', '0C3', '0C4', '0C5', '0C6']) await consoleCommand(`/V NET,ACT,ID=CUU${cuu}`);
}

export async function stop() {
  if (state() !== 'running') return;
  await consoleCommand('script scripts/shutdown');
  const until = Date.now() + 360_000;   // JES2 drains, TSO users are logged off, EOD, quiesce
  while (state() === 'running' && Date.now() < until) await sleep(3000);
  if (state() === 'running') docker('stop', '-t', '30', CONTAINER);
}

/**
 * Submit a job through the socket card reader and wait for JES2 to finish
 * it. Returns its listing (from the class A printer) and each step's
 * condition code; a job that did not run, or abended, is said.
 */
export async function submit(jcl, ceilingMs = 600_000) {
  const name = /^\/\/(\S+)\s+JOB\b/m.exec(jcl)?.[1];
  if (!name) throw new Error('the job has no JOB card');
  for (const [n, line] of jcl.split('\n').entries()) {
    if (line.length > 80) throw new Error(`line ${n + 1} is longer than a card (80): ${line}`);
  }
  const since = new Date(Date.now() - 1000).toISOString();
  const cards = jcl.endsWith('\n') ? jcl : `${jcl}\n`;
  const r = spawnSync('docker', ['exec', '-i', CONTAINER, 'bash', '-c', 'cat > /dev/tcp/127.0.0.1/3505'], { input: cards, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`the card reader would not take the job: ${r.stderr.trim()}`);
  const until = Date.now() + ceilingMs;
  let number = null;
  while (Date.now() < until) {
    const text = log(since);
    number ??= new RegExp(`JOB\\s+(\\d+)\\s+\\$HASP100 ${name}\\s+ON READER`).exec(text)?.[1] ?? null;
    if (number && new RegExp(`JOB\\s+${number}\\s+\\$HASP(150|250) ${name}`).test(text)) break;
    await sleep(1500);
  }
  if (!number) throw new Error(`JES2 never read ${name}`);
  await sleep(1500);
  const printed = execFileSync('docker', ['exec', CONTAINER, 'cat', '/opt/tk5/prt/prt00e.txt'], { encoding: 'latin1', maxBuffer: 1 << 28 });
  const lines = printed.replace(/\f/g, '\n').split('\n');
  const start = lines.findLastIndex((l) => new RegExp(`START\\s+JOB\\s+${number}\\s+${name}\\b`).test(l));
  const end = lines.findLastIndex((l) => new RegExp(`END\\s+JOB\\s+${number}\\s+${name}\\b`).test(l));
  const listing = (start >= 0 ? lines.slice(start, end >= start ? end + 1 : undefined) : [])
    .filter((l) => !/^\*{4}A|^\s*$/.test(l)).join('\n');
  // "IEF142I JOB STEP - …", or "IEF142I JOB STEP PROCSTEP - …" for a step in a procedure.
  const stepOf = (m) => (m[2] ? `${m[1]}.${m[2]}` : m[1]);
  const steps = [...listing.matchAll(/IEF142I\s+\S+\s+(\S+)(?:\s+(\S+))?\s+-\s+STEP WAS EXECUTED - COND CODE (\d{4})/g)]
    .map((m) => ({ step: stepOf(m), code: Number(m[3]) }));
  const abended = [...listing.matchAll(/IEF472I\s+\S+\s+(\S+)(?:\s+(\S+))?\s+-\s+COMPLETION CODE - SYSTEM=(\w+) USER=(\w+)/g)]
    .map((m) => ({ step: stepOf(m), system: m[3], user: m[4] }));
  const notRun = /JOB NOT RUN - JCL ERROR/.test(listing);
  return { name, number: Number(number), listing, steps, abended, notRun,
    ok: !notRun && abended.length === 0 && steps.length > 0 && steps.every((s) => s.code <= 4) };
}

/**
 * A member of a partitioned data set, as text: printed by a job, between
 * two marker lines so that nothing else in the listing is mistaken for it.
 */
export async function member(dsn, user = 'HERC01', password = 'CUL8TR') {
  const mark = (step, text) => [
    `//${step} EXEC PGM=IEBGENER`, '//SYSPRINT DD DUMMY', '//SYSIN    DD DUMMY',
    '//SYSUT2   DD SYSOUT=*', '//SYSUT1   DD *', text, '/*'];
  const jcl = [
    '//ORBITMEM JOB CLASS=A,MSGCLASS=A,MSGLEVEL=(0,0),',
    `//             USER=${user},PASSWORD=${password}`,
    ...mark('BEGIN', '::ORBIT-MEMBER-BEGIN::'),
    '//COPY   EXEC PGM=IEBGENER', '//SYSPRINT DD DUMMY', '//SYSIN    DD DUMMY',
    '//SYSUT2   DD SYSOUT=*', `//SYSUT1   DD DSN=${dsn},DISP=SHR`,
    ...mark('END', '::ORBIT-MEMBER-END::'),
  ].join('\n');
  const job = await submit(jcl);
  if (!job.ok) throw new Error(`${dsn} could not be read:\n${job.listing.split('\n').filter((l) => /IE[CF]\d|ABEND|NOT RUN/.test(l)).join('\n')}`);
  const printed = execFileSync('docker', ['exec', CONTAINER, 'cat', '/opt/tk5/prt/prt00e.txt'], { encoding: 'latin1', maxBuffer: 1 << 28 })
    .replace(/\f/g, '\n').replace(/\r/g, '').split('\n');
  const begin = printed.findLastIndex((l) => l.startsWith('::ORBIT-MEMBER-BEGIN::'));
  const end = printed.findLastIndex((l) => l.startsWith('::ORBIT-MEMBER-END::'));
  if (begin < 0 || end < begin) throw new Error(`${dsn} was printed but could not be found in the listing`);
  return printed.slice(begin + 1, end).map((l) => l.trimEnd()).filter((l) => l !== '').join('\n');
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  if (command === 'start') { await start(); console.log(`MVS is up: tn3270://127.0.0.1:${TN3270_PORT}`); return; }
  if (command === 'stop') { await stop(); console.log('MVS is shut down'); return; }
  if (command === 'status') { console.log(state()); return; }
  if (command === 'console') { console.log(await consoleCommand(arg)); return; }
  if (command === 'submit') {
    const job = await submit(readFileSync(arg, 'utf8'));
    console.log(job.listing);
    console.log(`\n${job.name} (JOB ${job.number}): ${job.notRun ? 'NOT RUN - JCL ERROR' : job.steps.map((s) => `${s.step}=${s.code}`).join(' ')}`
      + `${job.abended.map((a) => ` ${a.step} ABEND S${a.system} U${a.user}`).join('')}`);
    process.exitCode = job.ok ? 0 : 1;
    return;
  }
  console.error('usage: host.mjs start | stop | status | submit job.jcl | console "command"');
  process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
