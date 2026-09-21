import { useEffect, useState } from 'react';
import { Action, Page, Refusal, Section } from '../Page.tsx';
import { send, useFetch } from '../fetching.ts';
import { EmptyState } from '../ui.tsx';
import type { Route } from '../router.ts';

/**
 * §5's two ways in, meeting at the same place.
 *
 * Both produce a draft you check before anything is published. Neither skips a
 * gate: a recording proposes steps exactly as a written procedure does.
 *
 * The button used to be disabled, reading "authoring runs from the worker for
 * now" — true, and not a product. The browser does live in the worker
 * (Decision 2) and is staying there; what was missing was a way to ask for it.
 * Asking queues a session and the worker claims it with the same lease a run
 * uses, so this screen waits on a queue rather than on a request.
 *
 * And it never said which application it would be run against. The command
 * line took whichever was registered most recently, which is a defensible
 * thing for a developer tool to do and an indefensible thing to hide from
 * somebody about to point an agent at a system.
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
  turns: Array<{ turn: number; verdict: string; why: string;
                 shown: { page?: string; elements?: number } }>;
}

const field: React.CSSProperties = {
  font: 'inherit', fontSize: 14, padding: '9px 11px', width: '100%', boxSizing: 'border-box',
  border: '1px solid var(--rule-2)', borderRadius: 4, background: 'var(--panel)', color: 'var(--ink)',
};

export function BringIn({ go }: { go: (to: Route) => void }) {
  const [way, setWay] = useState<'write' | 'record'>('write');
  const apps = useFetch<{ applications: Application[] }>('/api/applications', 'applications');

  const [name, setName] = useState('');
  const [procedure, setProcedure] = useState('');
  const [chosen, setChosen] = useState('');
  const [startPath, setStartPath] = useState('/');
  const [inputs, setInputs] = useState<Array<{ name: string; value: string }>>([{ name: '', value: '' }]);
  const [refused, setRefused] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const application = apps.state === 'loaded'
    ? apps.value.applications.find((a) => a.id === chosen) : undefined;

  async function ask() {
    setRefused(null);
    const result = await send<{ id: string }>('/api/authoring', {
      name, procedure, applicationId: chosen, startPath,
      inputs: Object.fromEntries(inputs.filter((i) => i.name.trim()).map((i) => [i.name.trim(), i.value])),
    });
    if (result.ok) setSessionId(result.value.id);
    else setRefused(result.why);
  }

  if (sessionId) return <Working id={sessionId} go={go} onAbandon={() => setSessionId(null)} />;

  return (
    <Page kicker="New agent" title="Bring in a procedure"
      aside={<p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 520 }}>
        Two ways in. They meet at the same place: a draft you check before anything is fixed.
      </p>}>
      <div style={{ display: 'flex', gap: 12, paddingTop: 22 }}>
        <Pick chosen={way === 'write'} onPick={() => setWay('write')} title="Write it out"
          body="Describe it the way you would to somebody starting Monday. Orbit works through it against the application." />
        <Pick chosen={way === 'record'} onPick={() => setWay('record')} title="Show it once"
          body="Do the job by hand while Orbit watches. It records what you touched rather than guessing what you meant." />
      </div>

      <Section title="Which system"
        note={application ? `revision ${application.revision}` : 'the agent will only ever reach this one'}>
        {apps.state === 'empty' ? (
          <div style={{ border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--panel)' }}>
            <EmptyState of={apps.of} />
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxWidth: 780 }}>
              {apps.value.applications.map((a) => (
                <label key={a.id}
                  style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: a.retired_at ? 'not-allowed' : 'pointer',
                    border: `1px solid ${chosen === a.id ? 'var(--primary)' : 'var(--rule)'}`,
                    background: chosen === a.id ? 'var(--failed-wash)' : 'var(--panel)',
                    borderRadius: 5, padding: '13px 15px', opacity: a.retired_at ? 0.55 : 1 }}>
                  <input type="radio" name="application" value={a.id} checked={chosen === a.id}
                    disabled={Boolean(a.retired_at)}
                    onChange={() => { setChosen(a.id); setStartPath(a.addresses[0]?.pathPrefix ?? '/'); }}
                    style={{ marginTop: 3 }} />
                  <span style={{ flexGrow: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</span>
                      <span style={{ fontSize: 11.5, fontFamily: 'var(--mono)', color: 'var(--ink-2)' }}>{a.surface}</span>
                      {a.retired_at && <span style={{ fontSize: 12, color: 'var(--attention-ink)' }}>retired</span>}
                    </span>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-2)', marginTop: 4 }}>
                      {/* The hosts are the containment. §7: a version reaches
                          the addresses its application recorded and nothing
                          else, so they are shown before anything is pointed
                          at them rather than buried in an admin screen. */}
                      {a.addresses.map((x) => x.host).join(', ') || 'no address recorded'}
                      {a.sign_in_as ? ` · signs in as ${a.sign_in_as}` : ' · no sign-in recorded'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {application && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, paddingTop: 14 }}>
                <span style={{ fontSize: 13, color: 'var(--ink-2)', width: 150 }}>Start at</span>
                <input style={{ ...field, maxWidth: 320 }} value={startPath} aria-label="Path to start at"
                  onChange={(e) => setStartPath(e.target.value)} />
              </div>
            )}
          </>
        )}
      </Section>

      {way === 'write' ? (
        <>
          <Section title="The procedure">
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, paddingBottom: 13 }}>
              <span style={{ fontSize: 13, color: 'var(--ink-2)', width: 150 }}>Call this agent</span>
              <input style={{ ...field, maxWidth: 420 }} value={name} aria-label="Name for this agent"
                placeholder="Underwriting decision" onChange={(e) => setName(e.target.value)} />
            </div>
            <textarea value={procedure} onChange={(e) => setProcedure(e.target.value)} rows={6}
              aria-label="The procedure"
              placeholder="Describe it the way you would to somebody starting Monday."
              style={{ width: '100%', font: 'inherit', fontSize: 14.5, lineHeight: 1.75, color: 'var(--ink)',
                background: 'var(--panel)', border: '1px solid var(--rule-2)', borderRadius: 5,
                padding: '16px 18px', boxSizing: 'border-box', resize: 'vertical' }} />
            <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: '9px 0 0', maxWidth: 700, lineHeight: 1.55 }}>
              Kept exactly as you write it. Every question Orbit raises is a question about these words,
              so a procedure tidied on the way in would make them harder to answer.
            </p>
          </Section>

          <Section title="An example to work through"
            note="Orbit walks the procedure for real, so it needs something to walk it with">
            {inputs.map((input, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, paddingBottom: 9 }}>
                <input style={{ ...field, maxWidth: 220 }} value={input.name} placeholder="loanNumber"
                  aria-label={`Name of value ${i + 1}`}
                  onChange={(e) => setInputs((v) => v.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                <input style={{ ...field, maxWidth: 260 }} value={input.value} placeholder="ML-26-04502"
                  aria-label={`Example for value ${i + 1}`}
                  onChange={(e) => setInputs((v) => v.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                {i === inputs.length - 1 && (
                  <button type="button" onClick={() => setInputs((v) => [...v, { name: '', value: '' }])}
                    style={{ font: 'inherit', fontSize: 12.5, color: 'var(--ink-2)', background: 'transparent',
                      border: 0, cursor: 'pointer' }}>another</button>
                )}
              </div>
            ))}
            <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: '5px 0 0', maxWidth: 700, lineHeight: 1.55 }}>
              These are not part of the agent. What the procedure declares is the name; the value only
              decides which record the walk happens to look at.
            </p>
          </Section>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 4 }}>
            <Action disabled={!name.trim() || procedure.trim().length < 20 || !chosen}
              why={!chosen ? 'Choose which system it runs against'
                : !name.trim() ? 'Give the agent a name'
                : 'Say a little more about the procedure'}
              onClick={() => void ask()}>Work through it</Action>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
              A browser opens and Orbit does it once, against {application?.name ?? 'the system you choose'}.
            </span>
          </div>
          {refused && <div style={{ paddingTop: 16 }}>
            <Refusal title="This was not brought in" blockers={[refused]} />
          </div>}
        </>
      ) : (
        <Section title="Recording">
          <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.65, color: 'var(--ink-2)', maxWidth: 700 }}>
            A browser opens and you do the job once. Orbit records what you touched and turns it into steps,
            deriving how to find each control again from what the page offers.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Action disabled why="Recording opens a browser you drive, so it runs where you are">
              Start recording
            </Action>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
              {/* Honest about why this one is still a command. Writing it out
                  could move here because the browser is Orbit's; a recording
                  is a browser the person drives, and a button on a web page
                  cannot open one on their desk. */}
              You drive this browser, so it opens where you are rather than where Orbit is:{' '}
              <code style={{ fontFamily: 'var(--mono)' }}>node --experimental-strip-types src/record-cli.ts</code>
            </span>
          </div>
          <Refusal title="Three things to know before you record" blockers={[
            'A password is a keystroke. The field is remembered and the value never leaves the page.',
            'One recording is one path. It shows the ending that happened; the others must be recorded or described, and a path reaching no conclusion cannot publish.',
            'You record as yourself and the agent runs as the registered credential, so every control is checked again as that account before anything publishes.',
          ]} />
        </Section>
      )}

      <Section title="What happens next">
        <div style={{ borderTop: '1px solid var(--ink)' }}>
          {[
            ['Orbit reads the application', 'It works through what you gave it, looking at each page.'],
            ['You check every step', 'Each one is shown beside the thing on the page it was matched to.'],
            ['You confirm, then publish', 'A version is fixed the moment it is made. Editing afterwards changes nothing until you publish again.'],
          ].map(([title, body], i) => (
            <div key={title} style={{ borderBottom: i === 2 ? 'none' : '1px solid var(--rule)',
              padding: '14px 0', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span style={{ width: 20, fontSize: 12, color: 'var(--ink-2)', textAlign: 'right', paddingTop: 2 }}>{i + 1}</span>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>{body}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  );
}

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
function Working({ id, go, onAbandon }: { id: string; go: (to: Route) => void; onAbandon: () => void }) {
  const [state, setState] = useState<Session | null>(null);

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
        note={state ? `${state.turns.length} turn${state.turns.length === 1 ? '' : 's'}` : 'starting'}>
        {!state || state.turns.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-2)' }}>
            {status === 'queued' ? 'Queued.' : 'Opening the application.'}
          </p>
        ) : (
          <div style={{ borderTop: '1px solid var(--ink)' }}>
            {state.turns.map((t) => (
              <div key={t.turn} style={{ borderBottom: '1px solid var(--rule)', padding: '12px 0',
                display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ width: 18, fontSize: 12, color: 'var(--ink-2)', textAlign: 'right', paddingTop: 2 }}>{t.turn}</span>
                <span style={{ width: 82, flexShrink: 0, fontSize: 12, fontFamily: 'var(--mono)',
                  color: t.verdict === 'kept' ? 'var(--ok-ink)' : 'var(--failed-ink)' }}>{t.verdict}</span>
                <span style={{ flexGrow: 1, fontSize: 13.5 }}>{t.why}</span>
                <span style={{ fontSize: 11.5, color: 'var(--ink-2)', fontFamily: 'var(--mono)' }}>
                  {t.shown.elements} elements
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </Page>
  );
}

const Pick = ({ chosen, onPick, title, body }: {
  chosen: boolean; onPick: () => void; title: string; body: string;
}) => (
  <button type="button" onClick={onPick} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer',
    flexGrow: 1, flexBasis: 0, borderRadius: 5, padding: '18px 20px',
    background: chosen ? 'var(--failed-wash)' : 'var(--panel)',
    border: `1px solid ${chosen ? 'var(--primary)' : 'var(--rule)'}` }}>
    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{title}</div>
    <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>{body}</div>
  </button>
);
