# Architecture Notes — Working Document

Not the deliverable. This is the settled architecture and the document outline, written
up so the deliverable can be drafted from it.

Context: ~8 squads, ~30 engineers, fintech. Solo builder. The Part 1 build
(`docs/implementation-plan.md`, `docs/decisions.md`) is the thing being extended, not a
hypothetical.

**Settled:** three-stage architecture (ingestion / transformation / reporting) ·
generality argued structurally, not by worked example · **7–8 shipped metrics plus a
living extension mechanism** (supersedes the earlier "11 metrics" call — see
`framework-and-prior-art.md` §4) · comparison is across services, never squads ·
Section 4 reverses D8 into a properly staged pipeline.

**Framework interfaces and prior-art research live in `framework-and-prior-art.md`.**
Headline finding: roughly two-thirds of this architecture is already standardised
(CloudEvents, CDEvents, the Airbyte connector protocol, semantic layers such as Cube and
dbt MetricFlow, Faros CE as the closest whole-platform prior art). We adopt those. The
remaining third — the Signal object, push-ingestion lifecycle, and governance-as-schema —
is the actual product.

---

## 1. The Claim

> **A new domain supplies events and definitions. It supplies no code.**

That is the whole architecture in one line, and it is falsifiable. Everything below
exists to make it true, and §5 says how we would test it rather than assert it.

Most "extensible platform" claims fail because the extension point is a plugin interface
onto a domain-specific core — you can add a connector, but the thing the connector feeds
still thinks in pull requests. The claim above is stronger: it says the core has no
domain vocabulary at all, only two abstractions that every domain reduces to. Those are
§3 and §4, and they are the substance of this design.

---

## 2. Three Stages

One vocabulary, used consistently. These are standard data-platform stages and they are
also the axis along which the prototype is deliberately collapsed (§7).

```
INGESTION            source-specific, pluggable
  connectors → normalised events → pseudonymisation

TRANSFORMATION       domain-neutral — this is the product
  event model → metric algebra → governance → computed metrics

REPORTING            domain-neutral shell, domain-configured content
  access enforcement → disclosure layers → Manager view · Executive view · API
```

**Ingestion** holds every credential, API quirk, pagination rule and rate limit, and
knows nothing about metrics. Its only output is normalised events. This boundary already
exists in the Part 1 build (`src/github-wrapper.js`) and `decisions.md` already committed
to it — "GitHub is one source connector, not the product boundary." We are honouring a
decision, not inventing a layer.

**Transformation** is where the Part 1 work already lives and where none of the code
mentions GitHub: percentiles, MAD, the three noise gates, data-confidence gating,
band assignment, tension-pair rollup.

**Reporting** is two views over the same objects at three disclosure depths — Signal →
Number → Evidence — with the rule that the number is never hidden, only deferred (D15).

Access control is not a fourth stage. It is enforced at all three, which is the point of
§6.

---

## 3. Generalisation, Part One — The Event Model

Four nouns. Every source in every domain reduces to them.

```
entity   the thing that flows        a unit of work with a lifecycle
event    a timestamped transition    something that happened to an entity
actor    who or what acted           pseudonymised at ingestion, always
unit     the owning group            the team accountable for the entity
```

Plus one derived structure the engine builds rather than ingests:

```
window   a bounded interval between two events of the same kind
```

`window` is not decoration — it is what every duration metric in Part 1 actually
measures. `release_windows` in the implementation plan is exactly this structure, and it
is the spine of three of the seven built metrics.

**Two grain axes, and they are not interchangeable** (see §6):

- `service` — what an entity belongs to. The **comparative** axis.
- `unit` — who owns it. The **self-view** axis only.

---

## 4. Generalisation, Part Two — The Metric Algebra

This is the load-bearing idea, and the reason the claim in §1 is stronger than "we have
connectors."

**Every metric worth building reduces to one of four shapes.** Each shape has a fixed
computation recipe the engine implements once. A metric definition selects a shape and
parameterises it. Domains supply definitions, never code.

| Shape | Question it answers | Recipe | Reported as |
|---|---|---|---|
| **Count** | How much completed? | Bucket by period over a filtered population | Per-period rate **plus gap distribution** — never a bare average |
| **Duration** | How long between two points? | Interval between two named event anchors on one entity | p50 and p85 — never a mean |
| **Ratio** | What share satisfies a condition? | Numerator predicate over denominator population | Rolling percentage over a trailing window |
| **Distribution** | What is the shape of a per-entity quantity? | Per-entity value, then percentiles | p50/p75/p90 **plus share beyond a threshold** |

The recipes carry Part 1's statistical commitments — medians not means, gap distributions
not intervals, rolling not cumulative. Those stop being per-metric discipline and become
properties of the shape, enforced once.

### 4.1 The eleven metrics against the four shapes

| Metric | Shape |
|---|---|
| Deployment frequency | Count |
| Lead time for changes | Duration |
| Change failure rate | Ratio |
| Failed deployment recovery time | Duration |
| PR size | Distribution |
| Review round trips | Distribution |
| Time to signal | Duration |
| Rerun / first-attempt pass rate | Ratio |
| Queue time by stage | Duration — **segmented** variant |
| Investment profile | Ratio — **multi-class** variant |
| Metric trust score | Ratio |

Eleven metrics, four shapes, two variants. **The two variants are worth naming rather
than glossing** — an architecture that claims to be perfectly clean usually is not:

- **Segmented duration** — child durations that must partition a parent duration exactly.
  This is why queue time is hard: if the segments do not sum to lead time, the funnel does
  not reconcile and trust dies on first viewing.
- **Multi-class ratio** — shares across n mutually exclusive classes summing to 1, rather
  than one predicate against a population.

Both are engine features, built once, available to every domain thereafter. A domain that
needs a genuinely fifth shape is measuring something new — and that is one engine
addition, shared, not a fork.

### 4.2 Why this generalises without needing a worked example

The shapes contain no domain vocabulary. "Duration between two event anchors on an
entity" is as true of a risk finding reaching remediation, or a campaign reaching launch,
as it is of a commit reaching production. The engine cannot tell the difference, and that
is the property we want.

The sharpest evidence is internal to Part 1: **review round trips is not an engineering
metric.** It is a Distribution over "count of review-then-revise cycles per entity" that
happens to have been discovered in a code review. Any domain with a review loop has that
metric already, computed by identical code, the moment it emits review and revision
events. We did not design it to be general — it turned out to be general once the
engineering vocabulary was stripped off. That is the test the whole abstraction has to
pass, and it passed unprompted.

---

## 5. Testing the Claim Instead of Asserting It

Asserting generality is worth nothing. The falsifiable version, and a 90-day deliverable:

> Stand up **one metric from a non-engineering domain** on the same engine, with events
> loaded manually from a spreadsheet rather than a built connector.

Manual load is the point: it tests the **model**, not the integration. If the four nouns
can express the entity and one of the four shapes computes it with no engine change, the
claim holds. If it needs an engine change, we learn that in week 10 rather than year two.

**What honestly does not transfer**, and should be stated rather than glossed:

- **Band thresholds.** DORA publishes bands; other domains do not. Each needs its own
  calibration period, and until then the metric shows a number with no band.
- **Tension pairs.** Gaming pressures are domain-specific and must be re-derived per
  domain. That is a thinking task, not a build task, and it does not scale with the
  platform.
- **Connector effort.** Genuinely new work per source. The claim is that it is *bounded
  and isolated*, not that it is free.

---

## 6. Access and Security

The system touches every engineer's individual output. Get this wrong and it becomes a
surveillance tool people route around.

### 6.1 The sharp problem, specific to this org's shape

**30 engineers across 8 squads is ~3.75 engineers per squad.** At that size a squad
metric *is* an individual metric with extra steps. "We never show individual grain" is
not a defence when the squad has four people and everyone knows who wrote the big PRs.

**Resolution: comparison is across services, never squads.**

- Services are the comparative axis. They outlive squads, outnumber them, and a service
  is not a person. "Checkout has a 90th-percentile lead time of nine days" is a statement
  about a system; the squad-shaped version of that sentence is a statement about four
  named people.
- A squad always sees **itself** at squad grain — that is how it acts on anything. Self-
  view and comparative-view are different rights, not different filters.
- Cross-squad framing degrades deliberately to a bottleneck narrative — "the dominant
  wait across the org this quarter is review" — rather than a squad table. That is a
  product decision with a real cost: some managers will want the table. The answer is
  that the table is a leaderboard and the narrative is a diagnosis.

### 6.2 Four mechanisms, one per stage plus one across

1. **Pseudonymisation at ingestion.** Actor identity becomes a salted stable hash inside
   the connector, before it reaches transformation. The identity map lives in a separate
   store the metric path cannot join to. A database compromise therefore yields no
   per-person productivity table, because one was never assembled.
2. **Individual grain is not computed, at transformation.** Not hidden — *absent*. Hidden
   is one config toggle away from a leaderboard, and every engineer correctly assumes it
   exists. The engine has no code path producing a per-actor statistic, and the metric
   definition schema has no `individual` grain to declare.
3. **Evidence is scoped and logged, at reporting.** Layer 3 is the real PII surface — a
   list of PRs is inherently attributable however clean the aggregates are. Own-squad by
   default; cross-squad requires an explicit grant; **every Layer 3 access is
   audit-logged**, so "who looked at whose work" is an answerable question.
4. **The Executive view cannot reach Layer 3 at all** — structurally, not by permission
   setting. Leadership gets numbers and caveats, never rows. A permission can be granted
   in a hurry before a board meeting; a missing code path cannot.

### 6.3 Fintech specifics

- **Authentication is organisational SSO via OIDC** (D18). The prototype's
  environment-configured usernames were an explicit temporary gate; in a regulated fintech,
  SSO with MFA and central deprovisioning is a baseline, not a feature. **IdP group claims
  do double duty** — they supply both the audience model (who reaches which view) and squad
  membership, so §6.1's access rules need no separate roster to drift out of date, and
  leavers are handled by the IdP rather than by someone remembering.
- The IdP subject is also the stable identity hashed at ingestion, so pseudonymisation
  survives someone changing their GitHub handle.
- Source credentials never reach the browser (already a `decisions.md` stance). Read-only,
  least-privilege GitHub App rather than a personal PAT.
- The platform holds **no customer data** — worth stating explicitly, because it changes
  which review it needs.
- Retention: metric outputs are derived and recomputable; raw events get a stated
  retention window rather than accumulating by default.
- **The regulatory upside.** In a regulated fintech, change-flow metrics double as change
  management evidence — deployment traceability, reviewed-change ratios, segregation of
  duties. An auditor asks for these anyway. One line in the deliverable reframes the
  platform from cost centre to compliance asset, which is also the argument that funds it.

---

## 7. Section 4 — The Decision to Reverse at 10x

10x is ~300 engineers, ~80 squads, hundreds of services.

**Reverse D8: the prototype computes everything live, in one synchronous request path.**

The precise thing being reversed is not "there is no database." It is that **all three
stages of §2 are collapsed into a single request.** A page load fetches from GitHub,
transforms, and renders, inside one process, inside one HTTP request. Ingestion,
transformation and reporting exist as functions rather than as stages with boundaries
between them.

That is right for a one-week prototype with two users — it is the fastest path to seeing
whether the numbers are worth anything — and it is wrong at 10x for four reasons that all
bite at once:

- **Coupling of failure domains.** One slow source API becomes a broken dashboard. At
  ~1,200 calls per load, one 500 anywhere fails the page.
- **No replay.** When a metric definition changes, history cannot be recomputed, because
  raw events were never kept. Part 1 already documents this wound as the missing
  provenance problem (D11, D14): a config change silently re-bases every historical
  number shown.
- **Rate budget.** Four full refreshes per hour is a two-user ceiling, and it is a hard
  one.
- **No independent scaling.** Ingestion is I/O-bound and bursty; transformation is
  CPU-bound and batchable; reporting must be fast and is neither. One process cannot be
  tuned for all three.

**Replacement: separate the three stages physically, with durable boundaries.**

```
ingestion      scheduled + webhook → append-only raw event store
transformation scheduled batch     → computed metric store (versioned by definition)
reporting      reads the metric store only, never a source system
```

The boundaries are the point, not the stores. Each stage gets its own failure domain,
its own scaling profile, and its own replay path. **The capability this unlocks is
replay**: with raw events retained and metric definitions versioned, changing a
definition means recomputing history under the new version and keeping both — which is
exactly the provenance guarantee Part 1 has to do without.

**Note on honesty.** Phase 2 of `future-plan.md` already schedules *adding a store*.
This is a different and larger claim: adding a cache under a collapsed pipeline is an
optimisation, whereas separating the stages is a re-architecture. Worth one sentence in
the deliverable to distinguish them, because "I planned to fix this anyway" is a weaker
answer than "I would rebuild this axis."

### 7.1 The reversal is incremental, and the first increment pays for itself

The strongest version of this answer is not "I would rebuild it." It is **"I would reverse
it in one cheap step that returns value before the framework exists."**

The current build genuinely does keep earning while the framework is designed — it
produces real numbers on a real repository today. What it cannot do is absorb more
sources: at ~1,200 calls and four refreshes an hour for GitHub alone, adding two or three
more sources takes it to roughly one refresh an hour. **So the interim step is not
optional if the source count grows — but it is small.**

**The condition that makes it worth doing: the interim must be a strict subset of the
target architecture, not a different one.** Interim architectures become permanent, and
the way to survive that is to make permanence acceptable. Concretely, when persistence
lands it should be **the event log**, not a response cache:

| Build now, and keep | Defer until 2–3 sources exist |
|---|---|
| Append-only event log, CloudEvents-shaped | Declarative metric registry |
| Ingestion split into push and pull shapes, even hand-written | Widget-to-shape binding |
| A thin Signal envelope — shape, permission, provenance | Full governance schema |
| Per-transformer cursors over `stream_seq` | Service resolution / registry |

Everything in the left column survives into the target architecture untouched. The
hand-written transformers reading from it get replaced later; the log and the ingestion
split do not.

**The second reason to sequence it this way is more important than the performance one.**
Designing a canonical event model from a single source produces a model shaped like that
source — which is exactly the reservation recorded against Faros CE's engineering-shaped
canonical model in `framework-and-prior-art.md` §1.3. Two or three real sources is the
minimum evidence needed to see what actually varies. **Adding sources over a persisted
event log is therefore not a detour on the way to the framework; it is how the framework
gets designed correctly rather than guessed.**

The immediate payoff is replay: with events retained and definitions versioned, changing a
metric definition recomputes history instead of silently re-basing it — the provenance
wound D11 and D14 already document.

**Runner-up, if a second is wanted:** D1, Releases as the sole production signal —
unenforceable across 80 squads with mixed stacks, and the root cause of weak change
failure rate and recovery time. Replaced by a deployment event contract carrying an
explicit status, which Releases cannot provide.

---

## 8. Document Outline and Word Budget

Page limits are the binding constraint: 4.5 pages for four sections that each want more.

**Calibration assumption:** ~450 words per page for a document of this shape — 11pt,
1" margins, headings and tables consuming vertical space. Plain prose runs ~550/page;
tables cost more space per word but carry more information. **To confirm against the real
PDF pipeline at the final stage, as agreed.**

| § | Section | Max pages | Words | Form |
|---|---|---|---|---|
| 1 | Metric Design | 1.0 | ~430 | 11-row table + exclusions paragraph |
| 2 | Platform Architecture | 1.5 | ~420 + diagram | Diagram ≈ 0.45 page |
| 3 | 90-Day Execution Plan | 1.5 | ~650 | Three blocks + non-goals + day-90 number |
| 4 | What You'd Change | 0.5 | ~220 | Prose |
| | **Total** | **4.5** | **~1,720** | |

### 8.1 Section 1 — a living set, not a fixed list

**Revised.** The section presents **7–8 shipped metrics as the starting point**, then the
mechanism by which the set grows. That is both more honest and easier to fit than the
earlier fixed 11.

Proposed columns: `Metric · Shape · Source · Computation · Gaming defence`.

The extension paragraph is the substance, and it carries three points:

- **What the set becomes depends on the organisation, not on us** — which systems we get
  access to (work tracker, HRIS, deployment infrastructure), which conventions the org
  will impose or already has (incident and hotfix labels, work-item categories), and which
  regulatory signals matter.
- **In a regulated fintech the set extends sideways, not just forwards** — unreviewed
  production change, segregation-of-duties breaches, remediation SLA adherence. These use
  the same four shapes and the same engine; they are compliance early warnings rather than
  productivity metrics, and they are arguably the signals that justify the platform's
  existence to a risk committee.
- **The marginal cost of a new metric has collapsed.** A conforming transformer or
  connector against a written interface spec is hours of agent-assisted work, not a
  sprint. That changes the design objective: optimise for many small conforming components
  rather than a few hand-tuned ones, and spend scarce human time on interfaces and
  governance instead of on breadth.

Naming the eleven candidates in the extension paragraph costs a fraction of what tabulating
them costs, and says the more useful thing.

#### Gaming defences — three kinds, not seven arguments

Stating the taxonomy once lets the table's defence column stay to a phrase per metric,
which is what makes one page achievable.

1. **A tension partner** that degrades when the metric is gamed.
2. **A companion data-quality figure** that exposes the mechanism directly.
3. **Never setting a target** — the structural defence. A metric with no target has
   nothing to game toward, and every metric here is reported as a distribution to inform
   conversation rather than as a goal to hit.

| Metric | Gaming vector | Defence | Kind |
|---|---|---|---|
| M1 Deploy frequency | Split one shipment across several releases to inflate the count | **Changes-per-deploy**, reported alongside. Splitting drives it toward 1 while frequency rises — a signature genuine improvement does not produce. Gap distribution also exposes clustering: three releases four minutes apart are visibly not three deploys. **Structural fix: real deployment events** (§8.1.2) | 2 + 1 |
| M2 Lead time | **Open the PR late.** Work on a branch for a week, open the PR minutes before merge, and lead time collapses | **Pre-PR branch age** as a companion figure today. **Structural fix: anchor on first commit** (§8.1.2, D17) | 2 + 1 |
| M3 Change failure rate | Stop labelling incidents | Label coverage shown at equal visual weight (D9) | 2 |
| M4 PR size | Stack dependent PRs so each looks small | M5 summed across a detectable stack — the wait moved, it did not shrink | 1 |
| M5 Round trips | **Rubber-stamp approvals.** Round trips fall to zero, which reads as healthy | CFR, which rises when review stops catching things. See below | 1 |
| M6 Time to signal | Remove tests from the required set | `required_check_count` plotted on the metric's own chart | 2 |
| M7 Rerun rate | Stop retrying — give up on CI and merge around it | First-attempt pass rate, the systemic half of the pair | 1 |

**M2 deserves the most attention — it is the sharpest vector in the set.** It needs no
coordination, no process change, leaves no trace in the metric itself, and one person can
do it unilaterally. Every other vector here either requires collusion or shows up
elsewhere.

The defence is nearly free because the data is already fetched. M5 already calls
`GET /pulls/{n}/commits`, so:

```
pre_pr_branch_age = pr.created_at − first_commit.committer.date
```

This is the work that existed *before* the clock started — the part D4 deliberately chose
not to count, for defensibility. Reporting it turns that choice into a monitored one:
**lead time falling while pre-PR branch age rises means the clock is being started late,
not that delivery improved.** Also watch the left tail — a healthy distribution has no
spike at zero, so a rising share of PRs merged within an hour of opening is the same
signal seen from the other side.

There is also an indirect partner: sitting on a branch produces a larger, less
incrementally reviewed PR, so **M4 rises when M2 is gamed this way.** Weaker than a
designed pair, but real.

**M5 is the one metric where both directions are suspicious**, which is unusual enough to
say on the view. High round trips means unclear requirements or a missing design review —
already in the interpretation guidance. But **zero round trips is not automatically good**:
it means either a clean, well-specified change or that nobody meaningfully reviewed. The
metric cannot tell those apart alone, so it carries two tension relationships rather than
one — M4 for batch-splitting, and **M3 for review quality**. M5 falling while M3 rises is
the rubber-stamp signature. Review dwell time (`review_requested` → `submitted_at`,
already available) is the cheap secondary check: approvals arriving in seconds are not
reviews.

#### 8.1.2 Detection is the prototype's answer; better sources are the real one

Every defence above works within the prototype's single source. Two of them are
**detection** — they tell you gaming happened. The structural fixes *prevent* it, and both
arrive by adding a source rather than by cleverness.

**M2 — anchor on first commit, and make first commit mean something** (D17). Lead time
reverts to the canonical DORA definition, **first commit → production**. What makes that
anchor meaningful rather than arbitrary is an organisational convention: **pushing to a
ticket-named branch is the only way a work item enters "In Progress."**

The elegance is that **the incentive does the enforcement.** A developer wants their ticket
visible as in progress, so they push early — which is exactly the behaviour the metric
wants to see. No policing, no dashboard shaming, one automation.

It is also strictly better than the alternative of anchoring on the ticket status
transition itself, which was considered and rejected: that silently redefines the metric
(ticket-to-production is cycle time, not DORA lead time) and merely relocates the gaming
vector into the tracker. Deriving ticket state *from* the commit inverts the dependency, so
there is only one source of truth.

Two traps worth carrying into the build:

- **Use the commit's author date, not the committer date** — a rebase preserves the former
  and rewrites the latter. This is the opposite of what M5 needs, where committer date is
  correct because the question there is when a push *landed* relative to a review. Same
  object, different field, plausible bug.
- **Until the convention exists, first commit is noise** — a stale three-month-old branch is
  not a lead time. The prototype keeps its PR-open anchor until then, with pre-PR branch age
  reported alongside to show how much work the current anchor is not counting.

**M1 — link to real deployment events.** Serverless platform events, CD pipeline
completions, ArgoCD/Flux rollouts, a CLI call from any pipeline. This is D1's reversal
arriving in the interim rather than at 10x, and it is **the highest-leverage single
integration in the whole plan**, because deployment events carry something Releases
structurally cannot: a **status**. One source fixes four documented weaknesses at once:

| Fixes | Was |
|---|---|
| M1's "one release = one deploy" assumption | An accepted, unverifiable limitation (D3) |
| Untagged redeploys being invisible | No data source could correct it (D3) |
| CFR's dependence on label discipline | A team-process prerequisite (D5, D9) |
| Recovery time deferred entirely | Too weak to ship (D6) |

**The convergence worth noticing.** The two sources that most improve the metrics —
deployment events and the work tracker — are also two of the three real sources the interim
event log needs before the canonical model can be designed from evidence rather than
guessed (§7.1). The metric roadmap and the architecture roadmap want the same next two
integrations. That is not a coincidence: both are asking for the parts of the delivery
lifecycle GitHub cannot see.

**Exclusions to name explicitly:** individual grain anything · velocity and story points ·
lines of code as output · focus time and calendar metrics · per-person review
participation · forecasting · unqualified MTTR.

### 8.2 Section 3 — the day-90 number

**Metric trust score.** Share of engineers who agree the dashboard reflects how work
actually happens on their squad.

Measured precisely, because "we will run a survey" is not an answer:

- One question, 5-point scale, to all 30 engineers and 8 leads in week 12, anonymous.
- **Denominator is all 38 invited, not respondents** — non-response counts as not
  trusting. That is the anti-gaming detail.
- Threshold: ≥70% answering 4 or 5 means it is working. <50% means pulling the Executive
  view and fixing it.
- **Paired falsifier:** count of open unresolved data-quality disputes logged in-app. High
  trust alongside high disputes means people are being polite rather than convinced.

Why not the alternatives — worth one line each: **adoption** (a dashboard can be opened
and disbelieved), **DORA improvement** (measures the org, not the system; too slow at 90
days; invites gaming), **data coverage** (measures the pipeline — a perfectly covered
dashboard nobody believes is still a failure).

### 8.3 Section 3 — 90-day shape

Solo builder. Three blocks, each ending in something real in someone's hands.

- **Days 1–5 — build-vs-buy spike, before writing anything.** A one-pass search (§1 of
  `framework-and-prior-art.md`) already found that most of this architecture is
  standardised and that at least one open-source platform — Faros Community Edition —
  covers a large part of it. **That search was quick, not decisive**, and it would be
  dishonest to plan 90 days of building without first spending a week trying to avoid it.
  The spike evaluates Faros CE and the semantic-layer options (Cube, dbt MetricFlow)
  against three questions: can it express the Signal object, can it enforce grain floors
  and drill-down permissions, and can a solo builder operate it. **The plan then branches**
  — adopt, and days 6–90 shift toward configuration plus the genuinely novel third
  (Signal, push-ingestion lifecycle, governance-as-schema); build, and the sequence below
  proceeds as written. Either branch keeps the same day-90 number.
- **Days 6–30 — one squad, end to end.** Ingestion → transformation → Manager view for a
  single repo. The four cheapest metrics. Ship to *one* squad and sit with them. Goal is
  not coverage; it is finding out whether the numbers survive contact with the people they
  describe.
- **Days 31–60 — make it a platform rather than a script.** Metric definitions become
  declarative (the §4 algebra), pseudonymisation and the access model land, CI metrics
  join, expand to ~4 squads. This is the block where the architecture claim gets built
  rather than described.
- **Days 61–90 — leadership and proof of generality.** Executive view, bands and noise
  gates, all 8 squads, plus the §5 test: one non-engineering metric loaded manually.
  Trust survey in week 12.

**Feasibility for one person.** The 90 days are affordable only because the spike's likely
outcome is adopting CloudEvents for the envelope, the Airbyte protocol shape for pull
ingestion, and an existing semantic layer for computation — which removes the three
largest build items before day 6. What is left is the third nobody has built, and that is
a solo-builder-sized problem.

**Biggest risk, stated rather than hidden:** data-quality problems surface only when real
squads read their own numbers. That is why Block 1 ends with one squad and a conversation
rather than four squads and a launch — the plan is sequenced to find the bad news early,
when it is still cheap.

**Deliberately not built in 90 days** — the section is weak without this list: incident
integration · work-tracker integration · surveys beyond the single trust question · the
architecture-metrics group · AI-assist metrics · forecasting · alerting · a self-serve
metric authoring UI · multi-tenancy · mobile.

---

## 9. Open Questions

1. **Diagram scope** — one data-flow diagram spanning all three stages, or two (flow plus
   access model)? One is safer for the page budget; two tells the access story better.
   Recommendation: **one**, with access annotated onto the stage boundaries rather than
   drawn separately.
2. **Section 1 overrun** — accept the risk now and resolve at render, per §8.1.
3. **Page calibration** — 450 words/page to confirm against the real pipeline.
4. **Where the exclusions paragraph lives** if Section 1 overruns.
