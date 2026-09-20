ALTER TABLE lab_gc ADD COLUMN kind TEXT NOT NULL DEFAULT 'prefix' CHECK(kind IN ('prefix','object','snapshot'));
ALTER TABLE lab_gc ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lab_gc ADD COLUMN finalize_after INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lab_gc ADD COLUMN phase INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lab_gc ADD COLUMN failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lab_gc ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE lab_gc ADD COLUMN lease_token TEXT;
ALTER TABLE lab_gc ADD COLUMN lease_until INTEGER NOT NULL DEFAULT 0;
-- Existing records get one due pass, then follow the remaining protection window.
UPDATE lab_gc SET next_attempt_at=created_at, finalize_after=created_at+86400000,
  kind=CASE WHEN prefix LIKE 'media\_%' ESCAPE '\' AND instr(prefix,'/')=0 THEN 'object'
    WHEN prefix GLOB 'lab-publish-requests/*/' THEN 'snapshot' ELSE 'prefix' END;
CREATE INDEX lab_gc_due ON lab_gc(next_attempt_at,lease_until);
