import { useEffect, useState } from 'react';
import { isRetryable, type ArtefactView, type ErrorKind, type RunEventView, type RunView, type StepAttemptView } from '@orbit/contract';
import { Dot, EmptyState, OutcomePair, Row, Verbatim, type Emptiness } from './ui.tsx';

type Loaded = { kind: 'loaded'; data: RunView } | { kind: 'empty'; of: Emptiness };

const took = (events: RunEventView[], attemptId: string): number | undefined => {
  const ended = events.find((e) => e.attempt_id === attemptId && e.kind === 'step.attempt.ended');
  const ms = ended?.detail['tookMs'];
  return typeof ms === 'number' ? ms : undefined;
};

/**
 * The picture at a size where a person can actually check it.
 *
 * A 232px tile is enough to see that a box exists and not enough to see what
 * it is around, which makes it decoration. The point of the box is that a
 * reader can satisfy themselves the step resolved to the right thing, and
 * that is a claim they have to be able to inspect.
 */
function Enlarged({ artefact, onClose }: { artefact: ArtefactView; onClose: () => void }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const shows = artefact.shows!;
  const wide = Math.min(1100, (typeof window === 'undefined' ? 1100 : window.innerWidth) - 80);
  const scale = size ? wide / size.w : 0;

  return (
    <div role="dialog" aria-label={`The screen when the step found ${shows.label}`} onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(20,20,19,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <figure onClick={(e) => e.stopPropagation()}
        style={{ margin: 0, background: 'var(--panel)', borderRadius: 6, overflow: 'hidden',
          maxHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <figcaption style={{ padding: '13px 18px', display: 'flex', alignItems: 'baseline', gap: 10,
          borderBottom: '1px solid var(--rule)' }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Found &ldquo;{shows.label}&rdquo;</span>
          <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
            by {shows.by} &middot; boxed where the step resolved it on this page
          </span>
          <span style={{ flexGrow: 1 }} />
          <button type="button" onClick={onClose}
            style={{ font: 'inherit', fontSize: 12.5, color: 'var(--ink-2)', background: 'transparent',
              border: 0, cursor: 'pointer' }}>Close</button>
        </figcaption>
        <div style={{ position: 'relative', overflow: 'auto' }}>
          <img src={`/api/artefacts/${artefact.id}`} alt={`The screen when the step found ${shows.label}`}
            onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            style={{ width: wide, display: 'block' }} />
          {size && (
            <span style={{ position: 'absolute', pointerEvents: 'none',
              left: shows.at.x * scale, top: shows.at.y * scale,
              width: shows.at.width * scale, height: shows.at.height * scale,
              border: '2px solid var(--primary)', borderRadius: 2,
              boxShadow: '0 0 0 9999px rgba(20,20,19,0.45)' }} />
          )}
        </div>
      </figure>
    </div>
  );
}

/**
 * §10's run controls, and the reasons one is not offered.
 *
 * A retry is offered only where repeating the step could come out differently,
 * which is a property of the failure rather than of how annoying it was. Where
 * it cannot, the control is not hidden — a missing button teaches nobody
 * anything — it is replaced by the reason, so the next thing the operator does
 * is the thing that would actually help.
 */
function Controls({ run, again }: { run: RunView['run']; again: () => void }) {
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const control = async (verb: string) => {
    setBusy(true); setRefused(null);
    const res = await fetch(`/api/runs/${run.reference}/${verb}`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      // A re-run is a different run, so the operator is taken to it rather
      // than left looking at the one they just re-ran.
      if (verb === 'rerun' && body.reference) window.location.assign(`/runs/${body.reference}`);
      else again();
    } else setRefused(body.why ?? 'That did not work.');
  };

  const inFlight = run.status === 'queued' || run.status === 'running';
  const failure = run.error?.kind as ErrorKind | undefined;
  const canRetry = run.status === 'failed' && failure !== undefined && isRetryable(failure);

  const button = (label: string, verb: string, kind: 'plain' | 'strong' = 'plain') => (
    <button type="button" disabled={busy} onClick={() => void control(verb)}
      style={{ font: 'inherit', fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 3,
        cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1,
        border: kind === 'strong' ? 0 : '1px solid var(--rule-2)',
        background: kind === 'strong' ? 'var(--ink)' : 'var(--panel)',
        color: kind === 'strong' ? 'var(--page)' : 'var(--ink)' }}>{label}</button>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0',
      borderBottom: '1px solid var(--rule)', flexWrap: 'wrap' }}>
      {inFlight && button('Cancel this run', 'cancel')}
      {inFlight && (
        <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
          It stops after the step it is on, so nothing is left half-done.
        </span>
      )}

      {canRetry && button(`Retry step ${run.error?.step ?? ''}`.trim(), 'retry', 'strong')}
      {run.status === 'failed' && !canRetry && (
        <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
          A {failure ?? 'failure'} will not come out differently on a second attempt, so there is no retry.
          Repair the workflow, or run it again from the start.
        </span>
      )}

      {!inFlight && button('Run it again', 'rerun')}
      {run.rerun_of_reference && (
        <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
          This run is a re-run of <a href={`/runs/${run.rerun_of_reference}`}
            style={{ color: 'var(--ink)' }}>{run.rerun_of_reference}</a>.
        </span>
      )}
      {run.retries > 0 && (
        <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
          {run.retries === 1 ? 'One step was retried' : `${run.retries} steps were retried`} in this run.
        </span>
      )}

      {refused && (
        <span style={{ fontSize: 12.5, color: 'var(--attention-ink)', width: '100%' }}>{refused}</span>
      )}
    </div>
  );
}

export function RunPage({ reference }: { reference: string }) {
  const [state, setState] = useState<Loaded>({ kind: 'empty', of: { kind: 'notLoadedYet' } });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { setState({ kind: 'empty', of: { kind: 'notLoadedYet' } }); }, [reference]);

  useEffect(() => {
    let live = true;
    fetch(`/api/runs/${reference}`)
      .then(async (res) => {
        const body = await res.json();
        if (!live) return;
        if (res.status === 404) setState({ kind: 'empty', of: { kind: 'nothingMatching', searched: reference } });
        else if (!res.ok) setState({ kind: 'empty', of: { kind: 'couldNotLoad', why: (body as {why?: string}).why ?? 'The record store did not answer.' } });
        else setState({ kind: 'loaded', data: body });
      })
      .catch((error: unknown) => live && setState({ kind: 'empty', of: {
        kind: 'couldNotLoad',
        why: `The record store did not answer. Your runs are unaffected — this screen could not read them. (${String(error)})`,
      } }));
    return () => { live = false; };
  }, [reference, refresh]);

  return (
    <div>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '26px 36px 60px' }}>
        {state.kind === 'empty' ? (
          <div style={{ border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--panel)', marginTop: 24 }}>
            <EmptyState of={state.of} />
          </div>
        ) : <LoadedRun data={state.data} again={() => setRefresh((n) => n + 1)} />}
      </main>
    </div>
  );
}

function LoadedRun({ data, again }: { data: RunView; again: () => void }) {
  const { run, steps, attempts, events, stepArtefacts, runArtefacts } = data;
  const [selected, setSelected] = useState(0);
  const outcomes = run.outcomes ?? [];
  const label = (name: string) => outcomes.find((o) => o.name === name)?.label ?? name;
  const state = run.status === 'succeeded' ? 'ok' : run.status === 'failed' ? 'failed'
    : run.status === 'running' ? 'running' : 'attention';
  const trace = runArtefacts.find((a) => a.kind === 'trace');
  /**
   * The step an attempt was of, found by its position.
   *
   * It was `steps[i]` — the attempt's place in the list — which is the same
   * thing only while a run goes straight down the version. The moment a branch
   * skips ahead they diverge, and the run page labelled the ending it reached
   * with the summary of a step it never ran. A record that names the wrong
   * step is worse than one that names none.
   */
  const stepAt = (position: number) => steps[position - 1];
  const withheld = runArtefacts.filter((a) => a.withheld);

  return (
    <>
      <header style={{ display: 'flex', alignItems: 'flex-end', gap: 24, paddingBottom: 18 }}>
        <div style={{ flexGrow: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 7 }}>{run.workflow_name}</div>
          <h1 style={{ margin: 0, fontSize: 33, fontWeight: 700, letterSpacing: '-0.024em' }}>Run {run.reference}</h1>
        </div>
        <div style={{ transform: 'rotate(-1.2deg)', border: '2px solid var(--ok-ink)', borderRadius: 3,
          padding: '8px 14px 7px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.2em', color: 'var(--ok-ink)' }}>
            PUBLISHED VERSION {run.version}
          </span>
          <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ok-ink)',
            borderTop: '1px solid #9FCFC9', paddingTop: 3 }}>{String(run.digest).replace('sha256:', '')}</span>
        </div>
      </header>
      <div style={{ height: 2, background: 'var(--ink)' }} />

      <Controls run={run} again={again} />

      <OutcomePair state={state} status={run.status[0]!.toUpperCase() + run.status.slice(1)}
        outcome={run.outcome ? label(run.outcome) : 'No conclusion reached'}
        note={`One of ${outcomes.length} conclusions this version declares. Orbit reports it without judging it.`} />

      <section style={{ display: 'flex', gap: 46, padding: '16px 0 18px',
        borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
        <div style={{ width: 560, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <Row label="Version">{run.workflow_name}, version {run.version}{' '}
            <span style={{ color: 'var(--ink-2)' }}>published {new Date(run.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></Row>
          <Row label="Ran">{ran(run.started_at, run.ended_at)}</Row>
          <Row label="Started by"><span style={{ color: 'var(--ink-2)' }}>Not recorded. Attribution starts when sign-in does.</span></Row>
        </div>
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
          {Object.entries(run.outputs ?? {}).map(([key, value]) => (
            <Row key={key} label={key}><Verbatim>{String(value)}</Verbatim></Row>
          ))}
          <Row label="It changed"><span style={{ color: 'var(--ok-ink)', fontWeight: 600 }}>
            {run.may_change_records ? 'Records, with declared authority' : 'Nothing.'}</span>{' '}
            {run.may_change_records ? '' : 'This version has no authority to write.'}</Row>
        </div>
      </section>

      <div style={{ display: 'flex', gap: 30, paddingTop: 20 }}>
        <div style={{ width: 486, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 11, paddingBottom: 11 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>What it did, in order</h2>
            {/* "All reached" is only true of a run that ran to an ending. A
                run that was stopped or that failed reached some of the version
                and not the rest, and saying otherwise reads as if the
                procedure completed. */}
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
              {run.status === 'succeeded' || run.status === 'handedToAPerson'
                ? `${attempts.length} steps, all reached`
                : `${attempts.length} of ${steps.length} steps — it did not get further`}
            </span>
          </div>
          <div style={{ borderTop: '1px solid var(--ink)' }}>
            {attempts.map((a, i) => (
              <button key={a.id} type="button" onClick={() => setSelected(i)}
                style={{ width: '100%', font: 'inherit', textAlign: 'left', cursor: 'pointer', border: 0,
                  borderBottom: i === attempts.length - 1 ? 'none' : '1px solid var(--rule)',
                  background: i === selected ? 'var(--failed-wash)' : 'transparent',
                  boxShadow: i === selected ? 'inset 3px 0 0 var(--primary)' : undefined,
                  padding: i === selected ? '10px 13px 10px 10px' : '10px 0',
                  marginLeft: i === selected ? -13 : 0,
                  display: 'flex', alignItems: 'center', gap: 13 }}>
                <span style={{ width: 18, fontSize: 12, color: 'var(--ink-2)', textAlign: 'right' }}>{a.step_position}</span>
                <span style={{ width: 66, fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--running-ink)' }}>
                  {a.step_kind}</span>
                <span style={{ flexGrow: 1, fontSize: 13.5, fontWeight: i === selected ? 600 : 400 }}>
                  {stepAt(a.step_position)?.summary ?? '—'}</span>
                <span style={{ width: 34, fontSize: 12, color: 'var(--ink-2)', textAlign: 'right' }}>
                  {formatTook(took(events, a.id))}</span>
                <Dot state="ok" size={8} />
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            The second column is the step&rsquo;s kind. Ten kinds exist, and no workflow can contain anything else.
          </p>
        </div>

        <div style={{ flexGrow: 1, borderLeft: '1px solid var(--rule)', paddingLeft: 30, minWidth: 0 }}>
          <StepDetail attempt={attempts[selected]}
            step={attempts[selected] ? stepAt(attempts[selected]!.step_position) : undefined}
            events={events.filter((e) => e.attempt_id === attempts[selected]?.id)}
            artefacts={stepArtefacts.filter((a) => a.attempt_id === attempts[selected]?.id)} />
          {withheld.map((a) => (
            <div key={a.id} style={{ marginTop: 18, background: 'var(--attention-wash)', borderLeft: '3px solid var(--attention)',
              borderRadius: 5, padding: '13px 15px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--attention-ink)', marginBottom: 5 }}>
                One screenshot was withheld</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                {a.withheld_why![0]!.toUpperCase() + a.withheld_why!.slice(1)}. An unreadable record is recoverable;
                a leaked credential is not.</div>
            </div>
          ))}
          {trace && (
            <div style={{ marginTop: 18, borderTop: '1px solid var(--rule)', paddingTop: 14,
              display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>Trace of the whole run</span>
              <span style={{ fontSize: 12.5, color: 'var(--ink-2)', fontFamily: 'var(--mono)' }}>
                {((trace.bytes ?? 0) / 1e6).toFixed(1)} MB &ensp; {String(trace.digest).replace('sha256:', '')}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StepDetail({ attempt, step, events, artefacts }: {
  attempt: StepAttemptView | undefined;
  step: { kind: string; summary: string } | undefined;
  events: RunEventView[];
  artefacts: ArtefactView[];
}) {
  if (!attempt) return null;
  const branch = events.find((e) => e.kind === 'branch.evaluated')?.detail;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 11, paddingBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Step {attempt.step_position}, {attempt.step_kind}</h2>
        <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>attempt {attempt.attempt}</span>
      </div>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--rule)', borderRadius: 6, padding: '16px 18px' }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>{step?.summary}</div>
        {branch ? (
          <>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 12 }}>
              It compared two values it already held.</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18 }}>
              <Operand label="What came back" value={branch['left']} />
              <span style={{ fontSize: 13, color: 'var(--ink-2)', paddingBottom: 6 }}>{String(branch['operator'])}</span>
              <Operand label="What the step expected" value={branch['right']} />
            </div>
            <div style={{ borderTop: '1px solid var(--rule)', marginTop: 13, paddingTop: 11, fontSize: 13,
              color: 'var(--ink-2)', lineHeight: 1.55 }}>
              Both values are shown exactly as they arrived, so a comparison that went the wrong way can be
              understood without re-running anything. It took the path{' '}
              <strong style={{ color: 'var(--ink)' }}>{String(branch['tookPath'])}</strong>.
            </div>
          </>
        ) : (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.9 }}>
            {events.map((e) => (
              <div key={e.id}>{new Date(e.at).toISOString().slice(11, 23)} &ensp;{e.kind}</div>
            ))}
          </div>
        )}
      </div>
      {artefacts.length > 0 && (
        <div style={{ paddingTop: 18 }}>
          <h3 style={{ margin: '0 0 11px', fontSize: 14, fontWeight: 700 }}>What it saw at this step</h3>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {artefacts.map((a) => <Evidence key={a.id} artefact={a} />)}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * A run that has not started has no start, and one still going has no end.
 * Saying "Invalid Date, took NaN seconds" would be the screen guessing, which
 * is the one thing every part of this product refuses to do.
 */
function ran(startedAt: string | null, endedAt: string | null): string {
  if (!startedAt) return 'Not started yet';
  const started = new Date(startedAt).toLocaleString('en-US');
  if (!endedAt) return `${started}, still running`;
  return `${started}, took ${((+new Date(endedAt) - +new Date(startedAt)) / 1000).toFixed(1)} seconds`;
}

/**
 * The screenshot itself, not a description of one.
 *
 * The API re-hashes the bytes before serving them, so what is on screen is
 * provably what was captured and a file that changed on disk is refused
 * rather than shown (§12). A withheld artefact renders as withheld with its
 * reason — never as a broken image — because it is a record, not an absence.
 */
function Evidence({ artefact }: { artefact: ArtefactView }) {
  /**
   * Why it could not be shown, taken from the server rather than guessed.
   *
   * An <img> onError says only that something went wrong, and this used to
   * render every such failure as "did not match the digest" — accusing the
   * store of tampering when the bytes were merely missing, or the server
   * briefly unreachable. In a product whose claim is provenance, a false
   * integrity alarm is worse than no alarm: it teaches people to discount the
   * real one. So the reason is asked for.
   */
  const [failed, setFailed] = useState<string | null>(null);
  const [shot, setShot] = useState<{ w: number; h: number } | null>(null);
  const [open, setOpen] = useState(false);
  const askWhy = async () => {
    try {
      const res = await fetch(`/api/artefacts/${artefact.id}`);
      const body = await res.json().catch(() => null);
      setFailed(body?.describe ?? body?.why
        ?? 'This could not be shown, and the store did not say why.');
    } catch {
      setFailed('This could not be loaded. That is this screen failing to reach the store, not a finding about the evidence.');
    }
  };
  if (artefact.withheld) {
    return (
      <div style={{ width: 232, background: 'var(--attention-wash)', borderLeft: '3px solid var(--attention)',
        borderRadius: 5, padding: '12px 14px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--attention-ink)', marginBottom: 5 }}>Withheld</div>
        <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.45 }}>{artefact.withheld_why}</div>
      </div>
    );
  }
  const short = (artefact.digest ?? '').replace('sha256:', '').slice(0, 10);
  return (
    <figure style={{ margin: 0, width: 232, border: '1px solid var(--rule)', borderRadius: 5,
      background: 'var(--panel)', overflow: 'hidden' }}>
      <button type="button" onClick={() => artefact.shows && setOpen(true)}
        style={{ display: 'block', lineHeight: 0, width: '100%', padding: 0, border: 0,
          background: 'transparent', cursor: artefact.shows ? 'zoom-in' : 'default' }}>
        {failed ? (
          <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--failed-wash)', color: 'var(--failed-ink)', fontSize: 12, padding: 14,
            textAlign: 'center', lineHeight: 1.45 }}>
            {failed}
          </div>
        ) : (
          <span style={{ display: 'block', position: 'relative' }}>
            <img src={`/api/artefacts/${artefact.id}`} alt="The screen at this step"
              onError={() => void askWhy()}
              onLoad={(e) => setShot({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              style={{ width: '100%', height: 150, objectFit: 'cover', objectPosition: 'top',
                background: 'var(--panel-2)', display: 'block' }} />
            {/* Where the step's element actually was, drawn from the box
                measured against these pixels. The tile crops, so a box below
                the fold is not drawn rather than drawn in the wrong place —
                the full picture opens in a new tab. */}
            {artefact.shows && shot && (() => {
              const scale = 232 / shot.w;
              const top = artefact.shows.at.y * scale;
              if (top > 150) return null;
              return (
                <span style={{ position: 'absolute', pointerEvents: 'none',
                  left: artefact.shows.at.x * scale, top,
                  width: artefact.shows.at.width * scale,
                  height: Math.min(artefact.shows.at.height * scale, 150 - top),
                  border: '2px solid var(--primary)', borderRadius: 2,
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.9)' }} />
              );
            })()}
          </span>
        )}
      </button>
      {open && artefact.shows && (
        <Enlarged artefact={artefact} onClose={() => setOpen(false)} />
      )}
      <figcaption style={{ padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>
          {artefact.shows ? `Found “${artefact.shows.label}”` : 'Screenshot'}
        </span>
        {artefact.shows && (
          <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
            boxed where the step resolved it, by {artefact.shows.by}
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--ink-2)', fontFamily: 'var(--mono)' }}>
          {Math.round((artefact.bytes ?? 0) / 1000)} KB &ensp; {short}
        </span>
      </figcaption>
    </figure>
  );
}

const formatTook = (ms: number | undefined) => (ms === undefined || ms === 0 ? '' : `${(ms / 1000).toFixed(1)}s`);

const Operand = ({ label, value }: { label: string; value: unknown }) => (
  <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
    <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{label}</span>
    <span style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 600 }}>{String(value)}</span>
  </div>
);
