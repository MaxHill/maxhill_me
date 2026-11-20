# Migrate drained Golf replicas to sync protocol v3

Use this procedure only when every legacy replica has finished sync and has no pending writes.
Keep all clients closed until the server transition finishes.
Do not delete browser storage.

This procedure preserves the SQLite operation log, server sequence, tenant partitions, and existing row checkpoints.
Golf copies local protocol-3 rows into `golf-v3` and retains the original `golf` store.
The remote database name remains `golf`.
Keep existing server partition ids unchanged.
The deployed server uses the OpenAuth subject when a token has no top-level `userID` claim.
These subject ids differ from `auth.users.id`.
Do not remap them during this transition.
Each copied replica gets a new client id and starts mutation ids at 1.
The copy keeps original row dots and advances the logical clock to cover their clocks and delete vectors.
The pull cursor starts at -1 so the replica can pull the server log again.

## Preconditions

1. Confirm that every client has no pending writes.
2. Close every Golf tab and installed PWA.
3. Confirm that the deployed SQLite schema matches the migration script.
4. Verify Litestream replication for the sync store.
5. Restore R2 to a separate path and verify its integrity.
6. Compare restored operation records and the server sequence with a consistent production snapshot.
7. Rehearse migration and v3 sync against a copy.
8. Keep the old app releases and the verified snapshot.

See `restore-databases.md` for Litestream configuration, restore options, and DynamicUser ownership requirements.
Do not restore over production during rehearsal.
Do not change the auth store or its R2 replica prefix.

## Stage both apps before changing storage

Use a clean, committed worktree.
The sync builder requires Docker on the build machine, not on the VPS.
Build the Golf workspace dependencies first if their artifacts are absent.

```sh
mise --cd packages/web-component-utils run deploy
mise --cd packages/css run deploy
mise --cd packages/components run deploy
mise run deploy:sync -- --stage-only
mise run deploy:golf -- --stage-only
```

Stage-only uploads releases without changing either current symlink, service, or environment file.
Record both release paths.
Do not stop production until both artifacts are ready.

## Apply the server transition

Use `ubuntu` with sudo for maintenance.
Routine `deploy` grants do not permit database maintenance or service stops.

1. Record the current release paths and SQLite ownership.
2. Stop `syncdb-server.service` to prevent new writes.
3. Take a final consistent SQLite backup, including the server sequence.
4. Keep the backup outside the app state directory.
5. Inspect the backup with the committed migration script.
6. Compare its fingerprint with the verified recovery snapshot.
7. If the fingerprint changed, stop and repeat backup verification.
8. Apply migration with that exact fingerprint.

Run these commands against a rehearsal copy first:

```sh
python3 vps/syncdb-server/migrate-drained-v3.py COPY.db --inspect
python3 vps/syncdb-server/migrate-drained-v3.py COPY.db \
  --clients-drained --expected-fingerprint FINGERPRINT
```

For production, transfer the same committed script to the VPS and run it with sudo against the actual SQLite path.
The script refuses changed fingerprints, unknown schemas, and incompatible constraints.
It commits metadata atomically without changing operation records or the server sequence.
It does not infer mutation ids from legacy logical clocks.
The new client-state table starts empty because every legacy identity is retired operationally.
Never reuse a legacy identity after this transition.

9. Verify the production operation fingerprint again.
10. Check database and sidecar ownership against the recorded ownership.
11. Activate the staged sync release with an atomic current-symlink replacement.
12. Start `syncdb-server.service`.
13. Verify service health and logs.
14. Verify Litestream replication of the migrated store.
15. Activate the staged Golf release.

## Verify clients before normal use

Opening a client can upload ownership or default-setting writes.
Treat those as post-cutover writes for recovery purposes.

1. Open one new Golf client while the other clients remain closed.
2. Confirm that it copies local rows without reporting pending work or unsupported data.
3. Confirm that its client id differs from its legacy identity.
4. Compare its rows with the preserved local store and server data.
5. Confirm that authenticated v3 pull succeeds.
6. Open each remaining client and repeat those checks.
7. Confirm that clients agree before normal writes resume.
8. Test a small write and its acknowledgement after the preservation checks pass.
9. Verify propagation to another replica and persistence after reopen.

If import fails, keep the original store and repair the cause before retry.
Do not clear an outbox, remove the legacy store, or assign guessed mutation ids.
Golf records an explicit legacy-retirement decision outside the replacement store when the authenticated owner changes.
This prevents a restart from copying the previous owner's legacy data again.

## Recovery

Before new writes, restore the final pre-cutover snapshot and reactivate both old releases if transition fails.
Follow the restore runbook for service stops, SQLite sidecars, and DynamicUser ownership.
Retain the migrated store separately before any restore.
After new writes, do not restore an older snapshot as a simple rollback.
That would remove newly acknowledged data.
Keep clients paused and preserve both stores while you repair or reconcile the new writes.

General legacy migration and pending-outbox conversion remain unsupported.
This is the controlled drained-replica transition tracked in issue #30.
