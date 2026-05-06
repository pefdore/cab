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
    <title>Honoraires - {{month}} {{year}}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { size: A4; margin: 0; }
        body { font-family: 'Arial', sans-serif; font-size: 10pt; line-height: 1.4; color: #000; background: #fff; }
        .page { width: 210mm; min-height: 297mm; padding: 15mm 20mm; position: relative; page-break-after: always; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #000; }
        .logo-section { display: flex; align-items: center; gap: 15px; }
        .logo { width: 60px; height: 60px; border: 2px solid #000; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14pt; background: #f0f0f0; }
        .logo-text { font-size: 11pt; font-weight: bold; }
        .header-info { text-align: right; font-size: 9pt; }
        .title { text-align: center; font-size: 16pt; font-weight: bold; margin: 10px 0 5px 0; color: #000; text-transform: uppercase; letter-spacing: 1px; }
        .subtitle { text-align: center; font-size: 11pt; margin-bottom: 20px; color: #333; font-weight: bold; }
        .section { margin-bottom: 15px; }
        .section-title { font-weight: bold; font-size: 10pt; margin-bottom: 8px; color: #000; text-transform: uppercase; border-bottom: 1px solid #999; padding-bottom: 3px; }
        .references { font-size: 8pt; margin-bottom: 15px; padding: 8px 10px; background: #f5f5f5; border: 1px solid #ccc; }
        .references p { margin-bottom: 3px; line-height: 1.3; }
        .designation { font-size: 10pt; margin-bottom: 15px; padding: 10px; background: #fafafa; border: 1px solid #ddd; }
        .designation p { margin-bottom: 4px; line-height: 1.4; }
        .designation strong { color: #000; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; }
        th { background: #444; color: white; padding: 6px 8px; text-align: center; font-weight: bold; border: 1px solid #333; }
        td { padding: 6px 8px; border: 1px solid #ddd; text-align: center; }
        td.left { text-align: left; }
        td.right { text-align: right; font-family: 'Courier New', monospace; }
        tr:nth-child(even) { background: #f9f9f9; }
        .total-row { font-weight: bold; background: #e0e0e0 !important; border-top: 2px solid #000; }
        .total-row td { font-size: 11pt; }
        .grand-total { font-size: 13pt; font-weight: bold; margin: 15px 0; text-align: right; padding: 10px 15px; background: #e8e8e8; border: 2px solid #000; }
        .service-title { font-weight: bold; font-size: 11pt; margin: 15px 0 8px 0; color: #000; padding: 6px 10px; background: #ddd; border-left: 4px solid #000; }
        .signature { margin-top: 30px; font-size: 10pt; padding-top: 15px; border-top: 1px solid #666; }
        .signature p { margin-bottom: 8px; line-height: 1.5; }
        .signature-date { font-style: italic; color: #555; }
        .footer { position: absolute; bottom: 15mm; left: 20mm; right: 20mm; text-align: center; font-size: 8pt; color: #888; border-top: 1px solid #ccc; padding-top: 8px; }
        .patient-table { font-size: 9pt; }
        .patient-table th { font-size: 9pt; background: #555; color: white; }
        .patient-table td { font-size: 9pt; padding: 5px 6px; }
        .alert { background: #fffacd; border: 1px solid #ffd700; padding: 8px 12px; margin: 12px 0; font-size: 9pt; border-radius: 3px; }
        .alert strong { color: #b8860b; }
        .amount { font-weight: bold; color: #000; }
        .text-right { text-align: right; }
    </style>
</head>
<body>
    <div class="page">
        <div class="header">
            <div class="logo-section">
                <div class="logo">CH</div>
                <div class="logo-text">CENTRE HOSPITALIER<br>SAINT JEAN</div>
            </div>
            <div class="header-info">
                <p>63, Faubourg de Rennes<br>35130 LA GUERCHE DE BRETAGNE</p>
                <p>Tel: 02 XX XX XX XX | Fax: 02 XX XX XX XX</p>
            </div>
        </div>
        <div class="title">État des Honoraires Médicaux</div>
        <div class="subtitle">En Services de Médecine - SSR</div>
        <div class="section references">
            <p><strong>RÉFÉRENCES LÉGALES :</strong></p>
            <p>• Application de la loi 2021-502 du 26 avril 2021 (article 19)</p>
            <p>• Articles L 6146-2 et L 6146-41 du Code de la santé publique</p>
            <p>• Honoraires fixés à 100% de la valeur de l'acte conventionné</p>
            <p>• Redevance de 10% pour participation aux frais de structure</p>
        </div>
        <div class="section designation">
            <p><strong>DÉSIGNATION :</strong> {{doctorName}}</p>
            <p>Médecin généraliste, autorisé à exercer dans l'établissement.</p>
        </div>
        <div class="section">
            <p class="section-title">État des sommes dues pour le mois de : <strong>{{month}}</strong></p>
            <table>
                <thead>
                    <tr>
                        <th>Désignation</th>
                        <th class="right">Nombre</th>
                        <th class="right">Prix</th>
                        <th class="right">Montant</th>
                    </tr>
                </thead>
                <tbody>{{tableMedecin}}</tbody>
            </table>
            <table style="width: 50%; margin-left: auto;">
                <tr class="total-row"><td>Montant total</td><td class="right amount">{{totalMedico}} €</td></tr>
                <tr><td>Retenue 10%</td><td class="right">{{retention10}} €</td></tr>
                <tr class="total-row"><td><strong>Montant à verser</strong></td><td class="right amount">{{netAPayer}} €</td></tr>
            </table>
        </div>
        <div class="signature">
            <p>Arrete le présent mémoire à la somme de : <strong>{{montantEnLettres}}</strong> euros</p>
            <p class="signature-date">La Guerche de Bretagne, le {{date}}</p>
            <br><br><p><strong>{{doctorNameShort}}</strong></p>
        </div>
        <div class="footer">Page 1/3 | {{generationDate}}</div>
    </div>
    <div class="page-break"></div>
    <div class="page">
        <div class="header">
            <div class="logo-section">
                <div class="logo">CH</div>
                <div class="logo-text">CENTRE HOSPITALIER<br>SAINT JEAN</div>
            </div>
            <div class="header-info">
                <p>63, Faubourg de Rennes<br>35130 LA GUERCHE DE BRETAGNE</p>
                <p>Tel: 02 XX XX XX XX | Fax: 02 XX XX XX XX</p>
            </div>
        </div>
        <div class="title">État des Honoraires Médicaux</div>
        <div class="subtitle">En EHPAD - Contrat pluriannuel</div>
        <div class="section references">
            <p><strong>RÉFÉRENCES LÉGALES :</strong></p>
            <p>• Contrat pluriannuel d'Objectif et de Moyens - 29 juin 2020</p>
            <p>• Articles L 313-11, L 313-12, L313-12-2 du Code de l'Action Sociale</p>
        </div>
        <div class="section designation">
            <p><strong>DÉSIGNATION :</strong> {{doctorName}}</p>
            <p>Médecin généraliste, autorisé à exercer dans l'établissement.</p>
        </div>
        <div class="section">
            <p class="section-title">État des sommes dues pour le mois de : <strong>{{month}}</strong></p>
            {{tableEHPAD}}
            <div class="grand-total">MONTANT TOTAL : {{totalEhpad}} €</div>
        </div>
        <div class="signature">
            <p>Arrete le présent mémoire à la somme de : <strong>{{montantEhpadEnLettres}}</strong> euros</p>
            <p class="signature-date">La Guerche de Bretagne, le {{date}}</p>
            <br><br><p><strong>{{doctorNameShort}}</strong></p>
        </div>
        <div class="footer">Page 2/3 | {{generationDate}}</div>
    </div>
    <div class="page-break"></div>
    <div class="page">
        <div class="header">
            <div class="logo-section">
                <div class="logo">CH</div>
                <div class="logo-text">CENTRE HOSPITALIER<br>SAINT JEAN</div>
            </div>
            <div class="header-info">
                <p>63, Faubourg de Rennes<br>35130 LA GUERCHE DE BRETAGNE</p>
            </div>
        </div>
        <div class="title">Détail des Actes Médicaux</div>
        <div class="subtitle">Pour le mois de {{month}}</div>
        <div class="section">
            <p class="section-title">LISTE COMPLETE DES INTERVENTIONS</p>
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
                <tbody>{{patientList}}</tbody>
            </table>
            <div style="margin-top: 20px; text-align: center; font-size: 9pt; color: #666;">
                <p>Total interventions : {{totalVisits}} | Total : {{totalAmount}} €</p>
            </div>
        </div>
        <div class="signature">
            <p>Document certifie conforme</p>
            <p class="signature-date">Genere le {{generationDate}}</p>
        </div>
        <div class="footer">Page 3/3 | {{generationDate}}</div>
    </div>
</body>
</html>`;

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
        .replace(/{{year}}/g, prevYear.toString())
        .replace(/{{generationDate}}/g, dateStr)
        .replace(/{{monthKey}}/g, monthKey)
        .replace(/{{totalVisits}}/g, passages.length.toString())
        .replace(/{{totalAmount}}/g, totalAmount.toFixed(2))

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