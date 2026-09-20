CREATE TABLE lab_publish_snapshot_locks (
  calibration_id TEXT NOT NULL,
  target TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(calibration_id,target)
);
ALTER TABLE lab_tasks ADD COLUMN submission_id TEXT;
CREATE UNIQUE INDEX lab_task_submission ON lab_tasks(owner_id,submission_id) WHERE submission_id IS NOT NULL;
