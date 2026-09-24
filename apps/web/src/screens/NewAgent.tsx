/**
 * A new agent, started on the editor (Orbit 2.6,
 * docs/plans/2026-09-23-start-on-the-editor.md, E1–E4, E10).
 *
 * Bring In was the last page before the one page for an agent's whole life.
 * What it asked has a place here instead: the systems first, because they are
 * the one choice that bounds everything the agent can reach; then the
 * procedure — written, pasted, a PDF, or shown once. The name may wait.
 *
 * Nothing is saved until there is something to keep, so a page opened and
 * left leaves no empty agent behind. Whichever way it arrives — written here
 * and kept, pasted, or a PDF — it is sorted and drafted straight away, with
 * nothing to confirm.
 */
import { useState } from 'react';
import { Page, Refusal } from '../Page.tsx';
import { send, useFetch } from '../fetching.ts';
import { EmptyState } from '../ui.tsx';
import type { Route } from '../router.ts';
import { AppChip, connectorName } from '../editor/Applications.tsx';
import { PdfPicker } from './BringIn.tsx';

interface Application {
  id: string; name: string; surface: string; retired_at: string | null;
  addresses: Array<{ host: string; pathPrefix?: string }>;
}

type Way = 'write' | 'paste' | 'pdf' | 'show';
const WAYS: Array<[Way, string]> = [['write', 'Write it'], ['paste', 'Paste it'], ['pdf', 'Drop a PDF'], ['show', 'Show it once']];

const box: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', font: 'inherit', fontSize: 15, lineHeight: 1.7, padding: '12px 14px',
  border: '1px solid var(--rule-2)', borderRadius: 5, resize: 'vertical', background: 'var(--panel)',
};
const small: React.CSSProperties = {
  font: 'inherit', fontSize: 12.5, padding: '3px 7px', border: '1px solid var(--rule-2)', borderRadius: 3, background: 'var(--panel)', width: 110,
};

export function NewAgent({ go }: { go: (to: Route) => void }) {
  const apps = useFetch<{ applications: Application[] }>('/api/applications', 'applications');
  const [name, setName] = useState('');
  /** Picked, in the order picked: the first is the one the agent is brought in against. */
  const [picked, setPicked] = useState<string[]>([]);
  const [paths, setPaths] = useState<Record<string, string>>({});
  const [way, setWay] = useState<Way>('write');
  const [text, setText] = useState('');
  const [pdf, setPdf] = useState<{ name: string; bytes: number; base64: string } | null>(null);
  const [moreToCome, setMoreToCome] = useState(false);
  const [showOn, setShowOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const inService = apps.state === 'loaded' ? apps.value.applications.filter((a) => !a.retired_at) : [];
  const chosen = picked.map((id) => inService.find((a) => a.id === id)).filter((a): a is Application => Boolean(a));
  const web = chosen.filter((a) => a.surface !== 'terminal');
  const pathOf = (a: Application) => paths[a.id] ?? a.addresses[0]?.pathPrefix ?? '/';
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const systems = () => {
    const [first, ...rest] = chosen;
    return {
      applicationId: first!.id, startPath: first!.surface === 'terminal' ? '/' : pathOf(first!),
      alsoOn: rest.map((a) => ({ applicationId: a.id, startPath: a.surface === 'terminal' ? '/' : pathOf(a) })),
    };
  };

  const bringIn = async (body: Record<string, unknown>) => {
    setBusy(true); setRefused(null);
    const result = await send<{ id: string }>('/api/understanding', {
      ...(name.trim() ? { name: name.trim() } : {}), inputs: {}, ...systems(), ...body });
    setBusy(false);
    if (result.ok) go({ at: 'agent', id: result.value.id });
    else setRefused(result.why);
  };

  const record = async () => {
    const on = web.find((a) => a.id === (showOn || web[0]?.id));
    if (!on) return;
    setBusy(true); setRefused(null);
    const result = await send<{ id: string }>('/api/recordings', { name: name.trim() || 'Untitled agent', applicationId: on.id, startPath: pathOf(on) });
    setBusy(false);
    // Its own address, so a refresh does not strand a browser the worker is holding open.
    if (result.ok) go({ at: 'recording', id: result.value.id });
    else setRefused(result.why);
  };

  const noneYet = chosen.length === 0;
  const ready = !noneYet && !busy;

  return (
    <Page kicker="New agent · nothing is kept until you start"
      title={<input aria-label="Name for this agent" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this agent"
        style={{ font: 'inherit', fontSize: 33, fontWeight: 700, letterSpacing: '-0.024em', border: 0, borderBottom: '1px dashed var(--rule-2)',
          background: 'transparent', padding: 0, width: '100%', maxWidth: 640, color: 'var(--ink)' }} />}>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 400px', gap: 28, paddingTop: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <fieldset style={{ border: '1.5px solid var(--ink)', borderRadius: 6, background: 'var(--panel)', padding: '18px 22px', margin: 0 }}>
            <legend style={{ fontSize: 12, fontWeight: 700, padding: '0 6px' }}>First</legend>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Which systems does this procedure use?</div>
            {apps.state === 'empty' ? <EmptyState of={apps.of} /> : inService.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                {apps.value.applications.length === 0
                  ? 'No system has been registered yet. One has to exist, in Admin, before an agent can be pointed at it.'
                  : 'Every registered system has been retired. Nothing new can be started until one is in service.'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {inService.map((a) => {
                  const on = picked.includes(a.id);
                  return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1.5px solid ${on ? 'var(--ink)' : 'var(--rule-2)'}`,
                      borderRadius: 4, padding: '10px 14px', minHeight: 44, background: 'var(--panel)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 12, flexGrow: 1, cursor: 'pointer', fontSize: 14 }}>
                        <input type="checkbox" checked={on} onChange={() => toggle(a.id)} />
                        <AppChip app={a} />
                        <span style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>{connectorName(a.surface)}</span>
                      </label>
                      {on && a.surface !== 'terminal' && (
                        <label style={{ fontSize: 12, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 6 }}>starts at
                          <input value={pathOf(a)} onChange={(e) => setPaths({ ...paths, [a.id]: e.target.value })} style={small} /></label>
                      )}
                      {on && picked.length > 1 && picked[0] === a.id && <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>opened first</span>}
                    </div>
                  );
                })}
              </div>
            )}
            <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
              Pick every system the procedure touches. The agent reaches these and no others. Orbit places each sentence on one
              of them, and asks when it cannot tell which.</p>
          </fieldset>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Then</div>
            <div role="tablist" aria-label="How the procedure comes in" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {WAYS.map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={way === key} onClick={() => setWay(key)}
                  style={{ font: 'inherit', fontSize: 13.5, fontWeight: 600, borderRadius: 3, padding: '9px 16px', cursor: 'pointer', minHeight: 40,
                    color: way === key ? 'var(--page)' : 'var(--ink)', background: way === key ? 'var(--ink)' : 'transparent',
                    border: `1px solid ${way === key ? 'var(--ink)' : 'var(--rule-2)'}` }}>{label}</button>
              ))}
            </div>
          </div>

          <div style={{ opacity: noneYet ? 0.55 : 1 }}>
            {noneYet && <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 10 }}>Pick the systems first.</div>}

            {way === 'write' && (<>
              <textarea rows={9} value={text} onChange={(e) => setText(e.target.value)} aria-label="The procedure, in your words"
                disabled={noneYet} placeholder={'Write it the way you would to somebody starting Monday.\n\n1. Sign in to the portal.\n2. Open the loan file using the loan number.'}
                style={box} />
              <Go disabled={!ready || text.trim().length < 5} onClick={() => void bringIn({ blank: true, firstWords: text })}>Keep these words</Go>
              <Note>When you keep them, Orbit sorts your words and drafts them straight away, as it does a paste. Anything you add
                afterwards is mapped when you press Map changes.</Note>
            </>)}

            {(way === 'paste' || way === 'pdf') && (<>
              {way === 'paste'
                ? <textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} aria-label="The procedure, pasted"
                    disabled={noneYet} placeholder="Paste the procedure exactly as it is written." style={box} />
                : <div style={{ border: '1px dashed var(--rule-2)', borderRadius: 5, padding: '22px 18px', background: 'var(--panel)' }}>
                    <PdfPicker chosen={pdf} onChosen={setPdf} /></div>}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, marginTop: 10, minHeight: 32 }}>
                <input type="checkbox" checked={moreToCome} onChange={(e) => setMoreToCome(e.target.checked)} />
                More to come: don't draft yet, I'll add the next part after this</label>
              <Go disabled={!ready || (way === 'paste' ? text.trim().length < 20 : !pdf)}
                onClick={() => void bringIn(way === 'paste' ? { procedure: text, moreToCome } : { pdf: pdf!.base64, moreToCome })}>
                {moreToCome ? 'Bring in this part' : 'Bring it in and draft it'}</Go>
              <Note>Orbit sorts every sentence and drafts it straight away, showing you as it goes. There is nothing to confirm first:
                anything it needs from you is asked on the sentence it concerns.</Note>
            </>)}

            {way === 'show' && (web.length === 0 ? (
              <div style={{ border: '1px solid var(--rule)', borderRadius: 5, padding: '16px 18px', background: 'var(--panel)', fontSize: 13.5, lineHeight: 1.6 }}>
                {noneYet ? 'Pick a web system to show it on.'
                  : 'None of the systems you picked is a web application. Orbit can only watch a browser for now, so write the procedure instead.'}
              </div>
            ) : (
              <div style={{ border: '1.5px solid var(--running-ink)', borderRadius: 6, padding: '18px 20px', background: 'var(--panel)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Which of these will you do it on?</div>
                {web.map((a) => (
                  <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, minHeight: 32 }}>
                    <input type="radio" name="show-on" checked={(showOn || web[0]!.id) === a.id} onChange={() => setShowOn(a.id)} />
                    <AppChip app={a} /> <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>starting at {pathOf(a)}</span>
                  </label>
                ))}
                {chosen.some((a) => a.surface === 'terminal') && (
                  <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                    {chosen.filter((a) => a.surface === 'terminal').map((a) => a.name).join(', ')} {chosen.filter((a) => a.surface === 'terminal').length === 1 ? 'is a' : 'are'} terminal
                    {chosen.filter((a) => a.surface === 'terminal').length === 1 ? '' : 's'}: Orbit can only watch a browser for now, so those sentences are written.</div>
                )}
                <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                  <li>A password is a keystroke. The field is remembered and the value never leaves the page.</li>
                  <li>One recording is one path. It shows the ending that happened; the others are written or shown separately.</li>
                  <li>You do it as yourself, and the agent runs as the registered sign-in, so every control is checked again as that account before anything publishes.</li>
                </ul>
                <div><Go disabled={!ready} onClick={() => void record()}>Start: open the browser</Go></div>
                <Note>The browser opens on the machine running Orbit. When you say you have finished, the agent opens on this page.</Note>
              </div>
            ))}

            {refused && <Refusal title="Nothing was started" blockers={[refused]} />}
          </div>
        </div>

        <aside style={{ border: '1px solid var(--rule-2)', borderRadius: 6, background: 'var(--panel)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>Nothing to map yet</div>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            Once it has words, this is the agent's page for its whole life: your procedure on the left with Orbit's numbers in the
            margin, and what Orbit made of it beside it.</p>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6, borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
            A procedure written here, pasted or read from a PDF is sorted and drafted without stopping. It stops, and says why, only when you have said
            more is to come, or when nothing in it is Orbit's to do.</p>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            Confirming before anything is published stays exactly as it is.</p>
        </aside>
      </div>
    </Page>
  );
}

const Go = ({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" disabled={disabled} onClick={onClick}
    style={{ marginTop: 10, font: 'inherit', fontSize: 13.5, fontWeight: 600, borderRadius: 3, padding: '9px 16px', minHeight: 40,
      cursor: disabled ? 'not-allowed' : 'pointer', color: disabled ? 'var(--ink-2)' : 'var(--ink)',
      background: disabled ? 'var(--panel-2)' : 'var(--primary)', border: `1px solid ${disabled ? 'var(--rule-2)' : 'var(--primary)'}` }}>
    {children}</button>
);

const Note = ({ children }: { children: React.ReactNode }) => (
  <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: 720 }}>{children}</p>
);
