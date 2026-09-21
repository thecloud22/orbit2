import { createServer } from 'node:http';
import { serveArtefact } from './artefacts.ts';
import { listApplications, readRecording, readSession } from './authoring.ts';
import { listRuns, readRun, readRunSteps } from './runs.ts';
import { listWorkflows, readWorkflow } from './workflows.ts';
import { testCases } from './activate.ts';
import { actions, readBody } from './actions.ts';
import { readAdmin, readAudit } from './admin.ts';
import { pool } from './db.ts';

const port = Number(process.env['ORBIT_PORT'] ?? 4000);

const json = (res: import('node:http').ServerResponse, status: number, body: unknown) => {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(payload);
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  try {
    if (url.pathname === '/api/runs') return json(res, 200, await listRuns());

    if (req.method === 'POST') {
      const [, , kind, id, verb] = url.pathname.split('/');
      const body = await readBody(req);
      const route = `${kind}/${verb}`;
      if (kind === 'recordings' && !id) {
        const r = await actions.startRecording(body); return json(res, r.status, r.body);
      }
      if (kind === 'recordings' && id && verb === 'finish') {
        const r = await actions.finishRecording(id); return json(res, r.status, r.body);
      }
      if (kind === 'authoring' && !id) {
        const r = await actions.bringIn(body); return json(res, r.status, r.body);
      }
      if (kind === 'applications' && !id) {
        const r = await actions.registerApplication(body); return json(res, r.status, r.body);
      }
      if (kind === 'applications' && id && verb === 'edit') {
        const r = await actions.editApplication(id, body); return json(res, r.status, r.body);
      }
      if (kind === 'workflows' && id) {
        if (verb === 'confirm') { const r = await actions.confirm(id, body); return json(res, r.status, r.body); }
        if (verb === 'publish') { const r = await actions.publish(id); return json(res, r.status, r.body); }
        if (verb === 'pause')   { const r = await actions.pause(id, body); return json(res, r.status, r.body); }
        if (verb === 'resume')  { const r = await actions.resume(id); return json(res, r.status, r.body); }
        if (verb === 'edit-step')   { const r = await actions.editStep(id, body); return json(res, r.status, r.body); }
        if (verb === 'move-step')   { const r = await actions.moveStep(id, body); return json(res, r.status, r.body); }
        if (verb === 'delete-step') { const r = await actions.deleteStep(id, body); return json(res, r.status, r.body); }
        if (verb === 'insert-step') { const r = await actions.insertStep(id, body); return json(res, r.status, r.body); }
      }
      // Runs are addressed by the reference a person quotes, not by an id.
      if (kind === 'runs' && id) {
        if (verb === 'cancel') { const r = await actions.cancelRun(id); return json(res, r.status, r.body); }
        if (verb === 'retry')  { const r = await actions.retryRun(id); return json(res, r.status, r.body); }
        if (verb === 'rerun')  { const r = await actions.rerun(id); return json(res, r.status, r.body); }
      }
      if (kind === 'versions' && id) {
        if (verb === 'tests')    { const r = await actions.queueTests(id); return json(res, r.status, r.body); }
        if (verb === 'activate') { const r = await actions.activate(id); return json(res, r.status, r.body); }
        if (verb === 'runs')     { const r = await actions.startRun(id, body); return json(res, r.status, r.body); }
      }
      return json(res, 404, { kind: 'noSuchAction', route });
    }

    if (url.pathname === '/api/admin') return json(res, 200, await readAdmin());
    if (url.pathname === '/api/audit') return json(res, 200, await readAudit());
    if (url.pathname === '/api/workflows') return json(res, 200, await listWorkflows());
    if (url.pathname === '/api/applications') return json(res, 200, await listApplications());
    if (url.pathname.startsWith('/api/recordings/')) {
      const session = await readRecording(url.pathname.slice('/api/recordings/'.length));
      return session
        ? json(res, 200, session)
        : json(res, 404, { kind: 'nothingMatching', why: 'No recording with that reference.' });
    }
    if (url.pathname.startsWith('/api/authoring/')) {
      const session = await readSession(url.pathname.slice('/api/authoring/'.length));
      return session
        ? json(res, 200, session)
        : json(res, 404, { kind: 'nothingMatching', why: 'No authoring session with that reference.' });
    }

    const workflow = /^\/api\/workflows\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (workflow) {
      const found = await readWorkflow(workflow[1]!);
      return found
        ? json(res, 200, found)
        : json(res, 404, { kind: 'nothingMatching', reference: workflow[1] });
    }

    const tests = /^\/api\/versions\/([0-9a-f-]{36})\/tests$/.exec(url.pathname);
    if (tests) {
      const db = await pool.connect();
      try { return json(res, 200, await testCases(db, tests[1]!)); }
      finally { db.release(); }
    }

    const artefact = /^\/api\/artefacts\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (artefact) {
      const served = await serveArtefact(artefact[1]!);
      if (!served.ok) return json(res, served.kind === 'notFound' ? 404 : 409, served);
      res.writeHead(200, { 'content-type': served.mediaType, 'cache-control': 'no-store',
        'access-control-allow-origin': '*' });
      return res.end(served.bytes);
    }

    const match = /^\/api\/runs\/([A-Za-z0-9-]+)$/.exec(url.pathname);
    if (match) {
      const reference = match[1]!;
      const found = await readRun(reference);
      if (!found) {
        // Four states, never one: this is "nothing matching", and it says so.
        return json(res, 404, { kind: 'nothingMatching', reference });
      }
      return json(res, 200, { ...found, steps: await readRunSteps(reference) });
    }
    json(res, 404, { kind: 'noSuchRoute', path: url.pathname });
  } catch (error) {
    json(res, 500, { kind: 'couldNotLoad', why: error instanceof Error ? error.message : String(error) });
  }
}).listen(port, () => console.log(`orbit api on http://localhost:${port}`));
