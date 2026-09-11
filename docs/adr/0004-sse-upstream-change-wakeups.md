# SSE wake-ups for cross-replica sync

Clients learn that a **tenant**'s op log advanced via Server-Sent
Events. The only event variant today is a unit **upstream change**
(wake-up only). Operations still move solely over `POST /sync`.

## Why wake-up, not push

Pushing ops over SSE would duplicate the sync protocol (hashes,
versioning, integrity). A wake-up keeps one mutation path and lets
each replica call `/sync` when ready.

## Shape

- `GET /subscribe/<dbName>?clientId=…` with the same Bearer auth as
  `/sync`. `dbName` uses the existing validator.
- Browser `EventSource` cannot set `Authorization`. Clients use
  `fetch` + a stream reader (no npm SSE lib). Wire format stays
  standard SSE so a future cookie-auth world could still use
  `EventSource`.
- Golf client helper (app-local for now):
  `apps/golf/src/upstream-subscribe.ts`, wired from
  `apps/golf/src/sync-strategies.ts` (`onUpstreamChange`). A later
  move into `@maxhill/syncdb` is fine when more apps need it.
- Named event `upstreamChange` with `data: {}` so the sum type can
  grow later without renaming the channel.
- Process-local fan-out (in-memory hub). Acceptable while the server
  is single-instance SQLite on one box.
- Many connections per tenant (multi-device), cap 10 (named constant);
  the 11th is rejected with 429 + JSON and a log line.
- Re-subscribe with the same `clientId` replaces the prior hub entry
  (reconnect / HMR must not stack zombies).
- Publish after a successful sync that had operations; exclude the
  writing `clientId` so the writer is not woken for its own ops.
- Client catch-up: on stream open and after stream end, call
  `POST /sync` once. The hub does not replay missed wake-ups.
- Subscribe 401/403 uses the same refresh-then-logout idea as
  `/sync`. Capacity 429 uses a longer backoff than network blips.

## Considered options

- **Push operations on the stream** — rejected; second protocol.
- **Stock `EventSource` + token query** — rejected; tokens in URLs
  and access logs.
- **POST subscribe with token in body** — works with `fetch`, but
  does not restore `EventSource` and diverges from GET+Bearer `/sync`.
- **Cookie session for SSE only** — clean native `EventSource`, but
  a second auth mode beside JWT Bearer.
