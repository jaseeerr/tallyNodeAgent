const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

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
app.get("/switch-company", async (req, res) => {
  const { company } = req.query;
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
app.get("/fetch-inventory", async (req, res) => {
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

  try {
    const response = await axios.post(TALLY_URL, xml, {
      headers: { "Content-Type": "text/xml" }
    });

    console.log("\n====== INVENTORY XML ======");
    console.log(response.data);

    res.send("Fetched inventory from Tally — check console");
  } catch (err) {
    console.error("Error fetching inventory:", err.message);
    res.status(500).send("Failed to fetch inventory");
  }
});

// ========================
// START SERVER
// ========================
app.listen(3000, () => {
  console.log("Tally Node Agent running on http://localhost:3000");
});
