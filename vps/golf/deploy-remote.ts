#!/usr/bin/env -S npx tsx
import { $ } from "dax";
import { rename } from "node:fs/promises";

const releaseDir = process.argv[2];
if (!releaseDir) throw new Error("usage: deploy-remote <releaseDir>");

await $`ln -sfn ${releaseDir} /opt/golf/current.tmp`;
await rename("/opt/golf/current.tmp", "/opt/golf/current");
