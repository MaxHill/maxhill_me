# maxhill.me

Monorepo for Max Hill's personal website and services.

## Workspace Structure

- `apps/site` - Astro static site (deployed to Cloudflare Pages)
- `apps/auth` - OpenAuth authentication service (deployed to Cloudflare
  Workers)
- `packages/components` - Web components library
- `packages/css` - CSS design system
- `packages/oxlint-config` - Shared Oxlint config

## Development

### Prerequisites

- Node.js 20+
- pnpm 10.19.0 (managed via `packageManager` field)

### Commands

```bash
pnpm install                # Install dependencies
mise run dev:all            # Start every workspace project in dev mode (mprocs)
mise run generate           # Code-gen via plop
```

Every app and package exposes the same four canonical mise tasks
(see [O(1) build file](https://matklad.github.io/2023/12/31/O(1)-build-file.html)):

```bash
cd <apps|packages>/<name>
mise run run     # start the local built-from-source copy
mise run test    # bounded automated checks
mise run fuzz    # unbounded checks (no-op where n/a)
mise run deploy  # publish (or produce the artifact, for libraries)
```

### Running Individual Apps

```bash
cd apps/site && mise run run     # Astro dev server
cd apps/auth && mise run run     # Bun --watch
```

## Roadmap (Current Priority Order)

1. Implement and use Server-Sent Events (SSE) for updates in
   `apps/syncdb-server/`.
2. Inject errors in `apps/syncdb-server/bin/simulator.ml`:
   - Deliver out of order
   - Corrupt request
   - Corrupt response
3. Implement compaction in `packages/idb-distribute/` and
   `apps/syncdb-server/`.
4. Write usage examples for `packages/idb-distribute/`.
5. Create a `user` app and integrate it with `apps/auth/`.
6. Define and build an admin/system-status surface (VPS health, user
   management, and related admin workflows).
7. Write an integration script that runs all tests and checks all packages
   before merging to `main`, to keep the full system green.

## CI/CD Pipeline

### Overview

The project uses GitHub Actions for continuous integration and deployment:

- **CI Checks** run on all branches and pull requests
- **Deployments** run only on push to `main` branch after CI passes
- All checks must pass before deployment proceeds

### CI Checks

On every push and PR, the following checks run:

1. Build all packages and apps
2. Type check (TypeScript)
3. Lint (Oxlint for JS/TS, astro check for site)
4. Test (web-test-runner)

### Deployments

On push to `main` (after CI passes):

1. **Auth app** → Cloudflare Workers
2. **Site app** → Cloudflare Pages

Both deployments run in parallel.

### Local Testing Before Push

Test locally before pushing:

```bash
for d in apps/*/ packages/*/; do (cd "$d" && mise run test) || exit 1; done
```

Test deployments locally (requires Cloudflare credentials):

```bash
# Auth deployment test
cd apps/auth
pnpm wrangler deploy --dry-run

# Site deployment test
cd apps/site
pnpm wrangler pages deploy dist --project-name=maxhill-me --dry-run
```

### Deployment Verification

After deployment:

1. **Auth service:** https://maxhill-auth.[your-workers-domain].workers.dev
2. **Site:** https://maxhill-me.pages.dev (or custom domain)

Check deployment status:

- GitHub Actions: Repository → Actions tab
- Cloudflare Workers: https://dash.cloudflare.com/ → Workers & Pages →
  maxhill_auth
- Cloudflare Pages: https://dash.cloudflare.com/ → Workers & Pages →
  maxhill-me

### Troubleshooting

**Lint fails with "astro: command not found":**

- Ensure `astro` is in devDependencies in apps/site/package.json
- Run `pnpm install` so root `oxlint` is available to workspace `mise run test`

**Deployment fails with "Unauthorized":**

- Verify `CLOUDFLARE_API_TOKEN` is set correctly in GitHub secrets
- Verify token has correct permissions (Workers Scripts Edit, Pages Edit)
- Check token hasn't expired

**Deployment fails with "Account ID not found":**

- Verify `CLOUDFLARE_ACCOUNT_ID` is set correctly in GitHub secrets
- Ensure there are no extra spaces or characters in the secret value

**Site deployment fails with "Project not found":**

- Verify project name is exactly `maxhill-me` (matches Cloudflare Pages
  project)
- Check the project exists in Cloudflare dashboard

## Component Development TODOs

- [ ] listbox skip attribute does not feel great as an api
- [ ] m-option maybe should emit clicked event?
- [ ] m-input submit using enter
- [ ] m-input: Error text not populating in test - possible timing issue
      with m-invalid event listener registration vs validation
- [ ] m-input: Implement internals.ariaInvalid setting for accessibility
      (currently null)
- [ ] Listbox label and error state like input
