import { SubscriptionCallbackHandler, Table } from "@maxhill/idb-distribute";
import { DBInterface } from "../../db";
import { ShotType } from "./shot-type-service";

export type Club = {
    name: string;
    type: "wedge" | "iron" | "hybrid" | "wood" | "driver";
    shotTypes: ShotType[];  // embedded allowed shot types
};


export class ClubRepository {
    table: Table;

    constructor(private db: DBInterface) {
        this.table = this.db.table("clubs");
    }

    async addClub(club: Club): Promise<void> {
        await this.table.setRow(crypto.randomUUID(), club);
    }

    subscribe(handler: SubscriptionCallbackHandler): () => void {
        return this.table.subscribe(handler);
    }
}
