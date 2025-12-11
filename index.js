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
    console.log("❌ ERROR: No company provided");
    return res.status(400).send("company param required");
  }

  // -------------------------
  // 1. Build XML request
  // -------------------------
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
  console.log("Request XML length:", xmlRequest.length);

  try {
    // -------------------------
    // 2. Send request to Tally
    // -------------------------
    const tallyResponse = await axios.post(TALLY_URL, xmlRequest, {
      headers: { "Content-Type": "text/xml" },
      timeout: 10000
    });

    console.log("\n📥 Response received from Tally");
    console.log("HTTP Status:", tallyResponse.status);
    console.log("Raw XML Length:", tallyResponse.data?.length || 0);

    const xmlData = tallyResponse.data;

    // -------------------------
    // 3. Parse XML → JSON
    // -------------------------
    console.log("\n🔍 Parsing XML...");

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      textNodeName: "value",
      removeNSPrefix: true
    });

    let parsed;
    try {
      parsed = parser.parse(xmlData);
      console.log("✅ XML Parsed Successfully");
    } catch (parseErr) {
      console.log("❌ XML Parse Error:", parseErr.message);
      return res.status(500).json({ error: "Failed to parse XML", details: parseErr.message });
    }

    console.log("\n🔎 Checking structure...");
    console.log("Keys at ENVELOPE level:", Object.keys(parsed?.ENVELOPE || {}));

    const body = parsed?.ENVELOPE?.BODY;
    if (!body) {
      console.log("❌ ERROR: BODY missing in Tally response");
      return res.json({ error: "BODY not found", parsed });
    }

    // Tally returns different structures sometimes
    const possiblePaths = [
      body?.DATA?.COLLECTION?.ITEMS,
      body?.DESC?.COLLECTION?.ITEMS,
      body?.DESC?.ITEMS,
      body?.COLLECTION?.ITEMS
    ];

    console.log("\n🔍 Checking possible item paths...");

    let items = null;

    for (let i = 0; i < possiblePaths.length; i++) {
      if (possiblePaths[i]) {
        items = possiblePaths[i];
        console.log(`✔ Items found at path #${i + 1}`);
        break;
      } else {
        console.log(`❌ Path #${i + 1} empty`);
      }
    }

    if (!items) {
      console.log("❌ No ITEMS found in any expected path.");
      return res.json({
        error: "No ITEMS found",
        structure: Object.keys(body),
        sample: parsed
      });
    }

    console.log(`\n📦 TOTAL ITEMS FOUND: ${Array.isArray(items) ? items.length : 1}`);

    return res.json({
      success: true,
      company,
      totalItems: Array.isArray(items) ? items.length : 1,
      items
    });

  } catch (err) {
    // -------------------------
    // 4. Network or Tally error
    // -------------------------
    console.log("\n❌ ERROR communicating with Tally");
    console.log("Message:", err.message);

    if (err.response) {
      console.log("Response status:", err.response.status);
      console.log("Response body length:", err.response.data?.length);
    }

    return res.status(500).json({
      error: "Failed to fetch inventory",
      message: err.message
    });
  }
});


// ========================
// START SERVER
// ========================
app.listen(3000, () => {
  console.log("Tally Node Agent running on http://localhost:3000");
});
