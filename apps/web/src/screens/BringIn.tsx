import { useEffect, useState } from 'react';
import { Action, Page, Refusal, Section } from '../Page.tsx';
import { describeBinding } from '@orbit/contract';
import { send, useFetch } from '../fetching.ts';
import { EmptyState } from '../ui.tsx';
import type { Route } from '../router.ts';

/**
 * Showing it once, and the walk as it happens — the screens a new agent moves
 * through when it is not written on the page (2.6: a new agent starts on the
 * editor, docs/plans/2026-09-23-start-on-the-editor.md). Bring In itself, the
 * page that came before the editor, is gone; its address starts a new agent.
 */

interface Application {
  id: string; name: string; surface: string; owner_note: string | null;
  retired_at: string | null; revision: number;
  addresses: Array<{ host: string; pathPrefix?: string }>;
  sign_in_as: string | null; credential_name: string | null;
}

interface Session {
  session: { id: string; name: string; status: string; workflow_id: string | null;
             refused: { describe?: string } | null; application: string };
  // `shown` arrives with the stored model call. A turn appended while the
  // walk is still running carries what happened and nothing else.
  turns: Array<{ turn: number; verdict: string; why: string;
                 shown?: { page?: string; elements?: number };
                 /** The page as the model saw it, or why there is no picture. */
                 screenshot?: { digest?: string; withheld?: string } | null }>;
}

/** A URL as a person reads it: the part that says which screen. */
const shortly = (url: string) => url.replace(/^https?:\/\/[^/]+/, '') || '/';

const field: React.CSSProperties = {
  font: 'inherit', fontSize: 14, padding: '9px 11px', width: '100%', boxSizing: 'border-box',
  border: '1px solid var(--rule-2)', borderRadius: 4, background: 'var(--panel)', color: 'var(--ink)',
};

/**
 * The walk, while it happens.
 *
 * §5 asks that Orbit show its working, and the working exists before the draft
 * does — a walk against a real application takes a minute, and a person
 * watching a spinner for that long learns nothing about what it is doing or
 * whether to trust it. Each turn appears as it is recorded, kept and rejected
 * alike, because the rejected ones are the ones that say where the procedure
 * and the application disagree.
 */
export function Working({ id, go, onAbandon }: { id: string; go: (to: Route) => void; onAbandon: () => void }) {
  const [state, setState] = useState<Session | null>(null);
  /** The turn whose picture is shown; the latest one that has one, until a turn is picked. */
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    const poll = async () => {
      const res = await fetch(`/api/authoring/${id}`).catch(() => null);
      if (!live || !res?.ok) return;
      const body: Session = await res.json();
      setState(body);
      if (body.session.status === 'brought in' && body.session.workflow_id) {
        go({ at: 'agent', id: body.session.workflow_id });
      }
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, 1200);
    return () => { live = false; clearInterval(timer); };
  }, [id, go]);

  const status = state?.session.status ?? 'queued';
  const refused = state?.session.refused;

  return (
    <Page kicker="Bringing it in" title={state?.session.name ?? 'Working through it'}
      aside={<p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 520 }}>
        {status === 'queued' ? 'Waiting for a worker to pick this up.'
          : status === 'running' ? `A browser is open against ${state?.session.application}. Each turn appears as it is recorded.`
          : status === 'refused' ? 'Nothing was stored.'
          : 'Done.'}
      </p>}>

      {refused && (
        <div style={{ paddingTop: 20 }}>
          <Refusal tone="failed" title="This reading did not hold together, so none of it was kept"
            blockers={[refused.describe ?? 'No reason was recorded.']} />
          <div style={{ paddingTop: 16 }}>
            <Action kind="ghost" onClick={onAbandon}>Change it and try again</Action>
          </div>
        </div>
      )}

      <Section title="What it is doing"
        note={state && state.turns.length > 0
          ? `${state.turns.length} turn${state.turns.length === 1 ? '' : 's'} · pick one to see the page it was looking at`
          : 'starting'}>
        <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
        <div style={{ flexGrow: 1, minWidth: 0, borderTop: state && state.turns.length > 0 ? '1px solid var(--ink)' : 0 }}>
          {(state?.turns ?? []).map((t) => (
            <div key={t.turn} onClick={() => setPicked(t.turn)} style={{ borderBottom: '1px solid var(--rule)', padding: '12px 8px',
              display: 'flex', gap: 14, alignItems: 'flex-start', cursor: 'pointer',
              background: shownTurn(state, picked)?.turn === t.turn ? 'var(--panel-2)' : 'transparent' }}>
              <span style={{ width: 18, fontSize: 12, color: 'var(--ink-2)', textAlign: 'right', paddingTop: 2 }}>{t.turn}</span>
              <span style={{ width: 82, flexShrink: 0, fontSize: 12, fontFamily: 'var(--mono)',
                color: t.verdict === 'kept' ? 'var(--ok-ink)' : 'var(--failed-ink)' }}>{t.verdict}</span>
              <span style={{ flexGrow: 1, fontSize: 13.5 }}>{t.why}</span>
              {/* A turn appended while the walk runs carries what happened and
                  nothing else. The count of elements arrives with the stored
                  model call, once there is a draft to hang it from. */}
              {t.shown?.elements !== undefined && (
                <span style={{ fontSize: 11.5, color: 'var(--ink-2)', fontFamily: 'var(--mono)' }}>
                  {t.shown.elements} elements
                </span>
              )}
            </div>
          ))}

          {/* What it is doing *now*. Without this the screen showed the last
              thing that finished and gave no sign whether anything was still
              happening — a slow walk and a dead one looked identical. */}
          {(status === 'queued' || status === 'running') && (
            <div className="orbit-working" style={{ padding: '13px 0', display: 'flex', gap: 14,
              alignItems: 'baseline', borderBottom: '1px solid var(--rule)' }}>
              <span style={{ width: 18 }} />
              <span style={{ width: 82, flexShrink: 0, fontSize: 12, fontFamily: 'var(--mono)',
                color: 'var(--running-ink)' }}>working</span>
              <span style={{ flexGrow: 1, fontSize: 13.5, color: 'var(--ink-2)' }}>
                {status === 'queued' ? 'Waiting for a worker to pick this up'
                  : (state?.turns.length ?? 0) === 0 ? 'Opening the application and reading the page'
                  : 'Working out the next thing to do'}
                <span style={{ fontFamily: 'var(--mono)' }}>
                  <span className="orbit-dot">.</span>
                  <span className="orbit-dot">.</span>
                  <span className="orbit-dot">.</span>
                </span>
              </span>
            </div>
          )}

          {status === 'brought in' && (
            <div style={{ padding: '13px 0', display: 'flex', gap: 14, alignItems: 'baseline' }}>
              <span style={{ width: 18 }} />
              <span style={{ width: 82, flexShrink: 0, fontSize: 12, fontFamily: 'var(--mono)',
                color: 'var(--ok-ink)' }}>done</span>
              <span style={{ flexGrow: 1, fontSize: 13.5, color: 'var(--ink-2)' }}>
                The walk is finished. Opening the draft.
              </span>
            </div>
          )}
        </div>
        <Picture turn={shownTurn(state, picked)} />
        </div>
      </Section>
    </Page>
  );
}

/**
 * While the person is demonstrating.
 *
 * The screen has almost nothing to do: the work is happening in another window
 * and the person is doing it. What it owes them is proof that Orbit is
 * watching — each action appearing as a step the moment it is captured — and
 * the one control the browser cannot give them, which is saying they are
 * finished.
 */
export function Demonstrating({ id, go, onAbandon }: {
  id: string; go: (to: Route) => void; onAbandon: () => void;
}) {
  const [state, setState] = useState<{
    name: string; status: string; application: string; workflow_id: string | null;
    finish_requested_at: string | null; refused: { describe?: string } | null;
    captured: Array<{ kind: string; summary: string; on?: string;
                      label?: string | null; binding?: unknown; noteKind?: string }>;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const poll = async () => {
      const res = await fetch(`/api/recordings/${id}`).catch(() => null);
      if (!live || !res?.ok) return;
      const body = await res.json();
      setState(body);
      if (body.status === 'brought in' && body.workflow_id) go({ at: 'agent', id: body.workflow_id });
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, 1000);
    return () => { live = false; clearInterval(timer); };
  }, [id, go]);

  const captured = state?.captured ?? [];
  // A note is not a step, and numbering them together would make a recording
  // look longer than the procedure it recorded.
  const steps = captured.filter((c) => c.kind !== 'note');
  const raised = captured.filter((c) => c.kind === 'note');
  const finishing = Boolean(state?.finish_requested_at);

  return (
    <Page kicker="Recording" title={state?.name ?? 'Show it once'}
      aside={<p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 520 }}>
        {state?.status === 'queued' ? 'Waiting for a worker to open the browser.'
          : finishing ? 'Closing the browser and turning what you did into a draft.'
          : `A browser is open against ${state?.application}. Do the job the way you normally would.`}
      </p>}
      actions={
        <Action disabled={busy || finishing || state?.status === 'queued'}
          why={state?.status === 'queued' ? 'The browser is still opening' : 'Already finishing'}
          onClick={async () => {
            setBusy(true);
            await fetch(`/api/recordings/${id}/finish`, { method: 'POST' });
            setBusy(false);
          }}>I have finished</Action>
      }>

      {state?.refused && (
        <div style={{ paddingTop: 20 }}>
          <Refusal tone="failed" title="The recording was not kept"
            blockers={[state.refused.describe ?? 'No reason was recorded.']} />
          <div style={{ paddingTop: 16 }}>
            <Action kind="ghost" onClick={onAbandon}>Try again</Action>
          </div>
        </div>
      )}

      <Section title="What Orbit is making of it"
        note={steps.length === 0 ? 'nothing yet' : `${steps.length} step${steps.length === 1 ? '' : 's'}`}>
        {/* This page exists because you cannot see any of this from the
            browser. You already know what you did; what you cannot know is how
            Orbit decided to find each control again — and that decision is
            what fails at run time, months later, on a page that has moved on.
            Here it is still cheap: press it again and watch what changes. */}
        <p style={{ margin: '0 0 15px', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 760 }}>
          Each line is what Orbit decided, not what you pressed. The second line
          is how it will find that control on a future run — check it now, while
          doing it again costs nothing.
        </p>

        {steps.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 700 }}>
            {state?.status === 'queued'
              ? 'Queued. The browser opens in a moment.'
              : 'Nothing yet. Press something, or fill a field in, and it will appear here.'}
          </p>
        ) : (
          <div style={{ borderTop: '1px solid var(--ink)' }}>
            {steps.map((c, i) => (
              <div key={i} style={{ borderBottom: '1px solid var(--rule)', padding: '11px 0',
                display: 'flex', gap: 13, alignItems: 'flex-start' }}>
                <span style={{ width: 18, fontSize: 12, color: 'var(--ink-2)', textAlign: 'right',
                  paddingTop: 1 }}>{i + 1}</span>
                <span style={{ width: 70, flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 12,
                  fontWeight: 600, color: 'var(--running-ink)' }}>{c.kind}</span>
                <span style={{ flexGrow: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5 }}>{c.summary}</span>
                  {c.binding != null && (
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-2)', marginTop: 3 }}>
                      Finds {describeBinding(c.binding)}
                    </span>
                  )}
                  {c.on && (
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-2)',
                      fontFamily: 'var(--mono)', marginTop: 3 }}>{shortly(c.on)}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {raised.length > 0 && (
          <div style={{ paddingTop: 16 }}>
            <Refusal tone="attention"
              title={raised.length === 1
                ? 'One thing Orbit could not work out'
                : `${raised.length} things Orbit could not work out`}
              blockers={raised.map((n) => n.summary)} />
            <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: '9px 0 0', maxWidth: 760 }}>
              Raised while you were working rather than at the end, because the page it
              happened on is still in front of you.
            </p>
          </div>
        )}
      </Section>

      <Refusal title="Three things to know while you record" blockers={[
        'A password is a keystroke. The field is remembered and the value never leaves the page.',
        'This is one path. It shows the ending that happens; the others must be recorded or described, and a path reaching no conclusion cannot publish.',
        'You are recording as yourself and the agent runs as the registered credential, so every control is checked again as that account before anything publishes.',
      ]} />
    </Page>
  );
}

/**
 * A PDF instead of pasted text. Read by Orbit, not by this screen: the file
 * is sent as it is, and the words that get numbered are the ones the server
 * read out of it, so the screen never decides what the document said.
 */
export function PdfPicker({ chosen, onChosen }: {
  chosen: { name: string; bytes: number } | null;
  onChosen: (pdf: { name: string; bytes: number; base64: string } | null) => void;
}) {
  const [why, setWhy] = useState<string | null>(null);
  if (chosen) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13.5 }}>
        <span>Using <strong>{chosen.name}</strong> <span style={{ color: 'var(--ink-2)' }}>({Math.round(chosen.bytes / 1024)} KB)</span></span>
        <button type="button" onClick={() => onChosen(null)} style={{ font: 'inherit', fontSize: 12.5,
          color: 'var(--ink-2)', background: 'transparent', border: 0, cursor: 'pointer', textDecoration: 'underline' }}>
          Paste it instead</button>
      </span>
    );
  }
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
      <label style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--rule-2)',
        borderRadius: 3, padding: '7px 12px', background: 'var(--panel)' }}>
        Upload a PDF instead
        <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
          onChange={async (e) => {
            setWhy(null);
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 20 * 1024 * 1024) { setWhy('A PDF can be at most 20 MB.'); return; }
            const bytes = new Uint8Array(await file.arrayBuffer());
            let binary = '';
            for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            onChosen({ name: file.name, bytes: file.size, base64: btoa(binary) });
          }} />
      </label>
      <span style={{ color: 'var(--ink-2)' }}>
        {why ?? 'Its text is read as written. A scanned PDF has none, and is refused.'}
      </span>
    </span>
  );
}

/** The turn whose picture is on screen: the one picked, or the latest with a picture. */
function shownTurn(state: Session | null, picked: number | null) {
  const turns = state?.turns ?? [];
  return turns.find((t) => t.turn === picked) ?? [...turns].reverse().find((t) => t.screenshot?.digest) ?? null;
}

/**
 * What the page looked like when the model was asked. Beside the turns, so
 * what Orbit decided can be checked against what was actually on the screen.
 */
function Picture({ turn }: { turn: Session['turns'][number] | null }) {
  const frame: React.CSSProperties = { width: 520, flexShrink: 0, position: 'sticky', top: 16,
    border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--panel)', overflow: 'hidden' };
  if (!turn) {
    return <div style={{ ...frame, padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--ink-2)' }}>
      The page appears here as soon as Orbit is looking at one.</div>;
  }
  return (
    <div style={frame}>
      {turn.screenshot?.digest
        ? <img src={`/api/screens/${turn.screenshot.digest}`} alt={`The page at turn ${turn.turn}`} style={{ display: 'block', width: '100%' }} />
        : <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--ink-2)' }}>
            {turn.screenshot?.withheld ?? 'No picture for this turn: it did not look at a page.'}</div>}
      <div style={{ padding: '9px 12px', borderTop: '1px solid var(--rule)', fontSize: 12, color: 'var(--ink-2)' }}>
        Turn {turn.turn}{turn.shown?.page ? ` · ${turn.shown.page.replace(/^https?:\/\/[^/]+/, '')}` : ''}</div>
    </div>
  );
}
