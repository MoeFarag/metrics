function sendJson(res, statusCode, body, headers = {}) {
  res.statusCode = statusCode;
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function methodNotAllowed(res, allowed) {
  sendJson(
    res,
    405,
    { error: "method_not_allowed", allowed },
    { allow: allowed.join(", ") }
  );
}

function parseBody(req, limitBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        const error = new Error("Request body too large");
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function requireApiToken(req, config) {
  if (!config.wrapperToken) {
    return;
  }

  const header = req.headers.authorization || "";
  const expected = `Bearer ${config.wrapperToken}`;
  if (header !== expected) {
    const error = new Error("Invalid or missing API token");
    error.statusCode = 401;
    throw error;
  }
}

function toQueryObject(query) {
  const out = {};
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = Array.isArray(value) ? value[value.length - 1] : value;
  }
  return out;
}

module.exports = {
  methodNotAllowed,
  parseBody,
  requireApiToken,
  sendJson,
  toQueryObject,
};
