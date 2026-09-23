/**
 * The s3270 emulator, as a child process driven over a private pipe
 * (Orbit 2.2, C5).
 *
 * Orbit never decodes the 3270 datastream itself: x3270's scripting emulator
 * does, so the practice host and the connector cannot share a misreading. One
 * process per session, owned by whoever opened it; the pipe dies with the
 * worker, so a worker that dies leaves no signed-in session behind.
 *
 * The protocol is s3270's script mode: one command per line on stdin; for each,
 * zero or more `data: …` lines, a status line, then `ok` or `error`.
 */
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';

/** s3270's status line, the parts Orbit reads. */
export interface Status {
  /** U unlocked, L locked, E error (a locked keyboard the operator must reset). */
  keyboard: 'U' | 'L' | 'E';
  /** Connected, and to what; `N` when not. */
  connected: boolean;
  rows: number;
  columns: number;
  cursor: { row: number; column: number };
}

export interface Answer {
  ok: boolean;
  data: string[];
  status: Status | null;
}

export type TerminalFailure = 'applicationUnavailable' | 'timedOut' | 'terminalKeyboardLocked' | 'terminalScreenUnexpected';

export class TerminalError extends Error {
  readonly kind: TerminalFailure;
  constructor(kind: TerminalFailure, message: string) {
    super(message);
    this.kind = kind;
  }
}

function parseStatus(line: string): Status | null {
  const f = line.trim().split(/\s+/);
  if (f.length < 12) return null;
  const keyboard = f[0] === 'U' ? 'U' : f[0] === 'E' ? 'E' : 'L';
  return {
    keyboard,
    connected: (f[3] ?? 'N').startsWith('C'),
    rows: Number(f[6]), columns: Number(f[7]),
    cursor: { row: Number(f[8]), column: Number(f[9]) },
  };
}

/** Whether this worker has the emulator, said in words when not (C4). */
export function s3270Ready(): { ready: true } | { ready: false; why: string } {
  const probe = spawnSync('s3270', ['--version'], { encoding: 'utf8', timeout: 5000 });
  if (probe.error || probe.status !== 0) {
    return { ready: false, why: 'the s3270 emulator is not installed on this worker (brew install x3270, or apt install s3270)' };
  }
  return { ready: true };
}

export class S3270 {
  #child: ChildProcessWithoutNullStreams;
  #buffer = '';
  #lines: string[] = [];
  #waiting: Array<() => void> = [];
  #queue: Promise<unknown> = Promise.resolve();
  #exited = false;

  constructor(options: { model?: string; codePage?: string } = {}) {
    const args = ['-utf8'];
    if (options.model) args.push('-model', options.model);
    if (options.codePage) args.push('-codepage', options.codePage);
    this.#child = spawn('s3270', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.#child.stdout.setEncoding('utf8');
    this.#child.stdout.on('data', (chunk: string) => {
      this.#buffer += chunk;
      let at: number;
      while ((at = this.#buffer.indexOf('\n')) >= 0) {
        this.#lines.push(this.#buffer.slice(0, at));
        this.#buffer = this.#buffer.slice(at + 1);
      }
      for (const wake of this.#waiting.splice(0)) wake();
    });
    this.#child.on('exit', () => {
      this.#exited = true;
      for (const wake of this.#waiting.splice(0)) wake();
    });
    this.#child.stderr.resume();
  }

  /** One command, in order behind any before it, with a ceiling on how long it may take. */
  run(command: string, ceilingMs = 30_000): Promise<Answer> {
    const next = this.#queue.then(() => this.#one(command, ceilingMs));
    this.#queue = next.catch(() => undefined);
    return next;
  }

  async #one(command: string, ceilingMs: number): Promise<Answer> {
    if (this.#exited) throw new TerminalError('applicationUnavailable', 'The terminal emulator is no longer running.');
    this.#child.stdin.write(`${command}\n`);
    const until = Date.now() + ceilingMs;
    const data: string[] = [];
    let status: Status | null = null;
    for (;;) {
      while (this.#lines.length) {
        const line = this.#lines.shift()!;
        if (line.startsWith('data: ')) { data.push(line.slice(6)); continue; }
        if (line === 'data:') { data.push(''); continue; }
        if (line === 'ok' || line === 'error') return { ok: line === 'ok', data, status };
        status = parseStatus(line) ?? status;
      }
      if (this.#exited) throw new TerminalError('applicationUnavailable', 'The terminal emulator stopped.');
      const left = until - Date.now();
      if (left <= 0) throw new TerminalError('timedOut', `The terminal did not answer "${command.split('(')[0]}" within ${Math.round(ceilingMs / 1000)} s.`);
      await new Promise<void>((wake) => {
        const timer = setTimeout(wake, left);
        this.#waiting.push(() => { clearTimeout(timer); wake(); });
      });
    }
  }

  async close(): Promise<void> {
    if (this.#exited) return;
    await this.run('Quit()', 3000).catch(() => undefined);
    if (!this.#exited) this.#child.kill();
  }
}

/** A string as s3270's `String()` takes it: quoted, with quotes and backslashes escaped. */
export function quoted(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
