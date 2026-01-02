const axios = require("axios")
const xml2js = require("xml2js")

const TALLY_URL = "http://localhost:9000"

async function getActiveCompany() {
  const xml = `
  <ENVELOPE>
    <HEADER>
      <TALLYREQUEST>Export</TALLYREQUEST>
    </HEADER>
    <BODY>
      <DESC>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY/>
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
      parsed?.ENVELOPE?.BODY?.DESC?.STATICVARIABLES?.SVCURRENTCOMPANY

    return company || null
  } catch (err) {
    console.error("❌ Tally error:", err.message)
    return null
  }
}

// test
;(async () => {
  const company = await getActiveCompany()
  console.log("✅ Active Company:", company)
})()

module.exports = { getActiveCompany }
