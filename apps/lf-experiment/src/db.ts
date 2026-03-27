import { CRDTDatabase, newDatabase } from "@maxhill/idb-distribute";

let db: CRDTDatabase<any>;

export async function get_DB(): Promise<CRDTDatabase> {
    if (db) return db;

    db = await newDatabase("user::testdb")
        .addTable("shot_types", {})
        .build()
        .open()

    return db;
}
