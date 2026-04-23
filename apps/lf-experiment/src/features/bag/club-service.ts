import { SubscriptionCallbackHandler, Table } from "@maxhill/idb-distribute";
import { DBInterface } from "../../db";
import { ShotType } from "./shot-type-service";

export type ClubTypes = "putter" | "wedge" | "iron" | "hybrid" | "wood" | "driver";
export type Club = {
    _key?: string; // This will be automatically managed by idb-distribute
    name: string;
    clubType: ClubTypes,
    shotTypes: ShotType[];  // embedded allowed shot types
    // Optional specs
    brand?: string,
    model?: string,
    loft?: string,
    lie?: string
};


export class ClubService {
    table: Table;

    constructor(private db: DBInterface) {
        this.table = this.db.table("clubs");
    }

    async setClub(key: string, club: Club): Promise<void> {
        await this.table.setRow(key, club);
    }

    subscribe(handler: SubscriptionCallbackHandler): () => void {
        return this.table.subscribe(handler);
    }
}
