// ============================================================
// GENERATE-MONTHLY-PDF v2
// Génère le PDF des honoraires du mois précédent, calqué sur le
// modèle "Modele honoraires" (CH Saint Jean) :
//   Page 1 : Médecine/SSR (tableau G/VG/MPA + retenue 10%)
//   Page 2 : EHPAD (Availles, Lilas Rdc, Lilas 1er, Tamaris) sur une page
//   Page 3 : Liste des patients vus
// Déclenché par pg_cron le 1er de chaque mois (0 1 1 * *),
// ou manuellement via POST.
// ============================================================

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
  patients?: { name: string }
}

// Logo CH Saint Jean (JPEG, ~23 Ko) — même logo que l'application
const LOGO_B64 = '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'

// Tarifs : source unique (identique à cotationPrices v1 et au modèle)
const TARIFS: Record<string, number> = {
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

function tarif(cotation: string): number {
  return TARIFS[(cotation || '').toUpperCase().trim()] ?? 30.00
}

const MEDECINE_ACTES = ['G', 'VG', 'MPA']
const EHPAD_ACTES = ['G', 'VG+MD', 'VG+MU', 'V+MU', 'ALQP003', 'ALQP006', 'VL', 'VL+MD', 'VG+MD+MSH', 'VG+MD+2IK']
const EHPAD_ACTES_LIBELLES: Record<string, string> = {
  'G': 'G',
  'VG+MD': 'VG+MD',
  'VG+MU': 'VG+MU ou V+MU',
  'V+MU': 'VG+MU ou V+MU',
  'ALQP003': 'ALQP003 (ou ALQP006)',
  'ALQP006': 'ALQP003 (ou ALQP006)',
  'VL': 'VL',
  'VL+MD': 'VL+MD',
  'VG+MD+MSH': 'VG+MD+MSH',
  'VG+MD+2IK': 'VG+MD+2IK',
}
const EHPAD_SERVICES: { match: string[], label: string }[] = [
  { match: ['availles'], label: 'Availles' },
  { match: ['lilas rdc', 'lilias rdc', 'lilas rdc'], label: 'Lilas Rdc' },
  { match: ['lilas 1er', 'lilas 1er etage', 'lilas 1er étage', 'lilias 1er etage', 'lilias 1er'], label: 'Lilas 1er' },
  { match: ['tamaris'], label: 'Tamaris' },
]

const MOIS_NOMS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

// ---------- Montant en toutes lettres (français) ----------
const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
const TENS: Record<number, string> = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante', 7: 'soixante', 8: 'quatre-vingt', 9: 'quatre-vingt' }

function sousCent(n: number): string {
  if (n === 0) return ''
  if (n < 20) return UNITS[n]
  const t = Math.floor(n / 10), u = n % 10
  if (t === 8) return 'quatre-vingt' + (u === 0 ? 's' : '-' + UNITS[u])
  const base = TENS[t]
  if (t === 7 || t === 9) return u === 0 ? base : base + '-' + UNITS[10 + u]
  if (u === 0) return base
  if (u === 1) return base + '-et-un'
  return base + '-' + UNITS[u]
}

function troisChiffres(n: number): string {
  let s = ''
  const c = Math.floor(n / 100), rest = n % 100
  if (c) s += UNITS[c] + ' cent' + (c > 1 && rest === 0 ? 's' : '')
  if (rest) s += (s ? ' ' : '') + sousCent(rest)
  return s
}

function enLettres(montant: number): string {
  const total = Math.round(montant * 100)
  const euros = Math.floor(total / 100), cents = total % 100
  const partie: string[] = []
  const milliers = Math.floor(euros / 1000), reste = euros % 1000
  if (milliers) partie.push((milliers > 1 ? troisChiffres(milliers) + ' ' : '') + 'mille')
  if (reste) partie.push(troisChiffres(reste))
  let texte = (partie.join(' ').trim() || 'zéro') + ' euros'
  if (cents) texte += ' et ' + sousCent(cents) + ' centimes'
  return texte
}

function fmt(x: number): string {
  return x.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €'
}

// ---------- Mise en page (calquée sur la démo validée) ----------
// A4 : 210 x 297 mm. Marges : 18 mm gauche/droite.
const MARGE = 18
const LARGEUR = 210 - 2 * MARGE

function newDoc(): any {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  doc.setMargins(MARGE, 12, MARGE)
  return doc
}

function entete(doc: any, refs: string, avecRetenue: boolean, doctorName: string): number {
  // Logo à gauche (hauteur 20 mm), bloc texte à droite
  try {
    doc.addImage(LOGO_B64, 'JPEG', MARGE, 12, 23.5, 20)
  } catch (_e) { /* logo optionnel */ }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('CENTRE HOSPITALIER SAINT JEAN', 42, 17)
  doc.setFontSize(9)
  doc.text('63, Faubourg de Rennes, 35130 LA GUERCHE DE BRETAGNE', 42, 23)
  doc.setFontSize(13)
  doc.text('HONORAIRES MEDICAUX', 105, 38, { align: 'center' })
  doc.setFontSize(12)
  doc.text('EN SERVICES DE MEDECINE - SSR', 105, 45, { align: 'center' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('REFERENCES :', MARGE, 56)
  doc.setFont('helvetica', 'normal')
  const refsLines = doc.splitTextToSize(refs, LARGEUR - 22)
  doc.text(refsLines, MARGE + 22, 56)
  let y = 56 + refsLines.length * 4.5

  if (avecRetenue) {
    const retenueTxt = [
      'Les honoraires sont fixés à 100% de la valeur de l\'acte conventionné.',
      'Sur ces honoraires est due à l\'établissement une redevance de 10% pour',
      'participation aux frais de structure, de personnel et d\'équipements hospitaliers de l\'établissement.',
    ]
    doc.text(retenueTxt, MARGE, y + 4)
    y += 4 + retenueTxt.length * 4.5 + 3
  }

  doc.setFont('helvetica', 'bold')
  doc.text('DESIGNATION : ', MARGE, y)
  doc.setFont('helvetica', 'normal')
  doc.text(doc.splitTextToSize(`${doctorName}, Médecin généraliste, autorisé à exercer dans l'établissement.`, LARGEUR - 26), MARGE + 26, y)
  y += 5
  doc.text('CCM BETTON IBAN FR7615589351100287012394050', MARGE, y)
  return y + 7
}

function memoire(doc: any, montant: number, y: number, dateStr: string) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Arrêt le présent mémoire à la somme de :', MARGE, y)
  doc.setFont('helvetica', 'bold')
  const enLettresTxt = enLettres(montant).charAt(0).toUpperCase() + enLettres(montant).slice(1) + ' €'
  doc.text(doc.splitTextToSize(enLettresTxt, LARGEUR), MARGE, y + 6)
  doc.setFont('helvetica', 'normal')
  doc.text(`La Guerche de Bretagne, le ${dateStr}`, MARGE, y + 18)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Docteur DORE', 210 - MARGE, y + 40, { align: 'right' })
}

function tableauMedecine(doc: any, y: number, passages: Passage[]): { total: number, retenue: number, verser: number, y: number } {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('ETAT DES SOMMES DUES POUR LE MOIS DE :', MARGE, y + 6)
  doc.setFont('helvetica', 'underline')
  doc.text('{{MOIS}}', MARGE + 75, y + 6)

  y += 10
  const col = [28, 58, 30, 58]
  const headers = ['Nombre', 'Actes', 'Prix', 'Montant']
  doc.setFillColor(230, 230, 230)
  doc.setLineWidth(0.2)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  headers.forEach((h, i) => doc.rect(cumSum(col, i), y, col[i], 8, 'FD') || doc.text(h, cumSum(col, i) + col[i] / 2, y + 5.5, { align: 'center' }))
  y += 8
  doc.setFont('helvetica', 'normal')

  const byCotation: Record<string, number> = {}
  passages.forEach(p => {
    const cot = (p.cotation || 'G').toUpperCase().trim()
    byCotation[cot] = (byCotation[cot] || 0) + 1
  })

  let total = 0
  let lignes = 0
  for (const acte of MEDECINE_ACTES) {
    const n = byCotation[acte] || 0
    const montant = n * tarif(acte)
    total += montant
    const cells = [String(n), acte, fmt(tarif(acte)), fmt(montant)]
    cells.forEach((c, i) => doc.rect(cumSum(col, i), y, col[i], 8) || doc.text(c, i >= 1 ? cumSum(col, i) + col[i] / 2 : cumSum(col, i) + col[i] / 2, y + 5.5, { align: 'center' }))
    y += 8
    lignes++
  }

  const retenue = total * 0.10
  const verser = total - retenue
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Montant total', 134, y, { align: 'right' })
  doc.line(134, y - 5, 192, y - 5)
  doc.text(fmt(total), 192, y, { align: 'right' })
  y += 8
  doc.text('Retenue 10%', 134, y, { align: 'right' })
  doc.text(fmt(retenue), 192, y, { align: 'right' })
  y += 8
  doc.text('Montant à verser', 134, y, { align: 'right' })
  doc.line(134, y - 5, 192, y - 5)
  doc.line(134, y + 2, 192, y + 2)
  doc.text(fmt(verser), 192, y, { align: 'right' })
  return { total, retenue, verser, y: y + 6 }
}

function cumSum(arr: number[], upto: number): number {
  let s = MARGE
  for (let i = 0; i < upto; i++) s += arr[i]
  return s
}

function tableauEhpad(doc: any, y: number, passages: Passage[], moisLabel: string): { total: number, y: number } {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('ETAT DES SOMMES DUES POUR LE MOIS DE :', MARGE, y + 6)
  doc.setFont('helvetica', 'underline')
  doc.text(moisLabel, MARGE + 75, y + 6)

  y += 9
  const W = [26, 20, 46, 22, 32, 34]
  const headers = ['Services', 'Nombre', 'Actes', 'Prix', 'Montant par actes', 'Total par service']
  doc.setFillColor(230, 230, 230)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  headers.forEach((h, i) => doc.rect(cumSum(W, i), y, W[i], 6, 'FD') || doc.text(doc.splitTextToSize(h, W[i] - 1), cumSum(W, i) + W[i] / 2, y + 4, { align: 'center' }))
  y += 6
  doc.setFont('helvetica', 'normal')

  const RH = 4.7
  let totalEhpad = 0

  for (const svc of EHPAD_SERVICES) {
    const svcPassages = passages.filter(p => svc.match.includes(normalize(p.location)))
    if (svcPassages.length === 0) continue
    const byCotation: Record<string, number> = {}
    svcPassages.forEach(p => {
      const cot = (p.cotation || 'G').toUpperCase().trim()
      byCotation[cot] = (byCotation[cot] || 0) + 1
    })
    const totalSvc = Object.entries(byCotation).reduce((s, [cot, n]) => s + n * tarif(cot), 0)
    totalEhpad += totalSvc

    let premier = true
    let dejaAffiches = new Set<string>()
    for (const acte of EHPAD_ACTES) {
      if (dejaAffiches.has(EHPAD_ACTES_LIBELLES[acte])) continue
      dejaAffiches.add(EHPAD_ACTES_LIBELLES[acte])
      const n = byCotation[acte] || 0
      const montant = n * tarif(acte)
      const x0 = cumSum(W, 0), x1 = cumSum(W, 1), x2 = cumSum(W, 2), x3 = cumSum(W, 3), x4 = cumSum(W, 4), x5 = cumSum(W, 5)
      doc.rect(x0, y, W[0], RH)
      if (premier) doc.text(svc.label, x0 + W[0] / 2, y + 3.5, { align: 'center' })
      doc.rect(x1, y, W[1], RH); doc.text(String(n), x1 + W[1] / 2, y + 3.5, { align: 'center' })
      doc.rect(x2, y, W[2], RH); doc.text(EHPAD_ACTES_LIBELLES[acte], x2 + W[2] / 2, y + 3.5, { align: 'center' })
      doc.rect(x3, y, W[3], RH); doc.text(fmt(tarif(acte)), x3 + W[3] / 2, y + 3.5, { align: 'center' })
      doc.rect(x4, y, W[4], RH); doc.text(fmt(montant), x4 + W[4] / 2, y + 3.5, { align: 'center' })
      doc.rect(x5, y, W[5], RH)
      if (premier) doc.text(fmt(totalSvc), x5 + W[5] / 2, y + 3.5, { align: 'center' })
      premier = false
      y += RH
    }
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('MONTANT TOTAL :', 154, y + 8, { align: 'right' })
  doc.text(fmt(totalEhpad), 192, y + 8, { align: 'right' })
  return { total: totalEhpad, y: y + 12 }
}

function normalize(s: string): string {
  return (s || '').toLowerCase().trim()
}

function pagePatients(doc: any, passages: Passage[], moisLabel: string, dateStr: string) {
  doc.addPage()
  try {
    doc.addImage(LOGO_B64, 'JPEG', MARGE, 12, 23.5, 20)
  } catch (_e) { /* logo optionnel */ }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('CENTRE HOSPITALIER SAINT JEAN', 42, 17)
  doc.setFontSize(9)
  doc.text('63, Faubourg de Rennes, 35130 LA GUERCHE DE BRETAGNE', 42, 23)
  doc.setFontSize(13)
  doc.text('LISTE DES PATIENTS VUS', 105, 40, { align: 'center' })
  doc.setFontSize(10)
  doc.text('Mois de : ', 105, 48, { align: 'center' })
  doc.setFont('helvetica', 'underline')
  doc.text(moisLabel, 105 + 12, 48, { align: 'center' })

  const WP = [24, 34, 62, 30, 32]
  const headers = ['Date', 'Médecin', 'Nom patient', 'Lieu', 'Cotation']
  let y = 56
  const enteteTableau = () => {
    doc.setFillColor(230, 230, 230)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    headers.forEach((h, i) => doc.rect(cumSum(WP, i), y, WP[i], 7, 'FD') || doc.text(h, cumSum(WP, i) + WP[i] / 2, y + 5, { align: 'center' }))
    y += 7
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
  }
  enteteTableau()
  const rowsPerPage = Math.floor((280 - y) / 6.5)
  let count = 0
  for (const p of passages) {
    if (count > 0 && count % rowsPerPage === 0) {
      doc.addPage()
      y = 18
      enteteTableau()
    }
    const cells = [p.date || '-', 'Dr DORE', (p.patients?.name || 'Inconnu').substring(0, 28), p.location || '', p.cotation || '']
    cells.forEach((c, i) => doc.rect(cumSum(WP, i), y, WP[i], 6.5) || doc.text(String(c), i === 2 ? cumSum(WP, i) + 2 : cumSum(WP, i) + WP[i] / 2, y + 4.7, { align: i === 2 ? 'left' : 'center' }))
    y += 6.5
    count++
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

    // Mois précédent (le 1er décembre -> novembre)
    const now = new Date(Date.now() + 2 * 3600 * 1000) // heure France
    let prevMonth = now.getMonth() // 0-based du mois courant -> mois précédent
    let prevYear = now.getFullYear()
    if (now.getDate() === 1 || true) {
      // calcul générique du mois précédent
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      prevMonth = d.getMonth() + 1
      prevYear = d.getFullYear()
    }
    const monthKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`
    const moisLabel = `${MOIS_NOMS[prevMonth - 1]} ${prevYear}`
    console.log(`Generating PDF for ${moisLabel} (${monthKey})`)

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')

    const results = []

    for (const profile of profiles || []) {
      if (!profile.id) continue

      const year = prevYear
      const month = prevMonth
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

      const ehpadLocations = ['lilas rdc', 'lilias rdc', 'lilas rdc', 'lilas 1er', 'lilias 1er', 'lilas 1er etage', 'lilias 1er etage', 'availles', 'tamaris']
      const isEhpad = (p: Passage) => ehpadLocations.includes(normalize(p.location))
      const medecinePassages = passages.filter((p: Passage) => !isEhpad(p))
      const ehpadPassages = passages.filter((p: Passage) => isEhpad(p))

      const doctorName = profile.first_name && profile.last_name
        ? `Docteur ${profile.last_name} ${profile.first_name}`
        : `Docteur ${profile.email.split('@')[0]}`
      const doctorNameShort = profile.last_name || profile.email.split('@')[0]

      const day = String(now.getDate()).padStart(2, '0')
      const dateStr = `${day} ${MOIS_NOMS[now.getMonth()]} ${now.getFullYear()}`

      const doc = newDoc()

      // ---- Page 1 : Médecine / SSR ----
      let y = entete(doc, "Application de la loi 2021-502 du 26 avril 2021 (notamment l'article 19) - Application des articles L 6146-2 et L 6146-41 du Code de la santé publique", true, doctorName)
      const t1 = tableauMedecine(doc, y, medecinePassages)
      memoire(doc, t1.verser, 232, dateStr)

      // ---- Page 2 : EHPAD (une page) ----
      doc.addPage()
      y = entete(doc, 'contrat pluriannuel d\'Objectif et de Moyens signés le 29 juin 2020 - Articles L 313-11, L 313-12, L313-12-2 du Code de l\'Action Sociale et des Familles', false, doctorName)
      const t2 = tableauEhpad(doc, y, ehpadPassages, moisLabel.toUpperCase())
      memoire(doc, t2.total, t2.y + 4, dateStr)

      // ---- Page 3 : Liste des patients ----
      pagePatients(doc, passages, moisLabel.toUpperCase(), dateStr)

      const pdfBase64 = doc.output('datauristring')

      const totalAmount = passages.reduce((sum: number, p: Passage) => sum + (parseFloat(String(p.amount)) || 0), 0)

      const { data: existing } = await supabase
        .from('comptabilite')
        .select('id')
        .eq('user_id', profile.id)
        .eq('month_key', monthKey)
        .single()

      if (existing) {
        await supabase
          .from('comptabilite')
          .update({
            total_amount: totalAmount,
            total_visits: passages.length,
            pdf_data: pdfBase64,
            generated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
      } else {
        await supabase.from('comptabilite').insert([{
          user_id: profile.id,
          month_key: monthKey,
          month_name: moisLabel,
          total_amount: totalAmount,
          total_visits: passages.length,
          pdf_data: pdfBase64,
          generated_at: new Date().toISOString()
        }])
      }

      console.log(`PDF généré pour ${profile.email}: ${passages.length} passages, ${totalAmount}€`)
      results.push({ user: profile.email, passages: passages.length, total: totalAmount, medecine: t1.total, ehpad: t2.total })
    }

    return new Response(JSON.stringify({
      success: true,
      month: moisLabel,
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
