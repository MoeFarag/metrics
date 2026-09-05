# DORA Metrics — API Inference Decisions

Log of decisions made while speccing how each DORA metric is computed from the GitHub REST API, given that this pipeline uses **Releases** (not the Deployments API) as the production signal. Format: Decision / Rationale / Alternatives considered / Limitations. New decisions are appended, never edited in place — if a decision changes, add a new entry that supersedes it and say so.

## D1: Production signal = Releases, not the Deployments API

**Decision:** A GitHub Release, created by the CI/CD pipeline at the deploy commit, is the sole marker of "this commit reached production." We do not rely on `GET /deployments` + `deployment_status` (`environment: production`).

**Rationale:** This repo's pipeline is confirmed to create a release per deploy; it's unconfirmed whether it also emits Deployment/DeploymentStatus objects. Building on the signal we know exists avoids a dependency we can't verify.

**Alternatives considered:** Deployments API (richer — gives explicit success/failure status per deploy, which Releases don't). If it turns out this pipeline *does* create Deployment objects too, revisit: `deployment_status.state` would give a free, first-party signal for Change Failure Rate that we currently have to infer indirectly (see D5).

**Limitation this creates:** Releases have no built-in "did this deploy succeed" field. Every metric below that would normally lean on `deployment_status` has to substitute a heuristic. This is the central tradeoff of D1 and it's why D5 and D6 are the least clean of the four.

## D2: Resolving a release to a commit SHA

**Decision:** For a given release, resolve its commit via `GET /repos/{o}/{r}/commits/{tag_name}` (the commits endpoint accepts a tag name as a ref and returns the commit it points to — works for both lightweight and annotated tags). Don't use `target_commitish` directly — it's often just the branch name (e.g. `main`), not a SHA, and is only a reliable SHA if the tag was cut from a detached ref at release time.

**Rationale:** `target_commitish` is documented as "unused if tag already exists" and commonly holds a branch name, so treating it as the SHA is a latent bug. Resolving through the tag is unambiguous.

**Limitation:** If a tag is ever force-moved to a different commit after the release was cut, this resolves to the *current* tag target, not the one that was true at release time. Given we snapshot into our own store at ingest (per the build notes), we accept this risk at ingest time only — a later re-resolution isn't part of the pipeline.

## D3: Deployment Frequency

**Signal:** `GET /repos/{o}/{r}/releases`, filtered to `draft: false` AND `prerelease: false`.

**Decision:** Only fully published, non-prerelease releases count as a production deployment. Draft and prerelease (RC/beta) releases are excluded — confirmed this pipeline treats those as staging/canary, not prod, matching the general caution against counting non-prod releases as deployments.

**Timestamp:** Use `release.published_at`, not `created_at`. Since this pipeline publishes releases directly (no draft → later manual publish step), the two are expected to be effectively identical here, but `published_at` is the semantically correct field ("this is now live") and costs nothing to prefer.

**Computation:** Bucket by day; report deploys/day and the **gap distribution** between consecutive releases (median/p85 gap), not a single average — a few long gaps or a burst of hotfix releases distorts a mean badly. Roll up to a 4-week rolling window for the dashboard trend line; daily-only is noisy for repos doing less than a few deploys/day.

**Open / accepted limitation:** No way to distinguish "one release = one deploy" from a scenario where the same release artifact is manually redeployed without a new tag, or a deploy is triggered that skips tagging entirely (e.g. an infra-only redeploy). We assume **one release = exactly one production deployment event**, and document this as an assumption rather than something we can verify from the API alone. If that assumption breaks in practice, frequency will read artificially low (untagged redeploys invisible) — there's no data source available to correct for it without adding deploy logging outside GitHub.

## D4: Lead Time (Change Lead Time)

**Signal:** Pull Requests (`GET /pulls?state=closed`), not raw commit history — because of D4a below.

**Decision — squash-merge changes the start-time source:** This repo squash-merges PRs, so the merge commit on `main` collapses an entire PR's commit history into one commit whose `author.date` reflects only the final squash, not when work actually started. Using it directly would systematically understate lead time on any PR with review back-and-forth. So:

- **Start time:** PR `created_at` (when the PR was opened). Not the PR's first commit date — commits can be pushed to a branch well before a PR is opened (or after, via later pushes), and `created_at` is the more defensible, consistently-available field across the board.
- **End time:** The `published_at` of the first release (per D3's filter) whose resolved commit (per D2) is a descendant of the PR's merge commit. In practice: walk releases chronologically, and for each one, take `compare(prev_release_sha, curr_release_sha)` — every PR whose merge commit falls in that range gets that release's `published_at` as its deploy time.
- **Formula:** `lead_time = release.published_at − pr.created_at`.

**Report:** Median and p85 (per the standard caution against averages — a few stuck PRs distort the mean). Also report separately in case merge-commit vs squash mix ever changes — see Limitation.

**Alternatives considered:** `commit.commit.author.date` on the squash commit (rejected — collapses the window, understates lead time). PR's first commit date (rejected — inconsistently available and doesn't survive rebases either).

**Limitation:** If any PR is merged without going through review (e.g. direct push to main, or an admin merge that bypasses PR entirely), it has no `created_at` to anchor on and falls out of this metric entirely. Decision: exclude commits with no associated PR from Lead Time rather than falling back to commit-author-date for just those cases — mixing two different timing semantics into one median would be worse than a documented gap in coverage. Track what fraction of shipped commits have no associated PR as a data-quality indicator.

## D5: Change Failure Rate (CFR)

**Signal:** No API field says "this deployment broke production" — Releases (D1) don't carry a status at all, unlike `deployment_status`. This has to be a **defined convention**, not a heuristic we discover from data.

**Decision — a release is "failed" if, within its window (`this release's published_at` → `next release's published_at`), any of the following hold:**

1. The *next* release's commit range (via `compare`) contains a commit matching `^Revert "` whose reverted SHA falls within *this* release's range.
2. An issue labeled `incident`, `sev1`, or `outage` was opened during the window.
3. A PR labeled `hotfix` was merged and its commit shipped in the *next* release.

**Formula:** `CFR = failed releases / total releases` (using D3's release population).

**Rationale:** This is exactly the convention from the original design doc, and it doesn't actually depend on the Deployments API — it was already framed as label/pattern-based rather than relying on `deployment_status.state == failure` (which the original doc itself flags as measuring "pipeline failed to run," a different thing from "pipeline succeeded but broke prod"). So D1's Releases-only constraint doesn't weaken this metric — it was always going to be convention-based.

**Explicit dependency:** This requires the team to consistently use an `incident`/`sev1`/`outage` label on issues and a `hotfix` label on PRs. If those labels aren't used consistently today, CFR will undercount. This is a team-process prerequisite, not an API limitation — call it out to the team before trusting the number, and track label-usage rate as a data-quality signal (per the anti-gaming guidance: show data confidence, don't overread weak signals).

## D6: Failed Deployment Recovery Time

**Signal:** Same failure definition as D5 (no separate signal exists).

**Decision:** Recovery time = `resolving_release.published_at − failure_signal_time`, where:

- `failure_signal_time` = the incident issue's `created_at` if D5 condition 2 applied; otherwise the *failed* release's own `published_at` (i.e., we treat the bad deploy's own ship time as the failure-detection time when there's no incident issue to anchor on).
- `resolving_release` = the next release after the failure whose commit range contains either the revert commit or the hotfix PR's commit.

**Report:** Median (not mean — same distortion risk as the other timing metrics).

**Limitation — this is the weakest metric of the four:** Without an incident management system feeding real detection/resolution timestamps, "time to restore" is being approximated as "time to next release," which conflates *detecting* the problem with *shipping the fix*. A team that catches a bad deploy instantly but takes a day to get a fix through review will show the same recovery time as a team that took a day to *notice*. Document this plainly on the dashboard next to the number — don't present it as true MTTR without that caveat.

## Still open

- **D3 assumption (one release = one deploy)** is unverifiable from the API alone; revisit if the team ever confirms Deployment objects also exist (D1 alternatives).
- **Deployment Rework Rate** (the DORA guide's fifth metric) isn't spec'd yet — it would reuse D5's hotfix/incident detection almost as-is (`hotfix-labeled or incident-linked releases / total releases`, without requiring the "caused degradation" test). Worth adding once D5's labels prove reliable in practice, since the marginal cost is low.
- **Label consistency (D5/D6)** should get its own data-quality check in the pipeline (e.g. % of releases with no incident/hotfix signal either way vs. some signal) before these two metrics are shown to leadership without caveats.
