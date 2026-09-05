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
        background: #f7f8fa;
        color: #1d2433;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          linear-gradient(135deg, rgba(48, 125, 104, 0.14), transparent 34%),
          linear-gradient(315deg, rgba(194, 79, 62, 0.12), transparent 30%),
          #f7f8fa;
      }

      main {
        min-height: 100vh;
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

      h1 {
        margin: 0 0 6px;
        font-size: 28px;
        line-height: 1.15;
        letter-spacing: 0;
      }

      p {
        margin: 0 0 24px;
        color: #596274;
      }

      label {
        display: grid;
        gap: 8px;
        margin-bottom: 16px;
        color: #31394a;
        font-size: 14px;
        font-weight: 650;
      }

      input {
        width: 100%;
        min-height: 44px;
        border: 1px solid #c9d0dc;
        border-radius: 6px;
        padding: 10px 12px;
        font: inherit;
        color: #111827;
        background: #ffffff;
      }

      input:focus {
        border-color: #307d68;
        outline: 3px solid rgba(48, 125, 104, 0.18);
      }

      button {
        min-height: 44px;
        border: 0;
        border-radius: 6px;
        background: #307d68;
        color: #ffffff;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.68;
      }

      .login-panel button {
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
        padding: 18px clamp(16px, 3vw, 32px);
      }

      .top-bar {
        position: relative;
        min-height: 54px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .repo-search {
        width: min(720px, calc(100vw - 160px));
        min-width: 280px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        background: #ffffff;
        border: 1px solid #d5dbe6;
        border-radius: 8px;
        box-shadow: 0 10px 30px rgba(29, 36, 51, 0.08);
        padding: 6px;
      }

      .repo-search input {
        min-height: 40px;
        border: 0;
        border-radius: 5px;
        background: #f7f8fa;
      }

      .repo-search input:focus {
        border-color: transparent;
      }

      .repo-search button {
        width: 72px;
        min-height: 40px;
      }

      .user-label {
        position: absolute;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        display: flex;
        align-items: center;
        gap: 10px;
        color: #31394a;
        font-size: 14px;
        font-weight: 700;
      }

      .user-separator {
        width: 1px;
        height: 18px;
        background: #c9d0dc;
      }

      .logout-button {
        min-height: 32px;
        border: 1px solid #c9d0dc;
        background: #ffffff;
        color: #31394a;
        padding: 0 10px;
        font-size: 13px;
        font-weight: 700;
      }

      .logout-button:hover {
        background: #f1f3f7;
      }

      .dashboard-body {
        min-height: calc(100vh - 90px);
        display: grid;
        place-items: center;
        text-align: center;
      }

      .spinner {
        width: 42px;
        height: 42px;
        border: 4px solid #d9dee7;
        border-top-color: #307d68;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin: 0 auto 14px;
      }

      .loading-text {
        margin: 0;
        color: #596274;
        font-size: 15px;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (max-width: 640px) {
        .top-bar {
          align-items: stretch;
          flex-direction: column-reverse;
          gap: 12px;
        }

        .repo-search {
          width: 100%;
          min-width: 0;
        }

        .user-label {
          position: static;
          transform: none;
          align-self: flex-end;
        }
      }
    </style>
  </head>
  <body>
    <main id="app">
      <section v-if="user" class="dashboard" aria-live="polite">
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
            <button :disabled="repoLoading" type="submit">Go</button>
          </form>
          <div class="user-label">
            <span>{{ displayUserName }}</span>
            <span class="user-separator" aria-hidden="true"></span>
            <button class="logout-button" type="button" @click="logout">Log out</button>
          </div>
        </header>

        <section class="dashboard-body">
          <div v-if="repoLoading">
            <div class="spinner" aria-label="Loading"></div>
            <p class="loading-text">Loading past-quarter metrics...</p>
          </div>
        </section>
      </section>

      <section v-else class="login-screen">
        <form class="login-panel" @submit.prevent="login">
          <h1>DORA Metrics</h1>
          <p>Prototype access gate</p>

          <label>
            Username
            <input v-model="username" autocomplete="username" name="username" required>
          </label>

          <label>
            Password
            <input v-model="password" autocomplete="current-password" name="password" required type="password">
          </label>

          <button :disabled="loading" type="submit">{{ loading ? "Checking..." : "Log in" }}</button>
          <div class="error" role="alert">{{ error }}</div>
        </form>
      </section>
    </main>

    <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
    <script>
      const { createApp } = Vue;

      createApp({
        data() {
          return {
            error: "",
            loading: false,
            password: "",
            repoAddress: "",
            repoLoading: false,
            user: null,
            username: "",
          };
        },
        computed: {
          displayUserName() {
            if (!this.user) {
              return "";
            }

            return titleCase(this.user.username || this.user.role);
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
              this.password = "";
            } catch (error) {
              this.error = error.message;
            } finally {
              this.loading = false;
            }
          },
          loadRepoMetrics() {
            this.repoLoading = true;
          },
          logout() {
            this.error = "";
            this.loading = false;
            this.password = "";
            this.repoAddress = "";
            this.repoLoading = false;
            this.user = null;
            this.username = "";
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
    </script>
  </body>
</html>`;
}

module.exports = { renderLoginPage };
