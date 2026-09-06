function readConfig(env = process.env) {
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;

  if (!owner || !repo) {
    const missing = [
      !owner ? "GITHUB_OWNER" : null,
      !repo ? "GITHUB_REPO" : null,
    ].filter(Boolean);
    const error = new Error(`Missing required environment: ${missing.join(", ")}`);
    error.statusCode = 500;
    throw error;
  }

  return {
    owner,
    repo,
    token: env.GITHUB_TOKEN || "",
    webhookSecret: env.GITHUB_WEBHOOK_SECRET || "",
    allowedEvents: parseCsv(env.GITHUB_ALLOWED_EVENTS),
    forwardUrl: env.WEBHOOK_FORWARD_URL || "",
    wrapperToken: env.WRAPPER_API_TOKEN || "",
    metricsWindowDays: parsePositiveInt(env.METRICS_WINDOW_DAYS, 60),
    dataConfidenceThreshold: parsePercent(env.DATA_CONFIDENCE_THRESHOLD, 0.7),
    requiredChecks: parseCsv(env.REQUIRED_CHECKS),
    requiredCheckSetVersion: env.REQUIRED_CHECK_SET_VERSION || "unversioned",
    metricsConcurrency: parsePositiveInt(env.METRICS_CONCURRENCY, 8),
    metricsCache: {
      enabled: parseBoolean(env.METRICS_CACHE_ENABLED, true),
      ttlMs: parseNonNegativeInt(env.METRICS_CACHE_TTL_MS, 60_000),
    },
  };
}

function readAuthConfig(env = process.env) {
  const roles = ["admin", "manager", "executive"];

  return {
    roles: roles.map((role) => ({
      role,
      username: env[`AUTH_${role.toUpperCase()}_USERNAME`] || "",
      passwordHash: env[`AUTH_${role.toUpperCase()}_PASSWORD_HASH`] || "",
    })),
  };
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveInt(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parseNonNegativeInt(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
}

function parsePercent(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return defaultValue;
  }
  return parsed > 1 ? parsed / 100 : parsed;
}

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  if (["1", "true", "yes", "on"].includes(String(value).toLowerCase())) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(String(value).toLowerCase())) {
    return false;
  }
  return defaultValue;
}

module.exports = {
  parseBoolean,
  parseCsv,
  parseNonNegativeInt,
  parsePercent,
  parsePositiveInt,
  readAuthConfig,
  readConfig,
};
