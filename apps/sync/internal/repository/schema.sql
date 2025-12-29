CREATE TABLE IF NOT EXISTS sync_server (
    id varchar(36) PRIMARY KEY NOT NULL,
    version integer NOT NULL
);

CREATE TABLE IF NOT EXISTS wal_entries (
    server_version INTEGER PRIMARY KEY AUTOINCREMENT,
    KEY TEXT NOT NULL,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL,
    value TEXT,
    value_key TEXT,
    version INTEGER NOT NULL,
    client_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_id ON wal_entries(client_id);
