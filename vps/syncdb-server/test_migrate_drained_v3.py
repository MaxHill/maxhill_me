from contextlib import closing
import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("migration", Path(__file__).with_name("migrate-drained-v3.py"))
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


class DrainedMigrationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "legacy.db"
        with closing(sqlite3.connect(self.path)) as database, database:
            database.execute("""CREATE TABLE crdt_operations (
                server_version INTEGER PRIMARY KEY AUTOINCREMENT,
                tenant_id TEXT NOT NULL, db_name TEXT NOT NULL, client_id TEXT NOT NULL,
                version INTEGER NOT NULL, type TEXT NOT NULL, table_name TEXT NOT NULL,
                row_key TEXT NOT NULL, field_key TEXT, json_value TEXT, version_vector TEXT,
                UNIQUE(tenant_id, db_name, client_id, version))""")
            database.executemany("INSERT INTO crdt_operations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
                (1, "user-a", "golf", "old", 53, "setRow", "clubs", "r1", None, '{"name":"A"}', None),
                (4, "user-b", "golf", "old", 149, "removeRow", "clubs", "r1", None, None, '{"old":53}'),
                (9, "user-a", "golf", "checkpoint:r1", 9, "checkpointRow", "clubs", "r1", None,
                 '{"checkpointSeenServerVersion":8,"state":{"fields":{}}}', None),
            ])
            # Sequence must survive even when its last published operation was compacted away.
            database.execute("UPDATE sqlite_sequence SET seq=15 WHERE name='crdt_operations'")
            self.before = migration.fingerprint(database)

    def inspect(self):
        with closing(sqlite3.connect(self.path)) as database, database:
            return migration.fingerprint(database), database.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).fetchall()

    def test_preserves_operations_sequence_and_partitioning_without_guessing_prefixes(self):
        result = migration.migrate(self.path, self.before[0])
        self.assertEqual(result, (*self.before, True))
        self.assertEqual(self.inspect()[0], self.before)
        with closing(sqlite3.connect(self.path)) as database, database:
            self.assertEqual(database.execute("SELECT * FROM client_sync_state").fetchall(), [])
            self.assertEqual(database.execute("SELECT * FROM protocol_schema_marker").fetchall(), [(1, 1)])
            database.execute("""INSERT INTO crdt_operations
                (tenant_id,db_name,client_id,version,type,table_name,row_key)
                VALUES ('user-a','golf','new',200,'setRow','clubs','r2')""")
            self.assertEqual(database.execute("SELECT max(server_version) FROM crdt_operations").fetchone(), (16,))

    def test_repeated_migration_is_a_noop(self):
        migration.migrate(self.path, self.before[0])
        self.assertEqual(migration.migrate(self.path, self.before[0]), (*self.before, False))

    def test_changed_snapshot_is_refused_without_metadata(self):
        before = self.inspect()
        with self.assertRaisesRegex(ValueError, "snapshot changed"):
            migration.migrate(self.path, "wrong")
        self.assertEqual(self.inspect(), before)

    def test_unknown_schema_is_refused_without_mutation(self):
        with closing(sqlite3.connect(self.path)) as database, database:
            database.execute("CREATE TABLE unexpected (id INTEGER)")
        before = self.inspect()
        with self.assertRaisesRegex(ValueError, "Unknown tables"):
            migration.migrate(self.path, self.before[0])
        self.assertEqual(self.inspect(), before)

    def test_same_columns_without_dot_uniqueness_are_refused(self):
        with closing(sqlite3.connect(self.path)) as database, database:
            schema = database.execute(
                "SELECT sql FROM sqlite_master WHERE name='crdt_operations'"
            ).fetchone()[0]
            without_unique = schema.replace(
                ",\n                UNIQUE(tenant_id, db_name, client_id, version)", ""
            )
            self.assertNotEqual(schema, without_unique)
            records = database.execute("SELECT * FROM crdt_operations").fetchall()
            database.execute("DROP TABLE crdt_operations")
            database.execute(without_unique)
            database.executemany("INSERT INTO crdt_operations VALUES (?,?,?,?,?,?,?,?,?,?,?)", records)
            fingerprint = migration.fingerprint(database)[0]
        before = self.inspect()
        with self.assertRaisesRegex(ValueError, "constraints"):
            migration.migrate(self.path, fingerprint)
        self.assertEqual(self.inspect(), before)

    def test_failure_after_metadata_creation_rolls_back(self):
        from unittest.mock import patch
        before = self.inspect()
        with patch.object(migration, "fingerprint", side_effect=[self.before, ("changed", 3)]):
            with self.assertRaisesRegex(ValueError, "changed operation"):
                migration.migrate(self.path, self.before[0])
        self.assertEqual(self.inspect(), before)


if __name__ == "__main__":
    unittest.main()
