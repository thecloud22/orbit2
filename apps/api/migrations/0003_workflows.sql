-- Three separate things, never collapsed: the business procedure, the
-- executable artefact, and the record of a run.
--
-- `workflow` is the draft and is meant to change. `workflow_version` is minted
-- by publication and is a fact. Editing a workflow after publishing changes
-- nothing about what is live until it is published again (§4).

CREATE TABLE workflow (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  describe     text,
  -- the author's own words, frozen at confirmation (§6)
  procedure    text,
  confirmed_at timestamptz,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Steps of the draft. They carry stable ids so that references survive the
-- reordering §6 permits; `position` is only what the editor shows.
CREATE TABLE workflow_step (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  uuid NOT NULL REFERENCES workflow(id) ON DELETE CASCADE,
  position     integer NOT NULL,
  kind         text NOT NULL,
  -- the step's declared fields, validated against @orbit/contract before it is stored
  declares     jsonb NOT NULL,
  -- the graph, not just an order: a branch names its two targets by step id, so
  -- "produced on every path that reaches this step" is a query rather than a guess
  if_true      uuid REFERENCES workflow_step(id),
  if_false     uuid REFERENCES workflow_step(id),
  next_step    uuid REFERENCES workflow_step(id),
  complete     boolean NOT NULL DEFAULT false,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, position) DEFERRABLE INITIALLY DEFERRED
);

-- Questions, assumptions, exceptions and risks raised against the step they
-- concern. Any outstanding one blocks confirmation (§4, acceptance criterion 3).
CREATE TABLE workflow_note (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflow(id) ON DELETE CASCADE,
  step_id     uuid REFERENCES workflow_step(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('question', 'assumption', 'exception', 'risk')),
  body        text NOT NULL,
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Publication mints one of these. It is never an edit of an existing one (§4).
CREATE TABLE workflow_version (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     uuid NOT NULL REFERENCES workflow(id),
  version         integer NOT NULL,
  -- the executable artefact, serialised canonically, and its digest.
  -- the digest covers the steps, the declared values, the outcomes AND the
  -- copied application revisions, so "what it could not have done" is inside
  -- the thing that was approved (Decision 5).
  body            jsonb NOT NULL,
  digest          text NOT NULL,
  -- every conclusion a run of this version may reach. A run cannot invent one.
  outcomes        jsonb NOT NULL,
  declared_inputs jsonb NOT NULL,
  -- copies, not references: an administrator's later edit cannot widen this
  applications    jsonb NOT NULL,
  -- §7: declared on the version, approved separately, visible on every run
  may_change_records boolean NOT NULL DEFAULT false,
  published_by    uuid,                    -- null until identity exists (Decision 1)
  published_at    timestamptz NOT NULL DEFAULT now(),
  activated_at    timestamptz,
  paused_at       timestamptz,
  UNIQUE (workflow_id, version)
);

SELECT orbit_make_append_only('workflow_version');
GRANT SELECT, INSERT, UPDATE, DELETE ON workflow, workflow_step, workflow_note TO orbit_app;
