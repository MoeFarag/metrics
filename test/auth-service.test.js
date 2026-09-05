const assert = require("node:assert/strict");
const test = require("node:test");
const { authenticate } = require("../src/auth-service");
const { readAuthConfig } = require("../src/config");
const { hashPassword, verifyPassword } = require("../src/hash-service");

test("hash service encodes prototype passwords as base64", () => {
  assert.equal(hashPassword("admin"), "YWRtaW4=");
  assert.equal(verifyPassword("manager", "bWFuYWdlcg=="), true);
  assert.equal(verifyPassword("manager", "wrong"), false);
});

test("readAuthConfig loads admin manager and executive credentials", () => {
  const config = readAuthConfig({
    AUTH_ADMIN_USERNAME: "admin-user",
    AUTH_ADMIN_PASSWORD_HASH: hashPassword("admin-pass"),
    AUTH_MANAGER_USERNAME: "manager-user",
    AUTH_MANAGER_PASSWORD_HASH: hashPassword("manager-pass"),
    AUTH_EXECUTIVE_USERNAME: "executive-user",
    AUTH_EXECUTIVE_PASSWORD_HASH: hashPassword("executive-pass"),
  });

  assert.deepEqual(
    config.roles.map((account) => account.role),
    ["admin", "manager", "executive"]
  );
  assert.equal(config.roles[0].username, "admin-user");
});

test("authenticate returns the matching prototype role", () => {
  const config = readAuthConfig({
    AUTH_ADMIN_USERNAME: "admin",
    AUTH_ADMIN_PASSWORD_HASH: hashPassword("pass"),
  });

  assert.deepEqual(authenticate({ username: "admin", password: "pass" }, config), {
    username: "admin",
    role: "admin",
  });
  assert.equal(authenticate({ username: "admin", password: "bad" }, config), null);
});
