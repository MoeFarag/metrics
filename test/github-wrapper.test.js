const assert = require("node:assert/strict");
const test = require("node:test");
const { GitHubMetricsWrapper } = require("../src/github-wrapper");
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
  });

  assert.equal(config.owner, "openai");
  assert.equal(config.repo, "codex");
  assert.deepEqual(config.allowedEvents, ["push", "workflow_run"]);
  assert.equal(config.wrapperToken, "secret");
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
