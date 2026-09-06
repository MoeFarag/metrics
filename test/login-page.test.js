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
  assert.match(html, /metricPlans = {/);
  assert.match(html, /metricRef\(metric\)/);
  assert.match(html, /class="spinner"/);
  assert.match(html, /include_prior_window", "true"/);
  assert.doesNotMatch(html, /window\.alert/);
  assert.match(html, /class="modal-backdrop"/);
  assert.match(html, /openBand\(metric\)/);
  assert.match(html, /openInfo\(metric\)/);
  assert.match(html, /More info/);
});

test("manager and executive views use separate metric layouts", () => {
  const html = renderLoginPage();

  assert.match(html, /manager-metric-grid/);
  assert.match(html, /manager-metric-card/);
  assert.match(html, /min-height: 440px;/);
  assert.match(html, /font-size: 60px;/);
  assert.match(html, /height: 256px;/);
  assert.match(html, /executive-metric-grid/);
  assert.match(html, /executive-metric-card/);
  assert.match(html, /class="executive-report"/);
  assert.match(html, /What it means/);
  assert.match(html, /metricReport\(metric\)\.definition/);
  assert.match(html, /metricReport\(metric\)\.calculation/);
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

test("metric charts render axes labels and hoverable points", () => {
  const html = renderLoginPage();

  assert.match(html, /function chartFrame/);
  assert.match(html, /preserveAspectRatio="xMidYMid meet"/);
  assert.doesNotMatch(html, /preserveAspectRatio="none"/);
  assert.match(html, /class="chart-axis"/);
  assert.match(html, /class="chart-label"/);
  assert.match(html, /xLabel: "Weeks"/);
  assert.match(html, /yLabel: "Releases"/);
  assert.match(html, /xLabel: "Changed lines"/);
  assert.match(html, /yLabel: "CI reliability"/);
  assert.match(html, /class="chart-point"/);
  assert.match(html, /class="chart-bar"/);
});

test("metric charts expose hover and tap tooltips", () => {
  const html = renderLoginPage();

  assert.match(html, /class="chart-tooltip"/);
  assert.match(html, /@pointerover="showChartTooltip\(\$event, false\)"/);
  assert.match(html, /@pointermove="moveChartTooltip"/);
  assert.match(html, /@pointerleave="hideChartTooltip\(false\)"/);
  assert.match(html, /@click="showChartTooltip\(\$event, true\)"/);
  assert.match(html, /function chartTooltipText/);
  assert.match(html, /closest\?\.\("\.chart-point, \.chart-bar"\)/);
  assert.match(html, /function tooltipPosition/);
});
