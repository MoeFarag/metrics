function renderLoginPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>DORA Metrics Prototype</title>
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
        padding: 22px clamp(16px, 3vw, 32px) 36px;
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

      .metric-footer {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        font-size: 12px;
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

      .limitations {
        margin-top: 18px;
        border-top: 1px solid #d8dee8;
        padding-top: 16px;
      }

      .limitations summary {
        width: max-content;
        cursor: pointer;
        color: #303747;
        font-weight: 800;
      }

      .limitations ul {
        margin: 12px 0 0;
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

          <section v-else-if="repoLoading" class="empty-state" aria-live="polite">
            <div>
              <h2>Loading live GitHub data</h2>
              <p class="muted">Each metric is fetched separately so expensive slices do not block the whole dashboard.</p>
            </div>
          </section>

          <section v-else class="metric-grid" aria-live="polite">
            <article v-for="metric in visibleMetrics" :key="metric.id" class="metric-card">
              <div class="metric-top">
                <div>
                  <h3>{{ metric.name }}</h3>
                  <div class="muted">{{ metric.family }}<span v-if="metric.pair"> paired with {{ metric.pair.toUpperCase() }}</span></div>
                </div>
                <span class="chip" :class="metric.band">{{ metric.band }}</span>
              </div>

              <div class="headline">
                <div class="headline-value">{{ metricValue(metric) }}</div>
                <div class="status-row">
                  <span class="chip pending">{{ metric.direction }}</span>
                  <span class="chip">{{ confidenceLabel(metric) }}</span>
                </div>
                <div class="sparkline" aria-hidden="true" v-html="sparkline(metric)"></div>
                <p class="muted">{{ metric.note || metric.question }}</p>
              </div>

              <div v-if="effectiveView === 'manager'" class="manager-detail">
                <button class="details-button" type="button" @click="openDetails(metric)">Details</button>
                <span>Sample: {{ metric.sample_size ?? 0 }}</span>
                <span>{{ metric.detail || 'Evidence rows will appear here as each metric engine lands.' }}</span>
              </div>
              <div v-else class="metric-footer">
                <div>
                  <strong>Band</strong>
                  <span>{{ metric.band }}</span>
                </div>
                <div>
                  <strong>Direction</strong>
                  <span>{{ metric.direction }}</span>
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
      </section>

      <section v-else class="login-screen">
        <form class="login-panel" @submit.prevent="login">
          <h1>DORA Metrics</h1>
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

      createApp({
        data() {
          return {
            error: "",
            loading: false,
            limitations: fallbackLimitations,
            metrics: [],
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
            if (this.effectiveView === "executive") {
              return this.metrics.filter((metric) => ["m1", "m2", "m3", "m4", "m5", "m6", "m7"].includes(metric.id));
            }
            return this.metrics;
          },
          canSwitchViews() {
            return this.user?.role === "admin";
          },
          effectiveView() {
            return this.canSwitchViews ? this.view : "manager";
          },
          currentTitle() {
            return this.repoSummary?.repo?.full_name || "Metrics prototype";
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

            try {
              const url = new URL("/api/metrics/summary", window.location.origin);
              url.searchParams.set("repo", this.repoAddress);
              const response = await fetch(url);
              const body = await response.json();
              if (!response.ok) {
                throw new Error(body.message || "Could not load repository metrics");
              }

              this.repoSummary = body;
              this.metrics = body.metrics || [];
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
            this.user = null;
            this.username = "";
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
            if (metric.data_confidence === null || metric.data_confidence === undefined) {
              return "Confidence pending";
            }
            return Math.round(metric.data_confidence * 100) + "% confidence";
          },
          sparkline(metric) {
            const points = Array.isArray(metric.trend) && metric.trend.length
              ? metric.trend.map((_, index) => 38 - ((index % 5) * 7))
              : [34, 30, 32, 24, 26, 18, 20, 16];
            const step = 100 / Math.max(points.length - 1, 1);
            const path = points.map((y, index) => (index === 0 ? "M" : "L") + (index * step).toFixed(1) + " " + y).join(" ");
            return '<svg viewBox="0 0 100 44" preserveAspectRatio="none"><path d="' + path + '" fill="none" stroke="#2f7f67" stroke-width="3" vector-effect="non-scaling-stroke"/></svg>';
          },
          openDetails(metric) {
            window.alert(metric.name + "\\n" + (metric.note || metric.question || "Details pending."));
          },
        },
      }).mount("#app");

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
