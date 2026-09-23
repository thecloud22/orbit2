#!/usr/bin/env node
/**
 * Builds the faithful green-screen host from nothing (Orbit 2.3), and does
 * again only what is not done yet:
 *
 *   node demo/mvs/setup.mjs
 *
 * 1. MVS 3.8j (TK5) in Docker, its disks in a volume (host.mjs).
 * 2. KICKS for TSO 1.5.0, fetched from its published distribution, checked
 *    against the digest below, loaded through a card reader and installed the
 *    way its guide says. Its licence lets it be used here but not copied into
 *    a repository, so Orbit keeps the steps, never the files.
 * 3. TSO told to end a session whose line drops (RECONLIM=0), as a CICS
 *    terminal's session ends; TK5's own setting is kept as TSOKEYTK.
 * 4. The loan-servicing application (servicing.mjs).
 *
 * About an hour the first time, most of it MVS compiling and loading.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONTAINER, consoleCommand, member, start, submit } from './host.mjs';
import { ADMIN, CLERK, buildServicing } from './servicing.mjs';
import { Tso } from './tso.mjs';

const KICKS_ZIP = 'https://raw.githubusercontent.com/moshix/kicks/d2fa27b17c659b9f3c9d3cf33442d43679f1337f/kicks-tso-v1r5m0.zip';
const KICKS_SHA256 = 'e0df01bee1988c1c73dbb0a49e082e8ae9fda5822a02f8b9c798583565c177f1';
const say = (s) => console.log(s);

const card = (name) => [
  `//${name.padEnd(8)} JOB CLASS=A,MSGCLASS=A,MSGLEVEL=(1,1),REGION=4096K,`,
  `//             USER=${ADMIN.user},PASSWORD=${ADMIN.password}`,
];

async function ok(jcl, what) {
  const job = await submit(Array.isArray(jcl) ? jcl.join('\n') : jcl);
  if (!job.ok) throw new Error(`${what} failed (${job.name} JOB ${job.number}): ${job.steps.map((s) => `${s.step}=${s.code}`).join(' ')}`);
  return job;
}

async function catalogued(dsn) {
  const job = await submit([...card('ORBITLC'), '//LIST     EXEC PGM=IDCAMS', '//SYSPRINT DD SYSOUT=*',
    '//SYSIN    DD *', `  LISTCAT ENTRIES(${dsn})`, '/*'].join('\n'));
  return job.steps[0]?.code === 0;
}

/**
 * A job from KICKS's distribution, made to run here: class A (it asks for
 * C, which TK5 does not run), signed by the installing user, and its VSAM on
 * TSO001, the volume HERC01's catalogue owns (it asks for PUB002, which TK5
 * does not have).
 */
export function localise(jcl) {
  const lines = jcl.split('\n').map((l) => l.slice(0, 72).trimEnd());
  let last = lines.findIndex((l) => /^\/\/\S+\s+JOB\b/.test(l));
  while (lines[last].endsWith(',')) last++;
  lines[0] = lines[0].replace(/CLASS=[A-Z0-9]/, 'CLASS=A');
  lines.splice(last, 1, `${lines[last]},`, `//             USER=${ADMIN.user},PASSWORD=${ADMIN.password}`);
  return lines.join('\n').replaceAll('PUB002', 'TSO001');
}

async function installKicks() {
  if (await catalogued('HERC01.KICKSSYS.V1R5M0.SKIKLOAD')) { say('KICKS: installed'); return; }

  say('KICKS: fetching the distribution');
  const zip = Buffer.from(await (await fetch(KICKS_ZIP)).arrayBuffer());
  const digest = createHash('sha256').update(zip).digest('hex');
  if (digest !== KICKS_SHA256) throw new Error(`the KICKS package is not the one checked (sha256 ${digest})`);
  const dir = mkdtempSync(join(tmpdir(), 'kicks-'));
  writeFileSync(join(dir, 'kicks.zip'), zip);
  const xmi = execFileSync('unzip', ['-p', join(dir, 'kicks.zip'), 'kicks-tso-v1r5m0/kicks-tso-v1r5m0.xmi'], { maxBuffer: 1 << 26 });
  writeFileSync(join(dir, 'kicks.xmi'), xmi);
  execFileSync('docker', ['cp', join(dir, 'kicks.xmi'), `${CONTAINER}:/opt/tk5/jcl/kicks.xmi`]);

  say('KICKS: loading it through card reader 10C, and receiving it');
  await consoleCommand('devinit 10c jcl/kicks.xmi ebcdic');
  await ok([...card('KGETXMI'),
    '//SCRATCH  EXEC PGM=IEFBR14',
    '//SYSUT2   DD DSN=HERC01.KICKS.V1R5M0.XMI,DISP=(MOD,DELETE),',
    '//            UNIT=SYSDA,SPACE=(TRK,(0))',
    '//LOAD     EXEC PGM=IEBGENER',
    '//SYSPRINT DD SYSOUT=*',
    '//SYSIN    DD DUMMY,DCB=BLKSIZE=80',
    '//SYSUT1   DD UNIT=10C,DISP=OLD,DCB=(RECFM=FB,LRECL=80,BLKSIZE=3200)',
    '//SYSUT2   DD DSN=HERC01.KICKS.V1R5M0.XMI,DISP=(,CATLG),',
    '//            DCB=(DSORG=PS,RECFM=FB,LRECL=80,BLKSIZE=3200),',
    '//            UNIT=SYSDA,SPACE=(TRK,(225,15),RLSE)'], 'loading the XMI');
  await ok([...card('KRCVXMI'),
    '//RECV370  EXEC PGM=RECV370',
    '//RECVLOG  DD SYSOUT=*',
    '//XMITIN   DD DSN=HERC01.KICKS.V1R5M0.XMI,DISP=SHR',
    '//SYSPRINT DD SYSOUT=*',
    '//SYSUT1   DD DSN=&&SYSUT1,UNIT=SYSALLDA,',
    '//            SPACE=(TRK,(300,60)),DISP=(NEW,DELETE,DELETE)',
    '//SYSUT2   DD DSN=HERC01.KICKS.V1R5M0.BIGPDS,',
    '//            UNIT=(SYSALLDA,SEP=SYSUT1),',
    '//            SPACE=(TRK,(300,60,20)),DISP=(NEW,CATLG,DELETE)',
    '//SYSIN    DD DUMMY'], 'receiving the XMI');
  await ok(localise(await member('HERC01.KICKS.V1R5M0.BIGPDS(V1R5M0)')), 'receiving the KICKS libraries');

  // KFIX reads its answer with READ, which batch TSO never satisfies, and
  // takes the user from &SYSUID, which batch leaves empty: it runs at a
  // terminal, as the guide says.
  say('KICKS: customising it at a TSO READY prompt (KFIX)');
  const tso = new Tso();
  try {
    await tso.connect('127.0.0.1:3272');
    await tso.signOn(ADMIN.user, ADMIN.password);
    const out = await tso.command(`EXEC 'HERC01.KICKSSYS.V1R5M0.CLIST(KFIX)'`, [[/TYPE YES TO CONTINUE/, 'YES']], 900_000);
    if (!/DONE!/.test(out)) throw new Error(`KFIX did not finish:\n${out.split('\n').slice(-10).join('\n')}`);
  } finally {
    await tso.logOff();
    await tso.close();
  }

  say('KICKS: loading its VSAM files');
  // The guide puts LOADSDB in the KICKSSYS library; it is in KICKS's.
  for (const m of ['HERC01.KICKS.V1R5M0.INSTLIB(LOADMUR)', 'HERC01.KICKS.V1R5M0.INSTLIB(LOADTAC)',
    'HERC01.KICKS.V1R5M0.INSTLIB(LOADSDB)', 'HERC01.KICKSSYS.V1R5M0.INSTLIB(LODINTRA)',
    'HERC01.KICKSSYS.V1R5M0.INSTLIB(LODTEMP)']) {
    await ok(localise(await member(m)), m);
  }
  say('KICKS: installed');
}

async function endDroppedSessions() {
  const key = await member('SYS1.PARMLIB(TSOKEY00)');
  if (/RECONLIM=0,/.test(key)) { say('TSO: a dropped session ends'); return; }
  const changed = key.split('\n').map((l) => (/^RECONLIM=/.test(l)
    ? 'RECONLIM=0,                      /* ORBIT: END A DROPPED SESSION     */' : l.slice(0, 71)));
  await ok([...card('ORBITKEY'),
    '//* KEEP TK5\'S TSOKEY00 AS TSOKEYTK; END A SESSION WHOSE LINE DROPS.',
    '//SAVE     EXEC PGM=IEBGENER',
    '//SYSPRINT DD SYSOUT=*',
    '//SYSIN    DD DUMMY',
    '//SYSUT1   DD DSN=SYS1.PARMLIB(TSOKEY00),DISP=SHR',
    '//SYSUT2   DD DSN=SYS1.PARMLIB(TSOKEYTK),DISP=SHR',
    '//WRITE    EXEC PGM=IEBGENER,COND=(0,NE)',
    '//SYSPRINT DD SYSOUT=*',
    '//SYSIN    DD DUMMY',
    '//SYSUT2   DD DSN=SYS1.PARMLIB(TSOKEY00),DISP=SHR',
    '//SYSUT1   DD DATA,DLM=@@',
    ...changed,
    '@@'], 'setting RECONLIM=0');
  // TSO reads TSOKEY00 when it starts.
  await consoleCommand('/P TSO');
  await new Promise((r) => setTimeout(r, 10_000));
  await consoleCommand('/S TSO');
  await new Promise((r) => setTimeout(r, 15_000));
  say('TSO: a dropped session ends (restarted)');
}

async function main() {
  say('MVS: starting'); await start();
  await installKicks();
  await endDroppedSessions();
  say('loan servicing: building'); await buildServicing(say);
  say(`\nready: tn3270://127.0.0.1:3272, sign on as ${CLERK.user}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Refuse early, in words, rather than half-way through an hour.
  for (const tool of ['docker', 's3270', 'unzip']) {
    if (spawnSync(tool, ['--version']).error) { console.error(`setup needs ${tool}`); process.exit(2); }
  }
  await main();
}
