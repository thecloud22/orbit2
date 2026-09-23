/**
 * The green-screen surface: how a run acts on a TN3270 application
 * (Orbit 2.2, C7–C10).
 *
 * The sibling of `surface-browser.ts`. `execute.ts` drives it without knowing
 * which it is: find the step's field again (Decision 18), type, press a key,
 * read, and picture the screen as text.
 */
import type { Binding } from './binder.ts';
import type { Found, OpenSurface, Sought, Surface } from './surface.ts';
import { locate, pictureOf, pixelsOf, type TerminalBinding } from './tn3270/screen.ts';
import { Tn3270Session } from './tn3270/session.ts';

class Tn3270Surface implements Surface {
  readonly kind = 'terminal' as const;
  #session: Tn3270Session;

  constructor(origin: string) { this.#session = new Tn3270Session(origin); }

  async open(_path: string): Promise<void> {
    // A green screen has no paths; the host decides the first screen.
    await this.#session.connect();
  }

  settle(): Promise<void> { return this.#session.settle(); }

  async find(binding: Binding): Promise<Sought> {
    const b = binding as unknown as TerminalBinding;
    if (b?.connector !== 'tn3270') {
      return { found: 'none', by: 'structural', why: 'This step was not mapped on a green screen.' };
    }
    const screen = await this.#session.screen();
    const found = locate(screen, b);
    if (found.found === 'many') return { found: 'many', count: found.count, by: 'structural' };
    if (found.found === 'none') {
      return { found: 'none', by: 'structural', why: found.why,
        ...(found.unexpectedScreen ? { kind: 'terminalScreenUnexpected' as const } : {}) };
    }
    const session = this.#session;
    const it: Found = {
      by: 'structural',
      fill: (value) => session.type(b, value),
      activate: async () => { if (found.key) await session.press(found.key); },
      text: async () => (b.what === 'value' || b.what === 'field' ? session.read(b) : found.field.text.trim()),
      where: async () => pixelsOf(screen, b),
    };
    return { found: 'one', it };
  }

  async capture(): Promise<{ bytes: Buffer; mediaType: string }> {
    return pictureOf(await this.#session.screen());
  }

  close(): Promise<void> { return this.#session.close(); }
}

export const openGreenScreen: OpenSurface = async (origin) => new Tn3270Surface(origin);
