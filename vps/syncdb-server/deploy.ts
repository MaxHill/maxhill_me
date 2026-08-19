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

const VPS_HOST = requireVpsHost("deploy:sync");

const sha = await gitShortSha();
const releaseDir = `/opt/syncdb-server/releases/${sha}`;
const image = "sync-builder:ocaml-5.2";
const remoteRunnerPath = "/tmp/syncdb-server-deploy-remote";

await $`mkdir -p vps/syncdb-server/dist`;
await compileLinuxBinary("vps/syncdb-server/deploy-remote.ts", "vps/syncdb-server/dist/deploy-remote");

const imageExists = (await $`docker image inspect ${image}`.noThrow()).code === 0;
if (!imageExists) {
	await $`docker build --platform linux/amd64 -t ${image} -f vps/syncdb-server/Dockerfile.builder .`;
}

await $`docker run --rm --platform linux/amd64 -v ${`${process.cwd()}:/src`} -v maxhill-sync-opam-cache:/home/opam/.opam -w /src/apps/syncdb-server ${image} bash -lc ${`
set -euo pipefail
opam install . --deps-only -y
opam exec -- dune build ./bin/main.exe --profile release
`}`;

await $`ssh deploy@${VPS_HOST} ${`mkdir -p ${releaseDir}`}`;
await $`rsync apps/syncdb-server/_build/default/bin/main.exe deploy@${VPS_HOST}:${releaseDir}/syncdb-server-exe`;
await $`rsync vps/syncdb-server/syncdb-server.prod.enc.env deploy@${VPS_HOST}:/tmp/syncdb-server.prod.enc.env`;
await $`rsync vps/syncdb-server/dist/deploy-remote deploy@${VPS_HOST}:${remoteRunnerPath}`;
await runRemoteBinaryAndCleanup({
	host: VPS_HOST,
	remotePath: remoteRunnerPath,
	args: [releaseDir],
});

console.log(`syncdb-server deployed at ${sha}`);
