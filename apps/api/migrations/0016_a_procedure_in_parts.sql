-- A procedure held as parts, each split into numbered sentences, and what each
-- sentence is for (Orbit 2.1).
--
-- Written once. A sentence is the author's words as they arrived, and a label
-- is what somebody said about it at a moment; changing either after the fact
-- would make the draft say something nobody wrote. A relabel is a new row, and
-- the current label is the latest.
--
-- Not orbit_make_append_only: that trigger also refuses DELETE, and a draft
-- that is discarded takes its procedure with it (edit.ts, discardDraft). So
-- UPDATE is refused by privilege and by trigger, and the application may
-- delete a part only, which carries its sentences and labels away with it.
-- What must outlive a draft is copied into the version when it is published.

CREATE TABLE procedure_part (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflow(id) ON DELETE CASCADE,
  -- 1, 2… for the document; A, B… for the author's own words.
  key         text NOT NULL CHECK (key ~ '^([1-9][0-9]{0,3}|[A-Z]{1,2})$'),
  source      text NOT NULL CHECK (source IN ('pasted', 'pdf', 'author')),
  -- Verbatim. Every sentence below is a span of this.
  body        text NOT NULL,
  added_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, key),
  -- Numbers are the document's and letters the author's; the key says which.
  CHECK ((source = 'author') = (key ~ '^[A-Z]'))
);

CREATE TABLE procedure_sentence (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id   uuid NOT NULL REFERENCES procedure_part(id) ON DELETE CASCADE,
  n         integer NOT NULL CHECK (n > 0),
  text      text NOT NULL CHECK (text <> ''),
  kind      text NOT NULL CHECK (kind IN ('prose', 'heading', 'item', 'leadIn')),
  -- Where it sits in the part's body, so it can be shown in place.
  start_at  integer NOT NULL CHECK (start_at >= 0),
  end_at    integer NOT NULL CHECK (end_at > start_at),
  -- Filled for a PDF, whose pages are the reader's reference.
  page      integer CHECK (page > 0),
  UNIQUE (part_id, n)
);

CREATE TABLE sentence_label (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The order labels were given in. Not created_at: now() is fixed for a
  -- whole transaction, so two labels written together would tie.
  seq         bigserial NOT NULL UNIQUE,
  sentence_id uuid NOT NULL REFERENCES procedure_sentence(id) ON DELETE CASCADE,
  label       text NOT NULL CHECK (label IN ('task', 'rule', 'forAPerson', 'background', 'wontDo')),
  reason      text NOT NULL CHECK (reason <> ''),
  basis       text NOT NULL CHECK (basis IN ('stated', 'inferred')),
  -- What kind of source gave it. Not who: there is no actor to name until
  -- identity is built (Decision 1), and this does not stand in for one.
  given_by    text NOT NULL CHECK (given_by IN ('model', 'author')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sentence_label_latest ON sentence_label (sentence_id, seq DESC);

CREATE TRIGGER refuse_edit BEFORE UPDATE ON procedure_part
  FOR EACH ROW EXECUTE FUNCTION orbit_refuse_mutation();
CREATE TRIGGER refuse_edit BEFORE UPDATE ON procedure_sentence
  FOR EACH ROW EXECUTE FUNCTION orbit_refuse_mutation();
CREATE TRIGGER refuse_edit BEFORE UPDATE ON sentence_label
  FOR EACH ROW EXECUTE FUNCTION orbit_refuse_mutation();

GRANT SELECT, INSERT, DELETE ON procedure_part TO orbit_app;
GRANT SELECT, INSERT ON procedure_sentence, sentence_label TO orbit_app;
GRANT USAGE, SELECT ON SEQUENCE sentence_label_seq_seq TO orbit_app;
