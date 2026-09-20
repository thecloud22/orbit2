import type { RunStatus } from '@orbit/contract';
import { Chip, EmptyState } from './ui.tsx';

export interface RunSummary {
  reference: string;
  status: RunStatus;
  outcome: string | null;
  started_at: string | null;
  ended_at: string | null;
  version: number;
  workflow_name: string;
}

const stateOf = (status: RunStatus) =>
  status === 'succeeded' ? 'ok' as const
  : status === 'failed' ? 'failed' as const
  : status === 'running' ? 'running' as const
  : status === 'waitingForAPerson' ? 'attention' as const
  : 'quiet' as const;

export function RunList({ runs, selected, onSelect }:
  { runs: RunSummary[] | null; selected: string; onSelect: (reference: string) => void }) {
  if (runs === null) return <EmptyState of={{ kind: 'notLoadedYet' }} />;
  if (runs.length === 0) {
    return <EmptyState of={{ kind: 'nothingYet', invite: 'Start a run from an agent and it will appear here with its evidence.' }} />;
  }
  return (
    <div style={{ borderTop: '1px solid var(--ink)' }}>
      {runs.map((run, i) => (
        <button key={run.reference} type="button" onClick={() => onSelect(run.reference)}
          style={{ width: '100%', font: 'inherit', textAlign: 'left', cursor: 'pointer', border: 0,
            borderBottom: i === runs.length - 1 ? 'none' : '1px solid var(--rule)',
            background: run.reference === selected ? 'var(--failed-wash)' : 'transparent',
            boxShadow: run.reference === selected ? 'inset 3px 0 0 var(--primary)' : undefined,
            padding: run.reference === selected ? '11px 13px 11px 10px' : '11px 0',
            marginLeft: run.reference === selected ? -13 : 0,
            display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 62, fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink-2)' }}>{run.reference}</span>
          <span style={{ width: 150, flexShrink: 0, fontSize: 13.5, fontWeight: 500 }}>{run.workflow_name}</span>
          <span style={{ width: 118, flexShrink: 0 }}>
            <Chip state={stateOf(run.status)}>{run.status[0]!.toUpperCase() + run.status.slice(1)}</Chip>
          </span>
          {/* The conclusion is never coloured. Naming it is honest; judging
              somebody else's business outcome would be guessing. */}
          <span style={{ flexGrow: 1, fontSize: 13.5 }}>{run.outcome ?? '—'}</span>
        </button>
      ))}
    </div>
  );
}
