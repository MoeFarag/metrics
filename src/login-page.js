function renderLoginPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Metrics Dashboard Prototype</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f7f9;
        color: #1e2430;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background: #f6f7f9;
      }

      button,
      input {
        font: inherit;
      }

      button {
        cursor: pointer;
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.68;
      }

      .login-screen {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 16px;
      }

      .login-panel {
        width: min(100%, 420px);
        background: #ffffff;
        border: 1px solid #d9dee7;
        border-radius: 8px;
        box-shadow: 0 18px 60px rgba(29, 36, 51, 0.12);
        padding: 28px;
      }

      h1,
      h2,
      h3,
      p {
        margin-top: 0;
      }

      .login-panel h1 {
        margin-bottom: 6px;
        font-size: 28px;
        line-height: 1.15;
        letter-spacing: 0;
      }

      .muted {
        color: #667085;
      }

      label {
        display: grid;
        gap: 8px;
        margin-bottom: 16px;
        color: #303747;
        font-size: 14px;
        font-weight: 650;
      }

      input {
        width: 100%;
        min-height: 44px;
        border: 1px solid #c9d0dc;
        border-radius: 6px;
        padding: 10px 12px;
        color: #111827;
        background: #ffffff;
      }

      input:focus {
        border-color: #2f7f67;
        outline: 3px solid rgba(47, 127, 103, 0.18);
      }

      .primary-button {
        min-height: 44px;
        border: 0;
        border-radius: 6px;
        background: #2f7f67;
        color: #ffffff;
        font-weight: 750;
      }

      .login-panel .primary-button {
        width: 100%;
      }

      .error {
        min-height: 22px;
        margin: 14px 0 0;
        color: #a3332a;
        font-size: 14px;
      }

      .dashboard {
        min-height: 100vh;
        display: grid;
        grid-template-rows: auto 1fr;
      }

      .top-bar {
        display: grid;
        grid-template-columns: minmax(260px, 1fr) auto;
        gap: 16px;
        align-items: center;
        padding: 16px clamp(16px, 3vw, 32px);
        background: #ffffff;
        border-bottom: 1px solid #dde2ea;
      }

      .repo-search {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 8px;
        align-items: center;
      }

      .repo-search input {
        min-height: 40px;
        background: #f8fafc;
      }

      .repo-search button,
      .view-tabs button,
      .logout-button,
      .details-button {
        min-height: 40px;
        border: 1px solid #c9d0dc;
        border-radius: 6px;
        background: #ffffff;
        color: #303747;
        padding: 0 12px;
        font-weight: 700;
      }

      .repo-search .primary-button {
        border: 0;
        background: #2f7f67;
        color: #ffffff;
      }

      .user-label {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
        color: #303747;
        font-size: 14px;
        font-weight: 700;
        white-space: nowrap;
      }

      .user-separator {
        width: 1px;
        height: 18px;
        background: #c9d0dc;
      }

      .content {
        width: min(1180px, 100%);
        margin: 0 auto;
        padding: 22px clamp(16px, 3vw, 32px) 190px;
      }

      .summary-band {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 18px;
        align-items: end;
        margin-bottom: 18px;
      }

      .summary-band h1 {
        margin-bottom: 6px;
        font-size: 26px;
        line-height: 1.2;
        letter-spacing: 0;
      }

      .summary-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        border: 1px solid #cbd5e1;
        border-radius: 999px;
        background: #ffffff;
        color: #334155;
        padding: 0 10px;
        font-size: 12px;
        font-weight: 750;
      }

      .chip.pending {
        border-color: #d4b35f;
        background: #fff8e6;
        color: #6f4e00;
      }

      .chip.low {
        border-color: #d9867a;
        background: #fff1ef;
        color: #91342a;
      }

      .chip.ready,
      .chip.elite,
      .chip.high {
        border-color: #8fc5ae;
        background: #eef8f3;
        color: #23624f;
      }

      .chip.medium,
      .chip.flat {
        border-color: #d4b35f;
        background: #fff8e6;
        color: #6f4e00;
      }

      .chip.improving {
        border-color: #8fc5ae;
        background: #eef8f3;
        color: #23624f;
      }

      .chip.degrading,
      .chip.error {
        border-color: #d9867a;
        background: #fff1ef;
        color: #91342a;
      }

      .view-tabs {
        display: inline-grid;
        grid-template-columns: repeat(2, minmax(120px, 1fr));
        gap: 4px;
        padding: 4px;
        border: 1px solid #d8dee8;
        border-radius: 8px;
        background: #eef2f6;
        margin-bottom: 18px;
      }

      .view-tabs button {
        border: 0;
        background: transparent;
      }

      .view-tabs button.active {
        background: #ffffff;
        box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
      }

      .metric-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }

      .metric-grid.manager-metric-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
      }

      .metric-grid.executive-metric-grid {
        grid-template-columns: 1fr;
        gap: 14px;
      }

      .metric-card {
        min-height: 220px;
        display: grid;
        grid-template-rows: auto 1fr auto;
        gap: 14px;
        border: 1px solid #d8dee8;
        border-radius: 8px;
        background: #ffffff;
        padding: 16px;
      }

      .metric-card.manager-metric-card {
        min-height: 440px;
        gap: 18px;
        padding: 24px;
      }

      .metric-card.executive-metric-card {
        min-height: 220px;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        grid-template-rows: 1fr;
        gap: 20px;
        align-items: stretch;
      }

      .metric-card.loading {
        position: relative;
      }

      .metric-card h3 {
        margin: 0 0 4px;
        font-size: 17px;
        line-height: 1.25;
        letter-spacing: 0;
      }

      .manager-metric-card h3 {
        font-size: 24px;
      }

      .executive-metric-card h3 {
        font-size: 20px;
      }

      .metric-primary {
        display: grid;
        grid-template-rows: auto 1fr;
        gap: 14px;
      }

      .metric-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }

      .metric-title-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .metric-ref {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 34px;
        min-height: 24px;
        border-radius: 6px;
        background: #1e2430;
        color: #ffffff;
        font-size: 12px;
        font-weight: 800;
      }

      .headline {
        display: grid;
        gap: 8px;
        align-content: start;
      }

      .headline-value {
        font-size: 30px;
        line-height: 1;
        font-weight: 800;
        letter-spacing: 0;
      }

      .manager-metric-card .headline-value {
        font-size: 60px;
      }

      .sparkline {
        width: 100%;
        height: 44px;
        border-radius: 6px;
        background:
          linear-gradient(to right, #e6ebf2 1px, transparent 1px),
          linear-gradient(to top, #e6ebf2 1px, transparent 1px),
          #f8fafc;
        background-size: 24px 100%, 100% 22px;
        overflow: hidden;
      }

      .sparkline svg {
        width: 100%;
        height: 44px;
        display: block;
      }

      .metric-visual {
        width: 100%;
        min-height: 128px;
        border-radius: 6px;
        background:
          linear-gradient(to right, #e6ebf2 1px, transparent 1px),
          linear-gradient(to top, #e6ebf2 1px, transparent 1px),
          #f8fafc;
        background-size: 24px 100%, 100% 24px;
        overflow: hidden;
      }

      .metric-visual svg {
        width: 100%;
        height: 128px;
        display: block;
        overflow: visible;
      }

      .manager-metric-card .metric-visual {
        min-height: 256px;
      }

      .manager-metric-card .metric-visual svg {
        height: 256px;
      }

      .executive-report {
        display: grid;
        align-content: start;
        gap: 12px;
        border-left: 1px solid #d8dee8;
        padding-left: 20px;
        color: #475467;
      }

      .executive-report h4 {
        margin: 0;
        color: #303747;
        font-size: 15px;
        line-height: 1.25;
        letter-spacing: 0;
      }

      .executive-report p {
        margin: 0;
        line-height: 1.45;
      }

      .executive-report-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }

      .chart-point,
      .chart-bar {
        cursor: help;
      }

      .chart-axis {
        stroke: #98a2b3;
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
      }

      .chart-grid {
        stroke: #dde2ea;
        stroke-width: 0.7;
        vector-effect: non-scaling-stroke;
      }

      .chart-label,
      .chart-tick-label {
        fill: #475467;
        font-size: 4px;
        font-weight: 700;
      }

      .chart-tick-label {
        fill: #667085;
        font-size: 3.7px;
        font-weight: 650;
      }

      .metric-footer {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        font-size: 12px;
      }

      .band-button {
        width: max-content;
        border: 0;
        padding: 0;
        background: transparent;
      }

      .metric-footer strong {
        display: block;
        color: #303747;
        font-size: 13px;
      }

      .status-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
      }

      .manager-detail {
        display: grid;
        gap: 8px;
        font-size: 13px;
        color: #475467;
      }

      .details-button {
        width: max-content;
        min-height: 32px;
        font-size: 12px;
      }

      .manager-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }

      .loading-panel {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 10px;
        align-items: center;
        color: #667085;
        font-size: 13px;
      }

      .spinner {
        width: 18px;
        height: 18px;
        border: 3px solid #d8dee8;
        border-top-color: #2f7f67;
        border-radius: 999px;
        animation: spin 0.9s linear infinite;
      }

      .modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: grid;
        place-items: center;
        padding: 20px;
        background: rgba(15, 23, 42, 0.42);
      }

      .modal-panel {
        width: min(640px, 100%);
        max-height: min(720px, calc(100vh - 40px));
        overflow: auto;
        border-radius: 8px;
        border: 1px solid #d8dee8;
        background: #ffffff;
        box-shadow: 0 24px 80px rgba(15, 23, 42, 0.24);
        padding: 22px;
      }

      .modal-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
      }

      .modal-header h2 {
        margin: 0 0 6px;
        font-size: 22px;
        line-height: 1.2;
      }

      .modal-close {
        min-width: 36px;
        min-height: 36px;
        border: 1px solid #c9d0dc;
        border-radius: 6px;
        background: #ffffff;
        color: #303747;
        font-weight: 900;
      }

      .detail-list {
        margin: 16px 0 0;
        padding-left: 20px;
        color: #475467;
      }

      .detail-list li + li {
        margin-top: 8px;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .limitations {
        position: fixed;
        right: clamp(16px, 3vw, 32px);
        bottom: 0;
        left: clamp(16px, 3vw, 32px);
        z-index: 20;
        margin: 0 auto;
        width: min(1180px, calc(100% - clamp(16px, 3vw, 32px) * 2));
        border: 1px solid #d8dee8;
        border-bottom: 0;
        border-radius: 8px 8px 0 0;
        background: #ffffff;
        box-shadow: 0 -10px 28px rgba(15, 23, 42, 0.1);
        padding: 12px 16px;
      }

      .limitations summary {
        width: max-content;
        cursor: pointer;
        color: #303747;
        font-weight: 800;
      }

      .limitations ul {
        margin: 10px 0 0;
        padding-left: 20px;
        color: #475467;
      }

      .limitations li + li {
        margin-top: 6px;
      }

      .empty-state {
        display: grid;
        place-items: center;
        min-height: 320px;
        border: 1px dashed #c9d0dc;
        border-radius: 8px;
        background: #ffffff;
        text-align: center;
        padding: 24px;
      }

      @media (max-width: 920px) {
        .top-bar,
        .summary-band {
          grid-template-columns: 1fr;
          align-items: stretch;
        }

        .summary-meta,
        .user-label {
          justify-content: flex-start;
        }

        .metric-grid,
        .metric-grid.manager-metric-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .metric-card.executive-metric-card {
          grid-template-columns: 1fr;
        }

        .executive-report {
          border-left: 0;
          border-top: 1px solid #d8dee8;
          padding-left: 0;
          padding-top: 16px;
        }
      }

      @media (max-width: 640px) {
        .repo-search {
          grid-template-columns: 1fr;
        }

        .metric-grid,
        .metric-grid.manager-metric-grid {
          grid-template-columns: 1fr;
        }

        .view-tabs {
          width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <main id="app">
      <section v-if="user" class="dashboard">
        <header class="top-bar">
          <form class="repo-search" @submit.prevent="loadRepoMetrics">
            <input
              v-model="repoAddress"
              aria-label="Repository address"
              autocomplete="off"
              inputmode="url"
              placeholder="https://github.com/org/repo"
              required
            >
            <button class="primary-button" :disabled="repoLoading" type="submit">{{ repoLoading ? "Loading" : "Run" }}</button>
            <button type="button" :disabled="repoLoading" @click="loadDefaultRepo">Default</button>
          </form>
          <div class="user-label">
            <span>{{ displayUserName }}</span>
            <span class="user-separator" aria-hidden="true"></span>
            <button class="logout-button" type="button" @click="logout">Log out</button>
          </div>
        </header>

        <section class="content">
          <div class="summary-band">
            <div>
              <h1>{{ currentTitle }}</h1>
              <p class="muted">{{ currentSubtitle }}</p>
            </div>
            <div class="summary-meta">
              <span class="chip">{{ selectedViewLabel }}</span>
              <span class="chip">{{ windowLabel }}</span>
              <span class="chip" :class="{ low: lowRateLimit }">{{ rateLimitLabel }}</span>
            </div>
          </div>

          <div v-if="canSwitchViews" class="view-tabs" role="tablist" aria-label="Dashboard view">
            <button type="button" :class="{ active: view === 'manager' }" @click="view = 'manager'">Manager</button>
            <button type="button" :class="{ active: view === 'executive' }" @click="view = 'executive'">Executive</button>
          </div>

          <section v-if="repoError" class="empty-state" role="alert">
            <div>
              <h2>Repository could not be loaded</h2>
              <p class="muted">{{ repoError }}</p>
            </div>
          </section>

          <section v-else class="metric-grid" :class="effectiveView + '-metric-grid'" aria-live="polite">
            <article v-for="metric in visibleMetrics" :key="metric.id" class="metric-card" :class="[effectiveView + '-metric-card', { loading: metric.loading }]">
              <div class="metric-primary">
                <div class="metric-top">
                  <div>
                    <div class="metric-title-row">
                      <span class="metric-ref">{{ metricRef(metric) }}</span>
                      <h3>{{ metric.name }}</h3>
                    </div>
                    <div class="muted">{{ metric.family }}<span v-if="metric.pair"> paired with {{ metric.pair.toUpperCase() }}</span></div>
                  </div>
                  <span class="chip" :class="directionClass(metric)">{{ directionLabel(metric) }}</span>
                </div>

                <div v-if="metric.loading" class="loading-panel">
                  <span class="spinner" aria-hidden="true"></span>
                  <span>Loading live GitHub data</span>
                </div>

                <div v-else class="headline">
                  <div class="headline-value">{{ metricValue(metric) }}</div>
                  <div class="status-row">
                    <span class="chip">{{ confidenceLabel(metric) }}</span>
                  </div>
                  <div class="metric-visual" v-html="metricVisual(metric)"></div>
                  <p class="muted">{{ metricNote(metric) }}</p>
                </div>
              </div>

              <div v-if="effectiveView === 'manager'" class="manager-detail">
                <div class="manager-actions">
                  <button class="details-button" :disabled="metric.loading" type="button" @click="openDetails(metric)">Details</button>
                  <button class="details-button" :disabled="metric.loading" type="button" @click="openInfo(metric)">More info</button>
                </div>
                <span>Sample: {{ metric.sample_size ?? 0 }}</span>
                <span>{{ metric.detail || 'Evidence rows appear here as each metric engine lands.' }}</span>
              </div>
              <div v-else class="executive-report">
                <div>
                  <h4>What it means</h4>
                  <p>{{ metricReport(metric).meaning }}</p>
                </div>
                <div>
                  <h4>Definition</h4>
                  <p>{{ metricReport(metric).definition }}</p>
                </div>
                <div>
                  <h4>Calculation</h4>
                  <p>{{ metricReport(metric).calculation }}</p>
                </div>
                <div class="executive-report-actions">
                  <button class="band-button" type="button" @click="openBand(metric)">
                    <span class="chip" :class="metric.band">{{ bandLabel(metric.band) }}</span>
                  </button>
                  <button class="details-button" :disabled="metric.loading" type="button" @click="openInfo(metric)">More info</button>
                </div>
              </div>
            </article>
          </section>

          <details class="limitations" open>
            <summary>Limitations</summary>
            <ul>
              <li v-for="item in limitations" :key="item">{{ item }}</li>
            </ul>
          </details>
        </section>

        <div v-if="modal" class="modal-backdrop" role="dialog" aria-modal="true" @click.self="closeModal">
          <section class="modal-panel">
            <div class="modal-header">
              <div>
                <h2>{{ modal.title }}</h2>
                <p class="muted">{{ modal.subtitle }}</p>
              </div>
              <button class="modal-close" type="button" aria-label="Close" @click="closeModal">&times;</button>
            </div>
            <ul class="detail-list">
              <li v-for="item in modal.items" :key="item">{{ item }}</li>
            </ul>
          </section>
        </div>
      </section>

      <section v-else class="login-screen">
        <form class="login-panel" @submit.prevent="login">
          <h1>Metrics Dashboard Prototype</h1>
          <p class="muted">Prototype access gate</p>

          <label>
            Username
            <input v-model="username" autocomplete="username" name="username" required>
          </label>

          <label>
            Password
            <input v-model="password" autocomplete="current-password" name="password" required type="password">
          </label>

          <button class="primary-button" :disabled="loading" type="submit">{{ loading ? "Checking..." : "Log in" }}</button>
          <div class="error" role="alert">{{ error }}</div>
        </form>
      </section>
    </main>

    <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
    <script>
      const { createApp } = Vue;
      const defaultRepoAddress = "https://github.com/advaitpaliwal/feynman";
      const fallbackLimitations = [
        "Production deploys are GitHub Releases. If no qualifying releases are detected, DORA release metrics show a no-release state instead of zeros.",
        "Change-failure signals look for labels or terms matching hotfix, incident, bug, and revert, plus explicit Git revert commits where detectable.",
        "Phase one uses live GitHub API reads only. There is no datastore, webhook ingestion, or historical snapshot.",
        "Direction uses the current 60-day window against the prior 60 days when enough weekly signal is present.",
        "Required-check metrics use configured branch-protection checks when supplied; otherwise the prototype falls back to observed Actions jobs and marks that caveat."
      ];
      const metricShells = [
        { id: "m1", name: "Deployment Frequency", family: "DORA", pair: null, question: "How often do changes reach production?" },
        { id: "m2", name: "Lead Time for Changes", family: "DORA", pair: null, question: "How long does a PR take to reach production?" },
        { id: "m3", name: "Change Failure Rate", family: "DORA", pair: null, question: "How often do production changes need remediation?" },
        { id: "m4", name: "PR Size Distribution", family: "Flow", pair: "m5", question: "Are changes small enough to review well?" },
        { id: "m5", name: "Review Round Trips", family: "Collaboration", pair: "m4", question: "How much back-and-forth happens after review?" },
        { id: "m6", name: "Time to Signal", family: "CI Platform", pair: "m7", question: "How quickly does CI give useful feedback?" },
        { id: "m7", name: "Rerun Rate & First-Attempt Pass Rate", family: "CI Platform", pair: "m6", question: "How stable is the required check path?" }
      ];
      const metricPlans = {
        m1: {
          definition: "Deployment Frequency counts published, non-draft, non-prerelease GitHub Releases in the measurement window.",
          calculation: "Bucket kept releases by ISO week, then report the median weekly deploy count. Inter-release gap p50 and p85 are kept as supporting context.",
          meaning: "Shows whether production changes are flowing regularly. The gap distribution matters because a burst of releases can hide long quiet periods."
        },
        m2: {
          definition: "Lead Time for Changes measures PR-open to release-published time for merged PRs whose merge commits appear in a release window.",
          calculation: "Join release commit lists to merged PR merge_commit_sha values, calculate release published time minus PR created time, then report median and p85 lead time.",
          meaning: "Shows how long accepted work waits before it is actually in production. Long tails point to stuck review, batching, or release delays."
        },
        m3: {
          definition: "Change Failure Rate measures the share of releases that need remediation, based on revert commits, incident or bug issues, and hotfix or revert PR labels.",
          calculation: "Mark each release failed if any failure signal applies, then report failed releases divided by total releases as a rolling four-week percentage.",
          meaning: "Shows whether shipping speed is creating production rework. Label coverage is mandatory because an unlabeled quarter must not look like a clean 0% failure rate."
        },
        m4: {
          definition: "PR Size Distribution measures the filtered lines changed in merged pull requests. It is a batch-size metric, not an effort or output metric.",
          calculation: "Fetch files for each merged PR, apply published path exclusions, exclude reverts from the distribution, then report p50, p75, p90, and the share above the large-change threshold.",
          meaning: "Shows whether changes are small enough to review well. It should be read with M5 so smaller PRs do not simply move waiting time into review cycles."
        },
        m5: {
          definition: "Review Round Trips counts human review-then-revise cycles before merge. It measures rework in the review loop, not reviewer diligence.",
          calculation: "Order human review events and branch commits for each merged PR, count review events followed by at least one commit before merge, then report the distribution and p50.",
          meaning: "Shows where requirements, design, or implementation clarity is breaking down. High round trips usually indicate unclear requirements or a missing design review stage."
        },
        m6: {
          definition: "Time to Signal measures how quickly required CI checks return useful red or green feedback after a push-triggered workflow run starts.",
          calculation: "Use workflow run creation time as push_at, include queue time, then report p50 and p90 time to first failing required job and time until all required jobs pass.",
          meaning: "Shows whether developers get feedback before they context-switch. The queue/execution split helps separate runner capacity problems from slow test problems."
        },
        m7: {
          definition: "Rerun Rate and First-Attempt Pass Rate measure whether CI results are trustworthy on unchanged commits.",
          calculation: "Group workflow attempts by workflow_id and head_sha, count groups with reruns, and calculate the share of commits whose required checks passed on attempt one.",
          meaning: "Shows whether teams trust CI. Reruns are a frustration signal, while first-attempt pass rate is the executive-legible quality signal."
        }
      };

      createApp({
        data() {
          return {
            error: "",
            loading: false,
            limitations: fallbackLimitations,
            metrics: [],
            modal: null,
            password: "",
            repoAddress: defaultRepoAddress,
            repoError: "",
            repoLoading: false,
            repoSummary: null,
            user: null,
            username: "",
            view: "manager",
          };
        },
        computed: {
          displayUserName() {
            if (!this.user) {
              return "";
            }

            return titleCase(this.user.username || this.user.role);
          },
          visibleMetrics() {
            const metrics = this.metrics.length ? this.metrics : metricShells.map((metric) => ({
              ...metric,
              loading: true,
              band: "pending",
              direction: "pending"
            }));
            if (this.effectiveView === "executive") {
              return metrics.filter((metric) => ["m1", "m2", "m3", "m4", "m5", "m6", "m7"].includes(metric.id));
            }
            return metrics;
          },
          canSwitchViews() {
            return this.user?.role === "admin";
          },
          effectiveView() {
            return this.canSwitchViews ? this.view : "manager";
          },
          currentTitle() {
            return this.repoSummary?.repo?.full_name || "Metrics Dashboard Prototype";
          },
          currentSubtitle() {
            if (!this.repoSummary?.repo) {
              return "Run a repository to calculate live GitHub metrics.";
            }
            return "Default branch " + this.repoSummary.repo.default_branch + " · computed " + formatTime(this.repoSummary.computed_at);
          },
          selectedViewLabel() {
            return this.effectiveView === "manager" ? "Manager view" : "Executive view";
          },
          windowLabel() {
            const days = this.repoSummary?.window?.window_days || 60;
            return days + " days";
          },
          rateLimitLabel() {
            const remaining = this.repoSummary?.rateLimit?.remaining;
            const limit = this.repoSummary?.rateLimit?.limit;
            if (remaining === null || remaining === undefined) {
              return "Rate limit pending";
            }
            return "GitHub " + remaining + (limit ? "/" + limit : "") + " left";
          },
          lowRateLimit() {
            const remaining = this.repoSummary?.rateLimit?.remaining;
            return Number.isFinite(remaining) && remaining < 500;
          },
        },
        methods: {
          async login() {
            this.error = "";
            this.loading = true;

            try {
              const response = await fetch("/api/login", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  username: this.username,
                  password: this.password,
                }),
              });

              const body = await response.json();
              if (!response.ok) {
                throw new Error(body.message || "Invalid username or password");
              }

              this.user = body.user;
              if (!this.canSwitchViews) {
                this.view = "manager";
              }
              this.password = "";
              await this.loadRepoMetrics();
            } catch (error) {
              this.error = error.message;
            } finally {
              this.loading = false;
            }
          },
          async loadRepoMetrics() {
            this.repoError = "";
            this.repoLoading = true;
            this.metrics = metricShells.map((metric) => ({
              ...metric,
              loading: true,
              band: "pending",
              direction: "pending"
            }));

            try {
              const url = new URL("/api/metrics/summary", window.location.origin);
              url.searchParams.set("repo", this.repoAddress);
              url.searchParams.set("include_prior_window", "true");
              const response = await fetch(url);
              const body = await response.json();
              if (!response.ok) {
                throw new Error(body.message || "Could not load repository metrics");
              }

              this.repoSummary = body;
              this.metrics = (body.metrics || []).map((metric) => ({ ...metric, loading: false }));
              this.limitations = body.limitations || fallbackLimitations;
              if (body.repo?.html_url) {
                this.repoAddress = body.repo.html_url;
              }
            } catch (error) {
              this.repoError = error.message;
            } finally {
              this.repoLoading = false;
            }
          },
          loadDefaultRepo() {
            this.repoAddress = defaultRepoAddress;
            this.loadRepoMetrics();
          },
          logout() {
            this.error = "";
            this.loading = false;
            this.password = "";
            this.repoAddress = defaultRepoAddress;
            this.repoError = "";
            this.repoLoading = false;
            this.repoSummary = null;
            this.metrics = [];
            this.modal = null;
            this.user = null;
            this.username = "";
          },
          metricRef(metric) {
            return String(metric.id || "").toUpperCase();
          },
          metricValue(metric) {
            if (metric.headline?.value !== undefined) {
              return formatMetricNumber(metric.headline.value, metric.headline.unit);
            }
            if (metric.headline?.value_hours !== undefined) {
              return formatMetricNumber(metric.headline.value_hours, "hours");
            }
            if (metric.headline?.value_pct !== undefined) {
              return formatMetricNumber(metric.headline.value_pct, "percent");
            }
            if (metric.headline?.large_change_share_pct !== undefined) {
              return formatMetricNumber(metric.headline.large_change_share_pct, "percent");
            }
            if (metric.headline?.p50 !== undefined) {
              return formatMetricNumber(metric.headline.p50, metric.headline.unit);
            }
            if (metric.headline?.p50_hours !== undefined) {
              return formatMetricNumber(metric.headline.p50_hours, "hours");
            }
            if (metric.headline?.time_to_green_p50_seconds !== undefined) {
              return formatMetricNumber(metric.headline.time_to_green_p50_seconds, "seconds");
            }
            if (metric.headline?.first_attempt_pass_rate_pct !== undefined) {
              return formatMetricNumber(metric.headline.first_attempt_pass_rate_pct, "percent");
            }
            return "Pending";
          },
          confidenceLabel(metric) {
            if (metric.loading) {
              return "Loading";
            }
            if (metric.data_confidence === null || metric.data_confidence === undefined) {
              return "Confidence pending";
            }
            return Math.round(metric.data_confidence * 100) + "% confidence";
          },
          directionLabel(metric) {
            return displayLabel(metric.direction || "pending");
          },
          directionClass(metric) {
            const direction = metric.direction || "pending";
            return direction === "not_computed" || direction === "insufficient_data" ? "pending" : direction;
          },
          bandLabel(band) {
            return displayLabel(band || "pending");
          },
          metricNote(metric) {
            return describeNote(metric.note || metric.question || "");
          },
          metricVisual(metric) {
            const renderers = {
              m1: renderDeploymentFrequency,
              m2: renderLeadTime,
              m3: renderChangeFailureRate,
              m4: renderPrSize,
              m5: renderReviewTrips,
              m6: renderTimeToSignal,
              m7: renderCiReliability,
            };
            return (renderers[metric.id] || renderGenericVisual)(metric);
          },
          metricReport(metric) {
            return metricPlan(metric);
          },
          openDetails(metric) {
            this.modal = {
              title: this.metricRef(metric) + " - " + metric.name,
              subtitle: metric.question || "Metric details",
              items: detailItems(metric),
            };
          },
          openInfo(metric) {
            const plan = metricPlan(metric);
            this.modal = {
              title: this.metricRef(metric) + " - " + metric.name + " definition",
              subtitle: metric.question || "Definition and calculation method",
              items: [
                "Definition: " + plan.definition,
                "Calculation: " + plan.calculation,
                "What it means: " + plan.meaning,
              ],
            };
          },
          openBand(metric) {
            this.modal = {
              title: this.metricRef(metric) + " band: " + this.bandLabel(metric.band),
              subtitle: "Band definitions are directional targets, not absolute performance labels.",
              items: bandItems(metric),
            };
          },
          closeModal() {
            this.modal = null;
          },
        },
      }).mount("#app");

      function detailItems(metric) {
        const items = [
          describeNote(metric.note || metric.question || "Details pending."),
          "Status: " + displayLabel(metric.status || "ok"),
          "Direction: " + displayLabel(metric.direction || "pending"),
          "Band: " + displayLabel(metric.band || "pending"),
          "Sample: " + (metric.sample_size ?? 0),
        ];
        if (metric.confidence_note) items.push(metric.confidence_note);
        if (metric.required_checks_state === "observed_fallback") {
          items.push("Required checks: using observed Actions jobs because REQUIRED_CHECKS is not configured.");
        }
        if (Array.isArray(metric.observed_job_names) && metric.observed_job_names.length) {
          items.push("Observed Actions jobs: " + metric.observed_job_names.slice(0, 6).map(displayLabel).join(", "));
        }
        if (Array.isArray(metric.caveats)) items.push(...metric.caveats.slice(0, 4).map(describeTag));
        if (Array.isArray(metric.low_confidence_reasons)) items.push(...metric.low_confidence_reasons.slice(0, 4).map(describeTag));
        if (Array.isArray(metric.notes)) items.push(...metric.notes.slice(0, 4).map(describeTag));
        if (Array.isArray(metric.evidence_rows) && metric.evidence_rows.length) {
          items.push("Evidence rows available: " + metric.evidence_rows.length);
        }
        return [...new Set(items.filter(Boolean))];
      }

      function metricPlan(metric) {
        return metricPlans[metric.id] || {
          definition: metric.question || "Definition pending.",
          calculation: "Calculation method pending.",
          meaning: "Interpretation guidance pending."
        };
      }

      function bandItems(metric) {
        const definitions = {
          elite: "Elite: top target band for this metric.",
          high: "High: healthy but still worth watching for drift.",
          medium: "Medium: mixed signal; read the supporting trend and confidence.",
          low: "Low: needs attention or has low confidence.",
          ready: "Ready: enough data is present, but no calibrated target band exists yet.",
          pending: "Pending: the metric is still loading or lacks enough data.",
        };
        return [
          definitions[metric.band] || definitions.pending,
          "Deployment Frequency: higher deploys per week is better.",
          "Lead Time, Change Failure Rate, PR Size, Review Trips, and Time to Signal: lower is better.",
          "CI Reliability: higher first-attempt pass rate and lower rerun rate are better.",
        ];
      }

      function renderDeploymentFrequency(metric) {
        const releases = Array.isArray(metric.releases) ? metric.releases : [];
        if (releases.length) {
          const ticks = releases.slice(-16).map((release, index, rows) => {
            const x = 16 + (index * 76) / Math.max(rows.length - 1, 1);
            return '<line class="chart-point" x1="' + x + '" y1="16" x2="' + x + '" y2="48" stroke="#2f7f67" stroke-width="3"><title>' + escapeHtml(release.tag_name || release.title || "Release") + '</title></line>';
          }).join("");
          return svg(ticks, { xLabel: "Weeks", yLabel: "Releases" });
        }
        return renderGenericVisual(metric);
      }

      function renderLeadTime(metric) {
        const trend = Array.isArray(metric.trend) ? metric.trend : [];
        const p50 = trend.map((row) => row.p50_hours ?? row.p50).filter(isFiniteNumber);
        const p85 = trend.map((row) => row.p85_hours ?? row.p85).filter(isFiniteNumber);
        return svg(
          linePath(p85, "#9db7cc", 2, 18, "P85") +
          linePath(p50.length ? p50 : sampleValues(metric), "#2f7f67", 3, 30, "P50"),
          { xLabel: "Weeks", yLabel: "Hours" }
        );
      }

      function renderChangeFailureRate(metric) {
        const releases = Array.isArray(metric.releases) ? metric.releases : [];
        if (releases.length) {
          return svg(releases.slice(-18).map((release, index, rows) => {
            const x = 16 + (index * 76) / Math.max(rows.length - 1, 1);
            const color = release.failed ? "#a3332a" : release.signals?.length ? "#2f7f67" : "#98a2b3";
            return '<circle class="chart-point" cx="' + x + '" cy="30" r="4" fill="' + color + '"><title>' + escapeHtml((release.tag_name || "Release") + (release.failed ? ": failure signal" : ": no failure signal")) + '</title></circle>';
          }).join(""), { xLabel: "Releases", yLabel: "Failure signal" });
        }
        return renderGenericVisual(metric);
      }

      function renderPrSize(metric) {
        const p = metric.percentiles_lines || {};
        const values = [p.p50, p.p75, p.p90].filter(isFiniteNumber);
        if (!values.length) return renderGenericVisual(metric);
        const max = Math.max(...values, 1);
        const bars = values.map((value, index) => {
          const width = Math.max(8, (value / max) * 70);
          const y = 18 + index * 12;
          const label = "P" + [50, 75, 90][index];
          return '<text class="chart-tick-label" x="3" y="' + (y + 1.5) + '">' + label + '</text>' +
            '<line class="chart-bar" x1="18" y1="' + y + '" x2="' + (18 + width) + '" y2="' + y + '" stroke="#2f7f67" stroke-width="6" stroke-linecap="round"><title>' + label + ': ' + formatMetricNumber(value, "lines") + '</title></line>';
        }).join("");
        const threshold = metric.headline?.threshold_lines ? '<line x1="88" y1="12" x2="88" y2="52" stroke="#a3332a" stroke-width="2" stroke-dasharray="3 3"><title>Large change threshold: ' + formatMetricNumber(metric.headline.threshold_lines, "lines") + '</title></line>' : "";
        return svg(bars + threshold, { xLabel: "Changed lines", yLabel: "Percentile" });
      }

      function renderReviewTrips(metric) {
        const distribution = metric.distribution || {};
        const entries = ["0", "1", "2", "3+"].map((key) => Number(distribution[key] || 0));
        const max = Math.max(...entries, 1);
        return svg(entries.map((value, index) => {
          const height = Math.max(4, (value / max) * 34);
          const x = 18 + index * 18;
          const color = index >= 3 ? "#a3332a" : "#2f7f67";
          const label = ["0", "1", "2", "3+"][index];
          return '<rect class="chart-bar" x="' + x + '" y="' + (50 - height) + '" width="12" height="' + height + '" rx="2" fill="' + color + '"><title>' + label + ' round trips: ' + value + '</title></rect>' +
            '<text class="chart-tick-label" x="' + (x + 6) + '" y="56" text-anchor="middle">' + label + '</text>';
        }).join(""), { xLabel: "Review rounds", yLabel: "PRs" });
      }

      function renderTimeToSignal(metric) {
        const red = metric.headline?.time_to_red_p50_seconds;
        const green = metric.headline?.time_to_green_p50_seconds;
        const max = Math.max(Number(red) || 1, Number(green) || 1);
        const redWidth = Math.max(8, ((Number(red) || 0) / max) * 66);
        const greenWidth = Math.max(8, ((Number(green) || 0) / max) * 66);
        return svg(
          '<text class="chart-tick-label" x="3" y="22">Red</text>' +
          '<rect class="chart-bar" x="24" y="16" width="' + redWidth + '" height="10" rx="3" fill="#a3332a"><title>Median time to red: ' + formatMetricNumber(red, "seconds") + '</title></rect>' +
          '<text class="chart-tick-label" x="3" y="44">Green</text>' +
          '<rect class="chart-bar" x="24" y="38" width="' + greenWidth + '" height="10" rx="3" fill="#2f7f67"><title>Median time to green: ' + formatMetricNumber(green, "seconds") + '</title></rect>',
          { xLabel: "Minutes", yLabel: "Signal" }
        );
      }

      function renderCiReliability(metric) {
        const pass = Number(metric.headline?.first_attempt_pass_rate_pct) || 0;
        const rerun = Number(metric.headline?.rerun_rate_pct) || 0;
        const passWidth = Math.max(4, Math.min(68, pass * 0.68));
        const rerunWidth = Math.max(4, Math.min(68, rerun * 0.68));
        return svg(
          '<text class="chart-tick-label" x="3" y="22">Pass</text>' +
          '<rect class="chart-bar" x="24" y="14" width="' + passWidth + '" height="12" rx="3" fill="#2f7f67"><title>First-attempt pass rate: ' + formatMetricNumber(pass, "percent") + '</title></rect>' +
          '<text class="chart-tick-label" x="3" y="46">Rerun</text>' +
          '<rect class="chart-bar" x="24" y="38" width="' + rerunWidth + '" height="12" rx="3" fill="#d4b35f"><title>Rerun rate: ' + formatMetricNumber(rerun, "percent") + '</title></rect>',
          { xLabel: "Percent", yLabel: "CI reliability" }
        );
      }

      function renderGenericVisual(metric) {
        return svg(linePath(sampleValues(metric), "#2f7f67", 3, 30, "Value"), { xLabel: "Weeks", yLabel: "Value" });
      }

      function svg(inner, labels = {}) {
        return '<svg viewBox="0 0 100 62" preserveAspectRatio="xMidYMid meet" role="img">' +
          chartFrame(labels.xLabel || "X axis", labels.yLabel || "Y axis") +
          inner +
          '</svg>';
      }

      function chartFrame(xLabel, yLabel) {
        return '<line class="chart-axis" x1="14" y1="52" x2="94" y2="52"/>' +
          '<line class="chart-axis" x1="14" y1="10" x2="14" y2="52"/>' +
          '<line class="chart-grid" x1="14" y1="31" x2="94" y2="31"/>' +
          '<text class="chart-label" x="54" y="61" text-anchor="middle">' + escapeHtml(xLabel) + '</text>' +
          '<text class="chart-label" x="2" y="31" transform="rotate(-90 2 31)" text-anchor="middle">' + escapeHtml(yLabel) + '</text>';
      }

      function linePath(values, color, width, fallbackBase, seriesLabel) {
        const points = values.length ? values : [fallbackBase, fallbackBase - 8, fallbackBase - 3, fallbackBase - 14, fallbackBase - 10];
        const max = Math.max(...points, 1);
        const min = Math.min(...points, 0);
        const span = Math.max(max - min, 1);
        const step = 76 / Math.max(points.length - 1, 1);
        const path = points.map((value, index) => {
          const x = 16 + index * step;
          const y = 50 - ((value - min) / span) * 34;
          return (index === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
        }).join(" ");
        const circles = points.map((value, index) => {
          const x = 16 + index * step;
          const y = 50 - ((value - min) / span) * 34;
          return '<circle class="chart-point" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.6" fill="' + color + '"><title>' + escapeHtml((seriesLabel || "Value") + " week " + (index + 1) + ": " + formatMetricNumber(value, "")) + '</title></circle>';
        }).join("");
        return '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="' + width + '" vector-effect="non-scaling-stroke"/>' + circles;
      }

      function sampleValues(metric) {
        if (Array.isArray(metric.trend) && metric.trend.length) {
          return metric.trend.map((row, index) => Number(row.value ?? row.count ?? row.p50 ?? row.p90 ?? index + 1)).filter(isFiniteNumber);
        }
        return [6, 10, 8, 14, 12, 18, 15];
      }

      function isFiniteNumber(value) {
        return Number.isFinite(Number(value));
      }

      function titleCase(value) {
        return String(value || "")
          .trim()
          .replace(/[_-]+/g, " ")
          .split(/\s+/)
          .filter(Boolean)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(" ");
      }

      function displayLabel(value) {
        const key = String(value || "").trim().toLowerCase();
        const labels = {
          ci_platform: "CI Platform",
          direction_not_computed: "Direction not computed",
          format_lint_title: "Formatting or lint title",
          insufficient_coverage: "Insufficient coverage",
          insufficient_data: "Insufficient data",
          insufficient_required_check_coverage: "Insufficient required-check coverage",
          insufficient_sample: "Insufficient sample",
          low_confidence: "Low confidence",
          mechanical_label: "Mechanical label",
          minimum_magnitude_not_met: "Minimum magnitude not met",
          needs_config: "Needs configuration",
          no_releases: "No releases",
          not_computed: "Not computed",
          observed_fallback: "Observed-job fallback",
          only_excluded_paths: "Only excluded paths",
          pending_implementation: "Pending implementation",
          prior_window_not_requested: "Prior window not requested",
          push_at_uses_workflow_run_created_at: "Push time uses workflow-run creation time",
          required_checks_need_config: "Required checks need configuration",
          required_checks_observed_jobs_fallback: "Required checks use observed Actions jobs",
          some_release_windows_used_time_fallback: "Some release windows used time fallback",
          within_historical_variation: "Within historical variation"
        };
        return labels[key] || titleCase(key || value);
      }

      function describeTag(value) {
        const key = String(value || "").trim();
        return displayLabel(key) + (/[a-z0-9]+_[a-z0-9_]+/i.test(key) ? " (" + key + ")" : "");
      }

      function describeNote(value) {
        return String(value || "")
          .split(",")
          .map((part) => {
            const trimmed = part.trim();
            return /[a-z0-9]+_[a-z0-9_]+/i.test(trimmed) ? describeTag(trimmed) : trimmed;
          })
          .filter(Boolean)
          .join(", ");
      }

      function escapeHtml(value) {
        return String(value || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }

      function formatTime(value) {
        if (!value) {
          return "pending";
        }
        return new Intl.DateTimeFormat(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          month: "short",
          day: "numeric",
        }).format(new Date(value));
      }

      function formatMetricNumber(value, unit) {
        if (value === null || value === undefined || Number.isNaN(Number(value))) {
          return "Pending";
        }

        const number = Number(value);
        if (unit === "percent") {
          return Math.round(number) + "%";
        }
        if (unit === "hours") {
          return Math.round(number) + "h";
        }
        if (unit === "seconds") {
          return Math.round(number / 60) + "m";
        }
        if (unit === "lines") {
          return Math.round(number) + " lines";
        }
        return Number.isInteger(number) ? String(number) : number.toFixed(1);
      }
    </script>
  </body>
</html>`;
}

module.exports = { renderLoginPage };
