const METRIC_NAMES = new Set(["m1", "m2", "m3", "m4", "m5", "m6", "m7", "summary"]);

function parseRepo(value, defaults = {}) {
  if (!value && defaults.owner && defaults.repo) {
    return { owner: defaults.owner, repo: defaults.repo };
  }

  const input = String(value || "").trim();
  const match = input.match(
    /^(?:https?:\/\/github\.com\/)?(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+?)(?:\.git)?(?:[\/#?].*)?$/
  );
  if (!match) {
    const error = new Error("Repository must be a GitHub URL or owner/repo pair");
    error.statusCode = 400;
    error.code = "invalid_repository";
    throw error;
  }

  return {
    owner: match.groups.owner,
    repo: match.groups.repo,
  };
}

function parseMetricQueryOptions(query = {}, config = {}) {
  const metric = query.metric ? String(query.metric).toLowerCase() : null;
  if (metric && !METRIC_NAMES.has(metric)) {
    const error = new Error("Unsupported metric");
    error.statusCode = 400;
    error.code = "unsupported_metric";
    throw error;
  }

  return {
    metric,
    repo: parseRepo(query.repo || query.repository, config),
    include_prior_window: parseToggle(query.include_prior_window || query.direction, false),
    window_days: parseWindowDays(query.window || query.window_days, config.metricsWindowDays || 30),
  };
}

function parseToggle(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function parseWindowDays(value, defaultValue) {
  const match = String(value || "").match(/^(\d+)(?:d|days?)?$/i);
  if (!match) {
    return defaultValue;
  }
  const days = Number.parseInt(match[1], 10);
  return Number.isFinite(days) && days > 0 ? days : defaultValue;
}

module.exports = {
  METRIC_NAMES,
  parseMetricQueryOptions,
  parseRepo,
};
