# Multi-tenant DB migration

## Authorization and tenant-sync decisions

### Auth API

Add tenant and membership support to `apps/auth`:

- Add `users`, `tenants`, and `memberships` tables.
- When creating a user, automatically create a **personal tenant** and an owner membership for that user.
- Support users who belong to multiple tenants.

Add these endpoints:

- `GET /me/tenants` — list the authenticated user’s tenants.
- `GET /me/has-tenant` — check whether the authenticated user belongs to a specified tenant.

### SyncDB server

- Replace the current combined `dbName:userId` partition key with separate `tenant_id` and `db_name` fields.
- Keep `client_id`; it identifies the replica and remains part of operation identity.
- Add `tenant_id` to sync requests.
- Before processing a sync request, verify that the authenticated user is a member of the requested tenant.

### SyncDB client

- Include `tenant_id` in sync requests, using the tenant selected by the user.

### Detail to settle during implementation

The sync server needs a trusted way to perform the membership check. Decide whether it calls the auth API or uses another trusted membership-data interface. In either case, the check must use the authenticated user’s identity—not accept a user ID supplied by the sync client.
