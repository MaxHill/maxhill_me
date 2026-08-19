#!/usr/bin/env -S npx tsx
import { $ } from "dax";
import { chmod, rename, unlink, writeFile } from "node:fs/promises";

const releaseDir = process.argv[2];
if (!releaseDir) throw new Error("usage: deploy-remote <releaseDir>");

process.env.SOPS_AGE_KEY_FILE = "/etc/sops/key.txt";

await chmod(`${releaseDir}/auth-exe`, 0o755);
await $`ln -sfn ${releaseDir} /opt/auth/current.tmp`;
await rename("/opt/auth/current.tmp", "/opt/auth/current");

const env = (await $`sops -d --input-type dotenv --output-type dotenv /tmp/auth.prod.enc.env`.stdout("piped")).stdout;
await writeFile("/etc/auth/auth.prod.env", env, { mode: 0o600 });
await $`chmod 600 /etc/auth/auth.prod.env`;
await unlink("/tmp/auth.prod.enc.env");

await $`sudo /bin/systemctl restart auth.service`;
await $`sleep 1`;

const active = (await $`systemctl is-active --quiet auth.service`.noThrow()).code === 0;
if (!active) {
	await $`journalctl -u auth.service -n 20 --no-pager`.noThrow();
	throw new Error("auth.service failed to start");
}
