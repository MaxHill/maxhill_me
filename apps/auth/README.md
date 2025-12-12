# @maxhill/auth

OpenAuth-based authentication service for maxhill.me

## Overview

This is a standalone OAuth 2.0 authentication server built with OpenAuth.js. It provides username/password authentication with email verification, uses in-memory storage for local development, and Cloudflare KV for production.

### Key Features

- **Username/Password Authentication**: Built-in password provider with email verification
- **Local Development**: In-memory storage with file persistence, verification codes logged to console
- **Production Ready**: Configured for Cloudflare Workers with KV storage
- **Standards-Based**: OAuth 2.0 compliant, works with any OAuth client
- **Type-Safe**: Full TypeScript support with JWT subject definitions
- **Hash-Based User IDs**: Deterministic user identification for development (production should connect to user database service)

## Local Development

### Install Dependencies

From the monorepo root:

```bash
pnpm install
```

### Start the Development Server

```bash
cd apps/auth
pnpm dev
```

The auth server will run at `http://localhost:3001`

### Testing Locally

1. **Verify Server**: Visit `http://localhost:3001/.well-known/oauth-authorization-server` to see the OAuth discovery endpoint
2. **Test Authentication**: Access the password provider UI for registration/login flows
3. **Check Verification Codes**: Codes are logged to console in this format:
   ```
   ================================
   Verification code for: user@example.com
   Code: 123456
   ================================
   ```

### Type Checking

```bash
pnpm check
```

## Production Deployment

### Prerequisites

- Cloudflare account with Workers enabled
- Wrangler CLI (included in devDependencies)
- Custom domain configured in Cloudflare

### Deployment Steps

#### 1. Create Cloudflare KV Namespace

```bash
cd apps/auth
pnpm wrangler kv:namespace create MAXHILL_AUTH
```

This will output:
```
{ binding = "MAXHILL_AUTH", id = "abc123..." }
```

#### 2. Configure KV Namespace

Uncomment the KV namespace section in `wrangler.toml` and add your namespace ID:

```toml
[[kv_namespaces]]
binding = "MAXHILL_AUTH"
id = "abc123..."  # from step 1
```

#### 3. Update Email Sending

Replace the console.log in `src/index.ts` (lines 36-42) with actual email sending:

```typescript
sendCode: async (email, code) => {
  // Example with Resend
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'auth@maxhill.me',
      to: email,
      subject: 'Your verification code',
      text: `Your code is: ${code}`
    })
  })
}
```

Supported email services:
- Resend
- SendGrid
- AWS SES
- Mailgun
- Postmark

#### 4. Deploy to Cloudflare

```bash
pnpm deploy
```

#### 5. Configure Custom Domain

In Cloudflare dashboard:
1. Navigate to **Workers & Pages**
2. Select **maxhill_auth**
3. Go to **Settings > Triggers**
4. Add custom domain: `auth.maxhill.me`

### Production Configuration Checklist

- [ ] KV namespace created and configured
- [ ] Email service integrated
- [ ] Custom domain configured
- [ ] User database service connected (update `getOrCreateUser` function)
- [ ] Environment variables set (if needed for email service)
- [ ] Test authentication flow on production URL

## Usage in Other Apps

Import the subjects to verify tokens in your applications:

```typescript
import { subjects } from "@maxhill/auth/subjects"
import { createClient } from "@openauthjs/openauth/client"

const client = createClient({
  clientID: "my-app",
  issuer: "https://auth.maxhill.me" // or http://localhost:3001 for local
})

const verified = await client.verify(subjects, accessToken, {
  refresh: refreshToken
})

if (!verified.err) {
  console.log(verified.subject) // { type: "user", properties: { userID: "..." } }
}
```

## Architecture

### Project Structure

```
apps/auth/
├── src/
│   ├── index.ts          # OpenAuth issuer with password provider
│   ├── subjects.ts       # JWT subject definitions (exportable)
│   └── env.d.ts          # TypeScript types for Cloudflare KV
├── wrangler.toml         # Cloudflare Workers configuration
└── package.json          # Dependencies and scripts
```

### Storage

| Environment | Storage Type | Details |
|-------------|--------------|---------|
| **Local Development** | MemoryStorage | File persistence to `.wrangler/state/auth-storage.json` |
| **Production** | CloudflareStorage | Cloudflare KV namespace (MAXHILL_AUTH) |

### Authentication Flow

1. User navigates to authentication endpoint
2. User enters email and password in password provider UI
3. Verification code is sent (console in dev, email in production)
4. User enters verification code to confirm email
5. User ID is generated (hash-based in dev, database lookup in production)
6. Access and refresh tokens are issued with user subject containing `userID`

### User Management

**Development**: Uses SHA-256 hash of email as user ID for testing

**Production**: Update the `getOrCreateUser` function in `src/index.ts` to:
1. Query your user database service
2. Create new users if they don't exist
3. Return the user's ID from your system

Example:
```typescript
async function getOrCreateUser(email: string): Promise<string> {
  const response = await fetch('https://api.maxhill.me/users/find-or-create', {
    method: 'POST',
    body: JSON.stringify({ email })
  })
  const { userId } = await response.json()
  return userId
}
```

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `pnpm dev` | Start local development server on port 3001 |
| `build` | `pnpm build` | Build for production (dry run deployment) |
| `deploy` | `pnpm deploy` | Deploy to Cloudflare Workers |
| `check` | `pnpm check` | Run TypeScript type checking |

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **OpenAuth** | ^0.4.3 | OAuth 2.0 authentication provider |
| **Hono** | ^4.6.14 | Web framework (Cloudflare Workers compatible) |
| **Valibot** | ^1.0.0 | Schema validation (standard-schema compatible) |
| **Wrangler** | ^4.0.0 | Cloudflare Workers CLI and development server |
| **TypeScript** | ^5.9.3 | Type safety and development tooling |
| **Cloudflare Workers** | - | Serverless deployment platform |

## Configuration Files

- **wrangler.toml**: Cloudflare Workers configuration with nodejs_compat enabled
- **tsconfig.json**: TypeScript compiler options for Workers environment
- **package.json**: Dependencies and npm scripts
- **.dev.vars.example**: Example environment variables template
