PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE admins (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE walls (
  id TEXT PRIMARY KEY,
  wall_number INTEGER,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_path TEXT NOT NULL,
  image_width INTEGER NOT NULL,
  image_height INTEGER NOT NULL,
  geometry_type TEXT NOT NULL,
  angle_options_json TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
  published INTEGER NOT NULL CHECK (published IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE holds (
  wall_id TEXT NOT NULL REFERENCES walls(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  x REAL NOT NULL CHECK (x BETWEEN 0 AND 1),
  y REAL NOT NULL CHECK (y BETWEEN 0 AND 1),
  radius REAL NOT NULL CHECK (radius > 0),
  kind TEXT,
  PRIMARY KEY (wall_id, id)
);

CREATE TABLE problems (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  wall_id TEXT NOT NULL REFERENCES walls(id) ON DELETE RESTRICT,
  name TEXT,
  description TEXT,
  angle INTEGER NOT NULL,
  grade TEXT NOT NULL,
  foot_rule TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(wall_id, number)
);

CREATE TABLE problem_holds (
  problem_id TEXT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  wall_id TEXT NOT NULL,
  hold_id TEXT NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY (problem_id, hold_id, role),
  FOREIGN KEY (wall_id, hold_id) REFERENCES holds(wall_id, id)
);

CREATE TABLE counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL CHECK (value >= 0)
);

CREATE TABLE static_wall_publishes (
  release_id TEXT PRIMARY KEY,
  content_sha256 TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE asset_refs (
  path TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  wall_id TEXT NOT NULL UNIQUE REFERENCES walls(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL
);

CREATE INDEX walls_public_order_idx ON walls(visibility, published, created_at DESC, id DESC);
CREATE INDEX problems_wall_order_idx ON problems(wall_id, created_at DESC, id DESC);
CREATE INDEX problems_creator_order_idx ON problems(created_by, created_at DESC, id DESC);
