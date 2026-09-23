-- Decision 17: the procedure is edited in place.
--
-- A sentence is never overwritten. An edit is a revision: the sentence as it
-- arrived stays in procedure_sentence, every revision stays here, and the
-- current text is the latest. A sentence taken out is a revision that
-- withdraws it, not a delete. Orbit never writes one: a revision is always the
-- author's, typed or asked for in the chat.
CREATE TABLE sentence_revision (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq         bigserial NOT NULL UNIQUE,
  sentence_id uuid NOT NULL REFERENCES procedure_sentence(id) ON DELETE CASCADE,
  text        text CHECK (text IS NULL OR text <> ''),
  withdrawn   boolean NOT NULL DEFAULT false,
  given_by    text NOT NULL CHECK (given_by IN ('author', 'chat')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (withdrawn OR text IS NOT NULL)
);
CREATE INDEX sentence_revision_latest ON sentence_revision (sentence_id, seq DESC);
CREATE TRIGGER refuse_edit BEFORE UPDATE ON sentence_revision
  FOR EACH ROW EXECUTE FUNCTION orbit_refuse_mutation();
GRANT SELECT, INSERT ON sentence_revision TO orbit_app;
GRANT USAGE, SELECT ON SEQUENCE sentence_revision_seq_seq TO orbit_app;

-- A sentence as it now reads: its latest revision, or as it arrived.
CREATE VIEW sentence_now AS
SELECT s.id, s.part_id, s.n, s.kind, s.start_at, s.end_at, s.page, s.unterminated,
       coalesce(r.text, s.text) AS text,
       coalesce(r.withdrawn, false) AS withdrawn,
       r.created_at AS revised_at,
       CASE WHEN r.id IS NULL THEN NULL ELSE s.text END AS arrived_as
  FROM procedure_sentence s
  LEFT JOIN LATERAL (SELECT id, text, withdrawn, created_at FROM sentence_revision
                      WHERE sentence_id = s.id ORDER BY seq DESC LIMIT 1) r ON true;
GRANT SELECT ON sentence_now TO orbit_app;

-- Where a sentence the author adds sits: after this one. Null for the document's
-- own parts, and for a part added at the end.
ALTER TABLE procedure_part ADD COLUMN after_sentence_id uuid REFERENCES procedure_sentence(id) ON DELETE SET NULL;

-- Sorting again after drafting: a revision, an added sentence or a relabel sends
-- the sort back to the worker for what changed, and the draft stays drafted.
ALTER TABLE understanding DROP CONSTRAINT understanding_check1;

-- Each time Orbit mapped a draft's sentences into steps: the whole walk, or the
-- sentences that had changed. What has changed since is derived from this, the
-- revisions, the labels and the answered questions, never stored (R18).
CREATE TABLE mapping (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflow(id) ON DELETE CASCADE,
  session_id  uuid REFERENCES authoring_session(id) ON DELETE SET NULL,
  -- The sentences this mapping covered; null when it was the whole procedure.
  sentences   jsonb,
  mapped_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mapping_latest ON mapping (workflow_id, mapped_at DESC);
GRANT SELECT, INSERT, DELETE ON mapping TO orbit_app;

-- A mapping session, as distinct from the first walk: which sentences changed,
-- and the author's answers to hand the walk as their word.
ALTER TABLE authoring_session ADD COLUMN scope jsonb;
ALTER TABLE authoring_session ADD COLUMN hints jsonb;

-- Drafts walked before this: their walk is their first mapping.
INSERT INTO mapping (workflow_id, session_id, mapped_at)
SELECT u.workflow_id, u.session_id, coalesce(s.ended_at, u.confirmed_at)
  FROM understanding u JOIN authoring_session s ON s.id = u.session_id
 WHERE s.status = 'brought in';
