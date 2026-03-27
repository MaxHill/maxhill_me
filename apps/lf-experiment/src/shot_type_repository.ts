import { Table, CRDTDatabase } from "@maxhill/idb-distribute";

export type ShotType = {
    club: string,
    name: string,
    description: string,
}
export class ShotTypeRepository {
    table: Table;

    constructor(private db: CRDTDatabase) {
        this.table = this.db.table("shot_types");
    }

    async addShotType(shot_type: ShotType) {
        await this.table.setRow(crypto.randomUUID(), shot_type);
    }
}
