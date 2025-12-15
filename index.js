const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const { XMLParser } = require("fast-xml-parser");

const app = express();
app.use(bodyParser.text({ type: "*/*" })); // to handle XML bodies

// ========================
// CONFIG
// ========================
const TALLY_PORT = 9000; // example: Company A → 9000, Company B → 9001
const TALLY_URL = `http://localhost:${TALLY_PORT}`;

const CLOUD_CUSTOMER_SYNC_URL = "https://app.fancypalace.cloud/api/agent/customer-sync";





// helpers
function filterValidInventoryItems(items) {
  const cleaned = items.filter(item => {
    const name = item.NAME;

    // Reject null, undefined, empty, spaces
    if (!name || typeof name !== "string" || name.trim() === "") return false;

    // Reject numeric zero or string "0"
    if (name === 0 || name === "0") return false;

    // Reject strange Tally placeholder
    if (name.includes("&#")) return false;

    return true;
  });

  console.log(`\n🧹 Filtered Items: ${cleaned.length}/${items.length} valid items`);
  return cleaned;
}


async function sendInventoryInBatches(company, items, batchSize = 500) {
  console.log(`\n🚀 Starting batch sync: ${items.length} items (batch size: ${batchSize})`);

  let index = 0;
  let batchNumber = 1;

  while (index < items.length) {
    const batch = items.slice(index, index + batchSize);

    console.log(`📤 Sending batch ${batchNumber} (${batch.length} items)...`);

    try {
      const response = await axios.post(
        "https://app.fancypalace.cloud/api/agent/inventory-sync",
        { company, items: batch },
        { timeout: 30000 }
      );

      console.log(`✅ Batch ${batchNumber} synced successfully`);
    } catch (err) {
      console.error(`❌ Batch ${batchNumber} failed:`, err.message);
      return { ok: false, failedBatch: batchNumber, error: err.message };
    }

    index += batchSize;
    batchNumber++;
  }

  console.log("\n🎉 All batches synced successfully!");
  return { ok: true, totalSynced: items.length };
}


async function sendCustomersToCloud(companyName, customers) {
  try {
    console.log("\n==============================");
    console.log("📤 PUSHING CUSTOMERS TO CLOUD");
    console.log("==============================");
    console.log("Company:", companyName);
    console.log("Customers:", customers.length);

    // Calculate payload size
    const json = JSON.stringify({ companyName, customers });
    const mb = (Buffer.byteLength(json) / 1024 / 1024).toFixed(2);
    console.log(`📦 Payload Size: ${mb} MB`);

    // Send to cloud
    const response = await axios.post(
      CLOUD_CUSTOMER_SYNC_URL,
      { companyName, customers },
      {
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );

    console.log("✅ Cloud Sync Success:", response.data.message);

    return { ok: true, response: response.data };

  } catch (err) {
    console.log("❌ Cloud Sync Error:", err.message);

    return {
      ok: false,
      error: err.message,
      full: err.response?.data
    };
  }
}






// ========================
// 1. Switch Active Company
// ========================
app.get("/switch-company/:company", async (req, res) => {
  const { company } = req.params;
  if (!company) {
    return res.status(400).send("company query param is required");
  }

  const xml = `
  <ENVELOPE>
    <HEADER>
      <VERSION>1</VERSION>
    </HEADER>
    <BODY>
      <DESC>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${company}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </DESC>
    </BODY>
  </ENVELOPE>`;

  try {
    const response = await axios.post(TALLY_URL, xml, {
      headers: { "Content-Type": "text/xml" }
    });

    console.log("\n====== SWITCH COMPANY RESPONSE ======");
    console.log(response.data);

    res.send("Company switched successfully");
  } catch (err) {
    console.error("Error switching company:", err.message);
    res.status(500).send("Failed to switch company");
  }
});


 function getUniqueXmlFields(xmlString) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    textNodeName: "value"
  });

  let parsed;
  try {
    parsed = parser.parse(xmlString);
  } catch (err) {
    throw new Error("Invalid XML provided");
  }

  const fields = new Set();

  function traverse(node) {
    if (node === null || node === undefined) return;

    // If array → traverse each item
    if (Array.isArray(node)) {
      node.forEach(traverse);
      return;
    }

    // If object → collect keys and recurse
    if (typeof node === "object") {
      for (const key of Object.keys(node)) {
        fields.add(key);
        traverse(node[key]);
      }
    }
  }

  traverse(parsed);

  return Array.from(fields).sort();
}
// ========================
// 2. Fetch Customers
// ========================
app.get("/fetch-customers/:company", async (req, res) => {
  const { company } = req.params;

  if (!company) {
    return res.status(400).send("company query param required");
  }

  const xmlRequest = `
  <ENVELOPE>
    <HEADER>
      <VERSION>1</VERSION>
      <TALLYREQUEST>Export</TALLYREQUEST>
      <TYPE>Data</TYPE>
      <ID> CustomerData</ID>
    </HEADER>
    <BODY>
      <DESC>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${company}</SVCURRENTCOMPANY>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </DESC>
    </BODY>
  </ENVELOPE>`;

  try {
    const tallyResponse = await axios.post(TALLY_URL, xmlRequest, {
      headers: { "Content-Type": "text/xml" }
    });

    const xmlString = tallyResponse.data;

    const uniqueFields = getUniqueXmlFields(xmlString);

    console.log(uniqueFields)
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      textNodeName: "value"
    });

    let parsed;
    try {
      parsed = parser.parse(xmlString);
    } catch (err) {
      return res.status(500).json({
        error: "Failed to parse XML",
        message: err.message
      });
    }

    // ---------------------------------------------
    // ⭐ Tally structure: ENVELOPE -> CUSTOMER list
    // ---------------------------------------------
    let customers = parsed?.ENVELOPE?.CUSTOMER;

    if (!customers) {
      return res.json({
        error: "CUSTOMER nodes not found in ENVELOPE",
        structure: parsed.ENVELOPE
      });
    }

    // If only ONE customer, Tally returns object instead of array
    if (!Array.isArray(customers)) {
      customers = [customers];
    }

    // Clean & normalize (optional)
    const cleaned = customers.map(c => ({
      name: c.NAME || "",
      trn:c.TRNNO || "",
      group: c.GROUP || "",
      balance: c.BALANCE || "",
      address: Array.isArray(c.ADDRESS?.ADDRESS)
        ? c.ADDRESS.ADDRESS
        : [c.ADDRESS?.ADDRESS || ""]
    }));

    const cloudResult = await sendCustomersToCloud(company, cleaned);


    return res.json({
      success: true,
      customers,
      cloudResult,
      company,
      total: cleaned.length,
      customers: cleaned
    });

  } catch (err) {
    console.error("Error fetching customers:", err.message);
    return res.status(500).json({
      error: "Failed to fetch customers",
      message: err.message
    });
  }
});

// ========================
// 3. Fetch Inventory
// ========================

app.get("/fetch-inventory/:company", async (req, res) => {
  const { company } = req.params;

  console.log("\n==============================");
  console.log("📌 FETCH INVENTORY INITIATED");
  console.log("==============================");
  console.log("Company:", company);

  if (!company) {
    return res.status(400).send("company param required");
  }

  const xmlRequest = `
  <ENVELOPE>
    <HEADER>
      <VERSION>1</VERSION>
      <TALLYREQUEST>Export</TALLYREQUEST>
      <TYPE>Data</TYPE>
      <ID> InventoryData</ID>
    </HEADER>
    <BODY>
      <DESC>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${company}</SVCURRENTCOMPANY>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </DESC>
    </BODY>
  </ENVELOPE>`;

  console.log("\n📤 Sending XML to Tally...");
  console.log("Tally URL:", TALLY_URL);

  try {
    const tallyResponse = await axios.post(TALLY_URL, xmlRequest, {
      headers: { "Content-Type": "text/xml" },
      timeout: 10000
    });

    console.log("\n📥 Response received");
    console.log("Status:", tallyResponse.status);
    console.log("Raw XML length:", tallyResponse.data?.length);

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      textNodeName: "value"
    });

    let parsed;
    try {
      parsed = parser.parse(tallyResponse.data);
      console.log("✅ XML Parsed Successfully");
    } catch (parseErr) {
      console.log("❌ XML Parse Error:", parseErr.message);
      return res.status(500).json({ error: "XML parse failed" });
    }

    // ----------------------------------------------------------
    // ⭐⭐ FIXED: Tally response places ITEMS directly in ENVELOPE
    // ----------------------------------------------------------
    const items = parsed?.ENVELOPE?.ITEMS;

    if (!items) {
      console.log("❌ ITEMS not found in ENVELOPE");
      console.log("Available keys:", Object.keys(parsed.ENVELOPE || {}));

      return res.json({
        error: "ITEMS not found at ENVELOPE level",
        structure: parsed.ENVELOPE
      });
    }

    console.log(`\n📦 TOTAL ITEMS FOUND: ${Array.isArray(items) ? items.length : 1}`);

    const payload = { company, items };

const jsonString = JSON.stringify(payload);
const bytes = Buffer.byteLength(jsonString, "utf8");
const kb = (bytes / 1024).toFixed(2);
const mb = (bytes / 1024 / 1024).toFixed(2);

console.log(`📦 Payload Size: ${bytes} bytes (${kb} KB / ${mb} MB)`);


// 🔥 Clean invalid items
const validItems = filterValidInventoryItems(items);

// 🔥 Now sync ONLY valid items
const syncResult = await sendInventoryInBatches(company, validItems);

    return res.json({
      success: true,
      company,
      syncResult,
      totalItems: Array.isArray(items) ? items.length : 1,
      items
    });

  } catch (err) {
    console.log("\n❌ Network / Tally error");
    console.log("Message:", err.message);
    return res.status(500).json({ error: err.message });
  }
});


// ========================
// START SERVER
// ========================
app.listen(3000, () => {
  console.log("Tally Node Agent running on http://localhost:3000");
});
