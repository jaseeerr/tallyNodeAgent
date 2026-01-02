/**
 * Tally Inventory Fetcher
 * Company: AMANA FIRST TRADING LLC
 * Mode: CommonJS
 */

const axios = require("axios")
const xml2js = require("xml2js")

const TALLY_URL = "http://localhost:9000"
const COMPANY_NAME = "AMANA FIRST TRADING LLC"

// ----------------------------------
// XML → JSON parser
// ----------------------------------
async function parseXML(xml) {
  const parser = new xml2js.Parser({
    explicitArray: false,
    ignoreAttrs: true,
    trim: true,
  })
  return parser.parseStringPromise(xml)
}

// ----------------------------------
// Fetch Inventory (Stock Items)
// ----------------------------------
async function fetchInventory() {
  const xml = `
  <ENVELOPE>
    <HEADER>
      <TALLYREQUEST>Export</TALLYREQUEST>
      <TYPE>Collection</TYPE>
      <ID>StockItemCollection</ID>
    </HEADER>

    <BODY>
      <DESC>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${COMPANY_NAME}</SVCURRENTCOMPANY>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>

        <TDL>
          <TDLMESSAGE>
            <COLLECTION NAME="StockItemCollection">
              <TYPE>StockItem</TYPE>
              <FETCH>
                Name,
                Parent,
                BaseUnits,
                OpeningBalance,
                ClosingBalance,
                Rate
              </FETCH>
            </COLLECTION>
          </TDLMESSAGE>
        </TDL>
      </DESC>
    </BODY>
  </ENVELOPE>
  `

  try {
    const response = await axios.post(TALLY_URL, xml, {
      headers: { "Content-Type": "application/xml" },
      timeout: 10000,
    })

    const parsed = await parseXML(response.data)

    const items =
      parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.STOCKITEM || []

    const list = Array.isArray(items) ? items : [items]

    return list.map(item => ({
      name: item.NAME || "",
      category: item.PARENT || "",
      unit: item.BASEUNITS || "",
      openingBalance: item.OPENINGBALANCE || "0",
      closingBalance: item.CLOSINGBALANCE || "0",
      rate: item.RATE || "",
    }))
  } catch (err) {
    console.error("❌ Failed to fetch inventory:", err.message)
    return []
  }
}

// ----------------------------------
// Runner
// ----------------------------------
;(async () => {
  const inventory = await fetchInventory()

  console.log(`✅ Inventory fetched for ${COMPANY_NAME}`)
  console.log("Total items:", inventory.length)
  console.log(inventory)
})()

module.exports = {
  fetchInventory,
}
