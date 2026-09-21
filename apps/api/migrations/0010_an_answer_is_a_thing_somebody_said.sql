-- A question is resolved by answering it, not by citing it.
--
-- `workflow_note` recorded that a question stopped being outstanding and never
-- what the answer was. Confirmation accepted a list of note ids, so naming a
-- question marked it answered — which satisfies criterion 3 to the letter
-- ("cannot be confirmed... and the blocker is named") and defeats it entirely.
--
-- It matters more here than it would elsewhere. Identity is deferred by
-- Decision 1, so confirmation is the only human act anywhere on the record. If
-- the act keeps nothing of what the person decided, the provenance trail for
-- the whole workflow is one boolean saying somebody clicked.
--
-- Found by doing it: a published version whose conclusion was named "unnamed",
-- because the model asked what the ending should be called and the question
-- was closed by id.
ALTER TABLE workflow_note ADD COLUMN IF NOT EXISTS answer text;

-- Notes already marked resolved carry no answer, because there was nowhere to
-- put one. They are returned to outstanding rather than backfilled: inventing
-- an answer to satisfy the constraint would be the same move as a placeholder
-- actor — it makes the migration pass and the record false, and the record is
-- the whole point. Whoever resolved them can say what they decided.
UPDATE workflow_note SET resolved_at = NULL WHERE resolved_at IS NOT NULL AND answer IS NULL;

-- And the confirmations that rested on them are void. A workflow was confirmed
-- because its questions were "answered"; if that answering kept nothing, the
-- attestation was made over an open question and cannot stand. Published
-- versions are untouched — a version is a fact, and this says nothing about
-- what was published, only that the workflow must be attested to again.
UPDATE workflow SET confirmed_at = NULL
 WHERE confirmed_at IS NOT NULL
   AND id IN (SELECT workflow_id FROM workflow_note WHERE resolved_at IS NULL);

-- Resolved and answered move together. A note cannot be one without the other,
-- and the database is where that holds rather than a rule somebody remembers.
ALTER TABLE workflow_note ADD CONSTRAINT workflow_note_answered_when_resolved
  CHECK ((resolved_at IS NULL AND answer IS NULL) OR (resolved_at IS NOT NULL AND answer IS NOT NULL));
