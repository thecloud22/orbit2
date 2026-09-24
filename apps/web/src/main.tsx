import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './tokens.css';
import { Nav } from './Nav.tsx';
import { useRoute } from './router.ts';
import { Home } from './screens/Home.tsx';
import { Editor } from './screens/Editor.tsx';
import { Agents } from './screens/Agents.tsx';
import { Demonstrating } from './screens/BringIn.tsx';
import { NewAgent } from './screens/NewAgent.tsx';
import { Runs } from './screens/Runs.tsx';
import { RunPage } from './RunPage.tsx';
import { StartRun } from './screens/StartRun.tsx';
import { AdminScreen } from './screens/Admin.tsx';
import { AuditScreen } from './screens/Audit.tsx';
import { Help } from './screens/Help.tsx';

function App() {
  const [route, go] = useRoute();
  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav current={route.at} go={go} />
      {route.at === 'home' && <Home go={go} />}
      {route.at === 'agents' && <Agents go={go} />}
      {route.at === 'agent' && <Editor id={route.id} go={go} />}
      {route.at === 'newAgent' && <NewAgent go={go} />}
      {/* The sort is part of the one page now (R1); an old link to it opens the agent. */}
      {route.at === 'understanding' && <Editor id={route.id} go={go} />}
      {route.at === 'recording' && (
        <Demonstrating id={route.id} go={go} onAbandon={() => go({ at: 'newAgent' })} />
      )}
      {route.at === 'runs' && <Runs go={go} />}
      {route.at === 'run' && <RunPage reference={route.reference} go={go} />}
      {route.at === 'start' && <StartRun version={route.version} go={go} />}
      {route.at === 'admin' && <AdminScreen />}
      {route.at === 'audit' && <AuditScreen />}
      {route.at === 'help' && <Help />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
