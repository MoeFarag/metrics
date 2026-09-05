const crypto = require("crypto");

const GITHUB_API = "https://api.github.com";

class GitHubMetricsWrapper {
  constructor(config, fetchImpl = globalThis.fetch) {
    if (!fetchImpl) {
      throw new Error("A fetch implementation is required");
    }

    this.config = config;
    this.fetch = fetchImpl;
    this.eventHandlers = new Map();
  }

  get repoPath() {
    return `${this.config.owner}/${this.config.repo}`;
  }

  async getRepo() {
    return this.request(`/repos/${this.repoPath}`);
  }

  async listIssues(params = {}) {
    return this.request(`/repos/${this.repoPath}/issues`, params);
  }

  async listPulls(params = {}) {
    return this.request(`/repos/${this.repoPath}/pulls`, params);
  }

  async listCommits(params = {}) {
    return this.request(`/repos/${this.repoPath}/commits`, params);
  }

  async listWorkflows(params = {}) {
    return this.request(`/repos/${this.repoPath}/actions/workflows`, params);
  }

  async listWorkflowRuns(params = {}) {
    return this.request(`/repos/${this.repoPath}/actions/runs`, params);
  }

  async listWorkflowRunsForWorkflow(workflowId, params = {}) {
    return this.request(
      `/repos/${this.repoPath}/actions/workflows/${encodeURIComponent(workflowId)}/runs`,
      params
    );
  }

  async listJobsForRun(runId, params = {}) {
    return this.request(
      `/repos/${this.repoPath}/actions/runs/${encodeURIComponent(runId)}/jobs`,
      params
    );
  }

  async listArtifacts(params = {}) {
    return this.request(`/repos/${this.repoPath}/actions/artifacts`, params);
  }

  async listHooks(params = {}) {
    return this.request(`/repos/${this.repoPath}/hooks`, params);
  }

  async createHook({ url, events = ["push", "pull_request", "workflow_run"], active = true }) {
    if (!url) {
      const error = new Error("Webhook url is required");
      error.statusCode = 400;
      throw error;
    }

    return this.request(
      `/repos/${this.repoPath}/hooks`,
      {},
      {
        method: "POST",
        body: {
          name: "web",
          active,
          events,
          config: {
            url,
            content_type: "json",
            insecure_ssl: "0",
            secret: this.config.webhookSecret || undefined,
          },
        },
      }
    );
  }

  async deleteHook(hookId) {
    return this.request(
      `/repos/${this.repoPath}/hooks/${encodeURIComponent(hookId)}`,
      {},
      { method: "DELETE" }
    );
  }

  on(eventName, handler) {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, new Set());
    }
    this.eventHandlers.get(eventName).add(handler);
  }

  async emit(eventName, payload, meta = {}) {
    const handlers = [
      ...(this.eventHandlers.get("*") || []),
      ...(this.eventHandlers.get(eventName) || []),
    ];

    const results = [];
    for (const handler of handlers) {
      results.push(await handler(payload, meta));
    }
    return results;
  }

  parseWebhookHeaders(headers) {
    return {
      event: headers["x-github-event"],
      delivery: headers["x-github-delivery"],
      signature256: headers["x-hub-signature-256"],
      userAgent: headers["user-agent"],
    };
  }

  verifyWebhook(rawBody, signature256) {
    if (!this.config.webhookSecret) {
      return { verified: false, reason: "secret_not_configured" };
    }

    if (!signature256 || !signature256.startsWith("sha256=")) {
      return { verified: false, reason: "signature_missing" };
    }

    const expectedDigest = crypto
      .createHmac("sha256", this.config.webhookSecret)
      .update(rawBody)
      .digest("hex");
    const expected = Buffer.from(`sha256=${expectedDigest}`);
    const actual = Buffer.from(signature256);

    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      return { verified: false, reason: "signature_mismatch" };
    }

    return { verified: true };
  }

  isEventAllowed(eventName) {
    if (!this.config.allowedEvents.length) {
      return true;
    }
    return this.config.allowedEvents.includes(eventName);
  }

  summarizeWebhook(eventName, payload) {
    const repository = payload.repository?.full_name || this.repoPath;
    const sender = payload.sender?.login || null;

    if (eventName === "workflow_run") {
      return {
        event: eventName,
        action: payload.action,
        repository,
        sender,
        workflow: payload.workflow_run?.name,
        status: payload.workflow_run?.status,
        conclusion: payload.workflow_run?.conclusion,
        run_id: payload.workflow_run?.id,
        html_url: payload.workflow_run?.html_url,
      };
    }

    if (eventName === "push") {
      return {
        event: eventName,
        repository,
        sender,
        ref: payload.ref,
        before: payload.before,
        after: payload.after,
        commits: Array.isArray(payload.commits) ? payload.commits.length : 0,
        compare: payload.compare,
      };
    }

    if (eventName === "pull_request") {
      return {
        event: eventName,
        action: payload.action,
        repository,
        sender,
        number: payload.pull_request?.number,
        title: payload.pull_request?.title,
        state: payload.pull_request?.state,
        merged: payload.pull_request?.merged,
        html_url: payload.pull_request?.html_url,
      };
    }

    return {
      event: eventName,
      action: payload.action,
      repository,
      sender,
    };
  }

  async forwardWebhook(envelope) {
    if (!this.config.forwardUrl) {
      return null;
    }

    const response = await this.fetch(this.config.forwardUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "github-metrics-wrapper/0.1",
      },
      body: JSON.stringify(envelope),
    });

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
    };
  }

  async getSummary() {
    const [repo, runs, workflows, pulls, issues] = await Promise.all([
      this.getRepo(),
      this.listWorkflowRuns({ per_page: 10 }),
      this.listWorkflows({ per_page: 100 }),
      this.listPulls({ state: "open", per_page: 100 }),
      this.listIssues({ state: "open", per_page: 100 }),
    ]);

    const workflowRuns = runs.workflow_runs || [];
    const pullRequests = pulls || [];
    const issueOnly = (issues || []).filter((issue) => !issue.pull_request);

    return {
      repo: {
        full_name: repo.full_name,
        private: repo.private,
        default_branch: repo.default_branch,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        open_issues: repo.open_issues_count,
        pushed_at: repo.pushed_at,
      },
      actions: {
        workflows: workflows.total_count || workflows.workflows?.length || 0,
        recent_runs: workflowRuns.length,
        recent_failures: workflowRuns.filter((run) => run.conclusion === "failure").length,
        latest_run: workflowRuns[0]
          ? {
              id: workflowRuns[0].id,
              name: workflowRuns[0].name,
              status: workflowRuns[0].status,
              conclusion: workflowRuns[0].conclusion,
              html_url: workflowRuns[0].html_url,
              created_at: workflowRuns[0].created_at,
            }
          : null,
      },
      work: {
        open_pull_requests: pullRequests.length,
        open_issues: issueOnly.length,
      },
    };
  }

  async request(path, query = {}, options = {}) {
    const url = new URL(`${GITHUB_API}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "github-metrics-wrapper/0.1",
      ...options.headers,
    };

    if (this.config.token) {
      headers.authorization = `Bearer ${this.config.token}`;
    }

    const response = await this.fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const rateLimit = {
      limit: response.headers.get("x-ratelimit-limit"),
      remaining: response.headers.get("x-ratelimit-remaining"),
      reset: response.headers.get("x-ratelimit-reset"),
      used: response.headers.get("x-ratelimit-used"),
    };

    if (response.status === 204) {
      return { ok: true, rateLimit };
    }

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const error = new Error(data?.message || `GitHub API failed with ${response.status}`);
      error.statusCode = response.status;
      error.github = data;
      error.rateLimit = rateLimit;
      throw error;
    }

    return data;
  }
}

module.exports = { GitHubMetricsWrapper };
