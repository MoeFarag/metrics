const { verifyPassword } = require("./hash-service");

function authenticate(credentials, config) {
  const username = String(credentials.username || "").trim();
  const password = String(credentials.password || "");

  if (!username || !password) {
    return null;
  }

  const account = config.roles.find((roleConfig) => roleConfig.username === username);
  if (!account || !verifyPassword(password, account.passwordHash)) {
    return null;
  }

  return {
    username: account.username,
    role: account.role,
  };
}

module.exports = { authenticate };
