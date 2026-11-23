import { $ } from "dax";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SSH_OPTS = [
	"-o BatchMode=yes",
	"-o ConnectTimeout=10",
	"-o ServerAliveInterval=5",
	"-o ServerAliveCountMax=3",
].join(" ");
export const SSH_TRANSPORT = `ssh ${SSH_OPTS}`;

export function chdirFromImportMeta(importMetaUrl: string, relativeToScript: string): void {
	assert(importMetaUrl.startsWith("file:"), "Script URL must be a file URL");
	assert(relativeToScript.length > 0, "Working-directory path must not be empty");
	const scriptDir = dirname(fileURLToPath(importMetaUrl));
	process.chdir(resolve(scriptDir, relativeToScript));
}

export function requireVpsHost(taskName: string): string {
	const host = process.env.VPS_HOST;
	if (!host) {
		throw new Error(`VPS_HOST not set (run via mise run ${taskName})`);
	}
	assert(taskName.length > 0, "Task name must not be empty");
	assert(!/\s/.test(host), "VPS_HOST must not contain whitespace");
	return host;
}

export async function gitShortSha(): Promise<string> {
	const sha = (await $`git rev-parse --short HEAD`.stdout("piped")).stdout.trim();
	assert(sha.length >= 4, "Git short SHA must contain at least four digits");
	assert(/^[a-f0-9]+$/.test(sha), "Git short SHA must be hexadecimal");
	return sha;
}

export async function withCwd<T>(dir: string, callback: () => Promise<T>): Promise<T> {
	assert(dir.length > 0, "Working-directory path must not be empty");
	const previous = process.cwd();
	process.chdir(dir);
	try {
		return await callback();
	} finally {
		process.chdir(previous);
		assert(process.cwd() === previous, "Working directory must be restored");
	}
}

export async function compileLinuxBinary(input: string, output: string): Promise<void> {
	assert(input.length > 0 && output.length > 0, "Build paths must not be empty");
	assert(resolve(input) !== resolve(output), "Binary output must not overwrite its source");
	await $`bun build --compile --target=bun-linux-x64 ${input} --outfile ${output}`;
}

export async function runRemoteBinaryAndCleanup(parameters: {
	host: string;
	remotePath: string;
	remoteArguments?: string[];
	user?: string;
	useSshOptions?: boolean;
	sudo?: boolean;
}): Promise<void> {
	const {
		host,
		remotePath,
		remoteArguments = [],
		user = "deploy",
		useSshOptions = false,
		sudo = false,
	} = parameters;

	assert(/^[a-zA-Z0-9_.@:-]+$/.test(host), "Remote host must be a single SSH destination");
	assert(!host.startsWith("-"), "Remote host must not be an SSH option");
	assert(remotePath.startsWith("/"), "Remote runner path must be absolute");
	assert(
		[user, remotePath, ...remoteArguments].every((value) => /^[a-zA-Z0-9_./:-]+$/.test(value)),
		"Remote command values must be nonempty shell-safe tokens",
	);
	const argumentSuffix = remoteArguments.length ? ` ${remoteArguments.join(" ")}` : "";
	const runCmd = `${sudo ? "sudo " : ""}${remotePath}${argumentSuffix}`;
	const remoteCommand =
		`${sudo ? "sudo " : ""}chmod +x ${remotePath} && ${runCmd} && rm -f ${remotePath}`;

	if (useSshOptions) {
		const sshOptions = SSH_OPTS.split(" ");
		await $`ssh ${sshOptions} ${user}@${host} ${remoteCommand}`;
		return;
	}
	await $`ssh ${user}@${host} ${remoteCommand}`;
}
