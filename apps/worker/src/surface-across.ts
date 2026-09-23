/**
 * One run across several applications (Orbit 2.2, C12; Decision 19, draft).
 *
 * A session per application, each through its own connector, opened when the
 * run first needs it and kept until the run ends. The executor still sees one
 * `Surface`: every step acts on whichever application has focus, and an `open`
 * step moves focus. The first `open` of an application connects and goes to
 * its path; a later one only moves focus back to it — moving between systems
 * is not a navigation, and the web page is still where the run left it.
 */
import { applicationKey } from '@orbit/contract';
import type { Binding } from './binder.ts';
import type { OpenSurface, Sought, Surface } from './surface.ts';

export interface Reachable {
  /** As the version names it, which is what an `open` step names. */
  name: string;
  origin: string;
  open: OpenSurface;
  /** The account the version says this application signs in as. */
  signsInAs: string | null;
}

class AcrossSurface implements Surface {
  #apps: Reachable[];
  #open = new Map<string, Surface>();
  #focus: string;

  constructor(apps: Reachable[]) {
    this.#apps = apps;
    this.#focus = apps[0]!.name;
  }

  get kind(): Surface['kind'] { return this.#open.get(this.#focus)?.kind ?? 'browser'; }

  /** `app` is what a single-application version has always named its one application. */
  #resolve(name?: string): Reachable {
    return this.#apps.find((a) => a.name === name || applicationKey(a.name) === name) ?? this.#apps[0]!;
  }

  #current(): Surface {
    const s = this.#open.get(this.#focus);
    if (!s) throw new Error(`${this.#focus} has not been opened in this run.`);
    return s;
  }

  async open(path: string, application?: string): Promise<void> {
    const app = this.#resolve(application);
    this.#focus = app.name;
    if (this.#open.has(app.name)) return;
    const s = await app.open(app.origin);
    this.#open.set(app.name, s);
    await s.open(path);
  }

  settle(): Promise<void> { return this.#current().settle(); }
  find(binding: Binding): Promise<Sought> { return this.#current().find(binding); }
  capture(): Promise<{ bytes: Buffer; mediaType: string }> { return this.#current().capture(); }

  application(): string { return this.#focus; }
  signsInAs(): string | null { return this.#resolve(this.#focus).signsInAs; }

  async close(): Promise<void> {
    for (const s of this.#open.values()) await s.close().catch(() => undefined);
    this.#open.clear();
  }
}

export function surfaceAcross(apps: Reachable[]): Surface {
  if (apps.length === 0) throw new Error('A run needs at least one application.');
  return new AcrossSurface(apps);
}
