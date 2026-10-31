// ===== Vue plein écran de revue d'import de relevé =====
// Bandeau PDF en haut (~30% de page) avec ligne en cours surlignée,
// liste des lignes pré-formatées en dessous, validation séquentielle.

window._reviewState = { current: 0 };

function reviewEscapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Ouvre la vue de revue (apres parsing du PDF)
window.openReleveReview = function() {
    if (!pendingTransactions.length) return;
    window._reviewState.current = pendingTransactions.findIndex(t => !t.confirmed && !t.rejected);
    if (window._reviewState.current < 0) window._reviewState.current = 0;
    document.getElementById('releve-upload-modal').style.display = 'none';
    const v = document.getElementById('releve-review-view');
    if (v) v.style.display = 'block';
    document.body.style.overflow = 'hidden';
    renderReleveReview();
};

window.closeReleveReview = function() {
    const v = document.getElementById('releve-review-view');
    if (v) v.style.display = 'none';
    document.body.style.overflow = '';
    // retour au modal d'import classique pour finaliser
    document.getElementById('releve-upload-modal').style.display = 'flex';
    if (typeof renderTransactionsList === 'function') renderTransactionsList();
    updatePendingCount();
};

// ===== Rendu de la vue =====
window.renderReleveReview = function() {
    const listEl = document.getElementById('review-lines-list');
    const pdfZone = document.getElementById('review-pdf-zone');
    if (!listEl) return;

    const cur = window._reviewState.current;
    const t = pendingTransactions[cur];

    // --- Bandeau PDF : rendu de la page courante avec surlignage de la ligne ---
    renderReviewPdf(t);

    // --- Compteur ---
    const done = pendingTransactions.filter(x => x.confirmed || x.rejected).length;
    const total = pendingTransactions.length;
    const counter = document.getElementById('review-counter');
    if (counter) {
        counter.innerHTML = `<strong>${done}</strong> / ${total} traitées · ligne <strong>${cur + 1}</strong> en cours`;
    }

    // --- Liste des lignes ---
    const depenseCategories = [
        { value: 'charges', label: 'Local & charges' }, { value: 'masse_salariale', label: 'Salaires & personnel' },
        { value: 'urssaf', label: 'Cotisations sociales' }, { value: 'impots', label: 'Impôts & taxes' },
        { value: 'logiciel', label: 'Logiciels & télétransmission' }, { value: 'services', label: 'Services & abonnements' },
        { value: 'consommables', label: 'Consommables & matériel médical' }, { value: 'fournitures', label: 'Fournitures & petit équipement' },
        { value: 'materiel', label: 'Matériel & équipement' }, { value: 'communication', label: 'Communication, site & formation' },
        { value: 'deplacements', label: 'Déplacements & véhicule' }, { value: 'assurance', label: 'Assurances' },
        { value: 'comptabilite', label: 'Comptabilité & juridique' }, { value: 'scm', label: 'Frais de structure SCM / SCP' },
        { value: 'banque', label: 'Frais bancaires' }, { value: 'remboursement_credit', label: 'Crédits & emprunts' },
        { value: 'reception', label: 'Réception & représentation' }, { value: 'autres_depenses', label: 'Autres dépenses' }
    ];
    const recetteCategories = [
        { value: 'honoraires', label: 'Honoraires consultations & actes' }, { value: 'honoraires_chirurgie', label: 'Honoraires chirurgie (CCAM, IBODE)' },
        { value: 'secteur2_depassements', label: 'Secteur 2 & dépassements' }, { value: 'gardes_urgences', label: 'Gardes & urgences' },
        { value: 'remplacements', label: 'Remplacements & vacations' }, { value: 'participation_associe', label: 'Participation associé' },
        { value: 'retrocessions', label: 'Rétrocessions' }, { value: 'remboursements', label: 'Remboursements' },
        { value: 'produits_financiers', label: 'Produits financiers' }, { value: 'vente_materiel', label: 'Vente de matériel' },
        { value: 'autres', label: 'Autres recettes' }
    ];

    listEl.innerHTML = pendingTransactions.map((tr, index) => {
        const isDepense = tr.type === 'dépense' || tr.amount < 0;
        const categories = isDepense ? depenseCategories : recetteCategories;
        const selectedCategory = tr.category || (isDepense ? 'services' : 'autres');
        const isCurrent = index === cur;
        const isDone = tr.confirmed || tr.rejected;
        const sousCatSuggestion = (typeof suggestSousCategorie === 'function') ? suggestSousCategorie(tr.description, isDepense) : null;
        return `
        <div class="review-line ${isCurrent ? 'current' : ''} ${tr.confirmed ? 'confirmed' : ''} ${tr.rejected ? 'rejected' : ''} ${tr.duplicate ? 'dup' : ''}" data-index="${index}" onclick="setReviewCurrent(${index})">
            <div class="review-line-head">
                <span class="review-badge ${isDepense ? 'debit' : 'credit'}">${isDepense ? '▼ DÉBIT' : '▲ CRÉDIT'}</span>
                <span class="review-amount ${isDepense ? 'debit' : 'credit'}">${isDepense ? '-' : '+'}${Math.abs(tr.amount).toFixed(2)}€</span>
                <span class="review-date">${tr.date}</span>
                ${tr.confirmed ? '<span class="review-state ok">✓ validée</span>' : ''}
                ${tr.rejected ? '<span class="review-state ko">✕ rejetée</span>' : ''}
                ${tr.duplicate && !tr.rejected ? '<span class="review-state warn">⚠ doublon</span>' : ''}
                ${isCurrent ? '<span class="review-state cur">en cours</span>' : ''}
            </div>
            <div class="review-libelle">${reviewEscapeHtml(tr.description)}</div>
            ${isCurrent ? `
            <div class="review-fields">
                <div class="review-field">
                    <label>Type</label>
                    <select onchange="reviewUpdate(${index}, 'type', this.value)">
                        <option value="dépense" ${isDepense ? 'selected' : ''}>Dépense</option>
                        <option value="recette" ${!isDepense ? 'selected' : ''}>Recette</option>
                    </select>
                </div>
                <div class="review-field">
                    <label>Catégorie</label>
                    <select onchange="reviewUpdate(${index}, 'category', this.value)">
                        ${categories.map(c => `<option value="${c.value}" ${c.value === selectedCategory ? 'selected' : ''}>${c.label}</option>`).join('')}
                    </select>
                </div>
                <div class="review-field grow">
                    <label>Sous-catégorie ${sousCatSuggestion ? `<button class="review-sug-btn" onclick="event.stopPropagation(); applyReviewSuggestion(${index})">✨ ${reviewEscapeHtml(sousCatSuggestion)}</button>` : ''}</label>
                    <input type="text" value="${reviewEscapeHtml(tr.sous_categorie || '')}" placeholder="${sousCatSuggestion ? 'Suggéré : ' + reviewEscapeHtml(sousCatSuggestion) : 'Sous-catégorie libre…'}" onchange="reviewUpdate(${index}, 'sous_categorie', this.value)">
                </div>
                <div class="review-field grow">
                    <label>Commentaire</label>
                    <input type="text" value="${reviewEscapeHtml(tr.comment || '')}" placeholder="＋ commentaire…" onchange="reviewUpdate(${index}, 'comment', this.value)">
                </div>
            </div>` : ''}
        </div>`;
    }).join('');

    // scroll auto vers la ligne en cours
    const curEl = listEl.querySelector('.review-line.current');
    if (curEl) curEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
};

function reviewUpdate(index, field, value) {
    const tr = pendingTransactions[index];
    if (!tr) return;
    if (field === 'type') {
        tr.amount = value === 'recette' ? Math.abs(tr.amount) : -Math.abs(tr.amount);
        tr.type = value;
    } else {
        tr[field] = value;
    }
    renderReleveReview();
}
window.reviewUpdate = reviewUpdate;

function applyReviewSuggestion(index) {
    const tr = pendingTransactions[index];
    if (!tr) return;
    const sug = suggestSousCategorie(tr.description, tr.type === 'dépense' || tr.amount < 0);
    if (sug) { tr.sous_categorie = sug; renderReleveReview(); }
}
window.applyReviewSuggestion = applyReviewSuggestion;

window.setReviewCurrent = function(index) {
    window._reviewState.current = index;
    renderReleveReview();
};

// Valide la ligne en cours et passe a la suivante
window.reviewValidate = function() {
    const cur = window._reviewState.current;
    const tr = pendingTransactions[cur];
    if (!tr) return;
    tr.confirmed = true;
    advanceReview();
};

// Rejette la ligne en cours (doublon) et passe a la suivante
window.reviewReject = function() {
    const cur = window._reviewState.current;
    const tr = pendingTransactions[cur];
    if (!tr) return;
    tr.rejected = true;
    advanceReview();
};

function advanceReview() {
    const cur = window._reviewState.current;
    // prochaine ligne non traitee
    let next = -1;
    for (let i = 0; i < pendingTransactions.length; i++) {
        if (!pendingTransactions[i].confirmed && !pendingTransactions[i].rejected) { next = i; break; }
    }
    if (next === -1) {
        // tout est traite -> enregistrer
        if (typeof saveAllReviewed === 'function') saveAllReviewed();
        return;
    }
    window._reviewState.current = next;
    renderReleveReview();
}
window.advanceReview = advanceReview;

// Enregistre toutes les lignes validees (reutilise confirmAllTransactions)
window.saveAllReviewed = async function() {
    const hasValid = pendingTransactions.some(t => t.confirmed && !t.rejected);
    if (!hasValid) {
        alert('Aucune ligne validée.');
        return;
    }
    document.getElementById('releve-review-view').style.display = 'none';
    document.body.style.overflow = '';
    if (typeof confirmAllTransactions === 'function') {
        await confirmAllTransactions();
    }
};

// ===== Bandeau PDF avec surlignage de la ligne en cours =====
async function renderReviewPdf(t) {
    const zone = document.getElementById('review-pdf-zone');
    if (!zone) return;
    const thumbs = window.relevePageThumbs || [];
    if (!thumbs.length) {
        zone.innerHTML = '<div style="color:var(--color-text-secondary); font-size:0.8rem; padding:20px;">PDF non disponible.</div>';
        return;
    }
    let pageIdx = 0;
    if (t && t._page != null) {
        const i = thumbs.findIndex(p => p.page === t._page);
        if (i >= 0) pageIdx = i;
    }
    const pageData = thumbs[pageIdx];
    const hires = (typeof getHiResPage === 'function') ? await getHiResPage(pageIdx, pageData) : null;
    const imgSrc = hires ? hires.dataUrl : pageData.thumb;
    const label = pageData ? pageData.page : '?';

    // rectangle surligne (coordonnees relatives de la ligne)
    let hlHtml = '';
    if (t && pageData && pageData.itemRects && pageData.itemRects.length && typeof releveCropLineDataUrl === 'function') {
        try {
            const m = findReviewLineRect(t, pageData);
            if (m) {
                hlHtml = `<div style="position:absolute; left:${m.x * 100}%; top:${m.y * 100}%; width:${m.w * 100}%; height:${m.h * 100}%; background:rgba(59,130,246,0.25); border:2px solid #3b82f6; border-radius:3px; box-shadow:0 0 0 2000px rgba(0,0,0,0.15); pointer-events:none;"></div>`;
            }
        } catch (e) {}
    }

    zone.innerHTML = `
        <div style="position:relative; display:inline-block; max-width:100%; max-height:100%;">
            <img src="${imgSrc}" alt="Page ${label}" style="max-height:calc(30vh - 60px); max-width:100%; display:block; border-radius:6px; box-shadow:0 2px 8px rgba(0,0,0,0.15);">
            ${hlHtml}
        </div>
        <div style="font-size:0.7rem; color:var(--color-text-secondary); margin-top:4px;">Page ${label} — ligne en cours surlignée</div>`;
}

// retrouve le rectangle (relatif) de la ligne de la transaction
function findReviewLineRect(t, pageData) {
    const byLine = {};
    pageData.itemRects.forEach(it => {
        if (!byLine[it._line]) byLine[it._line] = [];
        byLine[it._line].push(it);
    });
    let line = null;
    if (t._line != null && byLine[t._line]) line = t._line;
    if (line == null) {
        // matching montant + date (comme releveCropLineDataUrl)
        const normAmount = (str) => String(str).replace(/[\s\u00a0]/g, '').replace(',', '.');
        const amountKey = Math.abs(t.amount).toFixed(2);
        const dParts = (t.date || '').split('-');
        const dateVariants = dParts.length === 3 ? [dParts[2] + '/' + dParts[1]] : [];
        for (const [ln, items] of Object.entries(byLine)) {
            const joined = items.map(i => i.str).join(' ').toLowerCase();
            const flat = joined.replace(/[\s\u00a0]/g, '');
            const hasAmount = flat.includes(normAmount(amountKey)) || flat.includes(amountKey.replace('.', ','));
            const hasDate = dateVariants.some(v => joined.includes(v.toLowerCase()));
            if (hasAmount && hasDate) { line = parseInt(ln, 10); break; }
        }
    }
    if (line == null || !byLine[line]) return null;
    const items = byLine[line];
    const yMid = (Math.min(...items.map(i => i.y)) + Math.max(...items.map(i => i.y))) / 2;
    const sameRow = pageData.itemRects.filter(it => Math.abs(it.y - yMid) < 22);
    const xs = sameRow.map(i => i.x), x1s = sameRow.map(i => i.x + (i.w || 0));
    const ys = items.map(i => i.y);
    const x0 = Math.max(0, Math.min(...xs) - 15);
    const x1 = Math.min(pageData.pageWidth, Math.max(...x1s) + 15);
    const y0 = Math.max(0, Math.min(...ys) - 8);
    const y1 = Math.min(pageData.pageHeight, Math.max(...ys) + 16);
    return {
        x: x0 / pageData.pageWidth,
        y: y0 / pageData.pageHeight,
        w: (x1 - x0) / pageData.pageWidth,
        h: (y1 - y0) / pageData.pageHeight
    };
}
window.findReviewLineRect = findReviewLineRect;
