# Framework Spec and Prior Art

Working document. Two parts: what already exists (so we extend rather than rebuild), and
the framework interfaces for what remains.

Companion to `architecture-notes.md`, which holds the document outline and the
non-framework architecture decisions.

---

## Part 1 — Prior Art: What Already Exists

Searched before designing, on the principle that a framework nobody else needed is
usually a framework you got wrong. The result is better than expected: **most of the
described architecture is already standardised, and the part that is not is the actual
product.**

**Scope caveat, stated up front.** This was a single search pass, not a procurement
evaluation. It is enough to prove that prior art exists and to say roughly where the
boundaries fall; it is **not** enough to decide build-vs-buy. Faros Community Edition in
particular surfaced from a quick search and has not been run, read, or benchmarked. The
90-day plan therefore opens with a five-day spike to make that decision properly
(`architecture-notes.md` §8.3) rather than treating anything below as settled.

### 1.1 The verdict table

| Layer we described | Existing standard / framework | Verdict |
|---|---|---|
| Event envelope — id, time, type, version, labels, raw payload | **CloudEvents** (CNCF) — `id`, `source`, `specversion`, `type`, `time`, `subject`, `data`, plus extension attributes | **Adopt wholesale.** This is our event model, already specified, already serialisable to protobuf/Avro/JSON. |
| Domain vocabulary for delivery events | **CDEvents** (CD Foundation, built on CloudEvents) — typed subjects for change, build, artifact, environment, service, incident | **Adopt for engineering, extend elsewhere.** Caveat below. |
| Pull ingestion — poll/cron, resumable | **Airbyte Protocol** (`spec` / `check` / `discover` / `read`) with **state + cursor checkpointing**; **Singer** taps | **Adopt the interface shape.** Its state/cursor model *is* our "transformer keeps a reference to where it stopped." |
| Push ingestion — subscribe / unsubscribe / map | No clean standard. Faros has an Events API; webhook subscription lifecycle is bespoke everywhere | **Gap — we build this.** |
| Declarative metric definitions | **dbt Semantic Layer / MetricFlow** (YAML metrics, git-governed, PR-reviewed); **Cube** (YAML/JS models over SQL, REST, GraphQL, MCP) | **Adopt rather than write an engine.** |
| Access control on metrics | **Cube** — four logical layers: metrics, acceleration, access control, API; row-level and multi-tenant | **Adopt the layer shape.** Closest existing thing to our permission model. |
| Scheduled collection + rules over entities | **Backstage Tech Insights** — `FactRetriever` on a task scheduler, facts, then checks via `json-rules-engine` | **Pattern to borrow, not a base.** Entity-centric and pull-only; no event stream, no push. |
| CI/CD telemetry attributes | **OpenTelemetry CI/CD semantic conventions** (v1.27+, CI/CD SIG) — pipeline run spans, `cicd.pipeline.run.duration`, error metrics | **Adopt attribute names** for CI-derived events so we are not inventing a second vocabulary. |
| **The whole platform** | **Faros Community Edition** — open-source EngOps platform: canonical data model, Airbyte-based pull ingestion, an Events API for push, dbt transformation, Metabase presentation, 70–100+ connectors | **The single closest prior art. Evaluate as a base before building.** |
| **Signal** — shape + visualisation + permission + drill-down + provenance, as one object | **No standard exists.** Cube has measures with row-level security but no drill-to-source provenance and no visualisation binding | **This is the novelty. We build it.** |

### 1.2 What this means

Roughly **two-thirds of the framework is already specified by someone else**, and adopting
it is strictly better than reinventing it — the standards are more thought-through than
anything a solo builder writes in 90 days, and they come with connector ecosystems
attached.

**The remaining third is where the product actually is.** Three genuine gaps:

1. **The Signal object.** Every prior-art system stops at "a number, computed, with access
   control." None of them binds a metric to its visualisation, its drill-down permission,
   *and* its provenance back to source events as one declared object. That binding is what
   makes the two-view disclosure model (Signal → Number → Evidence) enforceable rather
   than conventional.
2. **Push ingestion with lifecycle.** Airbyte is pull-only by design. Webhook
   subscribe/unsubscribe/verify/map is written from scratch in every product that needs
   it, including ours today (`api/webhooks/github.js`).
3. **Governance as schema.** No semantic layer requires a metric to declare its tension
   partner, its grain floor, or its confidence rule — because no semantic layer is trying
   to be *safe against gaming*. Making those required fields on the definition is the one
   thing that makes this a measurement system rather than a BI dashboard.

### 1.3 Two caveats worth carrying into the document

- **CDEvents does not yet cover all of DORA.** Its current event set supports lead time
  for changes and deployment frequency; change failure rate and recovery time still need
  either an incident vocabulary or the local convention we already documented (D5). So
  adopting CDEvents narrows the gap but does not close it — exactly the wound Section 4's
  deployment event contract is meant to heal.
- **Faros CE is a base to evaluate, not an obvious yes.** It is a five-service modern data
  stack (Airbyte, Hasura, dbt, Metabase, Activepieces). For a solo builder in 90 days,
  operating that may cost more than it saves, and its canonical model is engineering-shaped
  in ways that could fight the domain-neutral goal. The honest position: **borrow its
  canonical-model approach and its push/pull split; adopt the pieces, evaluate the whole.**

---

## Part 2 — The Framework

A framework, not a program: it declares interfaces, and implementations — written by
humans or agents — conform to them. Registration is by `id + version`; resolution is by
interface and selector.

**The economics that make this the right shape now.** Historically a plugin framework was
a bet that someone would eventually write the plugins. With a competent agentic coding
harness and a written interface spec, a connector or a transformer is a well-specified,
few-hundred-line, testable unit — hours rather than sprints. That collapses the marginal
cost of extension, which is precisely why the architecture should optimise for *many small
conforming components* rather than a few large hand-tuned ones. The interface spec is the
product; the implementations are increasingly cheap.

### 2.1 Ingestion

Two kinds, one shared contract. Both terminate in `map()` and `next()`.

```ts
interface Ingestor {
  id: string
  version: string
  map(raw: unknown, meta: SourceMeta): Event[]   // raw → canonical events
  next(events: Event[]): void                    // downstream side effects
}

interface PushIngestor extends Ingestor {
  subscribe(config): SubscriptionHandle          // register the webhook at source
  unsubscribe(handle): void                      // and tear it down
  verify(raw, headers): boolean                  // signature check before mapping
}

interface PullIngestor extends Ingestor {
  schedule: CronExpression | Interval
  pull(config, cursor: Cursor): { raw: unknown[]; nextCursor: Cursor }
}
```

**`next()` is the seam that makes real-time possible.** It is not just "write to the
store" — it is the trigger point for downstream transformers and for alerting. A push
ingestor receiving a production incident can drive an immediate alert through the same
path that the ticker drives batch transformation, so real-time and scheduled are one code
path with two clocks rather than two systems.

**The ingest mapper's real job is labels, not payload.** Because transformers select on
labels and types only (§2.3), ingestion is the **last** point at which an event can be
made findable. An event mapped with the wrong labels is invisible to every transformer
downstream and there is no cheap way to notice. This deserves to be stated as a rule:
*mapping is a labelling decision first and a translation second.*

### 2.2 Events

An ever-increasing stream. CloudEvents-shaped, serialised efficiently (protobuf or Avro;
JSON only at the edges).

```
Event {
  id            ULID or UUIDv7 — sortable, collision-free across ingestors
  stream_seq    monotonic sequence number — the domain of every cursor
  time          when it happened, from the source
  ingested_at   when we learned about it
  type          namespaced + versioned, e.g. dev.cdevents.change.merged.0.1.0
  version       payload schema version
  labels        map<string,string> — THE selector surface
  subject       the entity this event is about
  actor         pseudonymised at ingestion, never raw
  payload       opaque, serialised
}
```

`stream_seq` is what makes transformers resumable and replayable. `labels` are what makes
them cheap. `version` is what makes schema evolution survivable — a transformer declares
which payload versions it understands and skips the rest loudly rather than silently.

### 2.3 Transformation

```ts
interface Transformer {
  id: string
  version: string
  selector: {
    events?:  { types: string[]; labels: Record<string, string> }
    signals?: string[]          // definition_ids — transformers chain
  }
  schedule: CronExpression | Interval | OnNext
  shape: 'count' | 'duration' | 'ratio' | 'distribution' | 'composite'
  transform(input: Event[] | Signal[], priorState: State): { signals: Signal[]; state: State }
}
```

**Transformers accept signals as well as events**, so they can chain — see §2.3.1.

Each **transformer instance holds its own cursor** — the last `stream_seq` it processed.
Consequences worth naming:

- Transformers are independently resumable; one falling behind does not block others.
- Replay is a cursor reset, which is the capability Part 1 lacks entirely (D8, §7 of
  `architecture-notes.md`).
- **Selection never touches the payload.** Matching is on `type` and `labels`, both
  indexable. Content-based selection would mean deserialising every event in the window to
  decide whether to use it — the cost model of the whole system depends on not doing that.

The `shape` field is the metric algebra from `architecture-notes.md` §4: Count, Duration,
Ratio, Distribution, with the two variants (segmented duration, multi-class ratio). The
engine implements four recipes; transformers parameterise them.

### 2.3.1 Chaining — an available capability, not a mandate

Because a transformer's selector accepts `signals` as well as `events`, transformers chain.
A **composite signal** is then something a builder can construct from existing signals
without new ingestion:

```
composite: review_health
  inputs: [pr_size, review_round_trips, change_failure_rate]
  emits:  { state: aligned | divergent, explanation: string }
```

The interesting state is **`divergent`** — one metric improving while its partner degrades,
which is the gaming signature. A team that finds itself repeatedly making that correlation
by eye across two charts can promote it into a signal that says so directly, with its own
plain-text derivation.

**This is a capability the framework offers, not a requirement it imposes.** The framework
declares interfaces; it does not dictate what gets built on them. Tension pairing stays what
D12 made it — a rendering rule enforced at the view — and the category rollup in
`architecture-notes.md` §3.2 stays a view rule. Composites are for teams who want to encode
a relationship they have found useful, and nothing breaks if nobody builds one.

Chaining itself is not exotic: it is a derived stream in any stream processor and a
downstream model in dbt. It costs one field on the selector.

Provenance chains without a special case: a composite's `provenance.exceptions` points at
its constituent signals, which point at their own event ranges, so drill-down walks
composite → signal → events.

### 2.4 Signals

**A signal is a metric.** It is the unit the presentation layer and the permission model
both operate on, which is why it carries more than a value.

```
Signal {
  id, definition_id, version
  shape                    count | duration | ratio | distribution
  value                    shaped result — scalar, series, or distribution
  grain                    service | unit | org
  scope                    which service / unit / org
  window                   the interval computed over
  confidence               coverage figure, always present
  band, direction          from the governance layer; may be null with a reason
  visualization            declared hint — sparkline | histogram | timeline | stacked-bar
  permission               who may see this signal
  drilldown_permission     who may see the evidence behind it
  provenance               → see 2.5
}
```

Declaring `visualization` on the signal rather than in the frontend is what lets a new
metric render correctly with no frontend work (§2.6).

### 2.5 Provenance — how a signal points back to events

The question that decides whether drill-down is affordable. Three options, and the third
is right:

1. **Store every contributing event id.** Correct and unbounded — a signal over 600 CI
   runs stores 600 references, per signal, per window, forever.
2. **Store the query.** The signal records its selector plus its `stream_seq` range, so
   re-running it reproduces the exact event set. O(1) per signal and fully replayable —
   but every drill-down becomes a re-scan.
3. **Store the query, plus explicit ids for the exceptions.** ✅

```
provenance {
  selector      { types[], labels{} }        // reproduces the population
  seq_range     [from_seq, to_seq]           // exactly which slice
  exceptions    [event_id, ...]              // the members that made the number interesting
}
```

**Option 3 matches what drill-down is actually for.** Nobody opens a change-failure-rate
number wanting all 52 releases — they want the 4 that failed. Nobody opens PR size
distribution wanting 118 PRs — they want the 9 above the threshold. So the population is
stored as a reproducible query and the *interesting* members are stored explicitly, giving
bounded storage and a one-hop drill-down for the case that matters.

This also makes the Layer 3 audit story clean: the exception list is the PII surface, it is
small, it is enumerable, and it is exactly what access control has to gate.

### 2.6 Presentation — widgets

```ts
interface Widget {
  accepts: Shape[]                 // which signal shapes it can render
  arity: 1 | 'n'                   // single signal, or a combination
  render(signals: Signal[], viewer: ViewerContext): View
}
```

**Widgets bind to shapes, not to metrics.** A histogram widget accepts any Distribution
signal; a timeline accepts any Count. The consequence is the presentation-layer version of
the whole generality claim: **a new metric of an existing shape gets a working
visualisation for free, with no frontend change.** Combination widgets (`arity: 'n'`) are
how tension pairs are rendered as one unit, which turns D12's "must be on the same screen"
from a review convention into a structural property.

### 2.7 The ticker

One clock drives everything recurring:

```
tick(now):
  for each PullIngestor  where due(now): pull → map → next
  for each Transformer   where due(now): select since cursor → transform → emit signals
  for each Widget subscription:           refresh changed signals
```

Push ingestion is driven by the source rather than the clock, but enters the same
downstream path through `next()`. So the system has exactly **two entry points that
converge immediately** — a scheduled tick and an inbound event — rather than two parallel
architectures.

### 2.8 Permissions — cross-cutting, declared at definition, enforced at read

```
Permission          { audiences[], grain_floor, comparative: bool }
DrilldownPermission { audiences[], scope: own_unit | granted | none, audit: required }
```

Declared on the metric definition, carried on every signal, enforced in the reporting
stage. Two properties that follow from putting it here rather than in the UI:

- A signal that reaches a widget has already been permission-checked; the frontend cannot
  leak by forgetting a check.
- `grain_floor` and `comparative` encode the services-not-squads rule
  (`architecture-notes.md` §6.1) as data, so it is enforced once for every metric rather
  than remembered per view.

### 2.9 Service resolution

A registry keyed by `(kind, id, version)` where `kind ∈ {ingestor, transformer, widget}`.
Resolution is by capability, not by name: the ticker asks for "transformers whose selector
matches these event types", the view asks for "widgets accepting shape=duration". Adding a
component is a registration, not a wiring change — which is the mechanical reason the
extension claim holds.

---

## Part 3 — Worked Examples Across Domains

The same four shapes, the same interfaces, across four domains. None requires engine code.

| Signal | Domain | Ingestion | Events | Shape | Notes |
|---|---|---|---|---|---|
| **Lead time for changes** | Engineering | Pull (GitHub) | `change.merged` → `service.deployed` | Duration | The metric we built |
| **Account opening time** | Retail banking | Push (core banking webhook) | `application.submitted` → `account.opened`, matched on `subject = customer_id` | Duration | *Identical transformer, different event types.* This is the claim, demonstrated |
| **New joiner to first production change** | People / Eng | Pull (HRIS) + pull (GitHub) | `employment.started` → `service.deployed` where `actor` matches | Duration | Two ingestors, one signal — the join happens on `subject`, in transformation |
| **Unreviewed production change** | Compliance | Pull (GitHub) | `service.deployed` where no `change.reviewed` in provenance | Ratio | Regulatory early warning, not a productivity metric |
| **Segregation-of-duties breach** | Compliance | Pull (GitHub) | `change.merged` where `actor == approver == deployer` | Count | Fires on 1, not on a trend. Same shape, different threshold semantics |
| **Coffee machine outage** | Facilities / wellbeing | Push (IoT) | `machine.empty` → `machine.refilled` | Duration | Deliberately absurd, and it works with zero code change — which is the point |

The coffee machine is worth keeping in the deck rather than cutting for seriousness. It is
the cheapest possible proof that the abstraction has no engineering vocabulary left in it:
if an IoT sensor can emit two events and get a working signal, a dashboard, and a
permission model without touching the engine, the claim in `architecture-notes.md` §1 is
demonstrably true rather than asserted.

**Note on the compliance row.** Two of the six are regulatory rather than productivity
signals. In a regulated fintech this is not a stretch of the platform — it is arguably the
argument that funds it, because change traceability and segregation of duties are things
an auditor asks for regardless of whether anyone is measuring developer productivity.

---

## Part 4 — Consequences for the Document

1. **Section 1 changes shape.** Rather than a fixed set of 11, present **7–8 shipped
   metrics as the starting point** plus the extension mechanism: the list is living, and
   what it grows into depends on the org's system access (work tracker, HRIS, deploy
   infrastructure), on conventions the org is willing to impose (labels), and on which
   compliance signals matter. This supersedes the earlier "11 metrics" decision — and it
   conveniently resolves the one-page overrun risk flagged in `architecture-notes.md` §8.1.
2. **Section 2 gains a prior-art sentence.** "Most of this is CloudEvents, CDEvents,
   Airbyte's connector protocol, and a semantic layer; what we add is the Signal object,
   push ingestion lifecycle, and governance-as-schema." That single sentence does more for
   credibility than a page of original design would.
3. **This framework detail does not fit in 1.5 pages.** Section 2 carries the three stages,
   the interface table, and the diagram. This file is the supporting artifact — a candidate
   appendix if appendices are allowed, otherwise a reference.
4. **The agentic-economics argument earns a line in Section 3.** It changes the 90-day
   plan's logic: if a conforming connector is hours rather than sprints, the right move is
   to spend the 90 days on the *interfaces and the governance*, and let breadth accumulate
   cheaply afterwards. That is an argument for exactly the sequencing already proposed.
