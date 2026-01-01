import "fake-indexeddb/auto";
import { type DBSchema, type IDBPDatabase } from "idb";
import { describe, expect, it, beforeEach } from "vitest";
import { openAppDb, type InternalDbSchema } from "./db";
import { proxyIdb } from "./proxies";
import { WAL } from "./wal";



describe("Proxy db", () => {

    let db: IDBPDatabase<ClientDbSchema & InternalDbSchema>;
    let wal: WAL;

    beforeEach(async () => {
        const dbName = `proxiesTest-${Math.random().toString(36).slice(2)}`;
        const client = await newClient(dbName);
        db = client.db as unknown as any;
        wal = client.wal;
    });


    it("put", async () => {
        await db.put("posts", { id: "1", content: "Post data" });

        let count = await db.count("posts");
        expect(count).toEqual(1);

        const tx = db.transaction("_wal");
        count = (await wal.getEntries(0, (tx as unknown as any))).length;
        expect(count).toEqual(1);
        await tx.done;
    });

    it("delete", async () => {
        await db.put("posts", { id: "1", content: "Post data" });
        await db.delete("posts", "1");

        let count = await db.count("posts");
        expect(count).toEqual(0);

        const tx = db.transaction("_wal");
        count = (await wal.getEntries(0, (tx as unknown as any))).length;
        expect(count).toEqual(2);
        await tx.done;
    });

    it("add rejects", async () => {
        await expect(db.add("posts", { id: "1", content: "Post data" })).rejects
            .toThrow()
    });

    it("clear works", async () => {
        await db.put("posts", { id: "1", content: "test" });
        expect(await db.count("posts")).toBe(1);

        await db.clear("posts");
        expect(await db.count("posts")).toBe(0);
    });

    describe("transaction", () => {
        it("put", async () => {
            const tx = db.transaction("posts", "readwrite")
            await tx.store.put({ id: "1", content: "Post data" });

            const store = tx.objectStore("posts")
            await store.put({ id: "2", content: "Post data 2" });
            await tx.done;

            let count = await db.count("posts");
            expect(count).toEqual(2);

            const txWal = db.transaction("_wal");
            count = (await wal.getEntries(0, (txWal as unknown as any))).length;
            expect(count).toEqual(2);
            await txWal.done;
        });

        it("delete", async () => {
            await db.put("posts", { id: "1", content: "Post data" });
            await db.put("posts", { id: "2", content: "Post data 2" });

            const tx = db.transaction("posts", "readwrite")
            await tx.store.delete("1");

            const store = tx.objectStore("posts")
            await store.delete("2");
            await tx.done;

            let count = await db.count("posts");
            expect(count).toEqual(0);

            const txWal = db.transaction("_wal");
            count = (await wal.getEntries(0, (txWal as unknown as any))).length;
            expect(count).toEqual(4);
            await txWal.done;
        });

        it("add rejects", async () => {
            const tx = db.transaction("posts", "readwrite")

            await expect(tx.store.add({ id: "1", content: "Post data" })).rejects.toThrow()

            const store = tx.objectStore("posts")
            await expect(store.add({ id: "1", content: "Post data" })).rejects.toThrow()

            await tx.done;
        });

        it("clear works", async () => {
            // Add some data first
            await db.put("posts", { id: "1", content: "test1" });
            await db.put("posts", { id: "2", content: "test2" });
            expect(await db.count("posts")).toBe(2);

            const tx = db.transaction("posts", "readwrite")
            await tx.store.clear();

            const store = tx.objectStore("posts")
            await store.clear();

            await tx.done;

            expect(await db.count("posts")).toBe(0);
        });

        describe("openCursor", () => {

            it("update", async () => {
                await db.put("posts", { id: "1", content: "Post data" });

                const tx = db.transaction("posts", "readwrite")
                let storeCursor = await tx.store.openCursor()
                while (storeCursor) {
                    const returnedId = await storeCursor.update({ ...storeCursor.value })
                    expect(returnedId).toEqual("1")
                    storeCursor = await storeCursor.continue();
                }


                const store = tx.objectStore("posts")
                let objectStoreCursor = await store.openCursor()
                while (objectStoreCursor) {
                    const returnedId = await objectStoreCursor.update({ ...objectStoreCursor.value })
                    expect(returnedId).toEqual("1")
                    objectStoreCursor = await objectStoreCursor.continue();
                }
                await tx.done;

                const count = await db.count("posts")
                expect(count).toEqual(1)

                const walCount = await db.count("_wal")
                expect(walCount).toEqual(3)
            });

            it("delete", async () => {
                await db.put("posts", { id: "1", content: "Post data" });
                const tx = db.transaction("posts", "readwrite")

                let storeCursor = await tx.store.openCursor()
                while (storeCursor) {
                    await storeCursor.delete();
                    storeCursor = await storeCursor.continue();
                }


                const store = tx.objectStore("posts")
                let objectStoreCursor = await store.openCursor()
                while (objectStoreCursor) {
                    await objectStoreCursor.delete();
                    objectStoreCursor = await objectStoreCursor.continue();
                }
                await tx.done;

                const count = await db.count("posts")
                expect(count).toEqual(0)

                const walCount = await db.count("_wal")
                expect(walCount).toEqual(3)
            });
        })

        describe("openKeyCursor", () => {
            it("delete", async () => {
                await db.put("posts", { id: "1", content: "Post data" });
                const tx = db.transaction("posts", "readwrite")

                let storeCursor = await tx.store.openKeyCursor()
                while (storeCursor) {
                    await storeCursor.delete();
                    storeCursor = await storeCursor.continue();
                }


                const store = tx.objectStore("posts")
                let objectStoreCursor = await store.openKeyCursor()
                while (objectStoreCursor) {
                    await objectStoreCursor.delete();
                    objectStoreCursor = await objectStoreCursor.continue();
                }
                await tx.done;

                const count = await db.count("posts")
                expect(count).toEqual(0)

                const walCount = await db.count("_wal")
                expect(walCount).toEqual(3)
            });
        })

        describe("index", () => {
            describe("openCursor", () => {
                it("update", async () => {
                    await db.put("posts", { id: "1", content: "Post data" });
                    const tx = db.transaction("posts", "readwrite")

                    let storeIndex = tx.store.index("content")
                    let storeCursor = await storeIndex.openCursor()
                    while (storeCursor) {
                        const returnedId = await storeCursor.update({ ...storeCursor.value })
                        expect(returnedId).toEqual("1")

                        storeCursor = await storeCursor.continue();
                    }

                    const store = tx.objectStore("posts")
                    let objectStoreIndex = store.index("content")
                    let objectStoreCursor = await objectStoreIndex.openCursor()
                    while (objectStoreCursor) {
                        const returnedId = await objectStoreCursor.update({ ...objectStoreCursor.value })
                        expect(returnedId).toEqual("1")
                        objectStoreCursor = await objectStoreCursor.continue();
                    }
                    await tx.done;

                    const count = await db.count("posts")
                    expect(count).toEqual(1)

                    const walCount = await db.count("_wal")
                    expect(walCount).toEqual(3)
                });

                it("delete", async () => {
                    await db.put("posts", { id: "1", content: "Post data" });
                    const tx = db.transaction("posts", "readwrite")

                    let storeIndex = tx.store.index("content")
                    let storeCursor = await storeIndex.openCursor()
                    while (storeCursor) {
                        await storeCursor.delete();
                        storeCursor = await storeCursor.continue();
                    }


                    const store = tx.objectStore("posts")
                    let objectStoreIndex = store.index("content")
                    let objectStoreCursor = await objectStoreIndex.openCursor()
                    while (objectStoreCursor) {
                        await objectStoreCursor.delete();
                        objectStoreCursor = await objectStoreCursor.continue();
                    }
                    await tx.done;

                    const count = await db.count("posts")
                    expect(count).toEqual(0)

                    const walCount = await db.count("_wal")
                    expect(walCount).toEqual(3)
                });
            })

            describe("openKeyCursor", () => {
                it("delete", async () => {
                    await db.put("posts", { id: "1", content: "Post data" });
                    const tx = db.transaction("posts", "readwrite")

                    let storeIndex = tx.store.index("content")
                    let storeCursor = await storeIndex.openKeyCursor()
                    while (storeCursor) {
                        await storeCursor.delete();
                        storeCursor = await storeCursor.continue();
                    }


                    const store = tx.objectStore("posts")
                    let objectStoreIndex = store.index("content")
                    let objectStoreCursor = await objectStoreIndex.openKeyCursor()
                    while (objectStoreCursor) {
                        await objectStoreCursor.delete();
                        objectStoreCursor = await objectStoreCursor.continue();
                    }
                    await tx.done;

                    const count = await db.count("posts")
                    expect(count).toEqual(0)

                    const walCount = await db.count("_wal")
                    expect(walCount).toEqual(3)
                });
            })
        })
    })

})



export type Post = { id: string; content: string };

export interface ClientDbSchema extends DBSchema {
    posts: {
        key: string;
        value: Post;
        indexes: {
            "content": string
        }
    };
}

async function newClient(dbName: string) {
    const db = await openAppDb<ClientDbSchema>(dbName, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains('posts')) {
                let store = db.createObjectStore('posts', { keyPath: 'id' });
                store.createIndex("content", "content");
            }
        }
    });
    const wal = new WAL()

    return { db: proxyIdb<ClientDbSchema>(db, wal), wal }
}
