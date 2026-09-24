-- Orbit 2.6: a new agent starts on the editor, and a procedure pasted or
-- read from a PDF is drafted straight through (docs/plans/2026-09-23-start-on-the-editor.md).

-- 1. Orbit confirms the sort itself and drafts, for a procedure that arrived
--    whole (E5). Written by hand, it waits for the author's "Draft it".
ALTER TABLE understanding ADD COLUMN draft_when_sorted boolean NOT NULL DEFAULT false;

-- 2. Why Orbit did not draft it, in words (E6): the author said more is to
--    come, or nothing in it is Orbit's to do. Cleared when it drafts.
ALTER TABLE understanding ADD COLUMN not_drafted text;

-- 3. A sentence for a person, asked after drafting whether the run waits
--    there (E7). Answered by a relabel, which Map changes then maps.
ALTER TABLE workflow_note DROP CONSTRAINT IF EXISTS workflow_note_action_check;
ALTER TABLE workflow_note ADD CONSTRAINT workflow_note_action_check
  CHECK (action IS NULL OR action IN ('pickElement', 'useInput', 'giveExample', 'mapAgain', 'waitHere'));
