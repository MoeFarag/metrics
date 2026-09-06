# Metrics Dashboard Prototype

Prototype app for measuring DORA and delivery-flow metrics across engineering systems.
GitHub is one source connector, not the product boundary.

The backend stays separate from the browser-facing frontend because it owns secrets,
source-system queries, webhook handling, normalization, and future persistence. For now
the same server also serves the frontend: the first load is server-rendered HTML, then
Vue handles follow-up interactions in the browser.

Design rationale for every choice below lives in [`docs/decisions.md`](docs/decisions.md);
architecture and roadmap live in [`arch-and-execution/`](arch-and-execution/) and
[`docs/future-plan.md`](docs/future-plan.md).

## Setup

Requirements: Node.js 18 or newer. The prototype has **no runtime or dev dependencies**,
so `npm install` is optional.

```bash
git clone <this-repo> && cd telegram-1003786703377-topic-314-metrics
cp .env.example .env.local
npm test
npm run dev:local
```

Then open <http://127.0.0.1:3000> and log in with one of the three prototype accounts from
`.env.example` (`admin` / `admin`, `manager` / `manager`, `executive` / `executive`).
After login the dashboard loads live metrics for the repository in the top search box —
paste any public `owner/repo` or GitHub URL and press **Run**, or press **Default** to go
back to the configured repo.

- `npm run dev:local` runs the same handlers Vercel runs, without Vercel authentication. It
  loads `.env` then `.env.local`; shell variables override file values.
- Use `HOST=0.0.0.0 PORT=3000 npm run dev:local` to reach it from another machine.
- `npx vercel dev` is the alternative runner when you want the real Vercel routing layer.
- `npm run lint` runs `node --check` over every source file. `npm test` runs the 50-case
  `node --test` suite.

### Environment

Only two variables are required; everything else has a default or is optional.

| Variable | Required | Purpose |
| --- | --- | --- |
| `GITHUB_OWNER` | yes | Default repository owner |
| `GITHUB_REPO` | yes | Default repository name |
| `GITHUB_TOKEN` | no, but effectively yes | Unauthenticated GitHub allows 60 req/hr; a cold metrics refresh needs 750–900 calls, so without a token the dashboard rate-limits almost immediately |
| `METRICS_WINDOW_DAYS` | no (default `60`) | Lookback window |
| `METRICS_CONCURRENCY` | no (default `8`) | Parallel GitHub calls |
| `METRICS_CACHE_ENABLED` / `METRICS_CACHE_TTL_MS` | no (`true` / `60000`) | In-process memoisation; latency only, never a source of truth |
| `DATA_CONFIDENCE_THRESHOLD` | no (default `0.7`) | Below this, a metric renders as low confidence |
| `REQUIRED_CHECKS` | no | Comma-separated merge-blocking check names for M6/M7 (D14) |
| `REQUIRED_CHECK_SET_VERSION` | no (default `unversioned`) | Stamped on every response so a config change is visible |
| `GITHUB_WEBHOOK_SECRET` | no | Verifies `X-Hub-Signature-256` on the webhook receiver |
| `GITHUB_ALLOWED_EVENTS` | no | Inbound webhook allowlist |
| `WEBHOOK_FORWARD_URL` | no | Forwards verified webhook envelopes |
| `WRAPPER_API_TOKEN` | no | Bearer token protecting the wrapper endpoints |
| `AUTH_{ADMIN,MANAGER,EXECUTIVE}_USERNAME` | yes, to log in | Prototype login gate |
| `AUTH_{ADMIN,MANAGER,EXECUTIVE}_PASSWORD_HASH` | yes, to log in | Base64 in this prototype |

Password hashes are base64 for now. The login flow goes through `src/hash-service.js` so
the algorithm can be replaced without rewriting the flow. Real deployments replace this
gate entirely with organisational SSO (D18).

## Data Sources

**One source system: the GitHub REST API v3**, read live over HTTPS at request time for the
repository the user enters. There is no database, no ingest job, no scheduled sync, and no
vendored dataset in this repository (D8).

| GitHub endpoint | Feeds |
| --- | --- |
| `GET /repos/{o}/{r}` | Repo header, default branch |
| `GET /repos/{o}/{r}/releases` | Production-deploy signal for M1, M2, M3 (D1) |
| `GET /repos/{o}/{r}/commits`, `/commits/{ref}`, `/compare` | Release-to-commit resolution, revert detection (D2, D16) |
| `GET /repos/{o}/{r}/pulls` | Merged-PR population for M2, M4, M5 |
| `GET /repos/{o}/{r}/pulls/{n}/files` | PR size distribution, M4 (D11) |
| `GET /repos/{o}/{r}/pulls/{n}/reviews`, `/pulls/{n}/commits` | Review round trips, M5 |
| `GET /repos/{o}/{r}/issues` | Labelled incident/hotfix signals for change failure rate, M3 (D5) |
| `GET /repos/{o}/{r}/actions/workflows`, `/actions/runs`, `/actions/runs/{id}/jobs`, `/actions/runs/{id}/attempts/{n}` | Time to signal (M6) and rerun / first-attempt pass rate (M7) |

Sources deliberately **not** used: the GitHub Deployments API (D1), and the
branch-protection API for required checks (D14) — the required-check set comes from
`REQUIRED_CHECKS` config instead.

A GitHub webhook receiver exists at `POST /api/webhooks/github` as wrapper infrastructure.
**It does not feed any metric.** Nothing is persisted from it; webhook subscription and
push-event ingestion are Phase 2 (D7).

Source integrations sit behind adapter boundaries so GitLab, Azure DevOps, Jira, CI/CD
systems, incident tooling, or manual imports can sit beside GitHub later.

## Live vs. Seeded Metrics

**All seven metrics are live. None is seeded, mocked, or backed by fixture data.** Every
number on the dashboard is computed on demand from the GitHub API for the repository you
enter, over the selected window, on each load.

| # | Metric | Family | Status | Source of the number |
| --- | --- | --- | --- | --- |
| M1 | Deployment Frequency | DORA | **Live** | Releases in window |
| M2 | Lead Time for Changes | DORA | **Live** | Merged PRs to resolving release |
| M3 | Change Failure Rate | DORA | **Live** | Labelled issues/PRs and revert commits vs releases |
| M4 | PR Size Distribution | Flow | **Live** | Per-PR `files` additions and deletions |
| M5 | Review Round Trips | Collaboration | **Live** | Per-PR reviews interleaved with pushes |
| M6 | Time to Signal | CI Platform | **Live** | Actions runs and jobs |
| M7 | Rerun Rate & First-Attempt Pass Rate | CI Platform | **Live** | Actions run attempts |

What *is* static, so the distinction is not overclaimed — none of it is a metric value:

- **Metric registry copy** — names, families, tension pairings, and the question each
  metric answers (`src/metrics/registry.js`).
- **The shared limitations list** rendered under the grid, plus a duplicate copy in the
  client used before the first API response returns.
- **Executive-view narrative** — the "What it means / Definition / Calculation" text on
  each executive card is authored editorial copy, not generated from the data.
- **Loading shells** — the seven cards render their titles with a spinner before
  `/api/metrics/summary` responds; they carry no values.
- **The prefilled repository address** in the search box, purely a convenience default.

Two DORA metrics are **not built at all** and do not appear: Failed Deployment Recovery
Time and Deployment Rework Rate. Both were cut for convention risk rather than effort —
without incident tooling, "time to restore" degrades into "time to next release", which
conflates detecting a problem with shipping the fix (D6).

Live computation also means metrics degrade honestly rather than silently: a repo with no
qualifying releases renders a no-release state instead of zeros, change failure rate is
never shown without its label-coverage figure beside it (D9), and a metric whose data
confidence falls below threshold suppresses itself.

## Known Limitation I'd Fix Next

**There is no persistence, and the live-computation model is at its ceiling.**

A cold full refresh over a 60-day window runs roughly **750–900 GitHub API calls** —
dominated by the per-run jobs calls behind M6/M7 and the three per-PR calls behind M4/M5 —
and requesting prior-window direction, which the dashboard does by default, roughly doubles
that. Against the authenticated budget of 5,000 requests/hour that is about **four cold
refreshes per hour**: workable for the one or two people this prototype was built for, and
a hard wall for a team. In-process memoisation and bounded concurrency soften a single load
but vanish between serverless invocations.

The second cost is reproducibility. Because release SHAs are re-resolved on every load
rather than snapshotted, a force-moved tag or deleted branch can change a historical number
between two loads (D2); and with no stored rows there is nowhere to record which exclusion
ruleset or required-check set a past number was computed under, so a config change silently
re-bases the whole displayed history (D14).

**The fix, in order.** Add a storage adapter and cache the two expensive calls on keys that
are permanently valid once historical: `compare` on `(base_sha, head_sha)`, and PR files on
`(pr_number, merge_commit_sha)`. That alone removes most of the call volume. Then persist
computed metric rows with provenance columns for the ruleset and required-check-set version
in force at computation time. On Vercel this points at a managed store — Turso/libSQL,
Vercel Postgres, or Neon — never a bundled SQLite file, since serverless functions have no
durable local disk.

Deferring it costs nothing retroactively: every metric is a pure function of the
repository's current API state over a window, and all of that state is retrievable
retrospectively. Nothing is permanently lost by not recording it today, so adding the store
later is a pure performance and reproducibility change with no gap in history (D8).

Other known limitations, each with a decision entry rather than an open question:
change-failure detection depends on labelling discipline (D5, D9); lead time still anchors
on PR open rather than first commit until the ticket-branch convention lands (D17); Time to
Signal's push timestamp is the run's `created_at`, so pre-queue delay is invisible (D7); and
the configured required-check set can drift from actual branch protection (D14).

## Views

Two views, mapped onto the prototype roles (D15):

- **Manager view** (`manager`, and the default for everyone) — distributions, evidence
  rows, sample sizes, and per-metric drill-downs.
- **Executive view** (`executive`) — the same seven metrics with narrative framing, bands,
  and caveats, stopping at the number rather than the rows behind it.
- **Admin** can switch between both via the view tabs.

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

- `GET /` — server-rendered login page and dashboard shell
- `POST /api/login`

Metrics:

- `GET /api/metrics/registry` — metric definitions, shared limitations, and defaults
- `GET /api/metrics/summary?repo=&window=&include_prior_window=` — all seven metrics for
  one repository. `repo` accepts `owner/repo` or a GitHub URL; `window` accepts `60` or
  `60d`; `include_prior_window` enables direction and roughly doubles the call count.

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

When `GITHUB_WEBHOOK_SECRET` is set, the receiver validates `X-Hub-Signature-256`. Verified
events are normalized and returned. If `WEBHOOK_FORWARD_URL` is set, the raw event envelope
is also forwarded. Again: nothing here feeds a metric yet.
