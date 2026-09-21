-- Bringing a procedure in, from the screen rather than a terminal.
--
-- The interface had the form and a disabled button reading "authoring runs
-- from the worker for now", which is true and is not a product. The reason it
-- runs there is Decision 2: the browser lives in the worker, and the API is
-- not going to grow a second one.
--
-- So the API queues and the worker claims, exactly as a run does. The same
-- lease, so an authoring session whose worker dies is found by the same sweep
-- rather than sitting there looking busy forever.
CREATE TABLE authoring_session (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  -- Kept verbatim. It is what the author wrote, and every question Orbit
  -- raises is a question about these words.
  procedure      text NOT NULL,
  application_id uuid NOT NULL REFERENCES application(id),
  start_path     text NOT NULL,
  -- The example values the walk is done with. Not part of the workflow: what
  -- the procedure declares is the input's name.
  inputs         jsonb NOT NULL DEFAULT '{}'::jsonb,

  status         text NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued', 'running', 'brought in', 'refused')),
  -- What came of it: the draft, or why there is none.
  workflow_id    uuid REFERENCES workflow(id),
  refused        jsonb,

  claimed_by     text,
  lease_expires_at timestamptz,
  queued_at      timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz
);

-- A finished session names its outcome, and an unfinished one does not. The
-- same shape as a run: the record cannot say "brought in" with nothing to show.
ALTER TABLE authoring_session ADD CONSTRAINT authoring_session_says_what_came_of_it CHECK (
  (status = 'brought in' AND workflow_id IS NOT NULL AND refused IS NULL)
  OR (status = 'refused' AND refused IS NOT NULL AND workflow_id IS NULL)
  OR (status IN ('queued', 'running') AND workflow_id IS NULL AND refused IS NULL));

CREATE INDEX authoring_claimable ON authoring_session (status, lease_expires_at) WHERE ended_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON authoring_session TO orbit_app;
