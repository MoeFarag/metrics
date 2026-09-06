const assert = require("node:assert/strict");
const test = require("node:test");
const { renderLoginPage } = require("../src/login-page");

test("dashboard view switcher is restricted to admin users", () => {
  const html = renderLoginPage();

  assert.match(html, /v-if="canSwitchViews" class="view-tabs"/);
  assert.match(html, /canSwitchViews\(\) {\s*return this\.user\?\.role === "admin";\s*}/);
  assert.match(html, /effectiveView\(\) {\s*return this\.canSwitchViews \? this\.view : "manager";\s*}/);
  assert.match(html, /v-if="effectiveView === 'manager'"/);
});
