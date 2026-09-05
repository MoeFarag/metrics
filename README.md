# GitHub Metrics Wrapper

Small Vercel-ready API wrapper for querying one GitHub repository and receiving GitHub event subscriptions.

The target repository is configured through environment variables, so the same deployment can point at any public repo without code changes.

## Environment

Copy `.env.example` to `.env.local` for local development.

Required:

- `GITHUB_OWNER`
- `GITHUB_REPO`

Optional:

- `GITHUB_TOKEN`: raises rate limits and enables webhook management if the token has repo hook permissions.
- `GITHUB_WEBHOOK_SECRET`: verifies inbound GitHub webhooks.
- `GITHUB_ALLOWED_EVENTS`: comma-separated event allowlist for inbound webhooks.
- `WEBHOOK_FORWARD_URL`: forwards verified webhook payloads to another HTTP endpoint.
- `WRAPPER_API_TOKEN`: protects wrapper endpoints with `Authorization: Bearer ...`.

## Storage Decision

The first dashboard storage target is SQLite, documented in `docs/decisions.md`.

For Vercel deployment, keep storage behind an adapter boundary: local development can use SQLite, while production should move the same adapter contract to a durable hosted store such as Turso/libSQL, Vercel Postgres, or Neon. Vercel serverless local disk is not durable enough for production event history.

## Local Development

```bash
npm test
npm run lint
npx vercel dev
```

## Deploy

```bash
npx vercel
npx vercel env add GITHUB_OWNER
npx vercel env add GITHUB_REPO
npx vercel env add GITHUB_TOKEN
npx vercel env add GITHUB_WEBHOOK_SECRET
npx vercel --prod
```

## API

All query endpoints target `GITHUB_OWNER/GITHUB_REPO`.

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

```
https://your-vercel-app.vercel.app/api/webhooks/github
```

When `GITHUB_WEBHOOK_SECRET` is set, the receiver validates `X-Hub-Signature-256`. Verified events are normalized and returned. If `WEBHOOK_FORWARD_URL` is set, the raw event envelope is also forwarded.
