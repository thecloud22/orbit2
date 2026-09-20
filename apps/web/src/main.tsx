import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './tokens.css';
import { RunPage } from './RunPage.tsx';
import { RunList, type RunSummary } from './RunList.tsx';
import { Nav } from './Nav.tsx';
import { DraftPage } from './DraftPage.tsx';

interface WorkflowSummary { id: string; name: string; steps: string; outstanding: string; live_version: number | null }

function App() {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowSummary[] | null>(null);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/workflows').then((r) => r.json())
      .then((rows: WorkflowSummary[]) => setWorkflows(rows))
      .catch(() => setWorkflows([]));
  }, []);

  useEffect(() => {
    fetch('/api/runs').then((r) => r.json()).then((rows: RunSummary[]) => {
      setRuns(rows);
      setSelected((current) => current ?? rows[0]?.reference ?? null);
    }).catch(() => setRuns([]));
  }, []);

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav current={draft ? 'Agents' : 'Runs'} />
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 36px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, paddingBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Agents</h2>
          <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
            {workflows === null ? 'reading\u2026' : `${workflows.length} brought in`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingBottom: 4 }}>
          {(workflows ?? []).map((w) => (
            <button key={w.id} type="button" onClick={() => setDraft(draft === w.id ? null : w.id)}
              style={{ font: 'inherit', fontSize: 13, fontWeight: draft === w.id ? 700 : 500, cursor: 'pointer',
                background: draft === w.id ? 'var(--failed-wash)' : 'var(--panel)',
                border: '1px solid ' + (draft === w.id ? 'var(--primary)' : 'var(--rule)'),
                borderRadius: 4, padding: '7px 12px' }}>
              {w.name} <span style={{ color: 'var(--ink-2)', fontWeight: 400 }}>· {w.steps} steps</span>
            </button>
          ))}
        </div>
      </section>
      {draft && <DraftPage id={draft} />}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '0 36px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '26px 0 11px' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Runs</h2>
          <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
            {runs === null ? 'reading\u2026' : `${runs.length} recorded`}
          </span>
        </div>
        <RunList runs={runs} selected={selected ?? ''} onSelect={setSelected} />
      </section>
      {selected && <RunPage reference={selected} />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
