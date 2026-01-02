
const axios = require('axios')
const xml2js = require('xml2js')
const TALLY_URL = "http://localhost:9000"

export async function getActiveCompany() {
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

  const response = await axios.post(TALLY_URL, xml, {
    headers: { "Content-Type": "application/xml" },
    timeout: 5000,
  })

  const parser = new xml2js.Parser({
    explicitArray: false,
    ignoreAttrs: true,
  })

  const parsed = await parser.parseStringPromise(response.data)

  const activeCompany =
    parsed?.ENVELOPE?.BODY?.DATA?.SYSTEM?.SVCURRENTCOMPANY

  return activeCompany || null
}
