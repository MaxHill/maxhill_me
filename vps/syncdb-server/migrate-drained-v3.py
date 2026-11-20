#!/usr/bin/env python3
"""Explicit schema transition for quiescent, fully acknowledged legacy replicas."""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3

OPERATION_COLUMNS = (
    "server_version", "tenant_id", "db_name", "client_id", "version", "type",
    "table_name", "row_key", "field_key", "json_value", "version_vector",
)
CLIENT_COLUMNS = ("tenant_id", "db_name", "client_id", "last_mutation_id", "last_client_version")


def fingerprint(connection):
    rows = connection.execute("SELECT * FROM crdt_operations ORDER BY server_version").fetchall()
    sequence = connection.execute(
        "SELECT seq FROM sqlite_sequence WHERE name = 'crdt_operations'"
    ).fetchall()
    data = json.dumps([rows, sequence], ensure_ascii=True, separators=(",", ":"))
    return hashlib.sha256(data.encode()).hexdigest(), len(rows)


def migrate(path, expected_fingerprint):
    # mode=rw prevents a typo from creating a new database.
    connection = sqlite3.connect(Path(path).resolve().as_uri() + "?mode=rw", uri=True)
    try:
        connection.execute("BEGIN IMMEDIATE")
        if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError("SQLite integrity check failed")
        columns = tuple(row[1] for row in connection.execute("PRAGMA table_info(crdt_operations)"))
        layout = [(row[2].upper(), row[3], row[5]) for row in connection.execute(
            "PRAGMA table_info(crdt_operations)"
        )]
        expected_layout = [("INTEGER", 0, 1)] + [
            (kind, required, 0) for kind, required in (
                ("TEXT", 1), ("TEXT", 1), ("TEXT", 1), ("INTEGER", 1),
                ("TEXT", 1), ("TEXT", 1), ("TEXT", 1), ("TEXT", 0), ("TEXT", 0), ("TEXT", 0),
            )
        ]
        schema = connection.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='crdt_operations'"
        ).fetchone()
        unique_indexes = [row[1] for row in connection.execute("PRAGMA index_list(crdt_operations)") if row[2] and not row[4]]
        unique_dots = False
        for name in unique_indexes:
            # Index names come from SQLite, but quote them rather than interpolate identifiers raw.
            quoted = name.replace('"', '""')
            if tuple(row[2] for row in connection.execute(f'PRAGMA index_info("{quoted}")')) == (
                "tenant_id", "db_name", "client_id", "version"
            ):
                unique_dots = True
        if columns != OPERATION_COLUMNS or layout != expected_layout or not unique_dots or (
            not schema or "AUTOINCREMENT" not in schema[0].upper()
        ):
            raise ValueError("Unsupported legacy operation schema or constraints")
        before, count = fingerprint(connection)
        if before != expected_fingerprint:
            raise ValueError("Operation snapshot changed; repeat preflight before migrating")
        tables = {row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )}
        if "protocol_schema_marker" in tables:
            marker = connection.execute("SELECT id, schema_version FROM protocol_schema_marker").fetchall()
            clients = tuple(row[1] for row in connection.execute("PRAGMA table_info(client_sync_state)"))
            client_layout = [(row[2].upper(), row[3], row[5]) for row in connection.execute(
                "PRAGMA table_info(client_sync_state)"
            )]
            if marker != [(1, 1)] or clients != CLIENT_COLUMNS or client_layout != [
                ("TEXT", 1, 1), ("TEXT", 1, 2), ("TEXT", 1, 3), ("INTEGER", 1, 0), ("INTEGER", 1, 0),
            ]:
                raise ValueError("Unsupported existing protocol metadata")
            connection.rollback()
            return before, count, False
        allowed = {"crdt_operations", "sqlite_sequence", "_litestream_lock", "_litestream_seq"}
        if tables - allowed:
            raise ValueError("Unknown tables; migration refused")
        # New client incarnations start at 1. Historical logical clocks are NOT mutation IDs.
        connection.execute("""CREATE TABLE client_sync_state (
            tenant_id TEXT NOT NULL, db_name TEXT NOT NULL, client_id TEXT NOT NULL,
            last_mutation_id INTEGER NOT NULL, last_client_version INTEGER NOT NULL,
            PRIMARY KEY (tenant_id, db_name, client_id))""")
        connection.execute("""CREATE TABLE protocol_schema_marker (
            id INTEGER PRIMARY KEY CHECK (id = 1), schema_version INTEGER NOT NULL)""")
        connection.execute("INSERT INTO protocol_schema_marker VALUES (1, 1)")
        if fingerprint(connection) != (before, count):
            raise ValueError("Migration changed operation records or server sequence")
        connection.commit()
        return before, count, True
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--clients-drained", action="store_true",
                        help="Confirm all old replicas are acknowledged, closed, and will rotate identities")
    action.add_argument("--inspect", action="store_true", help="Read the snapshot fingerprint without migration")
    parser.add_argument("--expected-fingerprint", help="Fingerprint from the verified pre-cutover snapshot")
    args = parser.parse_args()
    if args.inspect:
        connection = sqlite3.connect(Path(args.database).resolve().as_uri() + "?mode=ro", uri=True)
        try:
            digest, count = fingerprint(connection)
        finally:
            connection.close()
        changed = False
    else:
        if not args.expected_fingerprint:
            parser.error("--clients-drained requires --expected-fingerprint")
        digest, count, changed = migrate(args.database, args.expected_fingerprint)
    print(json.dumps({"fingerprint": digest, "operations": count, "migrated": changed}))


if __name__ == "__main__":
    main()
