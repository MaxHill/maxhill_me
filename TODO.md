# CI/CD Implementation Plan

## Overview
Setting up unified GitHub Actions CI/CD pipeline for the maxhill_me monorepo with:
- Combined CI checks and deployment in a single workflow
- Turbo tasks for linting and testing
- Deployment to Cloudflare Workers (auth) and Cloudflare Pages (site)
- Deployment only runs when CI passes and only on main branch

---

## Implementation Steps

### 1. Update `turbo.json`
Add `lint` and `test` tasks to Turborepo configuration.

**File:** `turbo.json`

**Changes:**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "docs": {
      "cache": false
    },
    "build": {
      "dependsOn": ["^docs","^build"],
      "outputs": ["dist/**", ".astro/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "check": {
      "dependsOn": ["^build"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

**Reasoning:**
- `lint` depends on build to ensure TypeScript types are available for ESLint
- `test` depends on build to ensure components are compiled before testing
- Both tasks will be cacheable by default (Turbo's default behavior)

---

### 2. Update `apps/site/package.json`
Add lint script and wrangler dependency.

**File:** `apps/site/package.json`

**Changes:**
```json
{
  "name": "maxhill-me",
  "type": "module",
  "version": "0.0.1",
  "scripts": {
    "dev": "astro dev --host",
    "build": "astro build",
    "preview": "astro preview",
    "astro": "astro",
    "check": "astro check",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@astrojs/mdx": "^4.3.7",
    "@lucide/astro": "^0.546.0",
    "@maxhill/components": "workspace:*",
    "@maxhill/css": "workspace:*",
    "astro": "^5.14.4",
    "marked": "^16.4.1"
  },
  "devDependencies": {
    "@astrojs/check": "^0.9.4",
    "@typescript-eslint/eslint-plugin": "^8.46.1",
    "@typescript-eslint/parser": "^8.46.1",
    "@wc-toolkit/cem-utilities": "^1.5.1",
    "eslint": "^9.37.0",
    "prettier": "^3.6.2",
    "prettier-plugin-astro": "^0.14.1",
    "typescript": "^5.9.3",
    "wrangler": "^4.0.0"
  }
}
```

**Reasoning:**
- Lint script checks only `src/` directory as specified
- Wrangler v4 added for Pages deployment (matches auth app version)

---

### 3. Update root `package.json`
Add lint and test orchestration scripts.

**File:** `package.json`

**Changes:**
```json
{
  "name": "maxhill.me",
  "version": "1.0.0",
  "type": "module",
  "description": "",
  "main": "index.js",
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "check": "turbo check",
    "lint": "turbo lint",
    "test": "turbo test",
    "clean": "turbo clean",
    "docs": "turbo docs",
    "generate": "plop"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "packageManager": "pnpm@10.19.0",
  "devDependencies": {
    "plop": "^4.0.4",
    "turbo": "^2.5.8"
  },
  "dependencies": {
    "@floating-ui/dom": "^1.7.4",
    "components": "^0.1.0"
  }
}
```

**Reasoning:**
- `lint` and `test` scripts allow running these tasks across all workspaces via Turbo
- Maintains consistency with existing script patterns (`build`, `check`, etc.)

---

### 4. Create `.github/workflows/ci-and-deploy.yml`
Combined CI and deployment workflow.

**File:** `.github/workflows/ci-and-deploy.yml`

**Content:**
```yaml
name: CI and Deploy

on:
  push:
    branches: ['**']
  pull_request:
    branches: ['**']

jobs:
  ci:
    name: CI Checks
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.19.0
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Build all packages and apps
        run: pnpm build
      
      - name: Type check
        run: pnpm check
      
      - name: Lint
        run: pnpm lint
      
      - name: Test
        run: pnpm test

  deploy-auth:
    name: Deploy Auth to Cloudflare Workers
    runs-on: ubuntu-latest
    needs: [ci]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.19.0
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Build all packages
        run: pnpm build
      
      - name: Deploy auth to Cloudflare Workers
        working-directory: ./apps/auth
        run: pnpm wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

  deploy-site:
    name: Deploy Site to Cloudflare Pages
    runs-on: ubuntu-latest
    needs: [ci]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.19.0
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Build all packages
        run: pnpm build
      
      - name: Deploy site to Cloudflare Pages
        working-directory: ./apps/site
        run: pnpm wrangler pages deploy dist --project-name=maxhill-me
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

**Workflow Behavior:**
- **Triggers:** Runs on all pushes and PRs to any branch
- **CI Job:** Runs build, check, lint, test sequentially
- **Deploy Jobs:** Only run on push to `main` branch after CI passes
- **Parallelization:** deploy-auth and deploy-site run in parallel (both depend on CI)
- **Caching:** pnpm store cached via setup-node action

**Key Features:**
- `needs: [ci]` ensures deployments wait for CI to complete
- `if: github.ref == 'refs/heads/main' && github.event_name == 'push'` restricts deployment to main branch pushes only
- Each deployment rebuilds to ensure fresh artifacts (Turbo cache makes this fast)
- Both deployments use the same Cloudflare credentials

---

### 5. Update root `README.md`
Add comprehensive CI/CD documentation.

**File:** `README.md`

**Add the following content (append to existing README):**

```markdown
# maxhill.me

Monorepo for Max Hill's personal website and services.

## Workspace Structure

- `apps/site` - Astro static site (deployed to Cloudflare Pages)
- `apps/auth` - OpenAuth authentication service (deployed to Cloudflare Workers)
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
3. Lint (ESLint)
4. Test (web-test-runner)

### Deployments

On push to `main` (after CI passes):

1. **Auth app** → Cloudflare Workers
2. **Site app** → Cloudflare Pages

Both deployments run in parallel.

### GitHub Secrets Setup

Required secrets (add via GitHub repo Settings → Secrets and variables → Actions):

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

The site is currently deployed via Cloudflare Pages dashboard Git integration. After GitHub Actions is set up, you need to disconnect the old deployment:

**Migration Steps:**

- [ ] Complete GitHub Actions setup (add secrets, merge workflow)
- [ ] Verify first GitHub Actions deployment succeeds
- [ ] Go to Cloudflare dashboard → Pages → maxhill-me project
- [ ] Navigate to Settings → Builds & deployments
- [ ] Under "Production branch", click "Disconnect" (or "Remove Git integration")
- [ ] Confirm disconnection
- [ ] Verify subsequent pushes to `main` only trigger GitHub Actions (not Cloudflare dashboard builds)

**Note:** Disconnecting Git integration does NOT delete your Pages project or existing deployments. It only stops automatic deployments from Cloudflare's side. GitHub Actions will continue deploying to the same project.

**Rollback:** If needed, you can reconnect the Git integration in Cloudflare dashboard settings.

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
- Cloudflare Workers: https://dash.cloudflare.com/ → Workers & Pages → maxhill_auth
- Cloudflare Pages: https://dash.cloudflare.com/ → Workers & Pages → maxhill-me

### Troubleshooting

**Build fails with "turbo: command not found":**
- Ensure `turbo` is in devDependencies in root package.json
- Run `pnpm install` to install dependencies

**Lint fails with "eslint: command not found":**
- Ensure `eslint` is in devDependencies in apps/site/package.json
- Ensure site has a `lint` script defined

**Deployment fails with "Unauthorized":**
- Verify `CLOUDFLARE_API_TOKEN` is set correctly in GitHub secrets
- Verify token has correct permissions (Workers Scripts Edit, Pages Edit)
- Check token hasn't expired

**Deployment fails with "Account ID not found":**
- Verify `CLOUDFLARE_ACCOUNT_ID` is set correctly in GitHub secrets
- Ensure there are no extra spaces or characters in the secret value

**Site deployment fails with "Project not found":**
- Verify project name is exactly `maxhill-me` (matches Cloudflare Pages project)
- Check the project exists in Cloudflare dashboard

## Component Development TODOs

- [ ] listbox skip attribute does not feel great as an api
- [ ] m-option maybe should emit clicked event?
- [ ] m-input submit using enter
- [ ] m-input: Error text not populating in test - possible timing issue with m-invalid event listener registration vs validation
- [ ] m-input: Implement internals.ariaInvalid setting for accessibility (currently null)
- [ ] Listbox label and error state like input
```

---

## Post-Implementation Testing

After implementing all changes, test locally before committing:

### 1. Install dependencies
```bash
cd /Users/8717/code/personal/maxhill_me
pnpm install
```

### 2. Test new commands
```bash
pnpm lint      # Should lint apps/site/src/
pnpm test      # Should run components tests
pnpm check     # Should type check (already works)
pnpm build     # Should build everything (already works)
```

### 3. Verify Turbo caching
```bash
pnpm build     # First run
pnpm build     # Second run should be instant (cached)
```

### 4. Check for errors
- ESLint should not report any errors (or fix them before committing)
- Tests should all pass
- Type checking should pass
- Build should succeed

---

## Manual Post-Merge Steps

After the PR with these changes is merged and pushed to `main`:

### Setup GitHub Secrets

1. Go to https://github.com/MaxHill/maxhill_me/settings/secrets/actions
2. Click "New repository secret"
3. Add `CLOUDFLARE_API_TOKEN`:
   - Follow README instructions to create token
   - Add token as secret
4. Add `CLOUDFLARE_ACCOUNT_ID`:
   - Get from Cloudflare dashboard or `wrangler whoami`
   - Add account ID as secret

### Verify First Deployment

1. Push a commit to `main` (or merge a PR)
2. Go to https://github.com/MaxHill/maxhill_me/actions
3. Watch workflow run:
   - CI job should complete successfully
   - deploy-auth job should run after CI (only on main)
   - deploy-site job should run after CI (only on main)
4. Check deployments:
   - Auth: Verify in Cloudflare Workers dashboard
   - Site: Verify in Cloudflare Pages dashboard

### Disconnect Cloudflare Pages Dashboard Integration

1. Verify GitHub Actions deployment succeeded
2. Go to Cloudflare dashboard → Pages → maxhill-me
3. Settings → Builds & deployments
4. Click "Disconnect" under Git integration
5. Confirm disconnection
6. Future deployments will only come from GitHub Actions

---

## Implementation Order

1. Update `turbo.json` (add lint/test tasks)
2. Update `apps/site/package.json` (add lint script + wrangler)
3. Update root `package.json` (add lint/test scripts)
4. Run `pnpm install` (install wrangler in site)
5. Test locally: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm check`
6. Fix any lint/test errors discovered
7. Create `.github/workflows/ci-and-deploy.yml`
8. Update root `README.md`
9. Commit and push to feature branch
10. Create PR and verify CI runs
11. Merge to main
12. Follow manual post-merge steps above

---

## Risk Assessment

**Low Risk:**
- Turbo configuration changes (additive only)
- Package.json script additions (non-breaking)
- Adding wrangler to site (dev dependency)

**Medium Risk:**
- Lint may find existing issues in codebase
- Tests may reveal existing failures
- Need to fix before CI will pass

**Manual Intervention Required:**
- GitHub secrets setup (documented)
- Cloudflare Pages dashboard disconnection (documented)
- First deployment verification

**Rollback Plan:**
- If workflow fails: Delete workflow file, push to main
- If deployment issues: Revert commit, Cloudflare will keep last working deployment
- If Pages issues: Reconnect Git integration in Cloudflare dashboard

---

## Summary

This implementation adds a complete CI/CD pipeline to the maxhill_me monorepo with:

1. **Turborepo task configuration** for lint and test
2. **GitHub Actions workflow** combining CI checks and deployments
3. **Comprehensive documentation** in README.md with:
   - Development setup and commands
   - CI/CD pipeline overview
   - GitHub secrets setup instructions
   - Migration steps from Cloudflare Pages dashboard
   - Local testing procedures
   - Troubleshooting guide

The pipeline ensures code quality by running all checks before deployment, and only deploys to production when:
- All CI checks pass (build, type check, lint, test)
- Push is to the `main` branch
- Triggered by a push event (not PR)

Both auth and site deploy in parallel after CI completes, maximizing deployment speed while maintaining safety through comprehensive checks.
