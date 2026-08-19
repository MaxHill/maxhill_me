#!/usr/bin/env -S npx tsx
const unit = process.argv[2];
if (!unit) {
	console.error("usage: alert-on-failure <unit>");
	process.exit(1);
}

const host = process.env.HOSTNAME || "unknown-host";
const when = new Date().toISOString();

const resendApiKey = process.env.RESEND_API_KEY;
const from = process.env.ALERT_EMAIL_FROM;
const to = process.env.ALERT_EMAIL_TO;

if (!resendApiKey) throw new Error("RESEND_API_KEY not set");
if (!from) throw new Error("ALERT_EMAIL_FROM not set");
if (!to) throw new Error("ALERT_EMAIL_TO not set");

const res = await fetch("https://api.resend.com/emails", {
	method: "POST",
	headers: {
		Authorization: `Bearer ${resendApiKey}`,
		"Content-Type": "application/json",
	},
	body: JSON.stringify({
		from,
		to: [to],
		subject: `[${host}] ${unit} failed`,
		text: `systemd unit ${unit} entered a failed state on ${host} at ${when}.`,
	}),
});

if (!res.ok) {
	const body = await res.text().catch(() => "");
	throw new Error(`Resend request failed: ${res.status} ${res.statusText} ${body}`);
}
