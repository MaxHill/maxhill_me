INSERT INTO wal_operations (
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
