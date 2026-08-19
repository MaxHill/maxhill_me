#!/usr/bin/env -S npx tsx
import { $ } from "dax";
import { access, writeFile } from "node:fs/promises";

const V = "/opt/bootstrap/vps";
process.env.SOPS_AGE_KEY_FILE = "/etc/sops/key.txt";

const LITESTREAM_VERSION = "0.5.14";
const SOPS_VERSION = "3.9.4";
const archMap: Record<string, string> = {
  amd64: "x86_64",
  arm64: "arm64",
};

//  ------------------------------------------------------------------------
//  Utils
//  ------------------------------------------------------------------------
async function commandExists(command: string): Promise<boolean> {
  const result = await $`which ${command}`.stdout("null").stderr("null").noThrow();
  return result.code === 0;
}

async function dpkgArchitecture(): Promise<string> {
  const result = await $`dpkg --print-architecture`.stdout("piped");
  return result.stdout.trim();
}

async function mktempDebPath(): Promise<string> {
  const result = await $`mktemp --suffix=.deb`.stdout("piped");
  return result.stdout.trim();
}

async function downloadToPath(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText} (${url})`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeFile(destination, bytes);
}

//  ------------------------------------------------------------------------
//  Litestream
//  ------------------------------------------------------------------------
async function installedLitestreamVersion(): Promise<string | null> {
  const result = await $`litestream version`.stdout("piped").noThrow();
  if (result.code !== 0) return null;
  const match = result.stdout.match(/\b\d+\.\d+\.\d+\b/);
  return match?.[0] ?? null;
}

async function ensureLitestream() {
  const installedVersion = await installedLitestreamVersion();
  if (installedVersion === LITESTREAM_VERSION) return;

  if (!(await commandExists("litestream")) || installedVersion !== LITESTREAM_VERSION) {
    const arch = await dpkgArchitecture();
    const litestreamArch = archMap[arch];
    if (!litestreamArch) {
      throw new Error(`Unsupported arch for litestream: ${arch}`);
    }

    const tmpDeb = await mktempDebPath();
    const url =
      `https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-${litestreamArch}.deb`;
    try {
      await downloadToPath(url, tmpDeb);
      await $`dpkg -i ${tmpDeb}`;
      await $`apt-get install -f -y`;
    } finally {
      await $`rm -f ${tmpDeb}`;
    }
  }
}

//  ------------------------------------------------------------------------
//  SOPS
//  ------------------------------------------------------------------------
async function installedSopsVersion(): Promise<string | null> {
  const result = await $`sops --version`.stdout("piped").noThrow();
  if (result.code !== 0) return null;
  const match = result.stdout.match(/\b\d+\.\d+\.\d+\b/);
  return match?.[0] ?? null;
}

async function ensureSops() {
  const installedVersion = await installedSopsVersion();
  if (installedVersion === SOPS_VERSION) return;

  if (!(await commandExists("sops")) || installedVersion !== SOPS_VERSION) {
    const arch = await dpkgArchitecture();
    const url =
      `https://github.com/getsops/sops/releases/download/v${SOPS_VERSION}/sops-v${SOPS_VERSION}.linux.${arch}`;
    await downloadToPath(url, "/usr/local/bin/sops");
    await $`chmod +x /usr/local/bin/sops`;
  }
}

await $`apt-get update`;
await $`apt-get install -y sqlite3 caddy age jq ufw ca-certificates`;
await ensureLitestream();
await ensureSops();

if ((await $`id deploy`.noThrow()).code !== 0) {
  await $`useradd -m -s /bin/bash deploy`;
}
if ((await $`getent group sops-readers`.noThrow()).code !== 0) {
  await $`groupadd -r sops-readers`;
}
await $`usermod -aG sops-readers deploy`;

await $`install -d -o deploy -g deploy -m 700 /home/deploy/.ssh`;
await $`install -o deploy -g deploy -m 600 /home/ubuntu/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys`;

await $`install -m 644 ${`${V}/sshd-hardening.conf`} /etc/ssh/sshd_config.d/10-maxhill.conf`;
await $`sshd -t`;
await $`systemctl reload ssh`;

await $`ufw default deny incoming`;
await $`ufw allow 22/tcp`;
await $`ufw allow 80/tcp`;
await $`ufw allow 443/tcp`;
await $`ufw --force enable`;

await $`mkdir -p /etc/sops`;
let hasSopsKey = true;
try {
  await access("/etc/sops/key.txt");
} catch {
  hasSopsKey = false;
}
if (!hasSopsKey) {
  await $`age-keygen -o /etc/sops/key.txt`;
}
await $`chown root:sops-readers /etc/sops/key.txt`;
await $`chmod 640 /etc/sops/key.txt`;
await $`chmod 755 /etc/sops`;

await $`install -m 644 ${`${V}/Caddyfile`} /etc/caddy/Caddyfile`;
await $`install -d -m 700 -o deploy -g deploy /etc/litestream`;
await $`install -m 644 ${`${V}/litestream/litestream.yml`} /etc/litestream.yml`;
await $`chown deploy:deploy /etc/litestream.yml`;
await $`mkdir -p /etc/systemd/journald.conf.d`;
await $`install -m 644 ${`${V}/journald-retention.conf`} /etc/systemd/journald.conf.d/retention.conf`;
await $`install -m 440 ${`${V}/sudoers.deploy`} /etc/sudoers.d/deploy`;
await $`visudo -c -f /etc/sudoers.d/deploy`;

await $`mkdir -p /etc/caddy/sites`;
await $`install -m 644 ${`${V}/syncdb-server/syncdb-server.service`} /etc/systemd/system/syncdb-server.service`;
await $`install -m 644 ${`${V}/syncdb-server/sync.caddy`} /etc/caddy/sites/sync.caddy`;

await $`install -m 644 ${`${V}/auth/auth.service`} /etc/systemd/system/auth.service`;
await $`install -m 644 ${`${V}/auth/auth-sweep.service`} /etc/systemd/system/auth-sweep.service`;

await $`install -m 644 ${`${V}/auth/auth-sweep.timer`} /etc/systemd/system/auth-sweep.timer`;
await $`install -m 644 ${`${V}/auth/auth.caddy`} /etc/caddy/sites/auth.caddy`;

await $`install -m 644 ${`${V}/site/site.caddy`} /etc/caddy/sites/site.caddy`;

await $`install -m 644 ${`${V}/golf/golf.caddy`} /etc/caddy/sites/golf.caddy`;

await $`install -m 644 ${`${V}/alert-on-failure/alert-on-failure@.service`} /etc/systemd/system/alert-on-failure@.service`;
await $`install -D -m 644 ${`${V}/litestream/litestream.override.service`} /etc/systemd/system/litestream.service.d/override.conf`;

for (const app of ["syncdb-server", "auth", "site", "golf", "alert-on-failure"]) {
  await $`mkdir -p /opt/${app} /etc/${app}`;
  await $`chown deploy:deploy /opt/${app} /etc/${app}`;
  await $`chmod 700 /etc/${app}`;
}

await $`systemctl daemon-reload`;
await $`systemctl enable --now caddy`;
await $`systemctl reload caddy`;
await $`systemctl enable syncdb-server.service auth.service`;
await $`systemctl enable --now auth-sweep.timer`;
await $`systemctl restart systemd-journald`;

console.log("\nVPS public age key (add to .sops.yaml recipients):");
await $`age-keygen -y /etc/sops/key.txt`;
