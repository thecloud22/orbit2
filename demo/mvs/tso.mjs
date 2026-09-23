/**
 * A TSO terminal, for setting the host up (Orbit 2.3): sign on, get to
 * READY, run a command, answer what it asks, log off.
 *
 * Some of KICKS's installation only runs at a terminal. Its KFIX CLIST
 * reads its answer with READ, which batch TSO on MVS 3.8 never satisfies,
 * and it takes the user ID from &SYSUID, which batch leaves empty. So the
 * host is set up the way its guide says, at a READY prompt, through s3270.
 * This is the host's own tooling, not Orbit's connector: Orbit is what is
 * being tested against the host, so it does not build it.
 */
import { spawn } from 'node:child_process';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Tso {
  #p;
  #buffer = '';
  #waiting = [];
  /** Everything TSO has written, screen after screen, for the caller to read. */
  transcript = [];

  constructor() {
    this.#p = spawn('s3270', ['-utf8', '-model', '3278-4'], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.#p.stdout.setEncoding('utf8').on('data', (d) => {
      this.#buffer += d;
      let m;
      while ((m = /^(ok|error)$/m.exec(this.#buffer))) {
        const end = m.index + m[0].length + 1;
        const out = this.#buffer.slice(0, end);
        this.#buffer = this.#buffer.slice(end);
        this.#waiting.shift()?.(out);
      }
    });
  }

  run(command) {
    return new Promise((resolve) => { this.#waiting.push(resolve); this.#p.stdin.write(`${command}\n`); });
  }

  async lines() {
    const out = await this.run('Ascii()');
    return out.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6).trimEnd());
  }

  async text() { return (await this.lines()).filter((l) => l.trim()).join('\n'); }

  /** Press a key and wait until the host has stopped writing. */
  async press(key = 'Enter()') {
    await this.run(key);
    await this.run('Wait(30,Unlock)');
    do await this.run('Ascii(0,0,1)');
    while (/^ok$/m.test(await this.run('Wait(0.5,Output)')));
  }

  async type(text) {
    const r = await this.run(`String("${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`);
    if (!/^ok$/m.test(r)) throw new Error(`TSO would not take "${text}" (keyboard locked)`);
  }

  async connect(host) {
    await this.run(`Connect(${host})`);
    if (!/^ok$/m.test(await this.run('Wait(30,InputField)'))) { await this.run('Clear()'); await this.run('Wait(30,InputField)'); }
  }

  /** From VTAM's Logon screen to READY, past the pauses and out of ISPF. */
  async signOn(user, password) {
    await this.type(`LOGON ${user}`);
    await this.press();
    let screen = await this.text();
    if (/IN USE/.test(screen)) throw new Error(`${user} is signed on elsewhere: ${screen.split('\n')[0]}`);
    await this.type(password);
    await this.press();
    for (let i = 0; i < 12; i++) {
      screen = await this.text();
      this.transcript.push(screen);
      if (/NOT AUTHORIZED|REENTER/.test(screen)) throw new Error(`${user} could not sign on: ${screen.split('\n').at(-2)}`);
      if (/Option\s+===>/.test(screen)) { await this.type('X'); await this.press(); continue; }
      if (/^\s*READY\s*$/m.test(screen.split('\n').slice(-2).join('\n'))) return;
      await this.press();
    }
    throw new Error(`TSO never came to READY:\n${screen}`);
  }

  /**
   * A command at READY, until READY comes back. `answers` pairs a prompt
   * with what to type: [[/TYPE YES TO CONTINUE/, 'YES']].
   */
  async command(text, answers = [], ceilingMs = 600_000) {
    const until = Date.now() + ceilingMs;
    const seen = [];
    await this.type(text);
    await this.press();
    const answered = new Set();
    while (Date.now() < until) {
      const lines = (await this.lines()).filter((l) => l.trim());
      seen.push(...lines);
      this.transcript.push(lines.join('\n'));
      const last = lines.at(-1)?.trim() ?? '';
      if (last === 'READY') return seen.join('\n');
      const answer = answers.find(([asks], i) => !answered.has(i) && lines.some((l) => asks.test(l)));
      if (answer) {
        answered.add(answers.indexOf(answer));
        await this.type(answer[1]);
      }
      await this.press();
      await sleep(200);
    }
    throw new Error(`"${text}" did not come back to READY:\n${seen.slice(-20).join('\n')}`);
  }

  async logOff() {
    await this.type('LOGOFF').catch(() => undefined);
    await this.press().catch(() => undefined);
  }

  async close() {
    await this.run('Quit()').catch(() => undefined);
    this.#p.kill();
  }
}
