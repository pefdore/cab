import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsPDF } from 'https://esm.sh/jspdf@2.5.1'
import { html2pdf } from 'https://esm.sh/html2pdf.js@0.10.1'

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

const cotationPrices: Record<string, number> = {
  'G': 30.00,
  'VG': 40.00,
  'MPA': 5.00,
  'VG+MD': 40.00,
  'VG+MU': 52.60,
  'V+MU': 52.60,
  'ALQP003': 69.12,
  'ALQP006': 69.12,
  'VL': 60.00,
  'VL+MD': 70.00,
  'VG+MD+MSH': 63.00,
  'VG+MD+2IK': 41.22,
}

function getPriceForCotation(cotation: string): number {
  const key = cotation.toUpperCase().trim()
  return cotationPrices[key] || 30.00
}

const TEMPLATE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Template Honoraires</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.4; color: #000; padding: 20mm; }
        .header { text-align: center; margin-bottom: 20px; }
        .header h1 { font-size: 14pt; font-weight: bold; }
        .header p { font-size: 9pt; }
        .title { text-align: center; font-size: 16pt; font-weight: bold; margin: 15px 0; }
        .subtitle { text-align: center; font-size: 12pt; margin-bottom: 20px; }
        .section { margin-bottom: 15px; }
        .section-title { font-weight: bold; font-size: 10pt; margin-bottom: 8px; }
        .references { font-size: 8pt; margin-bottom: 15px; }
        .references p { margin-bottom: 3px; }
        .designation { font-size: 9pt; margin-bottom: 15px; }
        .designation p { margin-bottom: 3px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; }
        th { background: #eee; padding: 5px; text-align: left; font-weight: bold; }
        td { padding: 5px; border-bottom: 1px solid #ddd; }
        .total-row { font-weight: bold; background: #f5f5f5; }
        .signature { margin-top: 30px; font-size: 10pt; }
        .signature p { margin-bottom: 8px; }
        .page-break { page-break-after: always; }
        .service-title { font-weight: bold; font-size: 11pt; margin: 15px 0 5px 0; color: #333; }
        .grand-total { font-size: 12pt; font-weight: bold; margin: 20px 0; text-align: right; }
        .patient-table { font-size: 9pt; }
        .patient-table th { font-size: 9pt; }
        .patient-table td { font-size: 9pt; padding: 4px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>CENTRE HOSPITALIER SAINT JEAN</h1>
        <p>63, Faubourg de Rennes, 35130 LA GUERCHE DE BRETAGNE</p>
    </div>
    
    <div class="title">HONORAIRES MÉDICAUX</div>
    <div class="subtitle">EN SERVICES DE MÉDECINE - SSR</div>
    
    <div class="section references">
        <p><strong>RÉFÉRENCES :</strong></p>
        <p>Application de la loi 2021-502 du 26 avril 2021 (notamment l'article 19)</p>
        <p>Application des articles L 6146-2 et L 6146-41 du Code de la santé publique</p>
        <p>Les honoraires sont fixé 100% de la valeur de l'acte conventionné.</p>
        <p>Sur ces honoraires est due à l'établissement une redevance de 10% pour</p>
        <p>participation aux frais de structure, de personnel et d'équipements hospitaliers de l'établissement.</p>
    </div>
    
    <div class="section designation">
        <p><strong>DÉSIGNATION :</strong> {{doctorName}}</p>
        <p>Médecin généraliste, autorisé à exercer dans l'établissement.</p>
    </div>
    
    <div class="section">
        <p><strong>ETAT DES SOMMES DUES POUR LE MOIS DE : {{month}}</strong></p>
        <table>
            <thead>
                <tr>
                    <th>Désignation</th>
                    <th>Nombre</th>
                    <th>Prix</th>
                    <th>Montant</th>
                </tr>
            </thead>
            <tbody>
                {{tableMedecin}}
            </tbody>
        </table>
        <table>
            <tr class="total-row">
                <td>Montant total</td>
                <td></td>
                <td></td>
                <td>{{totalMedico}}</td>
            </tr>
            <tr>
                <td>Retenue 10%</td>
                <td></td>
                <td></td>
                <td>{{retention10}}</td>
            </tr>
            <tr class="total-row">
                <td>Montant à verser</td>
                <td></td>
                <td></td>
                <td>{{netAPayer}}</td>
            </tr>
        </table>
    </div>
    
    <div class="signature">
        <p>Arrêt le présent mémoire à la somme de : {{montantEnLettres}} €</p>
        <p>La Guerche de Bretagne, le {{date}}</p>
        <p>{{doctorNameShort}}</p>
    </div>
    
    <div class="page-break"></div>
    
    <div class="header">
        <h1>CENTRE HOSPITALIER SAINT JEAN</h1>
        <p>63, Faubourg de Rennes, 35130 LA GUERCHE DE BRETAGNE</p>
    </div>
    
    <div class="title">HONORAIRES MÉDICAUX</div>
    <div class="subtitle">EN SERVICES DE MÉDECINE - SSR</div>
    
    <div class="section references">
        <p><strong>RÉFÉRENCES :</strong></p>
        <p>contrat pluriannuel d'Objectif et de Moyens signés le 29 juin 2020</p>
        <p>Articles L 313-11, L 313-12, L313-12-2 du Code de l'Action Sociale et des Familles</p>
    </div>
    
    <div class="section designation">
        <p><strong>DÉSIGNATION :</strong> {{doctorName}}</p>
        <p>Médecin généraliste, autorisé à exercer dans l'établissement.</p>
    </div>
    
    <div class="section">
        <p><strong>ETAT DES SOMMES DUES POUR LE MOIS DE : {{month}}</strong></p>
        {{tableEHPAD}}
        <div class="grand-total">MONTANT TOTAL : {{totalEhpad}} €</div>
    </div>
    
    <div class="signature">
        <p>Arrêt le présent mémoire à la somme de : {{montantEhpadEnLettres}} €</p>
        <p>La Guerche de Bretagne, le {{date}}</p>
        <p>{{doctorNameShort}}</p>
    </div>
    
    <div class="page-break"></div>
    
    <div class="header">
        <h1>CENTRE HOSPITALIER SAINT JEAN</h1>
        <p>63, Faubourg de Rennes, 35130 LA GUERCHE DE BRETAGNE</p>
    </div>
    
    <div class="section">
        <p><strong>DÉTAIL DES ACTES - {{month}}</strong></p>
        <table class="patient-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Medecin</th>
                    <th>Nom Patient</th>
                    <th>Lieu</th>
                    <th>Cotation</th>
                </tr>
            </thead>
            <tbody>
                {{patientList}}
            </tbody>
        </table>
    </div>
</body>
</html>`

function numberToLetters(n: number): string {
  const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
  const parts = []
  const euros = Math.floor(n)
  const cents = Math.round((n - euros) * 100)
  if (euros === 0 && cents === 0) return 'zéro euro'
  if (euros > 0) {
    if (euros === 1) parts.push('un euro')
    else parts.push(euros + ' euros')
  }
  if (cents > 0) {
    parts.push(cents + ' centimes')
  }
  return parts.join(' et ')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const now = new Date()
    const nowFrance = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    
    const currentMonth = nowFrance.getMonth() + 1
    const currentYear = nowFrance.getFullYear()
    
    let prevMonth = currentMonth - 1
    let prevYear = currentYear
    if (prevMonth < 1) {
      prevMonth = 12
      prevYear = prevYear - 1
    }
    
    const monthKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
    const monthName = monthNames[prevMonth - 1]

    console.log(`Generating PDF for ${monthName} ${prevYear} (${monthKey})`)

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')

    const results = []

    for (const profile of profiles || []) {
      if (!profile.id) continue

      const year = parseInt(monthKey.split('-')[0])
      const month = parseInt(monthKey.split('-')[1])
      const lastDay = new Date(year, month, 0).getDate()
      
      const startDate = `${monthKey}-01`
      const endDate = `${monthKey}-${lastDay}`

      const { data: passages } = await supabase
        .from('passages')
        .select('*, patients(name)')
        .eq('user_id', profile.id)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })

      if (!passages || passages.length === 0) continue

      const ehpadLocations = ['Lilias RdC', 'Lilas 1er étage', 'Tamaris', 'Availles', 'Lilas Rdc', 'Lilas 1er']
      const medicoSSR = passages.filter((p: Passage) => !ehpadLocations.includes(p.location))
      const ehpad = passages.filter((p: Passage) => ehpadLocations.includes(p.location))

      const doctorName = profile.first_name && profile.last_name 
        ? `Docteur ${profile.last_name} ${profile.first_name}` 
        : `Docteur ${profile.email.split('@')[0]}`
      const doctorNameShort = profile.last_name || profile.email.split('@')[0]
      
      const totalMedico = medicoSSR.reduce((sum, p) => sum + (parseFloat(String(p.amount)) || 0), 0)
      const totalEhpad = ehpad.reduce((sum, p) => sum + (parseFloat(String(p.amount)) || 0), 0)
      const totalGeneral = totalMedico + totalEhpad
      const retention10 = totalGeneral * 0.10
      const netAPayer = totalGeneral - retention10

      const day = String(now.getDate()).padStart(2, '0')
      const monthToday = monthNames[now.getMonth()]
      const dateStr = `${day} ${monthToday} ${now.getFullYear()}`

      // Build tableMedecin
      const byCotation: Record<string, {count: number, amount: number}> = {}
      medicoSSR.forEach(p => {
        const cot = p.cotation || 'G'
        if (!byCotation[cot]) byCotation[cot] = {count: 0, amount: 0}
        byCotation[cot].count++
        byCotation[cot].amount += parseFloat(String(p.amount)) || 0
      })
      
      let tableMedecin = ''
      Object.entries(byCotation).sort().forEach(([cotation, data]) => {
        const price = getPriceForCotation(cotation)
        tableMedecin += `<tr>
          <td>${cotation}</td>
          <td>${data.count}</td>
          <td>${price.toFixed(2)} €</td>
          <td>${Math.round(data.amount)}</td>
        </tr>`
      })

      // Build tableEHPAD
      const serviceOrder = ['Availles', 'Lilas Rdc', 'Lilas 1er étage', 'Lilas 1er', 'Tamaris']
      const ehpadServiceMap: Record<string, string> = {
        'Availles': 'Availles',
        'Lilias RdC': 'Lilas Rdc',
        'Lilas Rdc': 'Lilas Rdc',
        'Lilas 1er étage': 'Lilas 1er',
        'Lilas 1er': 'Lilas 1er',
        'Tamaris': 'Tamaris',
      }
      const cotationTypes = ['G', 'VG+MD', 'VG+MU', 'ALQP003', 'VL', 'VL+MD', 'VG+MD+MSH', 'VG+MD+2IK']
      
      let tableEHPAD = ''
      serviceOrder.forEach(serviceName => {
        const servicePassages = ehpad.filter((p: Passage) => ehpadServiceMap[p.location] === serviceName)
        if (servicePassages.length === 0) return
        
        tableEHPAD += `<div class="service-title">${serviceName}</div>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Actes</th>
              <th>Prix</th>
              <th>Montant</th>
            </tr>
          </thead>
          <tbody>`
        
        const serviceByCotation: Record<string, {count: number, amount: number}> = {}
        servicePassages.forEach(p => {
          const cot = p.cotation || 'G'
          if (!serviceByCotation[cot]) serviceByCotation[cot] = {count: 0, amount: 0}
          serviceByCotation[cot].count++
          serviceByCotation[cot].amount += parseFloat(String(p.amount)) || 0
        })
        
        cotationTypes.forEach(cot => {
          const data = serviceByCotation[cot]
          if (data && data.count > 0) {
            const price = getPriceForCotation(cot)
            tableEHPAD += `<tr>
              <td>${data.count}</td>
              <td>${cot}</td>
              <td>${price.toFixed(2)} €</td>
              <td>${Math.round(data.amount)}</td>
            </tr>`
          }
        })
        
        tableEHPAD += `</tbody></table>`
      })

      // Build patientList
      let patientList = ''
      passages.forEach((p: Passage) => {
        patientList += `<tr>
          <td>${p.date || '-'}</td>
          <td>${doctorNameShort}</td>
          <td>${(p.patients?.name || 'Inconnu').substring(0, 20)}</td>
          <td>${(p.location || '').substring(0, 12)}</td>
          <td>${p.cotation || ''}</td>
        </tr>`
      })

      // Replace placeholders
      let html = TEMPLATE_HTML
        .replace(/{{month}}/g, monthName.toUpperCase())
        .replace(/{{doctorName}}/g, doctorName)
        .replace(/{{doctorNameShort}}/g, doctorNameShort)
        .replace(/{{date}}/g, dateStr)
        .replace(/{{tableMedecin}}/g, tableMedecin)
        .replace(/{{totalMedico}}/g, Math.round(totalMedico).toString())
        .replace(/{{retention10}}/g, Math.round(retention10).toString())
        .replace(/{{netAPayer}}/g, Math.round(netAPayer).toString())
        .replace(/{{montantEnLettres}}/g, numberToLetters(netAPayer))
        .replace(/{{tableEHPAD}}/g, tableEHPAD)
        .replace(/{{totalEhpad}}/g, totalEhpad.toFixed(2))
        .replace(/{{montantEhpadEnLettres}}/g, numberToLetters(totalEhpad))
        .replace(/{{patientList}}/g, patientList)

      // Generate PDF from HTML using jsPDF
      const doc = new jsPDF()
      doc.setFont('helvetica')
      
      // Simple approach: add HTML content as text
      // This is a fallback since html2pdf might not work in Edge Functions
      // For now, we use the previous approach but with the template logic
      
      // Actually, let's just use the simple PDF generation without html2pdf
      // since it's more reliable in Edge Functions
      
      const pdfBase64 = doc.output('datauristring')
      const pdfData = pdfBase64
      
      // For now, return the HTML for preview
      // In production, you'd use a proper HTML-to-PDF service
      
      const totalAmount = passages.reduce((sum, p) => sum + (parseFloat(String(p.amount)) || 0), 0)
      
      // Store in database - use HTML as preview
      const { data: existing } = await supabase
        .from('comptabilite')
        .select('id')
        .eq('user_id', profile.id)
        .eq('month_key', monthKey)
        .single()

      const pdfContent = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`

      if (existing) {
        await supabase
          .from('comptabilite')
          .update({
            total_amount: totalAmount,
            total_visits: passages.length,
            pdf_data: pdfContent,
            generated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
      } else {
        await supabase.from('comptabilite').insert([{
          user_id: profile.id,
          month_key: monthKey,
          month_name: `${monthName} ${prevYear}`,
          total_amount: totalAmount,
          total_visits: passages.length,
          pdf_data: pdfContent,
          generated_at: new Date().toISOString()
        }])
      }

      console.log(`PDF generated for ${profile.email}: ${passages.length} passages, ${totalAmount}€`)
      results.push({ user: profile.email, passages: passages.length, total: totalAmount, preview: html })
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