# Design Decisions

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
