INSERT INTO wal_entries (
    KEY,
    table_name,
    operation,
    value,
    value_key,
    version,
    client_id
)
VALUES (?, ?, ?, ?, ?, ?, ?)
RETURNING server_version;
