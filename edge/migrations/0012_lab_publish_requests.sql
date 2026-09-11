-- Review snapshots deliberately have no experiment/calibration foreign keys.
CREATE TABLE lab_publish_requests (
 id TEXT PRIMARY KEY, applicant_id TEXT NOT NULL, experiment_id TEXT NOT NULL,
 calibration_id TEXT NOT NULL, wall_name TEXT NOT NULL, target TEXT NOT NULL CHECK(target='cloudbase'),
 status TEXT NOT NULL CHECK(status IN ('pending','publishing','published','rejected','failed')),
 snapshot_key TEXT NOT NULL, created_at INTEGER NOT NULL, reason TEXT, error TEXT, result TEXT,
 reviewer_id TEXT, reviewed_at INTEGER, lease_until INTEGER, lease_token TEXT
);
CREATE UNIQUE INDEX lab_publish_active ON lab_publish_requests(calibration_id,target) WHERE status <> 'rejected';
CREATE INDEX lab_publish_applicant ON lab_publish_requests(applicant_id,created_at);
