const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");
const github = require("./api/github/[...path]");
const index = require("./api/index");
const login = require("./api/login");
const metrics = require("./api/metrics/[...path]");
const webhook = require("./api/webhooks/github");

loadEnvFile(".env");
loadEnvFile(".env.local");

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3000);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://" + host + ":" + port);
  attachVercelCompatibility(req, res, url);

  if (url.pathname === "/") {
    return index(req, res);
  }

  if (url.pathname === "/api/login") {
    return login(req, res);
  }

  if (url.pathname === "/api/webhooks/github") {
    return webhook(req, res);
  }

  if (url.pathname.startsWith("/api/github")) {
    req.query.path = url.pathname
      .replace(/^\/api\/github\/?/, "")
      .split("/")
      .filter(Boolean);
    return github(req, res);
  }

  if (url.pathname.startsWith("/api/metrics")) {
    req.query.path = url.pathname
      .replace(/^\/api\/metrics\/?/, "")
      .split("/")
      .filter(Boolean);
    return metrics(req, res);
  }

  res.statusCode = 404;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end("not found");
});

server.listen(port, host, () => {
  console.log("DORA prototype listening at http://" + host + ":" + port);
});

function attachVercelCompatibility(req, res, url) {
  req.query = Object.fromEntries(url.searchParams.entries());
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  };
}

function loadEnvFile(filename) {
  const envPath = path.join(process.cwd(), filename);
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed || process.env[parsed.key] !== undefined) {
      continue;
    }

    process.env[parsed.key] = parsed.value;
  }
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) {
    return null;
  }

  return {
    key: match[1],
    value: unquoteEnvValue(match[2].trim()),
  };
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
