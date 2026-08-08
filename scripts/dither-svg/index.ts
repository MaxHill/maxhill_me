#!/usr/bin/env -S npx tsx
/**
 * dither-svg — process "Dither it!" SVG exports for the web.
 *
 * Pipeline per file:
 *   1. Strip every black <rect> (fill="#000000" / "#000").
 *   2. Compute bounding box of remaining white <rect>s.
 *   3. Rewrite the root <svg viewBox="..."> to that box.
 *   4. Run SVGO.
 *
 * Usage:
 *   tsx scripts/dither-svg/index.ts <inputDir> <outputDir>
 *   ./scripts/dither-svg/index.ts <inputDir> <outputDir>
 */

import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

// Matches a single <rect x="N" y="N" width="N" height="N" fill="#XXX"/>
// Dither it! output is uniform: attributes in this order, self-closing, no whitespace.
// We stay tolerant to attribute order and quote style.
const RECT_RE = /<rect\b([^>]*?)\/?>/g;

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
	fill: string;
}

function attr(attrs: string, name: string): string | undefined {
	const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
	return m?.[1];
}

function parseRect(attrs: string): Rect | null {
	const x = Number(attr(attrs, "x") ?? "0");
	const y = Number(attr(attrs, "y") ?? "0");
	const w = Number(attr(attrs, "width") ?? "0");
	const h = Number(attr(attrs, "height") ?? "0");
	const fill = (attr(attrs, "fill") ?? "").toLowerCase();
	if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
	return { x, y, w, h, fill };
}

function isBlack(fill: string): boolean {
	return fill === "#000000" || fill === "#000" || fill === "black";
}

function isWhite(fill: string): boolean {
	return fill === "#ffffff" || fill === "#fff" || fill === "white";
}

interface ProcessResult {
	svg: string;
	bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
	kept: number;
	dropped: number;
}

function processSvg(input: string): ProcessResult {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	let kept = 0;
	let dropped = 0;

	// Replace-scan: remove black rects, accumulate bounds from white rects.
	const stripped = input.replace(RECT_RE, (match, attrs: string) => {
		const r = parseRect(attrs);
		if (!r) return match;
		if (isBlack(r.fill)) {
			dropped++;
			return "";
		}
		if (isWhite(r.fill)) {
			kept++;
			if (r.x < minX) minX = r.x;
			if (r.y < minY) minY = r.y;
			if (r.x + r.w > maxX) maxX = r.x + r.w;
			if (r.y + r.h > maxY) maxY = r.y + r.h;
			// Drop the fill attribute so callers can set it via CSS.
			return match.replace(/\s+fill\s*=\s*"[^"]*"/, "");
		}
		// Non-black / non-white: leave alone, don't count toward bounds.
		return match;
	});

	if (!Number.isFinite(minX)) {
		return { svg: stripped, bounds: null, kept, dropped };
	}

	const bounds = { minX, minY, maxX, maxY };
	const w = maxX - minX;
	const h = maxY - minY;
	const newViewBox = `${minX} ${minY} ${w} ${h}`;

	// Rewrite (or inject) viewBox on the root <svg>, and drop width/height
	// and any fill so consumers control color via CSS (svg { fill: … }).
	const cropped = stripped.replace(/<svg\b([^>]*)>/, (m, attrs: string) => {
		let a: string = attrs;
		if (/\bviewBox\s*=/.test(a)) {
			a = a.replace(/\bviewBox\s*=\s*"[^"]*"/, `viewBox="${newViewBox}"`);
		} else {
			a = ` viewBox="${newViewBox}"` + a;
		}
		// Drop width/height so it scales freely, and drop any root fill.
		a = a.replace(/\s+(width|height|fill)\s*=\s*"[^"]*"/g, "");
		return `<svg${a}>`;
	});

	return { svg: cropped, bounds, kept, dropped };
}

function fmtBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function pad(s: string, n: number): string {
	return s.length >= n ? s : s + " ".repeat(n - s.length);
}

async function main() {
	const [, , inArg, outArg] = process.argv;
	if (!inArg || !outArg) {
		console.error("Usage: dither-svg <inputDir> <outputDir>");
		process.exit(1);
	}
	const inputDir = resolve(inArg);
	const outputDir = resolve(outArg);

	const s = await stat(inputDir).catch(() => null);
	if (!s?.isDirectory()) {
		console.error(`Input dir not found: ${inputDir}`);
		process.exit(1);
	}

	await mkdir(outputDir, { recursive: true });

	const entries = (await readdir(inputDir)).filter((f) => f.toLowerCase().endsWith(".svg")).sort();
	if (entries.length === 0) {
		console.error(`No .svg files in ${inputDir}`);
		process.exit(1);
	}

	let totalIn = 0;
	let totalOut = 0;
	const nameCol = Math.min(40, Math.max(...entries.map((e) => e.length)) + 2);

	for (const name of entries) {
		const inPath = join(inputDir, name);
		const outPath = join(outputDir, name);
		process.stdout.write(`${pad(name, nameCol)}reading... `);
		const raw = await readFile(inPath, "utf8");
		const inBytes = Buffer.byteLength(raw);

		process.stdout.write(`processing (${fmtBytes(inBytes)})... `);
		const { svg, bounds, kept, dropped } = processSvg(raw);
		if (!bounds) {
			console.warn(`skipped (no white artwork found)`);
			continue;
		}

		process.stdout.write(`writing... `);
		const finalSvg = svg;
		const outBytes = Buffer.byteLength(finalSvg);
		await writeFile(outPath, finalSvg);

		totalIn += inBytes;
		totalOut += outBytes;

		const pct = ((1 - outBytes / inBytes) * 100).toFixed(1);
		console.log(
			`done  ${fmtBytes(inBytes)} → ${fmtBytes(outBytes)} (-${pct}%)  kept ${kept}, dropped ${dropped}`,
		);
	}

	if (totalIn > 0) {
		const pct = ((1 - totalOut / totalIn) * 100).toFixed(1);
		console.log(`\nTotal: ${fmtBytes(totalIn)} → ${fmtBytes(totalOut)} (-${pct}%)`);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
