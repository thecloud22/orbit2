/**
 * The procedure edited in place (Decision 17, procedure editor R16–R18, R22).
 *
 * An author changes their own words: a sentence is revised, added after
 * another, or withdrawn. Nothing is overwritten — each is a new row, and the
 * sentence as it arrived stays on the record. Every change sends what changed
 * back to the sort, lapses a confirmation, and leaves the sentence waiting to
 * be mapped; `mapChanges` asks Orbit to map only those.
 *
 * The same checks the chat makes are made here, before anything is kept: text
 * that reads like a secret is refused and not stored, and an address outside
 * the application is refused, because what is written here is what a model
 * will later be shown.
 */
import type { ClientBase, PoolClient } from 'pg';
import { looksLikeSecret, object, outsideAddresses, sentenceNumber, unreadAdvice, unreadColumns, z, type RuleTable } from '@orbit/contract';
import { returnToDraft } from './edit.ts';
import { insertPart } from './procedure.ts';
import { forTheWalk, sentencesWithLabels } from './understanding.ts';

export type Revised = { ok: true } | { ok: false; because: string };
export type Queued = { ok: true; id: string } | { ok: false; because: string };

const words = z.string().trim().min(1, 'Say what it should say.').max(4000);

async function openFor(db: ClientBase, workflowId: string): Promise<{ hosts: string[] } | { because: string }> {
  const { rows: [u] } = await db.query<{ status: string; hosts: string[] | null }>(
    `SELECT u.status,
            (SELECT array_agg(a->>'host') FROM jsonb_array_elements(r.addresses) a) AS hosts
       FROM understanding u
       JOIN LATERAL (SELECT addresses FROM application_revision WHERE application_id = u.application_id
                      ORDER BY revision DESC LIMIT 1) r ON true
      WHERE u.workflow_id = $1`, [workflowId]);
  if (!u) return { because: 'This draft was not brought in as a procedure, so it has no sentences to change.' };
  if (u.status === 'queued' || u.status === 'sorting') return { because: 'Orbit is sorting the last change. Make the next one when it has finished.' };
  const { rows: [mapping] } = await db.query(
    `SELECT 1 FROM authoring_session WHERE into_workflow_id = $1 AND status IN ('queued', 'running')`, [workflowId]);
  if (mapping) return { because: 'Orbit is mapping this procedure. Change it when it has finished.' };
  return { hosts: u.hosts ?? [] };
}

function refusedText(text: string, hosts: string[]): string | null {
  if (looksLikeSecret(text)) return 'That reads like a password or a key, so it was not kept. A secret is never written into a procedure.';
  const outside = outsideAddresses(text, hosts);
  if (outside.length) return `That names ${outside.join(', ')}, which this agent's application is not. Nothing was kept.`;
  return null;
}

async function sentenceId(db: ClientBase, workflowId: string, number: string): Promise<string | null> {
  const [key, n] = number.split('.') as [string, string];
  const { rows: [s] } = await db.query<{ id: string }>(
    `SELECT s.id FROM procedure_sentence s JOIN procedure_part p ON p.id = s.part_id
      WHERE p.workflow_id = $1 AND p.key = $2 AND s.n = $3`, [workflowId, key, Number(n)]);
  return s?.id ?? null;
}

/**
 * What changed goes back to the sort, and a confirmation no longer refers to
 * this draft. A sort refused for a reason outside the procedure is sent back
 * too, and tried afresh.
 */
async function changed(db: PoolClient, workflowId: string, act: string, detail: Record<string, unknown>) {
  await db.query(
    `UPDATE understanding SET status = 'queued', refused = NULL, tries = 0, sorted_at = NULL, lease_expires_at = NULL, claimed_by = NULL, queued_at = now()
      WHERE workflow_id = $1`, [workflowId]);
  await returnToDraft(db, workflowId, `The procedure was changed (${act})`);
  await db.query(`INSERT INTO audit_entry (act, object_kind, object_id, changed) VALUES ($1, 'workflow', $2, $3)`,
    [act, workflowId, JSON.stringify(detail)]);
}

export async function reviseSentence(db: PoolClient, workflowId: string, body: unknown, by: 'author' | 'chat' = 'author'): Promise<Revised> {
  const asked = object({ sentence: sentenceNumber, text: words }).safeParse(body);
  if (!asked.success) return { ok: false, because: asked.error.issues.map((i) => i.message).join(' ') };
  const open = await openFor(db, workflowId);
  if ('because' in open) return { ok: false, because: open.because };
  const refused = refusedText(asked.data.text, open.hosts);
  if (refused) return { ok: false, because: refused };
  const id = await sentenceId(db, workflowId, asked.data.sentence);
  if (!id) return { ok: false, because: `This procedure has no sentence ${asked.data.sentence}.` };
  const { rows: [now] } = await db.query<{ text: string; withdrawn: boolean }>(`SELECT text, withdrawn FROM sentence_now WHERE id = $1`, [id]);
  if (now!.text === asked.data.text && !now!.withdrawn) return { ok: false, because: 'That is what it already says.' };

  await db.query('BEGIN');
  try {
    await db.query(`INSERT INTO sentence_revision (sentence_id, text, given_by) VALUES ($1, $2, $3)`, [id, asked.data.text, by]);
    await changed(db, workflowId, 'sentence revised', { sentence: asked.data.sentence, by });
    await db.query('COMMIT');
    return { ok: true };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

export async function addSentence(db: PoolClient, workflowId: string, body: unknown): Promise<Revised & { sentences?: string[] }> {
  const asked = object({ after: sentenceNumber.nullable(), text: words }).safeParse(body);
  if (!asked.success) return { ok: false, because: asked.error.issues.map((i) => i.message).join(' ') };
  const open = await openFor(db, workflowId);
  if ('because' in open) return { ok: false, because: open.because };
  const refused = refusedText(asked.data.text, open.hosts);
  if (refused) return { ok: false, because: refused };

  await db.query('BEGIN');
  try {
    const part = await insertPart(db, workflowId, { source: 'author', body: asked.data.text }, undefined, asked.data.after);
    if (!part.ok) { await db.query('ROLLBACK'); return { ok: false, because: part.because }; }
    await changed(db, workflowId, 'sentence added', { part: part.key, after: asked.data.after });
    await db.query('COMMIT');
    return { ok: true, sentences: part.sentences };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

export async function withdrawSentence(db: PoolClient, workflowId: string, body: unknown): Promise<Revised> {
  const asked = object({ sentence: sentenceNumber }).safeParse(body);
  if (!asked.success) return { ok: false, because: 'Say which sentence to take out.' };
  const open = await openFor(db, workflowId);
  if ('because' in open) return { ok: false, because: open.because };
  const id = await sentenceId(db, workflowId, asked.data.sentence);
  if (!id) return { ok: false, because: `This procedure has no sentence ${asked.data.sentence}.` };
  const { rows: [now] } = await db.query<{ withdrawn: boolean }>(`SELECT withdrawn FROM sentence_now WHERE id = $1`, [id]);
  if (now!.withdrawn) return { ok: false, because: 'That sentence is already taken out.' };

  await db.query('BEGIN');
  try {
    await db.query(`INSERT INTO sentence_revision (sentence_id, text, withdrawn, given_by) VALUES ($1, NULL, true, 'author')`, [id]);
    await changed(db, workflowId, 'sentence withdrawn', { sentence: asked.data.sentence });
    await db.query('COMMIT');
    return { ok: true };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

/**
 * The sentences changed since Orbit last mapped this draft (R18): revised,
 * added, withdrawn, relabelled, or with an answer the next mapping should
 * hear. Only those that bear on the draft — work, a rule, a wait, or one that
 * already has steps. Derived every time; nothing stores it.
 */
export async function pendingOf(db: ClientBase, workflowId: string): Promise<string[]> {
  const { rows: [last] } = await db.query<{ at: string | null }>(
    `SELECT max(mapped_at) AS at FROM mapping WHERE workflow_id = $1`, [workflowId]);
  if (!last?.at) return [];
  const { rows } = await db.query<{ number: string; label: string | null; waits: boolean | null; withdrawn: boolean; stepped: boolean }>(
    `SELECT p.key || '.' || s.n AS number, l.label, l.waits, s.withdrawn,
            EXISTS (SELECT 1 FROM workflow_step w WHERE w.workflow_id = p.workflow_id AND w.from_sentence = p.key || '.' || s.n) AS stepped
       FROM sentence_now s JOIN procedure_part p ON p.id = s.part_id
       LEFT JOIN LATERAL (SELECT label, waits, created_at FROM sentence_label WHERE sentence_id = s.id ORDER BY seq DESC LIMIT 1) l ON true
      WHERE p.workflow_id = $1
        AND (s.revised_at > $2 OR p.added_at > $2 OR l.created_at > $2
             OR EXISTS (SELECT 1 FROM workflow_note n WHERE n.workflow_id = p.workflow_id AND n.sentence = p.key || '.' || s.n
                         AND n.resolved_at > $2 AND n.action IN ('pickElement', 'giveExample', 'mapAgain')))
      ORDER BY p.added_at, p.key, s.n`, [workflowId, last.at]);
  return rows.filter((r) => r.stepped || (!r.withdrawn && (r.label === 'task' || r.label === 'rule' || (r.label === 'forAPerson' && r.waits))))
    .map((r) => r.number);
}

/** Orbit maps what changed, and only that: queued like any walk, scoped to the pending sentences (R18). */
export async function mapChanges(db: PoolClient, workflowId: string): Promise<Queued> {
  const { rows: [u] } = await db.query<{ confirmed_at: string | null; status: string; application_id: string;
    start_path: string; inputs: Record<string, string>; name: string }>(
    `SELECT u.confirmed_at, u.status, u.application_id, u.start_path, u.inputs, w.name
       FROM understanding u JOIN workflow w ON w.id = u.workflow_id WHERE u.workflow_id = $1`, [workflowId]);
  if (!u) return { ok: false, because: 'This draft was not brought in as a procedure.' };
  if (!u.confirmed_at) return { ok: false, because: 'Nothing is drafted yet. Confirm the sort and Orbit drafts the whole procedure.' };
  if (u.status !== 'sorted') return { ok: false, because: 'Orbit is still sorting what changed. Map the changes when it has finished.' };
  const { rows: [running] } = await db.query(
    `SELECT 1 FROM authoring_session WHERE into_workflow_id = $1 AND status IN ('queued', 'running')`, [workflowId]);
  if (running) return { ok: false, because: 'Orbit is already mapping this procedure.' };

  const pending = await pendingOf(db, workflowId);
  if (!pending.length) return { ok: false, because: 'Nothing has changed since Orbit last mapped this procedure.' };
  const sentences = await sentencesWithLabels(db, workflowId);
  const unplaced = sentences.filter((s) => !s.withdrawn && !s.label).map((s) => s.number);
  if (unplaced.length) return { ok: false, because: `${unplaced.join(', ')} ${unplaced.length === 1 ? 'has' : 'have'} no label yet.` };
  const { rows: [latest] } = await db.query<{ tables: RuleTable[] | null }>(
    `SELECT tables FROM rule_tables WHERE workflow_id = $1 ORDER BY seq DESC LIMIT 1`, [workflowId]);
  const unread = unreadColumns(latest?.tables ?? []);
  if (unread.length) return { ok: false, because: unreadAdvice(unread) };

  // The author's answers to questions about these sentences, handed to the
  // walk as their word. A name the page offered, or words: never a binding.
  const { rows: hints } = await db.query<{ sentence: string; answer: string }>(
    `SELECT n.sentence, n.answer FROM workflow_note n
      WHERE n.workflow_id = $1 AND n.sentence = ANY($2) AND n.resolved_at IS NOT NULL AND n.answer IS NOT NULL
        AND n.action IN ('pickElement', 'mapAgain')
        AND n.resolved_at > (SELECT max(mapped_at) FROM mapping WHERE workflow_id = $1)`, [workflowId, pending]);

  await db.query('BEGIN');
  try {
    const { rows: [session] } = await db.query<{ id: string }>(
      `INSERT INTO authoring_session (name, procedure, application_id, start_path, inputs, into_workflow_id, scope, hints)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [u.name, forTheWalk(sentences), u.application_id, u.start_path, JSON.stringify(u.inputs), workflowId,
       JSON.stringify(pending), JSON.stringify(hints)]);
    await returnToDraft(db, workflowId, 'Orbit was asked to map what changed');
    await db.query(`INSERT INTO audit_entry (act, object_kind, object_id, changed) VALUES ('changes mapped', 'workflow', $1, $2)`,
      [workflowId, JSON.stringify({ sentences: pending, hints: hints.length })]);
    await db.query('COMMIT');
    return { ok: true, id: session!.id };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}
