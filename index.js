const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const { XMLParser } = require("fast-xml-parser");

const app = express();
app.use(bodyParser.text({ type: "*/*" }));

// ========================
// CONFIG
// ========================
const TALLY_PORT = 9000;
const TALLY_URL = `http://localhost:${TALLY_PORT}`;

// ========================
// HELPERS
// ========================
function filterValidInventoryItems(items) {
  return items.filter(item => {
    const name = item.NAME;
    if (!name || typeof name !== "string" || name.trim() === "") return false;
    if (name === "0") return false;
    if (name.includes("&#")) return false;
    return true;
  });
}

function normalizeAddress(address) {
  if (Array.isArray(address)) return address;
  if (address) return [address];
  return [];
}

// ========================
// FETCH CUSTOMERS
// ========================
app.get("/fetch-customers/:company", async (req, res) => {
  const { company } = req.params;

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

    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(response.data);

    let customers = parsed?.ENVELOPE?.CUSTOMER || [];
    if (!Array.isArray(customers)) customers = [customers];

    const cleaned = customers.map(c => ({
      name: c.NAME || "",
      trn: c.TRNNO || "",
      group: c.GROUP || "",
      balance: c.BALANCE || "",
      address: normalizeAddress(c.ADDRESS?.ADDRESS)
    }));

    res.json({ company, customers: cleaned });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// FETCH INVENTORY
// ========================
app.get("/fetch-inventory/:company", async (req, res) => {
  const { company } = req.params;

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

    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(response.data);

    let items = parsed?.ENVELOPE?.ITEMS || [];
    if (!Array.isArray(items)) items = [items];

    const validItems = filterValidInventoryItems(items);

    res.json({ company, items: validItems });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
app.listen(3000, () => {
  console.log("🚀 Tally Node Agent running on http://localhost:3000");
});
require("./cron/cron");
