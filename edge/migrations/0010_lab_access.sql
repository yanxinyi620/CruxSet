ALTER TABLE admins ADD COLUMN lab_enabled INTEGER NOT NULL DEFAULT 0 CHECK (lab_enabled IN (0, 1));
