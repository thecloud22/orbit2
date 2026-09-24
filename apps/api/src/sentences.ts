/**
 * A draft's sentences as they now read, each with its label (Orbit 2.1,
 * Decision 17), and what of them the walk is given. Shared by the API and the
 * worker, which confirms a sort itself when a procedure arrives whole (2.6).
 */
import { looksLikeInstructions, type SentenceLabel } from '@orbit/contract';
import type { ClientBase } from 'pg';
import { inDocumentOrder } from './procedure.ts';

export type SentenceView = {
  number: string; part: string; n: number; text: string; kind: string; unterminated: boolean; page: number | null;
  label: SentenceLabel | null; reason: string | null; basis: string | null; givenBy: string | null;
  /** Marked by the author: the run waits here for this person (Human in the Loop). */
  waits: boolean;
  /** Why this sentence reads like instructions to a machine, if it does. */
  suspicious?: string | null;
  /** What it arrived as, once the author has changed it (Decision 17). */
  was?: string | null;
  withdrawn?: boolean;
  revisedAt?: string | null;
  /** Whether the label was given to the words as they now stand. */
  labelCurrent?: boolean;
};

export async function sentencesWithLabels(db: ClientBase, workflowId: string): Promise<SentenceView[]> {
  // As each sentence now reads (Decision 17): its latest revision, or as it
  // arrived, with what it arrived as once it has changed.
  const { rows } = await db.query<SentenceView & { after: string | null }>(
    `SELECT p.key || '.' || s.n AS number, p.key AS part, s.n, s.text, s.kind, s.unterminated, s.page,
            l.label, l.reason, l.basis, l.given_by AS "givenBy", coalesce(l.waits, false) AS waits,
            s.arrived_as AS was, s.withdrawn, s.revised_at AS "revisedAt",
            (SELECT p2.key || '.' || s2.n FROM procedure_sentence s2 JOIN procedure_part p2 ON p2.id = s2.part_id
              WHERE s2.id = p.after_sentence_id) AS after,
            -- A label from before the sentence last changed describes words it no longer has.
            -- A withdrawn sentence has no words to label, and the sort never looks at it again.
            (s.withdrawn OR (l.created_at IS NOT NULL AND (s.revised_at IS NULL OR l.created_at > s.revised_at))) AS "labelCurrent"
       FROM sentence_now s
       JOIN procedure_part p ON p.id = s.part_id
       LEFT JOIN LATERAL (
         SELECT label, reason, basis, given_by, waits, created_at FROM sentence_label
          WHERE sentence_id = s.id ORDER BY seq DESC LIMIT 1) l ON true
      WHERE p.workflow_id = $1
      ORDER BY p.added_at, p.key, s.n`, [workflowId]);
  // Flagged, never altered: the words stay the author's, and a person decides.
  return inDocumentOrder(rows).map(({ after: _, ...r }) => ({ ...r, suspicious: looksLikeInstructions(r.text) }));
}


/**
 * What the walk is given: the sentences Orbit is to do, and the ones where the
 * run waits for a person, in the author's order and words.
 */
export function forTheWalk(sentences: readonly SentenceView[]): string {
  return sentences.filter(forOrbitOrAWait).map((s) => s.text).join('\n');
}
// Never a sentence that reads like instructions to a machine, whatever it was
// labelled: the walk could otherwise cite it as the line that asked for a press.
const forOrbitOrAWait = (s: SentenceView) => !s.suspicious && !s.withdrawn
  && (s.label === 'task' || s.label === 'rule' || (s.label === 'forAPerson' && s.waits));
