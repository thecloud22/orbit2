import { useEffect, useState } from 'react';
import type { ArtefactView, RunEventView, RunView, StepAttemptView } from '@orbit/contract';
import { Dot, EmptyState, OutcomePair, Row, Verbatim, type Emptiness } from './ui.tsx';

type Loaded = { kind: 'loaded'; data: RunView } | { kind: 'empty'; of: Emptiness };

const took = (events: RunEventView[], attemptId: string): number | undefined => {
  const ended = events.find((e) => e.attempt_id === attemptId && e.kind === 'step.attempt.ended');
  const ms = ended?.detail['tookMs'];
  return typeof ms === 'number' ? ms : undefined;
};

export function RunPage({ reference }: { reference: string }) {
  const [state, setState] = useState<Loaded>({ kind: 'empty', of: { kind: 'notLoadedYet' } });
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
  }, [reference]);

  return (
    <div>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '26px 36px 60px' }}>
        {state.kind === 'empty' ? (
          <div style={{ border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--panel)', marginTop: 24 }}>
            <EmptyState of={state.of} />
          </div>
        ) : <LoadedRun data={state.data} />}
      </main>
    </div>
  );
}

function LoadedRun({ data }: { data: RunView }) {
  const { run, steps, attempts, events, stepArtefacts, runArtefacts } = data;
  const [selected, setSelected] = useState(0);
  const outcomes = run.outcomes ?? [];
  const label = (name: string) => outcomes.find((o) => o.name === name)?.label ?? name;
  const state = run.status === 'succeeded' ? 'ok' : run.status === 'failed' ? 'failed'
    : run.status === 'running' ? 'running' : 'attention';
  const trace = runArtefacts.find((a) => a.kind === 'trace');
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
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{attempts.length} steps, all reached</span>
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
                  {steps[i]?.summary ?? '—'}</span>
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
          <StepDetail attempt={attempts[selected]} step={steps[selected]}
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
  const [failed, setFailed] = useState(false);
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
      <a href={`/api/artefacts/${artefact.id}`} target="_blank" rel="noreferrer" style={{ display: 'block', lineHeight: 0 }}>
        {failed ? (
          <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--failed-wash)', color: 'var(--failed-ink)', fontSize: 12, padding: 14,
            textAlign: 'center', lineHeight: 1.45 }}>
            This did not match the digest recorded when it was captured, so it is not being shown.
          </div>
        ) : (
          <img src={`/api/artefacts/${artefact.id}`} alt="The screen at this step"
            onError={() => setFailed(true)}
            style={{ width: '100%', height: 150, objectFit: 'cover', objectPosition: 'top',
              background: 'var(--panel-2)', display: 'block' }} />
        )}
      </a>
      <figcaption style={{ padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>Screenshot</span>
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
