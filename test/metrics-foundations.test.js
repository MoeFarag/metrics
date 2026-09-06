const assert = require("node:assert/strict");
const test = require("node:test");
const { MemoCache, IMMUTABLE_TTL, createRequestKey } = require("../src/metrics/cache");
const { promisePool } = require("../src/metrics/concurrency");
const { parseMetricQueryOptions, parseRepo } = require("../src/metrics/scope");
const { direction, mad, median, percentile } = require("../src/metrics/stats");
const { resolveMetricsWindow } = require("../src/metrics/window");

test("memo cache honors ttl, disabled mode, and immutable entries", async () => {
  let now = 1_000;
  const cache = new MemoCache({ now: () => now, defaultTtlMs: 100 });
  const key = createRequestKey("get", "https://api.github.com/repos/o/r");

  cache.set(key, { value: 1 });
  assert.deepEqual(cache.get(key), { value: 1 });
  now += 101;
  assert.equal(cache.get(key), undefined);

  cache.set("sha-pair", "forever", IMMUTABLE_TTL);
  now += 1_000_000;
  assert.equal(cache.get("sha-pair"), "forever");

  const disabled = new MemoCache({ enabled: false });
  disabled.set("a", "b");
  assert.equal(disabled.get("a"), undefined);
});

test("promise pool preserves result order and caps concurrency", async () => {
  let active = 0;
  let maxActive = 0;

  const results = await promisePool(
    [30, 10, 20, 5],
    async (delay, index) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active -= 1;
      return index;
    },
    2
  );

  assert.deepEqual(results, [0, 1, 2, 3]);
  assert.equal(maxActive, 2);
});

test("promise pool propagates worker failures", async () => {
  await assert.rejects(
    () => promisePool([1, 2, 3], async (item) => {
      if (item === 2) throw new Error("boom");
      return item;
    }),
    /boom/
  );
});

test("metrics window defaults to 90 days and returns prior window plus ISO week buckets", () => {
  const result = resolveMetricsWindow({}, new Date("2026-09-06T10:00:00.000Z"));

  assert.equal(result.window_days, 90);
  assert.equal(result.window_start, "2026-06-08T10:00:00.000Z");
  assert.equal(result.window_end, "2026-09-06T10:00:00.000Z");
  assert.equal(result.prior_window_start, "2026-03-10T10:00:00.000Z");
  assert.equal(result.prior_window_end, "2026-06-08T10:00:00.000Z");
  assert.deepEqual(
    result.iso_week_buckets.map((bucket) => bucket.week_start),
    [
      "2026-06-08",
      "2026-06-15",
      "2026-06-22",
      "2026-06-29",
      "2026-07-06",
      "2026-07-13",
      "2026-07-20",
      "2026-07-27",
      "2026-08-03",
      "2026-08-10",
      "2026-08-17",
      "2026-08-24",
      "2026-08-31",
    ]
  );
});

test("stats helpers compute median percentile mad and gated direction", () => {
  assert.equal(median([5, 1, 9]), 5);
  assert.equal(percentile([0, 10], 75), 7.5);
  assert.equal(mad([10, 10, 14, 20]), 2);

  const current = Array.from({ length: 30 }, () => 80);
  const prior = Array.from({ length: 30 }, () => 100);
  const improving = direction({
    current,
    prior,
    history: [100, 101, 99, 100, 102, 98, 100, 101],
    higherIsBetter: false,
  });
  assert.equal(improving.status, "improving");
  assert.deepEqual(improving.reasons, []);

  const flat = direction({
    current: Array.from({ length: 30 }, () => 96),
    prior,
    history: [100, 101, 99, 100, 102, 98, 100, 101],
  });
  assert.equal(flat.status, "flat");
  assert.equal(flat.reasons.includes("minimum_magnitude_not_met"), true);

  assert.equal(direction({ current, prior: null }).status, "not_computed");
});

test("repo and metric query parsing supports URL owner/repo and prior-window toggle", () => {
  assert.deepEqual(parseRepo("https://github.com/openai/codex.git"), {
    owner: "openai",
    repo: "codex",
  });

  assert.deepEqual(
    parseMetricQueryOptions(
      { repo: "MoeFarag/metrics", metric: "M1", window: "60d", direction: "true" },
      { metricsWindowDays: 30 }
    ),
    {
      metric: "m1",
      repo: { owner: "MoeFarag", repo: "metrics" },
      include_prior_window: true,
      window_days: 60,
    }
  );

  assert.throws(() => parseRepo("https://example.com/not/github"), /Repository/);
  assert.throws(() => parseMetricQueryOptions({ metric: "m8" }, { owner: "o", repo: "r" }), {
    code: "unsupported_metric",
  });
});
