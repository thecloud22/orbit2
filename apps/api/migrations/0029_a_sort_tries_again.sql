-- A sort that failed for a reason outside the procedure — the model could not
-- be reached — is tried again, up to three times, before it is refused with
-- the reason. A refusal about the procedure itself is never retried.
ALTER TABLE understanding ADD COLUMN tries integer NOT NULL DEFAULT 0;
