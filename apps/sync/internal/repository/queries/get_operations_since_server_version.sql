SELECT
    server_version,
    KEY,
    table_name,
    operation,
    value,
    value_key,
    version,
    client_id
FROM wal_operations
WHERE server_version > ?
  AND client_id != ?
ORDER BY server_version ASC;
