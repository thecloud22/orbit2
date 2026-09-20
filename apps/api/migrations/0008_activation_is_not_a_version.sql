-- Activation is not a property of a version.
--
-- `workflow_version` is append-only by decision, so `activated_at` and
-- `paused_at` were columns nothing could ever write — a lie in the schema that
-- only showed up when something tried. The trigger refused it, which is the
-- arrangement working.
--
-- Which version is live is a *changing* thing, and the changing thing in this
-- product is the workflow. A version stays a fact; the workflow points at the
-- one that is live, and every change to that pointer is an audited act. §4's
-- statuses follow from it — Active when it points somewhere, Paused when
-- paused_at is set, and neither is stored as a status because §4 says a status
-- is derived from facts the system already holds.

ALTER TABLE workflow_version DROP COLUMN IF EXISTS activated_at;
ALTER TABLE workflow_version DROP COLUMN IF EXISTS paused_at;

ALTER TABLE workflow ADD COLUMN IF NOT EXISTS live_version_id uuid REFERENCES workflow_version(id);
ALTER TABLE workflow ADD COLUMN IF NOT EXISTS paused_at timestamptz;

-- A run may only start from the version an operator was offered. §4 refuses a
-- run of a version that is not active, and this is where "active" now lives.
CREATE INDEX IF NOT EXISTS workflow_live ON workflow (live_version_id) WHERE live_version_id IS NOT NULL;
