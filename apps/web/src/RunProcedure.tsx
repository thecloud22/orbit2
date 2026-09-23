/**
 * A run, read on the procedure (flow step 10, R7): beside each of the
 * author's sentences, what this run did about it — the values it found, which
 * way each rule went, what it pressed, what it left to a person — read from
 * the run's own record. Nothing here is re-run or inferred: a sentence with no
 * step says so, and one the run never reached says that.
 */
import type { RunView } from '@orbit/contract';
import { useState } from 'react';

type Sentence = NonNullable<RunView['procedure']>['sentences'][number];

const OPERATORS: Record<string, string> = {
  is: 'is', isNot: 'is not', contains: 'contains', startsWith: 'starts with', isMoreThan: 'is more than',
  isAtLeast: 'is at least', isLessThan: 'is less than', isAtMost: 'is at most', isBefore: 'is before', isAfter: 'is after',
  isAbsent: 'is not there', isNotAbsent: 'is there',
};

/** One thing the run did, said from its event, never from a summary somebody wrote. */
function said(kind: string, d: Record<string, unknown>): { name?: string; what: string } | null {
  switch (kind) {
    case 'read': return { name: String(d['value']), what: String(d['read']) };
    case 'read.absent': return { name: String(d['value']), what: 'not there' };
    case 'activated': return { what: `pressed ${String(d['control'])}` };
    case 'entered': return { what: d['secret'] ? `typed the registered password into ${String(d['into'])}` : `typed into ${String(d['into'])}` };
    case 'branch.evaluated': case 'checked': {
      const test = `${String(d['left'] ?? 'nothing')} ${OPERATORS[String(d['operator'])] ?? String(d['operator'])}${d['right'] === undefined || d['right'] === null ? '' : ` ${String(d['right'])}`}`;
      return { what: kind === 'checked' ? `${test}: ${d['held'] ? 'held' : 'did not hold'}` : `${test}: ${d['tookPath'] === 'yes' ? 'yes' : 'no'}` };
    }
    case 'handed.off': return { what: d['waits'] ? `waited for a person: ${String(d['request'] ?? '')}` : `handed to a person: ${String(d['request'] ?? '')}` };
    case 'ended': return { what: `concluded ${String(d['outcome'])}` };
    default: return null;
  }
}

export function RunProcedure({ data, onPick }: { data: RunView; onPick: (attemptIndex: number) => void }) {
  const [open, setOpen] = useState(true);
  const procedure = data.procedure;
  if (!procedure?.sentences.length) return null;
  const steps = data.steps as unknown as Array<{ id?: string; kind: string }>;
  // Which sentence each step position carries out, from the version's own record.
  const sentenceAt = new Map<number, string>();
  steps.forEach((s, i) => { if (s.id && procedure.steps[s.id]) sentenceAt.set(i + 1, procedure.steps[s.id]!); });
  const attemptsOf = (n: string) => data.attempts.map((a, i) => ({ a, i })).filter(({ a }) => sentenceAt.get(a.step_position) === n);
  const shotOf = (attemptId: string) => data.stepArtefacts.find((x) => x.attempt_id === attemptId && x.kind === 'screenshot' && !x.withheld);
  const orbit = (s: Sentence) => !s.withdrawn && (s.label === 'task' || s.label === 'rule' || s.waits);
  const stepsFor = (n: string) => [...sentenceAt.values()].filter((x) => x === n).length;

  return (
    <section style={{ padding: '18px 0 20px', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 11, paddingBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>What it did, sentence by sentence</h2>
        <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>the procedure this version was published with, and what this run did about each line</span>
        <span style={{ flexGrow: 1 }} />
        <button type="button" onClick={() => setOpen((o) => !o)}
          style={{ font: 'inherit', fontSize: 12, color: 'var(--ink-2)', background: 'transparent', border: '1px solid var(--rule-2)', borderRadius: 3, padding: '2px 8px', cursor: 'pointer' }}>
          {open ? 'Hide' : 'Show'}</button>
      </div>
      {open && (
        <div style={{ borderTop: '1px solid var(--ink)' }}>
          {procedure.sentences.filter((s) => s.label !== 'background').map((s) => {
            const done = attemptsOf(s.number);
            const lines = done.flatMap(({ a }) => data.events.filter((e) => e.attempt_id === a.id)
              .map((e) => said(e.kind, e.detail)).filter((x): x is NonNullable<typeof x> => x !== null));
            const pictured = done.map(({ a, i }) => ({ i, shot: shotOf(a.id) })).filter((x) => x.shot).at(-1);
            const why = s.withdrawn ? 'Taken out of the procedure before this version.'
              : s.label === 'wontDo' ? 'Not offered to the run, and not done.'
              : s.label === 'forAPerson' && !s.waits ? 'Left to a person, and listed on this run for them.'
              : !orbit(s) ? '' : stepsFor(s.number) === 0 ? 'Carried out by steps Orbit added (see the steps below).'
              : done.length === 0 ? 'Not reached on this run: it went another way.' : '';
            return (
              <div key={s.number} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--rule)' }}>
                <span style={{ width: 40, flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-2)', paddingTop: 3 }}>{s.number}</span>
                <span style={{ width: 460, flexShrink: 0, fontSize: 14, lineHeight: 1.55, color: s.withdrawn ? 'var(--ink-2)' : 'var(--ink)',
                  textDecoration: s.withdrawn ? 'line-through' : 'none' }}>{s.text}</span>
                <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {lines.map((l, k) => (
                    <span key={k} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.45 }}>
                      <span aria-hidden style={{ color: 'var(--ok-ink)', fontWeight: 700 }}>{'↳'}</span>
                      {l.name && <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, minWidth: 110 }}>{l.name}</span>}
                      <span>{l.what}</span>
                    </span>
                  ))}
                  {why && <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{why}</span>}
                </span>
                {pictured?.shot && (
                  <button type="button" onClick={() => onPick(pictured.i)} title="See this step's evidence"
                    style={{ width: 92, flexShrink: 0, padding: 0, border: '1px solid var(--rule-2)', borderRadius: 3, background: 'var(--panel-2)', cursor: 'pointer', overflow: 'hidden' }}>
                    <img src={`/api/artefacts/${pictured.shot.id}`} alt={`The page when the run carried out ${s.number}`} loading="lazy" style={{ display: 'block', width: '100%' }} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
