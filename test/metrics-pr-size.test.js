const assert = require("node:assert/strict");
const test = require("node:test");
const {
  matchesAnyGlob,
  summarizePrSizeDistribution,
  summarizePullRequestSize,
} = require("../src/metrics/pr-size");

test("PR size excludes generated and lockfile paths from filtered line counts", () => {
  const row = summarizePullRequestSize(
    {
      number: 42,
      title: "Add reporting view",
      merged_at: "2026-09-01T00:00:00.000Z",
      merge_commit_sha: "abc123",
      labels: [],
      user: { login: "dev", type: "User" },
    },
    [
      { filename: "src/app.js", additions: 120, deletions: 20, status: "modified" },
      { filename: "package-lock.json", additions: 1000, deletions: 0, status: "modified" },
      { filename: "src/generated/client.js", additions: 300, deletions: 40, status: "modified" },
      { filename: "src/renamed.js", additions: 50, deletions: 50, status: "renamed" },
    ]
  );

  assert.equal(row.changed_lines_raw, 1580);
  assert.equal(row.changed_lines_filtered, 140);
  assert.equal(row.files_excluded, 2);
  assert.equal(row.files_changed_filtered, 2);
});

test("glob matching handles recursive defaults without invalid regexes", () => {
  assert.equal(matchesAnyGlob("package-lock.json", ["**/package-lock.json"]), true);
  assert.equal(matchesAnyGlob("apps/web/package-lock.json", ["**/package-lock.json"]), true);
  assert.equal(matchesAnyGlob("src/generated/client.js", ["**/generated/**"]), true);
  assert.equal(matchesAnyGlob("src/app.test.js", ["**/generated/**"]), false);
});

test("PR size distribution excludes reverts and reports large-change evidence", () => {
  const rows = [
    makeRow(1, "Feature", 50, "2026-08-17T00:00:00.000Z"),
    makeRow(2, "Revert Feature", 900, "2026-08-18T00:00:00.000Z", { is_revert: true }),
    makeRow(3, "Large refactor", 750, "2026-08-19T00:00:00.000Z"),
  ];

  const result = summarizePrSizeDistribution(rows, { largeChangeThreshold: 400 });

  assert.equal(result.sample_size, 2);
  assert.equal(result.excluded.reverts, 1);
  assert.equal(result.headline.large_change_share_pct, 50);
  assert.deepEqual(result.percentiles_lines, { p50: 400, p75: 575, p90: 680 });
  assert.deepEqual(result.evidence_rows.map((row) => row.pr_number), [3]);
});

function makeRow(prNumber, title, changedLines, mergedAt, overrides = {}) {
  return {
    pr_number: prNumber,
    title,
    html_url: "https://github.com/example/repo/pull/" + prNumber,
    merged_at: mergedAt,
    changed_lines_raw: changedLines,
    changed_lines_filtered: changedLines,
    files_total: 1,
    files_changed_filtered: 1,
    is_mechanical: false,
    is_revert: false,
    ...overrides,
  };
}
