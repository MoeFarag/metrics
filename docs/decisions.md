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

## 2026-09-05: Persistence

Decision: phase one has no datastore, no ingest job, and no webhook subscription flow.
Metrics are computed live from the GitHub REST API for the user-entered repository.

Why:

- The prototype is testing whether the metric definitions are useful before committing
  to storage shape.
- Every phase-one metric can be recomputed from current GitHub API state over the
  selected lookback window.
- Avoiding persistence keeps the first implementation smaller and makes the dashboard
  easier to deploy on Vercel.

Vercel constraint:

- Vercel serverless functions do not provide durable writable local disk, so a bundled SQLite file is not a production-grade persistent store on Vercel.
- If persistence becomes necessary, add it behind an adapter and point production to
  Turso/libSQL, Vercel Postgres, Neon, or another managed store.

Current implementation stance:

- The API wrapper and dashboard endpoints remain stateless in phase one.
- Webhook receiver code may exist as wrapper infrastructure, but webhook setup and
  subscription management are not part of phase one.
- Caching and memoisation are latency optimisations only. They can disappear between
  Vercel invocations without changing the meaning of a metric.

---

# Metric Decision Log


## D1: Production signal = Releases, not the Deployments API

**Decision:** A GitHub Release, created by the CI/CD pipeline at the deploy commit, is
the sole marker of "this commit reached production." We do not rely on
`GET /deployments` + `deployment_status` (`environment: production`).

**Rationale:** This repo's pipeline is confirmed to create a release per deploy; it is
unconfirmed whether it also emits Deployment/DeploymentStatus objects. Building on the
signal we know exists avoids a dependency we cannot verify.

**Alternatives considered:** The Deployments API is richer — it gives explicit
success/failure status per deploy, which Releases do not. If it turns out this pipeline
*does* create Deployment objects, revisit: `deployment_status.state` would give a free
first-party signal for Change Failure Rate that we currently infer indirectly (D5).

**Limitation this creates:** Releases have no built-in "did this deploy succeed" field.
Every metric that would normally lean on `deployment_status` has to substitute a
convention. This is the central tradeoff of D1 and it is why D5 and D6 are the least
clean of the DORA set.

## D2: Resolving a release to a commit SHA

**Decision:** Resolve a release's commit via `GET /repos/{o}/{r}/commits/{tag_name}` —
the commits endpoint accepts a tag name as a ref and returns the commit it points to,
for both lightweight and annotated tags. Do not use `target_commitish`.

**Rationale:** `target_commitish` is documented as "unused if the tag already exists" and
commonly holds a branch name such as `main` rather than a SHA, so treating it as the SHA
is a latent bug. Resolving through the tag is unambiguous.

**Limitation:** If a tag is force-moved after the release was cut, this resolves to the
*current* target, not the one true at release time. Because the prototype re-resolves on
every load rather than snapshotting (D8), a moved tag can change a historical number
between two loads. Accepted at prototype scale; a persistence layer fixes it by
snapshotting the resolved commit list once and never re-resolving.

## D3: Deployment Frequency population and timestamp

**Decision:** Only fully published, non-draft, non-prerelease releases count as a
production deployment. Timestamp is `release.published_at`, not `created_at`.

**Rationale:** Draft and prerelease (RC/beta) releases are staging/canary in this
pipeline, not prod. `published_at` is the semantically correct field ("this is now
live") and costs nothing to prefer, even though this pipeline publishes directly so the
two are expected to be effectively identical here.

**Reporting:** Bucket by day, report the **gap distribution** (median/p85) rather than a
single average — a burst of hotfix releases or one long quiet stretch distorts a mean
badly. Roll up to a 4-week rolling trend; daily-only is noisy below a few deploys/day.

**Accepted limitation:** We assume **one release = exactly one production deployment
event**. There is no way from the API to detect the same artifact being manually
redeployed without a new tag, or an infra-only redeploy that skips tagging. If that
assumption breaks, frequency reads artificially low. No data source available inside
GitHub corrects for it.

## D4: Lead Time anchored on PR creation, not commit date

**Decision:** Lead time is measured from PR `created_at` to the `published_at` of the
first qualifying release containing the PR's merge commit. Signal is Pull Requests, not
raw commit history.

**Rationale:** This repo squash-merges, so the merge commit on `main` collapses an entire
PR's history into one commit whose author date reflects only the final squash, not when
work started. Using it would systematically understate lead time on any PR with review
back-and-forth. PR `created_at` is the more defensible and consistently available field;
the PR's first commit date is not — commits can be pushed to a branch well before a PR is
opened, and rebases do not preserve it either.

**Reporting:** Median and p85, never a mean.

**Limitation and its handling:** A change merged without a PR — a direct push to main, or
an admin merge — has no `created_at` to anchor on. **Such commits are excluded from Lead
Time entirely rather than falling back to commit-author-date for just those cases.**
Mixing two timing semantics into one median would be worse than a documented gap. Track
the share of shipped commits with no associated PR as a data-quality indicator.

## D5: Change Failure Rate is a defined convention, not a discovered fact

**Decision:** A release is "failed" if, within its window (`this release's published_at`
→ `next release's published_at`), any of the following hold:

1. The *next* release's commit range contains a commit matching `^Revert "` whose
   reverted SHA falls within *this* release's range.
2. An issue labelled `incident` or `bug` was opened during the window.
3. A PR labelled `hotfix` or `revert` was merged and its commit shipped in the *next* release.

`CFR = failed releases / total releases`, over D3's release population.

**Rationale:** No API field says "this deployment broke production." Notably this
convention does **not** depend on the Deployments API — it was always framed as
label/pattern-based rather than relying on `deployment_status.state == failure`, which
measures "the pipeline failed to run", a different thing from "the pipeline succeeded
but broke prod". D1's Releases-only constraint therefore does not weaken this metric.

**Explicit dependency:** This requires the team to use `incident`/`bug` labels
on issues and `hotfix`/`revert` on PRs consistently. If they do not, CFR undercounts. **This is a
team-process prerequisite, not an API limitation** — call it out to the team before
trusting the number (see D9).

## D6: Failed Deployment Recovery Time approximation

**Decision:** Recovery time = `resolving_release.published_at − failure_signal_time`,
where `failure_signal_time` is the incident issue's `created_at` if D5 condition 2
applied, and otherwise the failed release's own `published_at`; `resolving_release` is
the next release whose commit range contains the revert commit or the hotfix PR's commit.
Report median only.

**Limitation — this is the weakest of the DORA five.** Without an incident management
system feeding real detection and resolution timestamps, "time to restore" is
approximated as "time to next release", which conflates *detecting* the problem with
*shipping the fix*. A team that catches a bad deploy instantly but takes a day to get a
fix through review shows the same recovery time as a team that took a day to notice.

**Consequence for prototype scope:** on this reasoning, Recovery Time is **not** built in
the prototype. It moves to `future-plan.md` §2, to be promoted when incident
tooling exists or M3's label coverage sustains above 80%. The formula above stands as
written for when it is built.

---

*Entries below added 2026-09-06 during the plan unification pass.*

## D7: `push_at` is `run.created_at`, not the developer's push time

**Decision:** For Time to Signal, the push timestamp is the workflow run's `created_at`
— when GitHub registered the trigger. Queue time is then
`run_started_at − created_at`.

**Rationale:** The true developer push timestamp is only available from the `push`
webhook, which the prototype does not yet ingest. `created_at` is within seconds of it
in normal operation and is available on every run object with no extra call.
`head_commit.timestamp` was rejected as the alternative — it is the commit author date,
which a rebase or an old local commit makes arbitrarily stale.

**Limitation:** Any delay between `git push` completing and GitHub queueing the run is
invisible. Documented on the view, not hidden. Closing it is a Phase 2 item
(push-event ingestion), and it is cheap because the webhook receiver already exists.

## D8: Metrics are computed live, on demand, with no persisted history

**Decision:** The prototype computes all seven metrics **on the fly** from the GitHub API
on each dashboard load. There is no metrics database, no ingest job, and no event
history. Repeated calls within a load are memoised in an in-process cache; that cache is
a latency device, not a source of truth, and may be empty at any time without changing
any result.

**Rationale:** The prototype exists to find out what these metrics actually look like on
real data, for one or two people over roughly a week. Building a persistence layer first
would mean committing to a schema before knowing whether the metrics are worth keeping —
assumptions instead of evidence. Live computation keeps the feedback loop short and
throws nothing away, because of the property below.

**The property that makes this safe — confirmed metric by metric:** every one of the
seven metrics is a **pure function of the repository's current API state** over a lookback
window. None depends on an event having been captured at the moment it occurred. Releases,
pull requests, reviews, PR commits, PR files, issues, workflow runs, jobs, and run
attempts are all retrievable retrospectively for any window the API still serves. There
is therefore **no "cannot be backfilled" hazard here** — unlike authorship attribution
(`future-plan.md` §5), nothing is permanently lost by not recording it today. Adding a
store later is a pure performance and reproducibility change that can be done at any
point without a gap in history.

**What this costs, and the accepted limits:**

- **Latency and rate budget.** A cold full refresh over 60 days runs roughly 750–900
  API calls, dominated by the per-run jobs call (M6/M7) and the three per-PR calls
  (M4/M5). Against the 5,000 req/hr authenticated budget that is about four full cold
  refreshes per hour — adequate for one or two users, and not for more. Mitigations are
  in-process memoisation, bounded concurrency, and the toggle below.
- **Prior-window comparison is explicitly requested by the dashboard.** Computing
  `direction` against the prior 60 days roughly doubles the call count, so API consumers
  may still omit it. Until requested, `direction` reports "not computed" — which the
  noise-band model already has a state for. The third noise gate is unaffected: its median
  absolute deviation is computed across the weekly buckets **inside** the displayed window, so
  it needs no stored history either.
- **Reproducibility.** Because SHAs are re-resolved on every load rather than snapshotted,
  a force-moved tag or a deleted branch can change a historical number between two loads
  (see D2). Acceptable at prototype scale; it is the first thing a store fixes.
- **No provenance columns.** Without rows there is nowhere to record which exclusion
  ruleset or required-check set a past number was computed under. Every load uses the
  current configuration, and a config change silently re-bases the history shown.

**Planned successor.** Persistence returns as a Phase 2 item in `future-plan.md`, driven
by whichever limit above bites first — most likely latency. The design constraint it must
satisfy: cache `compare` on `(base_sha, head_sha)` and PR files on
`(pr_number, merge_commit_sha)`, both permanently valid once the SHAs are historical. The
no-datastore phase-one decision (Persistence, above) stands; if this layer becomes
necessary, it must remain behind a storage adapter.

**Unaffected by this decision:** the prototype's build cut of two DORA metrics. Failed
Deployment Recovery Time and Deployment Rework Rate are deferred for convention-risk
reasons (D6), not storage reasons, and both would compute live just as well.

## D9: Label coverage is displayed as a first-class number beside CFR

**Decision:** Change Failure Rate is never rendered without its label-coverage figure at
equal visual weight. A quarter with no failure signals renders as *"0% — no failure
signals recorded; label coverage 0%"*, never as a clean green 0%.

**Rationale:** D5 makes CFR wholly dependent on team labelling discipline. The failure
mode is not a wrong number — it is a **falsely reassuring** one: an unlabelled quarter
and a genuinely clean quarter produce identical output. Coverage is the only thing that
distinguishes them, so it cannot live in a footnote.

**Consequence for the view:** no red/amber/green donut for CFR. A donut invites reading
0% as an achievement. The release timeline strip renders unlabelled releases as grey
ticks, making an unlabelled quarter visually obvious.

## D10: GitHub's `labels` query parameter is AND, not OR

**Decision:** Fetch failure-labelled issues with **separate calls** —
`labels=incident`, `labels=bug`, and any later configured aliases — unioned client-side.

**Rationale:** `GET /issues?labels=a,b,c` returns only issues carrying **all three**
labels, which in practice is none. The single-call form written in the original
implementation brief would have silently returned an empty incident set, and CFR would
have reported a clean 0% with no error anywhere. This is a correctness fix, not an
optimisation choice.

**Consequence:** a dedicated regression test exists (M3 test 7) whose only purpose is to
stop someone "optimising" the three calls back into one.

## D11: PR size requires the files endpoint, not the pulls list

**Decision:** PR size comes from `GET /pulls/{number}/files`, one call per merged PR.

**Rationale:** Two independent reasons. First, the pulls **list** endpoint does not
return `additions`/`deletions`/`changed_files` at all — those appear only on the
single-PR and files endpoints. Second, path-based exclusions (lock files, generated
code, vendored directories) require per-file paths regardless, so the files endpoint is
needed even if the totals were available elsewhere.

**Limitation:** this is one of the two heaviest metrics in the build — 1+ call per merged
PR, with pagination for PRs over 100 files. Together with M5's two per-PR calls it is a
main driver of the live-computation cost accepted in D8, and the first candidate for
caching. Truncating file pagination at 100 silently understates exactly the large PRs the
metric exists to find.

## D12: Tension partners render on the same screen, not one layer deeper

**Decision:** PR size never renders without review round trips, and time to signal never
renders without rerun rate — on the same screen, in both views, including the executive
view.

**Rationale:** Deferred context is context nobody reads. Each throughput metric here
improves under exactly the pressure that degrades its partner: a PR-size target produces
stacked dependent PRs (round trips rise, the wait moves rather than disappearing), and a
time-to-signal target is most easily met by removing checks from the required set. The
pair is the anti-gaming mechanism, and it only works if both halves are visible at once.

**Consequence for the rollup:** the category rule is deliberately asymmetric — degrading
if **either** metric degrades, improving only if both improve or one improves and the
other is flat. An improvement in one half with the other degrading is what gaming looks
like and must not surface as an improvement.

## D13: Default window is 60 days; prior-window comparison is explicit

**Decision:** `METRICS_WINDOW_DAYS` defaults to 60 and is what the views display. The
`direction` axis compares against the prior 60 days when the caller explicitly requests
that second window.

**Rationale:** Trend buckets are ISO weeks, and 60 days gives roughly nine weekly points:
enough for a legible prototype chart while making cold live loads less expensive than a
full quarter. The prior window is never displayed, only compared against, and fetching it
roughly doubles the call count on every load (D8). The dashboard requests it because the
direction chip is part of the primary UX; other API consumers can omit it and receive
"not computed".

**Note:** the third noise gate needs ≥8 prior periods to compute a median absolute
deviation. Those are the weekly buckets **inside** the displayed window, not stored
history, so that gate works on the default load with no extra fetching.

**Consequence:** where GitHub offers no server-side date filter (releases, pulls),
paginate newest-first and stop on the first out-of-window record rather than draining all
pages.

## D14: Required-check set comes from config, not branch protection

**Decision:** The set of merge-blocking checks is read from a `REQUIRED_CHECKS` config
list with a `REQUIRED_CHECK_SET_VERSION`, not from
`GET /repos/{o}/{r}/branches/{branch}/protection/required_status_checks`.

**Rationale:** The branch-protection endpoint requires admin scope the prototype token
may not have, and would make the metric fail closed on a permission problem rather than
on a data problem. Config also makes the set explicit and reviewable.

**Consequence:** `required_check_count` and `REQUIRED_CHECK_SET_VERSION` are returned on
every response and `required_check_count` is plotted on the metric's own chart — an
improvement in time-to-signal that coincides with checks being dropped must be visible
rather than celebrated. Note that with no persisted rows (D8) a config change silently
re-bases the whole displayed history; the version on the response is what makes that
change noticeable at all, and per-row provenance returns with the store.

**Limitation:** config can drift from actual branch protection. If the configured names
match no job names, data confidence drops to 0 and the metric suppresses itself, which
is the intended failure mode.

## D15: Two views — Manager and Executive

**Decision:** The product has exactly two views: a **Manager view** (squad leads and
engineering managers) and an **Executive view**.

**Rationale:** Squad leads and engineering managers want the same thing from this data —
distributions rather than headlines, the evidence rows, and the ability to name the
specific PR, check, or release. They differ by scope filter, not by what they need to
see. Building them as one view avoids duplicating every chart to gate a filter, and the
existing `manager`/`executive`/`admin` environment roles map onto the two views directly.

The Executive view is the other perspective, not a thinner copy of the same one: it
answers where to invest rather than what to unblock, reports org trend rather than repo
detail, and stops at the number and its caveats rather than the rows behind it.

**Build order:** the Manager view is built first and the Executive view last. Data-quality
problems surface in the detailed view, and they need to surface before anything reaches
leadership. The Executive view carries an explicit on-page statement of what it does not
yet cover — nothing on outcome, allocation, reliability, or sustainability — until
`future-plan.md` Phase 2 fills those in.

## D16: `compare` truncates at 250 commits

**Decision:** When a `compare` response reports `total_commits > 250`, fall back to
paging the range with `GET /commits?sha={head}&since=&until=` to assemble the full
commit list.

**Rationale:** `GET /compare/{base}...{head}` returns at most 250 commits in its
`commits` array while still reporting the true `total_commits`. A release window wider
than 250 commits — entirely plausible after a quiet period or a release-process change —
would silently drop every PR beyond the 250th from Lead Time, and would silently weaken
the revert scan behind Change Failure Rate.

**Why it is called out:** this is the most likely silent-undercount bug in the build. It
produces no error, no warning, and a plausible-looking number. It has a dedicated test
(M2 test 8).

## D17: Lead Time anchors on first commit, enabled by a ticket-branch convention

**Supersedes D4's start anchor.** D4 chose PR `created_at` because a first commit could be
pushed to a branch long before a PR was opened, making it an arbitrary start point. That
reasoning was sound given no convention existed. This entry changes the convention rather
than the metric.

**Decision:** Lead Time for Changes is measured **first commit → production**, the
canonical DORA definition. It is made meaningful by an organisational convention:
**pushing to a ticket-named branch is the only way a work item enters "In Progress."**

**Rationale — the incentive does the enforcement.** D4's anchor left the sharpest gaming
vector in the metric set open: open the PR minutes before merge and lead time collapses,
unilaterally and untraceably. Anchoring on first commit closes it, and the branch
convention stops first-commit from being arbitrary. Critically, the resulting incentive
points the right way — a developer *wants* their ticket visible as in progress, so they
push early, which is also the behaviour we want. This is alignment rather than policing,
and it costs one automation.

**Alternative considered and rejected:** anchoring on the work-item status transition
itself. Rejected because it silently redefines the metric — ticket-to-production is cycle
time, not DORA lead time — and it moves the gaming vector into the tracker rather than
removing it. Deriving ticket state *from* the git action inverts that: the tracker becomes
a consequence of the commit, not a competing source of truth.

**Use the commit's author date, not the committer date.** A rebase rewrites committer
dates and preserves author dates, so committer date would silently understate the lead time
of any rebased branch. Note this is the opposite of the choice M5 requires, where committer
date is correct because the question there is when a push *landed* relative to a review.
The two metrics need different fields from the same object, and conflating them is a
plausible bug.

**Precondition.** Until the branch/ticket convention exists and is enforced in the
tracker's automation, first-commit is noisy — a stale branch from three months ago is not a
lead time. The prototype therefore keeps D4's PR-open anchor until the convention lands,
and reports pre-PR branch age as the companion figure that shows how much work the current
anchor is not counting.

**Limitations:**
- A branch pushed on day one, paused, and resumed three weeks later reports three weeks.
  That is arguably correct DORA lead time, but it will be argued about; report the
  distribution, never a target.
- A force-push can destroy the original first commit. Capturing commits at push time via
  the webhook rather than re-deriving them later is the mitigation — another reason
  push ingestion and a persisted event log land early (D8, §7.1 of the architecture notes).

## D18: Authentication is organisational SSO by default

**Supersedes the Prototype Authentication decision above**, which used environment-configured
usernames with base64 "hashes" and was explicitly labelled a temporary gate.

**Decision:** Authenticate against the organisation's identity provider via OIDC. Roles and
audiences derive from IdP group claims rather than from a separate mapping maintained by
this platform.

**Rationale:**
- In a regulated fintech, SSO with MFA and central deprovisioning is a baseline
  expectation, not a feature. A platform holding delivery data for every engineer should
  not be the one system with its own password list.
- **Group claims do double duty.** They supply both the audience model (who sees the
  Manager view, who sees the Executive view) and squad membership, so the access model in
  §6 of the architecture notes needs no separate roster to drift out of date.
- It improves pseudonymisation: the IdP subject is a stable identity that survives someone
  changing their GitHub handle, and it is what gets hashed at ingestion.
- Joiners and leavers are handled by the IdP. Nobody has to remember to revoke access to a
  metrics dashboard.

**Limitation:** local development needs a bypass. Keep it behind an explicit, loudly named
flag that is off by default and cannot be enabled in a deployed environment — a
convenience gate that silently survives into production is how this class of system leaks.
