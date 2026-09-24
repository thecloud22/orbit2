-- Orbit 2.5: a value named in the author's words (Decision 20). A phrase of
-- one sentence, and the value it means: "the credit score" in 1.10 is
-- creditScore. Kept beside the sentence, never written into it, so the words
-- stay the author's. A null value says the phrase is not a value, so Orbit's
-- guess for it is not shown again. Append-only: the current link for a
-- phrase is the latest, and one whose phrase is no longer in the sentence is
-- no longer current. Orbit's own guesses are derived, never stored.
CREATE TABLE value_link (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq         bigserial NOT NULL UNIQUE,
  sentence_id uuid NOT NULL REFERENCES procedure_sentence(id) ON DELETE CASCADE,
  phrase      text NOT NULL CHECK (phrase <> '' AND length(phrase) <= 200),
  value       text CHECK (value IS NULL OR value ~ '^[a-z][a-zA-Z0-9]*$'),
  given_by    text NOT NULL CHECK (given_by IN ('author')),
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX value_link_latest ON value_link (sentence_id, phrase, seq DESC);
CREATE TRIGGER refuse_edit BEFORE UPDATE ON value_link
  FOR EACH ROW EXECUTE FUNCTION orbit_refuse_mutation();
GRANT SELECT, INSERT ON value_link TO orbit_app;
GRANT USAGE, SELECT ON SEQUENCE value_link_seq_seq TO orbit_app;
