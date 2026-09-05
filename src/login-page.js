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
        display: grid;
        place-items: center;
        background:
          linear-gradient(135deg, rgba(48, 125, 104, 0.14), transparent 34%),
          linear-gradient(315deg, rgba(194, 79, 62, 0.12), transparent 30%),
          #f7f8fa;
      }

      main {
        width: min(100% - 32px, 420px);
      }

      .login-panel {
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
        width: 100%;
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

      .error {
        min-height: 22px;
        margin: 14px 0 0;
        color: #a3332a;
        font-size: 14px;
      }

      .welcome {
        text-align: center;
      }
    </style>
  </head>
  <body>
    <main id="app">
      <section v-if="user" class="login-panel welcome" aria-live="polite">
        <h1>Hi {{ user.username }}</h1>
      </section>

      <form v-else class="login-panel" @submit.prevent="login">
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
            user: null,
            username: "",
          };
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
        },
      }).mount("#app");
    </script>
  </body>
</html>`;
}

module.exports = { renderLoginPage };
