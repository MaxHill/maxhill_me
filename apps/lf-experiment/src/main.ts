import { registerAll } from "@maxhill/components/register-all";
import { CRDTDatabase } from "@maxhill/idb-distribute";
registerAll();

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
  const count = await db.get("count", "example");

  render(count?.counted_value || -1);
  console.log("Count: ", count);

  const incrementButton = document.getElementById("increment");
  incrementButton?.addEventListener("click", async (_) => {
    const count = await db.get("count", "example");
    await db.setRow("count", "example", { counted_value: count?.counted_value + 1 || 1 });
    render(count?.counted_value + 1 || 1);
  });

  setInterval(async () => {
    await db.sync();
    const count = await db.get("count", "example");
    render(count?.counted_value || 1);
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
