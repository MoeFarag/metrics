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

test("application name and limitations layout match the prototype shell", () => {
  const html = renderLoginPage();

  assert.match(html, /<title>Metrics Dashboard Prototype<\/title>/);
  assert.match(html, /<h1>Metrics Dashboard Prototype<\/h1>/);
  assert.match(html, /position: fixed;/);
  assert.match(html, /bottom: 0;/);
});

test("dashboard cards render metric references loading states and modal details", () => {
  const html = renderLoginPage();

  assert.match(html, /metricShells = \[/);
  assert.match(html, /metricRef\(metric\)/);
  assert.match(html, /class="spinner"/);
  assert.match(html, /include_prior_window", "true"/);
  assert.doesNotMatch(html, /window\.alert/);
  assert.match(html, /class="modal-backdrop"/);
  assert.match(html, /openBand\(metric\)/);
});

test("metric visualizations are chosen per metric", () => {
  const html = renderLoginPage();

  assert.match(html, /m1: renderDeploymentFrequency/);
  assert.match(html, /m2: renderLeadTime/);
  assert.match(html, /m3: renderChangeFailureRate/);
  assert.match(html, /m4: renderPrSize/);
  assert.match(html, /m5: renderReviewTrips/);
  assert.match(html, /m6: renderTimeToSignal/);
  assert.match(html, /m7: renderCiReliability/);
});

test("metric labels are human readable and charts expose hover titles", () => {
  const html = renderLoginPage();

  assert.match(html, /displayLabel\(metric\.direction/);
  assert.match(html, /Insufficient data/);
  assert.match(html, /Required checks use observed Actions jobs/);
  assert.match(html, /<title>/);
  assert.match(html, /height: 128px;/);
  assert.doesNotMatch(html, /<strong>Metric<\/strong>/);
});
