#!/usr/bin/env -S npx tsx
import { $ } from "dax";
import { readFile } from "node:fs/promises";
import {
	SSH_TRANSPORT,
	chdirFromImportMeta,
	compileLinuxBinary,
	gitShortSha,
	requireVpsHost,
	runRemoteBinaryAndCleanup,
	withCwd,
} from "../utils.ts";

chdirFromImportMeta(import.meta.url, "../..");

const VPS_HOST = requireVpsHost("deploy:golf");

for (const line of (await readFile("vps/golf/golf.build.env", "utf8")).split(/\r?\n/)) {
	const trimmed = line.trim();
	if (!trimmed || trimmed.startsWith("#")) continue;
	const eq = trimmed.indexOf("=");
	if (eq <= 0) continue;
	const key = trimmed.slice(0, eq).trim();
	const value = trimmed.slice(eq + 1).trim();
	process.env[key] = value;
}

const sha = await gitShortSha();
const releaseDir = `/opt/golf/releases/${sha}`;
const remoteRunnerPath = "/tmp/golf-deploy-remote";

await $`mkdir -p vps/golf/dist`;
await compileLinuxBinary("vps/golf/deploy-remote.ts", "vps/golf/dist/deploy-remote");

await withCwd("apps/golf", async () => {
	await $`pnpm exec vite build`;
});

await $`ssh -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=3 deploy@${VPS_HOST} ${`mkdir -p ${releaseDir}`}`;
await $`rsync -a --delete -e ${SSH_TRANSPORT} apps/golf/dist/ deploy@${VPS_HOST}:${releaseDir}/`;
await $`rsync -e ${SSH_TRANSPORT} vps/golf/dist/deploy-remote deploy@${VPS_HOST}:${remoteRunnerPath}`;
await runRemoteBinaryAndCleanup({
	host: VPS_HOST,
	remotePath: remoteRunnerPath,
	args: [releaseDir],
	useSshOptions: true,
});

console.log(`golf deployed at ${sha}`);
