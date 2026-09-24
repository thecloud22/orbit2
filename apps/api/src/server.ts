import { createServer } from 'node:http';
import { serveArtefact, serveScreen } from './artefacts.ts';
import { listApplications, readRecording, readSession } from './authoring.ts';
import { listRuns, readRun, readRunSteps } from './runs.ts';
import { listWorkflows, readWorkflow } from './workflows.ts';
import { versionNeeds } from './activate.ts';
import { actions, readBody } from './actions.ts';
import { readAdmin, readAudit } from './admin.ts';
import { readUnderstanding } from './understanding.ts';
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
      if (kind === 'understanding' && !id) {
        const r = await actions.understand(body); return json(res, r.status, r.body);
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
        if (verb === 'relabel') { const r = await actions.relabel(id, body); return json(res, r.status, r.body); }
        if (verb === 'chat') { const r = await actions.chat(id, body); return json(res, r.status, r.body); }
        if (verb === 'take-offer') { const r = await actions.takeOffer(id, body); return json(res, r.status, r.body); }
        if (verb === 'parts') { const r = await actions.addPart(id, body); return json(res, r.status, r.body); }
        if (verb === 'more-to-come') { const r = await actions.moreToCome(id, body); return json(res, r.status, r.body); }
        if (verb === 'understood') { const r = await actions.confirmUnderstanding(id); return json(res, r.status, r.body); }
        if (verb === 'publish') { const r = await actions.publish(id); return json(res, r.status, r.body); }
        if (verb === 'pause')   { const r = await actions.pause(id, body); return json(res, r.status, r.body); }
        if (verb === 'archive') { const r = await actions.archive(id, body); return json(res, r.status, r.body); }
        if (verb === 'resume')  { const r = await actions.resume(id); return json(res, r.status, r.body); }
        if (verb === 'edit-step')   { const r = await actions.editStep(id, body); return json(res, r.status, r.body); }
        if (verb === 'configure-step') { const r = await actions.configureStep(id, body); return json(res, r.status, r.body); }
        if (verb === 'discard')        { const r = await actions.discard(id); return json(res, r.status, r.body); }
        if (verb === 'back-to-draft')  { const r = await actions.backToDraft(id); return json(res, r.status, r.body); }
        if (verb === 'move-step')   { const r = await actions.moveStep(id, body); return json(res, r.status, r.body); }
        if (verb === 'delete-step') { const r = await actions.deleteStep(id, body); return json(res, r.status, r.body); }
        if (verb === 'insert-step') { const r = await actions.insertStep(id, body); return json(res, r.status, r.body); }
        if (verb === 'revise-sentence' || verb === 'add-sentence' || verb === 'withdraw-sentence'
          || verb === 'attach-application' || verb === 'sentence-application' || verb === 'link-value' || verb === 'rename') {
          const r = await actions.revise(verb, id, body); return json(res, r.status, r.body);
        }
        if (verb === 'map-changes') { const r = await actions.mapChanges(id); return json(res, r.status, r.body); }
        if (verb === 'answer-question') { const r = await actions.answerQuestion(id, body); return json(res, r.status, r.body); }
        if (verb && ['declare-input', 'change-input', 'remove-input', 'set-step-value', 'rename-value',
          'set-value-object', 'set-publishes'].includes(verb)) {
          const r = await actions.valueEdit(verb, id, body); return json(res, r.status, r.body);
        }
      }
      // Runs are addressed by the reference a person quotes, not by an id.
      if (kind === 'runs' && id) {
        if (verb === 'cancel') { const r = await actions.cancelRun(id); return json(res, r.status, r.body); }
        if (verb === 'retry')  { const r = await actions.retryRun(id); return json(res, r.status, r.body); }
        if (verb === 'checked') { const r = await actions.checkRun(id); return json(res, r.status, r.body); }
        if (verb === 'continue') { const r = await actions.continueRun(id, body); return json(res, r.status, r.body); }
        if (verb === 'rerun')  { const r = await actions.rerun(id); return json(res, r.status, r.body); }
      }
      if (kind === 'versions' && id) {
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

    const understood = /^\/api\/workflows\/([0-9a-f-]{36})\/understanding$/.exec(url.pathname);
    if (understood) {
      const found = await readUnderstanding(understood[1]!);
      return found
        ? json(res, 200, found)
        : json(res, 404, { kind: 'nothingMatching', reference: understood[1] });
    }

    const workflow = /^\/api\/workflows\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (workflow) {
      const found = await readWorkflow(workflow[1]!);
      return found
        ? json(res, 200, found)
        : json(res, 404, { kind: 'nothingMatching', reference: workflow[1] });
    }

    // What a run of this version has to be given. The screen that starts one
    // used to get this from the test cases, which meant it was reading an
    // author's example values to find out what the version declares.
    const version = /^\/api\/versions\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (version) {
      const db = await pool.connect();
      try {
        const needs = await versionNeeds(db, version[1]!);
        return needs ? json(res, 200, needs) : json(res, 404, { kind: 'noSuchVersion' });
      } finally { db.release(); }
    }

    const screen = /^\/api\/screens\/(sha256:[0-9a-f]{64})$/.exec(url.pathname);
    if (screen) {
      const served = await serveScreen(screen[1]!);
      if (!served.ok) return json(res, served.kind === 'notFound' ? 404 : 409, served);
      res.writeHead(200, { 'content-type': served.mediaType, 'cache-control': 'no-store', 'access-control-allow-origin': '*',
        // A green screen's picture is SVG drawn from the host's text: never
        // allowed to run anything, whatever the text said (Orbit 2.2).
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", 'x-content-type-options': 'nosniff' });
      return res.end(served.bytes);
    }

    const artefact = /^\/api\/artefacts\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (artefact) {
      const served = await serveArtefact(artefact[1]!);
      if (!served.ok) return json(res, served.kind === 'notFound' ? 404 : 409, served);
      res.writeHead(200, { 'content-type': served.mediaType, 'cache-control': 'no-store',
        'access-control-allow-origin': '*',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", 'x-content-type-options': 'nosniff' });
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
