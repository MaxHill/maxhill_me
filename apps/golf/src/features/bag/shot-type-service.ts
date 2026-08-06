import { Table, type SubscriptionCallbackHandler } from "@maxhill/syncdb";
import { DBInterface } from "../../db";

export type ShotType = {
    _key?: string; // This will be automatically managed by syncdb
    name: string,
    description: string,
}

export class ShotTypeService {
    table: Table;

    constructor(private db: DBInterface) {
        this.table = this.db.table("shot_types");
    }

    async addShotType(shot_type: ShotType): Promise<void> {
        await this.table.setRow(crypto.randomUUID(), shot_type);
    }

    subscribe(handler: SubscriptionCallbackHandler): () => void {
        return this.table.subscribe(handler);
    }
}
