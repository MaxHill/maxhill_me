Status: ready-for-agent

# Inject example discovery base path from config

## What to build

`get-component-examples.ts` resolves its base path via `import.meta.url.replace("file://", "")` combined with a relative `../../../../packages/components/src` traversal. This is brittle (breaks if monorepo layout changes) and untestable (no seam for injecting a fixture directory).

Refactor to accept the base path as a parameter with a default derived from Astro config or a project-level constant. This creates a seam where tests or alternative monorepo layouts can provide a different path.

## Acceptance criteria

- [ ] `getExamplesForComponent` accepts an optional `basePath` parameter (or reads from a shared config constant)
- [ ] The default still resolves to `packages/components/src` in the current monorepo layout
- [ ] Example discovery continues to work on all 15 component pages
- [ ] The path resolution no longer uses `import.meta.url.replace("file://", "")` gymnastics
- [ ] Build passes

## Blocked by

None - can start immediately
