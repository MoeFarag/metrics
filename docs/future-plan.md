# Future Plan — Everything Beyond the Prototype

`implementation-plan.md` is what gets built now. This is what comes after, in what
order, and what has to be true first.

---

## 1. How to Read This

### Admission criteria — all five, or it stays parked

A metric is promoted into a phase only when all five hold. These exist because the
fastest way to lose the platform is to ship a metric people can argue with.

1. **A named decision.** Someone can state which decision changes based on this number.
   Metrics that are merely interesting go back to §8.
2. **A tension partner, or a recorded exemption.** Throughput and volume metrics do not
   ship alone. Diagnostic metrics that cannot be optimised against may be exempted, but
   the exemption is written down.
3. **Source data at agreed coverage.** The linkage rate needed is stated *before* build,
   not discovered after.
4. **A definition a squad has read and not disputed.** Not approval — just that the
   affected teams have seen it and the objections are known.
5. **A stated gaming hypothesis.** Write down how you expect the metric to be gamed
   before shipping it. If you cannot imagine anyone gaming it, you have not thought
   about it hard enough.

### Tag schema

Every metric below carries: **category** · **SPACE dimension** · **sources** ·
**lowest displayable grain** · **build effort** (`low` = existing tables only, `med` =
new extraction or labelling discipline, `high` = new integration or new source of truth).

Categories: `flow` · `ci-platform` · `quality` · `collaboration` · `wellbeing` ·
`outcome` · `architecture` · `ai-assist` · `onboarding` · `meta`.

Sources: `git` · `ci` · `deploy` · `incident` · `work-tracker` · `survey` · `hris` ·
`observability` · `calendar` · `ai-tooling`.

**No metric in this document is approved at `individual` grain, in any phase, for any
reason.**

---

## 2. Phase 2 — Complete the DORA Set and the Flow Picture

**Theme:** finish DORA, then turn "lead time is six days" into an actionable
decomposition.

The prototype ships three of the five DORA metrics. The other two are here rather than
in the build because both rest on the same weak foundation — GitHub Releases carry no
status field, so "this deploy broke production" has to be inferred (D5, D6).

| Metric | Category | Effort | Depends on |
|---|---|---|---|
| Failed Deployment Recovery Time | DORA / `quality` | med | M3 label coverage proven |
| Deployment Rework Rate | DORA / `quality` | low | M3's detection, reused |
| Queue time by stage | `flow` | med | M4, M5, M6 |
| Aging WIP | `flow` | low | Work-tracker hygiene |
| PR abandonment rate & stale branch age | `flow` | low | Git only |
| Investment profile | `outcome` | med | Work-item labelling |
| **Persistence layer** | `meta` | med | Nothing — it is a rewrite of the fetch path |
| Push-event ingestion | `meta` | low | Webhook receiver |
| Metric trust score | `meta` | low | First survey |
| Data coverage indicators | `meta` | low | Formalises what M1–M7 already compute |

### Failed Deployment Recovery Time

**Tags:** DORA, `quality` · performance · git, deploy · service · med

```
failure_signal_time = incident.created_at        (if an incident issue exists)
                    = failed_release.published_at (otherwise)
resolving_release   = next release whose commit list contains the revert commit
                      or the hotfix PR's merge_commit_sha
recovery_time       = resolving_release.published_at − failure_signal_time
```
Report **median only** — this is the most skew-prone metric in the DORA set and a mean
will be dominated by the one incident that took a week.

**Why it is deferred rather than built.** Without an incident management system feeding
real detection and resolution timestamps, "time to restore" is approximated as "time to
next release", which conflates *detecting* the problem with *shipping the fix*. A team
that catches a bad deploy instantly but takes a day to get a fix through review shows
the same recovery time as a team that took a day to notice (D6). It would need a caveat
longer than the number.

**Precondition for promotion:** either an incident-tool integration supplying real
detection timestamps, or M3's label coverage above 80% sustained for a quarter. Ship it
with the caveat printed on the view, never as unqualified MTTR.

### Deployment Rework Rate

**Tags:** DORA, `quality` · performance · git · service · low

```
rework_rate = hotfix-labelled or incident-linked releases / total releases
```
The DORA guide's fifth metric. Reuses M3's detection almost unchanged — without the
"caused degradation" test — so the marginal build cost is close to zero. Worth adding as
soon as M3's labels prove reliable in practice (D5 "still open").

### Queue time by stage

**Tags:** `flow` · efficiency · git, ci, deploy, work-tracker · service, squad · med

**The centrepiece of Phase 2.** Decompose lead time into: waiting for review, in review,
waiting for CI, waiting for approval, waiting for a deploy window. Visualise as a funnel
or stacked bar so the dominant wait is obvious at a glance.

This is the metric that converts "lead time is six days" into a decision. M4, M5, and M6
each feed a specific bar, so the causal chain becomes visible rather than asserted —
which is precisely why the prototype models M5 as `pr_review_cycle` rows rather than a
single count: the per-cycle timings are already there when this gets built.

**Key risk.** Stages must be mutually exclusive and exhaustive, or the bars will not sum
to lead time, and a funnel that does not reconcile destroys trust on first viewing.
Decide the handling of overlapping states — CI running during review is common — *before*
building, not during. Gaming risk: low.

### Aging WIP

**Tags:** `flow` · efficiency · work-tracker · squad · low

Age of the oldest open item per squad, and the distribution — not a raw WIP count. A
better action trigger than average cycle time because it names the specific stuck items.

### PR abandonment rate and stale branch age

**Tags:** `flow` · efficiency, activity · git · repo, service · low

Share of opened PRs closed without merge, and the age distribution of unmerged open
branches. Pure waste: work that consumed authorship and sometimes review effort and
produced nothing. Buildable from data the prototype already fetches.

**Note:** segment by author type once agentic authorship is detectable (Phase 5). A high
abandonment rate on agent-authored PRs is a different problem from a high rate on human
PRs — the first is wasted tokens and reviewer attention, the second usually signals
unclear requirements or shifting priorities. Gaming risk: low, but teams may start
leaving dead branches open rather than closing them, so track abandonment **and**
staleness.

### Investment profile

**Tags:** `outcome` · performance · work-tracker · squad, org · med

Share of engineering capacity on new value, keeping-the-lights-on, unplanned/incident
work, and deliberate debt reduction.

Probably the highest-value single chart for an executive audience, and it needs only
consistent work-item labelling. It also gives leadership something to act on that does
not involve pressuring teams to ship faster.

Included in Phase 2 specifically because the executive view should not remain limited to
delivery speed and CI health — it needs at least one metric that speaks to **allocation**
rather than pace. Gaming risk: med — the categories will be argued over, which is
actually useful, but the definitions must be written down and visible.

### Persistence layer

**Tags:** `meta` · — · all · — · med

The prototype computes every metric live on each load, with no database and no event
history (D8). That is deliberate and it is not a debt in the usual sense: **no metric
depends on an event having been captured when it happened**, so nothing is being lost
while it stays this way, and adding a store later leaves no gap in history.

What it buys, in the order the limits will bite:

1. **Latency and rate budget.** A cold full refresh is ~1,150–1,300 API calls, roughly
   four per hour against the authenticated budget. That is sized for one or two people.
   A third user, or a second repo, makes this the blocking constraint.
2. **Reproducibility.** SHAs are re-resolved on every load, so a force-moved tag can
   change a historical number between two loads (D2). A store snapshots each release's
   resolved commit list once and never re-resolves.
3. **Provenance.** With no rows there is nowhere to record which exclusion ruleset or
   required-check set a past number was computed under, so a config change silently
   re-bases the displayed history (D11, D14).

**Shape when built:** SQLite behind a storage adapter for local use, swappable for
Turso/libSQL, Vercel Postgres, or Neon in a deployed environment — per the Event Storage
decision in `decisions.md`. Cache `compare` on `(base_sha, head_sha)` and PR files on
`(pr_number, merge_commit_sha)`; both are permanently valid once their SHAs are
historical.

**Promote when:** a third regular user appears, a second repository is added, or cold-load
latency stops being tolerable — whichever comes first.

### Push-event ingestion

**Tags:** `meta` · — · git · repo · low

Ingest the `push` webhook so M6's `push_at` becomes the real developer push timestamp
rather than `run.created_at` (D7). Small, and it removes a documented approximation from
a metric that is otherwise sound. The webhook receiver already exists.

### Metric trust score

**Tags:** `meta` · satisfaction · survey · squad, org · low

A survey item asking whether engineers believe the dashboard reflects their reality. If
this is low, no other number on the platform should be acted on. Arguably the single
most important metric in this document, and the cheapest — it is one question.

### Data coverage indicators

**Tags:** `meta` · — · all · service, org · low

Formalises what `implementation-plan.md` §6 already computes per metric into a filterable
category: deployments linked to commits, incidents linked to services, work items linked
to PRs, services mapped to owners.

### Preconditions for Phase 2

- Work-tracker state transitions reliable enough to report flow stages. **Publish the
  percentage of items with usable transitions before showing anything derived from
  them.**
- Work-item labelling agreed for the investment profile categories. This is a
  negotiation, not a technical task, and it will take longer than the build.
- The prototype's two views live and reviewed for at least one full quarter.

**Unlocks:** the executive view stops being thin. Four categories — flow, ci-platform,
outcome, plus complete DORA — instead of two plus a partial DORA set.

---

## 3. Phase 3 — Quality, Reliability, and Load

**Theme:** pair the delivery picture with what it costs.

Phases 1 and 2 measure speed and waiting. This phase adds what speed costs: defects,
rework, incidents, and human load. Without it the platform reads as a speed dashboard
regardless of what the documentation says.

| Metric | Category | Effort |
|---|---|---|
| Flaky test rate (direct detection) | `ci-platform` | med |
| Code churn / rework | `quality` | med |
| Escaped defect rate | `quality` | med |
| Repeat incident rate | `quality` | low |
| On-call load | `wellbeing` | med |
| Cross-team dependency age | `collaboration` | med |
| Co-change coupling | `architecture` | low |
| Delivery predictability | `outcome` | low |
| Environment availability | `ci-platform` | med |

### Flaky test rate

**Tags:** `ci-platform` · efficiency, satisfaction · ci · repo · med

Same commit, different result — via deliberate re-running or test-level retry detection,
upgrading M7's `confirmed_flake_rate` from an opportunistic lower bound to a real
measure at test granularity rather than run granularity.

Flakiness is upstream of a surprising amount: it erodes trust in tests, which drives
manual QA, which drives lead time and change failure rate together.

### Code churn / rework

**Tags:** `quality` · performance · git · service, squad · med

Lines rewritten or deleted within 21–30 days of being merged, as a share of total lines
merged.

Read alongside M5: high churn plus high round trips points at the **requirements** stage;
high churn plus low round trips points at **insufficient review**.

**This is the most misreadable metric in this document.** It signals unclear requirements
far more often than poor engineering, and it will be misread as the latter unless the
interpretation guidance is on the view itself. Strictly `service` grain and above.
Gaming risk: med-high if ever shown near an individual. Requires an annotation
mechanism as its tension partner — churn is legitimately high during a deliberate
refactor and the metric is unreadable without that context. Build cost is line-level
attribution across commits.

### Escaped defect rate

**Tags:** `quality` · performance · incident, work-tracker · service · med

Customer-reported or production-discovered defects per release, split by severity.

### Repeat incident rate

**Tags:** `quality` · performance · incident · service · low

Share of incidents matching a previously seen cause. Pairs with post-incident action
item completion rate, which is an honesty metric: it shows whether learning is real.

### On-call load

**Tags:** `wellbeing` · satisfaction · incident · squad · med

Pages per shift, off-hours page rate, and **actionable page rate** — the share of pages
that led to a real action. Alert noise is both a burnout driver and a recovery-time
driver, so this sits at the junction of SPACE and DORA.

### Cross-team dependency age

**Tags:** `collaboration` · communication · work-tracker · squad · med

Age of items blocked on another team. Complements the Phase 2 queue funnel by naming
which wait is **external** rather than internal.

### Co-change coupling

**Tags:** `architecture` · performance · git · service, repo · low

Share of PRs touching more than one service, and the pairwise frequency of services
changing together. Buildable from PR data alone, no new integration.

Included here despite being an architecture metric because it is the cheapest entry into
that group and it explains lead-time inflation that no amount of CI tuning will fix.
High coupling between services that are supposed to be independently deployable is the
distributed-monolith signal.

### Delivery predictability

**Tags:** `outcome` · performance · work-tracker · squad · low

Committed versus delivered per sprint, and forecast error trend. **Read as a trend,
never as a target** — a squad hitting 100% is usually sandbagging.

### Environment availability

**Tags:** `ci-platform` · efficiency · ci, deploy · service · med

Share of time staging or preview environments are healthy and uncontended, plus wait
time for an environment slot. Needs environment state instrumentation.

### Preconditions for Phase 3

- Incident-to-service linkage at agreed coverage. **Publish the rate.**
- Incident-to-deployment linkage where possible, accepting it will be partial.
- Line-level attribution across commits — the main build cost for churn.
- Annotation mechanism live, for the reason given under churn.

---

## 4. Phase 4 — Architecture and Fair Comparison

**Theme:** answer "how do you compare squads with different responsibilities" with
something better than an apology.

Criticality weighting changes how every earlier metric is read. A 5% change failure rate
on the payments core is not a 5% change failure rate on the marketing site, and until
this phase the dashboard implies they are equivalent.

| Metric | Category | Effort |
|---|---|---|
| Service fan-in / fan-out | `architecture` | med |
| Service criticality score | `architecture` | high |
| Criticality delta | `architecture` | high |
| Blast radius per deployment | `architecture` | high |
| Cognitive load proxy | `wellbeing` | med |
| Golden path adherence | `ci-platform` | med |

### Service fan-in / fan-out

**Tags:** `architecture` · performance · git, observability · service · med

Fan-in: how many services depend on this one — drives blast radius. Fan-out: how many it
depends on — drives the owning squad's cognitive load and their exposure to other teams'
delays. Buildable from static analysis of imports, API client config, or service mesh
data; where none exists, Phase 3's co-change graph is the cheap substitute.

### Service criticality score

**Tags:** `architecture` · performance · git, observability · service · high

Centrality over the dependency graph — fan-in weighted by the importance of the
dependents, computed iteratively rather than as a flat count. A service depended on by
one very critical service outranks a service depended on by five leaf services.

Primary uses: risk-weighting change failure rate so squads with different
responsibilities can be compared fairly; deploy risk scoring; prioritising where to
invest test coverage, SLOs, and ownership clarity.

### Criticality delta

**Tags:** `architecture` · performance · git · service · high

Change in criticality over a rolling window, driven by new references added in merged
PRs. **The best available leading indicator in this entire document** — a service whose
fan-in is climbing is becoming a coordination chokepoint months before anyone
experiences it as "we're always waiting on that team."

### Blast radius per deployment

**Tags:** `architecture` · performance · deploy, git · service · high

Estimated downstream services and user-facing flows affected by a change to a given
service. Combines criticality with deployment events to produce a risk-weighted view of
the release calendar.

### Cognitive load proxy

**Tags:** `wellbeing`, `architecture` · satisfaction · deploy, git · squad · med

Services owned per squad, weighted by criticality. Two squads owning four services each
are not carrying equal load if one owns the payments core.

### Golden path adherence

**Tags:** `ci-platform`, `architecture` · performance · ci, deploy · service · med

Share of services using the paved-road pipeline versus bespoke ones. Directly measures
whether platform-as-a-product is working, and predicts where measurement data will be
missing.

### Preconditions and the non-negotiable constraint

- A dependency graph source: static analysis, API client config, or service mesh data.
  Where none exists, co-change coupling is the substitute and criticality must be
  labelled **approximate**.
- Service ownership mapping at high coverage. Criticality is meaningless without it.
- Established metric trust. Do not introduce a metric that ranks services before the
  platform has survived a full year of scrutiny.

**Criticality is a property of the architecture, not of the people.** The moment it reads
as "this squad owns the important stuff," it becomes a status metric and starts driving
territorial behaviour. Display it on service views, use it as a weighting factor
elsewhere, and keep it off anything resembling a squad comparison. **This constraint is
not negotiable and belongs in the view spec, not only here.**

---

## 5. Phase 5 — AI-Assisted Development

**Theme:** answer open questions about agentic authorship, not grade anyone.

Treat this entire group as **diagnostic and provisional**. There is no established
baseline for what good looks like. The honest framing, stated on the view: these metrics
exist to answer questions the org has not answered yet.

### The blocking dependency, and why it is urgent now

Nothing in this group is meaningful without **authorship attribution**, and there is no
reliable signal unless it is captured at commit or PR creation time. Options: commit
trailers, PR template fields, or emission from the agent tooling itself.

**Decide the mechanism during Phase 2 — years before these metrics ship — because
attribution cannot be backfilled.** Every day without it is a day of permanently
unattributable history.

| Metric | Category | Effort | Depends on |
|---|---|---|---|
| % of PRs with AI assistance | `ai-assist` | high | Attribution |
| Agentic authorship share | `ai-assist` | high | Attribution |
| Mean size of agentic PRs | `ai-assist`, `flow` | high | Attribution + M4 |
| % of PRs with agentic review | `ai-assist` | med | M5's `reviewer_type` (already built) |
| Review time & change fail rate on AI-assisted changes | `ai-assist`, `quality` | high | Attribution + Phase 3 |
| Churn & revert rate on AI-assisted changes | `ai-assist`, `quality` | high | Attribution + Phase 3 churn |

**% of PRs with AI assistance** is the adoption denominator for everything else in the
group. **Agentic authorship share** is the segmentation dimension — every other metric in
this document can be cut by it once attribution exists. **Mean size of agentic PRs** is
reported as a distribution against the human baseline; two failure modes sit at opposite
ends — very large agent PRs exceeding what a reviewer can meaningfully check, and a long
tail of trivially small agent PRs where token and review cost exceed the change's value.

### The hypothesis worth testing

**AI shifts the bottleneck from writing code to reviewing it.** If review time per line
rises on agentic PRs while their size also rises, the net flow gain is considerably
smaller than the authorship speedup suggests. M4 and M5 are exactly the instruments
needed to test this — which is the real reason attribution should be captured early.

### The waste cluster

Agentic PR size crossed with abandonment rate (Phase 2) identifies the clearest waste
signal available: **small agent-authored PRs that get abandoned.** Token spend plus
reviewer attention, no merged change. Build the cross-tabulation explicitly rather than
leaving it to be noticed.

### Constraint

Agentic authorship share is **explicitly neither good nor bad**. Any view that renders a
higher or lower share as favourable is wrong, and will drive adoption or avoidance for
dashboard reasons rather than engineering ones.

---

## 6. Phase 6 and Later — Deferred

Held back either because they need integrations that do not exist, or because they carry
privacy weight requiring established trust first.

| Metric | Category | Why deferred |
|---|---|---|
| Time to first PR / first production deploy | `onboarding` | HRIS integration and identity mapping; the first metric here needing personal employment data |
| Local setup time | `onboarding` | Survey-derived and trivially cheap — **can pull forward to any survey cycle** |
| Focus time | `wellbeing` | Calendar metadata; the highest privacy sensitivity in this document |
| Interruption and context-switch load | `wellbeing` | Privacy-sensitive; must be introduced to engineers before it appears anywhere |
| Review participation distribution | `collaboration` | Bus-factor signal, but sits close to individual grain; needs mature trust |
| Feature adoption after release | `outcome` | Requires product observability |
| Time to value | `outcome` | Requires the product intake process to be traceable |
| Decision and design review turnaround | `collaboration` | The data usually does not exist in structured form |
| Security remediation flow | `quality` | **Elevated priority if regulatory posture demands it — may pull forward** |
| Platform adoption | `meta` | Low cost; a dashboard nobody opens is not a measurement system |

**Time to first PR** is immediately legible to executives and correlated with almost
everything else — it compresses local environment quality, documentation, golden path
clarity, review responsiveness, and deployment friction into one number. Report as a
cohort median at org level and a distribution at squad level; **never as a per-hire
list.** Confirm the privacy position before starting.

**Two that may pull forward.** Local setup time costs one survey question and gives an
early read on onboarding friction while the HRIS integration is unbuilt. Security
remediation flow moves forward if the regulatory context makes it a compliance
requirement rather than an engineering nicety.

---

## 7. Deferred View Capabilities

Not metrics. Platform capabilities held back deliberately.

| Capability | Phase | Rationale |
|---|---|---|
| Criticality-weighted comparison across squads | 4 | Fair comparison requires the criticality score |
| Survey integration into signal derivation | 3 | Needs at least two survey cycles for a trend |
| Cross-squad comparison at category level | 2 | Requires the queue funnel to frame differences as bottlenecks rather than performance |
| Annotation mechanism | 2–3 | Prerequisite for churn; also the answer to "why did this move" |
| **Intervention tracking** | 3 at the latest | See below |
| Separate squad-lead and manager views | Not planned | Two views is the settled model (D15). Revisit only if the Manager view proves genuinely overloaded in real use |
| Forecasting or prediction | Not planned | High risk of being read as commitment. Revisit only on explicit request, with heavy caveats |

**Intervention tracking deserves emphasis.** Recording an intervention and measuring
whether flow improved afterwards is the capability that distinguishes a measurement
platform from a dashboard. Without it, the platform can say where delivery is blocked
but never whether anything anyone did about it worked. Build it as soon as there is a
stable enough baseline to measure against.

---

## 8. Dependency Map

```
M1 releases ─────────────────► Recovery time, rework rate (P2)

M2 lead time ────────────────► Queue funnel decomposition (P2)

M3 CFR label coverage ───────► Recovery time (P2) ──► Escaped defects (P3)

M4 PR size ──────────────────► Queue funnel: review bar (P2)
              └──────────────► Agentic PR size (P5)

M5 review cycles ────────────► Queue funnel: review bar (P2)
              └──────────────► Agentic review metrics (P5)

M6 time to signal ───────────► Queue funnel: CI bar (P2)

M7 rerun rate ───────────────► Flaky test rate, direct detection (P3)
              └──────────────► Satisfaction correlation, once survey exists (P3)

Work-tracker hygiene ────────► Aging WIP, flow efficiency, investment profile (P2)

Incident linkage ────────────► Escaped defects, repeat incidents, on-call load (P3)
                               and honest recovery time (P2)

Line-level attribution ──────► Code churn (P3) ──► Agentic churn (P5)

Authorship attribution ──────► The entire AI-assist group (P5)
  ⚠ decide the mechanism in P2 — it cannot be backfilled

Dependency graph source ─────► Fan-in/out, criticality, blast radius (P4)
  fallback: co-change coupling (P3)

Criticality score ───────────► Risk-weighted change fail rate (P4)
                  └──────────► Cognitive load proxy (P4)

HRIS integration ────────────► Time to first PR / first deploy (P6)
```

---

## 9. Integration Roadmap

Which new source unlocks what, so integration effort is prioritised by yield.

| Source | Unlocks | Phase | Yield |
|---|---|---|---|
| Work tracker (deeper) | Aging WIP, flow efficiency, investment profile, predictability | 2 | High — the investment profile alone justifies it |
| **Survey** | Metric trust score, satisfaction, local setup time, on-call sustainability | 2–3 | **Highest relative to cost — it is a form, not an integration** |
| Incident system | Escaped defects, repeat incidents, on-call load, honest recovery time | 2–3 | High |
| Dependency graph / service mesh | The whole architecture group | 4 | Medium-high, high build cost |
| Agent tooling | The whole AI-assist group | 5 | Unknown — that is the point of building it |
| Observability | Feature adoption, SLO health, security posture | 6 | Medium |
| HRIS | Onboarding metrics | 6 | Medium, high sensitivity |
| Calendar | Focus time, meeting load | 6 | Low relative to privacy cost |

The survey is consistently the best value in this table and consistently the thing that
gets deferred. **It is the only source that can tell you whether the rest of the platform
is trusted.**

---

## 10. Standing Constraints

Apply to every phase. Restated here so they survive personnel changes.

1. No metric at individual grain, in any phase, for any reason.
2. No squad-by-category grid on the executive view. It is a leaderboard with extra steps.
3. Every throughput metric ships with its tension partner on the same screen.
4. No metric reaches the executive view before the affected squads have seen it and can
   explain it. Being surprised by your own number in front of leadership is the fastest
   way for a team to conclude the platform is a weapon rather than a tool.
5. Data confidence is displayed, not merely tracked.
6. Metric definitions are public within the org and versioned.
7. Any metric whose trust score drops below the agreed threshold is **pulled from the
   executive view and reviewed, not defended.**
