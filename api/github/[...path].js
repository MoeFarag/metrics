const { readConfig } = require("../../src/config");
const { GitHubMetricsWrapper } = require("../../src/github-wrapper");
const {
  methodNotAllowed,
  parseBody,
  requireApiToken,
  sendJson,
  toQueryObject,
} = require("../../src/http");

module.exports = async function handler(req, res) {
  try {
    const config = readConfig();
    requireApiToken(req, config);

    const github = new GitHubMetricsWrapper(config);
    const path = normalizePath(req.query.path);
    const query = toQueryObject(req.query);
    delete query.path;

    if (req.method === "GET") {
      return handleGet(req, res, github, path, query);
    }

    if (req.method === "POST") {
      return handlePost(req, res, github, path);
    }

    if (req.method === "DELETE") {
      return handleDelete(req, res, github, path);
    }

    return methodNotAllowed(res, ["GET", "POST", "DELETE"]);
  } catch (error) {
    return sendError(res, error);
  }
};

async function handleGet(req, res, github, path, query) {
  if (path === "health") {
    return sendJson(res, 200, {
      ok: true,
      repo: github.repoPath,
      authenticated: Boolean(github.config.token),
    });
  }

  if (path === "repo") {
    return sendJson(res, 200, await github.getRepo());
  }

  if (path === "metrics/summary") {
    return sendJson(res, 200, await github.getSummary());
  }

  if (path === "issues") {
    return sendJson(res, 200, await github.listIssues(query));
  }

  if (path === "pulls") {
    return sendJson(res, 200, await github.listPulls(query));
  }

  if (path === "commits") {
    return sendJson(res, 200, await github.listCommits(query));
  }

  if (path === "actions/workflows") {
    return sendJson(res, 200, await github.listWorkflows(query));
  }

  if (path === "actions/runs") {
    return sendJson(res, 200, await github.listWorkflowRuns(query));
  }

  if (path === "actions/artifacts") {
    return sendJson(res, 200, await github.listArtifacts(query));
  }

  const workflowRunsMatch = path.match(/^actions\/workflows\/([^/]+)\/runs$/);
  if (workflowRunsMatch) {
    return sendJson(
      res,
      200,
      await github.listWorkflowRunsForWorkflow(workflowRunsMatch[1], query)
    );
  }

  const jobsMatch = path.match(/^actions\/jobs\/([^/]+)$/);
  if (jobsMatch) {
    return sendJson(res, 200, await github.listJobsForRun(jobsMatch[1], query));
  }

  if (path === "hooks") {
    return sendJson(res, 200, await github.listHooks(query));
  }

  return sendJson(res, 404, { error: "not_found", path });
}

async function handlePost(req, res, github, path) {
  if (path !== "hooks") {
    return sendJson(res, 404, { error: "not_found", path });
  }

  const rawBody = await parseBody(req);
  const body = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {};
  return sendJson(res, 201, await github.createHook(body));
}

async function handleDelete(req, res, github, path) {
  const hookMatch = path.match(/^hooks\/([^/]+)$/);
  if (!hookMatch) {
    return sendJson(res, 404, { error: "not_found", path });
  }

  return sendJson(res, 200, await github.deleteHook(hookMatch[1]));
}

function normalizePath(path) {
  return (Array.isArray(path) ? path.join("/") : path || "health").replace(/^\/+|\/+$/g, "");
}

function sendError(res, error) {
  const statusCode = error.statusCode || 500;
  return sendJson(res, statusCode, {
    error: statusCode >= 500 ? "internal_error" : "request_error",
    message: error.message,
    github: error.github,
    rateLimit: error.rateLimit,
  });
}
