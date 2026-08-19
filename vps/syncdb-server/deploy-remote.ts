#!/usr/bin/env -S npx tsx
import { $ } from "dax";
import { chmod, rename, unlink, writeFile } from "node:fs/promises";

const releaseDir = process.argv[2];
if (!releaseDir) throw new Error("usage: deploy-remote <releaseDir>");

process.env.SOPS_AGE_KEY_FILE = "/etc/sops/key.txt";

await chmod(`${releaseDir}/syncdb-server-exe`, 0o755);
await $`ln -sfn ${releaseDir} /opt/syncdb-server/current.tmp`;
await rename("/opt/syncdb-server/current.tmp", "/opt/syncdb-server/current");

const env = (
	await $`sops -d --input-type dotenv --output-type dotenv /tmp/syncdb-server.prod.enc.env`.stdout("piped")
).stdout;
await writeFile("/etc/syncdb-server/syncdb-server.prod.env", env, { mode: 0o600 });
await $`chmod 600 /etc/syncdb-server/syncdb-server.prod.env`;
await unlink("/tmp/syncdb-server.prod.enc.env");

await $`sudo /bin/systemctl restart syncdb-server.service`;
await $`sleep 1`;

const active = (await $`systemctl is-active --quiet syncdb-server.service`.noThrow()).code === 0;
if (!active) {
	await $`sudo /bin/systemctl status syncdb-server.service --no-pager -l`.noThrow();
	await $`sudo /bin/journalctl -u syncdb-server.service -n 40 --no-pager`.noThrow();
	throw new Error("syncdb-server.service failed to start");
}
