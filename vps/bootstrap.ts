#!/usr/bin/env -S npx tsx
import { $ } from "dax";
import {
  chdirFromImportMeta,
  compileLinuxBinary,
  requireVpsHost,
  runRemoteBinaryAndCleanup,
} from "./utils.ts";

chdirFromImportMeta(import.meta.url, "..");

const VPS_HOST = requireVpsHost("bootstrap");

await $`mkdir -p vps/dist`;
await compileLinuxBinary("vps/bootstrap-remote.ts", "vps/dist/bootstrap-remote");

await $`ssh ubuntu@${VPS_HOST} 'sudo mkdir -p /opt/bootstrap/vps'`;
await $`rsync -a --delete vps/ ubuntu@${VPS_HOST}:/tmp/bootstrap-vps/`;
await $`ssh ubuntu@${VPS_HOST} 'sudo rsync -a --delete /tmp/bootstrap-vps/ /opt/bootstrap/vps/'`;

await $`rsync vps/dist/bootstrap-remote ubuntu@${VPS_HOST}:/tmp/bootstrap-remote`;
await runRemoteBinaryAndCleanup({
  host: VPS_HOST,
  user: "ubuntu",
  remotePath: "/tmp/bootstrap-remote",
  sudo: true,
});
