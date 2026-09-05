# Design Decisions

## 2026-09-05: Product Boundary

Decision: this project measures DORA metrics in general, not GitHub metrics specifically.

Why:

- GitHub is only one possible source of delivery, workflow, and change events.
- DORA reporting will likely need data from multiple systems, including code hosting, CI/CD, deployment, incident, ticketing, and manual sources.
- The backend should own integration details, credentials, webhook handling, normalization, and query logic. The frontend should consume backend views instead of talking directly to source systems.

Current implementation stance:

- Keep the existing GitHub wrapper as the first source connector.
- Serve the prototype frontend from the same server for now.
- Use server-rendered HTML on first load, then let Vue handle richer frontend interactions after hydration/client startup.
- Revisit hosting and frontend/backend deployment boundaries after the prototype is approved for further development.

## 2026-09-05: Prototype Authentication

Decision: use a simple username/password login gate with three environment-configured roles: admin, manager, and executive.

Why:

- The prototype needs a fast access gate before the full product authorization model is known.
- Role-specific credentials let the dashboard shape start reflecting different readers without committing to a permanent identity provider.
- Environment variables keep credentials out of source control.

Current implementation stance:

- Store `AUTH_ADMIN_*`, `AUTH_MANAGER_*`, and `AUTH_EXECUTIVE_*` values in the runtime environment.
- Validate passwords through a separate hash service.
- Implement hashing as base64 only for the quick prototype.
- Replace the hash service with a proper password hashing strategy and likely a real identity provider if the prototype is approved for further development.

## 2026-09-05: Event Storage

Decision: use SQLite as the first persistence layer for webhook event history and subscription state.

Why:

- It is simple to run locally and easy to inspect while the metrics dashboard is still taking shape.
- It gives us real query semantics for dashboard metrics, filters, and rollups.
- It is a better fit than raw file storage once GitHub webhook volume grows beyond a few test events.

Vercel constraint:

- Vercel serverless functions do not provide durable writable local disk, so a bundled SQLite file is not a production-grade persistent store on Vercel.
- The wrapper should therefore keep storage behind a small adapter boundary. Local development can use SQLite first; production can later swap the adapter to Turso/libSQL, Vercel Postgres, Neon, or another managed store without changing the GitHub API wrapper surface.

Current implementation stance:

- The API wrapper and webhook receiver are stateless today.
- Webhook events can be verified, summarized, and optionally forwarded through `WEBHOOK_FORWARD_URL`.
- SQLite-backed event persistence should be added as the next dashboard step, using the same normalized webhook envelope already returned by `/api/webhooks/github`.
