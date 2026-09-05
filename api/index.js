const { renderLoginPage } = require("../src/login-page");

module.exports = function handler(req, res) {
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(renderLoginPage());
};
