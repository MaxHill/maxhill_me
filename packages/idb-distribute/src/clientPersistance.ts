import { CRDTOperation, ORMapRow, ValidKey } from "./crdt";

export interface ClientPersistance {
  open(): Promise<IDBDatabase>;
  close(): Promise<void>;

  saveRow(tableName: string, rowKey: ValidKey, row: ORMapRow): Promise<void>;
  getRow(tableName: string, rowKey: ValidKey): Promise<ORMapRow>;
  logOperation(op: CRDTOperation): Promise<void>;

  getClientState(): Promise<unknown>;
  saveClientId(): Promise<void>;
  // Logical clock
  getVersion(): Promise<number>;
  setVersion(version: number): Promise<number>;
}

export class IDBPersistance implements ClientPersistance {
  open(): Promise<IDBDatabase> {
    throw new Error("Method not implemented.");
  }
  close(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  saveRow(tableName: string, rowKey: ValidKey, row: ORMapRow): Promise<void> {
    throw new Error("Method not implemented.");
  }
  getRow(tableName: string, rowKey: ValidKey): Promise<ORMapRow> {
    throw new Error("Method not implemented.");
  }
  logOperation(op: CRDTOperation): Promise<void> {
    throw new Error("Method not implemented.");
  }
  getClientState(): Promise<unknown> {
    throw new Error("Method not implemented.");
  }
  saveClientId(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  getVersion(): Promise<number> {
    throw new Error("Method not implemented.");
  }
  setVersion(version: number): Promise<number> {
    throw new Error("Method not implemented.");
  }
}
