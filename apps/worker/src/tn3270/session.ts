/**
 * One TN3270 session: connected, read, typed into, pressed (Orbit 2.2, C5–C7).
 *
 * Shared by the walk (`looking-tn3270.ts`) and the run (`surface-tn3270.ts`),
 * so both touch a green screen the same way: type only inside an unprotected
 * field, press a key, and treat "settled" as the keyboard unlocked with the
 * host's answer on the screen. A keyboard left locked is said, not retried.
 */
import { S3270, TerminalError, quoted } from './s3270.ts';
import { commandFor, parseBuffer, type Screen } from './screen.ts';

/**
 * Where the application is, from its origin: `tn3270://host:port`, or
 * `tn3270s://` for TLS, with the registration's settings as a query —
 * `?codePage=cp037&model=3278-2&luName=LU01` — so that nothing between the
 * registry and the emulator has to know a green screen has settings.
 */
export function hostOf(origin: string): { host: string; tls: boolean; codePage?: string; model?: string; luName?: string } {
  const [base, query = ''] = origin.trim().split('?');
  const m = /^([a-z0-9]+):\/\/(.+?)\/?$/i.exec(base!);
  const scheme = (m?.[1] ?? '').toLowerCase();
  const host = m ? m[2]! : base!;
  const q = new URLSearchParams(query);
  const setting = (k: string) => (q.get(k) ? { [k]: q.get(k)! } : {});
  return { host, tls: scheme === 'tn3270s' || scheme === 'https', ...setting('codePage'), ...setting('model'), ...setting('luName') };
}

/** How long a key may take to be answered, and a connection to be made. */
const ANSWER_MS = 15_000;

export class Tn3270Session {
  #emulator: S3270 | null = null;
  #origin: string;

  constructor(origin: string) { this.#origin = origin; }

  get connected(): boolean { return this.#emulator !== null; }

  /** Connect, and wait for the host's first screen to take input. */
  async connect(): Promise<void> {
    if (this.#emulator) return;
    const { host, tls, codePage, model, luName } = hostOf(this.#origin);
    const emulator = new S3270({ ...(codePage ? { codePage } : {}), ...(model ? { model } : {}) });
    this.#emulator = emulator;
    const done = await emulator.run(`Connect(${tls ? 'L:' : ''}${luName ? `${luName}@` : ''}${host})`, ANSWER_MS);
    if (!done.ok || !done.status?.connected) {
      await this.close();
      throw new TerminalError('applicationUnavailable',
        `The host at ${host} refused the connection or did not answer${done.data.length ? `: ${done.data.join(' ')}` : ''}.`);
    }
    await this.#wait('Wait(15,InputField)');
  }

  async disconnect(): Promise<void> { await this.close(); }

  async close(): Promise<void> {
    const e = this.#emulator;
    this.#emulator = null;
    await e?.close();
  }

  #need(): S3270 {
    if (!this.#emulator) throw new TerminalError('applicationUnavailable', 'The terminal session is not connected.');
    return this.#emulator;
  }

  async #wait(command: string): Promise<void> {
    const done = await this.#need().run(command, ANSWER_MS + 5000);
    if (!done.ok) {
      throw new TerminalError('timedOut', `The host did not answer in time (${command.replace(/\(.*$/, '')}).`);
    }
  }

  /** The screen as it now stands. */
  async screen(): Promise<Screen> {
    const done = await this.#need().run('ReadBuffer(Ascii)');
    if (!done.ok) throw new TerminalError('applicationUnavailable', 'The screen could not be read.');
    return parseBuffer(done.data);
  }

  /** Type a value into the field whose data begins at this row and column. */
  async type(at: { row: number; column: number; length: number }, value: string): Promise<void> {
    const e = this.#need();
    await e.run(`MoveCursor(${at.row},${at.column})`);
    await e.run('EraseEOF()');
    const done = await e.run(`String(${quoted(value.slice(0, Math.max(0, at.length)))})`);
    if (!done.ok || done.status?.keyboard !== 'U') {
      await e.run('Reset()');
      throw new TerminalError('terminalKeyboardLocked',
        `The keyboard locked when a value was typed at row ${at.row + 1}, column ${at.column + 1}: that is not a field that takes input.`);
    }
  }

  /** What a field now holds, trimmed. */
  async read(at: { row: number; column: number; length: number }): Promise<string> {
    const done = await this.#need().run(`Ascii(${at.row},${at.column},${Math.max(1, at.length)})`);
    return done.ok ? done.data.join('').trim() : '';
  }

  /** Press a key and wait until the host has answered and the keyboard is unlocked. */
  async press(key: string): Promise<void> {
    const e = this.#need();
    const sent = await e.run(commandFor(key), ANSWER_MS);
    if (!sent.ok) throw new TerminalError('terminalKeyboardLocked', `${key} could not be pressed: the keyboard was locked.`);
    await this.settle();
  }

  async settle(): Promise<void> {
    const e = this.#need();
    const done = await e.run('Wait(15,Unlock)', ANSWER_MS + 5000);
    if (!done.ok) throw new TerminalError('timedOut', 'The host did not answer within 15 seconds; the keyboard is still locked.');
    if (done.status?.keyboard === 'E') {
      throw new TerminalError('terminalKeyboardLocked', 'The keyboard is locked in an error state the host set.');
    }
  }
}
