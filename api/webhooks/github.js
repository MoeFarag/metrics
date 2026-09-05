const { readConfig } = require("../../src/config");
const { GitHubMetricsWrapper } = require("../../src/github-wrapper");
const { methodNotAllowed, parseBody, sendJson } = require("../../src/http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  try {
    const config = readConfig();
    const github = new GitHubMetricsWrapper(config);
    const rawBody = await parseBody(req);
    const meta = github.parseWebhookHeaders(req.headers);

    if (!meta.event || !meta.delivery) {
      return sendJson(res, 400, {
        error: "invalid_webhook",
        message: "Missing GitHub webhook headers",
      });
    }

    const verification = github.verifyWebhook(rawBody, meta.signature256);
    if (config.webhookSecret && !verification.verified) {
      return sendJson(res, 401, {
        error: "invalid_signature",
        reason: verification.reason,
      });
    }

    if (!github.isEventAllowed(meta.event)) {
      return sendJson(res, 202, {
        accepted: false,
        ignored: true,
        reason: "event_not_allowed",
        event: meta.event,
        delivery: meta.delivery,
      });
    }

    const payload = JSON.parse(rawBody.toString("utf8"));
    const summary = github.summarizeWebhook(meta.event, payload);
    const envelope = {
      event: meta.event,
      delivery: meta.delivery,
      received_at: new Date().toISOString(),
      verified: verification.verified,
      repo: github.repoPath,
      summary,
      payload,
    };

    const handlerResults = await github.emit(meta.event, payload, meta);
    const forwarded = await github.forwardWebhook(envelope);

    return sendJson(res, 202, {
      accepted: true,
      event: meta.event,
      delivery: meta.delivery,
      verified: verification.verified,
      summary,
      handlers: handlerResults.length,
      forwarded,
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      error: "webhook_error",
      message: error.message,
    });
  }
};
