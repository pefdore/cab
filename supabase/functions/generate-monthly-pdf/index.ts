import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsPDF } from 'https://esm.sh/jspdf@2.5.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Passage {
  id: number
  user_id: string
  patient_id: number
  date: string
  location: string
  cotation: string
  amount: number
  month_key: string
  patients?: {
    name: string
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get previous month - use France timezone (UTC+2) since data is French
    // Server is UTC, but we're in France so add 2 hours
    const now = new Date()
    const nowFrance = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    
    const currentMonth = nowFrance.getMonth() + 1  // 1-12
    const currentYear = nowFrance.getFullYear()
    
    // Calculate previous month
    let prevMonth = currentMonth - 1
    let prevYear = currentYear
    if (prevMonth < 1) {
      prevMonth = 12
      prevYear = prevYear - 1
    }
    
    const monthKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
    const monthName = `${monthNames[prevMonth - 1]} ${prevYear}`

    console.log(`Generating PDF for ${monthName} (${monthKey})`)
    console.log(`Current UTC: ${now.toISOString()}, France: ${nowFrance.toISOString()}, month: ${currentMonth}`)

    // Get all user profiles
    console.log('Fetching user profiles...')
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError)
      throw new Error(`Profiles error: ${profilesError.message}`)
    }
    
    console.log(`Found ${profiles?.length || 0} users`)

    const results = []

    for (const profile of profiles || []) {
      if (!profile.id) continue

      console.log(`Processing user: ${profile.email} (id: ${profile.id})`)

      // Get passages for this user for the previous month
      // Use proper month end calculation
      const year = parseInt(monthKey.split('-')[0])
      const month = parseInt(monthKey.split('-')[1])
      const lastDay = new Date(year, month, 0).getDate() // Last day of month
      
      const startDate = `${monthKey}-01`
      const endDate = `${monthKey}-${lastDay}`

      console.log(`Querying passages from ${startDate} to ${endDate} for user ${profile.id}`)

      const { data: passages, error: passagesError } = await supabase
        .from('passages')
        .select('*, patients(name)')
        .eq('user_id', profile.id)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })

      if (passagesError) {
        console.error('Error fetching passages:', passagesError)
        continue
      }

      console.log(`Found ${passages?.length || 0} passages`)

      if (!passages || passages.length === 0) {
        console.log(`No passages for user ${profile.email} in ${monthKey}`)
        continue
      }

      // Generate PDF using jsPDF
      const doc = new jsPDF()
      
      // Page 1: Médecin/SSR
      doc.setFillColor(240, 244, 252)
      doc.rect(0, 0, 210, 40, 'F')
      
      doc.setFontSize(24)
      doc.setTextColor(30, 41, 59)
      doc.text('HONORAIRES', 105, 20, { align: 'center' })
      
      doc.setFontSize(16)
      doc.text(monthName.toUpperCase(), 105, 32, { align: 'center' })
      
      doc.setFontSize(14)
      doc.setTextColor(99, 102, 241)
      doc.text('MÉDECIN / SSR', 15, 55)
      
      doc.setFontSize(11)
      doc.setTextColor(71, 85, 105)
      
      let y = 70
      
      // Group by cotation for Médecin/SSR
      const byCotation: Record<string, {count: number, amount: number}> = {}
      medicoSSR.forEach(p => {
        if (!byCotation[p.cotation]) byCotation[p.cotation] = {count: 0, amount: 0}
        byCotation[p.cotation].count++
        byCotation[p.cotation].amount += parseFloat(String(p.amount)) || 0
      })
      
      doc.setFillColor(249, 250, 251)
      doc.rect(15, y - 6, 180, 10, 'F')
      doc.setFontSize(10)
      doc.setTextColor(100, 116, 139)
      doc.text('Acte', 20, y)
      doc.text('Nombre', 110, y)
      doc.text('Montant', 170, y)
      
      y += 10
      doc.setTextColor(30, 41, 59)
      
      Object.entries(byCotation).forEach(([cotation, data]) => {
        doc.text(cotation, 20, y)
        doc.text(String(data.count), 110, y)
        doc.text(data.amount.toFixed(2) + ' €', 170, y)
        y += 8
      })
      
      y += 5
      doc.setDrawColor(226, 232, 240)
      doc.line(15, y, 195, y)
      y += 10
      
      doc.setFontSize(12)
      doc.setTextColor(99, 102, 241)
      doc.text('TOTAL MÉDECIN / SSR', 20, y)
      const totalMedico = medicoSSR.reduce((sum, p) => sum + (parseFloat(String(p.amount)) || 0), 0)
      doc.text(totalMedico.toFixed(2) + ' €', 170, y)
      doc.text('(' + medicoSSR.length + ' actes)', 100, y)
      
      // Page 2: EHPAD
      doc.addPage()
      doc.setFillColor(240, 244, 252)
      doc.rect(0, 0, 210, 40, 'F')
      
      doc.setFontSize(24)
      doc.setTextColor(30, 41, 59)
      doc.text('HONORAIRES', 105, 20, { align: 'center' })
      
      doc.setFontSize(16)
      doc.text(monthName.toUpperCase(), 105, 32, { align: 'center' })
      
      doc.setFontSize(14)
      doc.setTextColor(99, 102, 241)
      doc.text('EHPAD', 15, 55)
      
      y = 70
      
      // Group by location and cotation for EHPAD
      const byLocation: Record<string, Record<string, {count: number, amount: number}>> = {}
      ehpad.forEach(p => {
        if (!byLocation[p.location]) byLocation[p.location] = {}
        if (!byLocation[p.location][p.cotation]) byLocation[p.location][p.cotation] = {count: 0, amount: 0}
        byLocation[p.location][p.cotation].count++
        byLocation[p.location][p.cotation].amount += parseFloat(String(p.amount)) || 0
      })
      
      Object.entries(byLocation).forEach(([location, cotations]) => {
        doc.setFontSize(12)
        doc.setTextColor(30, 41, 59)
        doc.text(location, 20, y)
        y += 8
        
        doc.setFillColor(249, 250, 251)
        doc.rect(15, y - 6, 180, 10, 'F')
        doc.setFontSize(10)
        doc.setTextColor(100, 116, 139)
        doc.text('Acte', 20, y)
        doc.text('Nombre', 110, y)
        doc.text('Montant', 170, y)
        
        y += 10
        doc.setTextColor(30, 41, 59)
        
        Object.entries(cotations).forEach(([cotation, data]) => {
          doc.text(cotation, 20, y)
          doc.text(String(data.count), 110, y)
          doc.text(data.amount.toFixed(2) + ' €', 170, y)
          y += 8
        })
        
        y += 5
      })
      
      y += 5
      doc.setDrawColor(226, 232, 240)
      doc.line(15, y, 195, y)
      y += 10
      
      doc.setFontSize(12)
      doc.setTextColor(99, 102, 241)
      doc.text('TOTAL EHPAD', 20, y)
      const totalEhpad = ehpad.reduce((s, p) => s + (parseFloat(String(p.amount)) || 0), 0)
      doc.text(totalEhpad.toFixed(2) + ' €', 170, y)
      doc.text('(' + ehpad.length + ' actes)', 100, y)
      
      // Page 3+: Complete list
      doc.addPage()
      doc.setFillColor(240, 244, 252)
      doc.rect(0, 0, 210, 40, 'F')
      
      doc.setFontSize(24)
      doc.setTextColor(30, 41, 59)
      doc.text('LISTE DES PATIENTS', 105, 20, { align: 'center' })
      
      doc.setFontSize(16)
      doc.text(monthName.toUpperCase(), 105, 32, { align: 'center' })
      
      y = 55
      
      doc.setFillColor(249, 250, 251)
      doc.rect(15, y - 6, 180, 10, 'F')
      doc.setFontSize(9)
      doc.setTextColor(100, 116, 139)
      doc.text('Date', 20, y)
      doc.text('Patient', 50, y)
      doc.text('Lieu', 110, y)
      doc.text('Acte', 140, y)
      doc.text('Montant', 175, y)
      
      y += 10
      
      passages.forEach((p) => {
        if (y > 270) {
          doc.addPage()
          y = 30
        }
        
        doc.setTextColor(30, 41, 59)
        doc.setFontSize(9)
        doc.text(p.date || '-', 20, y)
        doc.text((p.patients?.name || 'Inconnu').substring(0, 25), 50, y)
        doc.text((p.location || '').substring(0, 12), 110, y)
        doc.text(p.cotation || '', 140, y)
        doc.text(p.amount + ' €', 175, y)
        
        y += 7
      })
      
      y += 10
      doc.setDrawColor(226, 232, 240)
      doc.line(15, y, 195, y)
      y += 10
      
      doc.setFontSize(11)
      doc.setTextColor(99, 102, 241)
      doc.text('TOTAL GÉNÉRAL', 20, y)
      const total = passages.reduce((s, p) => s + (parseFloat(String(p.amount)) || 0), 0)
      doc.text(total.toFixed(2) + ' €', 170, y)
      
      // Convert to base64
      const pdfBase64 = doc.output('datauristring')
      
      // Calculate totals
      const totalAmount = passages.reduce((sum, p) => sum + (parseFloat(String(p.amount)) || 0), 0)
      
      const pdfData = pdfBase64
      
      // Check if PDF already exists for this month
      const { data: existing } = await supabase
        .from('comptabilite')
        .select('id')
        .eq('user_id', profile.id)
        .eq('month_key', monthKey)
        .single()

      if (existing) {
        // Update existing record
        await supabase
          .from('comptabilite')
          .update({
            total_amount: totalAmount,
            total_visits: passages.length,
pdf_data: pdfData,
            generated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
      } else {
        // Insert new record
        await supabase.from('comptabilite').insert([{
          user_id: profile.id,
          month_key: monthKey,
          month_name: monthName,
          total_amount: totalAmount,
          total_visits: passages.length,
          pdf_data: pdfContent,
          generated_at: new Date().toISOString()
        }])
      }

      console.log(`PDF generated for ${profile.email}: ${passages.length} passages, ${totalAmount}€`)
      results.push({ user: profile.email, passages: passages.length, total: totalAmount })
    }

    return new Response(JSON.stringify({ 
      success: true, 
      month: monthName,
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

function generatePDFContent(passages: Passage[], monthName: string, monthKey: string): string {
  // Group by location
  const ehpadLocations = ['Lilias RdC', 'Lilas 1er étage', 'Tamaris']
  const medicoSSR = passages.filter(p => !ehpadLocations.includes(p.location))
  const ehpad = passages.filter(p => ehpadLocations.includes(p.location))

  let content = `HONORAIRES - ${monthName.toUpperCase()}\n`
  content += `=${'='.repeat(50)}\n\n`

  // Page 1: Médecin/SSR
  content += `MÉDECIN / SSR\n`
  content += `-${'-'.repeat(30)}\n`
  
  const byCotation: Record<string, {count: number, amount: number}> = {}
  medicoSSR.forEach(p => {
    if (!byCotation[p.cotation]) byCotation[p.cotation] = {count: 0, amount: 0}
    byCotation[p.cotation].count++
    byCotation[p.cotation].amount += parseFloat(String(p.amount)) || 0
  })

  Object.entries(byCotation).forEach(([cotation, data]) => {
    content += `${cotation}: ${data.count} actes = ${data.amount.toFixed(2)} €\n`
  })

  const totalMedico = medicoSSR.reduce((sum, p) => sum + (parseFloat(String(p.amount)) || 0), 0)
  content += `\nTOTAL MÉDECIN / SSR: ${totalMedico.toFixed(2)} € (${medicoSSR.length} actes)\n`

  // Page 2: EHPAD
  content += `\n${'='.repeat(50)}\n`
  content += `EHPAD\n`
  content += `-${'-'.repeat(30)}\n`

  const byLocation: Record<string, Record<string, {count: number, amount: number}>> = {}
  ehpad.forEach(p => {
    if (!byLocation[p.location]) byLocation[p.location] = {}
    if (!byLocation[p.location][p.cotation]) byLocation[p.location][p.cotation] = {count: 0, amount: 0}
    byLocation[p.location][p.cotation].count++
    byLocation[p.location][p.cotation].amount += parseFloat(String(p.amount)) || 0
  })

  Object.entries(byLocation).forEach(([location, cotations]) => {
    content += `\n${location}\n`
    Object.entries(cotations).forEach(([cotation, data]) => {
      content += `  ${cotation}: ${data.count} actes = ${data.amount.toFixed(2)} €\n`
    })
  })

  const totalEhpad = ehpad.reduce((sum, p) => sum + (parseFloat(String(p.amount)) || 0), 0)
  content += `\nTOTAL EHPAD: ${totalEhpad.toFixed(2)} € (${ehpad.length} actes)\n`

  // Page 3: Complete list
  content += `\n${'='.repeat(50)}\n`
  content += `LISTE DES PATIENTS - ${monthName}\n`
  content += `-${'-'.repeat(30)}\n\n`

  content += `Date       | Patient              | Lieu          | Acte   | Montant\n`
  content += `-${'-'.repeat(75)}\n`

  passages.forEach(p => {
    const patientName = p.patients?.name || 'Inconnu'
    const name = patientName.substring(0, 20).padEnd(20)
    const loc = p.location.substring(0, 12).padEnd(12)
    content += `${p.date} | ${name} | ${loc} | ${p.cotation} | ${p.amount} €\n`
  })

  const total = passages.reduce((sum, p) => sum + (parseFloat(String(p.amount)) || 0), 0)
  content += `-${'-'.repeat(75)}\n`
  content += `\nTOTAL GÉNÉRAL: ${total.toFixed(2)} € (${passages.length} actes)\n`

  // Return as data URI
  return `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`
}