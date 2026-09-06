const { readConfig } = require("../../src/config");
const { GitHubMetricsWrapper } = require("../../src/github-wrapper");
const { methodNotAllowed, sendJson, toQueryObject } = require("../../src/http");
const { computeCiReliability, computeTimeToSignal, loadActionsWindow } = require("../../src/metrics/actions");
const { MemoCache } = require("../../src/metrics/cache");
const { calculateChangeFailureRate, calculateLeadTimeForChanges } = require("../../src/metrics/dora");
const { loadMergedPullRequests, loadPullRequestDetails } = require("../../src/metrics/pr-loader");
const { summarizePrSizeDistribution, summarizePullRequestSize } = require("../../src/metrics/pr-size");
const { getMetricRegistry, getSharedLimitations } = require("../../src/metrics/registry");
const { calculateDeploymentFrequency } = require("../../src/metrics/releases");
const { calculateReviewRoundTrips } = require("../../src/metrics/review-round-trips");
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
      const metricConfig = { ...config, window_days: options.window_days };
      const cache = new MemoCache(config.metricsCache);
      const window = resolveMetricsWindow({ metricsWindowDays: options.window_days });
      const repo = await repoGithub.getRepo();
      const metrics = await calculateMetrics({
        github: repoGithub,
        config: metricConfig,
        window,
        includePriorWindow: options.include_prior_window,
        cache,
      });

      return sendJson(res, 200, {
        repo: {
          full_name: repo.full_name,
          html_url: repo.html_url,
          default_branch: repo.default_branch,
          private: repo.private,
        },
        window,
        computed_at: new Date().toISOString(),
        rateLimit: repoGithub.rateLimit || metrics.find((metric) => metric.rateLimit)?.rateLimit || null,
        metrics,
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

async function calculateMetrics({ github, config, window, includePriorWindow, cache }) {
  const registry = getMetricRegistry();
  const byId = new Map(registry.map((metric) => [metric.id, metric]));
  const results = new Map();

  const [deploymentFrequency, leadTime, changeFailureRate, prSize, reviewRoundTrips, actionsData] =
    await Promise.all([
    safeMetric(
      "m1",
      () =>
        calculateDeploymentFrequency({
          github,
          config,
          includePriorWindow,
          cache,
        }),
      byId
    ),
    safeMetric(
      "m2",
      () =>
        calculateLeadTimeForChanges({
          github,
          config,
          cache,
        }),
      byId
    ),
    safeMetric(
      "m3",
      () =>
        calculateChangeFailureRate({
          github,
          config,
          cache,
        }),
      byId
    ),
    safeMetric("m4", () => calculatePullRequestSizeMetric({ github, config, window, cache }), byId),
    safeMetric(
      "m5",
      () =>
        calculateReviewRoundTrips({
          github,
          config,
          includePriorWindow,
          cache,
        }),
      byId
    ),
    safeMetric("actions", () => loadActionsWindow({ github, config, window }), byId),
  ]);

  results.set("m1", deploymentFrequency);
  results.set("m2", leadTime);
  results.set("m3", changeFailureRate);
  results.set("m4", prSize);
  results.set("m5", reviewRoundTrips);

  if (actionsData.error) {
    results.set("m6", metricError("m6", byId, actionsData.error));
    results.set("m7", metricError("m7", byId, actionsData.error));
  } else {
    results.set("m6", normalizeMetric("m6", computeTimeToSignal(actionsData, { window, config }), byId));
    results.set("m7", normalizeMetric("m7", computeCiReliability(actionsData, { window, config }), byId));
  }

  return registry.map((metric) => results.get(metric.id) || pendingMetric(metric.id, byId));
}

async function calculatePullRequestSizeMetric({ github, config, window, cache }) {
  const pulls = await loadMergedPullRequests(github, {
    windowStart: window.window_start,
    windowEnd: window.window_end,
  });
  const details = await loadPullRequestDetails(github, pulls, {
    concurrency: config.metricsConcurrency,
    cache,
  });
  const rows = details.map(({ pull, files }) => summarizePullRequestSize(pull, files));
  return summarizePrSizeDistribution(rows, {
    totalMerged: pulls.length,
  });
}

async function safeMetric(id, load, registryById) {
  try {
    const result = await load();
    return normalizeMetric(id, result, registryById);
  } catch (error) {
    return metricError(id, registryById, error);
  }
}

function normalizeMetric(id, result, registryById) {
  if (id === "actions") {
    return result;
  }

  const meta = registryById.get(id) || {};
  const dataConfidence = result.data_confidence ?? result.confidence?.score ?? null;
  return {
    id,
    name: meta.name,
    family: meta.family,
    pair: meta.pair,
    question: meta.question,
    status: result.state || "ok",
    band: result.headline?.band || bandForConfidence(dataConfidence),
    direction: result.direction || "not_computed",
    sample_size: result.sample_size ?? null,
    data_confidence: dataConfidence,
    note: buildNote(result),
    ...result,
    data_confidence: dataConfidence,
  };
}

function pendingMetric(id, registryById) {
  const meta = registryById.get(id) || {};
  return {
    id,
    name: meta.name,
    family: meta.family,
    pair: meta.pair,
    question: meta.question,
    status: "pending_implementation",
    band: "pending",
    direction: "not_computed",
    sample_size: 0,
    data_confidence: null,
    note: "Metric implementation is still in progress.",
  };
}

function metricError(id, registryById, error) {
  const meta = registryById.get(id) || {};
  return {
    id,
    name: meta.name,
    family: meta.family,
    pair: meta.pair,
    question: meta.question,
    status: "error",
    band: "low",
    direction: "not_computed",
    sample_size: 0,
    data_confidence: 0,
    note: error.message,
    rateLimit: error.rateLimit || null,
    error: error.code || "metric_error",
  };
}

function buildNote(result) {
  if (Array.isArray(result.low_confidence_reasons) && result.low_confidence_reasons.length) {
    return result.low_confidence_reasons.join(", ");
  }
  if (Array.isArray(result.caveats) && result.caveats.length) {
    return result.caveats.join(", ");
  }
  if (result.state === "no_releases") {
    return "No releases detected in the selected window, which impacts release-based metrics.";
  }
  if (result.direction_basis) {
    return result.direction_basis;
  }
  return result.metric || "";
}

function bandForConfidence(confidence) {
  if (confidence === null || confidence === undefined) return "pending";
  if (confidence < 0.7) return "low";
  return "ready";
}
