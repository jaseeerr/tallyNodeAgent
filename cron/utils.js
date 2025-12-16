const crypto = require("crypto");

function createHash(data) {
  const normalized = JSON.stringify(data);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

module.exports = { createHash };
