CREATE TABLE wall_sync_sources (
  wall_id TEXT PRIMARY KEY REFERENCES walls(id) ON DELETE CASCADE,
  experiment_id TEXT NOT NULL,
  calibration_id TEXT NOT NULL
);
INSERT INTO wall_sync_sources SELECT w.id,c.experiment_id,c.id FROM walls w JOIN lab_calibrations c ON w.id='wall_lab_'||c.id;
CREATE TABLE route_sync_revisions (
  wall_id TEXT PRIMARY KEY REFERENCES walls(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0
);
INSERT INTO route_sync_revisions (wall_id) SELECT id FROM walls;
CREATE TRIGGER route_sync_wall_insert AFTER INSERT ON walls BEGIN
 INSERT INTO route_sync_revisions (wall_id) VALUES (NEW.id);
END;
CREATE TRIGGER route_sync_problem_insert AFTER INSERT ON problems BEGIN
 UPDATE route_sync_revisions SET revision=revision+1 WHERE wall_id=NEW.wall_id;
END;
CREATE TRIGGER route_sync_problem_update AFTER UPDATE ON problems BEGIN
 UPDATE route_sync_revisions SET revision=revision+1 WHERE wall_id=NEW.wall_id OR wall_id=OLD.wall_id;
END;
CREATE TRIGGER route_sync_problem_delete AFTER DELETE ON problems BEGIN
 UPDATE route_sync_revisions SET revision=revision+1 WHERE wall_id=OLD.wall_id;
END;
CREATE TRIGGER route_sync_hold_insert AFTER INSERT ON holds BEGIN
 UPDATE route_sync_revisions SET revision=revision+1 WHERE wall_id=NEW.wall_id;
END;
CREATE TRIGGER route_sync_hold_update AFTER UPDATE ON holds BEGIN
 UPDATE route_sync_revisions SET revision=revision+1 WHERE wall_id=NEW.wall_id OR wall_id=OLD.wall_id;
END;
CREATE TRIGGER route_sync_hold_delete AFTER DELETE ON holds BEGIN
 UPDATE route_sync_revisions SET revision=revision+1 WHERE wall_id=OLD.wall_id;
END;
CREATE TRIGGER route_sync_assignment_insert AFTER INSERT ON problem_holds BEGIN
 UPDATE route_sync_revisions SET revision=revision+1 WHERE wall_id=NEW.wall_id;
END;
CREATE TRIGGER route_sync_assignment_delete AFTER DELETE ON problem_holds BEGIN
 UPDATE route_sync_revisions SET revision=revision+1 WHERE wall_id=OLD.wall_id;
END;
