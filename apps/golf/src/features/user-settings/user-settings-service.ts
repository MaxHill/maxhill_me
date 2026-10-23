/**
 * Generic key-value settings service backed by the user_settings CRDT table.
 * Settings sync across devices automatically.
 */

import { DBInterface } from "../../db";
import { KVWrapper } from "../../utils";

const DB_OWNER_USER_ID_KEY = "db_owner_user_id";

export class UserSettingsService {
  kv: KVWrapper<string>;

  constructor(db: DBInterface) {
    const table = db.table("user_settings");
    this.kv = new KVWrapper(table);
  }

  /**
   * Returns the authenticated user ID that currently owns the local DB.
   * Returns `null` when no authenticated owner has been claimed.
   */
  async getDatabaseOwnerUserID(): Promise<string | null> {
    const owner = await this.kv.get(DB_OWNER_USER_ID_KEY);
    return typeof owner === "string" && owner.length > 0 ? owner : null;
  }

  /**
   * Persists local DB ownership for an authenticated user.
   */
  async setDatabaseOwnerUserID(userID: string | null): Promise<void> {
    if (userID === null) {
      await this.kv.remove(DB_OWNER_USER_ID_KEY);
      return;
    }
    await this.kv.set(DB_OWNER_USER_ID_KEY, userID);
  }
}
