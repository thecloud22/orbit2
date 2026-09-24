/**
 * The values named in a draft's words (Decision 20), as they hold now: the
 * author's links whose phrase is still in its sentence, and Orbit's guesses
 * where the author has said nothing. Read by the editor, and by the worker,
 * which is held to the author's links alone.
 */
import type { ClientBase } from 'pg';
import { linksOf, type RuleTable, type ValueLink } from '@orbit/contract';

/** Every link the author gave, oldest first: the latest for a phrase is the one that holds. */
export async function authoredLinks(db: ClientBase, workflowId: string) {
  const { rows } = await db.query<{ sentence: string; phrase: string; value: string | null }>(
    `SELECT p.key || '.' || s.n AS sentence, v.phrase, v.value
       FROM value_link v JOIN procedure_sentence s ON s.id = v.sentence_id JOIN procedure_part p ON p.id = s.part_id
      WHERE p.workflow_id = $1 ORDER BY v.seq`, [workflowId]);
  return rows;
}

/** A draft's links, for sentences as they now read and the steps and tables it has. */
export async function draftLinks(db: ClientBase, workflowId: string, opts: {
  sentences: ReadonlyArray<{ number: string; text: string; label: string | null; withdrawn?: boolean }>;
  tables: readonly RuleTable[];
  steps: ReadonlyArray<{ kind: string; declares: Record<string, unknown>; from_sentence: string | null }>;
}): Promise<ValueLink[]> {
  const reads = opts.steps.flatMap((s) => {
    const produces = s.kind === 'read' ? s.declares['produces'] as { name?: string; label?: string } | undefined : undefined;
    return produces?.name && produces.label ? [{ sentence: s.from_sentence, label: produces.label, name: produces.name }] : [];
  });
  return linksOf({ sentences: opts.sentences, authored: await authoredLinks(db, workflowId), tables: opts.tables, reads });
}
