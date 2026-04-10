import { CRDTDatabase, newDatabase } from "@maxhill/idb-distribute";

export type DBInterface = CRDTDatabase<{
    shot_types: {},
    clubs: {},
    shot_log: {},
}>

// Store the DB instance and promise on window to ensure it's truly a singleton
declare global {
    interface Window {
        __appDB?: DBInterface;
        __appDBPromise?: Promise<DBInterface>;
    }
}

export async function get_DB(): Promise<DBInterface> {
    if (window.__appDB) return window.__appDB;
    if (window.__appDBPromise) return window.__appDBPromise;

    window.__appDBPromise = newDatabase("user::testdb")
        .addTable("shot_types", {})
        .addTable("clubs", {})
        .addTable("shot_log", {})
        .build()
        .open();

    const db = await window.__appDBPromise;
    window.__appDB = db;

    return db;
}
