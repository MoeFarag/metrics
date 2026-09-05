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

module.exports = { readAuthConfig, readConfig, parseCsv };
