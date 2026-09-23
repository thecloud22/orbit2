/**
 * A green screen, as the walk sees it while an agent is built (Orbit 2.2, C6).
 *
 * The sibling of `looking-browser.ts`, answering the same questions: the
 * screen as the numbered list the model is shown, a picture of it, typing and
 * pressing. The walk above never learns which it is talking to.
 */
import type { Step } from '@orbit/contract';
import { toType, type Box, type Looking, type OpenLooking, type Typing } from './looking.ts';
import type { Seen } from './snapshot.ts';
import { fractionOf, locate, pictureOf, seenOf, type TerminalBinding } from './tn3270/screen.ts';
import { Tn3270Session, hostOf } from './tn3270/session.ts';

const bindingOf = (s: Seen) => s.binding as unknown as TerminalBinding;

class Tn3270Looking implements Looking {
  #session: Tn3270Session;
  #where: string;
  #identity = '';
  /** Typed since the last key, to be typed again if the screen has lost it (as the browser does). */
  #typed: Array<{ at: TerminalBinding; value: string }> = [];

  constructor(origin: string) {
    this.#session = new Tn3270Session(origin);
    this.#where = hostOf(origin).host;
  }

  place(): string { return `${this.#where} ${this.#identity}`.trim(); }

  async open(_path: string): Promise<void> {
    // A green screen has no paths: opening it is connecting, and the host
    // decides the first screen.
    await this.#session.connect();
    this.#identity = (await this.#session.screen()).identity;
  }

  async look(): Promise<Seen[]> {
    const screen = await this.#session.screen();
    this.#identity = screen.identity;
    return seenOf(screen);
  }

  async visibleText(): Promise<string> {
    return (await this.#session.screen()).lines.join('\n');
  }

  async picture(): Promise<{ bytes: Buffer; mediaType: string } | null> {
    return pictureOf(await this.#session.screen());
  }

  async boxOf(element: Seen): Promise<Box | undefined> {
    const b = bindingOf(element);
    return fractionOf(await this.#session.screen(), b);
  }

  async type(element: Seen, value: string): Promise<void> {
    const at = bindingOf(element);
    await this.#session.type(at, value).catch(() => undefined);
    this.#typed.push({ at, value });
  }

  async press(element: Seen): Promise<void> {
    for (const t of this.#typed.splice(0)) {
      if ((await this.#session.read(t.at).catch(() => '')) !== t.value.slice(0, t.at.length).trim()) {
        await this.#session.type(t.at, t.value).catch(() => undefined);
      }
    }
    const key = bindingOf(element).key;
    if (key) await this.#session.press(key).catch(() => undefined);
  }

  async restart(path: string): Promise<void> {
    await this.#session.disconnect();
    await this.open(path);
  }

  async replay(step: Step, typing: Typing): Promise<{ ok: true } | { ok: false; why: string }> {
    if (step.kind === 'open') { await this.open(step.path); return { ok: true }; }
    if (step.kind === 'handOff') { await this.restart('/'); return { ok: true }; }
    const target = step.kind === 'enter' ? step.into : step.kind === 'activate' ? step.control : step.kind === 'read' ? step.region : null;
    if (!target) return { ok: false, why: `a ${step.kind} step is not replayed.` };
    if (step.kind === 'activate' && step.changesARecord) return { ok: false, why: 'it changes a record, and replay never does.' };
    const b = target.binding as TerminalBinding;
    const found = locate(await this.#session.screen(), b);
    if (found.found !== 'one') {
      if (step.kind === 'read' && !step.produces.required) return { ok: true };
      return { ok: false, why: found.found === 'many' ? `"${target.label}" is on the screen ${found.count} times.` : found.why };
    }
    if (step.kind === 'enter') await this.#session.type(found.field, toType(step.value, typing));
    if (step.kind === 'activate' && found.key) await this.#session.press(found.key);
    return { ok: true };
  }

  close(): Promise<void> { return this.#session.close(); }
}

export const lookAtGreenScreen: OpenLooking = async (origin) => new Tn3270Looking(origin);
