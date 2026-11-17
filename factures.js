// ===== Import de facture fournisseur (PDF / photos) =====
// Lecture ligne par ligne d'une facture (couche texte PDF ou OCR Tesseract,
// puis analyse IA comme pour les relevés bancaires) :
//  - en réception de commande : vérifie que la facture colle au bon de
//    commande (écarts ligne à ligne et sur le total) et préremplit la
//    réception (quantités, prix facturés, total TTC) ;
//  - sans bon de commande : crée la dépense (ou se rapproche d'une ligne
//    du relevé bancaire déjà importée = dépense existante).

window._factureFlow = null;

function factureEscapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function factureFmtEur(n) {
    if (typeof urgenceFmtEur === 'function') return urgenceFmtEur(n);
    return (Number(n) || 0).toFixed(2).replace('.', ',') + '\u00a0\u20ac';
}

function factureOrder() {
    if (!window._factureFlow || !window._factureFlow.orderId) return null;
    try {
        if (typeof urgenceData === 'undefined' || !urgenceData) return null;
        return (urgenceData.orders || []).find(o => o.id === window._factureFlow.orderId) || null;
    } catch (e) { return null; }
}

// ---------- Ouverture du flux d'import ----------

window.factureOpenImport = function(orderId) {
    window._factureFlow = { orderId: orderId || null, files: [], pages: [], rotations: {}, text: '', invoice: null };
    const existing = document.getElementById('factureImportModal');
    if (existing) existing.remove();

    const order = orderId ? factureOrder() : null;
    const ctx = order
        ? `Facture de la commande ${order.supplier ? factureEscapeHtml(order.supplier) : ''} du ${new Date(order.createdAt).toLocaleDateString('fr-FR')} — la lecture ligne par ligne vérifiera les écarts avec le bon de commande.`
        : 'Facture sans bon de commande (facture ancienne ou cabinet n\u2019utilisant pas les bons de commande). Elle sera rapprochée d\u2019une ligne du relevé bancaire ou enregistrée comme dépense.';

    const modal = document.createElement('div');
    modal.id = 'factureImportModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-card urgence-modal-content" style="max-width:520px;">
            <div class="modal-header">
                <h3>Importer la facture</h3>
                <button type="button" class="modal-close" onclick="factureCloseImport()" aria-label="Fermer">\u2715</button>
            </div>
            <div class="modal-body" id="factureImportBody">
                <p class="form-hint" style="margin-bottom:14px;">${ctx}</p>
                <div class="releve-source-grid">
                    <button type="button" class="releve-source-card" onclick="document.getElementById('factureFileInput').click();">
                        <span class="releve-source-ico">\ud83d\udcc4</span>
                        <span class="releve-source-label">PDF</span>
                        <span class="releve-source-hint">Facture fournisseur</span>
                    </button>
                    <button type="button" class="releve-source-card" onclick="document.getElementById('factureFileInput').click();">
                        <span class="releve-source-ico">\ud83d\uddbc\ufe0f</span>
                        <span class="releve-source-label">Image</span>
                        <span class="releve-source-hint">Galerie / capture</span>
                    </button>
                    <button type="button" class="releve-source-card" onclick="document.getElementById('factureCameraInput').click();">
                        <span class="releve-source-ico">\ud83d\udcf8</span>
                        <span class="releve-source-label">Cam\u00e9ra</span>
                        <span class="releve-source-hint">Photographier la facture</span>
                    </button>
                </div>
                <input type="file" id="factureFileInput" accept=".pdf,.jpg,.jpeg,.png" multiple style="display:none" onchange="factureHandleFiles(event)">
                <input type="file" id="factureCameraInput" accept="image/*" capture="environment" style="display:none" onchange="factureHandleFiles(event)">
                <div id="factureLoading" style="display:none; text-align:center; padding:30px 10px;">
                    <div class="spinner" style="margin:0 auto 12px;"></div>
                    <p id="factureLoadingTxt" style="margin:0; font-size:0.85rem; color:var(--color-text-secondary);">Lecture de la facture...</p>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) factureCloseImport();
    });
};

window.factureCloseImport = function() {
    document.getElementById('factureImportModal')?.remove();
    document.getElementById('factureZoomModal')?.remove();
    window._factureFlow = null;
};

function factureSetLoading(txt) {
    const wrap = document.getElementById('factureLoading');
    const label = document.getElementById('factureLoadingTxt');
    const pickers = document.getElementById('factureImportModal')?.querySelector('.releve-source-grid');
    if (wrap) wrap.style.display = txt ? 'block' : 'none';
    if (label && txt) label.textContent = txt;
    if (pickers) pickers.style.display = txt ? 'none' : 'grid';
}

// ---------- Extraction texte (pdf.js + Tesseract, comme les relevés) ----------

window.factureHandleFiles = async function(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || !window._factureFlow) return;
    window._factureFlow.files = files;
    try {
        factureSetLoading('Reconnaissance du texte\u2026');
        const extracted = await factureExtractFiles(files);
        window._factureFlow.text = extracted.text;
        window._factureFlow.pages = extracted.pages;
        factureSetLoading('Analyse des lignes de la facture\u2026');
        const invoice = await factureAnalyzeText(extracted.text);
        window._factureFlow.invoice = invoice;
        factureShowReview();
    } catch (e) {
        console.error('[FACTURE] Erreur import:', e);
        factureSetLoading(null);
        if (typeof showToast === 'function') showToast('Erreur lors de la lecture de la facture : ' + (e.message || e), 'error');
        else alert('Erreur lors de la lecture de la facture : ' + (e.message || e));
    }
};

async function factureExtractFiles(files) {
    const flow = window._factureFlow;
    let text = '';
    const pages = [];
    for (const file of files) {
        if (file.type === 'application/pdf') {
            const pdfjsLib = window.pdfjsLib;
            if (!pdfjsLib) throw new Error('pdf.js n\u2019est pas charg\u00e9. Rafra\u00eechissez la page.');
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({
                data: arrayBuffer,
                cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/cmaps/',
                cMapPacked: true
            }).promise;
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                factureSetLoading(`PDF \u2014 page ${pageNum}/${pdf.numPages}\u2026`);
                const page = await pdf.getPage(pageNum);

                const hiresViewport = page.getViewport({ scale: 2.0 });
                const hiresCanvas = document.createElement('canvas');
                hiresCanvas.height = hiresViewport.height;
                hiresCanvas.width = hiresViewport.width;
                await page.render({ canvasContext: hiresCanvas.getContext('2d'), viewport: hiresViewport }).promise;
                const hires = hiresCanvas.toDataURL('image/jpeg', 0.85);

                const thumbViewport = page.getViewport({ scale: 0.5 });
                const thumbCanvas = document.createElement('canvas');
                thumbCanvas.height = thumbViewport.height;
                thumbCanvas.width = thumbViewport.width;
                await page.render({ canvasContext: thumbCanvas.getContext('2d'), viewport: thumbViewport }).promise;
                const thumb = thumbCanvas.toDataURL('image/jpeg', 0.7);

                const textContent = await page.getTextContent();
                let pageText = textContent.items
                    .map(item => (item.str || '') + (item.hasEOL ? '\n' : ' '))
                    .join('').replace(/[ \t]+/g, ' ').trim();

                if (pageText.length < 20) {
                    const blob = await new Promise(resolve => hiresCanvas.toBlob(resolve, 'image/png'));
                    pageText = (await factureOcr(blob)).text;
                }
                text += '\n<<<PAGE ' + (pages.length + 1) + '>>>\n' + pageText + '\n';
                pages.push({ thumb, hires });
            }
        } else if (file.type && file.type.startsWith('image/')) {
            const pageIdx = pages.length;
            const deg = (flow && flow.rotations && flow.rotations[pageIdx]) || 0;
            factureSetLoading(`Photo ${pages.length + 1} \u2014 reconnaissance du texte\u2026`);
            let prepared = await facturePrepareImage(file, deg);
            let ocr = await factureOcr(prepared.ocrBlob);

            // Photo retournee (haut en bas) : l'OCR echoue ou sort du charabia.
            // Si la lecture est mauvaise, on retente apres rotation de 180\u00b0
            // et on garde la meilleure des deux orientations.
            if (deg === 0 && (ocr.confidence < 45 || ocr.text.trim().length < 20)) {
                factureSetLoading(`Photo ${pages.length + 1} \u2014 photo \u00e0 l\u2019envers ? nouvelle lecture apr\u00e8s rotation\u2026`);
                const flipped = await facturePrepareImage(file, 180);
                const ocr2 = await factureOcr(flipped.ocrBlob);
                const score1 = ocr.confidence * Math.min(1, ocr.text.trim().length / 40);
                const score2 = ocr2.confidence * Math.min(1, ocr2.text.trim().length / 40);
                if (score2 > score1) {
                    prepared = flipped;
                    ocr = ocr2;
                    if (flow && flow.rotations) flow.rotations[pageIdx] = 180;
                    if (typeof showToast === 'function') showToast('Photo d\u00e9tect\u00e9e \u00e0 l\u2019envers \u2014 relue apr\u00e8s rotation \u21bb');
                }
            }
            text += '\n<<<PAGE ' + (pages.length + 1) + '>>>\n' + ocr.text + '\n';
            pages.push({ thumb: prepared.thumbDataUrl, hires: prepared.hiresDataUrl });
        }
    }
    if (!text.trim()) throw new Error('aucun texte reconnu');
    return { text, pages };
}

// Charge une image, la fait pivoter de deg degres et produit les bitmaps
// OCR (haute resolution) et vignette, comme prepareRelevePhoto.
async function facturePrepareImage(file, deg) {
    const url = URL.createObjectURL(file);
    const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
        im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Photo illisible')); };
        im.src = url;
    });
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const swap = ((deg % 360) + 360) % 360 % 180 !== 0;
    const canvas = document.createElement('canvas');
    canvas.width = swap ? h : w;
    canvas.height = swap ? w : h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(deg * Math.PI / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    const hiresDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const ocrBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));

    const thumbScale = Math.min(1, 350 / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * thumbScale));
    const th = Math.max(1, Math.round(h * thumbScale));
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = swap ? th : tw;
    thumbCanvas.height = swap ? tw : th;
    const thumbCtx = thumbCanvas.getContext('2d');
    thumbCtx.imageSmoothingQuality = 'high';
    thumbCtx.translate(thumbCanvas.width / 2, thumbCanvas.height / 2);
    thumbCtx.rotate(deg * Math.PI / 180);
    thumbCtx.drawImage(img, -tw / 2, -th / 2, tw, th);
    const thumbDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.7);
    return { ocrBlob, hiresDataUrl, thumbDataUrl };
}

async function factureOcr(blob) {
    const result = await Tesseract.recognize(blob, 'fra+eng', {
        logger: m => console.log('[FACTURE][TESSERACT]', m.status, m.progress)
    });
    return { text: result.data.text || '', confidence: Number(result.data.confidence) || 0 };
}

// Rotation manuelle d'une page (par pas de 90\u00b0) puis relance OCR + analyse.
// Les corrections d\u2019en-t\u00eate deja saisies sont conservees si la relecture
// ne retrouve pas la valeur.
window.factureRotate = async function(pageIdx, delta) {
    const flow = window._factureFlow;
    if (!flow || !flow.files || !flow.files.length) return;
    const keep = factureReadReview() || flow.invoice;
    if (!confirm('Tourner la page puis relire la facture ?\n\nLes corrections en cours (lignes) seront remplac\u00e9es par la nouvelle lecture.')) return;
    if (!flow.rotations) flow.rotations = {};
    flow.rotations[pageIdx] = (((flow.rotations[pageIdx] || 0) + delta) % 360 + 360) % 360;
    try {
        factureSetLoading('Relecture de la facture apr\u00e8s rotation\u2026');
        const extracted = await factureExtractFiles(flow.files);
        flow.pages = extracted.pages;
        const inv = await factureAnalyzeText(extracted.text);
        if (keep) {
            if (!inv.supplier && keep.supplier) inv.supplier = keep.supplier;
            if (!inv.invoice_number && keep.invoice_number) inv.invoice_number = keep.invoice_number;
            if (!inv.date && keep.date) inv.date = keep.date;
            if (!inv.total_ttc && keep.total_ttc) inv.total_ttc = keep.total_ttc;
        }
        flow.invoice = inv;
        factureShowReview();
        if (typeof showToast === 'function') showToast('Page tourn\u00e9e \u2014 facture relue');
    } catch (e) {
        factureSetLoading(null);
        if (typeof showToast === 'function') showToast('Erreur relecture : ' + (e.message || e), 'error');
    }
};

// ---------- Analyse IA (mêmes clés / modèles que les relevés) ----------

async function factureAnalyzeText(text) {
    const apiKey = localStorage.getItem('groq_api_key') || localStorage.getItem('openrouter_api_key');
    if (apiKey) {
        try {
            const inv = await factureAnalyzeWithAI(text, apiKey);
            if (inv && Array.isArray(inv.lines) && inv.lines.length) return inv;
        } catch (e) {
            console.error('[FACTURE] Analyse IA:', e);
        }
    }
    return factureParseLocalement(text);
}

async function factureAnalyzeWithAI(text, apiKey) {
    const prompt = `Analyse cette facture fournisseur et extrais son contenu. Retourne un objet JSON avec:
- supplier: le nom du fournisseur (émetteur de la facture)
- invoice_number: le numéro de facture
- date: la date de la facture (format YYYY-MM-DD)
- total_ttc: le montant total TTC payé (nombre)
- lines: un tableau des lignes d'articles de la facture, chaque ligne avec:
  - label: le libellé / désignation de l'article
  - qty: la quantité (nombre, 1 si absente)
  - unit_price: le prix unitaire (nombre, 0 si absent)
  - total: le total de la ligne (nombre)
  - category: la catégorie de dépense parmi: consommables, fournitures, materiel, logiciel, services, charges, reception, autres_depenses
  - subcategory: la sous-catégorie précise en quelques mots (ex: "Consommables médicaux", "Nettoyage / produits d'entretien", "Fournitures bureau")

Ne pas inclure les lignes de sous-total, TVA, remise globale, frais de port ou total général dans "lines".
Retourne UNIQUEMENT l'objet JSON valide sans texte supplémentaire.`;

    const isGroq = apiKey.startsWith('gsk_') || !apiKey.includes('sk-or-');
    const url = isGroq
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://openrouter.ai/api/v1/chat/completions';
    const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    };
    if (!isGroq) {
        headers['HTTP-Referer'] = window.location.origin;
        headers['X-Title'] = 'Cotation Médecin';
    }
    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: isGroq ? 'llama-3.1-8b-instant' : 'anthropic/claude-3-haiku',
            messages: [
                { role: 'system', content: 'Tu es un assistant comptable pour un cabinet médical français.' },
                { role: 'user', content: prompt + '\n\n--- FACTURE ---\n' + String(text).slice(0, 12000) }
            ],
            max_tokens: 4096
        })
    });
    if (!response.ok) throw new Error('Erreur API (' + response.status + ')');
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const inv = JSON.parse(jsonMatch[0]);
    return {
        supplier: String(inv.supplier || '').trim(),
        invoice_number: String(inv.invoice_number || '').trim(),
        date: String(inv.date || '').trim(),
        total_ttc: Number(inv.total_ttc) || 0,
        lines: (inv.lines || []).map(l => {
            const sug = factureSuggestCategory(l.label);
            const cat = (typeof normalizeFluxCategory === 'function')
                ? normalizeFluxCategory(String(l.category || sug.category), true)
                : (l.category || sug.category);
            return {
                label: String(l.label || '').trim(),
                qty: Number(l.qty) || 1,
                unit_price: Number(l.unit_price) || 0,
                total: Number(l.total) || 0,
                category: cat,
                subcategory: String(l.subcategory || sug.subcategory || '').trim()
            };
        }).filter(l => l.label)
    };
}

// Repli local sans clé IA : lignes se terminant par un montant à centimes,
// dernier montant de type total = total TTC
function factureParseLocalement(text) {
    const amountRe = /(\d{1,3}(?:[ .]\d{3})*[.,]\d{2})\s*(?:\u20ac|EUR|eur)?\s*$/;
    const cleanAmount = (raw) => {
        let s = String(raw).replace(/[\s\u00a0\u20ac]/g, '');
        s = s.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
        return parseFloat(s) || 0;
    };
    const lines = [];
    let total = 0;
    for (const rawLine of String(text || '').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || /^<<<PAGE/.test(line)) continue;
        const m = line.match(amountRe);
        if (!m) continue;
        const amount = cleanAmount(m[1]);
        if (!amount) continue;
        const label = line.slice(0, m.index).replace(/\s{2,}/g, ' ').replace(/[\s.•]+$/, '').trim();
        if (/total|tva|sous.?total|solde|net|remise|port|frais|acompte|carte|cb\b/i.test(label)) {
            if (/total|net/i.test(label)) total = Math.max(total, amount);
            continue;
        }
        if (!label || label.length < 2) continue;
        const qtyMatch = /(\d+)\s*(?:x|\u00d7)\s*/i.exec(label);
        let qty = 1;
        let cleanLabel = label;
        if (qtyMatch) {
            qty = parseInt(qtyMatch[1], 10) || 1;
            cleanLabel = (label.slice(0, qtyMatch.index) + label.slice(qtyMatch.index + qtyMatch[0].length)).trim();
        }
        const sug = factureSuggestCategory(cleanLabel || label);
        lines.push({ label: cleanLabel || label, qty, unit_price: Math.round((amount / qty) * 100) / 100, total: amount, category: sug.category, subcategory: sug.subcategory });
    }
    if (!total && lines.length) total = lines.reduce((s, l) => s + l.total, 0);
    const meta = factureDetectMeta(text);
    return Object.assign({ supplier: '', invoice_number: '', date: '', total_ttc: total, lines }, meta);
}

// Detection heuristique de la date et de la societe emettrice (repli sans IA) :
// - date : premiere date plausible de l'en-tete (jj/mm/aaaa, jj-mm-aa, aaaa-mm-jj)
// - fournisseur : ligne d'en-tete contenant une forme sociale (SAS, SARL...),
//   sinon la premiere ligne significative du document
function factureDetectMeta(text) {
    const rawLines = String(text || '').split(/\r?\n/).map(l => l.trim())
        .filter(l => l && !/^<<<PAGE/.test(l));
    const head = rawLines.slice(0, 20);
    let date = '';
    let supplier = '';
    let invoiceNumber = '';

    const dateRe = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/g;
    const isoDateRe = /(\d{4})-(\d{2})-(\d{2})/;
    for (const line of rawLines) {
        if (!date) {
            let m;
            while ((m = dateRe.exec(line))) {
                let [, d, mo, y] = m;
                if (y.length === 2) y = (parseInt(y, 10) > 50 ? '19' : '20') + y;
                if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) {
                    date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    break;
                }
            }
            if (!date) {
                const iso = isoDateRe.exec(line);
                if (iso) date = iso[0];
            }
        }
        if (!invoiceNumber) {
            const m = /(?:facture|invoice)[^0-9A-Za-z]{0,4}(?:n[°ºo]?\s*)?([A-Z0-9][A-Z0-9-]{2,})/i.exec(line);
            if (m) invoiceNumber = m[1].replace(/[-\s]+$/, '');
        }
        if (!supplier && /(\b|\s)(SAS|SARL|SASU|EURL|SCI|SNC|S\.A\.|S\.A\.S|SA|EI|SARL\b)/i.test(line) && /[a-z\u00e0-\u00ff]{3,}/i.test(line)) {
            supplier = line.replace(/\s{2,}/g, ' ').slice(0, 80);
        }
        if (date && invoiceNumber && supplier) break;
    }
    if (!supplier) {
        const noise = /facture|invoice|date|tva|siret|siren|iban|rip|total|adresse|tel|fax|www|http|@|page\b/i;
        for (const line of head) {
            if (line.length >= 3 && line.length <= 60 && /[a-z\u00e0-\u00ff]{3,}/i.test(line) && !noise.test(line) && !/^\d+$/.test(line)) {
                supplier = line.slice(0, 80);
                break;
            }
        }
    }
    return { supplier, invoice_number: invoiceNumber, date };
}

// ---------- Pré-catégorisation des lignes (détail comptable) ----------

// Mots-clés -> { category, subcategory } pour pré-remplir la catégorie de
// chaque ligne de facture. Les sous-catégories reprennent celles du module
// comptable (CABINET_CATEGORIES) pour alimenter le détail du dashboard.
const FACTURE_LINE_KEYWORDS = [
    [/gant|masque|compresse|seringue|aiguille|pansement|sparadrap|suture|trod|test rapid|vaccin|serum|physio|azote|coton|tuberculine|bistouri|sonde|sac urine|curette|speculum|compress|stetoscope bip/i, 'consommables', 'Consommables m\u00e9dicaux'],
    [/anios|surfanios|d\u00e9sinfect|gel hydro|hydroalcool|javel|bactéricid|nettoy|entretien|essuie|sopalin|sac poubelle|dasri|collecteur/i, 'consommables', 'Nettoyage / produits d\u2019entretien'],
    [/blouse|charlotte|surblouse|uniforme/i, 'consommables', 'Uniformes / blouses'],
    [/drap|al\u00e8se|linge|oreiller|coussin|taie/i, 'consommables', 'Literie / linge cabinet'],
    [/papiers? patient|feuille soin|m\u00e9mo|carnet|ordonnancier/i, 'consommables', 'Consommables m\u00e9dicaux'],
    [/papier|ramette|stylo|cartouche|encre|enveloppe|classeur|chemise|agrafe|bureautique/i, 'fournitures', 'Fournitures bureau'],
    [/caf\u00e9|th\u00e9|gobelet|sucre|biscotte|accuei/i, 'fournitures', 'Caf\u00e9 / accueil patients'],
    [/imprimante|ordinateur|ecran|clavier|souris|cable|toner|usb|informatique/i, 'logiciel', 'Mat\u00e9riel informatique'],
    [/logiciel|licence|abonnement|hebergement|h\u00e9bergement|sauvegarde|t\u00e9l\u00e9transmission|signature|maintenance info/i, 'logiciel', 'Logiciel de gestion'],
    [/lecteur carte vitale|electrocardio|\u00e9lectrocardio|tensiom|otoscope|materiel medical|mobilier medical|lampes? examen|table examen/i, 'materiel', 'Mat\u00e9riel m\u00e9dical (investissement)'],
    [/tel|telephone|mobile|internet|abonnement tel/i, 'services', 'T\u00e9l\u00e9phone fixe'],
    [/blouse.*nettoyage|lingerie|blouses? .*linge|pressing/i, 'services', 'Nettoyage blouses / linge'],
    [/destruction|dasri|collecte/i, 'services', 'Destruction DASRI'],
    [/timbre|affranch|la poste/i, 'services', 'Affranchissement / La Poste']
];

function factureSuggestCategory(label) {
    const low = String(label || '').toLowerCase();
    for (const [re, cat, sous] of FACTURE_LINE_KEYWORDS) {
        if (re.test(low)) return { category: cat, subcategory: sous };
    }
    return { category: 'consommables', subcategory: '' };
}

function factureCatOptions(selected) {
    const cats = [
        ['consommables', 'Consommables & fournitures m\u00e9dicales'],
        ['fournitures', 'Fournitures bureau & petit mat\u00e9riel'],
        ['materiel', 'Mat\u00e9riel & \u00e9quipement'],
        ['logiciel', 'Informatique : logiciels, maintenance'],
        ['services', 'Abonnements : t\u00e9l, internet, divers'],
        ['charges', 'Local : loyer & charges'],
        ['reception', 'R\u00e9ception & divers'],
        ['autres_depenses', 'Autres d\u00e9penses']
    ];
    return cats.map(([v, lbl]) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${lbl}</option>`).join('');
}

function factureSousOptions(cat, selected) {
    let sous = [];
    try {
        if (typeof CABINET_CATEGORIES !== 'undefined' && CABINET_CATEGORIES[cat] && Array.isArray(CABINET_CATEGORIES[cat].sous)) {
            sous = CABINET_CATEGORIES[cat].sous.slice();
        }
    } catch (e) {}
    if (selected && !sous.includes(selected)) sous.push(selected);
    return `<option value="">\u2014</option>` + sous.map(v =>
        `<option value="${factureEscapeHtml(v)}" ${v === selected ? 'selected' : ''}>${factureEscapeHtml(v)}</option>`).join('');
}

// ---------- Association ligne facture <-> référence du bon de commande ----------

function factureNorm(s) {
    return String(s || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ').trim();
}

function factureMatchScore(lineLabel, itemName) {
    const a = factureNorm(lineLabel);
    const b = factureNorm(itemName);
    if (!a || !b) return 0;
    const ta = a.split(' ').filter(w => w.length > 2);
    const tb = b.split(' ').filter(w => w.length > 2);
    if (!ta.length || !tb.length) return 0;
    let hits = 0;
    for (const w of ta) if (tb.includes(w) || tb.some(x => x.startsWith(w.slice(0, 4)))) hits++;
    return hits / ta.length;
}

function factureAutoMatch(lines, order) {
    if (!order) return lines.map(() => null);
    const items = order.items || [];
    return lines.map(line => {
        let best = null, bestScore = 0;
        items.forEach(it => {
            const s = factureMatchScore(line.label, it.name);
            if (s > bestScore) { bestScore = s; best = it; }
        });
        return bestScore >= 0.5 ? best : null;
    });
}

// ---------- Vue de revue ligne par ligne ----------

function factureShowReview() {
    const flow = window._factureFlow;
    if (!flow || !flow.invoice) return;
    const modal = document.getElementById('factureImportModal');
    if (!modal) return;
    const inv = flow.invoice;
    const order = factureOrder();
    const matches = factureAutoMatch(inv.lines, order);

    if (order && !inv.supplier && order.supplier) inv.supplier = order.supplier;

    const thumbsHtml = (flow.pages || []).map((pg, i) => `
        <div style="text-align:center;">
            <img src="${pg.thumb}" alt="page ${i + 1}" onclick="factureZoom(${i})" style="max-height:120px; border-radius:8px; border:1px solid var(--color-border); cursor:zoom-in;" title="Agrandir pour v\u00e9rifier les lignes">
            <div style="display:flex; gap:4px; justify-content:center; margin-top:4px;">
                <button type="button" class="stock-icon-btn" onclick="factureRotate(${i}, -90)" title="Tourner \u00e0 gauche puis relire">\u21ba</button>
                <button type="button" class="stock-icon-btn" onclick="factureRotate(${i}, 90)" title="Tourner \u00e0 droite puis relire">\u21bb</button>
            </div>
        </div>`).join('');

    const itemOptions = (sel) => {
        if (!order) return '';
        const items = order.items || [];
        return `<option value="">— non associée —</option>` + items.map(it =>
            `<option value="${it.productId}" ${sel && sel.productId === it.productId ? 'selected' : ''}>${factureEscapeHtml(it.name)} (command\u00e9 ${it.qty})</option>`
        ).join('');
    };

    const rows = inv.lines.map((l, idx) => `
        <div class="urgence-receive-row" data-fline="${idx}">
            <div class="urgence-receive-name">
                <input type="text" class="form-input facture-line-label" data-idx="${idx}" value="${factureEscapeHtml(l.label)}" style="width:100%;">
                <span class="urgence-pointage-sub">ligne ${idx + 1} de la facture</span>
                <button type="button" class="stock-icon-btn" onclick="factureDeleteLine(${idx})" title="Retirer cette ligne">🗑️</button>
            </div>
            <div class="urgence-receive-line">
                <input type="number" min="0" step="0.01" class="form-input facture-line-qty" data-idx="${idx}" value="${l.qty || 1}" style="width:70px;" title="Quantit\u00e9">
                <span class="urgence-pointage-unit">\u00d7</span>
                <input type="number" min="0" step="0.01" class="form-input facture-line-price" data-idx="${idx}" value="${l.unit_price || (l.qty ? (l.total / l.qty).toFixed(2) : '')}" style="width:90px;" title="Prix unitaire">
                <span class="urgence-receive-line-total" data-flinetotal="${idx}">${factureFmtEur((l.unit_price || (l.qty ? l.total / l.qty : 0)) * (l.qty || 1))}</span>
            </div>
            <div class="urgence-receive-expiry-row" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
                <div style="flex:1; min-width:150px;">
                    <label>Cat\u00e9gorie de d\u00e9pense</label>
                    <select class="form-input facture-line-cat" data-idx="${idx}">${factureCatOptions(l.category)}</select>
                </div>
                <div style="flex:1; min-width:150px;">
                    <label>Sous-cat\u00e9gorie</label>
                    <select class="form-input facture-line-sous" data-idx="${idx}">${factureSousOptions(l.category, l.subcategory)}</select>
                </div>
            </div>
            ${order ? `
            <div class="urgence-receive-expiry-row">
                <label>R\u00e9f\u00e9rence du bon de commande</label>
                <select class="form-input facture-line-match" data-idx="${idx}">${itemOptions(matches[idx])}</select>
            </div>` : ''}
        </div>`).join('');

    let ecartHtml = '';
    if (order) {
        const orderTotal = (typeof urgenceOrderTotal === 'function') ? urgenceOrderTotal(order) : 0;
        const est = (typeof urgenceOrderEstimatedTotal === 'function') ? urgenceOrderEstimatedTotal(order) : orderTotal;
        const ref = order.realCost != null ? order.realCost : (est || orderTotal);
        const diff = (inv.total_ttc || 0) - ref;
        const chip = Math.abs(diff) < 0.005 || !ref
            ? '<span class="stock-chip success">\u2713 conforme au bon de commande</span>'
            : `<span class="stock-chip warning">${diff > 0 ? '+' : ''}${factureFmtEur(diff)} d\u2019\u00e9cart avec le bon de commande</span>`;
        ecartHtml = `
        <div class="urgence-receive-totals">
            <div class="urgence-receive-sum">
                <span class="urgence-receive-sum-label">Bon de commande</span>
                <strong>${ref ? factureFmtEur(ref) : '\u2014'}</strong>
            </div>
            <div class="urgence-receive-sum">
                <span class="urgence-receive-sum-label">Facture</span>
                <strong id="factureTotalDisplay">${factureFmtEur(inv.total_ttc)}</strong>
                ${chip}
            </div>
        </div>`;
    }

    const body = document.getElementById('factureImportBody');
    if (!body) return;
    body.innerHTML = `
        ${thumbsHtml ? `<div style="display:flex; gap:8px; overflow-x:auto; margin-bottom:14px;">${thumbsHtml}</div>` : ''}
        <div class="urgence-receive-totals" style="margin-bottom:14px;">
            <div class="form-group"><label>Fournisseur</label>
                <input type="text" id="factureSupplier" class="form-input" value="${factureEscapeHtml(inv.supplier)}"></div>
            <div class="form-group"><label>N\u00b0 facture</label>
                <input type="text" id="factureNumber" class="form-input" value="${factureEscapeHtml(inv.invoice_number)}"></div>
            <div class="form-group"><label>Date facture</label>
                <input type="date" id="factureDate" class="form-input" value="${factureEscapeHtml(inv.date)}"></div>
            <div class="form-group"><label>Total TTC (\u20ac)</label>
                <input type="number" min="0" step="0.01" id="factureTotal" class="form-input" value="${inv.total_ttc || ''}"></div>
        </div>
        <p class="form-hint"><strong>${order ? 'V\u00e9rifiez la facture ligne par ligne' : '\u00c9tape 1/2 \u2014 V\u00e9rifiez la facture ligne par ligne'}.</strong> ${order ? 'Chaque ligne peut \u00eatre associ\u00e9e \u00e0 une r\u00e9f\u00e9rence du bon de commande.' : 'Corrigez les lignes \u2014 l\u2019enregistrement et le rapprochement se font \u00e0 l\u2019\u00e9tape suivante.'}</p>
        ${rows}
        ${inv.lines.length === 0 ? '<p class="urgence-empty">Aucune ligne n\u2019a \u00e9t\u00e9 reconnue \u2014 ajoutez les lignes de la facture \u00e0 la main ci-dessous.</p>' : ''}
        <button type="button" class="action-btn stock-btn-tonal" style="margin-top:8px;" onclick="factureAddLine()">\uFF0B Ajouter une ligne</button>
        ${ecartHtml}`;
    body.querySelectorAll('.facture-line-cat').forEach(sel => {
        sel.addEventListener('change', () => {
            const idx = sel.dataset.idx;
            const sousSel = body.querySelector(`.facture-line-sous[data-idx="${idx}"]`);
            if (sousSel) sousSel.innerHTML = factureSousOptions(sel.value, '');
        });
    });
    body.querySelectorAll('.facture-line-qty, .facture-line-price').forEach(input => {
        input.addEventListener('input', () => {
            const idx = input.dataset.idx;
            const qty = parseFloat(body.querySelector(`.facture-line-qty[data-idx="${idx}"]`)?.value) || 0;
            const price = parseFloat(body.querySelector(`.facture-line-price[data-idx="${idx}"]`)?.value);
            const el = body.querySelector(`[data-flinetotal="${idx}"]`);
            if (el) el.textContent = (!isNaN(price) && price > 0) ? factureFmtEur(qty * price) : '\u2014';
        });
    });
    const footer = modal.querySelector('.modal-footer') || document.createElement('div');
    if (!modal.querySelector('.modal-footer')) {
        footer.className = 'modal-footer';
        modal.querySelector('.modal-card').appendChild(footer);
    }
    footer.innerHTML = `
        <button class="action-btn" onclick="factureCloseImport()">Annuler</button>
        ${order
            ? `<button class="action-btn primary" onclick="factureApplyToReception()">Appliquer \u00e0 la r\u00e9ception</button>`
            : `<button class="action-btn primary" onclick="factureStandaloneNext()">Continuer \u2192 rapprochement</button>`}`;
}

function factureReadReview() {
    const body = document.getElementById('factureImportBody');
    const flow = window._factureFlow;
    if (!body || !flow) return null;
    const inv = flow.invoice;
    inv.supplier = document.getElementById('factureSupplier')?.value?.trim() || inv.supplier;
    inv.invoice_number = document.getElementById('factureNumber')?.value?.trim() || inv.invoice_number;
    inv.date = document.getElementById('factureDate')?.value || inv.date;
    inv.total_ttc = parseFloat(document.getElementById('factureTotal')?.value) || inv.total_ttc || 0;
    inv.lines = inv.lines.map((l, idx) => {
        const qty = parseFloat(body.querySelector(`.facture-line-qty[data-idx="${idx}"]`)?.value);
        const price = parseFloat(body.querySelector(`.facture-line-price[data-idx="${idx}"]`)?.value);
        return {
            label: body.querySelector(`.facture-line-label[data-idx="${idx}"]`)?.value?.trim() || l.label,
            qty: !isNaN(qty) && qty > 0 ? qty : (l.qty || 1),
            unit_price: !isNaN(price) && price > 0 ? price : (l.unit_price || 0),
            total: (!isNaN(price) && price > 0 ? price : (l.unit_price || 0)) * (!isNaN(qty) && qty > 0 ? qty : (l.qty || 1)),
            category: body.querySelector(`.facture-line-cat[data-idx="${idx}"]`)?.value || l.category || 'consommables',
            subcategory: body.querySelector(`.facture-line-sous[data-idx="${idx}"]`)?.value || ''
        };
    });
    return inv;
}

// ---------- Ajout / suppression de lignes en revue ----------

window.factureAddLine = function() {
    const inv = factureReadReview();
    if (!inv) return;
    inv.lines.push({ label: '', qty: 1, unit_price: 0, total: 0, category: 'consommables', subcategory: '' });
    factureShowReview();
};

window.factureDeleteLine = function(idx) {
    const inv = factureReadReview();
    if (!inv) return;
    inv.lines.splice(idx, 1);
    factureShowReview();
};

// ---------- Mode commande : préremplissage de la réception ----------

window.factureApplyToReception = function() {
    const flow = window._factureFlow;
    const order = factureOrder();
    const inv = factureReadReview();
    if (!flow || !order || !inv) return;

    order._facture = {
        supplier: inv.supplier,
        number: inv.invoice_number,
        date: inv.date,
        totalTtc: inv.total_ttc,
        lines: inv.lines,
        importedAt: new Date().toISOString()
    };
    if (typeof saveUrgenceData === 'function') saveUrgenceData();

    factureCloseImport();

    const receiveModal = document.getElementById('urgenceReceiveModal');
    if (!receiveModal) {
        if (typeof urgenceReceiveOrder === 'function') urgenceReceiveOrder(order.id);
        return;
    }

    inv.lines.forEach(l => {
        let best = null, bestScore = 0;
        (order.items || []).forEach(it => {
            const s = factureMatchScore(l.label, it.name);
            if (s > bestScore) { bestScore = s; best = it; }
        });
        if (!best || bestScore < 0.5) return;
        const pid = best.productId;
        const chk = receiveModal.querySelector(`.urgence-receive-ok[data-pid="${pid}"]`);
        const qty = receiveModal.querySelector(`.urgence-receive-qty[data-pid="${pid}"]`);
        const price = receiveModal.querySelector(`.urgence-receive-price[data-pid="${pid}"]`);
        if (!chk || !qty) return;
        chk.checked = true;
        qty.disabled = false;
        const rest = best.qty - (typeof urgenceItemReceivedQty === 'function' ? urgenceItemReceivedQty(order, best) : 0);
        qty.value = Math.max(1, Math.min(l.qty || 1, rest));
        if (price && l.unit_price > 0) price.value = l.unit_price.toFixed(2);
        qty.dispatchEvent(new Event('input', { bubbles: true }));
        if (price) price.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const totalInput = document.getElementById('urgenceReceiveCost');
    if (totalInput && inv.total_ttc > 0) {
        totalInput.value = inv.total_ttc.toFixed(2);
        totalInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const msg = `Facture lue : ${inv.lines.length} ligne(s)${inv.total_ttc ? ` \u00b7 total ${factureFmtEur(inv.total_ttc)}` : ''}. V\u00e9rifiez la r\u00e9ception puis validez.`;
    if (typeof showToast === 'function') showToast(msg);
    else alert(msg);
};

// ---------- Mode autonome : rapprochement relevé / création de dépense ----------

function factureDepenseCandidates(total) {
    try {
        if (typeof cabinetDepenses === 'undefined') return [];
    } catch (e) { return []; }
    if (!total) return [];
    return cabinetDepenses
        .filter(d => {
            const a = Number(d.amount) || 0;
            if (!a) return false;
            const ratio = Math.abs(a - total) / Math.max(total, 0.01);
            return ratio <= 0.1;
        })
        .sort((a, b) => Math.abs(Number(b.amount) - total) - Math.abs(Number(a.amount) - total))
        .slice(0, 6);
}

window.factureStandaloneNext = function() {
    const flow = window._factureFlow;
    const inv = factureReadReview();
    if (!flow || !inv) return;
    if (!inv.total_ttc) {
        if (typeof showToast === 'function') showToast('Total TTC de la facture manquant', 'error');
        return;
    }
    const candidates = factureDepenseCandidates(inv.total_ttc);
    const defaultCat = (typeof fluxDetectCategory === 'function')
        ? fluxDetectCategory(inv.supplier || '', true) : 'consommables';

    const catOptions = [
        ['consommables', 'Consommables & fournitures m\u00e9dicales'],
        ['fournitures', 'Fournitures bureau & petit mat\u00e9riel'],
        ['materiel', 'Mat\u00e9riel & \u00e9quipement'],
        ['services', 'Abonnements : t\u00e9l, internet, divers'],
        ['logiciel', 'Informatique : logiciels, maintenance'],
        ['charges', 'Local : loyer & charges'],
        ['reception', 'R\u00e9ception & divers'],
        ['autres_depenses', 'Autres d\u00e9penses']
    ].map(([v, lbl]) => `<option value="${v}" ${v === defaultCat ? 'selected' : ''}>${lbl}</option>`).join('');

    const stepBanner = `<p class="form-hint" style="margin-bottom:10px;"><strong>\u00c9tape 2/2 \u2014 Rapprochement.</strong> Enregistrement de la facture et liaison avec une ligne du relev\u00e9 bancaire, ou cr\u00e9ation de la d\u00e9pense.</p>`;
    const candHtml = stepBanner + (candidates.length ? `
        <p class="form-hint">Rapprochement : une d\u00e9pense d\u00e9j\u00e0 import\u00e9e du relev\u00e9 bancaire correspond au montant de la facture. Liez la facture \u00e0 cette ligne du relev\u00e9, ou cr\u00e9ez une nouvelle d\u00e9pense.</p>
        ${candidates.map((d, i) => `
        <label class="urgence-import-mode" style="display:flex; gap:10px; align-items:flex-start; margin:8px 0; cursor:pointer;">
            <input type="radio" name="factureRappro" value="${d.id}" ${i === 0 ? 'checked' : ''} style="margin-top:3px;">
            <span><strong>${factureEscapeHtml(d.description || d.releve_libelle || 'D\u00e9pense')}</strong><br>
            <span class="urgence-pointage-sub">${d.date || ''} \u00b7 ${factureFmtEur(d.amount)}${d.releve_libelle ? ' \u00b7 ligne du relev\u00e9' : ''}</span></span>
        </label>`).join('')}
        <label class="urgence-import-mode" style="display:flex; gap:10px; align-items:flex-start; margin:8px 0; cursor:pointer;">
            <input type="radio" name="factureRappro" value="__new__" style="margin-top:3px;">
            <span><strong>Cr\u00e9er une nouvelle d\u00e9pense</strong> (facture absente du relev\u00e9)</span>
        </label>` : `
        <p class="form-hint">Aucune ligne du relev\u00e9 bancaire ne correspond au montant de la facture. Elle sera enregistr\u00e9e comme d\u00e9pense${inv.date ? ' (vous pourrez la rapprocher plus tard si elle appara\u00eet sur un relev\u00e9 \u00e0 venir)' : ''}.</p>
        <input type="hidden" name="factureRappro" value="__new__">`);

    const body = document.getElementById('factureImportBody');
    if (!body) return;
    body.innerHTML = `
        <div style="margin-bottom:12px;">
            <strong>${factureEscapeHtml(inv.supplier || 'Fournisseur')}</strong>
            ${inv.invoice_number ? `\u00b7 facture ${factureEscapeHtml(inv.invoice_number)}` : ''}
            \u00b7 ${factureFmtEur(inv.total_ttc)} \u00b7 ${inv.lines.length} ligne(s)
        </div>
        ${candHtml}
        <div class="form-group" id="factureNewDepGroup">
            <label>Cat\u00e9gorie de la d\u00e9pense</label>
            <select id="factureNewCat" class="form-input">${catOptions}</select>
        </div>`;
    body.querySelectorAll('input[name="factureRappro"]').forEach(r => {
        r.addEventListener('change', () => {
            const grp = document.getElementById('factureNewDepGroup');
            if (grp) grp.style.display = r.value === '__new__' && r.checked ? 'block' : 'none';
        });
    });
    const newRadio = body.querySelector('input[value="__new__"]');
    const grp = document.getElementById('factureNewDepGroup');
    if (grp && newRadio && newRadio.checked) grp.style.display = 'block';
    if (grp && !candidates.length) grp.style.display = 'block';

    const footer = document.querySelector('#factureImportModal .modal-footer');
    if (footer) footer.innerHTML = `
        <button class="action-btn" onclick="factureShowReview()">\u2190 Retour aux lignes</button>
        <button class="action-btn primary" onclick="factureStandaloneSave()">Enregistrer la facture</button>`;
};

window.factureStandaloneSave = async function() {
    const flow = window._factureFlow;
    const inv = flow ? flow.invoice : null;
    if (!inv) return;
    const chosen = document.querySelector('input[name="factureRappro"]:checked')?.value || '__new__';

    let depenseId = null;
    if (chosen === '__new__') {
        if (typeof currentUser === 'undefined' || !currentUser?.id) {
            if (typeof showToast === 'function') showToast('Vous devez \u00eatre connect\u00e9 pour enregistrer une d\u00e9pense', 'error');
            return;
        }
        const category = document.getElementById('factureNewCat')?.value || 'autres_depenses';
        const description = [inv.supplier, inv.invoice_number ? 'facture ' + inv.invoice_number : '', inv.lines.slice(0, 2).map(l => l.label).join(', ')]
            .filter(Boolean).join(' \u2014 ').slice(0, 180);
        const { data, error } = await supabaseClient
            .from('cabinet_depenses')
            .insert([{
                user_id: currentUser.id,
                description,
                amount: inv.total_ttc,
                category,
                date: inv.date || new Date().toISOString().split('T')[0]
            }])
            .select();
        if (error) {
            if (typeof showToast === 'function') showToast('Erreur : ' + error.message, 'error');
            return;
        }
        depenseId = data?.[0]?.id || null;
        if (typeof loadCabinetData === 'function') {
            try { await loadCabinetData(); } catch (e) {}
        }
    } else {
        depenseId = chosen;
    }

    try {
        if (typeof urgenceData === 'undefined' || !urgenceData) return;
        if (!Array.isArray(urgenceData.factures)) urgenceData.factures = [];
        urgenceData.factures.push({
            id: 'fct_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            supplier: inv.supplier,
            number: inv.invoice_number,
            date: inv.date,
            totalTtc: inv.total_ttc,
            lines: inv.lines,
            depenseId,
            importedAt: new Date().toISOString()
        });
        if (typeof saveUrgenceData === 'function') saveUrgenceData();
    } catch (e) {
        console.error('[FACTURE] Sauvegarde:', e);
    }

    factureCloseImport();
    if (typeof factureRenderList === 'function') factureRenderList();
    const msg = chosen === '__new__'
        ? `Facture enregistr\u00e9e : ${factureFmtEur(inv.total_ttc)} \u2014 d\u00e9pense cr\u00e9\u00e9e`
        : `Facture rapproch\u00e9e avec la ligne du relev\u00e9 \u2713`;
    if (typeof showToast === 'function') showToast(msg);
    else alert(msg);
};

// ---------- Liste des factures sans commande ----------

window.factureRenderList = function() {
    const panel = document.getElementById('urgenceFacturesPanel');
    if (!panel) return;
    let factures = [];
    try {
        factures = (typeof urgenceData !== 'undefined' && Array.isArray(urgenceData.factures)) ? urgenceData.factures : [];
    } catch (e) {}
    if (!factures.length) {
        panel.innerHTML = '<p class="urgence-empty">Aucune facture import\u00e9e sans bon de commande. Utilisez \u00ab Importer une facture \u00bb pour les factures anciennes ou hors syst\u00e8me de commandes.</p>';
        return;
    }
    panel.innerHTML = [...factures].reverse().map(f => {
        const dep = (() => {
            try {
                return (typeof cabinetDepenses !== 'undefined')
                    ? cabinetDepenses.find(d => d.id === f.depenseId) : null;
            } catch (e) { return null; }
        })();
        const rappro = dep
            ? `<span class="stock-chip success">rapproch\u00e9e \u2713 ${factureEscapeHtml(dep.description || '')}</span>`
            : '<span class="stock-chip warning">non rapproch\u00e9e</span>';
        const dateStr = f.importedAt ? new Date(f.importedAt).toLocaleDateString('fr-FR') : (f.date || '');
        return `
        <div class="urgence-order-card">
            <div class="urgence-order-head">
                <span class="urgence-order-avatar">${factureEscapeHtml((f.supplier || 'F').trim().charAt(0).toUpperCase() || 'F')}</span>
                <div class="urgence-order-title">
                    <strong class="urgence-order-supplier">${factureEscapeHtml(f.supplier || 'Fournisseur')}</strong>
                    <span class="urgence-order-date">Facture importée le ${dateStr} · ${(f.lines || []).length} ligne(s)</span>
                </div>
                <span class="urgence-state success">Facture</span>
            </div>
            <ul class="urgence-order-items">${(f.lines || []).map(l => `<li>${factureEscapeHtml(l.label)} \u2014 ${l.qty} \u00d7 ${factureFmtEur(l.unit_price)}${l.subcategory ? ` <span class="stock-chip neutral">${factureEscapeHtml(l.subcategory)}</span>` : ''}</li>`).join('')}</ul>
            <div class="urgence-order-foot">
                <span>Total TTC : <strong>${factureFmtEur(f.totalTtc)}</strong> ${f.number ? `\u00b7 n\u00b0 ${factureEscapeHtml(f.number)}` : ''}</span>
                <span class="urgence-order-actions">${rappro}</span>
            </div>
        </div>`;
    }).join('');
};

// ---------- D\u00e9tail comptable des lignes de factures (dashboard) ----------

// Agr\u00e8ge toutes les lignes de factures import\u00e9es (r\u00e9ceptions de commandes et
// factures autonomes) par cat\u00e9gorie puis sous-cat\u00e9gorie : le d\u00e9tail fin des
// d\u00e9penses (ex: dans \u00ab consommables \u00bb, combien de gants, de produits
// d'entretien, de literie...).
window.factureCostsDetailHtml = function() {
    const agg = new Map();
    const add = (line) => {
        if (!line || !line.label) return;
        const amount = Number(line.total) > 0 ? Number(line.total)
            : (Number(line.unit_price) || 0) * (Number(line.qty) || 1);
        if (!amount) return;
        const cat = line.category || 'consommables';
        const sous = line.subcategory || 'Non pr\u00e9cis\u00e9';
        if (!agg.has(cat)) agg.set(cat, new Map());
        const m = agg.get(cat);
        m.set(sous, (m.get(sous) || 0) + amount);
    };
    try {
        (typeof urgenceData !== 'undefined' && Array.isArray(urgenceData.orders) ? urgenceData.orders : []).forEach(o => {
            (o.receptions || []).forEach(r => (r.invoice && Array.isArray(r.invoice.lines) ? r.invoice.lines : []).forEach(add));
        });
        (typeof urgenceData !== 'undefined' && Array.isArray(urgenceData.factures) ? urgenceData.factures : []).forEach(f => {
            (f.lines || []).forEach(add);
        });
    } catch (e) { return ''; }

    const catLabels = {
        consommables: 'Consommables & fournitures m\u00e9dicales',
        fournitures: 'Fournitures bureau & petit mat\u00e9riel',
        materiel: 'Mat\u00e9riel & \u00e9quipement',
        logiciel: 'Informatique : logiciels, maintenance',
        services: 'Abonnements : t\u00e9l, internet, divers',
        charges: 'Local : loyer & charges',
        reception: 'R\u00e9ception & divers',
        autres_depenses: 'Autres d\u00e9penses'
    };
    const sections = Array.from(agg.entries()).map(([cat, sousMap]) => {
        const rows = Array.from(sousMap.entries()).sort((a, b) => b[1] - a[1]);
        const catTotal = rows.reduce((t, [v]) => t + v, 0);
        const max = rows.length ? rows[0][1] : 1;
        return `
        <div class="facture-detail-cat">
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin:14px 0 6px;">
                <strong>${factureEscapeHtml(catLabels[cat] || cat)}</strong>
                <span style="font-size:0.85rem; color:var(--color-text-secondary);">${factureFmtEur(catTotal)}</span>
            </div>
            ${rows.map(([sous, tot]) => `
            <div class="urgence-cost-cat">
                <span class="urgence-cost-cat-label">${factureEscapeHtml(sous)}</span>
                <div class="urgence-cost-cat-track"><div class="urgence-cost-bar primary" style="width:${Math.max((tot / max) * 100, 4)}%"></div></div>
                <span class="urgence-cost-cat-val">${factureFmtEur(tot)}</span>
            </div>`).join('')}
        </div>`;
    }).join('');

    if (!sections) return '';
    return `
        <h4 class="stock-section-title">D\u00e9tail des lignes de factures (par sous-cat\u00e9gorie)</h4>
        <p class="stock-cost-note">\ud83d\udcca Pr\u00e9-cat\u00e9gorisation de chaque ligne des factures import\u00e9es : le d\u00e9tail fin de vos d\u00e9penses, aliment\u00e9 automatiquement \u00e0 chaque import de facture.</p>
        ${sections}`;
};

// ---------- Visionneuse plein \u00e9cran (zoom pincement / roulette / glisser) ----------

window.factureZoom = function(pageIdx) {
    const flow = window._factureFlow;
    const pg = flow && flow.pages && flow.pages[pageIdx];
    if (!pg) return;
    document.getElementById('factureZoomModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'factureZoomModal';
    modal.style.cssText = 'position:fixed; inset:0; z-index:10001; background:rgba(0,0,0,0.92); display:flex; flex-direction:column;';
    modal.innerHTML = `
        <div style="display:flex; justify-content:flex-end; gap:8px; padding:10px 12px; color:#fff;">
            <button type="button" class="stock-icon-btn" onclick="factureZoomStep(-0.5)" title="Zoom arri\u00e8re">\u2212</button>
            <button type="button" class="stock-icon-btn" onclick="factureZoomStep(0.5)" title="Zoom avant">\uFF0B</button>
            <button type="button" class="stock-icon-btn" onclick="factureZoomReset()" title="Taille initiale">\u29A1</button>
            <button type="button" class="stock-icon-btn" onclick="factureZoomClose()" title="Fermer">\u2715</button>
        </div>
        <div id="factureZoomZone" style="flex:1; overflow:hidden; touch-action:none; display:flex; align-items:center; justify-content:center;">
            <img id="factureZoomImg" src="${pg.hires || pg.thumb}" alt="page ${pageIdx + 1}" draggable="false"
                 style="max-width:96%; max-height:96%; user-select:none; -webkit-user-drag:none; transform-origin:center center;">
        </div>
        <p style="margin:0; padding:8px 12px 12px; color:#cbd5e1; font-size:0.75rem; text-align:center;">
            Pincez ou molette pour zoomer \u00b7 glissez pour d\u00e9placer \u00b7 \u00c9chap pour fermer
        </p>`;
    document.body.appendChild(modal);

    const img = modal.querySelector('#factureZoomImg');
    const zone = modal.querySelector('#factureZoomZone');
    const st = { s: 1, x: 0, y: 0 };
    window._factureZoomState = st;
    const apply = () => { img.style.transform = `translate(${st.x}px, ${st.y}px) scale(${st.s})`; };
    window.factureZoomApply = apply;

    window.factureZoomStep = (d) => { st.s = Math.min(8, Math.max(0.3, st.s * (1 + d))); apply(); };
    window.factureZoomReset = () => { st.s = 1; st.x = 0; st.y = 0; apply(); };
    window.factureZoomClose = () => { modal.remove(); document.removeEventListener('keydown', onKey); };

    const onKey = (e) => { if (e.key === 'Escape') window.factureZoomClose(); };
    document.addEventListener('keydown', onKey);
    modal.addEventListener('click', (e) => { if (e.target === modal || e.target === zone) window.factureZoomClose(); });

    zone.addEventListener('wheel', (e) => {
        e.preventDefault();
        st.s = Math.min(8, Math.max(0.3, st.s * (e.deltaY < 0 ? 1.12 : 0.89)));
        apply();
    }, { passive: false });

    const pointers = new Map();
    let lastDist = 0;
    zone.addEventListener('pointerdown', (e) => {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            lastDist = Math.hypot(a.x - b.x, a.y - b.y);
        }
        zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener('pointermove', (e) => {
        if (!pointers.has(e.pointerId)) return;
        const prev = pointers.get(e.pointerId);
        if (pointers.size === 1) {
            st.x += e.clientX - prev.x;
            st.y += e.clientY - prev.y;
        } else if (pointers.size === 2) {
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const [a, b] = [...pointers.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (lastDist > 0) st.s = Math.min(8, Math.max(0.3, st.s * (dist / lastDist)));
            lastDist = dist;
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            apply();
            return;
        }
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        apply();
    });
    const drop = (e) => { pointers.delete(e.pointerId); lastDist = 0; };
    zone.addEventListener('pointerup', drop);
    zone.addEventListener('pointercancel', drop);
};

// ---------- Branchement ----------

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('urgenceImportFactureBtn');
    if (btn) btn.addEventListener('click', () => factureOpenImport(null));
});

console.log('[FACTURES] Module import factures charg\u00e9');
