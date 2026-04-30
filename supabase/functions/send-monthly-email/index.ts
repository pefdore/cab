import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@3.2.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    console.log('RESEND_API_KEY configured:', resendApiKey ? 'YES' : 'NO')
    
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured')
    }

    const resend = new Resend(resendApiKey)
    console.log('Resend client created')
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get accounting email
    const accountingEmail = Deno.env.get('ACCOUNTING_EMAIL') || 'comptabilite@hopital.fr'
    console.log('ACCOUNTING_EMAIL:', accountingEmail)

    // Get previous month - use France timezone (UTC+2)
    const now = new Date()
    const nowFrance = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    
    const currentMonth = nowFrance.getMonth() + 1
    const currentYear = nowFrance.getFullYear()
    
    let prevMonth = currentMonth - 1
    let prevYear = currentYear
    if (prevMonth < 1) { prevMonth = 12; prevYear = prevYear - 1 }
    
    const monthKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`

    console.log(`Sending emails for ${monthKey} (current: ${currentMonth}/${currentYear})`)

    // Get PDFs - no join needed
    console.log('Querying comptabilite for month:', monthKey)
    
    const { data: pdfs, error: pdfsError } = await supabase
      .from('comptabilite')
      .select('*')
      .eq('month_key', monthKey)

    console.log('PDFs query result:', pdfsError ? 'ERROR: ' + pdfsError.message : `Found ${pdfs?.length || 0} PDFs`)

    if (!pdfs || pdfs.length === 0) {
      console.log('No PDFs found for sending')
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No PDFs to send' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get user emails from profiles
    const userIds = [...new Set(pdfs.map(p => p.user_id))]
    console.log('User IDs:', userIds)
    
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .in('id', userIds)

    // Create a map for easy lookup
    const profileMap = new Map()
    profiles?.forEach(p => profileMap.set(p.id, p))

    const results = []

    for (const pdf of pdfs) {
      const profile = profileMap.get(pdf.user_id)
      const userEmail = profile?.email
      const userName = profile?.first_name || 'Docteur'
      const userLastName = profile?.last_name || ''
      
      if (!userEmail) continue

      // Extract content from data URI
      let attachmentContent = ''
      if (pdf.pdf_data && pdf.pdf_data.includes(',')) {
        attachmentContent = pdf.pdf_data.split(',')[1]
      }

      // Send to physician
      const physicianResult = await resend.emails.send({
        from: 'Cotation Médecin <onboarding@resend.dev>',
        to: [userEmail],
        subject: `Honoraires ${pdf.month_name} - PDF généré`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1e40af;">Honoraires ${pdf.month_name}</h1>
            <p>Bonjour ${userName},</p>
            <p>Votre feuille d'honoraires pour <strong>${pdf.month_name}</strong> a été générée automatiquement.</p>
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Total:</strong> <span style="color: #059669; font-size: 24px;">${pdf.total_amount.toFixed(2)} €</span></p>
              <p style="margin: 5px 0;"><strong>Nombre d'actes:</strong> ${pdf.total_visits}</p>
            </div>
            <p>Vous pouvez la télécharger depuis l'application dans la section "Documents".</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #6b7280; font-size: 12px;">Cet email a été envoyé automatiquement par l'application Cotation Médecin.</p>
          </div>
        `,
        attachments: attachmentContent ? [{
          filename: `honoraires-${pdf.month_key}.txt`,
          content: attachmentContent
        }] : []
      })

      console.log(`Email sent to physician: ${userEmail}`, physicianResult)

      // Send to accounting
      if (accountingEmail && accountingEmail !== 'comptabilite@hopital.fr') {
        const accountingResult = await resend.emails.send({
          from: 'Cotation Médecin <onboarding@resend.dev>',
          to: [accountingEmail],
          subject: `Honoraires ${pdf.month_name} - ${userName} ${userLastName}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #1e40af;">Honoraires ${pdf.month_name}</h1>
              <p><strong>Médecin:</strong> ${userName} ${userLastName}</p>
              <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Total:</strong> <span style="color: #059669; font-size: 24px;">${pdf.total_amount.toFixed(2)} €</span></p>
                <p style="margin: 5px 0;"><strong>Nombre d'actes:</strong> ${pdf.total_visits}</p>
              </div>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
              <p style="color: #6b7280; font-size: 12px;">Cet email a été envoyé automatiquement par l'application Cotation Médecin.</p>
            </div>
          `,
          attachments: attachmentContent ? [{
            filename: `honoraires-${pdf.month_key}-${userLastName}.txt`,
            content: attachmentContent
          }] : []
        })

        console.log(`Email sent to accounting: ${accountingEmail}`, accountingResult)
      }

      results.push({ email: userEmail, accounting: accountingEmail, sent: true })
    }

    return new Response(JSON.stringify({ 
      success: true, 
      emailsSent: results.length,
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})