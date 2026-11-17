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
    window._factureFlow = { orderId: orderId || null, files: [], thumbs: [], text: '', invoice: null };
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
        window._factureFlow.thumbs = extracted.thumbs;
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
    let text = '';
    const thumbs = [];
    for (const file of files) {
        if (file.type === 'application/pdf') {
            const pdfjsLib = window.pdfjsLib;
            if (!pdfjsLib) throw new Error('pdf.js n\u2019est pas charg\u00e9. Rafra\u00echissez la page.');
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({
                data: arrayBuffer,
                cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/cmaps/',
                cMapPacked: true
            }).promise;
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                factureSetLoading(`PDF — page ${pageNum}/${pdf.numPages}\u2026`);
                const page = await pdf.getPage(pageNum);
                const thumbViewport = page.getViewport({ scale: 0.5 });
                const thumbCanvas = document.createElement('canvas');
                thumbCanvas.height = thumbViewport.height;
                thumbCanvas.width = thumbViewport.width;
                await page.render({ canvasContext: thumbCanvas.getContext('2d'), viewport: thumbViewport }).promise;
                thumbs.push(thumbCanvas.toDataURL('image/jpeg', 0.7));

                const textContent = await page.getTextContent();
                let pageText = textContent.items
                    .map(item => (item.str || '') + (item.hasEOL ? '\n' : ' '))
                    .join('').replace(/[ \t]+/g, ' ').trim();

                if (pageText.length < 20) {
                    const viewport = page.getViewport({ scale: 2.0 });
                    const canvas = document.createElement('canvas');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    pageText = await factureOcr(blob);
                }
                text += '\n<<<PAGE ' + pageNum + '>>>\n' + pageText + '\n';
            }
        } else if (file.type && file.type.startsWith('image/')) {
            factureSetLoading(`Photo ${thumbs.length + 1}/${files.length}\u2026`);
            const thumb = await factureThumbDataUrl(file);
            thumbs.push(thumb);
            text += '\n<<<PAGE ' + (thumbs.length) + '>>>\n' + (await factureOcr(file)) + '\n';
        }
    }
    if (!text.trim()) throw new Error('aucun texte reconnu');
    return { text, thumbs };
}

async function factureOcr(blob) {
    const result = await Tesseract.recognize(blob, 'fra+eng', {
        logger: m => console.log('[FACTURE][TESSERACT]', m.status, m.progress)
    });
    return result.data.text || '';
}

async function factureThumbDataUrl(file) {
    const img = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const im = new Image();
        im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
        im.onerror = reject;
        im.src = url;
    });
    const maxW = 420;
    const scale = Math.min(1, maxW / (img.width || maxW));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((img.width || maxW) * scale));
    canvas.height = Math.max(1, Math.round((img.height || maxW) * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
}

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
        lines: (inv.lines || []).map(l => ({
            label: String(l.label || '').trim(),
            qty: Number(l.qty) || 1,
            unit_price: Number(l.unit_price) || 0,
            total: Number(l.total) || 0
        })).filter(l => l.label)
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
        lines.push({ label: cleanLabel || label, qty, unit_price: Math.round((amount / qty) * 100) / 100, total: amount });
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
    const head = rawLines.slice(0, 12);
    let date = '';
    let supplier = '';
    let invoiceNumber = '';

    for (const line of head) {
        if (!date) {
            let m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(line);
            if (m) {
                let [, d, mo, y] = m;
                if (y.length === 2) y = (parseInt(y, 10) > 50 ? '19' : '20') + y;
                if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) {
                    date = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
                }
            }
            if (!date) {
                m = /(\d{4})-(\d{2})-(\d{2})/.exec(line);
                if (m) date = m[0];
            }
        }
        if (!invoiceNumber) {
            const m = /(?:facture|invoice)[^0-9A-Za-z]{0,4}(?:n[°ºo]?\s*)?([A-Z0-9][A-Z0-9-]{2,})/i.exec(line);
            if (m) invoiceNumber = m[1].replace(/[-\s]+$/, '');
        }
        if (!supplier && /(\b|\s)(SAS|SARL|SASU|EURL|SCI|SNC|S\.A\.|S\.A\.S|SA|EI|SARL\b)/i.test(line) && /[a-z]{3,}/i.test(line)) {
            supplier = line.replace(/\s{2,}/g, ' ').slice(0, 80);
        }
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

    const thumbsHtml = (flow.thumbs || []).map(t =>
        `<img src="${t}" alt="page facture" style="max-height:120px; border-radius:8px; border:1px solid var(--color-border);">`
    ).join('');

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
            </div>
            <div class="urgence-receive-line">
                <input type="number" min="0" step="0.01" class="form-input facture-line-qty" data-idx="${idx}" value="${l.qty || 1}" style="width:70px;" title="Quantit\u00e9">
                <span class="urgence-pointage-unit">\u00d7</span>
                <input type="number" min="0" step="0.01" class="form-input facture-line-price" data-idx="${idx}" value="${l.unit_price || (l.qty ? (l.total / l.qty).toFixed(2) : '')}" style="width:90px;" title="Prix unitaire">
                <span class="urgence-receive-line-total" data-flinetotal="${idx}">${factureFmtEur((l.unit_price || (l.qty ? l.total / l.qty : 0)) * (l.qty || 1))}</span>
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
        <p class="form-hint">V\u00e9rifiez et corrigez chaque ligne lue par la reconnaissance. ${order ? 'Chaque ligne peut \u00eatre associ\u00e9e \u00e0 une r\u00e9f\u00e9rence du bon de commande.' : ''}</p>
        ${rows}
        ${ecartHtml}`;
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
            : `<button class="action-btn primary" onclick="factureStandaloneNext()">Enregistrer la facture</button>`}`;
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
            total: (!isNaN(price) && price > 0 ? price : (l.unit_price || 0)) * (!isNaN(qty) && qty > 0 ? qty : (l.qty || 1))
        };
    });
    return inv;
}

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

    const candHtml = candidates.length ? `
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
        <input type="hidden" name="factureRappro" value="__new__">`;

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
        <button class="action-btn" onclick="factureCloseImport()">Annuler</button>
        <button class="action-btn primary" onclick="factureStandaloneSave()">Valider le rapprochement</button>`;
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
            <ul class="urgence-order-items">${(f.lines || []).map(l => `<li>${factureEscapeHtml(l.label)} \u2014 ${l.qty} \u00d7 ${factureFmtEur(l.unit_price)}</li>`).join('')}</ul>
            <div class="urgence-order-foot">
                <span>Total TTC : <strong>${factureFmtEur(f.totalTtc)}</strong> ${f.number ? `\u00b7 n\u00b0 ${factureEscapeHtml(f.number)}` : ''}</span>
                <span class="urgence-order-actions">${rappro}</span>
            </div>
        </div>`;
    }).join('');
};

// ---------- Branchement ----------

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('urgenceImportFactureBtn');
    if (btn) btn.addEventListener('click', () => factureOpenImport(null));
});

console.log('[FACTURES] Module import factures charg\u00e9');
