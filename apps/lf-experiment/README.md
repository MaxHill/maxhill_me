# lf-experiment

Pure Go static site generator using esbuild's native Go API - no Node.js subprocess calls. Inspired by TigerBeetle's minimal tooling philosophy.

**Stack:** Go + esbuild Go API + Air hot-reload

## Quick Start

```bash
# First time setup: Build the Go binary
pnpm run build:binary --filter=lf-experiment

# Development (with hot reload)
pnpm dev --filter=lf-experiment

# Production build
pnpm build --filter=lf-experiment

# Clean build artifacts
pnpm clean --filter=lf-experiment
```

**Dev server:** http://localhost:8090 (Air proxy with live reload)  
**Direct server:** http://localhost:8080 (Go HTTP server, no proxy)

### How Development Mode Works

**Fast Workflow (20ms rebuilds):**
1. Build Go binary **once**: `pnpm run build:binary` → creates `build/main` (16 MB, includes esbuild)
2. Run Turbo dev: `pnpm dev --filter=lf-experiment`
   - Turbo builds workspace dependencies first (`@maxhill/components`, `@maxhill/css`)
   - Then starts Air with the pre-built binary
3. Edit files: Air watches `.html`, `.ts`, `.css` files in `lf-experiment` and `node_modules/@maxhill/*/dist`
4. On change: Air **restarts** the binary (no recompilation!) → esbuild rebuilds in ~20ms

**Workspace Package Development:**

To develop workspace packages (`@maxhill/components`, `@maxhill/css`) alongside lf-experiment:

**Option 1: Separate terminals (recommended for active component development)**
```bash
# Terminal 1: Watch @maxhill/components
pnpm dev --filter=@maxhill/components

# Terminal 2: Watch @maxhill/css  
pnpm dev --filter=@maxhill/css

# Terminal 3: Watch lf-experiment
pnpm dev --filter=lf-experiment
```
Air will detect changes in `node_modules/@maxhill/*/dist` and trigger rebuilds.

**Option 2: Single dev command (for lf-experiment-focused development)**
```bash
# Just run lf-experiment - uses pre-built workspace packages
pnpm dev --filter=lf-experiment
```
If you edit workspace packages, manually rebuild them:
```bash
pnpm build --filter=@maxhill/components --filter=@maxhill/css
```

**When to rebuild the Go binary:**
- After changing Go source code in `build/` directory
- After pulling new changes that modify `build/`
- Run: `pnpm run build:binary`

**Why this is fast:**
- Air doesn't rebuild Go (~100ms saved per change)
- Only esbuild runs (~20ms per asset change)
- Go binary handles all bundling via esbuild's Go API
- Air follows symlinks to watch workspace package outputs

## Architecture

### Three-phase build system:

1. **JavaScript bundling** (`src/main.ts` → `dist/js/main.js`)
   - Bundles TypeScript + workspace packages (`@maxhill/components`, `@maxhill/css`)
   - Uses `LoaderText` for `.css` files (enables Shadow DOM inline styles)
   - Minification + source maps in production

2. **CSS bundling** (`src/main.css` → `dist/css/style.css`)
   - Bundles global design system styles
   - Uses `LoaderCSS` for standard CSS processing
   - Externals: `/fonts/*` (fonts copied separately)

3. **Font copying** (`apps/site/public/fonts/optimized` → `dist/fonts/optimized`)
   - Copies 8 optimized web fonts (IBM Plex Mono + Departure Mono)
   - Supports woff2/woff formats

### Why separate JS/CSS builds?

Different loader requirements:
- **Shadow DOM components** need CSS as text strings (`?inline` imports)
- **Global styles** need standard CSS processing
- Separate builds = cleaner config, no complex plugins

### How Shadow DOM styling works:

1. Component imports CSS: `import styles from "./index.css?inline"`
2. esbuild's `LoaderText` returns CSS as string (note: `?inline` query is stripped by esbuild, all `.css` imports become strings in JS build)
3. Component creates stylesheet: `new CSSStyleSheet().replaceSync(styles)`
4. Attaches to Shadow DOM: `shadowRoot.adoptedStyleSheets = [stylesheet]`

**Important:** The `?inline` suffix is just documentation - esbuild strips query parameters during resolution. Our global `LoaderText` for `.css` files achieves the same result.

## Workspace Integration

Works seamlessly with pnpm workspaces:
- No import maps needed (everything bundled)
- Hot reload watches workspace dependencies
- Turbo caches builds across packages

```bash
# Rebuild on @maxhill/components changes
pnpm turbo build --filter=lf-experiment
```

## Build Performance

**Development (per asset change):** ~20ms
- JS bundling: ~15ms (via esbuild Go API)
- CSS bundling: ~5-10ms
- Font copying: <1ms
- HTML generation: ~5ms

**Production build (full):** ~140ms
- Go compilation: 100ms (one-time)
- JS bundling: 15ms
- CSS bundling: 6ms
- Font copying: <1ms
- HTML generation: 5ms

**Bundle sizes (uncompressed / compressed):**
- `dist/js/main.js`: 6.4 KB / **~2 KB** (brotli estimate) - single component (m-card)
- `dist/css/style.css`: 70 KB / **8 KB** (brotli)
- Fonts: 80 KB (woff2)
- **Total over-the-wire: ~90 KB** (10 KB compressed JS+CSS + 80 KB fonts)

**Note:** Using selective imports (`import '@maxhill/components/m-card'`) instead of `register-all` reduces JS bundle by 93% (98 KB → 6.4 KB). Only import components you actually use!

## Project Structure

```
apps/lf-experiment/
├── build/
│   ├── main              # Pre-built Go binary (16 MB, gitignored)
│   ├── main.go           # Entry point, orchestrates build
│   └── tasks/            # Build task implementations
│       ├── assets.go     # esbuild JS/CSS bundling + fonts
│       └── pages.go      # HTML template processing
├── src/
│   ├── main.ts           # JS entry (imports web components)
│   └── main.css          # CSS entry (imports design system)
├── templates/
│   └── base.html         # Base HTML template
├── pages/
│   └── index.html        # Page content
├── dist/                 # Generated (gitignored)
│   ├── js/main.js        # 6.4 KB bundled JS (selective imports)
│   ├── css/style.css     # 70 KB bundled CSS
│   ├── fonts/optimized/  # 80 KB web fonts
│   └── index.html        # Generated page
├── .air.toml             # Air hot reload config
├── go.mod                # Go dependencies (includes esbuild)
└── package.json          # Build scripts
```

## Next Steps

### Bundle Size Optimization
- [x] **Selective component imports** - ✅ Implemented! Bundle reduced from 98 KB → 6.4 KB (93% reduction)
  - Using `import '@maxhill/components/m-card'` instead of `register-all`
  - Only bundles what's actually used on the page
  - Add more components as needed with additional imports

### Features
- [ ] Multiple pages (currently single-page)
- [ ] Markdown content support
- [ ] Static asset copying (images, etc.)
- [ ] Build-time syntax highlighting

### Production
- [ ] Bundle analysis (esbuild metafile)
- [ ] Serve with compression (gzip/brotli) - 77% size reduction
- [ ] Cache headers
- [ ] Deploy to Cloudflare Pages

## Theme System

The design system requires `data-theme="light"` or `data-theme="dark"` on `<html>`:

```html
<html lang="en" data-theme="light">
```

Without this attribute, CSS custom properties (colors, spacing, etc.) won't resolve correctly.
