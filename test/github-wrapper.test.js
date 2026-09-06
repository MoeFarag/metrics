const assert = require("node:assert/strict");
const test = require("node:test");
const { GitHubMetricsWrapper, parseLinkHeader } = require("../src/github-wrapper");
const { readConfig } = require("../src/config");

test("readConfig requires target repo env vars", () => {
  assert.throws(() => readConfig({}), /GITHUB_OWNER, GITHUB_REPO/);
});

test("readConfig parses required and optional env vars", () => {
  const config = readConfig({
    GITHUB_OWNER: "openai",
    GITHUB_REPO: "codex",
    GITHUB_ALLOWED_EVENTS: "push, workflow_run",
    WRAPPER_API_TOKEN: "secret",
    METRICS_WINDOW_DAYS: "45",
    DATA_CONFIDENCE_THRESHOLD: "85",
    REQUIRED_CHECKS: "test, lint",
    REQUIRED_CHECK_SET_VERSION: "2026-09-06.1",
    METRICS_CONCURRENCY: "4",
    METRICS_CACHE_ENABLED: "false",
    METRICS_CACHE_TTL_MS: "5000",
  });

  assert.equal(config.owner, "openai");
  assert.equal(config.repo, "codex");
  assert.deepEqual(config.allowedEvents, ["push", "workflow_run"]);
  assert.equal(config.wrapperToken, "secret");
  assert.equal(config.metricsWindowDays, 45);
  assert.equal(config.dataConfidenceThreshold, 0.85);
  assert.deepEqual(config.requiredChecks, ["test", "lint"]);
  assert.equal(config.requiredCheckSetVersion, "2026-09-06.1");
  assert.equal(config.metricsConcurrency, 4);
  assert.deepEqual(config.metricsCache, { enabled: false, ttlMs: 5000 });
});

test("readConfig defaults metrics window to 90 days", () => {
  const config = readConfig({
    GITHUB_OWNER: "openai",
    GITHUB_REPO: "codex",
  });

  assert.equal(config.metricsWindowDays, 90);
});

test("request attaches GitHub version and auth headers", async () => {
  let seen;
  const wrapper = new GitHubMetricsWrapper(
    {
      owner: "openai",
      repo: "codex",
      token: "token",
      allowedEvents: [],
    },
    async (url, options) => {
      seen = { url, options };
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
  );

  await wrapper.listWorkflowRuns({ per_page: 5 });

  assert.equal(String(seen.url), "https://api.github.com/repos/openai/codex/actions/runs?per_page=5");
  assert.equal(seen.options.headers.authorization, "Bearer token");
  assert.equal(seen.options.headers["x-github-api-version"], "2022-11-28");
});

test("requestWithMeta surfaces rate-limit metadata without changing request raw data", async () => {
  const wrapper = new GitHubMetricsWrapper(
    {
      owner: "openai",
      repo: "codex",
      token: "token",
      allowedEvents: [],
    },
    async () =>
      new Response(JSON.stringify({ id: 1 }), {
        status: 200,
        headers: {
          "x-ratelimit-limit": "5000",
          "x-ratelimit-remaining": "4999",
          "x-ratelimit-reset": "1800000000",
          "x-ratelimit-used": "1",
        },
      })
  );

  assert.deepEqual(await wrapper.getRepo(), { id: 1 });

  const result = await wrapper.requestWithMeta("/repos/openai/codex");
  assert.deepEqual(result.data, { id: 1 });
  assert.deepEqual(result.meta.rateLimit, {
    limit: 5000,
    remaining: 4999,
    reset: 1800000000,
    used: 1,
    resource: null,
  });
  assert.equal(wrapper.rateLimit.remaining, 4999);
});

test("requestAllPages follows Link header and flattens GitHub collection arrays", async () => {
  const seen = [];
  const wrapper = new GitHubMetricsWrapper(
    {
      owner: "openai",
      repo: "codex",
      allowedEvents: [],
    },
    async (url) => {
      seen.push(String(url));
      if (String(url).includes("page=2")) {
        return new Response(JSON.stringify([{ id: 2 }]), {
          status: 200,
          headers: { "x-ratelimit-remaining": "98" },
        });
      }

      return new Response(JSON.stringify([{ id: 1 }]), {
        status: 200,
        headers: {
          link: '<https://api.github.com/repos/openai/codex/issues?per_page=100&page=2>; rel="next"',
          "x-ratelimit-remaining": "99",
        },
      });
    }
  );

  const result = await wrapper.requestAllPages("/repos/openai/codex/issues");

  assert.deepEqual(result.data, [{ id: 1 }, { id: 2 }]);
  assert.equal(result.meta.pageCount, 2);
  assert.deepEqual(seen, [
    "https://api.github.com/repos/openai/codex/issues?per_page=100",
    "https://api.github.com/repos/openai/codex/issues?per_page=100&page=2",
  ]);
});

test("requestAllPages flattens named collection payloads", async () => {
  const wrapper = new GitHubMetricsWrapper(
    {
      owner: "openai",
      repo: "codex",
      allowedEvents: [],
    },
    async (url) => {
      if (String(url).includes("page=2")) {
        return new Response(JSON.stringify({ total_count: 2, workflow_runs: [{ id: 2 }] }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ total_count: 2, workflow_runs: [{ id: 1 }] }), {
        status: 200,
        headers: {
          link: '<https://api.github.com/repos/openai/codex/actions/runs?per_page=100&page=2>; rel="next"',
        },
      });
    }
  );

  const result = await wrapper.requestAllPages("/repos/openai/codex/actions/runs");
  assert.deepEqual(result.data.workflow_runs, [{ id: 1 }, { id: 2 }]);
  assert.equal(result.data.total_count, 2);
});

test("rate-limit exhaustion throws a clear non-sleeping error", async () => {
  const wrapper = new GitHubMetricsWrapper(
    {
      owner: "openai",
      repo: "codex",
      allowedEvents: [],
    },
    async () =>
      new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403,
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1800000000",
        },
      })
  );

  await assert.rejects(
    () => wrapper.getRepo(),
    (error) => {
      assert.equal(error.code, "github_rate_limit_exhausted");
      assert.equal(error.statusCode, 403);
      assert.equal(error.rateLimit.remaining, 0);
      assert.equal(error.rateLimit.reset, 1800000000);
      return true;
    }
  );
});

test("parseLinkHeader indexes GitHub pagination relations", () => {
  assert.deepEqual(
    parseLinkHeader(
      '<https://api.github.com/repositories/1/issues?page=2>; rel="next", <https://api.github.com/repositories/1/issues?page=4>; rel="last"'
    ),
    {
      next: "https://api.github.com/repositories/1/issues?page=2",
      last: "https://api.github.com/repositories/1/issues?page=4",
    }
  );
});

test("webhook signature verification accepts valid sha256 signatures", () => {
  const wrapper = new GitHubMetricsWrapper({
    owner: "openai",
    repo: "codex",
    webhookSecret: "secret",
    allowedEvents: [],
  });
  const body = Buffer.from(JSON.stringify({ action: "completed" }));
  const crypto = require("crypto");
  const signature = `sha256=${crypto.createHmac("sha256", "secret").update(body).digest("hex")}`;

  assert.deepEqual(wrapper.verifyWebhook(body, signature), { verified: true });
});

test("event allowlist blocks events outside configured list", () => {
  const wrapper = new GitHubMetricsWrapper({
    owner: "openai",
    repo: "codex",
    allowedEvents: ["push"],
  });

  assert.equal(wrapper.isEventAllowed("push"), true);
  assert.equal(wrapper.isEventAllowed("issues"), false);
});
