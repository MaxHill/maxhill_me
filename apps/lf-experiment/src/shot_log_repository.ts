import { SubscriptionCallbackHandler, Table } from "@maxhill/idb-distribute";
import { DBInterface } from "./db";

export type ShotLog = {
    id: string;
    createdAt: Date;
    sessionId?: string;

    carry: number;
    total?: number;

    club: {
        id: string;
        name: string;
    };

    shotType: {
        id: string;
        name: string;
    };

};

export class ShotLogRepository {
    table: Table;

    constructor(private db: DBInterface) {
        this.table = this.db.table("clubs");
    }

    async addShotLog(shot_type: ShotLog): Promise<void> {
        await this.table.setRow(crypto.randomUUID(), shot_type);
    }

    subscribe(handler: SubscriptionCallbackHandler): () => void {
        return this.table.subscribe(handler);
    }
}
