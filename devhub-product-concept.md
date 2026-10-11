# DevHub — Product Concept

## 1. Thesis

**DevHub is a programmable home for your engineering team.**

The idea is intentionally small.

You write a little TypeScript that describes where your team's data comes from and how it should be displayed. DevHub handles the boring application infrastructure:

- Hosting
- HTTP
- Scheduling
- State management
- Persistence
- Realtime updates
- Frontend rendering
- Styling
- Deployment

The goal is not to build another dashboard platform.

The goal is to make it trivial for a team to create **its own home** — a place that reflects how that team actually works.

The core promise:

> **Write a little TypeScript. We handle the app.**

---

## 2. The Product Experience

A team creates a small TypeScript file:

```ts
import { schedule, endpoint, page, metric, table } from "devhub";

export const deployments = schedule("1m", async () => {
  return await getDeployments();
});

export const incidents = schedule("30s", async () => {
  return await getIncidents();
});

export const deploy = endpoint(async (request) => {
  const deployment = await request.json();

  // Update state, trigger work, etc.
});

export const home = page(
  metric("Deployments", deployments),
  table("Incidents", incidents),
);
```

Then:

```bash
npx devhub deploy
```

And immediately:

```text
https://payments.devhub.dev
```

The user does not need to think about:

- React
- CSS
- A web server
- Databases
- WebSockets
- Queues
- Cron infrastructure
- Docker
- Terraform
- TLS
- Deployment pipelines
- Frontend builds
- Server provisioning

They just describe the technical world of their team.

---

## 3. The Core Abstraction

The most important conceptual model is:

```text
data → state → display

event → state

schedule → state
```

Everything revolves around **state**.

A source produces a value.

That value becomes part of global state.

The client observes that state.

The UI renders the state.

There are only a few ways state changes:

1. A schedule runs.
2. An HTTP endpoint receives something.
3. An event is emitted internally.

This makes the system extremely small.

Internally, the state can initially be thought of as:

```ts
type State = Map<string, unknown>;
```

With optional metadata:

```ts
type SourceState = {
  value: unknown;
  updatedAt: number;
  error?: Error;
  status: "pending" | "ready" | "error";
};
```

The important idea is:

> **Sources own pieces of state.**

---

## 4. Schedules

Schedules are one of the primary primitives.

For example:

```ts
export const deployments = schedule("1m", async () => {
  return await getDeployments();
});
```

DevHub handles:

- Running the function
- Scheduling it
- Handling errors
- Timeouts
- Retries
- Tracking the last update
- Persisting the result
- Detecting changes
- Broadcasting updates

The user only supplies the function.

A schedule is effectively:

```text
schedule → execute → state
```

### History becomes automatic

If a scheduled source runs every minute, DevHub already has a sequence of values over time.

That means historical views can eventually be derived automatically.

For example:

```ts
chart(cpu)
```

could simply render the historical values of the `cpu` source.

The user never has to build a time-series database.

---

## 5. Endpoints

The second major primitive is the endpoint.

For example:

```ts
export const deployment = endpoint(async (request) => {
  const event = await request.json();

  // Update state.
});
```

The runtime can automatically derive the route from the export name.

For example:

```text
POST /api/deployment
```

The user doesn't need to define routing infrastructure.

This means external systems can simply send JSON into DevHub.

```text
CI system
    ↓
POST /api/deployment
    ↓
DevHub state
    ↓
Team homepage
```

There is no need to build dedicated integrations initially.

If a system can make an HTTP request, it can feed DevHub.

---

## 6. State and Storage

Storage should be almost completely invisible to the user.

The user's mental model should simply be:

```ts
export const services = schedule("30s", getServices);
```

That source has a value.

DevHub takes care of storing it.

The system may internally maintain:

```text
key
value
updatedAt
status
error
history
```

But the user doesn't need to understand the storage implementation.

This is important because the product should not become a database product.

**Storage is an implementation detail.**

---

## 7. Display and Client

The display layer should also be deliberately small.

Potential primitives:

```ts
metric()
table()
list()
chart()
status()
markdown()
link()
section()
```

The goal is **not** to become React.

The product should provide a handful of excellent components that cover most team-home use cases.

For example:

```ts
metric("Deployments", deployments)
```

```ts
table("Incidents", incidents)
```

```ts
list("Recent Deployments", deployments)
```

```ts
chart(cpu)
```

The components should infer as much as possible from ordinary data.

If a source returns:

```ts
[
  {
    service: "payments",
    version: "1.4.2",
    status: "healthy",
  },
  {
    service: "api",
    version: "3.1.0",
    status: "degraded",
  },
]
```

Then:

```ts
table(deployments)
```

should be enough to produce a useful table.

Optional configuration can exist when the defaults aren't sufficient.

---

## 8. Data Is the Common Interface

One of the strongest aspects of the design is that **data itself is the interface between the backend and frontend**.

A schedule returns data.

An endpoint produces data.

State stores data.

Display components consume data.

For example:

```ts
export const services = schedule("30s", getServices);
```

The same source can potentially be displayed in multiple ways:

```ts
metric(services)
table(services)
list(services)
```

This makes the system composable without introducing a large framework.

---

## 9. The Runtime

The runtime can be extremely simple.

Conceptually:

```text
                 ┌──────────────┐
                 │  TypeScript  │
                 │    config    │
                 └──────┬───────┘
                        │
              ┌─────────┴─────────┐
              │                   │
          schedules           endpoints
              │                   │
              └─────────┬─────────┘
                        ↓
                  global state
                        │
                        ↓
                       SSE
                        │
                        ↓
                  browser client
                        │
                        ↓
                      display
```

A practical implementation could use **Hono** for HTTP.

The runtime consists roughly of:

- Hono server
- Scheduler
- Global state store
- Persistence
- SSE endpoint
- Static client

That's about it.

---

## 10. Hono + Scheduler + State

Hono handles:

- HTTP requests
- Endpoints
- Static files
- The SSE connection

The scheduler handles:

- Recurring functions
- Execution
- Errors
- Timing

The state store handles:

- Current values
- Metadata
- Persistence
- Change notifications

All of these pieces communicate through the same state model.

This keeps the architecture understandable.

---

## 11. Server-Sent Events

The browser does not need to repeatedly fetch data.

Instead, it subscribes to an SSE endpoint:

```text
GET /events
```

When the client connects, it receives an initial snapshot:

```text
event: snapshot
data: {...}
```

Then updates:

```text
event: update
data: {
  "key": "deployments",
  "value": [...]
}
```

The browser maintains a small client-side state map and renders it.

For an MVP, sending the entire state on every update is completely reasonable.

The protocol can later evolve into deltas if necessary.

The important thing is that the initial architecture stays simple.

---

## 12. Hosting

Hosting should be almost completely invisible.

The user runs:

```bash
npx devhub deploy
```

DevHub handles:

- Building
- Packaging
- Deployment
- TLS
- Domain
- Runtime
- Storage
- Process management

The output is something like:

```text
https://payments.devhub.dev
```

There should be no need for:

- Docker
- Terraform
- Kubernetes
- Deployment YAML
- Frontend configuration
- Database setup

The product should feel closer to:

```text
write file → deploy → get URL
```

than to deploying a conventional web application.

---

## 13. The Team Home

The key product concept is **home**, not dashboard.

A dashboard implies:

> Here are some metrics.

A team home implies:

> This is the place our team goes to understand what is happening in our technical world.

Different teams should have radically different homes.

A database team might have:

```text
Replication
Backups
Slow queries
Cluster health
Recent changes
Capacity
```

A compiler team might have:

```text
Build status
Benchmark results
Recent commits
Release status
Regression alerts
Open issues
```

An AI infrastructure team might have:

```text
GPU capacity
Training jobs
Model versions
Queue depth
Recent deployments
Incidents
```

A web team might have:

```text
Deployments
Traffic
Errors
Incidents
Feature flags
Recent changes
```

The product should not impose a universal information architecture.

**Each team decides what its home means.**

---

## 14. The Configuration Is Code

The configuration should be a TypeScript module.

This is important because engineers already know how to work with code.

The configuration is:

- Version controlled
- Reviewable
- Composable
- Testable
- Diffable
- Deployable

There is no separate JSON/YAML dashboard configuration language.

There is no drag-and-drop builder.

There is no visual editor to learn.

The code itself is the configuration.

This also makes the system extremely flexible without requiring a huge product surface.

---

## 15. The API Philosophy

The API should follow a philosophy similar to small, composable systems such as Bombadil.

Avoid a giant root configuration object.

Avoid:

```ts
export default {
  schedules: {...},
  endpoints: {...},
  pages: {...},
  storage: {...},
};
```

Instead, use independent named exports:

```ts
export const deployments = schedule(...);

export const incidents = schedule(...);

export const deploy = endpoint(...);

export const home = page(...);
```

The module is simply a collection of declarations.

Each primitive can be understood independently.

This is a much better fit for the product philosophy.

---

## 16. Product Philosophy

The product should intentionally be **small**.

Every feature should be evaluated against one question:

> Does this help a team create its home without forcing them to build an application?

If the answer is no, it probably doesn't belong.

The product should avoid becoming:

- A generic dashboard builder
- An observability platform
- A DORA metrics platform
- A developer productivity analytics product
- An internal developer portal
- A Retool clone
- A Grafana clone
- A full application framework

It is something narrower.

It is a tiny application runtime designed around one specific job:

> **Give an engineering team a programmable place to see and interact with its world.**

---

## 17. What DevHub Is Not

### Not a dashboard builder

Users aren't arranging arbitrary charts and widgets.

They are defining a small application in code.

### Not an observability platform

DevHub doesn't need to collect every metric, log, and trace.

It can consume data from those systems.

### Not Backstage

There is no requirement for a huge plugin ecosystem or developer portal architecture.

### Not Retool

Users aren't building internal CRUD applications.

### Not Grafana

DevHub isn't trying to replace an observability stack.

### Not a frontend framework

The user shouldn't need to think about components, state management, CSS, bundlers, or browser APIs.

---

## 18. The Design Principle

The core design principle is:

> **Remove 95% of the work required to build a small internal application while keeping the remaining 5% programmable.**

Engineers still get to write code.

They still get to decide what data matters.

They still get to define the behavior of their team's home.

But they don't have to repeatedly solve:

```text
HTTP server
database
frontend
CSS
deployment
hosting
realtime updates
authentication
scheduling
persistence
```

That is the product.

---

## 19. Potential Positioning

### Primary

> **A programmable home for your engineering team.**

### Supporting line

> Write a little TypeScript. We handle the app.

### Alternative

> Everything your team needs to know, in one place.

### Alternative

> Define your team's home in TypeScript.

The strongest framing is probably:

> **DevHub is a programmable home for your engineering team.**

Because it leaves the product open enough for teams to make it their own while still describing the purpose clearly.

---

## 20. The Key Validation Question

The best validation question is probably not:

> Would you use DevHub?

Instead:

> **If I gave you a TypeScript file where you could write arbitrary async functions and immediately get a beautiful team homepage from their output, what would you put on it?**

The answers to that question reveal whether the product has real pull.

They also reveal what the initial display primitives need to support.

---

## 21. MVP

### Sources

```ts
schedule()
endpoint()
```

Potentially:

```ts
event()
```

### Display

```ts
metric()
table()
list()
chart()
markdown()
status()
```

### Runtime

- Hono HTTP server
- Scheduler
- Global state store
- Persistence
- SSE
- Static HTML/JS client
- Automatic hosting

### Deployment

```bash
npx devhub deploy
```

That's enough to validate the concept.

---

## 22. Core Thesis

The entire product can be reduced to this:

```text
                TypeScript
                    │
          ┌─────────┴─────────┐
          │                   │
       schedules          endpoints
          │                   │
          └─────────┬─────────┘
                    ↓
                  state
                    │
                    ↓
                   SSE
                    │
                    ↓
                 client
                    │
                    ↓
                  home
```

The user supplies the interesting part:

```text
What does our team care about?
Where does that data come from?
What should happen when something changes?
```

DevHub supplies everything else.

**A little TypeScript in. A complete team home out.**
