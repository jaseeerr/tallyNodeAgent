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






// helper sender
async function sendToCloudInventorySync(company, items) {
  console.log("\n==============================");
  console.log("📤 PUSHING INVENTORY TO CLOUD");
  console.log("==============================");
  console.log("Company:", company);

  try {
    // Transform Tally fields → Backend fields
    const cleanedItems = items.map((item) => ({
      itemName: item.NAME || item.itemName || "",       // (mapped in sync API)
      itemGroup: item.GROUP || item.itemGroup || "",
      unit: item.UNITS || item.unit || "",
      closingQty: item.CLOSINGQTY || item.closingQty || "",
      salesPrice: item.SALESPRICE || item.salesPrice || "",
      stdCost: item.STDCOST || item.stdCost || ""
    }));

    console.log("📦 Sending Items:", cleanedItems.length);

    const response = await axios.post(
      "https://app.fancypalace.cloud/api/inventory-sync",
      {
        company,
        items: cleanedItems
      },
      {
        timeout: 15000
      }
    );

    console.log("✅ Cloud Sync Success:", response.data);
    return response.data;

  } catch (err) {
    console.error("❌ Cloud Sync Error:", err.message);
    return { ok: false, error: err.message };
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

// ========================
// 2. Fetch Customers
// ========================
app.get("/fetch-customers", async (req, res) => {
  const { company } = req.query;
  if (!company) {
    return res.status(400).send("company query param required");
  }

  const xml = `
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
    const response = await axios.post(TALLY_URL, xml, {
      headers: { "Content-Type": "text/xml" }
    });

    console.log("\n====== CUSTOMERS XML ======");
    console.log(response.data);

    res.send("Fetched customers from Tally — check console");
  } catch (err) {
    console.error("Error fetching customers:", err.message);
    res.status(500).send("Failed to fetch customers");
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

  const syncResult = await sendToCloudInventorySync(company, items);

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
