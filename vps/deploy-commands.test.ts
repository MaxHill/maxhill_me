import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const apps = ["syncdb-server", "alert-on-failure", "auth", "litestream"];

async function checkSopsCommand(app: string, directory: string): Promise<void> {
	assert(apps.includes(app));
	const source = await readFile(new URL(`./${app}/deploy-remote.ts`, import.meta.url), "utf8");
	const commands = [...source.matchAll(/\$`(sops[^`]+)`/gu)];
	assert(commands.length === 1, `${app}: expected exactly one SOPS command`);
	const command = commands[0][1];
	// Only this inert command may enter the generated module, never the remote runner.
	const allowed = "^sops -d --input-type dotenv --output-type dotenv" +
		`[\\s\\\\]+/tmp/${app}\\.prod\\.enc\\.env$`;
	assert.match(command, new RegExp(allowed, "u"));
	const modulePath = join(directory, `${app}.mjs`);
	const cwd = JSON.stringify(directory);
	await writeFile(modulePath,
		`import { $ } from ${JSON.stringify(import.meta.resolve("dax"))};\n` +
		`export default await $\`${command}\`.env("PATH", ${cwd})` +
		`.cwd(${cwd}).stdout("piped");\n`);
	const result = (await import(pathToFileURL(modulePath).href)).default;
	assert.equal(result.code, 0);
	assert.equal(result.stdout, "-d\n--input-type\ndotenv\n--output-type\ndotenv\n" +
		`/tmp/${app}.prod.enc.env\nTEST_SECRET=stub-only\n`);
	assert.equal(await readFile(join(directory, "calls"), "utf8"), "called\n");
	await rm(join(directory, "calls"));
}

const directory = await mkdtemp(join(tmpdir(), "deploy-commands-"));
try {
	// Shell builtins only: no real SOPS, encrypted file, network, or remote effects.
	await writeFile(join(directory, "sops"), '#!/bin/sh\nprintf "called\\n" >> calls\n' +
		'printf "%s\\n" "$@"\nprintf "TEST_SECRET=stub-only\\n"\n', { mode: 0o700 });
	for (const app of apps) {
		await checkSopsCommand(app, directory);
	}
} finally {
	await rm(directory, { recursive: true, force: true });
}
console.log("Deployment SOPS commands passed.");
