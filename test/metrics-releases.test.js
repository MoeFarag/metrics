const assert = require("node:assert/strict");
const test = require("node:test");
const { GitHubMetricsWrapper } = require("../src/github-wrapper");
const {
  buildReleaseWindows,
  calculateDeploymentFrequency,
  fetchProductionReleases,
  summarizeReleaseSet,
} = require("../src/metrics/releases");

test("deployment frequency filters draft prerelease and out-of-window releases", async () => {
  const github = makeGithub({
    pages: [
      [
        release(1, "v1.0.0", "2026-09-01T12:00:00.000Z"),
        release(2, "v1.0.1", "2026-08-25T12:00:00.000Z"),
        release(3, "v1.0.2", "2026-08-10T12:00:00.000Z"),
        release(4, "draft", "2026-08-20T12:00:00.000Z", { draft: true }),
        release(5, "rc", "2026-08-20T12:00:00.000Z", { prerelease: true }),
        release(6, "old", "2026-08-01T12:00:00.000Z"),
      ],
    ],
  });

  const result = await calculateDeploymentFrequency({
    github,
    now: new Date("2026-09-06T00:00:00.000Z"),
  });

  assert.equal(result.sample_size, 4);
  assert.deepEqual(
    result.releases.map((item) => item.tag_name),
    ["old", "v1.0.2", "v1.0.1", "v1.0.0"]
  );
  assert.equal(result.data_confidence, 1);
});

test("deployment frequency buckets by published_at instead of created_at", async () => {
  const github = makeGithub({
    pages: [
      [
        release(1, "v1.0.0", "2026-08-24T00:01:00.000Z", {
          created_at: "2026-08-19T00:01:00.000Z",
        }),
      ],
    ],
  });

  const result = await calculateDeploymentFrequency({
    github,
    now: new Date("2026-09-06T00:00:00.000Z"),
  });

  assert.equal(result.trend.find((bucket) => bucket.week_start === "2026-08-17").deploys, 0);
  assert.equal(result.trend.find((bucket) => bucket.week_start === "2026-08-24").deploys, 1);
});

test("deployment frequency gap percentiles use inter-release distribution", () => {
  const releases = [
    normalizedRelease(1, "a", "2026-08-10T00:00:00.000Z"),
    normalizedRelease(2, "b", "2026-08-10T01:00:00.000Z"),
    normalizedRelease(3, "c", "2026-08-10T01:00:00.000Z"),
    normalizedRelease(4, "d", "2026-08-18T09:00:00.000Z"),
  ];

  const stats = summarizeReleaseSet(releases, [
    {
      week_start: "2026-08-10",
      start: "2026-08-10T00:00:00.000Z",
      end: "2026-08-17T00:00:00.000Z",
    },
    {
      week_start: "2026-08-17",
      start: "2026-08-17T00:00:00.000Z",
      end: "2026-08-24T00:00:00.000Z",
    },
  ]);

  assert.deepEqual(stats.gap_hours, { p50: 1, p85: 200 });
});

test("deployment frequency returns a no-release state for an empty window", async () => {
  const github = makeGithub({ pages: [[]] });

  const result = await calculateDeploymentFrequency({
    github,
    now: new Date("2026-09-06T00:00:00.000Z"),
  });

  assert.equal(result.state, "no_releases");
  assert.equal(result.headline.value, 0);
  assert.equal(result.direction, "not_computed");
  assert.equal(result.sample_size, 0);
  assert.equal(result.data_confidence, 1);
  assert.equal(JSON.stringify(result).includes("NaN"), false);
});

test("deployment frequency splits Sunday and Monday releases into different ISO weeks", async () => {
  const github = makeGithub({
    pages: [
      [
        release(1, "sun", "2026-08-16T23:59:00.000Z"),
        release(2, "mon", "2026-08-17T00:01:00.000Z"),
      ],
    ],
  });

  const result = await calculateDeploymentFrequency({
    github,
    now: new Date("2026-09-06T00:00:00.000Z"),
  });

  assert.equal(result.trend.find((bucket) => bucket.week_start === "2026-08-10").deploys, 1);
  assert.equal(result.trend.find((bucket) => bucket.week_start === "2026-08-17").deploys, 1);
});

test("release pagination stops on the first page containing an out-of-window release", async () => {
  const github = makeGithub({
    pages: [
      [release(1, "v3", "2026-09-01T00:00:00.000Z"), release(2, "v2", "2026-08-20T00:00:00.000Z")],
      [release(3, "v1", "2026-08-10T00:00:00.000Z"), release(4, "old", "2026-08-01T00:00:00.000Z")],
      [release(5, "too-far", "2026-07-01T00:00:00.000Z")],
    ],
  });

  const result = await fetchProductionReleases({
    github,
    windowStart: new Date("2026-08-07T00:00:00.000Z"),
    windowEnd: new Date("2026-09-06T00:00:00.000Z"),
  });

  assert.deepEqual(
    result.map((item) => item.tag_name),
    ["v1", "v2", "v3"]
  );
  assert.equal(github.seen.filter((url) => url.includes("/releases")).length, 2);
});

test("tag resolution failure lowers confidence and excludes the release from metric windows", async () => {
  const github = makeGithub({
    pages: [
      [
        release(1, "good", "2026-09-01T00:00:00.000Z"),
        release(2, "missing", "2026-08-20T00:00:00.000Z"),
      ],
    ],
    missingTags: new Set(["missing"]),
  });

  const result = await calculateDeploymentFrequency({
    github,
    now: new Date("2026-09-06T00:00:00.000Z"),
  });

  assert.equal(result.sample_size, 1);
  assert.equal(result.data_confidence, 0.5);
  assert.deepEqual(result.unresolved_tags, ["missing"]);
  assert.deepEqual(
    result.release_windows.map((window) => window.end_sha),
    ["sha-good"]
  );
  assert.equal(result.trend.reduce((sum, bucket) => sum + bucket.deploys, 0), 1);
});

test("release windows connect each resolved release to its predecessor", () => {
  assert.deepEqual(
    buildReleaseWindows([
      normalizedRelease(1, "a", "2026-08-10T00:00:00.000Z", "sha-a"),
      normalizedRelease(2, "b", "2026-08-11T00:00:00.000Z", "sha-b"),
    ]),
    [
      {
        release_id: 1,
        prev_release_id: null,
        start_sha: null,
        end_sha: "sha-a",
        window_start_ts: null,
        window_end_ts: "2026-08-10T00:00:00.000Z",
        commit_shas: [],
      },
      {
        release_id: 2,
        prev_release_id: 1,
        start_sha: "sha-a",
        end_sha: "sha-b",
        window_start_ts: "2026-08-10T00:00:00.000Z",
        window_end_ts: "2026-08-11T00:00:00.000Z",
        commit_shas: [],
      },
    ]
  );
});

function makeGithub({ pages, missingTags = new Set() }) {
  const seen = [];
  const wrapper = new GitHubMetricsWrapper(
    { owner: "openai", repo: "codex", allowedEvents: [] },
    async (url) => {
      const parsed = new URL(url);
      seen.push(String(url));

      const commitMatch = parsed.pathname.match(/\/commits\/(.+)$/);
      if (commitMatch) {
        const tag = decodeURIComponent(commitMatch[1]);
        if (missingTags.has(tag)) {
          return json({ message: "Not Found" }, { status: 404 });
        }
        return json({ sha: `sha-${tag}` });
      }

      if (parsed.pathname.endsWith("/releases")) {
        const page = Number.parseInt(parsed.searchParams.get("page") || "1", 10);
        const headers = {};
        if (page < pages.length) {
          headers.link = `<https://api.github.com/repos/openai/codex/releases?per_page=100&page=${page + 1}>; rel="next"`;
        }
        return json(pages[page - 1], { headers });
      }

      return json({ message: "Not Found" }, { status: 404 });
    }
  );
  wrapper.seen = seen;
  return wrapper;
}

function release(id, tag, publishedAt, overrides = {}) {
  return {
    id,
    tag_name: tag,
    name: tag,
    draft: false,
    prerelease: false,
    created_at: publishedAt,
    published_at: publishedAt,
    html_url: `https://github.com/openai/codex/releases/tag/${tag}`,
    ...overrides,
  };
}

function normalizedRelease(id, tag, publishedAt, sha = `sha-${tag}`) {
  return {
    id,
    tag_name: tag,
    resolved_sha: sha,
    published_at: publishedAt,
    html_url: `https://github.com/openai/codex/releases/tag/${tag}`,
  };
}

function json(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
