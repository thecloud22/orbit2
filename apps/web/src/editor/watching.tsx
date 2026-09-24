/**
 * Watching Orbit draft or map (Orbit 2.6, E9).
 *
 * It used to be one line — "Turn 14, kept: …" — and a small picture. A walk
 * against a real application takes minutes, and what a person needs while it
 * runs is what an onlooker at the desk would see: the screen it is looking at,
 * which line of the procedure it is on, what it just did, and every page it
 * has been through, so a wrong turn can be spotted before the draft lands.
 *
 * Read from the session as it is written: the worker appends each turn as it
 * happens (authoring_session.captured). Nothing here is kept.
 */
import { useEffect, useState } from 'react';
import { Picture } from './Picture.tsx';
import type { Shot } from './model.ts';

export interface LiveTurn {
  turn: number; verdict: string; why: string; screenshot?: Shot | null;
  /** Where it was: an address, or a green screen's name. Absent on a turn recorded before 2.6. */
  page?: string | null; sentence?: string | null; act?: string | null; element?: string | null;
}

/** The turns of a walk while it runs, read every few seconds; none once there is no walk. */
export function useWalk(session: string | null, running: boolean): LiveTurn[] {
  const [turns, setTurns] = useState<LiveTurn[]>([]);
  useEffect(() => {
    if (!session || !running) { setTurns([]); return; }
    let live = true;
    const read = () => fetch(`/api/authoring/${session}`).then((r) => r.json())
      .then((b: { turns?: LiveTurn[] }) => { if (live) setTurns(b.turns ?? []); }).catch(() => undefined);
    void read();
    const timer = setInterval(read, 2500);
    return () => { live = false; clearInterval(timer); };
  }, [session, running]);
  return turns;
}

/** The line it is on now: the sentence the latest turn named. */
export const onNow = (turns: readonly LiveTurn[]) => [...turns].reverse().find((t) => t.sentence)?.sentence ?? null;

/** The lines it has made a step for. */
export const doneWith = (turns: readonly LiveTurn[]) =>
  new Set(turns.filter((t) => t.verdict === 'kept' && t.sentence).map((t) => t.sentence!));

/** A place as a person reads it: the part of an address that says which screen. */
const shortly = (page: string) => page.replace(/^[a-z0-9]+:\/\/[^/]+/i, '') || '/';

export function WatchingPanel({ turns, what, appOf }: {
  turns: readonly LiveTurn[]; what: string;
  /** Which system a sentence happens on, when the agent works across several. */
  appOf: (sentence: string) => string | null;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const pictured = turns.filter((t) => t.screenshot?.digest || t.screenshot?.withheld);
  const shown = (picked !== null ? pictured.find((t) => t.turn === picked) : null) ?? pictured.at(-1) ?? null;
  const now = onNow(turns);
  const recent = turns.slice(-4).reverse();

  if (!turns.length) {
    return (
      <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
        {what}. Waiting for a worker to open the application; the screen it sees will show here.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{picked !== null && shown ? `The page at turn ${shown.turn}` : 'What Orbit sees now'}</span>
        <span style={{ fontSize: 12, color: 'var(--ink-2)', textAlign: 'right' }}>
          {now ? <>on <span style={{ fontFamily: 'var(--mono)' }}>{now}</span>{appOf(now) ? `, ${appOf(now)}` : ''}</> : 'finding its way in'}</span>
      </div>
      {shown && <Picture shot={shown.screenshot} size="large" alt={`The page Orbit was looking at, turn ${shown.turn}`} />}
      {shown?.page && <div style={{ fontSize: 11.5, color: 'var(--ink-2)', fontFamily: 'var(--mono)', marginTop: -6 }}>{shortly(shown.page)}</div>}
      {picked !== null && <button type="button" onClick={() => setPicked(null)}
        style={{ alignSelf: 'flex-start', font: 'inherit', fontSize: 12, color: 'var(--ink-2)', background: 'transparent', border: '1px solid var(--rule-2)',
          borderRadius: 3, cursor: 'pointer', padding: '2px 8px' }}>Back to what it sees now</button>}

      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>What it just did</div>
        {recent.map((t) => (
          <div key={t.turn} style={{ display: 'grid', gridTemplateColumns: '54px minmax(0, 1fr)', gap: 8, padding: '6px 0',
            borderTop: '1px solid var(--rule)', fontSize: 12.5, lineHeight: 1.45 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)', paddingTop: 1 }}>turn {t.turn}</span>
            <span style={{ color: t.verdict === 'kept' ? 'var(--ink)' : 'var(--ink-2)' }}>
              {t.verdict === 'kept' ? '' : `${t.verdict}: `}{t.why}
              {t.sentence && <span style={{ color: 'var(--ink-2)' }}> {'·'} {t.sentence}</span>}</span>
          </div>
        ))}
      </div>

      {pictured.length > 1 && (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Pages so far</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
            {pictured.map((t) => (
              <button key={t.turn} type="button" onClick={() => setPicked(t.turn)} title={`Turn ${t.turn}${t.sentence ? `, ${t.sentence}` : ''}`}
                aria-label={`Show the page at turn ${t.turn}`}
                style={{ font: 'inherit', padding: 0, border: `1.5px solid ${shown?.turn === t.turn ? 'var(--primary)' : 'transparent'}`, borderRadius: 4,
                  background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'stretch' }}>
                {t.screenshot?.digest
                  ? <img src={`/api/screens/${t.screenshot.digest}`} alt="" loading="lazy"
                      style={{ display: 'block', width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', objectPosition: 'top', borderRadius: 3, border: '1px solid var(--rule-2)' }} />
                  : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '4 / 3', fontSize: 10, color: 'var(--ink-2)',
                      border: '1px dashed var(--rule-2)', borderRadius: 3 }}>withheld</span>}
                <span style={{ fontSize: 10, color: 'var(--ink-2)', fontFamily: 'var(--mono)' }}>{t.sentence ?? `turn ${t.turn}`}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
