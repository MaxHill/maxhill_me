import { registerAll } from "@maxhill/components/register-all";
import { CRDTDatabase } from "@maxhill/idb-distribute";
registerAll();

export class Counter {
    private db: CRDTDatabase;
    constructor(db: CRDTDatabase) {
        this.db = db;
    }

    async getCount(): Promise<number> {
        const count = await this.db.get("count", "example");
        console.log("getCount", count);
        if (count && count.counted_value && count.counted_value > 0) {
            return count.counted_value;
        }
        return 0;
    }

    async increment(): Promise<number> {
        const count = await this.getCount();
        const new_count = count + 1;
        console.log(count, new_count);
        await this.setCount(new_count);

        return new_count;
    }

    async decrement(): Promise<number> {
        const count = await this.getCount();
        const new_count = count - 1;
        await this.setCount(new_count);

        return new_count;
    }

    private async setCount(new_count: number) {
        await this.db.setRow("count", "example", { counted_value: new_count });
    }
}

async function main() {
    const db = new CRDTDatabase("user::testdb", [
        {
            table: "count",
            name: "byCount",
            keys: ["example"],
        },
        {
            table: "count",
            name: "byUser2",
            keys: ["user"],
        },
    ], "http://localhost:3001/sync");
    await db.open();
    const counter = new Counter(db);

    const count = await counter.getCount();
    render(count);

    const incrementButton = document.getElementById("increment");
    incrementButton?.addEventListener("click", async (_) => {
        const count = await counter.increment();
        render(count);
    });

    const decrementButton = document.getElementById("decrement");
    decrementButton?.addEventListener("click", async (_) => {
        const count = await counter.decrement();
        render(count);
    });


    setInterval(async () => {
        await db.sync();
        const count = await counter.getCount();
        render(count);
    }, 10_000);
}

function render(count: number) {
    const valueElement = document.getElementById("value");
    if (valueElement) {
        valueElement.textContent = String(count);
    }
}

// Entry point for client-side scripts and web components
console.log("Hello from lf-experiment!");

main();
