-- Recording a demonstration, asked for from the screen.
--
-- §5's other way in, and the one that is more accurate on an old application:
-- the question a model-driven session spends its whole effort on — which
-- control did that instruction mean — is answered by the click.
--
-- Queued like an authoring session, and for the same reason: the browser
-- belongs to the worker (Decision 2). The difference is whose hands are on it.
-- A model-driven walk finishes when the model says so; a recording finishes
-- when the person does, which is a fact that has to travel from the screen
-- they pressed the button on to the worker holding the browser. It travels as
-- a column, because the two are separate processes and a signal between them
-- would not survive either one restarting.
--
-- Worth being plain about the limit: the browser opens where the worker runs.
-- Today that is the same machine as the person, and when Orbit runs on a
-- server it will not be. This is honest for a local install and is not a
-- design for a remote one.
CREATE TABLE recording_session (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  application_id uuid NOT NULL REFERENCES application(id),
  start_path     text NOT NULL,

  status         text NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued', 'recording', 'brought in', 'refused')),
  -- What has been captured so far. Written as it happens so the person can see
  -- their own actions arriving as steps — a recorder that shows nothing until
  -- the end asks somebody to demonstrate a procedure on faith.
  captured       jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- When the person said they were finished.
  finish_requested_at timestamptz,

  workflow_id    uuid REFERENCES workflow(id),
  refused        jsonb,

  claimed_by     text,
  lease_expires_at timestamptz,
  queued_at      timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz
);

ALTER TABLE recording_session ADD CONSTRAINT recording_session_says_what_came_of_it CHECK (
  (status = 'brought in' AND workflow_id IS NOT NULL AND refused IS NULL)
  OR (status = 'refused' AND refused IS NOT NULL AND workflow_id IS NULL)
  OR (status IN ('queued', 'recording') AND workflow_id IS NULL AND refused IS NULL));

CREATE INDEX recording_claimable ON recording_session (status, lease_expires_at) WHERE ended_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON recording_session TO orbit_app;
