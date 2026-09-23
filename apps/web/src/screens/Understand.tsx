import { useEffect, useState } from 'react';
import { Action, Page, Refusal, Section } from '../Page.tsx';
import { send } from '../fetching.ts';
import { EmptyState, type Emptiness } from '../ui.tsx';
import { unreadAdvice, unreadColumns, type RuleTable as Table_ } from '@orbit/contract';
import type { Route } from '../router.ts';
import { PdfPicker, Working } from './BringIn.tsx';

/**
 * What Orbit understood, before anything is drafted (Orbit 2.1).
 *
 * Every sentence of the procedure, in the author's words, with what Orbit will
 * do with it. Nothing is drafted until a person has read this and confirmed
 * it, because the walk is given only the sentences marked as Orbit's — a
 * sentence wrongly sorted as background is a step that silently never exists.
 *
 * The labels are not colour-coded. Colour has five jobs in Orbit and none of
 * them is "what kind of sentence this is"; a label is read, not scanned.
 */

type Label = 'task' | 'rule' | 'forAPerson' | 'background' | 'wontDo';

interface Understanding {
  status: 'queued' | 'sorting' | 'sorted' | 'refused';
  refused: { describe?: string } | null;
  confirmed_at: string | null;
  session_id: string | null;
  walk: string | null;
  more_to_come: boolean;
  parts: Array<{ key: string; source: string; added_at: string; sentences: number }>;
  name: string;
  application: string;
  sentences: Array<{
    number: string; part: string; text: string; kind: string; unterminated: boolean; page: number | null;
    label: Label | null; reason: string | null; basis: string | null; givenBy: string | null; waits: boolean;
    suspicious?: string | null;
  }>;
  coverage: { total: number; placed: number; unplaced: string[]; byLabel: Record<Label, number> };
  rules: { tables: RuleTable[] | null; refused: string | null } | null;
  chat: ChatMessage[];
}

interface ChatMessage {
  id: string; said_by: 'author' | 'orbit'; text: string | null; state: string;
  outcome: { departs?: boolean; refused?: string; offer?: string } | null; answers: string | null;
}

interface RuleTable {
  question: string;
  columns: Array<{ name: string; label: string; readBy: string | null }>;
  rows: Array<{ when: Array<{ column: string; is: string; value: string | null }>; then: string; sentence: string }>;
  otherwise: { then: string; sentence: string | null } | null;
  sentences: string[];
}

/** Said the way an author thinks of it, and in the order they matter. */
const LABELS: Array<[Label, string, string]> = [
  ['task', 'Orbit does this', 'Something to do in the application.'],
  ['rule', 'A rule', 'A condition that decides what happens.'],
  ['forAPerson', 'For a person', 'Left to a person. Orbit does not do it.'],
  ['background', 'Background', 'Nobody has to do anything.'],
  ['wontDo', 'Orbit won\'t', 'The procedure says not to.'],
];
const NAME = Object.fromEntries(LABELS.map(([l, n]) => [l, n])) as Record<Label, string>;

export function Understand({ id, go }: { id: string; go: (to: Route) => void }) {
  const [state, setState] = useState<{ ok: true; value: Understanding } | { ok: false; of: Emptiness }>(
    { ok: false, of: { kind: 'notLoadedYet' } });
  const [refresh, setRefresh] = useState(0);
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [walking, setWalking] = useState<string | null>(null);
  const [nextPart, setNextPart] = useState('');
  const [stillMore, setStillMore] = useState(false);
  const [nextPdf, setNextPdf] = useState<{ name: string; bytes: number; base64: string } | null>(null);

  const status = state.ok ? state.value.status : null;
  const chatWaiting = state.ok && state.value.chat.some((m) => m.state === 'waiting');
  useEffect(() => {
    let live = true;
    const load = async () => {
      const res = await fetch(`/api/workflows/${id}/understanding`).catch(() => null);
      if (!live) return;
      if (!res) {
        setState({ ok: false, of: { kind: 'couldNotLoad', why: 'Orbit could not be reached. Nothing is lost.' } });
        return;
      }
      if (res.status === 404) { setState({ ok: false, of: { kind: 'nothingMatching', searched: id } }); return; }
      if (!res.ok) { setState({ ok: false, of: { kind: 'couldNotLoad', why: 'The record store did not answer.' } }); return; }
      setState({ ok: true, value: await res.json() });
    };
    void load();
    // Polled only while the worker has it. Once sorted, the page changes when
    // the author changes it, and not otherwise.
    const waiting = status === null || status === 'queued' || status === 'sorting' || chatWaiting;
    const timer = waiting ? setInterval(() => { void load(); }, 1200) : null;
    return () => { live = false; if (timer) clearInterval(timer); };
  }, [id, refresh, status, chatWaiting]);

  if (walking) return <Working id={walking} go={go} onAbandon={() => setWalking(null)} />;

  if (!state.ok) {
    return <Page title="What Orbit understood"><div style={{ marginTop: 18, border: '1px solid var(--rule)',
      borderRadius: 6, background: 'var(--panel)' }}><EmptyState of={state.of} /></div></Page>;
  }

  const u = state.value;
  const sorted = u.status === 'sorted';
  const confirmed = Boolean(u.confirmed_at);
  const complete = u.coverage.placed === u.coverage.total;
  const forOrbit = u.coverage.byLabel.task + u.coverage.byLabel.rule;
  const unread = unreadColumns((u.rules?.tables ?? []) as Table_[]);

  const relabel = async (sentence: string, label: Label, waits?: boolean) => {
    setBusy(true); setRefused(null);
    const result = await send('/api/workflows/' + id + '/relabel', { sentence, label, ...(waits ? { waits } : {}) });
    setBusy(false);
    if (!result.ok) setRefused(result.why);
    setRefresh((n) => n + 1);
  };

  const addPart = async () => {
    setBusy(true); setRefused(null);
    const result = await send(`/api/workflows/${id}/parts`,
      { ...(nextPdf ? { pdf: nextPdf.base64 } : { body: nextPart }), moreToCome: stillMore });
    setBusy(false);
    if (result.ok) { setNextPart(''); setNextPdf(null); setStillMore(false); setRefresh((n) => n + 1); }
    else setRefused(result.why);
  };
  const saidMore = async (more: boolean) => {
    setBusy(true); setRefused(null);
    const result = await send(`/api/workflows/${id}/more-to-come`, { moreToCome: more });
    setBusy(false);
    if (!result.ok) setRefused(result.why);
    setRefresh((n) => n + 1);
  };

  const confirm = async () => {
    setBusy(true); setRefused(null);
    const result = await send<{ id: string }>(`/api/workflows/${id}/understood`, {});
    setBusy(false);
    if (result.ok) setWalking(result.value.id);
    else setRefused(result.why);
  };

  return (
    <Page kicker={confirmed ? 'What Orbit understood' : 'Before anything is drafted'} title={u.name}
      aside={<p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 520 }}>
        {u.status === 'queued' ? 'Waiting for a worker to pick this up.'
          : u.status === 'sorting' ? 'Orbit is reading every sentence and saying what it will do with it.'
          : u.status === 'refused' ? 'Orbit could not sort this. Nothing was kept from the attempt.'
          : confirmed ? `Confirmed. Orbit drafted from the sentences marked as its own, against ${u.application}.`
          : 'Check what Orbit will do with each sentence. Change any that are wrong, then confirm.'}
      </p>}
      actions={confirmed
        ? <Action kind="ghost" onClick={() => go({ at: 'agent', id })}>Open the draft</Action>
        : <Action disabled={!sorted || !complete || forOrbit === 0 || u.more_to_come || unread.length > 0 || busy}
            why={!sorted ? 'Orbit is still sorting'
              : unread.length > 0 ? unreadAdvice(unread)
              : u.more_to_come ? 'You said more is to come: add it, or say that is all'
              : !complete ? `${u.coverage.total - u.coverage.placed} sentences have no label yet`
              : forOrbit === 0 ? 'Nothing is marked for Orbit to do'
              : 'Working'}
            onClick={() => void confirm()}>Confirm and draft it</Action>}>

      {u.status === 'refused' && (
        <Refusal tone="failed" title="This was not sorted"
          blockers={[u.refused?.describe ?? 'No reason was recorded.']} />
      )}
      {refused && <Refusal title="That was not changed" blockers={[refused]} />}
      {confirmed && u.walk && u.walk !== 'brought in' && u.session_id && (
        <Refusal title={u.walk === 'refused' ? 'The draft could not be made' : 'The draft is being made'}
          tone={u.walk === 'refused' ? 'failed' : 'attention'}
          blockers={[u.walk === 'refused'
            ? 'The walk over these sentences did not produce a draft. Open it to see why.'
            : 'Orbit is working through the sentences marked as its own against the application.']} />
      )}

      <Section title="Placed" note={`${u.coverage.placed} of ${u.coverage.total} sentences`}>
        <Coverage coverage={u.coverage} />
      </Section>

      {sorted && u.rules && (u.rules.refused || (u.rules.tables?.length ?? 0) > 0) && (
        <Section title="The rules, as tables"
          note="for checking; Orbit is given the rule sentences themselves">
          {u.rules.refused
            ? <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-2)', maxWidth: 760 }}>{u.rules.refused}</p>
            : u.rules.tables!.map((t, i) => <Table key={i} table={t} n={i + 1} />)}
        </Section>
      )}

      {!confirmed && (sorted || u.chat.length > 0) && (
        <Section title="Ask for a change" note="drafting only: this changes this draft and nothing else">
          <Chat messages={u.chat} busy={busy || !sorted}
            onSend={async (text) => {
              setBusy(true); setRefused(null);
              const result = await send(`/api/workflows/${id}/chat`, { text });
              setBusy(false);
              if (!result.ok) setRefused(result.why);
              setRefresh((n) => n + 1);
              return result.ok;
            }}
            onTake={async (messageId) => {
              setBusy(true); setRefused(null);
              const result = await send(`/api/workflows/${id}/take-offer`, { messageId });
              setBusy(false);
              if (!result.ok) setRefused(result.why);
              setRefresh((n) => n + 1);
            }} />
        </Section>
      )}

      <Section title="The procedure, sentence by sentence"
        note={sorted && !confirmed ? 'change a label and it is kept alongside Orbit\'s, which stays on the record' : undefined}>
        {(u.status === 'queued' || u.status === 'sorting') && (
          <div className="orbit-working" style={{ padding: '4px 0 14px', fontSize: 13.5, color: 'var(--ink-2)' }}>
            {u.status === 'queued' ? 'Waiting for a worker' : 'Sorting'}
            <span style={{ fontFamily: 'var(--mono)' }}>
              <span className="orbit-dot">.</span><span className="orbit-dot">.</span><span className="orbit-dot">.</span>
            </span>
          </div>
        )}
        <div style={{ borderTop: '1px solid var(--ink)' }}>
          {u.sentences.map((s, i) => (
            <div key={s.number}>
            {/* A heading for each part, once there is more than one. */}
            {u.parts.length > 1 && (i === 0 || u.sentences[i - 1]!.part !== s.part) && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '16px 0 8px',
                borderBottom: '1px solid var(--rule)' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>Part {s.part}</span>
                <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                  {partNote(u.parts.find((p) => p.key === s.part))}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start',
              borderBottom: '1px solid var(--rule)', padding: '12px 0' }}>
              <span style={{ width: 46, flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 12,
                color: 'var(--ink-2)', paddingTop: 2 }}>{s.number}
                {s.page !== null && <span style={{ display: 'block', fontSize: 11, marginTop: 3 }}>p. {s.page}</span>}
              </span>
              <span style={{ flexGrow: 1, minWidth: 0, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                fontWeight: s.kind === 'heading' ? 700 : 400,
                color: s.label === 'background' || s.label === 'wontDo' ? 'var(--ink-2)' : 'var(--ink)' }}>
                {s.text}
                {/* Parts are kept exactly as pasted, so a sentence cut at a
                    page break is shown as a pair, never joined. */}
                {s.suspicious && (
                  <span style={{ display: 'block', fontSize: 12.5, color: 'var(--failed-ink)', marginTop: 4, fontWeight: 600 }}>
                    Careful: {s.suspicious}. Orbit treats it as text and does not follow it.
                  </span>
                )}
                {s.unterminated && (
                  <span style={{ display: 'block', fontSize: 12.5, color: 'var(--attention-ink)', marginTop: 4 }}>
                    Stops mid-sentence. The next part may carry on from here.
                  </span>
                )}
                {i > 0 && u.sentences[i - 1]!.unterminated && u.sentences[i - 1]!.part !== s.part && (
                  <span style={{ display: 'block', fontSize: 12.5, color: 'var(--attention-ink)', marginTop: 4 }}>
                    May carry on from {u.sentences[i - 1]!.number}.
                  </span>
                )}
              </span>
              <span style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {s.label === null ? (
                  <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{sorted ? 'No label' : 'Not sorted yet'}</span>
                ) : sorted && !confirmed ? (
                  <select value={s.label} disabled={busy} aria-label={`What sentence ${s.number} is for`}
                    onChange={(e) => void relabel(s.number, e.target.value as Label)}
                    style={{ font: 'inherit', fontSize: 13.5, fontWeight: 600, padding: '6px 8px',
                      border: '1px solid var(--rule-2)', borderRadius: 3, background: 'var(--panel)', color: 'var(--ink)' }}>
                    {LABELS.map(([l, n]) => <option key={l} value={l}>{n}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{NAME[s.label]}</span>
                )}
                {/* The Human in the Loop step: only a person marks where the
                    run stops for somebody, never the model. */}
                {s.label === 'forAPerson' && (sorted && !confirmed ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
                    <input type="checkbox" checked={s.waits} disabled={busy}
                      onChange={(e) => void relabel(s.number, 'forAPerson', e.target.checked)} />
                    The run waits here until this is done
                  </label>
                ) : s.waits && (
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>The run waits here</span>
                ))}
                {s.reason && (
                  <span style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                    {s.givenBy === 'author' ? 'You: ' : s.basis === 'inferred' ? 'Orbit concluded: ' : 'Orbit: '}
                    {s.reason}
                  </span>
                )}
              </span>
            </div>
            </div>
          ))}
        </div>
      </Section>

      {/* The open end (§13): the author said this is not all of it. Orbit waits
          for the rest rather than take a page break for the end. */}
      {!confirmed && (u.more_to_come ? (
        <Section title="More to come" note="nothing can be confirmed until the procedure is all here">
          <div style={{ border: '2px dashed var(--rule-2)', borderRadius: 6, padding: '16px 18px',
            display: 'flex', flexDirection: 'column', gap: 11, maxWidth: 900 }}>
            <label htmlFor="next-part" style={{ fontSize: 13.5, fontWeight: 600 }}>
              Add the next part</label>
            <PdfPicker chosen={nextPdf} onChosen={setNextPdf} />
            {!nextPdf && <textarea id="next-part" rows={5} value={nextPart} onChange={(e) => setNextPart(e.target.value)}
              placeholder="Paste the next page or two, exactly as written"
              style={{ width: '100%', font: 'inherit', fontSize: 14, lineHeight: 1.7, padding: '12px 14px',
                border: '1px solid var(--rule-2)', borderRadius: 4, background: 'var(--panel)', resize: 'vertical' }} />}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
              <input type="checkbox" checked={stillMore} onChange={(e) => setStillMore(e.target.checked)} />
              There is still more after this part
            </label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Action disabled={busy || !sorted || (!nextPart.trim() && !nextPdf)}
                why={!sorted ? 'Orbit is still sorting the last part' : 'Paste the next part first'}
                onClick={() => void addPart()}>Sort this part</Action>
              <span style={{ flexGrow: 1 }} />
              <Action kind="ghost" disabled={busy} onClick={() => void saidMore(false)}>That's all of it</Action>
            </div>
          </div>
        </Section>
      ) : sorted && (
        <div style={{ paddingTop: 14 }}>
          <button type="button" onClick={() => void saidMore(true)} disabled={busy}
            style={{ font: 'inherit', fontSize: 13, color: 'var(--ink-2)', background: 'transparent', border: 0,
              padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
            There is more of this procedure to add
          </button>
        </div>
      ))}

      {!confirmed && <Section title="What happens when you confirm">
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink-2)', maxWidth: 760 }}>
          Orbit works through the sentences marked <strong>Orbit does this</strong> and <strong>A rule</strong> against {u.application},
          in this order and in these words, and drafts the steps. Sentences for a person, and what the procedure
          says not to do, are written onto the draft as decided, so it says what it leaves out.
          Background is kept here and goes nowhere else.
        </p>
      </Section>}
    </Page>
  );
}

function Coverage({ coverage }: { coverage: Understanding['coverage'] }) {
  const { total, placed, byLabel } = coverage;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 900 }}>
      <div role="img" aria-label={`${placed} of ${total} sentences placed`}
        style={{ display: 'flex', height: 10, borderRadius: 2, overflow: 'hidden', background: 'var(--panel-2)' }}>
        {/* One ink, in steps of weight: a count, not a status. */}
        {LABELS.map(([l], i) => byLabel[l] > 0 && (
          <span key={l} style={{ width: `${(byLabel[l] / Math.max(total, 1)) * 100}%`, background: 'var(--ink)',
            opacity: 1 - i * 0.17, borderRight: '1px solid var(--page)' }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 13 }}>
        {LABELS.map(([l, n, what], i) => (
          <span key={l} title={what} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 1, background: 'var(--ink)', opacity: 1 - i * 0.17 }} />
            <span>{n}</span>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{byLabel[l]}</span>
          </span>
        ))}
        {placed < total && (
          <span style={{ color: 'var(--ink-2)' }}>
            Not placed <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{total - placed}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function partNote(part: { source: string; added_at: string; sentences: number } | undefined): string {
  if (!part) return '';
  const from = part.source === 'author' ? 'written by you' : part.source === 'pdf' ? 'from a PDF' : 'pasted';
  return `${from} · ${part.sentences} sentence${part.sentences === 1 ? '' : 's'} · ${new Date(part.added_at).toLocaleString()}`;
}

const SAYS: Record<string, string> = {
  is: 'is', isNot: 'is not', isMoreThan: 'is more than', isAtLeast: 'is at least', isLessThan: 'is less than',
  isAtMost: 'is at most', isBefore: 'is before', isAfter: 'is after', isAbsent: 'is not there', isPresent: 'is there',
};

/**
 * One rule as a table. A column no task reads is the one thing marked, because
 * it is the one thing that blocks: nothing would ever have that value to compare.
 */
function Table({ table, n }: { table: RuleTable; n: number }) {
  const cell = { padding: '8px 10px 8px 0', fontSize: 13, verticalAlign: 'top' as const, borderBottom: '1px solid var(--rule)' };
  return (
    <div style={{ paddingBottom: 22, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingBottom: 6 }}>
        <span style={{ fontSize: 14.5, fontWeight: 700 }}>Table {n} · {table.question}</span>
        <span style={{ fontSize: 12, color: 'var(--ink-2)', fontFamily: 'var(--mono)' }}>from {table.sentences.join(', ')}</span>
      </div>
      <table style={{ borderCollapse: 'collapse', width: '100%', borderTop: '1px solid var(--ink)' }}>
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th key={c.name} scope="col" style={{ ...cell, textAlign: 'left', fontWeight: 600, color: 'var(--ink-2)', fontSize: 12.5 }}>
                {c.label}
                <span style={{ display: 'block', fontWeight: 400, fontSize: 11.5, marginTop: 2,
                  color: c.readBy ? 'var(--ink-2)' : 'var(--attention-ink)' }}>
                  {c.readBy ? `read by ${c.readBy}` : 'no task reads this'}
                </span>
              </th>
            ))}
            <th scope="col" style={{ ...cell, textAlign: 'left', fontWeight: 600, color: 'var(--ink-2)', fontSize: 12.5 }}>Then</th>
            <th scope="col" style={{ ...cell, width: 60 }} />
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              {table.columns.map((c) => {
                const conditions = r.when.filter((w) => w.column === c.name);
                return <td key={c.name} style={cell}>
                  {conditions.length === 0 ? <span style={{ color: 'var(--ink-2)' }}>any</span>
                    : conditions.map((w, j) => <span key={j} style={{ display: 'block' }}>
                        {SAYS[w.is] ?? w.is}{w.value !== null ? ` ${w.value}` : ''}</span>)}
                </td>;
              })}
              <td style={cell}>{r.then}</td>
              <td style={{ ...cell, fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-2)' }}>{r.sentence}</td>
            </tr>
          ))}
          {table.otherwise && (
            <tr>
              <td colSpan={table.columns.length} style={{ ...cell, color: 'var(--ink-2)' }}>otherwise</td>
              <td style={cell}>{table.otherwise.then}</td>
              <td style={{ ...cell, fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-2)' }}>{table.otherwise.sentence ?? ''}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The chat (§12). Orbit's answers are its own fixed words where it changed
 * something or refused, and the model's only where it explained; each says
 * what happened to the draft, so nobody has to infer it from a changed label.
 */
function Chat({ messages, busy, onSend, onTake }: {
  messages: ChatMessage[]; busy: boolean;
  onSend: (text: string) => Promise<boolean>; onTake: (messageId: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const taken = new Set(messages.filter((m) => m.state === 'applied' && m.answers).map((m) => m.answers!));
  const waiting = messages.some((m) => m.state === 'waiting');
  const tag = (m: ChatMessage): [string, string] | null =>
    m.state === 'applied' ? (m.outcome?.departs ? ['Not in the procedure', 'var(--attention-ink)'] : ['Applied', 'var(--ok-ink)'])
      : m.state === 'offered' ? ['Offered', 'var(--attention-ink)']
      : m.state === 'refused' ? ['Not done', 'var(--failed-ink)']
      : null;
  return (
    <div style={{ maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {messages.map((m) => m.said_by === 'author' ? (
        <div key={m.id} style={{ alignSelf: 'flex-end', maxWidth: 620, background: 'var(--panel-2)', borderRadius: 8,
          padding: '9px 12px', fontSize: 13.5, lineHeight: 1.5, color: m.text === null ? 'var(--ink-2)' : 'var(--ink)' }}>
          {m.text ?? 'A message that looked like a secret. It was not sent and not kept.'}
        </div>
      ) : (
        <div key={m.id} style={{ maxWidth: 700, border: '1px solid var(--rule-2)', borderRadius: 6, padding: '10px 13px',
          background: 'var(--panel)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tag(m) && <span style={{ fontSize: 12, fontWeight: 700, color: tag(m)![1] }}>{tag(m)![0]}</span>}
          <span style={{ fontSize: 13.5, lineHeight: 1.55 }}>{m.text}</span>
          {m.state === 'offered' && !taken.has(m.id) && (
            <span><Action kind="ghost" disabled={busy} onClick={() => void onTake(m.id)}>Add it for a person</Action></span>
          )}
        </div>
      ))}
      {waiting && (
        <div className="orbit-working" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
          Orbit is reading that<span style={{ fontFamily: 'var(--mono)' }}>
            <span className="orbit-dot">.</span><span className="orbit-dot">.</span><span className="orbit-dot">.</span></span>
        </div>
      )}
      <label htmlFor="ask" style={{ fontSize: 12.5, fontWeight: 600, marginTop: 4 }}>Ask for a change to this draft</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea id="ask" rows={2} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Add a step in your words, say what a sentence is for, or ask why"
          style={{ flexGrow: 1, font: 'inherit', fontSize: 13.5, border: '1px solid var(--rule-2)', borderRadius: 4,
            padding: '9px 10px', resize: 'none', background: 'var(--panel)' }} />
        <Action disabled={busy || waiting || !text.trim()} why={waiting ? 'Orbit is still answering' : 'Say what to change'}
          onClick={() => void onSend(text).then((ok) => { if (ok) setText(''); })}>Send</Action>
      </div>
    </div>
  );
}
