#!/usr/bin/env -S npx tsx
/**
 * dither-svg — process "Dither it!" SVG exports for the web.
 *
 * Pipeline per file:
 *   1. Strip every black <rect>.
 *   2. Merge adjacent white rects into path segments.
 *   3. Compute bounding box of the white artwork.
 *   4. Rewrite the root <svg viewBox="..."> to that box.
 *
 * Usage:
 *   tsx scripts/dither-svg/index.ts <inputDir> [outputDir]
 *   ./scripts/dither-svg/index.ts <inputDir> [outputDir]
 *
 * If outputDir is omitted, the script walks up from inputDir and writes to the
 * nearest ancestor app's public/ directory.
 */

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const RECT_RE = /<rect\b([^>]*?)\/?>/g;

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
	fill: string;
}

interface Bounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

interface ProcessResult {
	svg: string;
	bounds: Bounds | null;
	kept: number;
	dropped: number;
	merged: number;
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

function sortRects(a: Rect, b: Rect): number {
	return a.y - b.y || a.x - b.x || a.h - b.h || a.w - b.w;
}

function mergeRects(rects: Rect[]): Rect[] {
	const merged: Rect[] = [];
	for (const rect of [...rects].sort(sortRects)) {
		const prev = merged.at(-1);
		if (prev && prev.y === rect.y && prev.h === rect.h && prev.x + prev.w === rect.x) {
			prev.w += rect.w;
			continue;
		}
		merged.push({ ...rect });
	}
	return merged;
}

function getBounds(rects: Rect[]): Bounds | null {
	if (rects.length === 0) return null;
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const rect of rects) {
		if (rect.x < minX) minX = rect.x;
		if (rect.y < minY) minY = rect.y;
		if (rect.x + rect.w > maxX) maxX = rect.x + rect.w;
		if (rect.y + rect.h > maxY) maxY = rect.y + rect.h;
	}
	return { minX, minY, maxX, maxY };
}

function rectsToPath(rects: Rect[]): string {
	return rects.map((rect) => `M${rect.x} ${rect.y}h${rect.w}v${rect.h}h-${rect.w}z`).join("");
}

function updateRootSvg(input: string, viewBox: string): string {
	return input.replace(/<svg\b([^>]*)>/, (_match, attrs: string) => {
		let next = attrs;
		if (/\bviewBox\s*=/.test(next)) {
			next = next.replace(/\bviewBox\s*=\s*"[^"]*"/, `viewBox="${viewBox}"`);
		} else {
			next = ` viewBox="${viewBox}"${next}`;
		}
		next = next.replace(/\s+(width|height|fill)\s*=\s*"[^"]*"/g, "");
		return `<svg${next}>`;
	});
}

function replaceSvgChildren(svg: string, children: string): string {
	return svg.replace(/(<svg\b[^>]*>)([\s\S]*?)(<\/svg>)/, `$1${children}$3`);
}

function processSvg(input: string): ProcessResult {
	const whiteRects: Rect[] = [];
	let kept = 0;
	let dropped = 0;

	const nonBlackRectsRemoved = input.replace(RECT_RE, (match, attrs: string) => {
		const rect = parseRect(attrs);
		if (!rect) return match;
		if (isBlack(rect.fill)) {
			dropped++;
			return "";
		}
		if (isWhite(rect.fill)) {
			kept++;
			whiteRects.push(rect);
			return "";
		}
		return match;
	});

	const mergedRects = mergeRects(whiteRects);
	const bounds = getBounds(whiteRects);
	if (!bounds) {
		return { svg: nonBlackRectsRemoved, bounds: null, kept, dropped, merged: 0 };
	}

	const viewBox = `${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`;
	const path = `<path d="${rectsToPath(mergedRects)}"/>`;
	const withRoot = updateRootSvg(nonBlackRectsRemoved, viewBox);
	const svg = replaceSvgChildren(withRoot, path);
	return { svg, bounds, kept, dropped, merged: mergedRects.length };
}

function fmtBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function pad(s: string, n: number): string {
	return s.length >= n ? s : s + " ".repeat(n - s.length);
}

async function findNearestPublicDir(fromDir: string): Promise<string | null> {
	let current = resolve(fromDir);
	while (true) {
		const candidate = join(current, "public");
		const found = await stat(candidate).catch(() => null);
		if (found?.isDirectory()) return candidate;
		const parent = dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

async function resolveOutputDir(inputDir: string, outArg?: string): Promise<string> {
	if (outArg) return resolve(outArg);
	const publicDir = await findNearestPublicDir(inputDir);
	if (!publicDir) {
		throw new Error(`Could not find ancestor public/ directory for ${inputDir}`);
	}
	return publicDir;
}

async function main() {
	const [, , inArg, outArg] = process.argv;
	if (!inArg) {
		console.error("Usage: dither-svg <inputDir> [outputDir]");
		process.exit(1);
	}
	const inputDir = resolve(inArg);
	const outputDir = await resolveOutputDir(inputDir, outArg);

	const inputStat = await stat(inputDir).catch(() => null);
	if (!inputStat?.isDirectory()) {
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

	console.log(`input:  ${inputDir}`);
	console.log(`output: ${outputDir}\n`);

	for (const name of entries) {
		const inPath = join(inputDir, name);
		const outPath = join(outputDir, name);
		process.stdout.write(`${pad(name, nameCol)}reading... `);
		const raw = await readFile(inPath, "utf8");
		const inBytes = Buffer.byteLength(raw);

		process.stdout.write(`processing (${fmtBytes(inBytes)})... `);
		const { svg, bounds, kept, dropped, merged } = processSvg(raw);
		if (!bounds) {
			console.warn("skipped (no white artwork found)");
			continue;
		}

		process.stdout.write("writing... ");
		const outBytes = Buffer.byteLength(svg);
		await writeFile(outPath, svg);
		totalIn += inBytes;
		totalOut += outBytes;

		const pct = ((1 - outBytes / inBytes) * 100).toFixed(1);
		console.log(
			`done  ${fmtBytes(inBytes)} → ${fmtBytes(outBytes)} (-${pct}%)  kept ${kept}, merged ${merged}, dropped ${dropped}`,
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
