const { readConfig } = require("../../src/config");
const { GitHubMetricsWrapper } = require("../../src/github-wrapper");
const { methodNotAllowed, sendJson, toQueryObject } = require("../../src/http");
const { getMetricRegistry, getSharedLimitations } = require("../../src/metrics/registry");
const { parseMetricQueryOptions } = require("../../src/metrics/scope");
const { resolveMetricsWindow } = require("../../src/metrics/window");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return methodNotAllowed(res, ["GET"]);
    }

    const config = readConfig();
    const github = new GitHubMetricsWrapper(config);
    const path = normalizePath(req.query.path);
    const query = toQueryObject(req.query);
    delete query.path;

    if (path === "registry") {
      return sendJson(res, 200, {
        metrics: getMetricRegistry(),
        limitations: getSharedLimitations(),
        defaults: {
          repo: github.repoPath,
          window_days: config.metricsWindowDays,
          required_check_count: config.requiredChecks.length,
          required_check_set_version: config.requiredCheckSetVersion,
        },
      });
    }

    if (path === "summary") {
      const options = parseMetricQueryOptions({ ...query, metric: "summary" }, config);
      const repoGithub = new GitHubMetricsWrapper({ ...config, ...options.repo });
      const repo = await repoGithub.getRepo();
      return sendJson(res, 200, {
        repo: {
          full_name: repo.full_name,
          html_url: repo.html_url,
          default_branch: repo.default_branch,
          private: repo.private,
        },
        window: resolveMetricsWindow({ metricsWindowDays: options.window_days }),
        computed_at: new Date().toISOString(),
        rateLimit: repoGithub.rateLimit,
        metrics: getMetricRegistry().map((metric) => ({
          id: metric.id,
          name: metric.name,
          family: metric.family,
          pair: metric.pair,
          status: "pending_implementation",
          band: "pending",
          direction: "not_computed",
          sample_size: 0,
          data_confidence: null,
          note: "Metric engine is being implemented in a separate workstream.",
        })),
        limitations: getSharedLimitations(),
      });
    }

    return sendJson(res, 404, { error: "not_found", path });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return sendJson(res, statusCode, {
      error: error.code || (statusCode >= 500 ? "internal_error" : "request_error"),
      message: error.message,
      rateLimit: error.rateLimit,
      github: error.github,
    });
  }
};

function normalizePath(path) {
  return (Array.isArray(path) ? path.join("/") : path || "summary").replace(/^\/+|\/+$/g, "");
}
