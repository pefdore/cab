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
    const view = document.getElementById('releve-review-view');
    if (!view) return;
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

    // --- Compteur + estimation temps restant ---
    const done = pendingTransactions.filter(x => x.confirmed || x.rejected).length;
    const total = pendingTransactions.length;
    const counter = document.getElementById('review-counter');
    if (counter) {
        // rythme reel : temps moyen entre validations (memoire de session)
        if (!window._reviewTiming) window._reviewTiming = { stamps: [] };
        const remaining = total - done;
        let etaTxt = '';
        if (window._reviewTiming.stamps.length >= 2 && remaining > 0) {
            const stamps = window._reviewTiming.stamps.slice(-10);
            let sum = 0;
            for (let i = 1; i < stamps.length; i++) sum += stamps[i] - stamps[i - 1];
            const avgSec = (sum / (stamps.length - 1)) / 1000;
            const eta = Math.max(5, Math.round(avgSec * remaining));
            etaTxt = eta > 90 ? ` · ~${Math.round(eta / 60)} min restantes` : ` · ~${eta} s restantes`;
        } else if (remaining > 0) {
            // estimation par defaut : ~8 s par ligne
            const eta = remaining * 8;
            etaTxt = eta > 90 ? ` · ~${Math.round(eta / 60)} min restantes` : ` · ~${eta} s restantes`;
        }
        counter.innerHTML = `<strong>${done}</strong> / ${total} traitées · ligne <strong>${cur + 1}</strong> en cours${etaTxt}`;
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
                <span class="review-badge ${isDepense ? 'debit' : 'credit'}" onclick="event.stopPropagation(); reviewUpdateType(${index})" title="Cliquer pour inverser débit/crédit" style="cursor:pointer;">${isDepense ? '▼ DÉBIT' : '▲ CRÉDIT'}</span>
                ${isCurrent ? `<input type="number" step="0.01" value="${Math.abs(tr.amount).toFixed(2)}" onclick="event.stopPropagation()" onchange="reviewUpdateAmount(${index}, this.value)" style="width:90px; font-weight:700; font-size:0.9rem; padding:3px 6px; border-radius:6px; border:1px solid var(--color-border); ${isDepense ? 'color:#ef4444;' : 'color:#10b981;'}">` : `<span class="review-amount ${isDepense ? 'debit' : 'credit'}">${isDepense ? '-' : '+'}${Math.abs(tr.amount).toFixed(2)}€</span>`}
                ${isCurrent ? `<input type="date" value="${tr.date}" onclick="event.stopPropagation()" onchange="reviewUpdate(${index}, 'date', this.value)" style="padding:3px 6px; border-radius:6px; border:1px solid var(--color-border); font-size:0.72rem;">` : `<span class="review-date">${tr.date}</span>`}
                ${isCurrent ? `<input type="text" value="${reviewEscapeHtml(tr.description)}" placeholder="Libellé…" onclick="event.stopPropagation()" onchange="reviewUpdate(${index}, 'description', this.value)" style="flex:1; min-width:120px; padding:3px 6px; border-radius:6px; border:1px solid var(--color-border); font-size:0.78rem;">` : ''}
                ${tr.confirmed ? '<span class="review-state ok">✓ validée</span>' : ''}
                ${tr.rejected ? '<span class="review-state ko">✕ rejetée</span>' : ''}
                ${tr.duplicate && !tr.rejected ? '<span class="review-state warn">⚠ doublon</span>' : ''}
                ${isCurrent ? '<span class="review-state cur">en cours</span>' : ''}
            </div>
            <div class="review-libelle">${reviewEscapeHtml(tr.description)}</div>
            ${isCurrent ? `
            <div class="review-fields" onclick="event.stopPropagation()">
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
        renderReleveReview();
    } else {
        tr[field] = value;
        // champs inline : pas de re-render (le focus et la saisie seraient perdus)
    }
}
window.reviewUpdate = reviewUpdate;

function applyReviewSuggestion(index) {
    const tr = pendingTransactions[index];
    if (!tr) return;
    const sug = suggestSousCategorie(tr.description, tr.type === 'dépense' || tr.amount < 0);
    if (sug) { tr.sous_categorie = sug; renderReleveReview(); }
}
window.applyReviewSuggestion = applyReviewSuggestion;

// Ajoute une ligne non detectee automatiquement (saisie manuelle dans la revue)
window.reviewAddLine = function() {
    const newLine = {
        date: new Date().toISOString().split('T')[0],
        description: 'Ligne ajoutée manuellement',
        amount: 0,
        type: 'dépense',
        category: 'autres_depenses',
        sous_categorie: '',
        comment: '',
        confirmed: false,
        manual: true
    };
    // inserer a la suite de la derniere ligne traitee (validee ou rejettee),
    // pas en fin de liste
    let insertAt = pendingTransactions.length;
    for (let i = pendingTransactions.length - 1; i >= 0; i--) {
        if (pendingTransactions[i].confirmed || pendingTransactions[i].rejected) { insertAt = i + 1; break; }
    }
    pendingTransactions.splice(insertAt, 0, newLine);
    window._reviewState.current = insertAt;
    renderReleveReview();
    updatePendingCount();
};

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
    stampValidation();
    saveReviewProgress();
    advanceReview();
};

// Rejette la ligne en cours (doublon) et passe a la suivante
window.reviewReject = function() {
    const cur = window._reviewState.current;
    const tr = pendingTransactions[cur];
    if (!tr) return;
    tr.rejected = true;
    stampValidation();
    saveReviewProgress();
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
        <div style="font-size:0.7rem; color:var(--color-text-secondary); margin-bottom:6px;">Page ${label} — ligne en cours surlignée (scroll pour voir le reste du relevé)</div>
        <div id="review-pdf-inner" style="position:relative; display:inline-block; width:100%; max-width:1100px; vertical-align:top;">
            <img id="review-pdf-img" src="${imgSrc}" alt="Page ${label}" style="width:100%; display:block; border-radius:6px; box-shadow:0 2px 8px rgba(0,0,0,0.15);">
            <div id="review-hl-wrap" style="position:absolute; inset:0; overflow:hidden; border-radius:6px; pointer-events:none;">${hlHtml}</div>
        </div>`;

    // scroll automatique du bandeau pour centrer la ligne surlignee
    if (t) {
        const wrap = document.getElementById('review-hl-wrap');
        const hl = wrap ? wrap.firstElementChild : null;
        if (hl) {
            const hlTop = hl.offsetTop;
            zone.scrollTop = Math.max(0, hlTop - zone.clientHeight / 2 + hl.offsetHeight / 2);
        }
    }
}

// retrouve le rectangle (relatif) de la ligne de la transaction
function findReviewLineRect(t, pageData) {
    const byLine = {};
    pageData.itemRects.forEach(it => {
        if (!byLine[it._line]) byLine[it._line] = [];
        byLine[it._line].push(it);
    });
    // TOUJOURS matcher par date + montant (comme le crop qui marche bien) :
    // l'index _line du parser est decale par les lignes vides -> surlignage trop bas
    let line = null;
    {
        const normAmount = (str) => String(str).replace(/[\s\u00a0]/g, '').replace(',', '.');
        const amountKey = Math.abs(t.amount).toFixed(2);
        const dParts = (t.date || '').split('-');
        const dateVariants = dParts.length === 3 ? [dParts[2] + '/' + dParts[1], dParts[2] + '-' + dParts[1]] : [];
        let best = null, bestScore = 0;
        for (const [ln, items] of Object.entries(byLine)) {
            const joined = items.map(i => i.str).join(' ').toLowerCase();
            const flat = joined.replace(/[\s\u00a0]/g, '');
            const hasAmount = flat.includes(normAmount(amountKey)) || flat.includes(amountKey.replace('.', ','));
            const hasDate = dateVariants.some(v => joined.includes(v.toLowerCase()));
            const hasDesc = t.description && joined.includes(t.description.toLowerCase().split(' ').filter(w => w.length > 3)[0] || '\u0000');
            let score = 0;
            if (hasAmount) score += 2;
            if (hasDate) score += 2;
            if (hasDesc) score += 1;
            if (score > bestScore) { bestScore = score; best = parseInt(ln, 10); }
            if (hasAmount && hasDate && hasDesc) break;
        }
        if (bestScore >= 2) line = best;
    }
    if (line == null || !byLine[line]) return null;
    const items = byLine[line];
    const xs = items.map(i => i.x), ys = items.map(i => i.y);
    const yMid = (Math.min(...ys) + Math.max(...ys)) / 2;
    const sameRow = pageData.itemRects.filter(it => Math.abs(it.y - yMid) < 22);
    const rowXs = sameRow.map(i => i.x);
    const rowX1s = sameRow.map(i => i.x + (i.w || 0));
    // garde-fou : une rangee qui couvre quasi toute la largeur = en-tete de tableau,
    // pas une ligne de transaction -> selection qui decoupe mieux
    const rowW = (Math.max(...rowX1s) - Math.min(...rowXs));
    if (rowW > pageData.pageWidth * 0.93) {
        // trop large : on se limite aux items de la transaction elle-meme
        rowXs.length = 0; rowX1s.length = 0;
        items.forEach(i => { rowXs.push(i.x); rowX1s.push(i.x + (i.w || 0)); });
    }
    const x0 = Math.max(0, Math.min(...rowXs) - 15);
    const x1 = Math.min(pageData.pageWidth, Math.max(...rowX1s) + 15);
    const y0 = Math.max(0, Math.min(...ys) - 14);
    const y1 = Math.min(pageData.pageHeight, Math.max(...ys) + 26);
    return {
        x: x0 / pageData.pageWidth,
        y: y0 / pageData.pageHeight,
        w: (x1 - x0) / pageData.pageWidth,
        h: (y1 - y0) / pageData.pageHeight
    };
}
window.findReviewLineRect = findReviewLineRect;


function reviewUpdateType(index) {
    const tr = pendingTransactions[index];
    if (!tr) return;
    tr.type = (tr.type === 'dépense' || tr.amount < 0) ? 'recette' : 'dépense';
    tr.amount = tr.type === 'recette' ? Math.abs(tr.amount) : -Math.abs(tr.amount);
    renderReleveReview();
}
window.reviewUpdateType = reviewUpdateType;

function reviewUpdateAmount(index, value) {
    const tr = pendingTransactions[index];
    if (!tr) return;
    const v = parseFloat(value) || 0;
    tr.amount = (tr.type === 'recette') ? Math.abs(v) : -Math.abs(v);
    // pas de re-render : garder le focus dans le champ pendant la saisie
    updatePendingCount();
}
window.reviewUpdateAmount = reviewUpdateAmount;


// ===== Pinch-to-zoom du PDF dans le bandeau =====
(function initReviewPdfZoom() {
    if (window._reviewZoomInit) return;
    window._reviewZoomInit = true;
    const state = { scale: 1, pinchDist: 0, lastTap: 0 };

    document.addEventListener('touchstart', (e) => {
        const zone = document.getElementById('review-pdf-zone');
        const inner = document.getElementById('review-pdf-inner');
        if (!zone || !inner || !zone.contains(e.target)) return;
        if (e.touches.length === 2) {
            state.pinchDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        } else if (e.touches.length === 1) {
            // double-tap = zoom 2x / retour 1x
            const now = Date.now();
            if (now - state.lastTap < 300) {
                state.scale = state.scale > 1.2 ? 1 : 2;
                applyZoom(inner, zone);
            }
            state.lastTap = now;
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        const zone = document.getElementById('review-pdf-zone');
        const inner = document.getElementById('review-pdf-inner');
        if (!zone || !inner || !zone.contains(e.target)) return;
        if (e.touches.length === 2 && state.pinchDist) {
            e.preventDefault();
            const d = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const factor = d / state.pinchDist;
            const newScale = Math.min(5, Math.max(1, state.scale * factor));
            // reference : on garde le point median du pinch fixe
            state.scale = newScale;
            state.pinchDist = d;
            applyZoom(inner, zone);
        }
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) state.pinchDist = 0;
    }, { passive: true });

    function applyZoom(inner, zone) {
        inner.style.transform = `scale(${state.scale})`;
        inner.style.transformOrigin = 'center top';
        if (state.scale > 1) {
            inner.style.width = '100%';
            zone.style.scrollBehavior = 'auto';
        }
    }
})();


// ===== Reprise d'import : sauvegarde et chargement de l'etat de revue =====
const REVIEW_STORAGE_KEY = 'releve_review_progress_v1';

function stampValidation() {
    if (!window._reviewTiming) window._reviewTiming = { stamps: [] };
    window._reviewTiming.stamps.push(Date.now());
}

function saveReviewProgress() {
    try {
        localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify({
            savedAt: Date.now(),
            fileName: window._releveCurrentFile?.name || null,
            current: window._reviewState.current,
            transactions: pendingTransactions.map(t => ({
                date: t.date, description: t.description, amount: t.amount, type: t.type,
                category: t.category, sous_categorie: t.sous_categorie || '',
                comment: t.comment || '',
                confirmed: !!t.confirmed, rejected: !!t.rejected,
                duplicate: !!t.duplicate, manual: !!t.manual,
                _page: t._page, _line: t._line
            }))
        }));
    } catch (e) {
        console.error('[REVIEW] save progress:', e);
    }
}

window.hasSavedReview = function() {
    try {
        const raw = localStorage.getItem(REVIEW_STORAGE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        const txs = data.transactions || [];
        // une revue est reprise uniquement s'il reste des lignes non traitees
        return txs.some(t => !t.confirmed && !t.rejected);
    } catch (e) { return false; }
};

window.resumeSavedReview = function() {
    try {
        const raw = localStorage.getItem(REVIEW_STORAGE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        pendingTransactions = (data.transactions || []).map(t => ({ ...t }));
        window._reviewState.current = Math.min(data.current || 0, pendingTransactions.length - 1);
        // les references PDF (pages, extraits) sont rechargees depuis l'archive si possible
        window._releveReviewResumed = true;
        openReleveReview();
        if (typeof showToast === 'function') {
            const done = pendingTransactions.filter(t => t.confirmed || t.rejected).length;
            showToast(`Reprise : ${done}/${pendingTransactions.length} lignes déjà traitées`);
        }
        return true;
    } catch (e) {
        console.error('[REVIEW] resume:', e);
        return false;
    }
};

window.clearSavedReview = function() {
    localStorage.removeItem(REVIEW_STORAGE_KEY);
};

// sauvegarde aussi a chaque changement de ligne courante
const _origSetReviewCurrent = window.setReviewCurrent;
window.setReviewCurrent = function(index) {
    window._reviewState.current = index;
    saveReviewProgress();
    renderReleveReview();
};

// nettoyer la sauvegarde quand tout est enregistre
const _origSaveAll = window.saveAllReviewed;
window.saveAllReviewed = async function() {
    const result = await _origSaveAll();
    clearSavedReview();
    return result;
};
