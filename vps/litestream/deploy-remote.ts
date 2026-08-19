#!/usr/bin/env -S npx tsx
import { $ } from "dax";
import { unlink, writeFile } from "node:fs/promises";

process.env.SOPS_AGE_KEY_FILE = "/etc/sops/key.txt";

const env = (await $`sops -d --input-type dotenv --output-type dotenv /tmp/litestream.prod.enc.env`.stdout("piped")).stdout;
if (!env.split(/\r?\n/).some((line) => line.startsWith("R2_SECRET_KEY="))) {
	throw new Error("missing R2_SECRET_KEY in litestream.prod.enc.env");
}

await writeFile("/etc/litestream/litestream.prod.env", env, { mode: 0o600 });
await $`chmod 600 /etc/litestream/litestream.prod.env`;
await unlink("/tmp/litestream.prod.enc.env");

await $`sudo /bin/systemctl enable litestream.service`;
await $`sudo /bin/systemctl restart litestream.service`;
const active = (await $`sudo /bin/systemctl is-active --quiet litestream.service`.noThrow()).code === 0;
if (!active) {
	await $`sudo journalctl -u litestream.service -n 20 --no-pager`.noThrow();
	throw new Error("litestream.service failed to start");
}
