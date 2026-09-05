const { authenticate } = require("../src/auth-service");
const { readAuthConfig } = require("../src/config");
const { methodNotAllowed, parseBody, sendJson } = require("../src/http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  try {
    const rawBody = await parseBody(req, 16 * 1024);
    const body = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {};
    const user = authenticate(body, readAuthConfig());

    if (!user) {
      return sendJson(res, 401, {
        error: "invalid_credentials",
        message: "Invalid username or password",
      });
    }

    return sendJson(res, 200, { user });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, {
      error: "login_error",
      message: error.message,
    });
  }
};
