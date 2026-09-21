/**
 * Reading from the API, with the four states kept apart.
 *
 * §3 and product rule 11: *nothing yet*, *nothing matching*, *not loaded yet*
 * and *could not load* mean different things, and a hook that collapses them
 * into `data | null` is where that distinction gets lost for good. So this
 * returns which of them it is, and a screen cannot render a blank without
 * having chosen one.
 */
import { useEffect, useState } from 'react';
import type { Emptiness } from './ui.tsx';

export type Loaded<T> = { state: 'loaded'; value: T } | { state: 'empty'; of: Emptiness };

export function useFetch<T>(path: string, searched?: string): Loaded<T> {
  const [result, setResult] = useState<Loaded<T>>({ state: 'empty', of: { kind: 'notLoadedYet' } });
  useEffect(() => {
    let live = true;
    setResult({ state: 'empty', of: { kind: 'notLoadedYet' } });
    fetch(path)
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!live) return;
        if (response.status === 404) {
          setResult({ state: 'empty', of: { kind: 'nothingMatching', searched: searched ?? path } });
        } else if (!response.ok) {
          const why = (body as { why?: string }).why
            ?? 'The record store did not answer. Nothing is lost — this screen could not read it.';
          setResult({ state: 'empty', of: { kind: 'couldNotLoad', why } });
        } else {
          setResult({ state: 'loaded', value: body as T });
        }
      })
      .catch(() => live && setResult({ state: 'empty', of: { kind: 'couldNotLoad',
        why: 'The record store did not answer. Nothing is lost — this screen could not read it.' } }));
    return () => { live = false; };
  }, [path, searched]);
  return result;
}

/**
 * Sends something, and says plainly whether it worked.
 *
 * A refusal arrives here as a failure, and it is not one. Publication answers
 * 409 carrying every blocker in plain words — the API says so in its own
 * comment — and this used to read the status, invent "That did not work
 * (409).", and drop the body. So the gate the whole product rests on reported
 * itself to an author as a number. The reasons were computed, described,
 * serialised and thrown away one function short of the screen.
 *
 * The parsed body comes back either way, so a caller can tell a refusal with
 * reasons from something that actually went wrong.
 */
export async function send<T>(path: string, body: unknown): Promise<
  { ok: true; value: T } | { ok: false; why: string; value?: T }> {
  try {
    const response = await fetch(path, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const value: unknown = await response.json();
    return response.ok
      ? { ok: true, value: value as T }
      : { ok: false, value: value as T,
          why: (value as { why?: string }).why ?? `That did not work (${response.status}).` };
  } catch {
    return { ok: false, why: 'Orbit could not be reached. Nothing was changed.' };
  }
}
