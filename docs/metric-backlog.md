# Metric Backlog

Candidate metrics beyond the DORA five. Each entry is tagged so dashboard views can be
filtered by category, audience, data source, and build effort.

Nothing here is committed work. The two pairs selected for the first build are listed
under "Selected For Implementation" and are excluded from the backlog tables.

---

## Tag Schema

Every metric carries five tags.

**`category`** - what the metric is about. Primary filter for dashboard views.

| Tag | Meaning |
|---|---|
| `flow` | Movement of work through the system: waiting, batching, queueing |
| `ci-platform` | Health and trustworthiness of the build/test/deploy pipeline |
| `quality` | Defects, rework, escaped issues, churn |
| `collaboration` | Review, dependencies, coordination, knowledge |
| `wellbeing` | Sustainability, load, interruption, on-call |
| `outcome` | Value delivered, investment allocation, predictability |
| `architecture` | Service graph, coupling, criticality, blast radius |
| `ai-assist` | Agentic authorship, agentic review, AI-attributed change behaviour |
| `onboarding` | Ramp time for new engineers |
| `meta` | Data coverage, metric trust, platform adoption |

**`space`** - which SPACE dimension it serves: `satisfaction`, `performance`,
`activity`, `communication`, `efficiency`. Some metrics carry two.

**`source`** - systems required: `git`, `ci`, `deploy`, `incident`, `work-tracker`,
`survey`, `hris`, `observability`, `calendar`, `ai-tooling`.

**`grain`** - lowest level the metric may be displayed at: `org`, `squad`, `service`,
`repo`. No metric in this catalog is approved at `individual` grain.

**`effort`** - build cost given the existing pipeline: `low` (existing tables only),
`med` (new field extraction or labelling discipline), `high` (new integration or
new source of truth).

Additional flags used in the notes: **gaming risk** (low/med/high) and whether the
metric requires a **tension partner** before it may be shown to an executive.

---

## Selected For Implementation

Not part of the backlog. Recorded here for tag consistency.

| Metric | category | space | source | grain | effort |
|---|---|---|---|---|---|
| PR size distribution (p50/p75/p90) | `flow` | efficiency | git | service, squad | low |
| Review round trips per merged change | `collaboration` | communication | git | service, squad | low |
| Time to signal (time to red / time to green) | `ci-platform` | efficiency | git, ci | repo, service | low |
| CI rerun rate / first-attempt pass rate | `ci-platform` | efficiency, satisfaction | ci | repo, service | low |

Pairing: PR size is paired with review round trips. Time to signal is paired with
rerun rate. Neither throughput metric ships without its partner on the same view.

---

## Backlog: Flow

### Queue time by stage

**Tags:** `flow` | efficiency | git, ci, deploy, work-tracker | service, squad | med

Decompose lead time into: waiting for review, in review, waiting for CI, waiting for
approval, waiting for a deploy window. Visualise as a funnel or stacked bar so the
dominant wait is obvious at a glance.

This is the metric that converts "lead time is six days" into a decision. Almost every
other flow metric in this file is a sub-diagnostic of one of these bars.

Notes: stages must be mutually exclusive and exhaustive or the bars will not sum to
lead time, which destroys trust immediately. Decide up front how to handle overlapping
states (CI running during review is common). Gaming risk: low.

### Flow efficiency

**Tags:** `flow` | efficiency | work-tracker, git | squad, service | med

Active time divided by total elapsed time on a work item. Typically lands between 5%
and 20%, which is why it is persuasive with executives: it reframes delay as a system
property rather than an effort problem.

Notes: entirely dependent on ticket hygiene. Do not publish until you can show what
fraction of items have reliable state transitions. Gaming risk: med (teams learn to
move tickets to "in progress" late).

### Aging WIP

**Tags:** `flow` | efficiency | work-tracker | squad | low

Age of the oldest open item per squad, and the distribution, rather than a raw WIP
count. Better action trigger than average cycle time because it names the specific
stuck items.

### PR abandonment rate and stale branch age

**Tags:** `flow` | efficiency, activity | git | repo, service | low

Percentage of opened PRs closed without merge, and the age distribution of unmerged
open branches. Pure waste signal: work that consumed authorship and sometimes review
effort and produced nothing.

Notes: segment by author type once agentic authorship is detectable. A high abandonment
rate on agent-authored PRs is a different problem from a high rate on human PRs -
the first is wasted tokens and reviewer attention, the second usually signals unclear
requirements or shifting priorities. Gaming risk: low, but teams may start leaving dead
branches open rather than closing them, so track both abandonment and staleness.

---

## Backlog: CI Platform

### Flaky test rate

**Tags:** `ci-platform` | efficiency, satisfaction | ci | repo | med

Same commit, different result. Requires either retry detection or deliberate re-running.
Where direct detection is not possible, rerun rate (already selected for build) is the
cheap proxy.

Notes: flakiness is upstream of a surprising amount. It erodes trust in tests, which
drives manual QA, which drives lead time and change fail rate together.

### Environment availability

**Tags:** `ci-platform` | efficiency | ci, deploy | service | med

Percentage of time staging or preview environments are healthy and uncontended, plus
wait time for an environment slot.

### Golden path adherence

**Tags:** `ci-platform`, `architecture` | performance | ci, deploy | service | med

Share of services using the paved-road pipeline versus bespoke ones. Directly measures
whether platform-as-a-product is working, and predicts where measurement data will be
missing.

---

## Backlog: Quality

### Code churn / rework

**Tags:** `quality` | performance | git | service, squad | med

Lines rewritten or deleted within 21-30 days of being merged, as a share of total
lines merged.

Signals unclear requirements far more often than poor engineering. Read it alongside
review round trips: high churn plus high round trips points at the requirements stage,
high churn plus low round trips points at insufficient review.

Notes: needs line-level attribution across commits, which is the main build cost.
Gaming risk: med-high if ever shown near an individual. Strictly `service` grain and
above. Requires a tension partner - churn can be legitimately high during a
deliberate refactor, so pair with an annotation mechanism.

### Escaped defect rate

**Tags:** `quality` | performance | incident, work-tracker | service | med

Customer-reported or production-discovered defects per release, split by severity.

### Repeat incident rate

**Tags:** `quality` | performance | incident | service | low

Share of incidents matching a previously seen cause. Pairs with post-incident action
item completion rate, which is an honesty metric: it shows whether learning is real.

### Security remediation flow

**Tags:** `quality` | performance | observability, work-tracker | service | med

Mean time to remediate by severity, dependency freshness, percentage of critical
findings inside SLA. Elevated priority in a regulated banking context.

---

## Backlog: Collaboration

### Cross-team dependency age

**Tags:** `collaboration` | communication | work-tracker | squad | med

Age of items blocked on another team. Complements the queue funnel by naming which
wait is external rather than internal.

### Review participation distribution

**Tags:** `collaboration` | communication | git | squad, service | low

How concentrated review load is within a squad. High concentration is a bus-factor and
burnout risk. Show as a distribution shape, never as a per-person list.

### Decision and design review turnaround

**Tags:** `collaboration` | communication | work-tracker, git | squad | high

RFC opened to decision recorded. Usually the invisible front half of lead time, and
usually missing from every dashboard.

---

## Backlog: Wellbeing

### On-call load

**Tags:** `wellbeing` | satisfaction | incident | squad | med

Pages per shift, off-hours page rate, and **actionable page rate** - the share of pages
that led to a real action. Alert noise is both a burnout driver and a recovery-time
driver, so this sits at the junction of SPACE and DORA.

### Interruption and context-switch load

**Tags:** `wellbeing` | satisfaction, efficiency | git, work-tracker | squad | med

Distinct repositories, services, or work streams touched per engineer per week,
aggregated to squad level and reported as a distribution.

Notes: this is the most privacy-sensitive metric in the catalog after focus time.
Squad grain only, distribution only, and it should be introduced to engineers before
it appears anywhere.

### Focus time

**Tags:** `wellbeing` | satisfaction | calendar | squad | high

Uninterrupted calendar blocks during working hours. Aggregated metadata only, squad
grain only, and it needs an explicit privacy statement on the view itself. Do not
build this before metric trust is established.

### Cognitive load proxy

**Tags:** `wellbeing`, `architecture` | satisfaction | deploy, git | squad | med

Services owned per squad, weighted by service criticality (see architecture section).
Two squads owning four services each are not carrying equal load if one owns the
payments core.

---

## Backlog: Outcome

### Investment profile

**Tags:** `outcome` | performance | work-tracker | squad, org | med

Share of engineering capacity on new value, keeping-the-lights-on, unplanned/incident
work, and deliberate debt reduction.

Probably the highest-value single chart for a CEO-office audience, and it needs only
consistent work-item labelling. It also gives leadership something to act on that does
not involve pressuring teams to ship faster.

Notes: label discipline is the whole build. Gaming risk: med - the categories will be
argued over, which is actually useful, but definitions must be written down and visible.

### Delivery predictability

**Tags:** `outcome` | performance | work-tracker | squad | low

Committed versus delivered per sprint, and forecast error trend. Read as a trend, never
as a target - a squad hitting 100% is usually sandbagging.

### Time to value

**Tags:** `outcome` | performance | work-tracker, deploy | service, org | med

Idea accepted to customers actually using it. Wider than lead time, and closer to what
the CEO office is actually asking about.

### Feature adoption after release

**Tags:** `outcome` | performance | observability | service | high

Shipping is not delivering. Pairs with deployment frequency to prevent the dashboard
from rewarding volume.

---

## Backlog: Architecture

See the discussion note in chat for the reasoning behind this group. These are the
metrics that answer "which services are becoming chokepoints" and let you risk-weight
comparisons between squads with different responsibilities.

### Service fan-in / fan-out

**Tags:** `architecture` | performance | git, observability | service | med

Fan-in: how many services depend on this one. Fan-out: how many it depends on.
Fan-in drives blast radius. Fan-out drives the owning squad's cognitive load and
their exposure to other teams' delays.

Notes: buildable from static analysis of imports, API client config, or service mesh
data. Where none exist, the co-change graph below is the cheap substitute.

### Service criticality score

**Tags:** `architecture` | performance | git, observability | service | high

Centrality over the dependency graph - fan-in weighted by the importance of the
dependents, computed iteratively rather than as a flat count. A service depended on by
one very critical service outranks a service depended on by five leaf services.

Primary uses: risk-weighting change fail rate so squads with different
responsibilities can be compared fairly; deploy risk scoring; prioritising where to
invest test coverage, SLOs, and ownership clarity.

Notes: this is a property of the architecture, not of the people. It must never be
displayed in a way that implies the squad owning a critical service is more or less
productive. Requires a tension partner before executive display.

### Criticality delta

**Tags:** `architecture` | performance | git | service | high

Change in criticality score over a rolling window, driven by new references added in
merged PRs. A service whose criticality is climbing fast is becoming a coordination
chokepoint before anyone notices, and is the best available leading indicator for
future cross-team dependency waits.

### Co-change coupling

**Tags:** `architecture` | performance | git | service, repo | low

Share of PRs that touch more than one service, and the pairwise frequency of services
changing together. Buildable from PR data alone with no new integration.

High coupling between services that are supposed to be independently deployable is the
distributed-monolith signal, and it explains lead time inflation that no amount of CI
tuning will fix.

### Blast radius per deployment

**Tags:** `architecture` | performance | deploy, git | service | high

Estimated number of downstream services and user-facing flows affected by a change to
a given service. Combines criticality with deployment events to produce a risk-weighted
view of the release calendar.

---

## Backlog: AI Assist

Treat this whole group as diagnostic and provisional. There is no established baseline
for what good looks like, and the honest framing is that these metrics exist to answer
open questions rather than to grade anyone.

### Percentage of PRs with AI assistance

**Tags:** `ai-assist` | activity | git, ai-tooling | service, squad | high

Adoption denominator for everything else in this group. The build cost is attribution:
there is no reliable signal unless authorship is tagged at commit or PR creation time,
via commit trailers, PR templates, or the agent tooling itself.

Notes: attribution mechanism must be decided before any of the comparison metrics
below become meaningful. This is the blocking dependency for the group.

### Agentic authorship share

**Tags:** `ai-assist` | activity | git, ai-tooling | service, squad | high

Share of merged changes primarily written by an agent. Explicitly neither good nor bad.
The value is in what it lets you segment - every other metric in the catalog can be
cut by this dimension once attribution exists.

### Mean size of agentic PRs

**Tags:** `ai-assist`, `flow` | activity, efficiency | git, ai-tooling | service | high

Reported as a distribution against the human baseline. Two failure modes sit at
opposite ends: very large agent PRs that exceed what a reviewer can meaningfully
check, and a long tail of trivially small agent PRs where the token and review cost
exceeds the value of the change.

Notes: pair with agentic PR abandonment rate. A small-and-abandoned cluster is the
clearest waste signal available in this group.

### Percentage of PRs with agentic review

**Tags:** `ai-assist`, `collaboration` | communication | git, ai-tooling | service | med

Coverage of automated review. Interesting mainly in combination with the next metric.

### Review time and change fail rate on AI-assisted changes

**Tags:** `ai-assist`, `quality` | performance | git, ai-tooling, incident | service | high

Compare human review time, review round trips, and change fail rate on AI-assisted
changes against the baseline.

The underlying hypothesis worth testing: AI shifts the bottleneck from writing code to
reviewing it. If review time per line rises on agentic PRs while their size also rises,
the net flow gain is smaller than the authorship speedup suggests.

### Churn and revert rate on AI-assisted changes

**Tags:** `ai-assist`, `quality` | performance | git, ai-tooling | service | high

Whether agent-written code is rewritten or reverted at a different rate than human
code within the 21-30 day window. Depends on the churn metric above being built first.

---

## Backlog: Onboarding

### Time to first PR / first production deploy

**Tags:** `onboarding` | satisfaction, efficiency | git, deploy, hris | squad, org | high

Days from start date to first merged PR, and to first change in production.

Immediately legible to executives and correlated with almost everything else - it
compresses local environment quality, documentation, golden path clarity, review
responsiveness, and deployment friction into one number.

Notes: the HRIS integration is the entire build cost, and it is the first metric in
this catalog requiring personal employment data. Identity mapping from HRIS record to
Git account is the hard part. Report as a cohort median at org level and as a
distribution at squad level; never as a per-hire list. Confirm the privacy position
before starting.

### Local setup time

**Tags:** `onboarding` | satisfaction | survey | squad | low

Survey-derived. Cheap, and a useful sanity check on the metric above while the HRIS
integration is unbuilt.

---

## Backlog: Meta

### Data coverage indicators

**Tags:** `meta` | - | git, ci, deploy, incident, work-tracker | service, org | low

Percentage of deployments linked to commits, incidents linked to services, work items
linked to PRs, services mapped to owners. Already partly specified in the measurement
system plan; listed here so it can be filtered as a category.

### Metric trust score

**Tags:** `meta` | satisfaction | survey | squad, org | low

Survey item asking whether engineers believe the dashboard reflects their reality.
If this is low, no other number on the platform should be acted on. Arguably the single
most important metric in the catalog.

### Platform adoption

**Tags:** `meta` | activity | observability | org | low

Active use by squad leads and managers. A dashboard nobody opens is not a measurement
system.

---

## Appendix: Audience View Mapping

Filtering rule for building views. The same metric can appear at more than one level,
but the grain, the time horizon, and the drill-down depth change.

| | Squad lead | Engineering manager / director | CEO office |
|---|---|---|---|
| Decision | What do I unblock this week | Is this problem local or systemic | Where do we invest next quarter |
| Horizon | Sprint | Quarter | Quarter to year |
| Grain | Individual work items, own squad only | Squad and service comparison | Org trend, no squad ranking |
| Drill-down | Full, to the specific PR or ticket | To squad and service | To bottleneck narrative, not to raw rows |
| Categories | `flow`, `ci-platform`, `collaboration`, `quality` | `flow`, `architecture`, `wellbeing`, `quality` | `outcome`, `meta`, plus DORA trend |
| Comparison | Own trend over time | Across squads, framed as shared bottlenecks | Against stated goals, not against peers |

Two rules that apply across all three:

1. No metric reaches the executive view before the affected squad has seen it and can
   explain it. Surprising a team with their own number in front of leadership is the
   fastest way to lose the trust the platform depends on.
2. Every throughput metric on the executive view carries its tension partner on the
   same screen, not one page deeper.
