import { createServer } from 'node:http';
import { serveArtefact } from './artefacts.ts';
import { listRuns, readRun, readRunSteps } from './runs.ts';

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
