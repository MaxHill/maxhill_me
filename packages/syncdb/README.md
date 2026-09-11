# `@maxhill/syncdb`

Offline-first CRDT data for the browser. Data lives in IndexedDB on the
device. The app can sync with `syncdb-server` when a network is available.

This guide starts with a small local database. Later sections add indexes,
queries, change handlers, and server sync.

## Install

```bash
pnpm add @maxhill/syncdb
```

The package is a workspace library in this monorepo. Apps depend on it with
`workspace:*`.

## 1. Open a database

Pick a short `dbName`. Allowed characters: letters, digits, `_`, `-`.
Length: 1 to 64.

```ts
import { newDatabase } from "@maxhill/syncdb";

const db = await newDatabase("golf")
  .addTable("clubs", {})
  .build()
  .open();
```

What this does:

1. Creates or opens an IndexedDB database named `golf`.
2. Registers a table named `clubs` (no indexes yet).
3. Mints a `clientId` on first open and stores it locally.

Close the database when the app tears down that session:

```ts
await db.close();
```

## 2. Write and read rows

Get a typed table handle. Use that handle for all row work.

```ts
const clubs = db.table("clubs");

await clubs.setRow("driver", {
  name: "Driver",
  loft: 10.5,
});

const row = await clubs.get("driver");
// { _key: "driver", name: "Driver", loft: 10.5 }
```

Update one field without rewriting the whole row:

```ts
await clubs.setField("driver", "loft", 9.5);
```

Remove a row:

```ts
await clubs.deleteRow("driver");
```

Notes:

- Row keys are your IDs (`string`, number, and other IndexedDB keys).
- Each row includes `_key` when you read it. Do not set `_key` yourself in a
  way that disagrees with the row key argument.
- Tables are flexible. You do not declare a column schema.

## 3. Add more tables

Chain `addTable` on the builder. Empty `{}` means no indexes on that table.

```ts
const db = await newDatabase("golf")
  .addTable("clubs", {})
  .addTable("shot_types", {})
  .addTable("shot_log", {})
  .build()
  .open();

const shotTypes = db.table("shot_types");
await shotTypes.setRow("putt", { name: "Putt" });
```

You must call `addTable` for every table you use with `db.table(...)`.
An unknown table name throws.

## 4. Scan a table

`query()` returns an async iterator over materialised rows.

```ts
for await (const club of clubs.query()) {
  console.log(club.name);
}
```

Filter by primary key range:

```ts
import { above, below, exact, between, asc, desc } from "@maxhill/syncdb";

// One key
for await (const club of clubs.query(exact("driver"))) {
  console.log(club);
}

// Keys after "c" (inclusive by default)
for await (const club of clubs.query(above("c"))) {
  console.log(club._key);
}

// Newest-style order when keys sort that way
for await (const club of clubs.query(desc)) {
  console.log(club._key);
}

// Range + direction
for await (const club of clubs.query(between("a", "m"), desc)) {
  console.log(club._key);
}
```

Default direction is ascending (`asc`).

## 5. Declare indexes and query them

Indexes are fixed at open time. Pass field lists in `addTable`.

```ts
const db = await newDatabase("golf")
  .addTable("clubs", {
    byName: ["name"],
    byLoft: ["loft"],
  })
  .addTable("golf_rounds", {
    byStartedAt: ["startedAt"],
  })
  .addTable("golf_round_holes", {
    byRoundId: ["roundId"],
    byRoundAndHole: ["roundId", "holeNumber"],
  })
  .build()
  .open();

const clubs = db.table("clubs");
await clubs.setRow("c1", { name: "Driver", loft: 10.5 });
await clubs.setRow("c2", { name: "Putter", loft: 3 });
```

Query through an index:

```ts
import { above, exact, desc } from "@maxhill/syncdb";

// All clubs ordered by loft index
for await (const club of clubs.index("byLoft").query()) {
  console.log(club.name, club.loft);
}

// Loft greater than 5
for await (const club of clubs.index("byLoft").query(above(5))) {
  console.log(club.name);
}

// Compound index: exact pair
const holes = db.table("golf_round_holes");
for await (const hole of holes.index("byRoundAndHole").query(exact(["round-1", 3]))) {
  console.log(hole);
}

// Time index, newest first
const rounds = db.table("golf_rounds");
for await (const round of rounds.index("byStartedAt").query(desc)) {
  console.log(round.startedAt);
}
```

Rules:

- Only use index names you passed to `addTable`.
- Unknown index names throw.
- The library keeps indexes up to date on local writes and on remote apply.

### Query helpers

```ts
import { exact, above, below, between } from "@maxhill/syncdb";

exact(value);

above(value); // inclusive by default
above(value, { inclusive: false });

below(value); // inclusive by default
below(value, { inclusive: false });

between(low, high);
between(low, high, {
  lowerInclusive: true,
  upperInclusive: true,
});
```

## 6. React to data changes

Subscribe when the UI must refresh after writes.

### One table

```ts
import type { TableChangeEvent } from "@maxhill/syncdb";

const stop = clubs.subscribe((event: TableChangeEvent) => {
  // event.table === "clubs"
  // event.source === "local" | "remote"
  void refreshClubList();
});

// Later
stop();
```

### Whole database

```ts
const stop = db.subscribe((event) => {
  console.log(event.table, event.source);
});
```

### Filter by source

```ts
// Writes from this browser / device only
db.subscribe(handler, "local");

// Rows applied after a successful sync() from other replicas
db.subscribe(handler, "remote");

// Default
db.subscribe(handler, "all");
```

| `source` | When it fires |
| --- | --- |
| `local` | `setRow`, `setField`, or `deleteRow` on this replica |
| `remote` | `db.sync()` applied operations from other replicas |
| `all` | Both (default) |

Same table and source in one turn coalesce to one microtask notify.

Server SSE wake-ups are not this API. A wake-up only means: call `db.sync()`.
After `sync()` applies remote ops, these handlers run with `source: "remote"`.

## 7. Sync with the server

Point the builder at your sync HTTP endpoint. Call `sync()` when you want to
push local ops and pull remote ops.

```ts
const db = await newDatabase("golf")
  .addTable("clubs", { byName: ["name"] })
  .withSyncRemote("https://sync.example.com/sync")
  .withSyncHeaders(async () => {
    const token = await getAccessToken();
    if (!token) {
      return {};
    }
    return { Authorization: `Bearer ${token}` };
  })
  .withOnUnauthorized(async () => {
    // Return true to retry the request once (for example after refresh).
    const token = await refreshAccessToken();
    return token !== null;
  })
  .build()
  .open();

await db.sync();
```

Typical app pattern:

1. Write locally any time (offline is fine).
2. Call `sync()` on a timer, after local writes, and when the server sends an
   upstream-change wake-up (see `syncdb-server` / golf `upstream-subscribe`).
3. UI handlers with `source: "remote"` refresh lists after pull.

Auth headers are optional. Without them the server rejects protected routes.

## 8. Client id rules (multi-device)

Each local replica has a `clientId`. The library sets this with
`crypto.randomUUID` on first open and stores it in IndexedDB.

The server treats `(clientId, version)` as unique per tenant
(`dbName` + user). Two different ops must never share the same pair with
different payloads.

Do this:

- Let the default `clientId` stand in production apps.
- Give each browser profile, device, and simulator its own store and id.

Do not do this:

- Reuse one `clientId` across two live replicas of the same tenant.
- Derive `clientId` only from `dbName`.
- Wipe IndexedDB and keep the old `clientId`. Mint a new id after a wipe.

Tests and simulators may pin an id:

```ts
const db = await newDatabase("golf")
  .addTable("clubs", {})
  .withClientId("test-client-1")
  .build()
  .open();

console.log(db.clientId); // "test-client-1"
```

If two replicas collide on a dot with different data, the server fails the
request on purpose. That turns a silent merge bug into a loud sync error.

## 9. Full example

```ts
import {
  newDatabase,
  above,
  desc,
  type TableChangeEvent,
} from "@maxhill/syncdb";

async function main() {
  const db = await newDatabase("notes-app")
    .addTable("notes", {
      byUpdatedAt: ["updatedAt"],
      byTitle: ["title"],
    })
    .withSyncRemote("https://sync.example.com/sync")
    .withSyncHeaders(async () => ({
      Authorization: `Bearer ${await getAccessToken()}`,
    }))
    .build()
    .open();

  const notes = db.table("notes");

  notes.subscribe((event: TableChangeEvent) => {
    if (event.source === "remote") {
      void redrawList();
    }
  });

  const id = crypto.randomUUID();
  await notes.setRow(id, {
    title: "Buy milk",
    updatedAt: new Date().toISOString(),
    done: false,
  });

  await notes.setField(id, "done", true);

  for await (const note of notes.index("byUpdatedAt").query(desc)) {
    console.log(note.title, note.updatedAt);
  }

  for await (const note of notes.index("byTitle").query(above("A"))) {
    console.log(note.title);
  }

  try {
    await db.sync();
  } catch (error) {
    console.warn("sync failed", error);
  }

  await db.close();
}
```

## 10. Storage model (short)

You do not open object stores by hand. The library keeps:

| Store | Role |
| --- | --- |
| CRDT rows | Authoritative field-level CRDT state |
| Materialised rows | Queryable plain objects after conflict rules |
| Indexes | Secondary keys for range scans |
| Operation log | Local ops waiting for sync |
| Client state | `clientId`, clocks, sync cursor |

Writes go to CRDT state, then materialise, then update indexes. `sync()`
exchanges operation logs with the server and applies remote ops the same way.

## 11. Status

Done:

- LWW / OR-Map CRDT ops with tombstones
- Local table API (`get`, `setRow`, `setField`, `deleteRow`, `query`)
- Declared indexes and index queries
- Client/server sync protocol
- Table and database change subscriptions (`local` / `remote`)

Later / partial:

- Richer query helpers and views
- Alternate index backends

## 12. Exports you will use most

```ts
import {
  newDatabase,
  above,
  below,
  between,
  exact,
  asc,
  desc,
  isSyncError,
  SyncErrorCode,
  type TableChangeEvent,
  type ChangeSource,
  type SourceFilter,
} from "@maxhill/syncdb";
```

Lower-level pieces (`Lifecycle`, `Sync`, stores) are exported for the
simulator and tests. App code should stay on `newDatabase` and `Table`.
