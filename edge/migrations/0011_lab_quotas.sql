-- Daily accounting survives task and experiment deletion. Beijing is UTC+8.
CREATE TABLE lab_daily_usage (
  owner_id TEXT NOT NULL REFERENCES users(id),
  day TEXT NOT NULL,
  task_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(owner_id, day)
);
INSERT INTO lab_daily_usage(owner_id,day,task_count)
SELECT owner_id,date(created_at/1000,'unixepoch','+8 hours'),COUNT(*)
FROM lab_tasks GROUP BY owner_id,date(created_at/1000,'unixepoch','+8 hours');
CREATE INDEX lab_experiment_owner ON lab_experiments(owner_id,deleted_at);

CREATE TRIGGER lab_image_quota BEFORE INSERT ON lab_experiments
WHEN NEW.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM admins WHERE user_id=NEW.owner_id AND role='admin')
AND (SELECT COUNT(*) FROM lab_experiments WHERE owner_id=NEW.owner_id AND deleted_at IS NULL)>=10
BEGIN SELECT RAISE(ABORT,'LAB_IMAGE_QUOTA'); END;

-- Parenthesize CASE expressions: the remote D1 statement splitter otherwise mistakes CASE END for trigger END.
CREATE TRIGGER lab_task_quota BEFORE INSERT ON lab_tasks
WHEN NOT EXISTS(SELECT 1 FROM admins WHERE user_id=NEW.owner_id AND role='admin')
BEGIN
  SELECT (CASE WHEN NEW.deleted_at IS NULL AND (SELECT COUNT(*) FROM lab_tasks WHERE owner_id=NEW.owner_id AND deleted_at IS NULL)>=20
    THEN RAISE(ABORT,'LAB_TASK_QUOTA') END);
  SELECT (CASE WHEN COALESCE((SELECT task_count FROM lab_daily_usage WHERE owner_id=NEW.owner_id AND day=date(NEW.created_at/1000,'unixepoch','+8 hours')),0)>=20
    THEN RAISE(ABORT,'LAB_DAILY_QUOTA') END);
END;
CREATE TRIGGER lab_task_usage AFTER INSERT ON lab_tasks
BEGIN
  INSERT INTO lab_daily_usage(owner_id,day,task_count)
  VALUES(NEW.owner_id,date(NEW.created_at/1000,'unixepoch','+8 hours'),1)
  ON CONFLICT(owner_id,day) DO UPDATE SET task_count=task_count+1;
END;

-- Cover every publication path, including making an existing wall public again.
CREATE TRIGGER lab_wall_insert_quota BEFORE INSERT ON walls
WHEN NEW.published=1 AND NEW.visibility='public'
AND NOT EXISTS(SELECT 1 FROM walls WHERE id=NEW.id)
AND NOT EXISTS(SELECT 1 FROM admins WHERE user_id=NEW.owner_id AND role='admin')
AND (SELECT COUNT(*) FROM walls WHERE owner_id=NEW.owner_id AND published=1 AND visibility='public')>=10
BEGIN SELECT RAISE(ABORT,'LAB_WALL_QUOTA'); END;
CREATE TRIGGER lab_wall_update_quota BEFORE UPDATE OF owner_id,published,visibility ON walls
WHEN NEW.published=1 AND NEW.visibility='public'
AND (OLD.owner_id IS NOT NEW.owner_id OR OLD.published<>1 OR OLD.visibility<>'public')
AND NOT EXISTS(SELECT 1 FROM admins WHERE user_id=NEW.owner_id AND role='admin')
AND (SELECT COUNT(*) FROM walls WHERE owner_id=NEW.owner_id AND published=1 AND visibility='public' AND id<>OLD.id)>=10
BEGIN SELECT RAISE(ABORT,'LAB_WALL_QUOTA'); END;
