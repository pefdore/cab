import { google } from 'https://esm.sh/googleapis@131.0.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SERVICE_ACCOUNT = {
  type: 'service_account',
  project_id: 'cotationcabinet',
  private_key_id: 'fa152046b78f0828008d89d8dc0e8843679f2db8',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC6In/JGqKQPB56\nhFLwT1+KRxyj5c9Q91cjShEntnsK80oWy2PdapC/LpnXAwTFh0ujsuzyTyUVaNJP\n0l3V2/o2remz3u/eCFCFfetfks1iCC27i+h9zmCOni88P3RJfgC653RRLZ04DD4q\n4V9lqsvfV61qC1koxjGYCUCVunKwSgT/MPjOBTOleFnr6aKZWSaQtaJthqW38Ybv\nsSVPg2e4YIZgwydTRkCGCjbZM0tb7bR+1H48SYNPA7iQOM9lHWEuF9oDp3YIZZZj\nab3QIEYPUSD6pE6zCyO7Z+t8IbxdpsJsmi+mkzP+AJDfqJci3HxR+OTa90mhPpRD\nLs9lumdXAgMBAAECggEAHET4FnGCphhTYrUtKY1Mi+JQAb559aiTJetuXpMy7c9U\nfdDHKo4wTLEFsWemdl+dh8+5d/W4Qp+obXIcSUo/HsXcHDLsSFMH87ZTpLDVm6F1\nXKobldvdw1tX/jT+8th9wOU9P8UHP0dwu699/yFpFFMrJdNyZ6RuTNJ+6h6mo4pf\npI39iuF7tQYif1T9a85PIkz09tHz3/iK0IpIvAS/RyaWLAeI4D/8FUjgMlqNcdEY\neC32cQ1wj6IWCrjADVX6iqJiQVZ5WrRtxW7NrT7ZeCOzBDIUFIR+7E463FGmUho8\nyJ0yTH+5HBs+I4xMAyuwS7ZN0Y+/8iyR/37up9TXeQKBgQD1UIDapi7oYOxN7Yf1\nA5lBML1eY9ydtPoGT9ltlFmnP0TWZejTnXiDtjNPdA/nNltQfKMFPXGjbNnap/Aw\ntVcoQhJ19fWRLUM+ofRx8B4W01LYfmWloPt2C23R9vPGZAmyEoKYGr0GKDVxUzwZ\nrVOYit1weIpZo+IrzBBVoXTg7wKBgQDCPhWKX8bLsskKUqBc8khkNU++geE1KhAO\nq+2mQny6fvMyTFB47pVQI8AuXMXhQ1qmIGcU/08sBkHYiXKwqZM5OkmnSquP37R4\nI+Xk2ptTibAXcNXvne9ww0aMAn99BaytuJltPs5OWV2ngfhtyKsL1q2KiFJUkXDt\niWua1daQGQKBgEctB2XpR7zmuklV/NeLJsEyag9j/BPJ+a0xJ83SeDy9b7ShNu+H\nRfs5NyP7cc3NCKuOriIMFNes8nyts1P+mX41xXNyXMC1mEgo52rTl3dZ8zSbX9Sx\no6Q5ZrC/7TUHu4RuOHP3dha+PdtWoh51Gscsq1lBsCqYETxR5f9ibC4DAoGBAJLY\n8Nv98ILLFSYStV3PZV8s1q7F7gaNWDpfTHknRriPhTh/bU8fwA4oGQBz7r2QeBWj\n5YqAQdCcomcb8nMQoFbhdBFfaDiK/RreuMy9YDRVoaT3DyXqFrz/RHRQ5yUThyqG\npqdqlfmxohYjMjd9P6Lhl61lxihdFCzgeVNDWsTxAoGBAO/z91hc9RkrBOPOUO9u\nH49q8lYGNqx7M14O6FKZ+bBasFqDoV4h4TFh/SurYDgGiIFHILrATdiggtVBmLrt\nmi+nwJqBNgD6z23Mca7pS4tMQlJ3o8krByr0W2HJZ06WHywZ5aWspyjTXrEst6C2\nUIr+XFfFlZIrt5NCIDf7J+md\n-----END PRIVATE KEY-----\n',
  client_email: 'cotation-sheet@cotationcabinet.iam.gserviceaccount.com',
  client_id: '113441876164350645994'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const spreadsheetId = '1In5C8uZMceL3h0HoCd4ovWAczgIFihnig2HTlvP29U'

    const auth = new google.auth.JWT(
      SERVICE_ACCOUNT.client_email,
      undefined,
      SERVICE_ACCOUNT.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    )

    const sheets = google.sheets({ version: 'v4', auth })

    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId })
    
    const sheetNames = (spreadsheet.data.sheets || []).map((s: any) => s.properties?.title)
    
    console.log('Available sheets:', sheetNames)

    return new Response(JSON.stringify({ 
      success: true, 
      spreadsheetId,
      sheets: sheetNames
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error:', error.message)
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})