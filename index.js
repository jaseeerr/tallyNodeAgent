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

    function getDistinctFields(items) {
  const uniqueFields = new Set();

  // Convert single object to array
  if (!Array.isArray(items)) {
    items = [items];
  }

  // Recursive function to collect keys
  function extractKeys(obj) {
    if (typeof obj !== "object" || obj === null) return;

    for (const key of Object.keys(obj)) {
      uniqueFields.add(key);

      // If nested object → go deeper
      if (typeof obj[key] === "object") {
        extractKeys(obj[key]);
      }
    }
  }

  // Loop through items
  for (const item of items) {
    extractKeys(item);
  }

  return Array.from(uniqueFields);
}

const fields = getDistinctFields(items)
    return res.json({
      success: true,
      fields,
      company,
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
