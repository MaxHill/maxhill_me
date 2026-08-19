import { $ } from "dax";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SSH_OPTS = "-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=3";
export const SSH_TRANSPORT = `ssh ${SSH_OPTS}`;

export function chdirFromImportMeta(importMetaUrl: string, relativeToScript: string): void {
	const scriptDir = dirname(fileURLToPath(importMetaUrl));
	process.chdir(resolve(scriptDir, relativeToScript));
}

export function requireVpsHost(taskName: string): string {
	const host = process.env.VPS_HOST;
	if (!host) {
		throw new Error(`VPS_HOST not set (run via mise run ${taskName})`);
	}
	return host;
}

export async function gitShortSha(): Promise<string> {
	return (await $`git rev-parse --short HEAD`.stdout("piped")).stdout.trim();
}

export async function withCwd<T>(dir: string, fn: () => Promise<T>): Promise<T> {
	const prev = process.cwd();
	process.chdir(dir);
	try {
		return await fn();
	} finally {
		process.chdir(prev);
	}
}

export async function compileLinuxBinary(input: string, output: string): Promise<void> {
	await $`bun build --compile --target=bun-linux-x64 ${input} --outfile ${output}`;
}

export async function runRemoteBinaryAndCleanup(params: {
	host: string;
	remotePath: string;
	args?: string[];
	user?: string;
	useSshOptions?: boolean;
	sudo?: boolean;
}): Promise<void> {
	const {
		host,
		remotePath,
		args = [],
		user = "deploy",
		useSshOptions = false,
		sudo = false,
	} = params;

	const runCmd = `${sudo ? "sudo " : ""}${remotePath}${args.length ? ` ${args.join(" ")}` : ""}`;
	const remoteCommand = `${sudo ? "sudo " : ""}chmod +x ${remotePath} && ${runCmd} && rm -f ${remotePath}`;

	if (useSshOptions) {
		await $`ssh -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=3 ${user}@${host} ${remoteCommand}`;
		return;
	}
	await $`ssh ${user}@${host} ${remoteCommand}`;
}
