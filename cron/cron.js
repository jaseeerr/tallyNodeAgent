const cron = require("node-cron");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { createHash } = require("./utils");
const { sendEventLog } = require("../logger/eventLogger");

const BASE_URL = "http://localhost:3000";
const HASH_FILE = path.join(__dirname, "hashStore.json");

const CLOUD = {
  customers: "https://app.fancypalace.cloud/api/agent/customer-sync",
  inventory: "https://app.fancypalace.cloud/api/agent/inventory-sync"
};

const COMPANIES = [
  "AMANA-FIRST-TRADING-LLC",
  "FANCY-PALACE-TRADING-LLC"
];

// ----------------------
async function loadHashes() {
  return fs.readJSON(HASH_FILE);
}

async function saveHashes(h) {
  await fs.writeJSON(HASH_FILE, h, { spaces: 2 });
}

// ----------------------
async function sendInventoryInBatches(company, items, batchSize = 500) {
  let index = 0;
  while (index < items.length) {
    const batch = items.slice(index, index + batchSize);
    await axios.post(CLOUD.inventory, { company, items: batch });
    index += batchSize;
  }
}

// ----------------------
async function syncCustomers(company) {
  const start = Date.now();

  try {
    // ---------------- FETCH
    const res = await axios.get(
      `${BASE_URL}/fetch-customers/${encodeURIComponent(company)}`
    );

    const customers = res.data.customers;

    // ✅ FETCH SUCCESS LOG
    await sendEventLog({
      company,
      module: "customers",
      action: "fetch",
      status: "success",
      stage: "response",
      message: "Fetched customers successfully",
      details: {
        count: customers.length,
        durationMs: Date.now() - start
      }
    });

    // ---------------- HASH CHECK
    const hashes = await loadHashes();
    const newHash = createHash(customers);
    const oldHash = hashes[company].customers;

    if (newHash === oldHash) {
      return; // nothing changed
    }

    // 🔁 SYNC START LOG
    await sendEventLog({
      company,
      module: "customers",
      action: "sync",
      status: "success",
      stage: "hash",
      message: "Customer data changed, syncing started"
    });

    // ---------------- SYNC
    await axios.post(CLOUD.customers, {
      companyName: company,
      customers
    });

    // ✅ SYNC SUCCESS LOG
    await sendEventLog({
      company,
      module: "customers",
      action: "sync",
      status: "success",
      stage: "sync",
      message: "Customers synced successfully",
      details: { count: customers.length }
    });

    hashes[company].customers = newHash;
    await saveHashes(hashes);

  } catch (err) {
    // ❌ ERROR LOG
    await sendEventLog({
      company,
      module: "customers",
      action: "fetch",
      status: "error",
      stage: "error",
      message: "Customer fetch or sync failed",
      details: {
        error: err.message
      }
    });
  }
}


// ----------------------
async function syncInventory(company) {
  try {
    // ---------------- FETCH
    const res = await axios.get(
      `${BASE_URL}/fetch-inventory/${encodeURIComponent(company)}`
    );

    const items = res.data.items;

    // ✅ FETCH SUCCESS LOG
    await sendEventLog({
      company,
      module: "inventory",
      action: "fetch",
      status: "success",
      stage: "response",
      message: "Fetched inventory successfully",
      details: { count: items.length }
    });

    // ---------------- HASH CHECK
    const hashes = await loadHashes();
    const newHash = createHash(items);
    const oldHash = hashes[company].inventory;

    if (newHash === oldHash) {
      return;
    }

    // 🔁 SYNC START LOG
    await sendEventLog({
      company,
      module: "inventory",
      action: "sync",
      status: "success",
      stage: "hash",
      message: "Inventory changed, syncing started"
    });

    // ---------------- SYNC (BATCHED)
    await sendInventoryInBatches(company, items);

    // ✅ SYNC SUCCESS LOG
    await sendEventLog({
      company,
      module: "inventory",
      action: "sync",
      status: "success",
      stage: "sync",
      message: "Inventory synced successfully",
      details: { count: items.length }
    });

    hashes[company].inventory = newHash;
    await saveHashes(hashes);

  } catch (err) {
    // ❌ ERROR LOG
    await sendEventLog({
      company,
      module: "inventory",
      action: "fetch",
      status: "error",
      stage: "error",
      message: "Inventory fetch or sync failed",
      details: {
        error: err.message
      }
    });
  }
}


// ----------------------
cron.schedule("*/1 * * * *", async () => {
  console.log("\n⏰ CRON RUN");

  for (const company of COMPANIES) {
    try {
      await syncCustomers(company);
      await syncInventory(company);
    } catch (err) {
      console.error(`❌ ${company} error:`, err.message);
      console.log(err)
    }
  }
});

console.log("🕒 Cron running every 2 minutes");
