#!/usr/bin/env -S npx tsx
import { $ } from "dax";
import { chmod, rename, unlink, writeFile } from "node:fs/promises";

const releaseDir = process.argv[2];
if (!releaseDir) throw new Error("usage: deploy-remote <releaseDir>");

process.env.SOPS_AGE_KEY_FILE = "/etc/sops/key.txt";

await chmod(`${releaseDir}/alert-on-failure`, 0o755);
await $`ln -sfn ${releaseDir} /opt/alert-on-failure/current.tmp`;
await rename("/opt/alert-on-failure/current.tmp", "/opt/alert-on-failure/current");

const env = (
	await $`sops -d --input-type dotenv --output-type dotenv /tmp/alert-on-failure.prod.enc.env`.stdout("piped")
).stdout;
await writeFile("/etc/alert-on-failure/alert-on-failure.prod.env", env, { mode: 0o600 });
await $`chmod 600 /etc/alert-on-failure/alert-on-failure.prod.env`;
await unlink("/tmp/alert-on-failure.prod.enc.env");
