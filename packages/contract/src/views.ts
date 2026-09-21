/**
 * What the API hands the interface.
 *
 * Declared here rather than in either of them, because Decision 9's argument
 * was that a closed set declared twice can disagree with itself — and §4 says
 * a status shown in two places must be the same status. One declaration, both
 * sides import it.
 *
 * These are types rather than Zod schemas for now. The response crosses a
 * network boundary and Decision 9 asks for validation at every boundary, so
 * they should grow schemas; that is a follow-up, recorded rather than
 * forgotten.
 */
import type { Step } from './steps.ts';

export type RunStatus = 'queued' | 'running' | 'waitingForAPerson' | 'succeeded' | 'handedToAPerson' | 'failed' | 'cancelled';

export interface RunHeader {
  id: string;
  reference: string;
  /** Never merged with `outcome`. §10: two facts, and only this one is coloured. */
  status: RunStatus;
  outcome: string | null;
  is_test: boolean;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown> | null;
  error: { kind: string; step: number; describe: string } | null;
  /** Null until identity exists. Shown as absent, never as a placeholder name. */
  started_by: string | null;
  /** The run this one was started from, if it was. §10 asks for the link, and
   *  without it two attempts at the same work read as two pieces of work. */
  rerun_of_reference: string | null;
  /** How many times a step in THIS run was re-attempted. Kept apart from the
   *  re-run link because they answer different questions: one is how hard this
   *  run tried, the other is how many times the work was asked for. */
  retries: number;
  queued_at: string;
  started_at: string | null;
  ended_at: string | null;
  version: number;
  digest: string;
  outcomes: Array<{ name: string; label: string }>;
  declared_inputs: Array<{ name: string; label: string; type: string; required: boolean }>;
  applications: Array<{ name: string; revision: number }>;
  may_change_records: boolean;
  published_at: string;
  workflow_name: string;
  workflow_id: string;
}

export interface StepAttemptView {
  id: string;
  /** Safe because a version is immutable: within one version a position never moves. */
  step_position: number;
  step_kind: Step['kind'];
  attempt: number;
  pass: number | null;
  outcome: string | null;
  started_at: string;
  ended_at: string | null;
}

export interface RunEventView {
  id: string;
  attempt_id: string | null;
  kind: string;
  detail: Record<string, unknown>;
  at: string;
}

/** A withheld artefact carries a reason and no digest — a record, not an absence. */
export interface ArtefactView {
  id: string;
  attempt_id: string | null;
  kind: string;
  media_type: string | null;
  bytes: number | null;
  digest: string | null;
  withheld: boolean;
  withheld_why: string | null;
}

export interface RunView {
  run: RunHeader;
  steps: Array<Pick<Step, 'kind' | 'summary'>>;
  attempts: StepAttemptView[];
  events: RunEventView[];
  stepArtefacts: ArtefactView[];
  runArtefacts: ArtefactView[];
}
