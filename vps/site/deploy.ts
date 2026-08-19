#!/usr/bin/env -S npx tsx
import { $ } from "dax";
import {
	chdirFromImportMeta,
	compileLinuxBinary,
	gitShortSha,
	requireVpsHost,
	runRemoteBinaryAndCleanup,
	withCwd,
} from "../utils.ts";

chdirFromImportMeta(import.meta.url, "../..");

const VPS_HOST = requireVpsHost("deploy:site");

const sha = await gitShortSha();
const releaseDir = `/opt/site/releases/${sha}`;
const remoteRunnerPath = "/tmp/site-deploy-remote";

await $`mkdir -p vps/site/dist`;
await compileLinuxBinary("vps/site/deploy-remote.ts", "vps/site/dist/deploy-remote");

await withCwd("apps/site", async () => {
	await $`pnpm exec astro build`;
});
await $`ssh deploy@${VPS_HOST} ${`mkdir -p ${releaseDir}`}`;
await $`rsync -a --delete apps/site/dist/ deploy@${VPS_HOST}:${releaseDir}/`;
await $`rsync vps/site/dist/deploy-remote deploy@${VPS_HOST}:${remoteRunnerPath}`;
await runRemoteBinaryAndCleanup({
	host: VPS_HOST,
	remotePath: remoteRunnerPath,
	args: [releaseDir],
});

console.log(`site deployed at ${sha}`);
