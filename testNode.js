/**
 * Tally Agent – Single File (CommonJS)
 * -----------------------------------
 * - Fetch active company
 * - Ready to extend (sales, sync, polling)
 */

const axios = require("axios")
const xml2js = require("xml2js")

const TALLY_URL = "http://localhost:9000"

// ----------------------------------
// Helper: Parse XML safely
// ----------------------------------
async function parseXML(xml) {
  const parser = new xml2js.Parser({
    explicitArray: false,
    ignoreAttrs: true,
  })
  return parser.parseStringPromise(xml)
}

// ----------------------------------
// Get Active Company from Tally
// ----------------------------------
async function getActiveCompany() {
  const xml = `
  <ENVELOPE>
    <HEADER>
      <TALLYREQUEST>Export</TALLYREQUEST>
    </HEADER>
    <BODY>
      <EXPORTDATA>
        <REQUESTDESC>
          <REPORTNAME>System</REPORTNAME>
        </REQUESTDESC>
        <REQUESTDATA>
          <SYSTEM>
            <SVCURRENTCOMPANY/>
          </SYSTEM>
        </REQUESTDATA>
      </EXPORTDATA>
    </BODY>
  </ENVELOPE>
  `

  try {
    const response = await axios.post(TALLY_URL, xml, {
      headers: { "Content-Type": "application/xml" },
      timeout: 5000,
    })

    const parsed = await parseXML(response.data)

    const activeCompany =
      parsed?.ENVELOPE?.BODY?.DATA?.SYSTEM?.SVCURRENTCOMPANY

    return activeCompany || null
  } catch (err) {
    console.error("❌ Failed to get active company:", err.message)
    return null
  }
}

// ----------------------------------
// Runner (temporary test)
// ----------------------------------
;(async () => {
  const company = await getActiveCompany()

  if (!company) {
    console.log("⚠️ No active company detected")
  } else {
    console.log("✅ Active Company:", company)
  }
})()

// ----------------------------------
// Exports (for later use)
// ----------------------------------
module.exports = {
  getActiveCompany,
}
