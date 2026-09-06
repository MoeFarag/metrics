# Implementation Plan — Prototype Metrics Dashboard

Rationale, alternatives, and the reasoning behind every choice below live in
`decisions.md`. This document does not repeat them — it says what to call, what to
compute, what to draw, and what to test. Where a line here rests on a judgement call,
it cites the decision ID (`D1`…`D16`).

Everything deliberately excluded from this build is in `future-plan.md`.

---

## 1. Scope

**Seven metrics. Three DORA, four non-DORA. One source: the GitHub REST API.**
The user enters a public GitHub repository URL in the frontend; the backend parses and
normalises it, then runs the metrics through the same GitHub wrapper. The configured
`GITHUB_OWNER` / `GITHUB_REPO` values are only defaults for initial load and smoke tests.

| # | Metric | Family | GitHub surface | Pair |
|---|---|---|---|---|
| M1 | Deployment Frequency | DORA | Releases | — |
| M2 | Lead Time for Changes | DORA | Pulls + Releases + Compare | — |
| M3 | Change Failure Rate | DORA | Compare + Issues + Pulls | — |
| M4 | PR Size Distribution | SPACE / `flow` | Pulls + PR Files | ↔ M5 |
| M5 | Review Round Trips | SPACE / `collaboration` | PR Reviews + PR Commits | ↔ M4 |
| M6 | Time to Signal | SPACE / `ci-platform` | Actions Runs + Jobs | ↔ M7 |
| M7 | Rerun Rate & First-Attempt Pass Rate | SPACE / `ci-platform` | Actions Runs (attempts) | ↔ M6 |

**Why these seven.** All run on the connector that already exists (`src/github-wrapper.js`
already wraps repo, issues, pulls, commits, workflows, runs, jobs, artifacts, hooks).
None needs an HRIS, a work tracker, an incident tool, a survey, or observability. The
build is therefore gated on extraction and modelling quality, not on integration access
or on another team's labelling discipline — with one exception, M3, whose label
dependency is called out explicitly and displayed as a confidence figure rather than
hidden (D9).

**Deliberately out of scope for the prototype:** Failed Deployment Recovery Time and
Deployment Rework Rate (the other two DORA metrics), datastore-backed history, and
webhook subscription setup — see `future-plan.md` §2 for why and what would have to be
true first.

### Pairing rule

M4/M5 and M6/M7 are **tension pairs**: each throughput metric is coupled to a partner
that degrades if the first is gamed. Neither throughput metric ships without its
partner on the same screen, not one layer deeper (D12). The DORA three carry their
tension internally — frequency against failure rate — and are always shown together.

---

## 2. Shared Foundations

### 2.1 Time window

**Default: a rolling 60 days back from `now`.** Configurable via
`METRICS_WINDOW_DAYS` (default `60`). Every endpoint below is filtered to this window;
where GitHub offers no server-side date filter, paginate newest-first and stop on the
first record older than `window_start` (D13).

Two derived windows are used for reporting:

- **Trend buckets:** ISO weeks, aligned to Monday.
- **Direction comparison:** the current 60 days against the prior 60 days. Fetching the
  prior window roughly doubles the call count, so the frontend explicitly requests it
  for dashboard loads. Until requested, `direction` reports `not_computed`.
  The third noise gate (§2.5) is unaffected — its MAD is computed across the weekly
  buckets *inside* the displayed window, so it needs no extra fetching and no history.

### 2.2 API conventions

- Header: `X-GitHub-Api-Version: 2022-11-28`; `Accept: application/vnd.github+json`.
- Auth: `GITHUB_TOKEN` (PAT or App token). Phase one uses a read-only token for public
  repositories. Budget 5,000 req/hr. The dashboard can technically call public endpoints
  without a token, but the unauthenticated 60 req/hr budget is too small for this plan.
- Pagination: `per_page=100`, follow the `Link` header — never guess page counts.
- **Computed live on every load — no database, no ingest job, no event history** (D8).
  Every metric here is a pure function of the repo's current API state over the window;
  none needs an event captured at the moment it happened.
- **In-process memoisation** is the only caching layer: a request-URL-keyed map with a
  TTL, shared across the metrics in one load and reused across loads while the process
  lives. It is a latency device, never a source of truth — an empty cache must change
  timing only, never a number. Entries that are permanently valid once their SHAs are
  historical (`compare` on `(base_sha, head_sha)`, PR files on
  `(pr_number, merge_commit_sha)`) get an unbounded TTL; list endpoints get a short one.
- Re-resolution hazard (D2): SHAs are resolved fresh on every load, so a force-moved tag
  or deleted branch can change a historical number between two loads. Accepted at
  prototype scale — surface a `computed_at` timestamp on every response so a shifted
  number is at least attributable.

### 2.3 Computation shapes

There are no tables. These are the in-memory structures each load builds and discards —
listed because the metric specs below refer to them by name, not because anything is
persisted.

```
releases[]        id, tag_name, resolved_sha, published_at, draft, prerelease
release_windows[] release_id, prev_release_id, start_sha, end_sha,
                  window_start_ts, window_end_ts, commit_shas[]
pull_requests[]   number, created_at, merged_at, closed_at, merge_commit_sha,
                  base_ref, labels[], title, author_login, author_type
pr_size[]         pr_number, additions_raw, deletions_raw,
                  additions_filtered, deletions_filtered,
                  files_changed_filtered, is_revert, is_mechanical
pr_review_cycle[] pr_number, cycle_index, review_event_at, reviewer_type,
                  next_push_at, commits_in_cycle
issues[]          number, labels[], created_at, closed_at
ci_run[]          run_id, workflow_id, workflow_name, head_sha, head_branch,
                  run_attempt, event, created_at, run_started_at,
                  updated_at, conclusion
ci_job[]          job_id, run_id, name, started_at, completed_at, conclusion
ci_signal[]       head_sha, push_at, first_check_started_at, queue_seconds,
                  time_to_red_seconds, time_to_green_seconds, outcome
```

`release_windows` is derived once per load and is the spine of M1, M2, and M3.
`ci_signal` is the spine of M6 and M7.

### 2.3.1 What a load costs

Live computation is affordable at prototype scale and not beyond it. Rough call counts
for one cold full refresh over 60 days on a repo doing ~35 releases, ~80 merged PRs,
and ~400 push-triggered runs:

| Source | Calls | Driver |
|---|---|---|
| Releases list + tag resolution | ~55 | 1 per release |
| `compare` per release window | ~50 | 1 per window |
| Pulls list | ~2 | pages of 100 |
| PR files (M4) | ~125 | 1+ per merged PR |
| PR reviews + PR commits (M5) | ~240 | 2 per merged PR |
| Actions runs list | ~6 | pages of 100 |
| Run jobs (M6/M7) | ~600 | 1 per run — **the dominant cost** |
| Run attempts (M7) | ~90 | only for rerun runs |
| Issues by label (M3) | ~3 | one call per label (D10) |
| **Total** | **~1,150–1,300** | |

Against the 5,000 req/hr authenticated budget that is roughly **four cold full refreshes
per hour** — fine for the one or two people this prototype is for, and not fine for more.
Three consequences, all mandatory:

1. **Bounded concurrency.** Fetch with a small worker pool (8 is a reasonable default).
   Serially this load takes minutes; in parallel it is well under a minute.
2. **Per-metric endpoints.** `GET /api/metrics/:name` must fetch only what that metric
   needs. Opening one chart should not cost a full refresh — M1 alone is ~55 calls.
3. **Rate-limit visibility.** Read `x-ratelimit-remaining` on every response and surface
   the remaining budget in the UI. Failing a page load halfway through a 1,200-call fan-out
   with no explanation is the worst possible prototype experience.

On Vercel's serverless runtime the in-process cache does not reliably survive between
invocations, so every load may be cold. That is acceptable for the prototype, but the UI
must prefer per-metric loading and visible progress over one monolithic all-metrics
request.

### 2.4 Required-check set

M6 and M7 only count checks that **block merge**. Advisory checks are excluded, or the
metric measures something the developer does not have to care about.

Prototype resolves the required set from config — `REQUIRED_CHECKS` as a comma-separated
list of workflow-job names, with `REQUIRED_CHECK_SET_VERSION` bumped whenever it
changes — rather than from `GET /repos/{o}/{r}/branches/{branch}/protection/required_status_checks`,
which needs admin scope the prototype token may not have (D14).
`REQUIRED_CHECK_SET_VERSION` and `required_check_count` are returned on every response.
With nothing persisted (D8), a config change silently re-bases the whole displayed
history — the version on the response is what makes that change noticeable at all.

If no required-check config exists for the selected repo, the prototype computes M6/M7
from observed Actions jobs per run so the cards do not stay pending. The response must
mark `required_checks_state: "observed_fallback"` and include the observed job names,
because this is a useful prototype estimate rather than verified branch protection.

### 2.5 Noise band — no direction is reported unless it clears all three gates

1. **Minimum sample:** ≥ 30 observations in *each* comparison window. Below that,
   direction renders as "insufficient data", never as an arrow.
2. **Minimum magnitude:** relative change ≥ 10% in the reported statistic.
3. **Beyond historical variation:** change exceeds the metric's own period-to-period
   median absolute deviation over ≥ 8 prior periods. MAD, not standard deviation —
   these distributions are skewed and SD is dragged around by one bad fortnight.

Where a gate fails, say so on the view. "Not enough signal yet" is a trust-building
answer; a defaulted green arrow is not.

### 2.6 Data confidence

Every metric computes and **displays** a coverage figure (per-metric definitions below).
Below `DATA_CONFIDENCE_THRESHOLD` (default 70%) the metric renders in an "insufficient
coverage" state with no band and no direction. A green signal computed on 40% of PRs is
worse than no signal, because it converts missing data into false reassurance.

### 2.7 Shared Limitations Note

Every view includes a collapsible limitations panel fixed to the bottom of the viewport,
expanded by default for the prototype. Content receives enough bottom padding that the
sticky panel does not cover metric cards. It lists the active assumptions and label
conventions:

- Production deploys are GitHub Releases. If no qualifying releases are detected for a
  selected repo, M1/M2/M3 render a clear "no releases detected" state instead of zeros.
- Change-failure signals look for labels or terms matching `hotfix`, `incident`,
  `bug`, and `revert`, plus explicit Git revert commits where detectable.
- Phase one uses live GitHub API reads only. No datastore, no webhook ingestion, and no
  historical snapshots.
- Direction is omitted until explicitly computed and until the sample clears the noise
  gates.
- Required-check metrics need a configured required-check list; public repo access alone
  does not reveal which Actions jobs block merge.

### 2.8 Prototype Card Rendering Contract

Every metric card displays its reference ID (\`M1\` through \`M7\`) next to the metric title.
All seven cards render as soon as a repository run starts; each card owns its loading
spinner until the summary response replaces the placeholder shell. The top-right chip is
reserved for direction (\`improving\`, \`flat\`, \`degrading\`, or insufficient data). The band
chip is kept in the bottom metadata area and opens a band-definition modal.

The Details control opens an in-page modal rather than a browser alert. It includes the
metric question, current status, direction, band, sample size, confidence notes, caveats,
and available evidence counts.

---

## 3. The Two Views

The prototype ships **exactly two views**: a **Manager view** for squad leads and
engineering managers, and an **Executive view**. They are two perspectives on the same
data, not two depths of the same report (D15).

| | **Manager view** (squad leads + engineering managers) | **Executive view** |
|---|---|---|
| Question it answers | What do I unblock this week, and is this local or systemic | Where do we invest next quarter |
| Horizon | Sprint to quarter | Quarter, with prior-quarter comparison |
| Grain | Repo and service; individual PRs, runs, and releases by name | Org trend only |
| Numbers | Full distributions — p50/p75/p90 shown together so shape is visible | Headline statistic plus band and direction |
| Drill-down | Full, to the specific PR / run / release, linkable to GitHub | To the metric and its caveats — not to raw rows |
| Comparison | Own trend over time, and across repos framed as shared bottlenecks | Against stated target bands, never against peers |
| Auth role | `manager` (and `admin`) | `executive` (and `admin`) |

### 3.1 The disclosure model

Both views resolve the same objects at different depths — not two different reports.

- **Layer 1 — Signal.** Category-level state, two axes. Executive default.
- **Layer 2 — Number.** Value, trend line, noise band, sample size, data confidence.
  One interaction away from Layer 1, **always reachable**.
- **Layer 3 — Evidence.** The rows behind the number: specific PRs, runs, releases.
  Manager view default; reachable from the Executive view only down to Layer 2.

The rule that makes this work: **the number is never hidden, only deferred.** An
executive who wants the figure gets it from the platform with its caveats attached,
rather than from a screenshot in a meeting without them.

### 3.2 Signal state model (executive view)

Two axes rather than a single traffic light.

- **Band** — `healthy` (within agreed target range) / `watch` (outside, not materially)
  / `poor` (materially outside).
- **Direction** — over rolling 60 days vs. prior 60 days, subject to §2.5:
  `improving` / `flat` / `degrading`.

Six states. `poor / improving` and `healthy / flat` are both broadly fine and read
completely differently. `healthy / degrading` is the early-warning state a single
traffic light hides entirely.

**Category rollup is rule-based, never a weighted composite** — no hidden scoring:

- Band = the **worse** of the constituent bands.
- `degrading` if **either** metric in a pair degrades.
- `improving` only if both improve, or one improves and the other is flat.
- `flat` otherwise.

The asymmetry is the point. An improvement in one half of a tension pair with the other
half degrading is exactly what gaming looks like, and must not surface as an
improvement. Each signal displays its own derivation in plain text, e.g. *"Watch,
degrading — PR size improved but review round trips degraded beyond the noise band."*

### 3.3 Standing view constraints

1. No metric at individual grain, in any view, for any reason. No author-level cuts.
2. No repo-by-category grid on the executive view. It is a leaderboard with extra steps.
3. Every throughput metric ships with its tension partner on the same screen.
4. Data confidence is displayed, not merely tracked.
5. Interpretation guidance for M4 and M5 is printed **on the view**, not in a wiki.

---

## 4. Metric Specifications

Each spec follows the same six-part shape: **Raw data → API calls → Calculation →
Result shape → Views & visualisation → Test plan.**

---

### M1 · Deployment Frequency (DORA)

**Definition.** How often the pipeline puts a change into production. A GitHub Release
created by CI at the deploy commit is the sole production marker; the Deployments API is
not used (D1).

#### Raw data
Published, non-draft, non-prerelease releases in the window, each resolved to a commit
SHA.

#### API calls
```http
GET /repos/{owner}/{repo}/releases?per_page=100
   → paginate via Link; stop at the first release with published_at < window_start
   → keep only  draft == false  AND  prerelease == false        (D3)
   → timestamp field: published_at   (not created_at)           (D3)

GET /repos/{owner}/{repo}/commits/{tag_name}
   → one per kept release; .sha is resolved_sha                 (D2)
   → do NOT read target_commitish — it is usually a branch name
```
*Cost:* ~1 + N calls, N = releases in 180 days. Cached permanently per tag.

#### Calculation
```
releases_q  = kept releases, published_at ∈ [window_start, now), sorted ascending
gap[i]      = releases_q[i].published_at − releases_q[i−1].published_at
deploys_per_week[w] = count(releases_q where iso_week(published_at) == w)

headline    = median(deploys_per_week)         over the 13 weeks in the quarter
gap_p50     = median(gap)   in hours
gap_p85     = p85(gap)      in hours
```
Report the **gap distribution**, not a mean interval — a burst of hotfix releases or one
long quiet stretch distorts a mean badly (D3).

**Band thresholds** (DORA-standard, `config/target-bands.json`, see §8 open decision 1):
elite ≥ 1/day · high ≥ 1/week · medium ≥ 1/month · low < 1/month.

**Data confidence:** `releases_with_resolved_sha / releases_kept`. A tag that no longer
resolves (deleted or force-moved) drops the release from every downstream metric.

#### Result shape
```json
{
  "metric": "deployment_frequency",
  "window": { "start": "2026-06-08T00:00:00Z", "end": "2026-09-06T00:00:00Z" },
  "headline": { "value": 4.0, "unit": "deploys/week", "band": "high" },
  "gap_hours": { "p50": 41.2, "p85": 96.0 },
  "trend": [ { "week_start": "2026-06-08", "deploys": 3 } ],
  "direction": "improving",
  "direction_basis": "4.0 vs 2.8 deploys/week prior quarter, +43%, clears MAD band",
  "sample_size": 52,
  "data_confidence": 1.0
}
```

#### Views & visualisation

| View | Visualisation | Content |
|---|---|---|
| **Manager** | **Weekly column chart** of deploy count, 13 bars, with a **rug strip** underneath marking each individual release | Hovering a bar lists that week's releases by tag with `published_at`; each links to the GitHub release page. Secondary small-multiple: **histogram of inter-release gaps** in hours, with p50/p85 marked — this is where a "we deploy 4×/week" number gets exposed as four deploys on Thursday afternoon. |
| **Executive** | **Sparkline + band chip.** One line, 13 points, no axis clutter, with the headline number large beside it and a `high / improving` chip | Layer 2 opens the same weekly column chart with the noise-band derivation printed underneath. No release list. |

Never show a single average interval as the headline. The gap histogram is the honest
picture and it belongs on the Manager view by default.

#### Test plan

*Unit (fixture-driven, no network):*
1. **Filter correctness** — fixture with 6 releases: 1 draft, 1 prerelease, 1 published
   before `window_start`, 3 valid → expect exactly 3 counted.
2. **Timestamp choice** — a release where `created_at` and `published_at` differ by 5
   days must bucket by `published_at`.
3. **Gap maths** — releases at T, T+1h, T+1h, T+200h → `p50 == 1h`, `p85 == 200h`;
   verifies zero-gap same-instant releases do not divide by zero and that the mean
   (67h) is *not* what gets reported.
4. **Empty window** — zero releases → headline `0`, direction `insufficient data`,
   no crash, no `NaN` in the JSON.
5. **Week bucketing** — a release at Sunday 23:59 UTC and one at Monday 00:01 UTC land
   in different ISO weeks.

*Integration (recorded fixtures / `nock`):*
6. **Pagination** — 250-release fixture across 3 `Link`-chained pages; assert all 3
   pages fetched and the walk **stops** on the page containing the first out-of-window
   release rather than draining all pages.
7. **Tag resolution** — annotated tag and lightweight tag fixtures both resolve to the
   right SHA; `target_commitish` set to `"main"` must never appear as a `resolved_sha`.
8. **Resolution failure** — 404 on `commits/{tag}` marks the release
   `resolved_sha: null`, excludes it, and lowers `data_confidence` — it does not throw.

*Acceptance (live repo, manual):*
9. Run against the real repo; the release count for the quarter must equal the count on
   the GitHub Releases page filtered to the same dates. Reconcile by hand once. Any
   discrepancy is a filter bug, not a rounding issue.

---

### M2 · Lead Time for Changes (DORA)

**Definition.** Time from a change being proposed to that change running in production.
Measured PR-open → release-published, because this repo squash-merges and the squash
commit's author date collapses the whole review window (D4).

#### Raw data
Merged PRs in the window, plus the commit list of every release window, joined on merge
commit SHA.

#### API calls
```http
GET /repos/{owner}/{repo}/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=100
   → paginate; stop when updated_at < window_start
   → keep only merged_at != null
   → fields: number, created_at, merged_at, merge_commit_sha, labels, user.type

GET /repos/{owner}/{repo}/compare/{prev_resolved_sha}...{resolved_sha}
   → one per release_windows row; .commits[].sha is that release's commit list
   → cache on (base_sha, head_sha) — immutable once both are historical
   → NOTE: compare returns at most 250 commits; if .total_commits > 250, page the
     range with GET /commits?sha=head&since=&until= as a fallback              (D16)
```
*Cost:* ~N releases + M/100 PR pages. The `compare` calls dominate; cache hard.

#### Calculation
```
for each release_window rw:
    for each sha in rw.commit_shas:
        pr = pull_requests where merge_commit_sha == sha    -- 1:1 under squash-merge
        if pr is null: increment unmatched_commits ; continue
        lead_time(pr) = rw.window_end_ts − pr.created_at    -- release published − PR opened

headline  = median(lead_time)   over PRs shipped in the window
p85       = p85(lead_time)
weekly[w] = median(lead_time for PRs shipped in ISO week w)
```
Median and p85, never a mean — a handful of stuck PRs dominate the average (D4).

**Commits with no associated PR are excluded entirely, not approximated** (D4). Mixing
commit-author-date semantics into the same median for just those rows would be worse
than a documented gap.

**Band thresholds:** elite < 1 day · high < 1 week · medium < 1 month · low > 1 month.

**Data confidence:** `matched_commits / (matched_commits + unmatched_commits)` — i.e.
the share of shipped commits that came through a PR. This is the headline data-quality
number for the whole platform, not just M2.

#### Result shape
```json
{
  "metric": "lead_time_for_changes",
  "headline": { "value_hours": 62.5, "band": "high" },
  "p85_hours": 214.0,
  "trend": [ { "week_start": "2026-06-08", "p50_hours": 71.0, "p85_hours": 190.0, "n": 9 } ],
  "direction": "flat",
  "direction_basis": "62.5h vs 66.1h prior quarter, −5%, inside noise band",
  "sample_size": 118,
  "data_confidence": 0.94,
  "unmatched_commits": 7
}
```

#### Views & visualisation

| View | Visualisation | Content |
|---|---|---|
| **Manager** | **Weekly p50/p85 band chart** — a line at p50 with a shaded p50→p85 ribbon — beside a **PR-level scatter** (x = merge date, y = lead time, log scale) | The scatter is the actionable object: the outliers are individually clickable and each opens the PR. Log-y matters — without it every point below the p85 collapses into a stripe. A side panel lists the 10 longest-lead-time PRs in the quarter. |
| **Executive** | **Sparkline of p50 with the p85 as a second, lighter line** and a band chip | Two lines, not one: an executive who sees only the median will not know that the tail is a week long. Layer 2 adds the noise-band derivation and the `data_confidence` figure. No PR list, no scatter. |

#### Test plan

*Unit:*
1. **Basic lead time** — PR created T, merge commit in a release published T+50h →
   `50h`. Assert the squash commit's own author date is *not* consulted.
2. **PR shipped in the second release, not the first** — merge commit present only in
   window 2's commit list → lead time anchors on release 2's `published_at`.
3. **Unmatched commit** — a commit in a release with no matching `merge_commit_sha`
   increments `unmatched_commits`, is absent from the distribution, and lowers
   `data_confidence`. Explicitly assert it is not silently dropped.
4. **Percentiles** — 10 PRs at 1h and 1 PR at 1000h → `p50 == 1h`, and the reported
   headline is not the ~91h mean.
5. **Reopened PR** — closed, reopened, merged: `created_at` is the original open time,
   not the reopen time.
6. **Never-shipped merged PR** — merged but no release yet contains it → excluded from
   the distribution, and counted separately as `merged_not_shipped`, not counted as
   zero lead time.

*Integration:*
7. **Compare cache** — two runs over the same window issue the `compare` call once;
   assert the second run makes zero network calls for cached SHA pairs.
8. **250-commit truncation** — fixture with `total_commits: 400` triggers the
   `/commits` fallback path and yields all 400 SHAs (D16). This is the single most
   likely silent-undercount bug in the build.
9. **Force-push orphan** — `compare` returning 404 for a SHA pair drops that release
   from the metric and lowers `data_confidence`; it must not throw and must not silently
   report a smaller denominator with no explanation.

*Acceptance:*
10. Pick three real merged PRs by hand, compute PR-open → release-published from the
    GitHub UI, and match the stored value exactly. Do this before showing anyone.

---

### M3 · Change Failure Rate (DORA)

**Definition.** Share of production deployments that caused a degraded service requiring
remediation. Releases carry no status field, so failure is a **defined convention**, not
a discovered fact (D5).

#### Raw data
Release windows with their commit lists, incident-labelled issues, hotfix-labelled PRs,
and revert commits.

#### API calls
```http
# reuses M2's compare results — no new calls for the revert scan

GET /repos/{owner}/{repo}/issues?labels=incident&state=all&since={window_start}&per_page=100
GET /repos/{owner}/{repo}/issues?labels=bug&state=all&since={window_start}&per_page=100
# plus configured aliases if supplied later, one label per call because GitHub label
# filters are AND semantics, not OR semantics.
   → THREE separate calls, unioned client-side. GitHub's `labels` parameter is AND,
     not OR — `labels=incident,bug` returns only issues carrying both labels,
     which in practice is none.                                              (D10)
   → the issues endpoint also returns PRs; drop any item having a `pull_request` key

# hotfix PRs come from M2's already-fetched pull_requests list, filtered on labels
```

#### Calculation
For each `release_windows` row, `is_failed = true` if **any** of (D5):
```
1. REVERT   the NEXT release's commit list contains a commit whose message matches
            /^Revert "/ and whose reverted SHA is in THIS release's commit list
2. INCIDENT an issue labelled incident|bug has
            created_at ∈ [window_start_ts, window_end_ts)
3. HOTFIX   a PR labelled `hotfix` or `revert` has its merge_commit_sha in the NEXT release's
            commit list
```
```
CFR = count(is_failed) / count(releases in window)
```
Reported as a **rolling 4-week percentage**, not a single cumulative figure — a recent
regression should be visible, not diluted by six months of clean releases.

**Band thresholds:** elite/high ≤ 5% · medium ≤ 10% · low > 15%.

**Data confidence — this is the critical one.** M3 depends on the team using
`incident`/`bug` and `hotfix`/`revert` labels consistently. That is a team-process
prerequisite, not an API limitation (D5, D9).
```
label_coverage = releases with SOME failure signal either way
                 / total releases
```
A quarter where no release carries any signal in either direction is not a 0% failure
rate — it is an unlabelled quarter. **Display the number as "0% — no failure signals
recorded; label coverage 0%", never as a clean green 0%** (D9). This is the single most
misreadable number on the dashboard.

#### Result shape
```json
{
  "metric": "change_failure_rate",
  "headline": { "value_pct": 7.7, "band": "medium" },
  "failed_releases": 4,
  "total_releases": 52,
  "signal_breakdown": { "revert": 2, "incident": 3, "hotfix": 1 },
  "trend": [ { "window_start": "2026-06-08", "cfr_pct": 10.0, "n": 10 } ],
  "direction": "flat",
  "sample_size": 52,
  "data_confidence": 0.62,
  "confidence_note": "Label coverage 62% — 20 of 52 releases carry no failure signal either way"
}
```

#### Views & visualisation

| View | Visualisation | Content |
|---|---|---|
| **Manager** | **Release timeline strip** — one tick per release along the quarter, coloured by outcome (clean / failed / no signal), each failed tick annotated with which of the three signals fired | Under it, a **rolling 4-week CFR line**. Clicking a failed tick opens the evidence: the revert commit, the incident issue, or the hotfix PR that marked it. A **label-coverage bar** sits directly beside the number, same size, not in a footnote. |
| **Executive** | **Percentage with band chip and an explicit coverage caption**, plus the rolling 4-week line | The coverage caption is mandatory and non-dismissible. Layer 2 shows `signal_breakdown` so "our failure rate is 8%" can be read as "and it is mostly reverts, not incidents". No evidence rows. |

Do not use a red/amber/green donut here. A donut invites reading a 0% as an achievement;
the timeline strip makes an unlabelled quarter visually obvious because every tick is
grey.

#### Test plan

*Unit:*
1. **Each condition in isolation** — three fixtures, one per failure condition, each
   marking exactly one release failed and reporting the right `signal_breakdown` key.
2. **Revert SHA scoping** — a `Revert "…"` commit in release N+1 whose reverted SHA
   belongs to release N−3, *not* release N, must **not** mark release N failed. This is
   the easiest condition to implement too loosely.
3. **Double-counting** — a release triggering all three conditions counts as **one**
   failed release, not three.
4. **Window boundaries** — an incident issue created exactly at `window_end_ts` belongs
   to the *next* release's window (interval is half-open `[start, end)`).
5. **Zero-signal quarter** — no labels anywhere → `value_pct: 0`, `data_confidence: 0`,
   and the response carries `confidence_note`. Assert the note is present; a 0% without
   it is a shipping blocker.
6. **Division by zero** — zero releases in window → `null`, not `NaN`, not `0`.

*Integration:*
7. **Label AND-semantics regression** — a fixture where issue A has only `incident` and
   issue B has only `bug`. A single `labels=incident,bug` call returns neither.
   The three-call union must return both. This test exists specifically to stop anyone
   "optimising" the three calls back into one (D10).
8. **PR/issue mixing** — the issues endpoint fixture includes an item with a
   `pull_request` key; assert it is excluded from the incident count.

*Acceptance:*
9. Before this metric is shown to anyone, run the label-coverage figure alone and take
   it to the team. If coverage is under 50%, ship M3 to the Manager view only and hold
   it back from the Executive view until labelling improves — the number is not wrong,
   it is unsupported.

---

### M4 · PR Size Distribution ↔ paired with M5

**Category** `flow` · **SPACE** efficiency · **Grain** repo, service

**Definition.** Size of merged pull requests in lines changed. A **batch-size** metric,
not an effort metric, and never an output metric.

#### Raw data
Merged PRs in the window with per-file additions/deletions, so path exclusions can be
applied before totalling.

#### API calls
```http
# PR list is shared with M2 — no additional list calls

GET /repos/{owner}/{repo}/pulls/{number}/files?per_page=100
   → one per merged PR; paginate (PRs can exceed 100 files)
   → per file: filename, additions, deletions, changes, status
   → NOTE: the pulls LIST endpoint does not return additions/deletions at all;
     they appear only on the single-PR and files endpoints. The files endpoint is
     required regardless, because exclusions are path-based.                  (D11)
   → cache on (pr_number, merge_commit_sha) — immutable after merge
```
*Cost:* 1+ call per merged PR — with M5 this is the heaviest part of a load (§2.3.1).
Memoise on `(pr_number, merge_commit_sha)`, which is permanently valid after merge.

#### Calculation
```
for each file f in pr.files:
    if matches(f.filename, EXCLUSION_GLOBS):  skip
    if f.status == "renamed":                 additions = deletions = 0
    if binary (additions == 0 and deletions == 0 and changes > 0):
                                              count file, contribute 0 lines
    accumulate additions_filtered, deletions_filtered, files_changed_filtered

pr_size = additions_filtered + deletions_filtered

is_revert     = title matches /^Revert "/     → tagged, EXCLUDED from the distribution,
                                                counted separately
is_mechanical = 100% of changed lines fall in whitespace/import-only files
                                              → tagged, filterable, NOT excluded

report p50, p75, p90 per repo per week
     + large_change_share = count(pr_size > LARGE_CHANGE_THRESHOLD) / count(PRs)
```

**Exclusion globs** (`config/pr-size-exclusions.json`, versioned — the version is stored
per row so history can be recomputed deliberately rather than shifting under people):
```
**/package-lock.json  **/yarn.lock  **/pnpm-lock.yaml  **/Gemfile.lock
**/poetry.lock  **/go.sum  **/Cargo.lock
**/*.pb.go  **/*_pb2.py  **/generated/**  **/__generated__/**
**/vendor/**  **/node_modules/**
**/__snapshots__/**  **/*.snap
```
Migrations above a size threshold are **flagged, not silently dropped**. The exclusion
list is a published artifact — teams must be able to see it and propose changes, or they
will not trust the number.

Store **raw and filtered both**, always, so totals reconcile against Git.

`LARGE_CHANGE_THRESHOLD` starts at **400 changed lines** and is recalibrated against the
org's own distribution after the first month.

**Data confidence:** `prs_with_file_data / merged_prs_in_window`.

#### Result shape
```json
{
  "metric": "pr_size_distribution",
  "headline": { "large_change_share_pct": 18.6, "threshold_lines": 400 },
  "percentiles_lines": { "p50": 84, "p75": 260, "p90": 611 },
  "trend": [ { "week_start": "2026-06-08", "p50": 91, "p90": 540, "n": 11 } ],
  "excluded": { "reverts": 3, "mechanical_tagged": 7 },
  "exclusion_ruleset_version": "2026-09-06.1",
  "sample_size": 118,
  "data_confidence": 0.97
}
```

#### Views & visualisation

| View | Visualisation | Content |
|---|---|---|
| **Manager** | **Horizontal box-and-whisker per week** (13 boxes, log-x on lines changed), with **individual points overlaid for PRs above the threshold** | The shape is the message: a fat p90 with a tight p50 is a different problem from a uniformly large distribution. Large PRs are listed by number and title, linked. A toggle shows raw vs filtered so the exclusion ruleset is auditable from the view itself. **M5 renders directly beneath it on the same screen — not a tab.** |
| **Executive** | **Single stacked bar: share of PRs above / below the large-change threshold**, trended as a 13-week stacked area | A percentile is not legible to this audience; a share is. Layer 2 shows the p50/p75/p90 table. **The M5 tile is rendered adjacent, always.** |

**Anti-gaming note, printed on the view:** setting a size target produces stacked
dependent PRs — size drops, review round trips rise, and the wait moves rather than
disappearing. Never set a target on this metric; report the distribution and let it
inform conversation. Never display at author grain.

#### Test plan

*Unit:*
1. **Exclusion application** — a PR of 5 source lines + 3,000 lock-file lines →
   `additions_filtered + deletions_filtered == 5`, and `additions_raw` still records
   3,005. Assert both.
2. **Rename handling** — a `status: "renamed"` file with reported additions/deletions
   contributes 0 lines but is counted in `files_changed_filtered`.
3. **Binary file** — `additions: 0, deletions: 0, changes: 1` contributes 0 lines and is
   counted as a touched file, not dropped.
4. **Revert exclusion** — a PR titled `Revert "Add feature"` is absent from the
   percentiles and present in `excluded.reverts`.
5. **Ruleset versioning** — recomputing the same PR under a changed ruleset produces a
   new row version; the old row is not mutated in place.
6. **Percentiles on a small n** — 3 PRs must not produce a p90 presented as if it were
   stable; assert `sample_size` accompanies every percentile in the payload.

*Integration:*
7. **File pagination** — a 250-file PR fixture across 3 pages totals all 250 files.
   Truncating at 100 silently understates every large PR — exactly the PRs the metric
   exists to find.
8. **Cache invalidation** — changing `exclusion_ruleset_version` in config forces a
   recompute from the cached file data without re-fetching from GitHub.

*Acceptance:*
9. Pick the largest PR of the quarter and reconcile filtered size against the GitHub
   "Files changed" tab with lock files mentally subtracted. Show the exclusion list to
   one squad and record objections before launch.

---

### M5 · Review Round Trips ↔ tension partner for M4

**Category** `collaboration` · **SPACE** communication · **Grain** repo, service

**Definition.** Number of review-then-revise cycles a PR goes through before merge.
Measures **rework in the review loop**, not reviewer diligence.

#### Raw data
Review submission events and branch pushes per merged PR, ordered in time.

#### API calls
```http
GET /repos/{owner}/{repo}/pulls/{number}/reviews?per_page=100
   → per review: submitted_at, state (APPROVED|CHANGES_REQUESTED|COMMENTED),
                 user.login, user.type ("Bot" identifies bot reviewers)

GET /repos/{owner}/{repo}/pulls/{number}/commits?per_page=100
   → per commit: sha, commit.committer.date  (committer, not author — rebases
     preserve author date and would make pushes look older than the review)
```
*Cost:* 2 calls per merged PR, both cacheable on `(pr_number, merge_commit_sha)`.

#### Calculation
```
events = merge(reviews by submitted_at, commits by committer.date), ascending
cycle  = a review event followed by ≥ 1 commit before merged_at

round_trips(pr) = count of such cycles, counting HUMAN reviews only

per cycle, record: review_event_at, reviewer_type, next_push_at, commits_in_cycle
```
Modelling as **cycles rather than a single count** means each loop's timing is available
later for the queue funnel without a schema change.

| Case | Handling |
|---|---|
| Approval with no subsequent commits | 0 round trips — the healthy case |
| Comment-only review, no commits follow | Not a round trip |
| Author pushes before any review | Not a round trip |
| Bot reviews | `reviewer_type: bot`, excluded from the human count, reported separately |
| Auto-format / lint-fix commits after review | Tagged `mechanical`, excluded |
| Re-request review with no changes | Not a round trip |
| Stacked PRs | Counted per PR, **and** summed across a detectable stack |

The stacked-PR row is the anti-gaming mechanism for pair A: if a team splits work to
improve M4, summed stack round trips reveal that the wait moved rather than shrank.

**Also report round trips normalised by PR size** (`round_trips per 100 filtered
lines`). This separates *"this change was large"* from *"this change was unclear"* —
without it, M5 just re-reports M4.

**Data confidence:** `prs_with_review_data / merged_prs_in_window`.

#### Result shape
```json
{
  "metric": "review_round_trips",
  "headline": { "p50": 1.0, "mean": 1.7 },
  "distribution": { "0": 41, "1": 38, "2": 21, "3+": 18 },
  "normalised_per_100_lines": 0.62,
  "bot_review_share_pct": 34.0,
  "trend": [ { "week_start": "2026-06-08", "p50": 1.0, "mean": 1.9, "n": 11 } ],
  "sample_size": 118,
  "data_confidence": 0.99
}
```

#### Views & visualisation

| View | Visualisation | Content |
|---|---|---|
| **Manager** | **Histogram of round trips per PR** (0, 1, 2, 3, 4+) with the tail highlighted, plus a **scatter of round trips vs. PR size** with a fitted trend line | The scatter is the pair-A instrument: PRs sitting high on round trips but low on size are the unclear-requirements cluster, and they are individually listed and linkable. High-round-trip PRs are named. |
| **Executive** | **Small tile rendered adjacent to M4** showing p50 round trips and direction | This metric exists on the executive view *only* as M4's tension partner and is never shown alone. Layer 2 shows the histogram and the size-normalised figure. |

**Interpretation guidance, printed on the view itself, not in a wiki:** *"High round
trips usually indicate unclear requirements or a missing design review stage — not slow
or pedantic reviewers."* Without this sentence on the screen, the metric will be read as
a reviewer performance measure within about a week.

#### Test plan

*Unit:*
1. **Canonical cycle** — review at T, commit at T+1h, merge at T+2h → `1`.
2. **Approval, no commits** — review at T, merge at T+1h → `0`.
3. **Commits before any review** — 5 commits then one approving review then merge → `0`.
4. **Bot exclusion** — a `user.type: "Bot"` review followed by commits → human count
   `0`, `bot_review_share` reflects it.
5. **Multiple reviews before one push** — two reviews at T and T+5m, one commit at
   T+1h → `1` cycle, not 2. The cycle is defined by the push, not by reviewer count.
6. **Post-merge review** — a review submitted after `merged_at` is ignored entirely.
7. **Mechanical commit** — a lint-fix commit after review does not open a cycle.
8. **Normalisation guard** — a PR with `pr_size == 0` after exclusions must not divide
   by zero; it is omitted from the normalised statistic and counted in the raw one.

*Integration:*
9. **Ordering across sources** — reviews and commits fixture with interleaved timestamps
   in the *wrong* array order; assert the merge sorts correctly before counting.
10. **Timezone** — mixed `Z` and `+02:00` offsets in the fixture produce the same
    ordering as their UTC equivalents.

*Acceptance:*
11. Walk three real PRs through the timeline by hand against the GitHub conversation
    view. Then show the interpretation sentence to a squad lead and confirm they do not
    read it as a reviewer score — if they do, the wording is wrong and ships changed.

---

### M6 · Time to Signal ↔ paired with M7

**Category** `ci-platform` · **SPACE** efficiency · **Grain** repo · **Source** GitHub Actions

**Definition.** Elapsed time from a push to the first verdict a developer can act on.
**Not** total pipeline duration. Two separate measures, reported separately because they
answer different questions:

- **Time to red** — how quickly a developer learns something is broken. Above roughly
  ten minutes the developer has context-switched and pays a re-entry cost when the
  failure lands.
- **Time to green** — how quickly a change becomes mergeable. Feeds M2.

Both **include runner queue time**, frequently the larger half and invisible in
pipeline-duration reporting.

#### Raw data
Workflow runs triggered by push in the window, with their jobs' start and completion
times, restricted to the required-check set.

#### API calls
```http
GET /repos/{owner}/{repo}/actions/runs?event=push&created=>={window_start_date}&per_page=100
   → per run: id, workflow_id, name, head_sha, head_branch, run_attempt,
              created_at, run_started_at, updated_at, status, conclusion
   → `created` accepts GitHub's date-range syntax: created=>=2026-06-08

GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/1
   → attempt 1 only; reruns are M7's subject, not M6's                        (M7)

GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs?filter=latest&per_page=100
   → per job: name, started_at, completed_at, conclusion
   → keep only jobs whose name ∈ REQUIRED_CHECKS                              (§2.4)
```
*Cost:* runs list pages + 1 jobs call per run — the dominant cost of a load (§2.3.1).
Only completed runs are considered.

#### Calculation
```
push_at        = run.created_at        -- when GitHub registered the trigger    (D7)
queue_seconds  = run.run_started_at − run.created_at
time_to_red    = min(job.completed_at where conclusion == "failure") − push_at
time_to_green  = max(job.completed_at) − push_at,
                 only if ALL required jobs concluded "success"

report p50 and p90 of both, weekly, plus p50 queue_seconds broken out
```

**`push_at` is `run.created_at`, not the developer's actual push time** (D7). The true
push timestamp needs `push` webhook ingestion, which the prototype does not do. The
gap is normally seconds; it is documented, not hidden, and closing it is a
`future-plan.md` item.

| Case | Handling |
|---|---|
| Superseded pushes | A newer run on the same `head_branch` created before this run concluded → `outcome: superseded`, excluded |
| Cancelled runs | Excluded, unless cancelled by supersession (handled above) |
| Manual reruns | Attempt 1 only |
| Matrix jobs | First failing shard determines time to red |
| Fail-fast disabled | Still the first failing shard, not full completion |
| Draft PRs | **Included** — developers act on draft signal too |
| Scheduled / nightly runs | Excluded entirely (`event != push`) — no push to measure from |
| Merge queue runs | Measured separately; queue-time-to-green is a distinct metric, not in this build |

**Data confidence:** `runs_with_resolvable_required_jobs / push_runs_in_window`. If the
required-check names in config do not match any job names, this drops to 0 and the
metric suppresses itself — which is the correct behaviour and is why it is measured.

#### Result shape
```json
{
  "metric": "time_to_signal",
  "headline": { "time_to_red_p50_seconds": 412, "time_to_green_p50_seconds": 968 },
  "p90_seconds": { "red": 1340, "green": 2870 },
  "queue_seconds": { "p50": 47, "p90": 310 },
  "required_check_set_version": "2026-09-06.1",
  "required_check_count": 4,
  "trend": [ { "week_start": "2026-06-08", "red_p50": 430, "green_p50": 1010, "n": 62 } ],
  "outcomes": { "red": 88, "green": 512, "superseded": 41, "cancelled": 9 },
  "sample_size": 600,
  "data_confidence": 0.93
}
```

#### Views & visualisation

| View | Visualisation | Content |
|---|---|---|
| **Manager** | **Stacked horizontal bar per week: queue time / execution time to first signal**, as two rows — one for red, one for green | Stacking is the point — it shows whether the fix is "make tests faster" or "add runners", which are entirely different budgets. Beneath it, a **ranked list of the slowest required checks by median duration**, so the fix is obvious and named. **M7 renders on the same screen.** |
| **Executive** | **p50 time to red as a single number with a sparkline** and a band chip | The most legible single figure here. Layer 2 adds time to green, the queue/execution split, and `required_check_count`. **The M7 tile is adjacent, always.** |

**Trap, and the reason `required_check_count` is on the payload:** optimising this by
removing tests from the required set makes the number excellent and the signal
worthless. The count is plotted **on the same chart as the metric**, so an improvement
coinciding with checks being dropped is visible rather than celebrated.

#### Test plan

*Unit:*
1. **Time to red** — 3 required jobs, second fails at T+300s, third completes at T+900s
   → `time_to_red == 300`, not 900.
2. **Time to green requires all** — 3 of 4 required jobs succeed, 1 never runs →
   `time_to_green == null`, and the run is not counted as green.
3. **Queue split** — `created_at` T, `run_started_at` T+60s, job completes T+400s →
   `queue_seconds == 60`, `time_to_green == 400`.
4. **Optional check ignored** — a failing job **not** in `REQUIRED_CHECKS` does not
   produce a `time_to_red`.
5. **Supersession** — two runs on the same branch, the second created before the first
   concludes → the first is `superseded` and excluded from every percentile.
6. **Attempt filter** — a run with `run_attempt: 3` contributes only its attempt-1
   timings to M6.
7. **Scheduled run excluded** — `event: "schedule"` never enters `ci_signal`.
8. **Never-green run** — all required jobs fail → `time_to_green: null`, `time_to_red`
   populated, `outcome: "red"`; assert `null` does not enter the p50 calculation as a
   zero.

*Integration:*
9. **`created=>=` filter** — assert the runs request carries the date-range parameter
   and that no run older than `window_start` is included even if returned.
10. **Required-set mismatch** — config naming a job that exists in no run drives
    `data_confidence` to 0 and the metric into its suppressed state rather than
    reporting an empty-but-green result.
11. **Job pagination** — a 150-job matrix run across 2 pages resolves all shards before
    picking the first failure.

*Acceptance:*
12. Push a deliberate failing commit to a scratch branch, time it by wall clock, and
    match `time_to_red` to within a few seconds. Repeat with a passing commit for
    `time_to_green`. This is the fastest end-to-end validation in the whole build.

---

### M7 · Rerun Rate & First-Attempt Pass Rate ↔ tension partner for M6

**Category** `ci-platform` · **SPACE** efficiency, satisfaction · **Grain** repo

**Definition.** Two related measures of whether CI results are **trustworthy**.

- **Rerun rate** — how often a run is re-triggered on an unchanged commit. A developer
  hitting retry is a developer who does not believe the result. **Behavioural.**
- **First-attempt pass rate** — share of commits whose required checks pass on attempt 1.
  **Systemic.**

Both, because a repo can have a low rerun rate simply because the team has given up on
CI and merges around it. Together they are more honest than either alone.

#### Raw data
Every workflow run attempt in the window, grouped by `(workflow_id, head_sha)`.

#### API calls
```http
# reuses M6's runs list — no new list calls

GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt}
   → for each attempt 1..run_attempt: conclusion, triggering_actor, run_started_at
   → triggering_actor distinguishes a human retry from an automatic one        (M7)

GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs?filter=latest
   → reused from M6 for the required-check conclusion per attempt
```

#### Calculation
```
group runs by (workflow_id, head_sha)                -- "unchanged commit"

rerun_rate = groups where max(run_attempt) > 1 / total groups

first_attempt_pass_rate =
    head_shas where all required checks passed on attempt 1
    / head_shas with at least one run

confirmed_flake_rate =
    head_shas where attempt 1 concluded "failure"
    AND a later attempt on the SAME sha concluded "success"
    / head_shas with at least one rerun
```

**`confirmed_flake_rate` is the cheapest possible flaky-test detection.** Same commit,
different result, no new instrumentation — it falls directly out of the rerun data. It
is a lower bound: a test that fails twice in a row is still flaky and will not appear
here.

| Case | Handling |
|---|---|
| Automatic pipeline retry | Counted separately from manual retries via `triggering_actor`. Automatic retries **hide** flakiness and must be surfaced, not folded in |
| Infrastructure-failure reruns | Tagged by failure class where Actions exposes it |
| Rerun after an external dependency outage | Annotatable so squads can mark it |
| Rerun of a single failed job vs. whole pipeline | Both counted, reported separately (`rerun_scope: job \| run`) |

**Wellbeing linkage (recorded now, used later).** Rerun rate doubles as a frustration
proxy: a repo where developers retry constantly erodes satisfaction, invisibly to every
delivery metric. Once survey data exists, present it beside the developer survey score
for the same repo. This is the cheapest available bridge from delivery data into the
SPACE satisfaction dimension without adding a survey question.

**Data confidence:** shares M6's figure — both depend on the same required-check
resolution.

#### Result shape
```json
{
  "metric": "ci_reliability",
  "headline": { "rerun_rate_pct": 14.2, "first_attempt_pass_rate_pct": 76.5 },
  "confirmed_flake_rate_pct": 41.0,
  "rerun_breakdown": { "manual": 61, "automatic": 24, "scope_job": 38, "scope_run": 47 },
  "trend": [ { "week_start": "2026-06-08", "rerun_pct": 16.0, "first_pass_pct": 74.0, "n": 62 } ],
  "sample_size": 600,
  "data_confidence": 0.93
}
```

#### Views & visualisation

| View | Visualisation | Content |
|---|---|---|
| **Manager** | **Dual line chart: rerun rate and first-attempt pass rate on one 13-week axis** (secondary axis inverted so "both improving" reads as both lines moving the same way), plus a **ranked bar chart of the checks driving reruns** | The ranked bar is the most directly actionable object in this entire build — it names the specific check to go fix. `confirmed_flake_rate` sits beside it as a callout. **M6 renders on the same screen.** |
| **Executive** | **Small tile adjacent to M6:** first-attempt pass rate with direction | First-attempt pass rate, not rerun rate, is the executive-legible half — it reads as a quality figure rather than a behaviour figure. Layer 2 shows both lines and the flake rate. Never shown without M6. |

#### Test plan

*Unit:*
1. **Rerun detection** — same `head_sha`, same workflow, `run_attempt` 1 and 2 → one
   group, `rerun_rate` counts it once.
2. **Different SHA is not a rerun** — two attempt-1 runs on different SHAs → rerun rate
   `0`. The most likely wrong implementation counts every failure-then-success as a
   rerun.
3. **Confirmed flake** — attempt 1 `failure`, attempt 2 `success`, same SHA →
   `confirmed_flake_rate` counts it.
4. **Not a flake** — attempt 1 `failure`, attempt 2 `failure` → excluded from the flake
   rate but present in the rerun rate.
5. **First-attempt pass** — a SHA whose required jobs all pass on attempt 1 counts, even
   if a later attempt was triggered manually and failed.
6. **Manual vs automatic** — differing `triggering_actor` between attempts splits
   correctly into `rerun_breakdown`.
7. **Zero denominators** — a window with no runs, and one with runs but no reruns, both
   produce `0` / `null` rather than `NaN`.

*Integration:*
8. **Attempt enumeration** — a run with `run_attempt: 4` issues four attempt calls and
   assembles the outcome sequence in order.
9. **Shared cache with M6** — M6 and M7 running in the same job fetch each run's jobs
   exactly once, not twice.

*Acceptance:*
10. Manually re-run a green workflow on an unchanged SHA and confirm the rerun rate
    moves by exactly one group. Then re-run a known-flaky check until it passes and
    confirm it lands in `confirmed_flake_rate`.

---

## 5. Build Sequence

Ordered so each stage produces something usable rather than deferring all value to the
end. **The ordering is a trust decision, not a technical one** — building the executive
view first is faster and is how these platforms usually fail.

| Stage | Delivers | Unlocks |
|---|---|---|
| **0 · Fetch layer** | `Link` pagination, rate-limit handling and reporting, bounded-concurrency pool, in-process memo cache, shared stats helpers | Everything |
| **1 · Releases** | Release fetch + `resolved_sha` resolution | **M1 complete** — nothing else depends on it |
| **2 · Windows + compare cache** | `release_windows` builder, cached `compare`, 250-commit fallback | Prerequisite for M2 and M3 |
| **3 · Pull requests** | PR fetch + merge-commit matching | **M2 complete** |
| **4 · PR detail** | PR files + exclusion ruleset; reviews + commits | **M4 and M5 complete** |
| **5 · Actions** | Runs + jobs + attempts fetch, required-check resolution, `ci_signal` builder | **M6 and M7 complete** |
| **6 · Issues + labels** | Incident/hotfix label fetch, revert scan | **M3 complete** |
| **7 · Manager view** | All seven metrics, Layer 3 evidence | Data-quality problems surface here — and must surface **before** any executive sees anything |
| **8 · Signal layer** | Bands, noise gates, category rollup, confidence gating | Validated internally against Stage 7 |
| **9 · Executive view** | Layer 1 + Layer 2 only | Ships last, by design |

M3 is deliberately late despite being a DORA metric: it is the one with a team-process
dependency, and shipping it before the label-coverage figure is known would put an
unsupported number in front of leadership.

---

## 6. Data Quality Gates

No view ships until these hold for the pilot repo. **Coverage figures are displayed on
the views themselves, not merely tracked internally.**

- [ ] Release tags resolvable to a SHA for ≥ 95% of published releases (M1)
- [ ] Shipped commits matched to a PR for ≥ 90% (M2 — also the platform-wide figure)
- [ ] PR file data available for ≥ 95% of merged PRs (M4)
- [ ] Push-triggered runs joinable to jobs for ≥ 90% (M6, M7)
- [ ] Required-check set resolvable and versioned (M6, M7)
- [ ] Label coverage measured and **published as a number** before M3 is shown (M3)
- [ ] Exclusion ruleset published and reviewed by at least one squad (M4)

---

## 7. Developer Task List

Numbered, dependency-ordered, sized for a developer agent to pick up in sequence. Each
task is done when its stated tests pass.

### Foundations

- **T1** — Fetch layer in `src/github-wrapper.js`: `Link`-header pagination, the
  `X-GitHub-Api-Version` header, rate-limit backoff on `403 + x-ratelimit-remaining: 0`,
  and `x-ratelimit-remaining` surfaced on every response for T19.
- **T2** — In-process memo cache (`src/metrics/cache.js`): request-URL-keyed, per-entry
  TTL, unbounded for immutable pairs (`compare`, PR files) and short for list endpoints.
  It must be provably transparent — a test that runs a metric with the cache disabled and
  with it warm must produce byte-identical output (D8).
- **T3** — Bounded-concurrency fetch pool (default 8) used by every multi-call metric.
  Without it a cold load is minutes of serial requests.
- **T4** — `src/metrics/window.js`: resolve `METRICS_WINDOW_DAYS` (default 60) into
  `window_start`, `prior_window_start`, and ISO week buckets.
- **T5** — `src/metrics/stats.js`: `median`, `percentile(p)`, `mad`, and the §2.5
  three-gate direction function. Unit-test this in isolation first — every metric
  depends on it and a percentile off-by-one silently corrupts all seven.
- **T6** — Per-metric fetch scoping: each metric requests only the endpoints it needs,
  so `GET /api/metrics/m1` costs ~55 calls rather than a full 1,200-call refresh
  (§2.3.1). Plus the prior-window toggle (D13), off by default.

### DORA

- **T7** — Release fetch + tag→SHA resolution. → **M1**. Tests M1.1–M1.9.
- **T8** — `release_windows` builder + `compare` cache with the 250-commit `/commits`
  fallback (D16). Tests M2.7–M2.9.
- **T9** — PR fetch + merge-commit matching + lead-time computation. → **M2**.
  Tests M2.1–M2.6, M2.10.
- **T10** — Issue fetch as **three separate label calls** unioned client-side (D10),
  PR-key filtering, revert-message scan, hotfix cross-reference, and the label-coverage
  figure. → **M3**. Tests M3.1–M3.9.

### Non-DORA

- **T11** — PR files fetch with the versioned exclusion ruleset in
  `config/pr-size-exclusions.json`, rename/binary handling, revert and mechanical
  tagging. → **M4**. Tests M4.1–M4.9.
- **T12** — PR reviews + PR commits fetch, `pr_review_cycle` modelling, bot detection,
  size normalisation. → **M5**. Tests M5.1–M5.11.
- **T13** — Actions runs + jobs fetch with `event=push` and `created=>=` filters,
  supersession detection, `ci_signal` builder against the configured required set.
  → **M6**. Tests M6.1–M6.12.
- **T14** — Attempt enumeration, rerun grouping, first-attempt and confirmed-flake
  computation, manual/automatic split. → **M7**. Tests M7.1–M7.10.

### Views

- **T15** — Metrics API: `GET /api/metrics/:name?window=60d` returning the §4 result
  shapes; `GET /api/metrics/summary` returning all seven. Role-gated via the existing
  `src/auth-service.js` — `manager`/`admin` reach Layer 3, `executive`/`admin` reach
  Layer 2.
- **T16** — Manager view. All seven metrics; M4 above M5 and M6 above M7 on the same
  screen, not tabs (§3.3 rule 3). Layer 3 evidence rows link out to GitHub.
- **T17** — `config/target-bands.json` plus the band/direction/rollup engine of §3.2,
  and the §2.6 confidence gating that suppresses a metric below threshold.
- **T18** — Executive view. Layer 1 signal tiles + Layer 2 numbers, no evidence rows.
  M3's coverage caption is non-dismissible; M6's `required_check_count` is plotted on
  the metric's own chart.
- **T19** — Data-quality panel rendering the §6 gates as live figures on both views,
  plus remaining rate-limit budget, `computed_at`, and a manual refresh control — with no
  cached history, the user needs to know how fresh a number is and what a reload costs.
- **T20** — Seed a fixture repo (or record real responses via `nock`) so the whole
  pipeline runs offline in CI. Without this, every test above is a live-API test and the
  suite becomes unrunnable.

---

## 8. Open Decisions

Need a call before or during implementation. Recommendations given.

1. **Target bands** — who sets `healthy`/`watch`/`poor` per metric, and are they global
   or per repo class? *Recommendation: per repo class, proposed by the platform, agreed
   with engineering leadership, published.* DORA-standard bands are pre-filled for
   M1–M3; M4–M7 have no industry standard and must be calibrated against the org's own
   first month.
2. **`LARGE_CHANGE_THRESHOLD`** — start at 400 changed lines, recalibrate after a month.
3. **Exclusion ruleset ownership** — who amends `config/pr-size-exclusions.json`, and
   what is the review process.
4. **`DATA_CONFIDENCE_THRESHOLD`** — suggested 70%.
5. **RBAC at Layer 3** — the prototype's three env-configured roles are a gate, not an
   authorization model. Which roles see evidence rows across repo boundaries?
6. **Naming the Layer 1 concept** — "signal" collides with M6's "time to signal". Settle
   this before writing schema; the source docs also flag a collision with "pulse".
7. **Annotation authority** — who can annotate a metric, and do annotations surface on
   the executive view? *Recommendation: yes, visible — unexplained movement is what
   drives bad executive reactions.*
8. **Whether the executive view launches with only these seven metrics.** The source
   plan recommended deferring it until an outcome metric exists, on the grounds that
   whatever is on the screen becomes what matters. This build ships it because two views
   were required (D15) — so it ships with an explicit on-page statement of what it does
   **not** yet cover: nothing about outcome, allocation, reliability, or sustainability.
