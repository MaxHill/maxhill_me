#!/usr/bin/env -S npx tsx
import { $ } from "dax";
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

const VPS_HOST = requireVpsHost("deploy:auth");

const sha = await gitShortSha();
const releaseDir = `/opt/auth/releases/${sha}`;
const remoteRunnerPath = "/tmp/auth-deploy-remote";

await $`mkdir -p vps/auth/dist`;
await compileLinuxBinary("vps/auth/deploy-remote.ts", "vps/auth/dist/deploy-remote");

console.log("building");
await withCwd("apps/auth", async () => {
	await $`bun build --compile --target=bun-linux-x64 ./src/index.ts --outfile=./dist/auth-exe`;
});

console.log("deploying");
await $`ssh -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=3 deploy@${VPS_HOST} ${`mkdir -p ${releaseDir}`}`;
await $`rsync -avP --stats --timeout=30 -e ${SSH_TRANSPORT} apps/auth/dist/auth-exe deploy@${VPS_HOST}:${releaseDir}/auth-exe`;
await $`rsync -avP --stats --timeout=30 -e ${SSH_TRANSPORT} vps/auth/auth.prod.enc.env deploy@${VPS_HOST}:/tmp/auth.prod.enc.env`;
await $`rsync -avP --stats --timeout=30 -e ${SSH_TRANSPORT} vps/auth/dist/deploy-remote deploy@${VPS_HOST}:${remoteRunnerPath}`;

console.log("releasing");
await runRemoteBinaryAndCleanup({
	host: VPS_HOST,
	remotePath: remoteRunnerPath,
	args: [releaseDir],
	useSshOptions: true,
});

console.log(`auth deployed at ${sha}`);
