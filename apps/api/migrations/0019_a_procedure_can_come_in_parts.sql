-- A long procedure brought in a page or two at a time (Orbit 2.1, plan §13).
--
-- more_to_come is the open end: the author said this is not all of it. The
-- draft cannot be confirmed until they say it is, because the walk runs once
-- over the whole sort and would otherwise draft half a procedure.
ALTER TABLE understanding ADD COLUMN more_to_come boolean NOT NULL DEFAULT false;

-- The text stops mid-sentence: the last sentence of a part pasted up to a page
-- break. Set when the part comes in and never changed. The next part's first
-- sentence may be the rest of it; parts are the author's words exactly as
-- pasted, so the two are shown as a pair rather than joined.
ALTER TABLE procedure_sentence ADD COLUMN unterminated boolean NOT NULL DEFAULT false;
