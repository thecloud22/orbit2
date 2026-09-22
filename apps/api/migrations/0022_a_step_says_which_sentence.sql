-- Which confirmed sentence a drafted step carries out (Orbit 2.1, plan §4):
-- "an auditor can see which sentence became which step". Null for a step no
-- sentence asked for — signing in, often — and for every step drafted before
-- procedures were held as sentences.
ALTER TABLE workflow_step ADD COLUMN from_sentence text
  CHECK (from_sentence IS NULL OR from_sentence ~ '^([1-9][0-9]{0,3}|[A-Z]{1,2})\.[1-9][0-9]{0,4}$');
