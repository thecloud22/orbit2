-- Orbit 2.1: a procedure is understood before anything is drafted from it.
--
-- Bringing a procedure in now makes the draft at once, holding the text as
-- numbered sentences (0016). A worker sorts them — task, rule, for a person,
-- background, won't do — and a person confirms the sort. Only then does the
-- walk run, over the sentences Orbit does, writing its steps into this same
-- draft rather than a new one. This row is where that stands.
CREATE TABLE understanding (
  workflow_id      uuid PRIMARY KEY REFERENCES workflow(id) ON DELETE CASCADE,
  -- What the walk will need once the sort is confirmed. Kept here rather than
  -- on the workflow: the example values are not part of the agent.
  application_id   uuid NOT NULL REFERENCES application(id),
  start_path       text NOT NULL,
  inputs           jsonb NOT NULL DEFAULT '{}'::jsonb,

  status           text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'sorting', 'sorted', 'refused')),
  refused          jsonb,
  claimed_by       text,
  lease_expires_at timestamptz,
  queued_at        timestamptz NOT NULL DEFAULT now(),
  sorted_at        timestamptz,
  -- A person's act. Nothing is drafted before it.
  confirmed_at     timestamptz,
  -- The walk the confirmation started.
  session_id       uuid REFERENCES authoring_session(id),

  CHECK ((status = 'refused') = (refused IS NOT NULL)),
  CHECK (confirmed_at IS NULL OR status = 'sorted'),
  CHECK ((session_id IS NULL) = (confirmed_at IS NULL))
);
CREATE INDEX understanding_claimable ON understanding (status, lease_expires_at) WHERE status = 'queued';
GRANT SELECT, INSERT, UPDATE ON understanding TO orbit_app;

-- A walk that drafts into a workflow that already exists, instead of making one.
ALTER TABLE authoring_session ADD COLUMN into_workflow_id uuid REFERENCES workflow(id) ON DELETE SET NULL;
