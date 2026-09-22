import { useEffect, useState } from 'react';
import { isRetryable, type ArtefactView, type ErrorKind, type RunEventView, type RunView, type StepAttemptView } from '@orbit/contract';
import { Dot, EmptyState, OutcomePair, Row, Verbatim, type Emptiness } from './ui.tsx';
import { useLinkProps, type Route } from './router.ts';

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
          {/* A check that did not hold is not a fault, so "repair the
              workflow" is advice about something that is not broken — and
              `checkFailed` is the vocabulary's word for it, not the author's.
              Both were being shown to somebody whose agent had just worked. */}
          {failure === 'checkFailed'
            ? 'Retrying would compare the same values and stop in the same place, which is what the check is for. '
              + 'Run it again with a different record, or change the check.'
            : `A ${failure ?? 'failure'} will not come out differently on a second attempt, so there is no retry. `
              + 'Repair the workflow, or run it again from the start.'}
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

export function RunPage({ reference, go }: { reference: string; go: (to: Route) => void }) {
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

  // A run in flight is read again until it is not.
  //
  // This screen loaded once. A run opened while it was queued said "Queued"
  // and "0 of 11 steps" until somebody pressed reload, which on a run that
  // takes a second means the page you are looking at is almost always out of
  // date. The steps are there to be read — an attempt is written before the
  // side effect and again after it (Decision 2) — so there was nothing to
  // build, only something to ask for.
  const status = state.kind === 'loaded' ? String(state.data.run.status) : null;
  const inFlight = status === 'queued' || status === 'running';
  useEffect(() => {
    if (!inFlight) return undefined;
    const timer = setInterval(() => setRefresh((n) => n + 1), 1200);
    return () => clearInterval(timer);
  }, [inFlight]);

  return (
    <div>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '26px 36px 60px' }}>
        <a {...useLinkProps({ at: 'runs' }, go)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
            color: 'var(--ink-2)', textDecoration: 'none' }}>
          <span aria-hidden="true">&larr;</span> Back to runs
        </a>
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
  /**
   * A check that did not hold is the procedure deciding, not the machinery
   * breaking.
   *
   * `failures.ts` says so in as many words — "checkFailed — not a technical
   * failure at all. It is the workflow saying the business condition did not
   * hold" — and this screen said `Failed` in red beside `No conclusion
   * reached`, which is exactly what it shows for a binding that found
   * nothing. A run that stopped where the procedure says to stop read as a
   * broken agent.
   *
   * The record is untouched: `run.status` is `failed`, because the schema
   * allows an error only on a failure and the error is what carries the
   * check's own sentence. What changes is that the screen stops describing a
   * decision as a fault, and says which it was.
   */
  const stoppedByACheck = run.status === 'failed'
    && (run.error as { kind?: string } | null)?.kind === 'checkFailed';

  const state = run.status === 'succeeded' ? 'ok'
    : stoppedByACheck ? 'attention'
    : run.status === 'failed' ? 'failed'
    : run.status === 'running' ? 'running' : 'attention';
  /** Still going: nothing about it is in the past tense yet. */
  const going = run.status === 'queued' || run.status === 'running';
  /** Stopped at the edge of its authority (§10): a success, with work for a person. */
  const handedOff = run.status === 'handedToAPerson';
  const handOffRequest = handedOff
    ? String((events.find((e) => e.kind === 'handed.off')?.detail as { request?: string } | undefined)?.request ?? '')
    : '';
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

      {run.status === 'waitingForAPerson' && (
        <WaitingForYou run={run} steps={steps as unknown as Array<Record<string, unknown>>} again={again} />
      )}

      {/* "No conclusion reached" is a finding about a run that finished. A
          run that has not started has not failed to reach anything yet, and
          saying so put a verdict on the screen before there was one. */}
      <OutcomePair state={state}
        status={stoppedByACheck ? 'Stopped by a check'
          : handedOff ? 'Handed to a person'
          : run.status === 'waitingForAPerson' ? 'Waiting for a person'
          : run.status[0]!.toUpperCase() + run.status.slice(1)}
        outcome={run.outcome ? label(run.outcome)
          : handedOff ? 'For a person to finish'
          : run.status === 'waitingForAPerson' ? 'Not yet'
          : stoppedByACheck ? String((run.error as { describe?: string }).describe ?? 'A check did not hold')
          : going ? 'Not yet'
          : 'No conclusion reached'}
        note={handedOff ? `The agent did everything it may do and stopped where the procedure says a person takes over: ${handOffRequest}`
          : stoppedByACheck
          ? 'A check in this procedure did not hold, so the run stopped where the procedure says to stop. '
            + 'Nothing technical failed. The record stores it as a failure, because that is where an error belongs.'
          : going
            ? `One of ${outcomes.length} conclusions this version declares. Which one it reaches is what it is deciding.`
            : `One of ${outcomes.length} conclusions this version declares. Orbit reports it without judging it.`} />

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

      {/* What the agent deliberately does not do. Said on every run, so work
          left to a person is never mistaken for work the agent forgot (2.1). */}
      {(data.leftToPeople?.length ?? 0) > 0 && (
        <section style={{ padding: '16px 0 18px', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 11, paddingBottom: 9 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Not done by this agent, on purpose</h2>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>from the procedure it was drafted from</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxWidth: 900 }}>
            {data.leftToPeople!.map((s) => (
              <div key={s.number} style={{ display: 'flex', gap: 14, fontSize: 13.5, lineHeight: 1.55 }}>
                <span style={{ width: 40, flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-2)', paddingTop: 2 }}>{s.number}</span>
                <span style={{ flexGrow: 1 }}>{s.text}</span>
                <span style={{ width: 150, flexShrink: 0, fontSize: 12.5, color: 'var(--ink-2)' }}>
                  {s.label === 'wontDo' ? 'The procedure says not to'
                    : (s as { waits?: boolean }).waits ? 'The run waits for this' : 'Left to a person'}</span>
              </div>
            ))}
          </div>
        </section>
      )}

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
                // "it did not get further" is the past tense of a run that
                // stopped. One still going has not stopped anywhere.
                : going ? `${attempts.length} of ${steps.length} steps so far`
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

            {/* What it is doing now. Without this, a run that had reached step
                three showed three steps and no sign whether a fourth was
                coming — the same list a run that stopped at three would show. */}
            {going && (
              <div className="orbit-working" style={{ borderTop: attempts.length > 0 ? '1px solid var(--rule)' : 'none',
                padding: '11px 0', display: 'flex', alignItems: 'center', gap: 13 }}>
                <span style={{ width: 18 }} />
                <span style={{ width: 66, fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600,
                  color: 'var(--attention-ink)' }}>
                  {run.status === 'queued' ? 'queued' : 'running'}</span>
                <span style={{ flexGrow: 1, fontSize: 13.5, color: 'var(--ink-2)' }}>
                  {run.status === 'queued'
                    ? 'Waiting for a worker to pick this up'
                    : `Working through step ${attempts.length + 1} of ${steps.length}`}
                  <span style={{ fontFamily: 'var(--mono)' }}>
                    <span className="orbit-dot">.</span>
                    <span className="orbit-dot">.</span>
                    <span className="orbit-dot">.</span>
                  </span>
                </span>
              </div>
            )}
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            The second column is the step&rsquo;s kind. Ten kinds exist, and no workflow can contain anything else.
          </p>
        </div>

        <div style={{ flexGrow: 1, borderLeft: '1px solid var(--rule)', paddingLeft: 30, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 11, paddingBottom: 11 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>What it saw at this step</h2>
          </div>
          <EvidencePanel going={going && attempts.length === 0}
            artefacts={stepArtefacts.filter((a) => a.attempt_id === attempts[selected]?.id)} />
          <div style={{ paddingTop: 22 }}>
            <StepDetail attempt={attempts[selected]}
              step={attempts[selected] ? stepAt(attempts[selected]!.step_position) : undefined}
              events={events.filter((e) => e.attempt_id === attempts[selected]?.id)} />
          </div>
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

function StepDetail({ attempt, step, events }: {
  attempt: StepAttemptView | undefined;
  step: { kind: string; summary: string } | undefined;
  events: RunEventView[];
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
    </>
  );
}

/**
 * "What it saw" for the selected attempt, at a size where the resolved
 * element is actually legible — not a decorative box on a thumbnail.
 *
 * A step that names no element on the page (`branch`, `check`, `end`) keeps
 * no screenshot at all, which is a fact about the step, not a load failure —
 * so it gets its own quiet note rather than an empty grid (product rule 11).
 */
function EvidencePanel({ artefacts, going }: { artefacts: ArtefactView[]; going?: boolean }) {
  if (artefacts.length === 0) {
    return (
      <div style={{ border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--panel)',
        padding: '46px 20px', textAlign: 'center', color: 'var(--ink-2)', fontSize: 13.5 }}>
        {/* "It has nothing on the page to resolve to" is a fact about a step
            that ran. A queued run has no steps yet, and saying that about one
            explained the absence of evidence with the wrong reason. */}
        {going
          ? 'Nothing to see yet. Evidence appears as each step is carried out.'
          : 'This step kept no screenshot. It has nothing on the page to resolve to.'}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      {artefacts.map((a) => <Evidence key={a.id} artefact={a} big />)}
    </div>
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
function Evidence({ artefact, big }: { artefact: ArtefactView; big?: boolean }) {
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
  const width = big ? 620 : 232;
  const cropHeight = big ? undefined : 150;
  if (artefact.withheld) {
    return (
      <div style={{ width, background: 'var(--attention-wash)', borderLeft: '3px solid var(--attention)',
        borderRadius: 5, padding: big ? '16px 18px' : '12px 14px' }}>
        <div style={{ fontSize: big ? 14 : 12.5, fontWeight: 700, color: 'var(--attention-ink)', marginBottom: 5 }}>Withheld</div>
        <div style={{ fontSize: big ? 13 : 12, color: 'var(--ink-2)', lineHeight: 1.45 }}>{artefact.withheld_why}</div>
      </div>
    );
  }
  const short = (artefact.digest ?? '').replace('sha256:', '').slice(0, 10);
  return (
    <figure style={{ margin: 0, width, border: '1px solid var(--rule)', borderRadius: big ? 6 : 5,
      background: 'var(--panel)', overflow: 'hidden' }}>
      <button type="button" onClick={() => artefact.shows && setOpen(true)}
        style={{ display: 'block', lineHeight: 0, width: '100%', padding: 0, border: 0,
          background: 'transparent', cursor: artefact.shows ? 'zoom-in' : 'default' }}>
        {failed ? (
          <div style={{ height: cropHeight ?? 320, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--failed-wash)', color: 'var(--failed-ink)', fontSize: 12, padding: 14,
            textAlign: 'center', lineHeight: 1.45 }}>
            {failed}
          </div>
        ) : (
          <span style={{ display: 'block', position: 'relative' }}>
            <img src={`/api/artefacts/${artefact.id}`} alt="The screen at this step"
              onError={() => void askWhy()}
              onLoad={(e) => setShot({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              style={cropHeight
                ? { width: '100%', height: cropHeight, objectFit: 'cover', objectPosition: 'top',
                    background: 'var(--panel-2)', display: 'block' }
                : { width: '100%', height: 'auto', background: 'var(--panel-2)', display: 'block' }} />
            {/* Where the step's element actually was, drawn from the box
                measured against these pixels. The small tile crops, so a box
                below the fold there is not drawn rather than drawn in the
                wrong place; the big tile shows the whole picture uncropped,
                so the box is always visible on it. */}
            {artefact.shows && shot && (() => {
              const scale = width / shot.w;
              const top = artefact.shows.at.y * scale;
              if (cropHeight && top > cropHeight) return null;
              return (
                <span style={{ position: 'absolute', pointerEvents: 'none',
                  left: artefact.shows.at.x * scale, top,
                  width: artefact.shows.at.width * scale,
                  height: cropHeight ? Math.min(artefact.shows.at.height * scale, cropHeight - top) : artefact.shows.at.height * scale,
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
      <figcaption style={{ padding: big ? '13px 16px' : '9px 11px', display: 'flex', flexDirection: 'column',
        gap: big ? 4 : 3, borderTop: big ? '1px solid var(--rule)' : undefined }}>
        <span style={{ fontSize: big ? 15 : 12.5, fontWeight: 700 }}>
          {artefact.shows ? `Found “${artefact.shows.label}”` : 'Screenshot'}
        </span>
        {artefact.shows && (
          <span style={{ fontSize: big ? 12.5 : 11.5, color: 'var(--ink-2)' }}>
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

/**
 * A run waiting for a person (the Human in the Loop step). What it asks, what
 * it has found so far, and the one act that lets it carry on — with whatever
 * the step asked to be handed back. Waiting is not failure: the run is intact
 * and holds for as long as it takes (§10).
 */
function WaitingForYou({ run, steps, again }: {
  run: RunView['run']; steps: Array<Record<string, unknown>>; again: () => void;
}) {
  const held = (run as unknown as { held?: { resumeAt: number; request: string; values: Record<string, string | null> } }).held;
  const step = held ? steps[held.resumeAt - 2] as { handsBack?: Array<{ name: string; label: string; required: boolean }> } | undefined : undefined;
  const asks = step?.handsBack ?? [];
  const [given, setGiven] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  if (!held) return null;

  const carryOn = async () => {
    setBusy(true); setRefused(null);
    const res = await fetch(`/api/runs/${run.reference}/continue`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handedBack: given }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) again(); else setRefused(body.why ?? 'That did not work.');
  };

  return (
    <section style={{ margin: '18px 0 4px', background: 'var(--attention-wash)', borderLeft: '3px solid var(--attention)',
      borderRadius: 5, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--attention-ink)' }}>Waiting for a person</div>
      <div style={{ fontSize: 14, lineHeight: 1.6 }}>{held.request}</div>
      {Object.keys(held.values).length > 0 && (
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 13 }}>
          {Object.entries(held.values).map(([k, v]) => (
            <span key={k}><span style={{ color: 'var(--ink-2)' }}>{k} </span><Verbatim>{v ?? 'not there'}</Verbatim></span>
          ))}
        </div>
      )}
      {asks.map((a) => (
        <label key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
          <span style={{ width: 180 }}>{a.label}{a.required ? '' : ' (if any)'}</span>
          <input value={given[a.name] ?? ''} onChange={(e) => setGiven((g) => ({ ...g, [a.name]: e.target.value }))}
            style={{ font: 'inherit', fontSize: 13.5, padding: '7px 9px', border: '1px solid var(--rule-2)', borderRadius: 3, width: 280 }} />
        </label>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" disabled={busy} onClick={() => void carryOn()}
          style={{ font: 'inherit', fontSize: 13.5, fontWeight: 600, padding: '9px 16px', borderRadius: 3, border: 0,
            background: 'var(--ink)', color: 'var(--page)', cursor: busy ? 'default' : 'pointer' }}>
          It's done. Carry on</button>
        <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
          The run opens the application again and continues from step {held.resumeAt}.</span>
      </div>
      {refused && <div style={{ fontSize: 13, color: 'var(--failed-ink)' }}>{refused}</div>}
    </section>
  );
}
