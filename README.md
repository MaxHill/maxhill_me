# maxhill.me

Monorepo for Max Hill's personal website and services.

## Workspace Structure

- `apps/site` - Astro static site (deployed to Cloudflare Pages)
- `apps/auth` - OpenAuth authentication service (deployed to Cloudflare
  Workers)
- `packages/components` - Web components library
- `packages/css` - CSS design system

## Development

### Prerequisites

- Node.js 20+
- pnpm 10.19.0 (managed via `packageManager` field)

### Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start all apps in dev mode
pnpm build            # Build all packages and apps
pnpm check            # Type check all workspaces
pnpm lint             # Lint all workspaces
pnpm test             # Test all workspaces
```

### Running Individual Apps

```bash
# Site
cd apps/site
pnpm dev              # http://localhost:4321

# Auth
cd apps/auth
pnpm dev              # http://localhost:3001
```

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
3. Lint (ESLint for packages, astro check for site)
4. Test (web-test-runner)

### Deployments

On push to `main` (after CI passes):

1. **Auth app** → Cloudflare Workers
2. **Site app** → Cloudflare Pages

Both deployments run in parallel.

### GitHub Secrets Setup

Required secrets (add via GitHub repo Settings → Secrets and variables →
Actions):

#### 1. `CLOUDFLARE_API_TOKEN`

**How to create:**

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Use "Edit Cloudflare Workers" template
4. Add permissions:
   - Account → Cloudflare Pages → Edit
   - Account → Workers Scripts → Edit
5. Continue to summary → Create Token
6. Copy the token (shown only once)
7. Add to GitHub: Settings → Secrets → New repository secret
   - Name: `CLOUDFLARE_API_TOKEN`
   - Secret: [paste token]

#### 2. `CLOUDFLARE_ACCOUNT_ID`

**How to find:**

1. Go to https://dash.cloudflare.com/
2. Copy Account ID from right sidebar
3. Or run: `pnpm wrangler whoami` (shows Account ID)
4. Add to GitHub: Settings → Secrets → New repository secret
   - Name: `CLOUDFLARE_ACCOUNT_ID`
   - Secret: [paste account ID]

### Migrating from Cloudflare Pages Dashboard

The site is currently deployed via Cloudflare Pages dashboard Git
integration. After GitHub Actions is set up, you need to disconnect the old
deployment:

**Migration Steps:**

- [ ] Complete GitHub Actions setup (add secrets, merge workflow)
- [ ] Verify first GitHub Actions deployment succeeds
- [ ] Go to Cloudflare dashboard → Pages → maxhill-me project
- [ ] Navigate to Settings → Builds & deployments
- [ ] Under "Production branch", click "Disconnect" (or "Remove Git
      integration")
- [ ] Confirm disconnection
- [ ] Verify subsequent pushes to `main` only trigger GitHub Actions (not
      Cloudflare dashboard builds)

**Note:** Disconnecting Git integration does NOT delete your Pages project
or existing deployments. It only stops automatic deployments from
Cloudflare's side. GitHub Actions will continue deploying to the same
project.

**Rollback:** If needed, you can reconnect the Git integration in
Cloudflare dashboard settings.

### Local Testing Before Push

Test CI checks locally before pushing:

```bash
pnpm build     # Should complete without errors
pnpm check     # Should show no type errors
pnpm lint      # Should show no linting errors
pnpm test      # Should show all tests passing
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

**Build fails with "turbo: command not found":**

- Ensure `turbo` is in devDependencies in root package.json
- Run `pnpm install` to install dependencies

**Lint fails with "astro: command not found":**

- Ensure `astro` is in devDependencies in apps/site/package.json
- Ensure site has a `lint` script defined

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
