function hashPassword(password) {
  return Buffer.from(String(password || ""), "utf8").toString("base64");
}

function verifyPassword(password, expectedHash) {
  if (!expectedHash) {
    return false;
  }

  return hashPassword(password) === expectedHash;
}

module.exports = { hashPassword, verifyPassword };
