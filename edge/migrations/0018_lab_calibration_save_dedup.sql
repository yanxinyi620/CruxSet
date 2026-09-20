ALTER TABLE lab_calibrations ADD COLUMN content_hash TEXT;
ALTER TABLE lab_calibrations ADD COLUMN image_source_key TEXT;
UPDATE lab_calibrations SET image_source_key=COALESCE(
  (SELECT output_prefix || 'display.webp' FROM lab_tasks WHERE id=source_task_id),display_key
);
CREATE INDEX lab_calibration_content ON lab_calibrations(experiment_id,content_hash) WHERE deleted_at IS NULL;
CREATE TABLE lab_calibration_save_locks (
  experiment_id TEXT NOT NULL REFERENCES lab_experiments(id),
  content_hash TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(experiment_id,content_hash)
);
