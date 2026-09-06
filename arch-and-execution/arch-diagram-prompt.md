# Claude Design Prompt — Architecture Diagram

Paste the block below into Claude Design. It produces the full-page diagram that goes at
the end of the document, referenced from Section 2.

**Why it is designed this way:** the diagram has to do three jobs at once — show the data
flow, show where access control is enforced, and make the domain-neutrality visible. The
layout below solves all three by putting the event log and the signal store as full-width
horizontal bars, so every source converges into one spine and every view reads from one
store. That convergence *is* the architecture claim, drawn.

---

## The prompt

> Create a single-page technical architecture diagram, portrait A4, for a developer
> productivity measurement platform. It will be printed as the final page of a PDF
> document, so it must be legible in greyscale and at 100% zoom on paper.
>
> **Overall structure: three horizontal bands stacked top to bottom, with data flowing
> downward.** Two full-width horizontal bars sit between the bands and act as the spine of
> the whole diagram. A narrow vertical rail runs down the left edge. A single return arrow
> runs up the right edge.
>
> ### Band 1 (top) — INGESTION
> Label the band "INGESTION — source-specific, pluggable".
>
> Along the top, five small source boxes in a row, visually identical to make the point
> that the platform does not privilege any of them. Label them:
> `GitHub` · `CI / Actions` · `HRIS` · `Core banking` · `IoT sensor`
>
> Beneath them, two connector boxes side by side, each receiving arrows from the sources
> above:
>
> - **PUSH INGESTOR** — list its interface methods as small monospace text inside the box:
>   `subscribe()` · `unsubscribe()` · `verify()` · `map()` · `next()`.
>   Caption underneath: "webhook-driven".
> - **PULL INGESTOR** — methods: `schedule` · `pull(cursor)` · `map()` · `next()`.
>   Caption underneath: "cron / polling, resumable".
>
> Between these two boxes and the bar below, place a small shield or lock icon labelled
> **"Pseudonymisation — actor identity is hashed here, before anything downstream"**. This
> is an access-control marker; there are three in the diagram and they should share one
> consistent visual treatment.
>
> ### Spine bar 1 — EVENT LOG
> A full-width horizontal bar, visually heavier than the boxes, labelled
> **"EVENT LOG — append-only, ever-increasing"**.
>
> Inside the bar, render a compact field list in monospace, laid out horizontally so it
> reads as a record shape:
> `id` · `stream_seq` · `time` · `type` · `version` · `labels` · `subject` · `actor` · `payload`
>
> Underneath the bar, small italic caption: "CloudEvents-shaped. `labels` and `type` are
> the only selector surface — payloads are never scanned."
>
> ### Band 2 (middle) — TRANSFORMATION
> Label the band "TRANSFORMATION — domain-neutral. This is the product."
>
> Three transformer boxes in a row, each reading upward from the event log bar. Inside each
> box show:
> `selector { types, labels }` · `cursor → stream_seq` · `shape`
>
> To the right of the three transformers, a distinct panel titled **"THE FOUR SHAPES"**
> listing them vertically with a one-line gloss each:
> - **Count** — how much completed
> - **Duration** — how long between two points
> - **Ratio** — what share satisfies a condition
> - **Distribution** — shape of a per-entity quantity
>
> Under that panel, smaller text: "+2 variants: segmented duration, multi-class ratio"
>
> Place the second access-control marker at the bottom edge of this band, labelled
> **"Individual grain is not computed — the engine has no code path for it"**.
>
> ### Spine bar 2 — SIGNAL STORE
> A second full-width horizontal bar, same weight as the event log bar, labelled
> **"SIGNALS — a signal is a metric"**.
>
> Inside, a horizontal field list in monospace:
> `shape` · `value` · `grain` · `scope` · `window` · `confidence` · `band` · `direction` · `visualization` · `permission` · `drilldown_permission` · `provenance`
>
> ### Band 3 (bottom) — REPORTING
> Label the band "REPORTING — domain-neutral shell".
>
> A row of three widget boxes reading upward from the signal store, labelled by what they
> accept rather than by metric name — this is important:
> `Widget: accepts Distribution` · `Widget: accepts Duration` · `Widget: accepts n signals (tension pair)`
>
> Below the widgets, two view boxes of clearly different sizes:
> - **MANAGER VIEW** — larger. Inside: "Layer 1 Signal → Layer 2 Number → Layer 3 Evidence".
> - **EXECUTIVE VIEW** — smaller. Inside: "Layer 1 Signal → Layer 2 Number". Then, in a
>   contrasting treatment, a struck-through or greyed "Layer 3 Evidence" with the note
>   **"structurally unreachable"**.
>
> Place the third access-control marker beside the Manager view, labelled
> **"Evidence access is scoped to own unit and audit-logged"**.
>
> ### Left rail — THE TICKER
> A narrow vertical element running the full height down the left edge, labelled
> **"TICKER"** rotated vertically. From it, three short horizontal arrows point right into
> Band 1 (pull ingestors), Band 2 (transformers) and Band 3 (widget refresh). Small caption
> at its base: "one clock drives everything recurring".
>
> ### Right edge — PROVENANCE RETURN
> A single arrow running from the Signal store bar, up the right edge, back to the Event
> log bar. It must be visually distinct from the downward flow — dashed, or a different
> weight — because it is the only backward path in the diagram. Label it:
> **"provenance: selector + seq_range + exception ids"**
>
> ### Style
> - Restrained and technical. No gradients, no drop shadows, no 3D, no clip art.
> - **Must survive greyscale printing.** Use weight, spacing and border style to
>   differentiate, never colour alone. If colour is used, one accent colour at most, for
>   the three access-control markers and the provenance arrow.
> - Generous whitespace. Legibility over density — if something has to give, drop detail,
>   never shrink type.
> - Monospace only for field names and method signatures; clean sans-serif for everything
>   else.
> - No title block, no legend, no logo. The document supplies the caption.

---

## Notes for iterating

- **If it comes back crowded**, the first things to cut, in order: the five source boxes
  reduce to three; the "four shapes" gloss text drops to bare names; the signal field list
  drops `window` and `scope`.
- **The three things that must survive any simplification**, because Section 2's prose
  refers to them directly: the two full-width spine bars, the three access-control markers
  at their three different stages, and the backward provenance arrow.
- **Do not let it become a generic ETL diagram.** Sources → pipeline → dashboard is the
  picture everyone already has. What makes this one worth printing is that access control
  appears at three different depths and that one arrow runs backwards.
