const assert = require("node:assert/strict");
const test = require("node:test");
const { GitHubMetricsWrapper } = require("../src/github-wrapper");
const {
  associatePullsToReleaseWindows,
  calculateChangeFailureRate,
  calculateLeadTimeForChanges,
  detectFailureSignals,
} = require("../src/metrics/dora");

test("lead time returns low-confidence no-release state when there are no production releases", async () => {
  const github = makeGithub({
    releases: [],
    pulls: [pull(1, "Feature", "2026-09-01T00:00:00.000Z", "merge-1", "head-1")],
  });

  const result = await calculateLeadTimeForChanges({
    github,
    now: new Date("2026-09-06T00:00:00.000Z"),
  });

  assert.equal(result.state, "no_releases");
  assert.equal(result.headline.value, null);
  assert.equal(result.data_confidence, 0);
  assert.deepEqual(result.low_confidence_reasons, ["no_production_releases"]);
});

test("lead time links merged PRs to release compare windows by merge and head sha", async () => {
  const github = makeGithub({
    releases: [
      release(1, "v1.0.0", "2026-08-20T00:00:00.000Z", "base-sha"),
      release(2, "v1.1.0", "2026-09-04T00:00:00.000Z", "release-sha"),
    ],
    pulls: [
      pull(10, "Fast feature", "2026-09-03T00:00:00.000Z", "merge-fast", "head-fast"),
      pull(11, "Slow feature", "2026-09-01T00:00:00.000Z", "merge-other", "head-slow"),
      pull(12, "Unreleased feature", "2026-09-02T00:00:00.000Z", "not-in-release", "not-in-release-head"),
    ],
    pullCommits: {
      10: [commit("merge-fast", "Merge pull request #10")],
      11: [commit("commit-a", "part 1"), commit("head-slow", "part 2")],
      12: [commit("not-in-release", "not released")],
    },
    compares: {
      "base-sha...release-sha": ["merge-fast", "head-slow", "release-sha"],
    },
  });

  const result = await calculateLeadTimeForChanges({
    github,
    now: new Date("2026-09-06T00:00:00.000Z"),
  });

  assert.equal(result.state, "ready");
  assert.equal(result.sample_size, 2);
  assert.deepEqual(
    result.evidence_rows.map((row) => [row.pr_number, row.match_method, row.lead_time_hours]),
    [
      [11, "sha", 72],
      [10, "sha", 24],
    ]
  );
  assert.deepEqual(result.lead_time_hours, { p50: 48, p85: 64.8 });
  assert.equal(result.data_confidence, 0.85);
  assert.equal(result.caveats.includes("some_release_windows_used_time_fallback"), true);
});

test("association falls back to release time windows when compare data is unavailable", async () => {
  const github = makeGithub({
    releases: [],
    pulls: [],
    compares: {
      "sha-a...sha-b": null,
    },
  });
  const association = await associatePullsToReleaseWindows({
    github,
    releases: [
      normalizedRelease(1, "a", "2026-08-20T00:00:00.000Z", "sha-a"),
      normalizedRelease(2, "b", "2026-09-04T00:00:00.000Z", "sha-b"),
    ],
    windowStart: new Date("2026-08-07T00:00:00.000Z"),
    windowEnd: new Date("2026-09-06T00:00:00.000Z"),
    pullDetails: [
      {
        pull: pull(20, "Time matched", "2026-09-01T00:00:00.000Z", "merge-time", "head-time"),
        commits: [commit("merge-time", "Merge")],
      },
    ],
  });

  assert.equal(association.rows.length, 1);
  assert.equal(association.rows[0].release_tag, "b");
  assert.equal(association.rows[0].match_method, "time_window");
  assert.equal(association.stats.compare_unavailable, 2);
});

test("change failure rate flags releases by release PR label title and commit message heuristics", async () => {
  const github = makeGithub({
    releases: [
      release(1, "v1.0.0", "2026-08-15T00:00:00.000Z", "base-sha"),
      release(2, "v1.0.1-hotfix", "2026-09-01T00:00:00.000Z", "hotfix-sha", {
        name: "v1.0.1 hotfix",
      }),
      release(3, "v1.1.0", "2026-09-04T00:00:00.000Z", "release-sha"),
    ],
    pulls: [
      pull(30, "Restore checkout after incident", "2026-08-31T00:00:00.000Z", "merge-hotfix", "head-hotfix", {
        labels: [{ name: "incident" }],
      }),
      pull(31, "Feature", "2026-09-03T00:00:00.000Z", "merge-feature", "head-feature"),
      pull(32, "Cleanup", "2026-09-03T02:00:00.000Z", "merge-clean", "head-clean"),
    ],
    pullCommits: {
      30: [commit("merge-hotfix", "fix production regression")],
      31: [commit("merge-feature", "add dashboard")],
      32: [commit("merge-clean", "refix text fixture")],
    },
    compares: {
      "base-sha...hotfix-sha": ["merge-hotfix", "hotfix-sha"],
      "hotfix-sha...release-sha": ["merge-feature", "merge-clean", "release-sha"],
    },
  });

  const result = await calculateChangeFailureRate({
    github,
    config: { window_days: 20 },
    now: new Date("2026-09-06T00:00:00.000Z"),
  });

  assert.equal(result.sample_size, 2);
  assert.equal(result.failed_release_count, 1);
  assert.equal(result.headline.value, 50);
  assert.deepEqual(
    result.evidence_rows.map((row) => [row.tag_name, row.failed]),
    [["v1.0.1-hotfix", true]]
  );
  assert.equal(result.releases.find((row) => row.tag_name === "v1.1.0").failed, false);
});

test("failure signal detector ignores common non-failure fix substrings", () => {
  const result = detectFailureSignals({
    release: { tag_name: "v1.0.0", title: "Feature release" },
    pullRows: [
      {
        title: "refix text fixture",
        labels: [],
        commit_messages: ["prefix generated files"],
      },
    ],
  });

  assert.equal(result.failed, false);
  assert.deepEqual(result.signals, []);
});

function makeGithub({ releases, pulls, pullCommits = {}, compares = {}, missingTags = new Set() }) {
  const wrapper = new GitHubMetricsWrapper(
    { owner: "openai", repo: "codex", allowedEvents: [] },
    async (url) => {
      const parsed = new URL(url);
      const commitMatch = parsed.pathname.match(/\/commits\/(.+)$/);
      if (commitMatch) {
        const ref = decodeURIComponent(commitMatch[1]);
        if (missingTags.has(ref)) {
          return json({ message: "Not Found" }, { status: 404 });
        }
        const releaseForRef = releases.find((item) => item.tag_name === ref);
        return json({ sha: releaseForRef?.resolvedSha || `sha-${ref}` });
      }

      const compareMatch = parsed.pathname.match(/\/compare\/(.+)$/);
      if (compareMatch) {
        const range = decodeURIComponent(compareMatch[1]);
        const shas = compares[range];
        if (!shas) {
          return json({ message: "Not Found" }, { status: 404 });
        }
        return json({ commits: shas.map((sha) => ({ sha })) });
      }

      const pullCommitsMatch = parsed.pathname.match(/\/pulls\/(\d+)\/commits$/);
      if (pullCommitsMatch) {
        return json(pullCommits[Number(pullCommitsMatch[1])] || []);
      }

      if (/\/pulls\/\d+\/(files|reviews)$/.test(parsed.pathname)) {
        return json([]);
      }

      if (parsed.pathname.endsWith("/pulls")) {
        return json(pulls);
      }

      if (parsed.pathname.endsWith("/releases")) {
        return json(releases);
      }

      return json({ message: "Not Found" }, { status: 404 });
    }
  );
  return wrapper;
}

function json(data, options = {}) {
  const headers = new Headers(options.headers || {});
  return new Response(JSON.stringify(data), {
    status: options.status || 200,
    headers,
  });
}

function release(id, tag, publishedAt, resolvedSha, overrides = {}) {
  return {
    id,
    tag_name: tag,
    name: tag,
    draft: false,
    prerelease: false,
    created_at: publishedAt,
    published_at: publishedAt,
    html_url: `https://github.com/openai/codex/releases/tag/${tag}`,
    resolvedSha,
    ...overrides,
  };
}

function normalizedRelease(id, tag, publishedAt, resolvedSha) {
  return {
    id,
    tag_name: tag,
    title: tag,
    resolved_sha: resolvedSha,
    published_at: publishedAt,
    html_url: `https://github.com/openai/codex/releases/tag/${tag}`,
  };
}

function pull(number, title, mergedAt, mergeSha, headSha, overrides = {}) {
  return {
    number,
    title,
    state: "closed",
    merged_at: mergedAt,
    updated_at: mergedAt,
    merge_commit_sha: mergeSha,
    head: { sha: headSha },
    labels: [],
    html_url: `https://github.com/openai/codex/pull/${number}`,
    user: { login: "octo", type: "User" },
    ...overrides,
  };
}

function commit(sha, message) {
  return {
    sha,
    commit: { message },
  };
}
