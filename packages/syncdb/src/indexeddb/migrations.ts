import { assert } from "@maxhill/stdx";
import { type CRDTOperation, type Dot, type ORMapRow } from "../crdt.ts";
import { promisifyIDBRequest } from "../utils.ts";

const CLIENT_STATE_STORE = "clientState";
const OPERATIONS_STORE = "operations";
const ROWS_STORE = "rows";

const SYNC_PROTOCOL_VERSION = "syncProtocolVersion";
const SYNC_PROTOCOL_VERSION_V2 = 2;
const SYNC_PROTOCOL_VERSION_CURRENT = 3;

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

type ProtocolV2SetOperation = {
  type: "set";
  tableName: string;
  rowKey: string;
  fieldKey: string | undefined;
  jsonValue: unknown;
  dot: Dot;
};

type StoredOperationRecord = {
  op: CRDTOperation | LegacyCRDTOperation | ProtocolV2SetOperation;
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

export async function migrate(db: IDBDatabase): Promise<void> {
  const currentVersion = await getCurrentProtocolVersion(db);

  assert(
    currentVersion === undefined || currentVersion <= SYNC_PROTOCOL_VERSION_CURRENT,
    `Current server version is larger than library sync version. current=${currentVersion}, library=${SYNC_PROTOCOL_VERSION_CURRENT}`,
  );
  if (currentVersion === SYNC_PROTOCOL_VERSION_CURRENT) {
    return;
  }

  await migrate_v2(db);
  await migrate_v3(db);
}

export async function migrate_v2(db: IDBDatabase): Promise<void> {
  const transaction = db.transaction(
    [CLIENT_STATE_STORE, OPERATIONS_STORE, ROWS_STORE],
    "readwrite",
  );
  const clientStateStore = transaction.objectStore(CLIENT_STATE_STORE);
  const currentVersion = await promisifyIDBRequest(
    clientStateStore.get(SYNC_PROTOCOL_VERSION),
  );

  if (currentVersion !== undefined && currentVersion >= SYNC_PROTOCOL_VERSION_V2) {
    return;
  }

  await migrateOperationRecords(transaction.objectStore(OPERATIONS_STORE));
  await migrateRowRecords(transaction.objectStore(ROWS_STORE));
  await promisifyIDBRequest(
    clientStateStore.put(SYNC_PROTOCOL_VERSION_V2, SYNC_PROTOCOL_VERSION),
  );
}

export async function migrate_v3(db: IDBDatabase): Promise<void> {
  const transaction = db.transaction(
    [CLIENT_STATE_STORE, OPERATIONS_STORE],
    "readwrite",
  );
  const clientStateStore = transaction.objectStore(CLIENT_STATE_STORE);
  const currentVersion = await promisifyIDBRequest(
    clientStateStore.get(SYNC_PROTOCOL_VERSION),
  );

  if (currentVersion !== undefined && currentVersion >= SYNC_PROTOCOL_VERSION_CURRENT) {
    return;
  }

  await migrateOperationRecordsToProtocolV3(transaction.objectStore(OPERATIONS_STORE));
  await promisifyIDBRequest(
    clientStateStore.put(SYNC_PROTOCOL_VERSION_CURRENT, SYNC_PROTOCOL_VERSION),
  );
}

async function getCurrentProtocolVersion(db: IDBDatabase): Promise<number | undefined> {
  const transaction = db.transaction([CLIENT_STATE_STORE], "readonly");
  return await promisifyIDBRequest(
    transaction.objectStore(CLIENT_STATE_STORE).get(SYNC_PROTOCOL_VERSION),
  );
}

function migrateOperationToProtocolV2(
  operation: CRDTOperation | LegacyCRDTOperation | ProtocolV2SetOperation,
): CRDTOperation | ProtocolV2SetOperation {
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

async function migrateOperationRecordsToProtocolV3(store: IDBObjectStore): Promise<void> {
  assert(store.name === OPERATIONS_STORE);

  await updateCursorRecords<StoredOperationRecord>(store, (record) => {
    if (record.op.type !== "set" || !("tableName" in record.op)) {
      return record;
    }

    const fieldKey = record.op.fieldKey;
    assert(fieldKey, "Cannot migrate set operation without fieldKey");

    return {
      ...record,
      op: {
        type: "setRow",
        tableName: record.op.tableName,
        rowKey: record.op.rowKey,
        fields: { [fieldKey]: record.op.jsonValue },
        dot: record.op.dot,
      },
    };
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
