#!/usr/bin/env -S npx tsx
import { $ } from "dax";
import {
	chdirFromImportMeta,
	compileLinuxBinary,
	gitShortSha,
	requireVpsHost,
	runRemoteBinaryAndCleanup,
} from "../utils.ts";

chdirFromImportMeta(import.meta.url, "../..");

const VPS_HOST = requireVpsHost("deploy:alert-on-failure");

const sha = await gitShortSha();
const releaseDir = `/opt/alert-on-failure/releases/${sha}`;
const remoteRunnerPath = "/tmp/alert-on-failure-deploy-remote";

await $`mkdir -p vps/alert-on-failure/dist`;
await compileLinuxBinary("vps/alert-on-failure/alert-on-failure.ts", "vps/alert-on-failure/dist/alert-on-failure");
await compileLinuxBinary("vps/alert-on-failure/deploy-remote.ts", "vps/alert-on-failure/dist/deploy-remote");

await $`ssh deploy@${VPS_HOST} ${`mkdir -p ${releaseDir}`}`;
await $`rsync vps/alert-on-failure/dist/alert-on-failure deploy@${VPS_HOST}:${releaseDir}/alert-on-failure`;
await $`rsync vps/alert-on-failure/alert-on-failure.prod.enc.env deploy@${VPS_HOST}:/tmp/alert-on-failure.prod.enc.env`;
await $`rsync vps/alert-on-failure/dist/deploy-remote deploy@${VPS_HOST}:${remoteRunnerPath}`;
await runRemoteBinaryAndCleanup({
	host: VPS_HOST,
	remotePath: remoteRunnerPath,
	args: [releaseDir],
});

console.log(`alert-on-failure deployed at ${sha}`);
