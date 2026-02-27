const cron = require("node-cron");
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { v4: uuid } = require("uuid");

// --------------------------------------------------
// CONFIG
// --------------------------------------------------
const AGENT_BASE_URL = "http://localhost:3000";
const EVENT_LOG_API = "https://app.fancypalace.cloud/api/agent/event-log";

const COMPANIES = [
  {
    tallyName: "AMANA FIRST TRADING LLC - (from 1-Jan-25)",
    externalName: "AMANA-FIRST-TRADING-LLC"
  },
  {
    tallyName: "FANCY-PALACE-TRADING-LLC - (from 1-Jan-25)",
    externalName: "FANCY PALACE TRADING LLC"
  }
];

const HASH_FILE = path.join(__dirname, "hashStore.json");

// --------------------------------------------------
// HASH STORE
// --------------------------------------------------
function loadHashes() {
  if (!fs.existsSync(HASH_FILE)) {
    fs.writeFileSync(HASH_FILE, JSON.stringify({}));
  }
  return JSON.parse(fs.readFileSync(HASH_FILE, "utf8"));
}

function saveHashes(hashes) {
  fs.writeFileSync(HASH_FILE, JSON.stringify(hashes, null, 2));
}

function createHash(data) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex");
}

// --------------------------------------------------
// EVENT LOGGER
// --------------------------------------------------
async function logEvent(payload) {
  try {
    await axios.post(EVENT_LOG_API, payload);
  } catch (err) {
    console.error("❌ Event log send failed:", err.message);
  }
}

// --------------------------------------------------
// CORE PIPELINE
// --------------------------------------------------
async function processModule(companyObj, module) {
  const { tallyName, externalName } = companyObj;
  const base = {
    company: externalName,
    source: "cron",
    module
  };

  let data;

  // ===============================
  // 1️⃣ FETCH FROM TALLY
  // ===============================
  try {
    const res = await axios.get(
      `${AGENT_BASE_URL}/fetch-${module}/${encodeURIComponent(tallyName)}`
    );

    data = res.data?.customers || res.data?.items || [];

    await logEvent({
      ...base,
      eventId: uuid(),
      timestamp: new Date(),
      action: "fetch",
      stage: "fetch",
      status: "success",
      message: `${module} fetched successfully from Tally`,
      details: {
        count: data.length
      }
    });

    if (data.length === 0) {
      await logEvent({
        ...base,
        eventId: uuid(),
        timestamp: new Date(),
        action: "fetch",
        stage: "fetch",
        status: "error",
        message: `${module} fetched successfully from Tally, fetched empty array from tally`,
        details: {
          count: 0
        }
      });
      return;
    }
  } catch (err) {
    await logEvent({
      ...base,
      eventId: uuid(),
      timestamp: new Date(),
      action: "fetch",
      stage: "fetch",
      status: "error",
      message: `Failed to fetch ${module} from Tally`,
      details: {
        error: err.message
      }
    });
    return;
  }

  // ===============================
  // 2️⃣ HASH CALCULATION
  // ===============================
  const hashes = loadHashes();
  const key = `${externalName}_${module}`;

  const oldHash = hashes[key] || null;
  const newHash = createHash(data);
  const changed = oldHash !== newHash;

  await logEvent({
    ...base,
    eventId: uuid(),
    timestamp: new Date(),
    action: "sync",
    stage: "hash",
    status: "success",
    message: `${module} hash calculated`,
    details: {
      oldHash,
      newHash,
      changed
    }
  });

  // ===============================
  // 3️⃣ HASH UNCHANGED → STOP
  // ===============================
  if (!changed) {
    await logEvent({
      ...base,
      eventId: uuid(),
      timestamp: new Date(),
      action: "sync",
      stage: "hash",
      status: "success",
      message: `${module} unchanged — sync skipped`,
      details: {
        hash: newHash
      }
    });
    return;
  }

  // ===============================
  // 4️⃣ SYNC TO EXTERNAL APP
  // ===============================
  try {
    const syncUrl =
      module === "customers"
        ? "https://app.fancypalace.cloud/api/agent/customer-sync"
        : "https://app.fancypalace.cloud/api/agent/inventory-sync";

    await axios.post(syncUrl, {
      company: externalName,
      [module]: data
    });

    hashes[key] = newHash;
    saveHashes(hashes);

    await logEvent({
      ...base,
      eventId: uuid(),
      timestamp: new Date(),
      action: "sync",
      stage: "sync",
      status: "success",
      message: `${module} synced successfully to external app`,
      details: {
        count: data.length
      }
    });
  } catch (err) {
    await logEvent({
      ...base,
      eventId: uuid(),
      timestamp: new Date(),
      action: "sync",
      stage: "sync",
      status: "error",
      message: `Failed to sync ${module} to external app`,
      details: {
        error: err.response?.data || err.message
      }
    });
  }
}

// --------------------------------------------------
// CRON SCHEDULER
// --------------------------------------------------
cron.schedule("*/2 * * * *", async () => {
  console.log("⏰ Cron started:", new Date().toISOString());

  for (const companyObj of COMPANIES) {
    await processModule(companyObj, "customers");
    await processModule(companyObj, "inventory");
  }

  console.log("✅ Cron finished:", new Date().toISOString());
});

// --------------------------------------------------
// INIT (called from index.js)
// --------------------------------------------------
module.exports = () => {
  console.log("🕒 Cron job initialized");
};
