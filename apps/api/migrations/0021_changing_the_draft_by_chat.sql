-- Changing a draft by chat (Orbit 2.1, plan §12). Every message, answer,
-- refusal and applied edit, in order, kept with the draft and never edited.
--
-- An author's message waits here for the worker, which is the only process
-- that talks to a model. A message blocked before it could be sent — one that
-- looked like a secret — keeps no text at all: only that it was blocked.
CREATE TABLE chat_message (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq         bigserial NOT NULL UNIQUE,
  workflow_id uuid NOT NULL REFERENCES workflow(id) ON DELETE CASCADE,
  said_by     text NOT NULL CHECK (said_by IN ('author', 'orbit')),
  text        text,
  -- For an author's message: waiting for the worker, answered, or blocked
  -- before it reached a model. For Orbit's: what it did.
  state       text NOT NULL CHECK (state IN ('waiting', 'answered', 'blocked', 'applied', 'explained', 'refused', 'offered')),
  -- What was applied or offered: the part added, the sentence relabelled.
  outcome     jsonb,
  -- The author's message an answer answers.
  answers     uuid REFERENCES chat_message(id) ON DELETE CASCADE,
  claimed_by  text,
  lease_expires_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (said_by = 'orbit' OR state IN ('waiting', 'answered', 'blocked')),
  CHECK (state <> 'blocked' OR text IS NULL)
);
CREATE INDEX chat_waiting ON chat_message (state, lease_expires_at) WHERE state = 'waiting';
CREATE INDEX chat_by_draft ON chat_message (workflow_id, seq);
-- Only the waiting state moves: waiting becomes answered, and the lease. The
-- text a person wrote, and everything Orbit said, is not changed.
CREATE OR REPLACE FUNCTION orbit_chat_only_moves_on() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.text IS DISTINCT FROM OLD.text OR NEW.said_by <> OLD.said_by OR NEW.workflow_id <> OLD.workflow_id
     OR OLD.state <> 'waiting' THEN
    RAISE EXCEPTION 'orbit: a chat message is not edited' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER chat_only_moves_on BEFORE UPDATE ON chat_message FOR EACH ROW EXECUTE FUNCTION orbit_chat_only_moves_on();
GRANT SELECT, INSERT, UPDATE ON chat_message TO orbit_app;
GRANT USAGE, SELECT ON SEQUENCE chat_message_seq_seq TO orbit_app;
