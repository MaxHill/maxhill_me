import { Table } from "@maxhill/syncdb";

/**
 * KVWrapper wrapps a SyncDB table in a Key value
 * interface allowing get,set and remove actions.
 */
export class KVWrapper<T> {
  table: Table;
  constructor(table: Table) {
    this.table = table;
  }

  async get(key: string): Promise<T | undefined> {
    const row = await this.table.get(key);
    return row?.value as T | undefined;
  }
  async set(key: string, value: unknown): Promise<void> {
    await this.table.setRow(key, { value });
  }
  async remove(key: string): Promise<void> {
    await this.table.deleteRow(key);
  }
}
