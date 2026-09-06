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

      .metric-card.loading {
        position: relative;
      }

      .metric-card h3 {
        margin: 0 0 4px;
        font-size: 17px;
        line-height: 1.25;
        letter-spacing: 0;
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
        min-height: 62px;
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
        height: 62px;
        display: block;
      }

      .metric-footer {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
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

        .metric-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 640px) {
        .repo-search {
          grid-template-columns: 1fr;
        }

        .metric-grid {
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

          <section v-else class="metric-grid" aria-live="polite">
            <article v-for="metric in visibleMetrics" :key="metric.id" class="metric-card" :class="{ loading: metric.loading }">
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
                <div class="metric-visual" aria-hidden="true" v-html="metricVisual(metric)"></div>
                <p class="muted">{{ metric.note || metric.question }}</p>
              </div>

              <div v-if="effectiveView === 'manager'" class="manager-detail">
                <button class="details-button" :disabled="metric.loading" type="button" @click="openDetails(metric)">Details</button>
                <span>Sample: {{ metric.sample_size ?? 0 }}</span>
                <span>{{ metric.detail || 'Evidence rows will appear here as each metric engine lands.' }}</span>
              </div>
              <div v-else class="metric-footer">
                <div>
                  <strong>Band</strong>
                  <button class="band-button" type="button" @click="openBand(metric)">
                    <span class="chip" :class="metric.band">{{ bandLabel(metric.band) }}</span>
                  </button>
                </div>
                <div>
                  <strong>Metric</strong>
                  <span>{{ metricRef(metric) }}</span>
                </div>
                <div>
                  <strong>Details</strong>
                  <button class="details-button" :disabled="metric.loading" type="button" @click="openDetails(metric)">Open</button>
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
        "Direction is omitted until explicitly computed and until the sample clears the noise gates.",
        "Required-check metrics need a configured required-check list; public repo access alone does not reveal which Actions jobs block merge."
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
            const days = this.repoSummary?.window?.window_days || 30;
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
            return titleCase(metric.direction || "pending").replace(/_/g, " ");
          },
          directionClass(metric) {
            const direction = metric.direction || "pending";
            return direction === "not_computed" || direction === "insufficient_data" ? "pending" : direction;
          },
          bandLabel(band) {
            return titleCase(band || "pending");
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
          openDetails(metric) {
            this.modal = {
              title: this.metricRef(metric) + " - " + metric.name,
              subtitle: metric.question || "Metric detail",
              items: detailItems(metric),
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
          metric.note || metric.question || "Details pending.",
          "Status: " + titleCase(metric.status || "ok").replace(/_/g, " "),
          "Direction: " + titleCase(metric.direction || "pending").replace(/_/g, " "),
          "Band: " + titleCase(metric.band || "pending"),
          "Sample: " + (metric.sample_size ?? 0),
        ];
        if (metric.confidence_note) items.push(metric.confidence_note);
        if (Array.isArray(metric.caveats)) items.push(...metric.caveats.slice(0, 4));
        if (Array.isArray(metric.low_confidence_reasons)) items.push(...metric.low_confidence_reasons.slice(0, 4));
        if (Array.isArray(metric.notes)) items.push(...metric.notes.slice(0, 4));
        if (Array.isArray(metric.evidence_rows) && metric.evidence_rows.length) {
          items.push("Evidence rows available: " + metric.evidence_rows.length);
        }
        return [...new Set(items.filter(Boolean))];
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
            const x = 8 + (index * 84) / Math.max(rows.length - 1, 1);
            return '<line x1="' + x + '" y1="14" x2="' + x + '" y2="48" stroke="#2f7f67" stroke-width="3"/>';
          }).join("");
          return svg(ticks + '<line x1="6" y1="48" x2="94" y2="48" stroke="#cbd5e1" stroke-width="2"/>');
        }
        return renderGenericVisual(metric);
      }

      function renderLeadTime(metric) {
        const trend = Array.isArray(metric.trend) ? metric.trend : [];
        const p50 = trend.map((row) => row.p50_hours ?? row.p50).filter(isFiniteNumber);
        const p85 = trend.map((row) => row.p85_hours ?? row.p85).filter(isFiniteNumber);
        return svg(
          linePath(p85, "#9db7cc", 2, 18) +
          linePath(p50.length ? p50 : sampleValues(metric), "#2f7f67", 3, 30)
        );
      }

      function renderChangeFailureRate(metric) {
        const releases = Array.isArray(metric.releases) ? metric.releases : [];
        if (releases.length) {
          return svg(releases.slice(-18).map((release, index, rows) => {
            const x = 6 + (index * 88) / Math.max(rows.length - 1, 1);
            const color = release.failed ? "#a3332a" : release.signals?.length ? "#2f7f67" : "#98a2b3";
            return '<circle cx="' + x + '" cy="30" r="4" fill="' + color + '"/>';
          }).join(""));
        }
        return renderGenericVisual(metric);
      }

      function renderPrSize(metric) {
        const p = metric.percentiles_lines || {};
        const values = [p.p50, p.p75, p.p90].filter(isFiniteNumber);
        if (!values.length) return renderGenericVisual(metric);
        const max = Math.max(...values, 1);
        const bars = values.map((value, index) => {
          const width = Math.max(8, (value / max) * 76);
          const y = 14 + index * 14;
          return '<line x1="12" y1="' + y + '" x2="' + (12 + width) + '" y2="' + y + '" stroke="#2f7f67" stroke-width="6" stroke-linecap="round"/>';
        }).join("");
        const threshold = metric.headline?.threshold_lines ? '<line x1="82" y1="8" x2="82" y2="54" stroke="#a3332a" stroke-width="2" stroke-dasharray="3 3"/>' : "";
        return svg(bars + threshold);
      }

      function renderReviewTrips(metric) {
        const distribution = metric.distribution || {};
        const entries = ["0", "1", "2", "3+"].map((key) => Number(distribution[key] || 0));
        const max = Math.max(...entries, 1);
        return svg(entries.map((value, index) => {
          const height = Math.max(4, (value / max) * 42);
          const x = 14 + index * 20;
          const color = index >= 3 ? "#a3332a" : "#2f7f67";
          return '<rect x="' + x + '" y="' + (54 - height) + '" width="12" height="' + height + '" rx="2" fill="' + color + '"/>';
        }).join(""));
      }

      function renderTimeToSignal(metric) {
        const red = metric.headline?.time_to_red_p50_seconds;
        const green = metric.headline?.time_to_green_p50_seconds;
        const max = Math.max(Number(red) || 1, Number(green) || 1);
        const redWidth = Math.max(8, ((Number(red) || 0) / max) * 72);
        const greenWidth = Math.max(8, ((Number(green) || 0) / max) * 72);
        return svg(
          '<rect x="12" y="16" width="' + redWidth + '" height="10" rx="3" fill="#a3332a"/>' +
          '<rect x="12" y="38" width="' + greenWidth + '" height="10" rx="3" fill="#2f7f67"/>'
        );
      }

      function renderCiReliability(metric) {
        const pass = Number(metric.headline?.first_attempt_pass_rate_pct) || 0;
        const rerun = Number(metric.headline?.rerun_rate_pct) || 0;
        const passWidth = Math.max(4, Math.min(88, pass * 0.88));
        const rerunWidth = Math.max(4, Math.min(88, rerun * 0.88));
        return svg(
          '<rect x="8" y="14" width="' + passWidth + '" height="12" rx="3" fill="#2f7f67"/>' +
          '<rect x="8" y="38" width="' + rerunWidth + '" height="12" rx="3" fill="#d4b35f"/>'
        );
      }

      function renderGenericVisual(metric) {
        return svg(linePath(sampleValues(metric), "#2f7f67", 3, 30));
      }

      function svg(inner) {
        return '<svg viewBox="0 0 100 62" preserveAspectRatio="none">' + inner + '</svg>';
      }

      function linePath(values, color, width, fallbackBase) {
        const points = values.length ? values : [fallbackBase, fallbackBase - 8, fallbackBase - 3, fallbackBase - 14, fallbackBase - 10];
        const max = Math.max(...points, 1);
        const min = Math.min(...points, 0);
        const span = Math.max(max - min, 1);
        const step = 88 / Math.max(points.length - 1, 1);
        const path = points.map((value, index) => {
          const x = 6 + index * step;
          const y = 52 - ((value - min) / span) * 40;
          return (index === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
        }).join(" ");
        return '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="' + width + '" vector-effect="non-scaling-stroke"/>';
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
          .split(/\s+/)
          .filter(Boolean)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(" ");
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
        return Number.isInteger(number) ? String(number) : number.toFixed(1);
      }
    </script>
  </body>
</html>`;
}

module.exports = { renderLoginPage };
