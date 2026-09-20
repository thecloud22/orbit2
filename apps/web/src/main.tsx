import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './tokens.css';
import { RunPage } from './RunPage.tsx';
import { RunList, type RunSummary } from './RunList.tsx';
import { Nav } from './Nav.tsx';

function App() {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/runs').then((r) => r.json()).then((rows: RunSummary[]) => {
      setRuns(rows);
      setSelected((current) => current ?? rows[0]?.reference ?? null);
    }).catch(() => setRuns([]));
  }, []);

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav current="Runs" />
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
