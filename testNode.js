const axios = require("axios")
const xml2js = require("xml2js")

const TALLY_URL = "http://localhost:9000"

async function getActiveCompany() {
  const xml = `
  <ENVELOPE>
    <HEADER>
      <TALLYREQUEST>Export</TALLYREQUEST>
      <TYPE>System</TYPE>
      <ID>System</ID>
    </HEADER>
    <BODY>
      <DESC>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </DESC>
    </BODY>
  </ENVELOPE>
  `

  try {
    const response = await axios.post(TALLY_URL, xml, {
      headers: { "Content-Type": "application/xml" },
      timeout: 5000,
    })

    const parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: true,
    })

    const parsed = await parser.parseStringPromise(response.data)

    const company =
      parsed?.ENVELOPE?.HEADER?.RESPONSEHEADER?.SVCURRENTCOMPANY

    return company || null
  } catch (err) {
    console.error("❌ Failed to fetch active company:", err.message)
    return null
  }
}

// test run
;(async () => {
  const company = await getActiveCompany()
  console.log("✅ Active Company:", company)
})()

module.exports = { getActiveCompany }
