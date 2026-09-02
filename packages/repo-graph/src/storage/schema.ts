export const SCHEMA_VERSION = 1;

/** Metadata that determines whether a complete index can be reused safely. */
export const INDEX_FINGERPRINT_METADATA_KEYS = [
  "schemaVersion",
  "toolVersion",
  "compilerVersion",
  "contentHash",
  "configHash",
] as const;

export const SCHEMA_SQL = `
CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE files (
  path TEXT PRIMARY KEY,
  project_path TEXT,
  package_name TEXT
) STRICT;

CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  qualified_name TEXT NOT NULL,
  source_file TEXT NOT NULL REFERENCES files(path),
  start_line INTEGER NOT NULL,
  start_column INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  end_column INTEGER NOT NULL,
  package_name TEXT,
  project_path TEXT NOT NULL,
  exported INTEGER NOT NULL CHECK (exported IN (0, 1)),
  signature TEXT NOT NULL,
  summary TEXT NOT NULL
) STRICT;

CREATE TABLE edges (
  id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES nodes(id),
  target_id TEXT NOT NULL REFERENCES nodes(id),
  kind TEXT NOT NULL,
  confidence TEXT NOT NULL,
  evidence_file TEXT NOT NULL REFERENCES files(path),
  start_line INTEGER NOT NULL,
  start_column INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  end_column INTEGER NOT NULL,
  diagnostic_code TEXT,
  diagnostic_level TEXT,
  diagnostic_message TEXT,
  diagnostic_file TEXT REFERENCES files(path)
) STRICT;

CREATE TABLE diagnostics (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  file TEXT REFERENCES files(path)
) STRICT;

CREATE VIRTUAL TABLE node_search USING fts5(
  node_id UNINDEXED,
  label,
  qualified_name,
  summary,
  source_file
);

CREATE INDEX files_project_idx ON files(project_path);
CREATE INDEX files_package_idx ON files(package_name);
CREATE INDEX nodes_kind_idx ON nodes(kind);
CREATE INDEX nodes_file_idx ON nodes(source_file);
CREATE INDEX nodes_project_idx ON nodes(project_path);
CREATE INDEX nodes_package_idx ON nodes(package_name);
CREATE INDEX edges_source_idx ON edges(source_id);
CREATE INDEX edges_target_idx ON edges(target_id);
CREATE INDEX edges_kind_idx ON edges(kind);
CREATE INDEX edges_file_idx ON edges(evidence_file);
CREATE INDEX diagnostics_file_idx ON diagnostics(file);
`;
