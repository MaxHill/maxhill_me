# lf-experiment

Pure Go static site generator using esbuild's native Go API - no Node.js subprocess calls. Inspired by TigerBeetle's minimal tooling philosophy.

**Stack:** Go + esbuild Go API + Air hot-reload

## Quick Start

```bash
# Development (with hot reload)
pnpm dev --filter=lf-experiment

# Production build
pnpm build --filter=lf-experiment

# Clean build artifacts
pnpm clean --filter=lf-experiment
```

**Dev server:** http://localhost:8090 (Air proxy with live reload)  
**Direct server:** http://localhost:8080 (Go HTTP server, no proxy)

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
2. esbuild's `LoaderText` returns CSS as string
3. Component creates stylesheet: `new CSSStyleSheet().replaceSync(styles)`
4. Attaches to Shadow DOM: `shadowRoot.adoptedStyleSheets = [stylesheet]`

This pattern works without any special configuration - esbuild's `LoaderText` naturally handles the `?inline` query.

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

**Total:** ~140ms
- Go compilation: 100ms
- JS bundling: 15ms
- CSS bundling: 6ms
- Font copying: <1ms
- HTML generation: 5ms

**Bundle sizes:**
- `dist/js/main.js`: 98KB (minified)
- `dist/css/style.css`: 70KB (minified)
- Fonts: 80KB total (woff2)

## Next Steps

### Optimizations
- [ ] **esbuild Context API** for incremental rebuilds (~5-10x faster)
  ```go
  ctx, _ := api.Context(buildOptions)
  result := ctx.Rebuild() // Only changed files
  defer ctx.Dispose()
  ```
  Consider when rebuilds exceed 100ms

### Features
- [ ] Multiple pages (currently single-page)
- [ ] Markdown content support
- [ ] Static asset copying (images, etc.)
- [ ] Build-time syntax highlighting

### Production
- [ ] Bundle analysis (esbuild metafile)
- [ ] Compression (gzip/brotli)
- [ ] Cache headers
- [ ] Deploy to Cloudflare Pages

## Theme System

The design system requires `data-theme="light"` or `data-theme="dark"` on `<html>`:

```html
<html lang="en" data-theme="light">
```

Without this attribute, CSS custom properties (colors, spacing, etc.) won't resolve correctly.
