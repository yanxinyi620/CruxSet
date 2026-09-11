CREATE TABLE lab_experiments (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
  width INTEGER NOT NULL, height INTEGER NOT NULL, sha256 TEXT NOT NULL,
  content_type TEXT NOT NULL, input_key TEXT NOT NULL,
  created_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE lab_tasks (
  id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL REFERENCES lab_experiments(id),
  owner_id TEXT NOT NULL REFERENCES users(id), attempt_id TEXT NOT NULL,
  model TEXT NOT NULL, parameters TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed','timed_out')),
  progress REAL NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '', error TEXT,
  token_hash TEXT, run_id TEXT, output_prefix TEXT NOT NULL,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deadline INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX lab_pending ON lab_tasks(owner_id,status,deleted_at);
CREATE INDEX lab_deadlines ON lab_tasks(status,deadline);
CREATE TABLE lab_calibrations (
  id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL REFERENCES lab_experiments(id),
  source_task_id TEXT, candidates_key TEXT NOT NULL, display_key TEXT NOT NULL,
  candidate_count INTEGER NOT NULL, changes TEXT NOT NULL,
  created_at INTEGER NOT NULL, publish TEXT, deleted_at INTEGER
);
CREATE TABLE lab_gc (
  prefix TEXT PRIMARY KEY, created_at INTEGER NOT NULL
);
