/**
 * The loan-servicing application on the faithful host (Orbit 2.3): the
 * twin's screens as a CICS program under KICKS, its loans in VSAM, reached by
 * signing on to TSO as the servicing account.
 *
 * Built by batch jobs, as a mainframe shop builds one: the files defined and
 * loaded (IDCAMS, STKCARDS), the mapset assembled (KICKS's BMS generator),
 * the program compiled (MVT ANSI COBOL through KICKS's preprocessor), the
 * tables assembled, and the servicing account's logon made to run it.
 *
 * The loans are the twin's own (demo/terminal-portal/src/servicing-data.ts),
 * so the same loan reads the same on both.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXISTING, LOANS } from '../terminal-portal/src/servicing-data.ts';
import { member, submit } from './host.mjs';

const HERE = import.meta.dirname;
export const ADMIN = { user: 'HERC01', password: 'CUL8TR' };
/** The servicing account: whoever signs on as it lands in the application. */
export const CLERK = { user: 'HERC02', password: 'CUL8TR' };
const KICKS = 'HERC01.KICKSSYS.V1R5M0';
const USERLIB = 'HERC01.KICKS.V1R5M0';
export const LOANS_DSN = 'HERC01.LSV.LOANS';
export const EXIST_DSN = 'HERC01.LSV.EXIST';

const jobCard = (name, notes = []) => [
  `//${name.padEnd(8)} JOB CLASS=A,MSGCLASS=A,MSGLEVEL=(1,1),REGION=8192K,`,
  `//             USER=${ADMIN.user},PASSWORD=${ADMIN.password}`,
  ...notes.map((n) => `//* ${n}`),
];

async function run(jcl, what) {
  const job = await submit(jcl.join('\n'));
  if (!job.ok) {
    const why = job.listing.split('\n').filter((l) => /IKF\d{4}I-[EWC]|IDC\d{4}I|IE[CFW]\d{3}[IE]|KIK|ABEND|NOT RUN|JCL ERROR|\*\*\*\*\*/.test(l)).slice(0, 40).join('\n');
    throw new Error(`${what} failed (${job.name} JOB ${job.number}: ${job.steps.map((s) => `${s.step}=${s.code}`).join(' ')}${job.abended.map((a) => ` ${a.step} S${a.system}`).join('')})\n${why}`);
  }
  return job;
}

// ---- the data -------------------------------------------------------------

const upper = (s) => s.toUpperCase();
const pad = (s, n) => String(s).slice(0, n).padEnd(n);
const digits = (n, whole, frac) => String(Math.round(n * 10 ** frac)).padStart(whole + frac, '0');

/** One loan as the 240-byte record LSVPGM reads (LOAN-REC), in three cards. */
export function loanRecord(l) {
  const r = pad(l.loanNumber, 12) + pad(upper(l.borrower), 24) + pad(upper(l.program), 12)
    + digits(l.amount, 9, 2) + digits(l.noteRate, 1, 3) + digits(l.ltv, 3, 2) + digits(l.dti, 3, 2)
    + digits(l.fico, 3, 0) + digits(l.reserves, 2, 0) + pad(l.flood, 2) + pad(upper(l.property), 24)
    + (l.firstTime ? 'Y' : 'N') + pad(upper(l.education), 24) + pad(upper(l.employment), 16)
    + pad('IN UNDERWRITING', 24) + ' '.repeat(48) + ' '.repeat(7) + ' '.repeat(16);
  if (r.length !== 240) throw new Error(`loan record is ${r.length} bytes, not 240`);
  return r;
}

/** A borrower's existing loans as the 240-byte record (EXIST-REC), in three cards. */
export function existRecord(name, loans) {
  const r = pad(name, 24) + String(loans.length)
    + [0, 1, 2].map((i) => {
      const x = loans[i];
      return x ? pad(x.account, 7) + pad(x.type, 8) + digits(x.balance, 7, 2) + digits(x.daysPastDue, 3, 0) : ' '.repeat(27);
    }).join('') + ' '.repeat(134);
  if (r.length !== 240) throw new Error(`existing-loan record is ${r.length} bytes, not 240`);
  return r;
}

const cards = (record) => record.match(/.{80}/g);

/** Define both files afresh and load them: the seeded state, as a run starts from. */
export async function loadFiles() {
  const loans = [...LOANS].sort((a, b) => pad(a.loanNumber, 12).localeCompare(pad(b.loanNumber, 12)));
  const exist = Object.entries(EXISTING).sort(([a], [b]) => pad(a, 24).localeCompare(pad(b, 24)));
  const cluster = (dsn, lrecl, key) => [
    ` DELETE ${dsn} CLUSTER`,
    ' SET MAXCC = 0',
    ' DEFINE CLUSTER                                       -',
    `      (NAME(${dsn}) VOLUMES(TSO001)                   -`,
    '       TRACKS(5 5) INDEXED                            -',
    '       SHAREOPTIONS(2 3) UNIQUE                       -',
    `       RECORDSIZE(${lrecl} ${lrecl}) KEYS(${key} 0))              -`,
    `     DATA (NAME(${dsn}.DATA))                        -`,
    `    INDEX (NAME(${dsn}.INDEX))`,
  ];
  // Three cards to a record, by LSVLOAD (compiled and run: COBUCG), not by
  // KICKS's STKCARDS, which drops a blank in column 80 and shifts the rest.
  const loader = readFileSync(join(HERE, 'servicing', 'LSVLOAD.cbl'), 'utf8').trimEnd().split('\n');
  const stack = (step, records) => [
    `//${step} EXEC COBUCG`,
    '//COB.SYSIN DD DATA,DLM=@@',
    ...loader,
    '@@',
    '//GO.CARDS DD DATA,DLM=@@',
    ...records.flatMap(cards),
    '@@',
    `//GO.RECS  DD DSN=&&${step},DISP=(,PASS),UNIT=SYSDA,`,
    '//         SPACE=(TRK,(5,5)),DCB=(RECFM=FB,LRECL=240,BLKSIZE=2400)',
  ];
  const repro = (step, from, dsn) => [
    `//${step} EXEC PGM=IDCAMS`,
    '//SYSPRINT DD SYSOUT=*',
    `//IN       DD DSN=&&${from},DISP=(OLD,DELETE)`,
    '//SYSIN    DD *',
    ` REPRO INFILE(IN) OUTDATASET(${dsn})`,
    '/*',
  ];
  return run([
    ...jobCard('LSVDATA', ['THE LOAN-SERVICING FILES, DEFINED AFRESH AND LOADED.']),
    '//DEFINE   EXEC PGM=IDCAMS',
    '//SYSPRINT DD SYSOUT=*',
    '//SYSIN    DD *',
    ...cluster(LOANS_DSN, 240, 12),
    ...cluster(EXIST_DSN, 240, 24),
    '/*',
    ...stack('STKLOAN', loans.map(loanRecord)),
    ...repro('LOADLOAN', 'STKLOAN', LOANS_DSN),
    ...stack('STKEXST', exist.map(([n, l]) => existRecord(n, l))),
    ...repro('LOADEXST', 'STKEXST', EXIST_DSN),
  ], 'defining and loading the loan files');
}

/**
 * The loan file as MVS holds it: each loan's status, conditions and
 * servicing account, read by IDCAMS PRINT. What a run changed is judged here,
 * in the system of record, not by what the run pressed.
 */
export async function readLoans() {
  const job = await run([
    ...jobCard('LSVREAD', ['THE LOAN FILE, AS IT NOW STANDS.']),
    '//PRINT    EXEC PGM=IDCAMS',
    '//SYSPRINT DD SYSOUT=*',
    '//SYSIN    DD *',
    `  PRINT INDATASET(${LOANS_DSN}) CHARACTER`,
    '/*',
  ], 'reading the loan file');
  // Each 240-byte record prints as two lines of 120, trailing blanks trimmed.
  const lines = job.listing.split('\n');
  const loans = {};
  for (const [i, line] of lines.entries()) {
    const key = /^KEY OF RECORD - (\S+)/.exec(line)?.[1];
    if (!key) continue;
    const record = (lines[i + 1] ?? '').padEnd(120) + (lines[i + 2] ?? '').padEnd(120);
    // LOAN-REC: status at 145, four conditions of 12 from 169, account at 217.
    loans[key] = {
      status: record.slice(145, 169).trim(),
      conditions: [0, 1, 2, 3].map((n) => record.slice(169 + 12 * n, 181 + 12 * n).trim()).filter(Boolean),
      account: record.slice(217, 224).trim(),
    };
  }
  return loans;
}

// ---- the mapset and the program -------------------------------------------

export function buildMapset() {
  const source = readFileSync(join(HERE, 'servicing', 'LSVSET.bms'), 'utf8').trimEnd().split('\n');
  return run([
    ...jobCard('LSVMAP', ['THE LOAN-SERVICING MAPSET, THROUGH KICKS\'S BMS GENERATOR.']),
    `//JOBPROC  DD DSN=${KICKS}.PROCLIB,DISP=SHR`,
    '//LSVSET   EXEC KIKMAPS,MAPNAME=LSVSET',
    '//COPY.SYSUT1 DD DATA,DLM=@@',
    ...source,
    '@@',
  ], 'assembling the mapset');
}

/** The programs, one per screen, as a CICS application is usually built. */
export const PROGRAMS = ['LSVPGM', 'LSVDET', 'LSVBRD', 'LSVBOR'];

/**
 * Compile and link one program. MVT ANSI COBOL as it runs on this host
 * abends S0C4 in its first phase (IKFCBL01, a page-translation exception)
 * on some programs: which ones depends on their text and layout, not on
 * anything wrong in them, and it is repeatable for a given text. Programs of
 * a screen's size compile; the one-program version of this application did
 * not. So each program is small, and the build still tries a few layouts
 * (comment lines added) before it gives up, and says when it needed one.
 */
export async function buildProgram(name, say = console.log) {
  const source = readFileSync(join(HERE, 'servicing', `${name}.cbl`), 'utf8').trimEnd().split('\n');
  const at = source.findIndex((l) => /PROCEDURE DIVISION/.test(l)) + 1;
  for (const pad of [0, 1, 2, 3, 5, 8, 13]) {
    const padded = [...source.slice(0, at),
      ...Array(pad).fill('      * LAYOUT PAD FOR THE COMPILER: SEE DEMO/MVS/README.MD'), ...source.slice(at)];
    try {
      const job = await run([
        ...jobCard(`${name.slice(0, 5)}CB`, [`${name}: PREPROCESS, COMPILE TWICE, LINK.`]),
        `//JOBPROC  DD DSN=${KICKS}.PROCLIB,DISP=SHR`,
        // (Overrides in the procedure's step order: MVS 3.8 wants them so.)
        `//${name.padEnd(8)} EXEC K2KCOBCL,`,
        "// PARM.COB1='DMAP,SOURCE,NODECK,NOLOAD,SIZE=3000K,BUF=512K,LIB',",
        '// REGION.COB1=6000K,',
        "// PARM.COB2='NODECK,LOAD,SIZE=3000K,BUF=512K,SUPMAP,LIB',",
        '// REGION.COB2=6000K',
        '//COPY.SYSUT1 DD DATA,DLM=@@',
        ...padded,
        '@@',
        '//LKED.SYSIN DD *',
        ' INCLUDE SKIKLOAD(KIKCOBGL)',
        ` NAME ${name}(R)`,
        '/*',
      ], `compiling ${name}`);
      if (pad) say(`  ${name}: the compiler needed ${pad} lines of layout padding`);
      return job;
    } catch (e) {
      if (!/COB[12]\S* S0C4/.test(String(e.message))) throw e;
      say(`  ${name}: the compiler abended S0C4 with ${pad} lines of padding; trying another layout`);
    }
  }
  throw new Error(`the COBOL compiler abended S0C4 on ${name} at every layout tried`);
}

export async function buildPrograms(say = console.log) {
  for (const name of PROGRAMS) {
    const job = await buildProgram(name, say);
    say(`  ${name}: ${job.steps.map((s) => `${s.step.split('.')[0]}=${s.code}`).join(' ')}`);
  }
}

// ---- the tables -----------------------------------------------------------

/**
 * KICKS's own table, with this application's entries added, assembled with
 * the suffix LS into HERC01's own load library: KICKS's tables are left as
 * they were installed, and our copy is derived from them on the host, so no
 * KICKS source is kept in Orbit's repository (its licence).
 */
async function table(kind, entries) {
  const source = await member(`${KICKS}.INSTLIB(KIK${kind}1$)`);
  const lines = source.split('\n').map((l) => l.slice(0, 72).trimEnd());
  const body = lines.slice(lines.findIndex((l) => /^\/\/ASM\s/.test(l)));
  const final = body.findIndex((l) => new RegExp(`KIK${kind}\\s+TYPE=FINAL`).test(l));
  if (final < 0) throw new Error(`KIK${kind}1$ has no TYPE=FINAL`);
  body.splice(final, 0, ...entries);
  const jcl = body.join('\n')
    .replace('SUFFIX=1$', 'SUFFIX=LS')
    .replace(/\/\/SYSLMOD\s+DD DSN=\S+?SKIKLOAD\(KIK\w+1\$\)/, `//SYSLMOD  DD DSN=${USERLIB}.SKIKLOAD(KIK${kind}LS)`);
  return run([...jobCard(`LSV${kind}`, [`KICKS'S ${kind} WITH THE LOAN-SERVICING ENTRIES, AS KIK${kind}LS.`]), ...jcl.split('\n')],
    `assembling the ${kind}`);
}

export async function buildTables() {
  await table('PCT', [
    'LSV0     KIKPCT TYPE=ENTRY,TRANSID=LSV0,PROGRAM=LSVPGM',
    'LSV1     KIKPCT TYPE=ENTRY,TRANSID=LSV1,PROGRAM=LSVPGM',
  ]);
  await table('PPT', [
    ...PROGRAMS.map((p) => `         KIKPPT TYPE=ENTRY,PROGRAM=${p},PGMLANG=CMDLVL`),
    '         KIKPPT TYPE=ENTRY,PROGRAM=LSVSET,USAGE=MAP',
  ]);
  await table('FCT', [
    '         KIKFCT TYPE=DATASET,DATASET=LOANS',
    '         KIKFCT TYPE=DATASET,DATASET=EXIST',
  ]);
  // The SIT: our tables, and LSV0 as the first transaction, so that KICKS
  // opens on the inquiry screen rather than its good-morning screen.
  return run([
    ...jobCard('LSVSIT', ['THE LOAN-SERVICING SIT: OUR TABLES, LSV0 FIRST.']),
    '//ASM      EXEC PGM=IFOX00,PARM=\'DECK,NOLIST\'',
    '//SYSLIB   DD DSN=SYS1.MACLIB,DISP=SHR',
    `//         DD DSN=${KICKS}.MACLIB,DISP=SHR`,
    '//SYSUT1   DD UNIT=SYSDA,SPACE=(CYL,(2,1))',
    '//SYSUT2   DD UNIT=SYSDA,SPACE=(CYL,(2,1))',
    '//SYSUT3   DD UNIT=SYSDA,SPACE=(CYL,(2,1))',
    '//SYSPRINT DD SYSOUT=*',
    '//SYSLIN   DD DUMMY',
    '//SYSPUNCH DD DSN=&&OBJSET,UNIT=SYSDA,SPACE=(80,(200,200)),DISP=(,PASS)',
    '//SYSIN    DD *',
    ...[
      '         KIKSIT SUFFIX=LS,', '               PCP=1$,PPT=LS,', '               KCP=1$,PCT=LS,',
      '               FCP=1$,FCT=LS,', '               DCP=1$,DCT=1$,', '               TCP=2$,BMS=1$,',
      '               SCP=1$,FFREEKB=NO,',
    ].map((l) => `${l.padEnd(71)}*`),
    '               TSP=1$,PLTPI=LSV0',
    '         LTORG',
    '         END',
    '/*',
    "//LKED     EXEC PGM=IEWL,PARM='XREF,MAP,LET,NCAL',COND=(0,NE,ASM)",
    '//SYSLIN   DD DSN=&&OBJSET,DISP=(OLD,DELETE)',
    '//SYSIN    DD DUMMY',
    `//SYSLMOD  DD DSN=${USERLIB}.SKIKLOAD(KIKSITLS),DISP=SHR`,
    '//SYSUT1   DD UNIT=SYSDA,SPACE=(CYL,(2,1))',
    '//SYSPRINT DD SYSOUT=*',
  ], 'assembling the SIT');
}

// ---- the servicing account -----------------------------------------------

/**
 * The servicing account's logon runs the application and nothing else. TK5's
 * logon CLIST runs &SYSUID..CMDPROC(MYLOGON) when there is one; ours
 * allocates the loan files, starts KICKS with our SIT, and logs off when the
 * application signs off, so the session is the application.
 */
export function setUpClerk() {
  const u = CLERK.user;
  return run([
    ...jobCard('LSVCLERK', [`${u} SIGNS ON STRAIGHT INTO LOAN SERVICING.`]),
    '//MAKE     EXEC PGM=IEFBR14',
    `//CMDPROC  DD DSN=${u}.CMDPROC,DISP=(MOD,CATLG),UNIT=SYSDA,`,
    '//            SPACE=(TRK,(5,5,10)),DCB=(RECFM=FB,LRECL=80,BLKSIZE=3120)',
    '//WRITE    EXEC PGM=IEBGENER',
    '//SYSPRINT DD SYSOUT=*',
    '//SYSIN    DD DUMMY',
    `//SYSUT2   DD DSN=${u}.CMDPROC(MYLOGON),DISP=SHR`,
    // DATA, not *: a CLIST comment starting in column 1 would end a DD *.
    '//SYSUT1   DD DATA,DLM=@@',
    'PROC 0',
    ' /* MERIDIAN HOME LENDING LOAN SERVICING (ORBIT 2.3): THIS   */',
    ' /* ACCOUNT IS THE APPLICATION. SIGNING OFF IT LOGS OFF.     */',
    'CONTROL NOMSG',
    'FREE FI(LOANS EXIST)',
    'CONTROL MSG',
    `ALLOC FI(LOANS) DA('${LOANS_DSN}') SHR`,
    `ALLOC FI(EXIST) DA('${EXIST_DSN}') SHR`,
    `EX '${KICKS}.CLIST(KICKS)' +`,
    "   'SIT(LS) TSOID(HERC01) QUIET(Z) TCP(1$)'",
    'CONTROL NOMSG',
    'FREE FI(LOANS EXIST)',
    'LOGOFF',
    '@@',
  ], 'setting up the servicing account');
}

/** Everything, in order; each step replaces what it builds. */
export async function buildServicing(say = console.log) {
  say('loan files'); await loadFiles();
  say('mapset'); await buildMapset();
  say('programs'); await buildPrograms(say);
  say('tables'); await buildTables();
  say('servicing account'); await setUpClerk();
}
