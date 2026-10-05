import { assert } from "@maxhill/stdx";
import { type CRDTOperation, type Dot, type ORMapRow } from "../crdt.ts";
import { promisifyIDBRequest } from "../utils.ts";

const CLIENT_STATE_STORE = "clientState";
const OPERATIONS_STORE = "operations";
const ROWS_STORE = "rows";

const SYNC_PROTOCOL_VERSION = "syncProtocolVersion";
const SYNC_PROTOCOL_VERSION_CURRENT = 2;

type LegacyCRDTOperation =
  | {
    type: "set";
    table: string;
    rowKey: string;
    field?: string;
    value: unknown;
    dot: Dot;
  }
  | {
    type: "setRow";
    table: string;
    rowKey: string;
    value: Record<string, unknown>;
    dot: Dot;
  }
  | {
    type: "remove";
    table: string;
    rowKey: string;
    dot: Dot;
    context: Record<string, number>;
  };

type StoredOperationRecord = {
  op: CRDTOperation | LegacyCRDTOperation;
  synced: number;
};

type LegacyORMapRow = Omit<ORMapRow, "tombstone"> & {
  tombstone?:
    | ORMapRow["tombstone"]
    | {
      dot: Dot;
      context: Record<string, number>;
    };
};

export async function migrate_v2(db: IDBDatabase): Promise<void> {
  const transaction = db.transaction(
    [CLIENT_STATE_STORE, OPERATIONS_STORE, ROWS_STORE],
    "readwrite",
  );
  const clientStateStore = transaction.objectStore(CLIENT_STATE_STORE);
  const currentVersion = await promisifyIDBRequest(
    clientStateStore.get(SYNC_PROTOCOL_VERSION),
  );

  assert(
    !(currentVersion > SYNC_PROTOCOL_VERSION_CURRENT),
    `Current server version is larger than library sync version. current=${currentVersion}, library=${SYNC_PROTOCOL_VERSION_CURRENT}`,
  );
  if (currentVersion === SYNC_PROTOCOL_VERSION_CURRENT) {
    return;
  }

  await migrateOperationRecords(transaction.objectStore(OPERATIONS_STORE));
  await migrateRowRecords(transaction.objectStore(ROWS_STORE));
  await promisifyIDBRequest(
    clientStateStore.put(SYNC_PROTOCOL_VERSION_CURRENT, SYNC_PROTOCOL_VERSION),
  );
}

function migrateOperationToProtocolV2(
  operation: CRDTOperation | LegacyCRDTOperation,
): CRDTOperation {
  if ("tableName" in operation) {
    return operation;
  }

  if (operation.type === "set") {
    return {
      type: "set",
      tableName: operation.table,
      rowKey: operation.rowKey,
      fieldKey: operation.field,
      jsonValue: operation.value,
      dot: operation.dot,
    };
  }

  if (operation.type === "setRow") {
    return {
      type: "setRow",
      tableName: operation.table,
      rowKey: operation.rowKey,
      fields: operation.value,
      dot: operation.dot,
    };
  }

  assert(operation.type === "remove");
  return {
    type: "removeRow",
    tableName: operation.table,
    rowKey: operation.rowKey,
    dot: operation.dot,
    versionVector: operation.context,
  };
}

async function migrateOperationRecords(store: IDBObjectStore): Promise<void> {
  assert(store.name === OPERATIONS_STORE);

  await updateCursorRecords<StoredOperationRecord>(store, (record) => {
    const nextOperation = migrateOperationToProtocolV2(record.op);
    if (nextOperation === record.op) {
      return record;
    }

    return { ...record, op: nextOperation };
  });
}

async function migrateRowRecords(store: IDBObjectStore): Promise<void> {
  assert(store.name === ROWS_STORE);

  await updateCursorRecords<LegacyORMapRow>(store, (row) => {
    if (!row.tombstone) {
      return row;
    }
    if (!("context" in row.tombstone)) {
      return row;
    }

    const { context, ...tombstoneRest } = row.tombstone;
    return {
      ...row,
      tombstone: {
        ...tombstoneRest,
        versionVector: context,
      },
    };
  });
}

async function updateCursorRecords<RecordValue>(
  store: IDBObjectStore,
  migrateRecord: (record: RecordValue) => RecordValue,
): Promise<void> {
  const records = await promisifyIDBRequest<RecordValue[]>(store.getAll());

  for (const record of records) {
    const nextRecord = migrateRecord(record);
    if (nextRecord !== record) {
      await promisifyIDBRequest(store.put(nextRecord));
    }
  }
}
