#!/usr/bin/env -S npx tsx
import { $ } from "dax";
import {
	chdirFromImportMeta,
	compileLinuxBinary,
	requireVpsHost,
	runRemoteBinaryAndCleanup,
} from "../utils.ts";

chdirFromImportMeta(import.meta.url, "../..");

const VPS_HOST = requireVpsHost("deploy:litestream");

const remoteRunnerPath = "/tmp/litestream-deploy-remote";

await $`mkdir -p vps/litestream/dist`;
await compileLinuxBinary("vps/litestream/deploy-remote.ts", "vps/litestream/dist/deploy-remote");

await $`rsync --inplace vps/litestream/litestream.yml deploy@${VPS_HOST}:/etc/litestream.yml`;
await $`rsync vps/litestream/litestream.prod.enc.env deploy@${VPS_HOST}:/tmp/litestream.prod.enc.env`;
await $`rsync vps/litestream/dist/deploy-remote deploy@${VPS_HOST}:${remoteRunnerPath}`;
await runRemoteBinaryAndCleanup({
	host: VPS_HOST,
	remotePath: remoteRunnerPath,
});

console.log("litestream deployed");
