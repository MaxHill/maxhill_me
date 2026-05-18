/**
 * Generic key-value settings service backed by the user_settings CRDT table.
 * Settings sync across devices automatically.
 */

import { Table } from "@maxhill/idb-distribute";
import { DBInterface } from "../../db";

export class UserSettingsService {
  table: Table;

  constructor(db: DBInterface) {
    this.table = db.table("user_settings");
  }

  async get<T>(key: string): Promise<T | undefined> {
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
