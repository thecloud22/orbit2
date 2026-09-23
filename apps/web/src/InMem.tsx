import type { RunEventView, RunView, StepAttemptView } from '@orbit/contract';
import { Verbatim } from './ui.tsx';

/**
 * A run's InMem (plan §11): everything the run touched, in one place, by
 * section — what it was given, what it found, what it decided, what it handed
 * to a person and what it concluded.
 *
 * Read from the run's own record rather than kept beside it, so the two can
 * never disagree. Every entry is one the run wrote once and never changed, and
 * each says where it came from: the step, and when. A secret is never here: it
 * is typed into one field and never read into the run.
 */

type Entry = { section: string; name: string; value: string; from: string; at: string };

export function entriesOf(run: RunView['run'], events: RunEventView[], attempts: StepAttemptView[],
  steps: Array<{ summary?: string }>): Entry[] {
  const stepOf = new Map(attempts.map((a) => [a.id, a.step_position]));
  const source = (e: RunEventView) => {
    const n = e.attempt_id ? stepOf.get(e.attempt_id) : undefined;
    return n ? `step ${n}${steps[n - 1]?.summary ? ` · ${steps[n - 1]!.summary}` : ''}` : 'the run';
  };
  const out: Entry[] = [];
  const started = events.find((e) => e.kind === 'run.started')?.at ?? '';
  for (const [k, v] of Object.entries(run.inputs ?? {})) {
    out.push({ section: 'Given', name: k, value: String(v), from: 'started with', at: started });
  }
  for (const e of events) {
    const d = e.detail as Record<string, unknown>;
    if (e.kind === 'read') out.push({ section: 'Found', name: String(d['value']), value: String(d['read']), from: source(e), at: e.at });
    if (e.kind === 'read.absent') out.push({ section: 'Found', name: String(d['value']), value: 'not there', from: source(e), at: e.at });
    if (e.kind === 'branch.evaluated' || e.kind === 'checked') {
      const held = e.kind === 'checked' ? (d['held'] ? 'held' : 'did not hold') : `took ${String(d['tookPath'])}`;
      out.push({ section: 'Decided', name: `${String(d['left'] ?? 'not there')} ${readable(String(d['operator']))} ${String(d['right'] ?? '')}`.trim(),
        value: held, from: source(e), at: e.at });
    }
    if (e.kind === 'handed.off') {
      out.push({ section: 'Handed over', name: d['waits'] ? 'waited for a person' : 'handed to a person',
        value: String(d['request'] ?? ''), from: source(e), at: e.at });
    }
    if (e.kind === 'run.resumed') {
      for (const [k, v] of Object.entries((d['handedBack'] as Record<string, unknown>) ?? {})) {
        out.push({ section: 'Handed over', name: k, value: String(v), from: 'handed back by a person', at: e.at });
      }
    }
    if (e.kind === 'ended') out.push({ section: 'Conclusion', name: 'reached', value: String(d['outcome']), from: source(e), at: e.at });
  }
  for (const [k, v] of Object.entries(run.outputs ?? {})) {
    out.push({ section: 'Conclusion', name: k, value: String(v), from: 'published by the ending', at: '' });
  }
  return out;
}

const readable = (op: string) => ({
  is: 'is', isNot: 'is not', isMoreThan: 'is more than', isAtLeast: 'is at least', isLessThan: 'is less than',
  isAtMost: 'is at most', isAbsent: 'is not there', isNotAbsent: 'is there', isBefore: 'is before', isAfter: 'is after',
  contains: 'contains', startsWith: 'starts with',
}[op] ?? op);

const SECTIONS = ['Given', 'Found', 'Decided', 'Handed over', 'Conclusion'];

export function InMem({ data }: { data: RunView }) {
  const entries = entriesOf(data.run, data.events, data.attempts, data.steps as Array<{ summary?: string }>);
  const download = () => {
    const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [['Section', 'Name', 'Value', 'From', 'At'], ...entries.map((e) => [e.section, e.name, e.value, e.from, e.at])]
      .map((r) => r.map(cell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `run-${data.run.reference}-inmem.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section style={{ padding: '16px 0 18px', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 11, paddingBottom: 9 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>InMem</h2>
        <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>everything this run was given, found, decided and concluded, and where each came from</span>
        <span style={{ flexGrow: 1 }} />
        <button type="button" onClick={download} disabled={entries.length === 0}
          style={{ font: 'inherit', fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 3,
            border: '1px solid var(--rule-2)', background: 'var(--panel)', cursor: 'pointer' }}>Download as a spreadsheet</button>
      </div>
      {entries.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>Nothing recorded yet.</p>
      ) : SECTIONS.filter((s) => entries.some((e) => e.section === s)).map((section) => (
        <div key={section} style={{ paddingTop: 8 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', padding: '4px 0' }}>{section}</div>
          {entries.filter((e) => e.section === section).map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, fontSize: 13, padding: '5px 0', borderTop: '1px solid var(--rule)' }}>
              <span style={{ width: 260, flexShrink: 0 }}>{e.name}</span>
              <span style={{ width: 300, flexShrink: 0 }}><Verbatim>{e.value}</Verbatim></span>
              <span style={{ flexGrow: 1, color: 'var(--ink-2)', fontSize: 12.5 }}>{e.from}</span>
              <span style={{ width: 90, textAlign: 'right', color: 'var(--ink-2)', fontSize: 12, fontFamily: 'var(--mono)' }}>
                {e.at ? new Date(e.at).toLocaleTimeString() : ''}</span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
