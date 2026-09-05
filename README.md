# DORA Metrics Prototype

Prototype app for measuring DORA metrics across delivery systems. GitHub is one source connector, not the product boundary.

The backend stays separate from the browser-facing frontend because it owns secrets, source-system queries, webhook handling, normalization, and future persistence. For now, the same server also serves the frontend: the first load is server-rendered HTML, then Vue handles follow-up interactions in the browser.

## Prototype Scope

Current scope:

- GitHub query wrapper for repository, issue, pull request, commit, workflow, artifact, and hook APIs.
- GitHub webhook receiver with signature verification, event allowlisting, normalized summaries, and optional forwarding.
- Server-rendered login page with a Vue client stub.
- Username/password gate for three prototype roles: admin, manager, and executive.

Planned DORA direction:

- Keep source integrations behind adapter boundaries. GitHub should sit beside future connectors such as GitLab, Azure DevOps, Jira, CI/CD systems, incident tooling, deployment logs, or manual imports.
- Normalize source events before calculating DORA metrics.
- Keep dashboard queries in the backend so source credentials and aggregation logic never move into the browser.

## Environment

Copy `.env.example` to `.env.local` for local development.

GitHub connector:

- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_TOKEN`: optional; raises rate limits and enables webhook management if the token has repo hook permissions.
- `GITHUB_WEBHOOK_SECRET`: optional but strongly recommended before exposing webhook endpoints.
- `GITHUB_ALLOWED_EVENTS`: optional comma-separated inbound webhook allowlist.
- `WEBHOOK_FORWARD_URL`: optional endpoint for forwarding verified webhook envelopes.
- `WRAPPER_API_TOKEN`: optional bearer token for wrapper endpoints.

Prototype login gate:

- `AUTH_ADMIN_USERNAME`
- `AUTH_ADMIN_PASSWORD_HASH`
- `AUTH_MANAGER_USERNAME`
- `AUTH_MANAGER_PASSWORD_HASH`
- `AUTH_EXECUTIVE_USERNAME`
- `AUTH_EXECUTIVE_PASSWORD_HASH`

Password hashes are base64 in this prototype. The implementation intentionally goes through `src/hash-service.js` so the hash algorithm can be replaced later without rewriting the login flow.

## Local Development

```bash
npm test
npm run lint
npm run dev:local
npx vercel dev
```

Open `/` for the login page. A successful login currently renders:

```text
Hi {username}
```

`npm run dev:local` runs the same prototype handlers without Vercel authentication. It loads `.env` and `.env.local` automatically; shell environment variables override file values. Use `HOST=0.0.0.0 PORT=3000 npm run dev:local` when testing from another machine on the network.

## Deploy

```bash
npx vercel
npx vercel env add GITHUB_OWNER
npx vercel env add GITHUB_REPO
npx vercel env add GITHUB_TOKEN
npx vercel env add GITHUB_WEBHOOK_SECRET
npx vercel env add AUTH_ADMIN_USERNAME
npx vercel env add AUTH_ADMIN_PASSWORD_HASH
npx vercel env add AUTH_MANAGER_USERNAME
npx vercel env add AUTH_MANAGER_PASSWORD_HASH
npx vercel env add AUTH_EXECUTIVE_USERNAME
npx vercel env add AUTH_EXECUTIVE_PASSWORD_HASH
npx vercel --prod
```

## API

Frontend:

- `GET /`
- `POST /api/login`

GitHub source connector:

- `GET /api/github/health`
- `GET /api/github/repo`
- `GET /api/github/metrics/summary`
- `GET /api/github/issues?state=open&per_page=30`
- `GET /api/github/pulls?state=open&per_page=30`
- `GET /api/github/commits?sha=main&per_page=30`
- `GET /api/github/actions/workflows`
- `GET /api/github/actions/runs?status=completed&per_page=30`
- `GET /api/github/actions/jobs/:run_id`
- `GET /api/github/actions/artifacts?per_page=30`
- `GET /api/github/actions/workflows/:workflow_id/runs?branch=main`
- `GET /api/github/hooks`
- `POST /api/github/hooks`
- `DELETE /api/github/hooks/:hook_id`
- `POST /api/webhooks/github`

### Create A Webhook

```bash
curl -X POST "$BASE_URL/api/github/hooks" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $WRAPPER_API_TOKEN" \
  -d '{
    "url": "https://your-vercel-app.vercel.app/api/webhooks/github",
    "events": ["push", "pull_request", "workflow_run"],
    "active": true
  }'
```

GitHub requires an authenticated token with permission to manage hooks for the repository.

### Webhook Receiver

Configure GitHub to send events to:

```text
https://your-vercel-app.vercel.app/api/webhooks/github
```

When `GITHUB_WEBHOOK_SECRET` is set, the receiver validates `X-Hub-Signature-256`. Verified events are normalized and returned. If `WEBHOOK_FORWARD_URL` is set, the raw event envelope is also forwarded.
