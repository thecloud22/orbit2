-- The Human in the Loop step (Decision 14, amended 2026-09-22): a run that
-- waits for a person and then carries on.
--
-- held is what a waiting run keeps: where it resumes, the values it had read,
-- and — once somebody has done the work — what they handed back. A secret is
-- never among the values: it is typed, never read into the run's table.
ALTER TABLE run ADD COLUMN held jsonb;
ALTER TABLE run ADD CONSTRAINT run_held_only_while_it_matters CHECK (
  held IS NULL OR status IN ('waitingForAPerson', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'handedToAPerson'));

-- A sentence marked by its author as the point where the run waits for a
-- person. Only ever set by a person, and only on a sentence for a person.
ALTER TABLE sentence_label ADD COLUMN waits boolean NOT NULL DEFAULT false;
ALTER TABLE sentence_label ADD CONSTRAINT sentence_label_waits_is_for_a_person CHECK (NOT waits OR label = 'forAPerson');
