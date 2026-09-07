# Metrics Dashboard Prototype

Prototype app for measuring DORA and delivery-flow metrics. GitHub is one source
connector, not the product boundary.

The backend stays separate from the frontend because it owns secrets, source queries,
webhook handling, and future persistence. For now the same server serves both: the first
load is server-rendered HTML, then Vue takes over in the browser.

Rationale for every choice below is in [`docs/decisions.md`](docs/decisions.md) (referenced
as D1–D18); architecture and roadmap in [`arch-and-execution/`](arch-and-execution/) and
[`docs/future-plan.md`](docs/future-plan.md).

## Currently Deployed Version

Live prototype: **<https://metrics-prototype.vercel.app>**

| Username | Password | Lands on |
| --- | --- | --- |
| `admin` | `admin` | Manager view, with tabs to switch to Executive |
| `manager` | `manager` | Manager view — distributions, evidence rows, sample sizes |
| `executive` | `executive` | Executive view — headline, band, and caveats |

Throwaway prototype credentials, deliberately public so the deployment can be handed to a
reviewer. Not an access-control mechanism; a real deployment uses organisational SSO (D18).

> [!NOTE]
> The prototype ships pointed at an **arbitrary public repository**
> ([`advaitpaliwal/feynman`](https://github.com/advaitpaliwal/feynman)) purely so the
> dashboard has something to render on first load — nothing is bound to it. Type any public
> repository into the search box, `owner/repo` or a full GitHub URL, and press **Run** to
> compute all seven metrics against that one instead. **Default** returns to the shipped
> repo. Large or old repositories are slow on first load and can exhaust the hourly GitHub
> API budget — see [Why This Won't Scale](#why-this-wont-scale).

## Setup

Requires Node.js 18+ and a GitHub token. There are no runtime or dev dependencies, so
`npm install` is optional.

```bash
git clone https://github.com/MoeFarag/metrics.git
cd metrics
cp .env.example .env.local   # then set GITHUB_TOKEN in .env.local
npm test                     # 50 tests, no network access needed
npm run dev:local            # serves on http://127.0.0.1:3000
```

Open <http://127.0.0.1:3000> and log in with any account from the table above. The
dashboard computes metrics for the repository named in `.env.local`; use the search box to
point it at any other public repository.

`.env.example` ships with working defaults for everything except `GITHUB_TOKEN`. Without a
token GitHub allows 60 requests/hour, which a single refresh exhausts immediately — create
one at [github.com/settings/tokens](https://github.com/settings/tokens) with `public_repo`
scope (add `repo` for private repositories).

`npm run dev:local` runs the same handlers Vercel runs, without Vercel authentication; it
loads `.env` then `.env.local`, and shell variables win. Use `HOST=0.0.0.0 PORT=3000` to
reach it from another machine, or `npx vercel dev` for the real routing layer.
`npm run lint` runs `node --check` over every source file.

### Environment

Only `GITHUB_OWNER` and `GITHUB_REPO` are required, plus the `AUTH_*` pairs to log in.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GITHUB_OWNER` / `GITHUB_REPO` | — | Default repository (required) |
| `GITHUB_TOKEN` | — | Optional but effectively required: unauthenticated GitHub allows 60 req/hr against a ~750–900 call refresh |
| `METRICS_WINDOW_DAYS` | `60` | Lookback window |
| `METRICS_CONCURRENCY` | `8` | Parallel GitHub calls |
| `METRICS_CACHE_ENABLED` / `METRICS_CACHE_TTL_MS` | `true` / `60000` | In-process memoisation; latency only, never a source of truth |
| `DATA_CONFIDENCE_THRESHOLD` | `0.7` | Below this, a metric renders as low confidence |
| `REQUIRED_CHECKS` / `REQUIRED_CHECK_SET_VERSION` | — / `unversioned` | Merge-blocking check names for M6/M7, and the version stamped on every response (D14) |
| `GITHUB_WEBHOOK_SECRET` / `GITHUB_ALLOWED_EVENTS` / `WEBHOOK_FORWARD_URL` | — | Webhook signature verification, inbound allowlist, forwarding target |
| `WRAPPER_API_TOKEN` | — | Bearer token protecting the wrapper endpoints |
| `AUTH_{ADMIN,MANAGER,EXECUTIVE}_USERNAME` / `_PASSWORD_HASH` | — | Prototype login gate; hashes are base64 |

Hashing goes through `src/hash-service.js` so the algorithm can be swapped without
rewriting the login flow.

## Data Sources

**One source system: the GitHub REST API v3**, read live at request time for the repository
the user enters. No database, no ingest job, no scheduled sync, no vendored dataset (D8).

| GitHub endpoint | Feeds |
| --- | --- |
| `/repos/{o}/{r}` | Repo header, default branch |
| `/releases` | Production-deploy signal for M1, M2, M3 (D1) |
| `/commits`, `/commits/{ref}`, `/compare` | Release-to-commit resolution, revert detection (D2, D16) |
| `/pulls` | Merged-PR population for M2, M4, M5 |
| `/pulls/{n}/files` | PR size distribution, M4 (D11) |
| `/pulls/{n}/reviews`, `/pulls/{n}/commits` | Review round trips, M5 |
| `/issues` | Labelled incident/hotfix signals for change failure rate, M3 (D5) |
| `/actions/workflows`, `/actions/runs`, `/actions/runs/{id}/jobs`, `/actions/runs/{id}/attempts/{n}` | Time to signal (M6), rerun and first-attempt pass rate (M7) |

Deliberately **not** used: the Deployments API (D1) and the branch-protection API (D14) —
the required-check set comes from `REQUIRED_CHECKS` config instead.

A webhook receiver exists at `POST /api/webhooks/github`, but **it feeds no metric** and
persists nothing; push-event ingestion is Phase 2 (D7). Source integrations sit behind
adapter boundaries so GitLab, Jira, CI/CD, or incident tooling can join GitHub later.

## Live vs. Seeded Metrics

**All seven metrics are live. None is seeded, mocked, or backed by fixture data.** Every
number is computed on demand from the GitHub API for the repository you enter, on each load.

| # | Metric | Family | Status | Source of the number |
| --- | --- | --- | --- | --- |
| M1 | Deployment Frequency | DORA | **Live** | Releases in window |
| M2 | Lead Time for Changes | DORA | **Live** | Merged PRs to resolving release |
| M3 | Change Failure Rate | DORA | **Live** | Labelled issues/PRs and revert commits vs releases |
| M4 | PR Size Distribution | Flow | **Live** | Per-PR `files` additions and deletions |
| M5 | Review Round Trips | Collaboration | **Live** | Per-PR reviews interleaved with pushes |
| M6 | Time to Signal | CI Platform | **Live** | Actions runs and jobs |
| M7 | Rerun Rate & First-Attempt Pass Rate | CI Platform | **Live** | Actions run attempts |

Static content exists, but none of it is a metric value: the registry copy (names,
families, pairings, questions), the limitations list, the authored "What it means /
Definition / Calculation" text on executive cards, the loading shells shown before
`/api/metrics/summary` responds, and the prefilled repository address.

Two DORA metrics are **not built** and do not appear — Failed Deployment Recovery Time and
Deployment Rework Rate — cut for convention risk rather than effort: without incident
tooling, "time to restore" degrades into "time to next release" (D6).

Metrics also degrade honestly rather than silently. No qualifying releases renders a
no-release state instead of zeros, change failure rate is never shown without its label
coverage beside it (D9), and a metric below the confidence threshold suppresses itself.

## The One Thing I'd Change Next

**Replace on-the-fly computation with a persisted event and metric store, behind a storage
adapter.** Everything else on the limitations list is a definitional argument that more
code cannot settle; this one is mechanical, and it decides whether a second team can use
the tool at all.

In shipping order:

1. **Cache the two expensive calls on immutable keys** — `compare` on
   `(base_sha, head_sha)`, PR files on `(pr_number, merge_commit_sha)`. Both are
   permanently valid once historical, so they never need invalidation.
2. **Bound the pull-request walk** so it stops once the `updated` cursor passes the window
   start, instead of reading the entire closed-PR history on every load.
3. **Persist metric rows with provenance** — the ruleset and `REQUIRED_CHECK_SET_VERSION`
   in force at computation time — so a config change stops silently re-basing history (D14).
4. **Recompute incrementally**, refreshing only buckets touched since the last run.

## Views

Two views, mapped onto the prototype roles (D15):

- **Manager** (default for everyone) — distributions, evidence rows, sample sizes, and
  per-metric drill-downs.
- **Executive** — the same seven metrics with narrative framing, bands, and caveats,
  stopping at the number rather than the rows behind it.
- **Admin** switches between both via the view tabs.

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
- `GET /api/metrics/summary?repo=&window=&include_prior_window=` — all seven metrics for one
  repository. `repo` accepts `owner/repo` or a GitHub URL; `window` accepts `60` or `60d`;
  `include_prior_window` enables direction and roughly doubles the call count.

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

GitHub requires an authenticated token with permission to manage hooks for the repository. Only laying down the foundations.

### Webhook Receiver

Point GitHub at `https://your-vercel-app.vercel.app/api/webhooks/github`. When
`GITHUB_WEBHOOK_SECRET` is set, the receiver validates `X-Hub-Signature-256`; verified
events are normalized and returned, and forwarded raw if `WEBHOOK_FORWARD_URL` is set.
Again: nothing here feeds a metric yet.


## Why This Won't Scale

Each load recomputes all seven metrics from scratch — roughly **750–900 calls for a cold
60-day refresh** (D8) against 5,000/hour, about four refreshes an hour. That is the
optimistic case, for five reasons:

- **The PR walk is unbounded by the window.** `loadMergedPullRequests` pages all closed
  PRs and filters in memory, with no early stop. Cost scales with repository age rather
  than window size, so narrowing to 7 days saves nothing.
- **Fan-out is multiplicative.** Each merged PR costs three calls (files, reviews,
  commits), each itself paginated. Each Actions run costs two calls per attempt, so M7 gets
  more expensive in exactly the repositories whose rerun rate is worst.
- **The cache cannot survive a request.** `MemoCache` is constructed inside the handler and
  dies with the response. The keys are already immutable and stored with `ttl = Infinity`;
  only the lifetime is wrong, so two consecutive loads share zero work.
- **Concurrency is the wrong axis.** `promisePool` bounds burst rate, not total calls, and
  pagination inside each call is still sequential. The 5,000/hour budget also belongs to
  the token, not the user, so ten people share one bucket.
- **Two multipliers stack.** The dashboard sets `include_prior_window=true` by default,
  roughly doubling the count, and `vercel.json` sets no `maxDuration` — on a large repo the
  wall is likely the function timeout, surfacing as an opaque error rather than a legible
  rate-limit state.

| Scale | What happens |
| --- | --- |
| 1–2 people, small repo | Works as intended. This is the tested case. |
| 1 person, large repo | The PR walk alone risks exhausting the function timeout. |
| A team on one token | ~4 cold refreshes/hour across all users. |
| Multiple repos or org rollup | Not viable — cost is linear in repositories with no shared work. |

Live computation was right for validating whether these seven definitions are worth
keeping. It stops being adequate the moment the prototype succeeds.

## Other Known Limitations

- Change-failure detection depends on labelling discipline, which is why label coverage
  renders at equal weight beside the number (D5, D9).
- Lead time anchors on PR open rather than first commit until the ticket-branch convention
  lands (D17).
- Time to Signal uses the run's `created_at`, so delay between `git push` and GitHub
  queueing the run is invisible (D7).
- The configured required-check set can drift from branch protection; if names match no
  jobs, confidence drops to 0 and the metric suppresses itself (D14).