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

## Currently Deployed Version

Live prototype: **<https://metrics-prototype.vercel.app>**

Sign in with any of the three prototype accounts. The account you choose selects the view
(D15) — see [Views](#views) for what each one shows.

| Username | Password | Lands on |
| --- | --- | --- |
| `admin` | `admin` | Manager view, with tabs to switch to the Executive view |
| `manager` | `manager` | Manager view — distributions, evidence rows, sample sizes |
| `executive` | `executive` | Executive view — headline, band, and caveats |

These are throwaway prototype credentials with base64-encoded hashes, deliberately public
so the deployment can be handed to a reviewer. They are not an access-control mechanism;
a real deployment replaces this gate with organisational SSO (D18).

> [!NOTE]
> The prototype ships pointed at an **arbitrary public repository**
> ([`advaitpaliwal/feynman`](https://github.com/advaitpaliwal/feynman)) purely so the
> dashboard has something to render on first load. There is nothing special about it and
> no data is bound to it. Type any public repository into the search box at the top —
> `owner/repo` or a full GitHub URL — and press **Run** to compute all seven metrics
> against that repository instead. **Default** returns to the shipped repo.
>
> Larger and older repositories take noticeably longer on first load, and can exhaust the
> hourly GitHub API budget; [Why The On-The-Fly Implementation Won't Scale](#why-the-on-the-fly-implementation-wont-scale)
> explains exactly why.

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

## The One Thing I'd Change Next

**Replace on-the-fly computation with a persisted event and metric store, behind a storage
adapter.**

Everything else on the limitations list is a definitional argument that more code cannot
settle. This one is purely mechanical, it is the constraint that decides whether a second
team can use the tool at all, and it gets harder to retrofit the longer the metric surface
grows against a live-read assumption.

The change, in the order I'd ship it:

1. **Cache the two expensive calls on immutable keys.** `compare` keyed on
   `(base_sha, head_sha)` and PR files keyed on `(pr_number, merge_commit_sha)` are both
   permanently valid once the SHAs are historical — they can never need invalidation. This
   is the cheapest step and removes the largest share of repeat call volume.
2. **Bound the pull-request walk.** Page `/pulls` only until the `updated` cursor passes
   the window start, instead of walking the repository's entire closed-PR history on every
   load (see the next section).
3. **Persist computed metric rows with provenance** — the exclusion ruleset and
   `REQUIRED_CHECK_SET_VERSION` in force at computation time — so a config change stops
   silently re-basing the displayed history (D14), and a force-moved tag stops changing a
   historical number between two loads (D2).
4. **Recompute incrementally**, refreshing only buckets touched since the last run rather
   than rebuilding the full window each load.

On Vercel this points at a managed store — Turso/libSQL, Vercel Postgres, or Neon — never a
bundled SQLite file, since serverless functions have no durable local disk.

**Why it was correct to defer it, and why deferring costs nothing retroactively.** Every
one of the seven metrics is a pure function of the repository's current API state over a
lookback window; none depends on an event having been captured at the moment it occurred.
Releases, PRs, reviews, PR commits, PR files, issues, runs, jobs, and attempts are all
retrievable retrospectively. There is no "cannot be backfilled" hazard, so adding the store
later is a pure performance and reproducibility change with no gap in history. Building it
first would have meant committing to a schema before knowing whether these metric
definitions were worth keeping. Full reasoning in `docs/decisions.md` (D8).

## Why The On-The-Fly Implementation Won't Scale

Each dashboard load recomputes all seven metrics from the GitHub API from scratch. The
documented cost is roughly **750–900 calls for a cold 60-day refresh** (D8), against an
authenticated budget of 5,000 requests/hour — about four refreshes an hour. That figure is
the optimistic case. Five properties of the current implementation make it degrade faster
than a per-load average suggests.

### 1. The pull-request walk is unbounded by the window

`loadMergedPullRequests` (`src/metrics/pr-loader.js`) calls `requestAllPages` on `/pulls`
with `state=closed`, then filters to the window **in memory**. `requestAllPages`
(`src/github-wrapper.js`) follows every `next` link with no page cap and no early
termination, one page at a time.

The GitHub pulls API has no date filter, so client-side filtering is the right call — but
the results are already sorted `updated desc`, and the walk does not stop when the cursor
passes the window start. It reads the repository's **entire closed-PR history** on every
load, at 100 per page, sequentially.

The consequence is that the dominant cost term scales with **repository age, not window
size**. A 60-day window on a repo with 4,000 closed PRs costs ~40 sequential round trips
before a single metric is computed; the same window on a 40,000-PR repo costs ~400. The
repository prefilled in `.env.example` is `vercel/next.js`, which is firmly in the second
category. Narrowing the window to 7 days does not reduce this at all.

### 2. Fan-out is multiplicative, and one metric's fan-out grows with the problem it measures

Per merged PR in the window, `loadPullRequestDetails` issues **three** calls — files,
reviews, commits — and each is itself a full `requestAllPages`, so a 400-file PR is four
pages on its own.

The Actions path is worse in an instructive way. `loadActionsWindow`
(`src/metrics/actions.js`) issues **two calls per run attempt** — the attempt and its jobs
— and iterates attempts sequentially per run. A run that was rerun three times costs six
calls instead of two. M7 exists to measure rerun rate, so **the metric gets more expensive
in exactly the repositories where its number is worst**. A CI reliability problem shows up
first as a rate-limit failure in the tool meant to diagnose it.

To its credit the runs list does filter server-side (`created: >=window_start`), so this
term is genuinely window-bounded — unlike the PR walk above.

### 3. The cache cannot survive a request

`MemoCache` is constructed inside the request handler (`api/metrics/[...path].js`), so it
is destroyed when the response is sent. The PR-resource keys are already written in the
correct immutable form — `pull:{number}:{merge_commit_sha}:{kind}`, stored with
`ttl = Infinity` — and that TTL is meaningless in practice, because nothing is left alive
to read it. Two consecutive loads of the same repository share **zero** work.

This is the single largest gap between the current behaviour and the intended one. The keys
are right; only the lifetime is wrong. Step 1 above is mostly a matter of pointing existing
keys at a store that outlives the invocation.

### 4. Concurrency is the wrong axis, and the budget is shared

`promisePool` bounds item fan-out at `METRICS_CONCURRENCY` (default 8), which controls
burst rate but not total calls. Pagination inside each call is still strictly sequential —
a `do/while` awaiting each page — so latency on a wide window is dominated by serial round
trips that concurrency never touches. Raising the limit only reaches the rate limit sooner.

More fundamentally, the 5,000/hour budget belongs to the **token**, not the user. Ten
people on one dashboard share one bucket, so per-user cost is not amortised — it is
additive against a fixed ceiling. The tool gets less reliable precisely as adoption grows,
which is the opposite of the property you want in something teams are meant to trust.

### 5. Two multipliers stack on top of all of it

The dashboard sets `include_prior_window=true` on every load, which computes the prior
60 days for direction and **roughly doubles** the call count — and it is on by default, not
opt-in. Separately, `vercel.json` sets no `maxDuration`, so a cold refresh doing hundreds
of largely sequential round trips runs against the platform's default function timeout. On
a large repository the wall is likely to be the timeout rather than the rate limit, which
surfaces as an opaque function error rather than a legible "rate limited" state.

### Where it breaks, in order

| Scale | What happens |
| --- | --- |
| 1–2 people, small repo | Works as intended. This is the tested case. |
| 1 person, large repo (`vercel/next.js`) | The unbounded PR walk alone risks exhausting the function timeout before metrics compute. |
| A team on one shared token | ~4 cold refreshes/hour across *all* users; the fourth person to open the dashboard gets rate-limited. |
| Multiple repos or an org rollup | Not viable. Cost is linear in repositories with no shared work, and D15's Executive view wants org trend — the view the roadmap points at is the one this model cannot serve. |

The honest summary: live computation was the right call for validating whether these seven
definitions are worth keeping, and it is load-bearing for nothing beyond that. It stops
being adequate at the exact moment the prototype succeeds — a second team, a second
repository, or an executive asking for a trend across both.

## Other Known Limitations

Each of these has a decision entry rather than an open question:

- Change-failure detection depends on labelling discipline, which is why label coverage is
  rendered at equal weight beside the number (D5, D9).
- Lead time still anchors on PR open rather than first commit, until the ticket-branch
  convention lands (D17).
- Time to Signal's push timestamp is the workflow run's `created_at`, so any delay between
  `git push` and GitHub queueing the run is invisible (D7).
- The configured required-check set can drift from actual branch protection; if the names
  match no jobs, confidence drops to 0 and the metric suppresses itself (D14).

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
