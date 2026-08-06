/**
 * Generic key-value settings service backed by the user_settings CRDT table.
 * Settings sync across devices automatically.
 */

import { Table } from "@maxhill/syncdb";
import { DBInterface } from "../../db";

const DB_OWNER_USER_ID_KEY = "db_owner_user_id";

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

  /**
   * Returns the authenticated user ID that currently owns the local DB.
   * Returns `null` when no authenticated owner has been claimed.
   */
  async getDatabaseOwnerUserID(): Promise<string | null> {
    const owner = await this.get<string>(DB_OWNER_USER_ID_KEY);
    return typeof owner === "string" && owner.length > 0 ? owner : null;
  }

  /**
   * Persists local DB ownership for an authenticated user.
   */
  async setDatabaseOwnerUserID(userID: string | null): Promise<void> {
    if (userID === null) {
      await this.remove(DB_OWNER_USER_ID_KEY);
      return;
    }
    await this.set(DB_OWNER_USER_ID_KEY, userID);
  }
}
