const axios = require("axios");
const crypto = require("crypto");

const EVENT_LOG_URL =
  "https://app.fancypalace.cloud/api/agent/event-log";

async function sendEventLog({
  company,
  module,
  action,
  status,
  stage,
  message,
  details = {}
}) {
  const payload = {
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    company,
    source: "cron",
    module,
    action,
    status,
    stage,
    message,
    details
  };

  try {
    await axios.post(EVENT_LOG_URL, payload);
  } catch (err) {
    // logging must NEVER break cron
    console.error("⚠️ Event log failed:", err.message);
  }
}

module.exports = { sendEventLog };
