-- §10's run controls: cancel, retry, re-run.
--
-- Cancellation is cooperative. The spec is specific: a run "stops at the next
-- safe boundary rather than mid-action". So cancelling does not stop anything
-- itself — it records that somebody asked, and the executor reads that request
-- between steps and stops there. A column rather than a signal, because the
-- worker holding the run may be on another machine, and because the request
-- has to survive the worker dying before it acts on one.
ALTER TABLE run ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz;

-- Identity is deferred (Decision 1), so who asked is not recorded. §10 wants
-- cancellation attributed and slice 1 cannot attribute it; the column is not
-- added as a nullable placeholder, because a column that is always null is a
-- promise the product has not kept. Criterion 14 already carries this.

-- Re-run starts a fresh run with the same inputs "and links it to the
-- original". The link is the point: without it a re-run is indistinguishable
-- from somebody starting the same work twice.
ALTER TABLE run ADD COLUMN IF NOT EXISTS rerun_of uuid REFERENCES run(id);
CREATE INDEX IF NOT EXISTS run_rerun_of ON run (rerun_of) WHERE rerun_of IS NOT NULL;

-- Retry re-attempts a step within the same run, so the run gains attempts
-- rather than gaining runs. How many have been made is a fact about the run.
ALTER TABLE run ADD COLUMN IF NOT EXISTS retries integer NOT NULL DEFAULT 0;
