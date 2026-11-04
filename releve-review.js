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
    const disclaimer = document.getElementById('review-disclaimer');
    if (disclaimer) {
        const hidden = sessionStorage.getItem('reviewDisclaimerHidden') === '1';
        disclaimer.style.display = hidden ? 'none' : 'flex';
    }
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
    // sauvegarder la progression AVANT de quitter
    const remaining = pendingTransactions.filter(t => !t.confirmed && !t.rejected).length;
    if (remaining > 0) {
        saveReviewProgress();
        const done = pendingTransactions.length - remaining;
        if (typeof showToast === 'function') {
            showToast(`⏸ Progression sauvegardée (${done}/${pendingTransactions.length}) — cliquez sur « Reprendre l'import » pour continuer`);
        }
    }
    // retour au modal d'import classique pour finaliser
    const uploadModal = document.getElementById('releve-upload-modal');
    if (uploadModal) {
        uploadModal.style.display = 'flex';
        if (typeof refreshReviewResumeBanner === 'function') refreshReviewResumeBanner();
    }
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

    // --- Bloc progression + estimation temps restant ---
    const done = pendingTransactions.filter(x => x.confirmed || x.rejected).length;
    const total = pendingTransactions.length;
    const counter = document.getElementById('review-counter');
    if (counter) {
        if (!window._reviewTiming) window._reviewTiming = { stamps: [] };
        const remaining = total - done;
        let etaSec = null;
        if (window._reviewTiming.stamps.length >= 2 && remaining > 0) {
            const stamps = window._reviewTiming.stamps.slice(-10);
            let sum = 0;
            for (let i = 1; i < stamps.length; i++) sum += stamps[i] - stamps[i - 1];
            const avgSec = (sum / (stamps.length - 1)) / 1000;
            etaSec = Math.max(5, Math.round(avgSec * remaining));
        } else if (remaining > 0) {
            etaSec = remaining * 8;
        }
        let etaHtml = '';
        if (remaining > 0 && etaSec !== null) {
            etaHtml = etaSec >= 60
                ? `<span class="review-eta"><span class="review-eta-num">~${Math.max(1, Math.round(etaSec / 60))}</span> min restantes</span>`
                : `<span class="review-eta"><span class="review-eta-num">~${etaSec}</span> s restantes</span>`;
        } else {
            etaHtml = `<span class="review-eta done">✓ Terminé !</span>`;
        }
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        counter.innerHTML = `${etaHtml}
            <span class="review-progress-wrap">
                <span class="review-progress-bar"><span class="review-progress-fill" style="width:${pct}%;"></span></span>
                <span class="review-progress-txt"><strong>${done}</strong>/${total} · ${pct}%</span>
            </span>`;
    }

    // --- Liste des lignes ---
    const depenseCategories = [
        { value: 'masse_salariale', label: 'Personnel : salaires, secrétariat, ménage' },
        { value: 'urssaf', label: 'Charges sociales sur salaires' },
        { value: 'charges', label: 'Local : loyer & charges' },
        { value: 'impots', label: 'Impôts & taxes' },
        { value: 'logiciel', label: 'Informatique : logiciels, maintenance' },
        { value: 'services', label: 'Abonnements : tél, internet, divers' },
        { value: 'consommables', label: 'Consommables & fournitures médicales' },
        { value: 'fournitures', label: 'Fournitures bureau & petit matériel' },
        { value: 'materiel', label: 'Matériel & équipement' },
        { value: 'comptabilite', label: 'Expert-comptable, juridique' },
        { value: 'assurance', label: 'Assurances' },
        { value: 'banque', label: 'Frais bancaires' },
        { value: 'remboursement_credit', label: 'Crédits, emprunts & leasing' },
        { value: 'reception', label: 'Réception & divers' },
        { value: 'autres_depenses', label: 'Autres dépenses' }
    ];
    const recetteCategories = [
        { value: 'participation_associe', label: 'Cotisation / quote-part des associés' },
        { value: 'participation_ponctuelle', label: 'Participation ponctuelle des associés' },
        { value: 'remboursements', label: 'Remboursements (URSSAF, assurance)' },
        { value: 'produits_financiers', label: 'Produits financiers (intérêts)' },
        { value: 'autres', label: 'Autres recettes' }
    ];

    // lignes traitees masquees par defaut (option de revoir)
    const showDone = window._reviewShowDone === true;
    const visible = pendingTransactions
        .map((tr, index) => ({ tr, index }))
        .filter(({ tr }) => showDone || (!tr.confirmed && !tr.rejected));
    const doneCount = pendingTransactions.filter(tr => tr.confirmed || tr.rejected).length;

    listEl.innerHTML = `
    ${doneCount > 0 ? `<button class="review-btn" style="margin-bottom:8px; font-size:0.72rem;" onclick="toggleReviewShowDone()">${showDone ? '▲ Masquer les lignes traitées' : `▼ Voir les ${doneCount} ligne${doneCount > 1 ? 's' : ''} traitée${doneCount > 1 ? 's' : ''}`}</button>` : ''}
    ` + visible.map(({ tr, index }) => {
        const isDepense = tr.type === 'dépense' || tr.amount < 0;
        const categories = isDepense ? depenseCategories : recetteCategories;
        const _normCat = (typeof normalizeFluxCategory === 'function') ? normalizeFluxCategory(tr.category, isDepense) : (tr.category || (isDepense ? 'autres_depenses' : 'autres'));
        const selectedCategory = _normCat;
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
                    <div style="position:relative;">
                        <input type="text" id="review-souscat-input-${index}" value="${reviewEscapeHtml(tr.sous_categorie || '')}" placeholder="${sousCatSuggestion ? 'Suggéré : ' + reviewEscapeHtml(sousCatSuggestion) : 'Sous-catégorie libre…'}" onchange="reviewUpdate(${index}, 'sous_categorie', this.value)" oninput="showSousCatChips(${index}, this.value, ${isDepense})" onfocus="showSousCatChips(${index}, this.value, ${isDepense})" autocomplete="off">
                        <div id="review-souscat-chips-${index}" class="souscat-chips" style="display:none;"></div>
                    </div>
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
    window._reviewState.pdfPage = null;
    renderReleveReview();
}
window.advanceReview = advanceReview;

// Enregistre les lignes validees de la revue (sans passer par confirmAllTransactions
// qui exclut les lignes 'confirmed' - semantique differente du modal)
window.saveAllReviewed = async function() {
    const hasValid = pendingTransactions.some(t => t.confirmed && !t.rejected);
    if (!hasValid) {
        alert('Aucune ligne validée. Validez au moins une ligne avant d\'enregistrer.');
        return;
    }
    if (!window.currentUser?.id) {
        alert('Vous devez être connecté.');
        return;
    }

    // construire les enregistrements depuis les lignes validees (confirmed = valide dans la revue)
    const depenses = pendingTransactions
        .filter(t => t.confirmed && !t.rejected && (t.type === 'dépense' || t.amount < 0))
        .map(t => ({
            user_id: window.currentUser.id,
            description: (t.sous_categorie && t.sous_categorie.trim()) ? t.sous_categorie.trim() : t.description,
            releve_libelle: t.description,
            sous_categorie: t.sous_categorie || null,
            note: t.comment || null,
            amount: Math.abs(parseFloat(t.amount) || 0),
            category: (typeof normalizeFluxCategory === 'function') ? normalizeFluxCategory(t.category, true) : (t.category || 'autres_depenses'),
            date: t.date || new Date().toISOString().split('T')[0]
        }));
    const recettes = pendingTransactions
        .filter(t => t.confirmed && !t.rejected && (t.type === 'recette' || t.amount >= 0))
        .map(t => ({
            user_id: window.currentUser.id,
            description: (t.sous_categorie && t.sous_categorie.trim()) ? t.sous_categorie.trim() : t.description,
            releve_libelle: t.description,
            sous_categorie: t.sous_categorie || null,
            note: t.comment || null,
            amount: Math.abs(parseFloat(t.amount) || 0),
            category: (typeof normalizeFluxCategory === 'function') ? normalizeFluxCategory(t.category, false) : (t.category || 'autres'),
            date: t.date || new Date().toISOString().split('T')[0]
        }));

    let btn = null;
    try { btn = (typeof event !== 'undefined' && event?.target) ? event.target : null; } catch (e) { btn = null; }
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

    try {
        if (depenses.length) {
            const { error } = await window.supabaseClient.from('cabinet_depenses').insert(depenses);
            if (error) throw error;
        }
        if (recettes.length) {
            const { error } = await window.supabaseClient.from('cabinet_recettes').insert(recettes);
            if (error) throw error;
        }

        // trace de l'import (valide le mois) + archivage PDF + apprentissage
        if (typeof recordReleveImport === 'function') recordReleveImport(depenses, recettes);
        if (typeof saveRelevePdfToStorage === 'function') saveRelevePdfToStorage(depenses, recettes);
        if (typeof learnReleveCategorisation === 'function') {
            learnReleveCategorisation([
                ...depenses.map(d => ({ description: d.releve_libelle, category: d.category, type: 'dépense', amount: -1 })),
                ...recettes.map(r => ({ description: r.releve_libelle, category: r.category, type: 'recette', amount: 1 }))
            ]);
        }

        clearSavedReview();
        pendingTransactions = [];
        document.getElementById('releve-review-view').style.display = 'none';
        document.getElementById('releve-upload-modal').style.display = 'none';
        document.body.style.overflow = '';

        await loadCabinetData();
        renderCabinetHistory();
        renderComptaSummary();
        if (typeof renderFluxView === 'function') renderFluxView();
        if (typeof renderReminders === 'function') renderReminders();

        alert(`${depenses.length + recettes.length} ligne(s) enregistrée(s) avec succès`);

        // La banque edite parfois 2 releves par mois : proposer l'import du second
        const monthsSet = [...new Set([...depenses, ...recettes].map(t => (t.date || '').slice(0, 7)))].filter(Boolean);
        if (monthsSet.length) {
            setTimeout(() => {
                if (confirm(`Relevé de ${monthsSet.join(', ')} enregistré.\n\nAvez-vous un DEUXIÈME relevé pour ce mois-ci à intégrer ?\n\nOK = Oui, je l'importe maintenant\nAnnuler = Non, ce mois est complet`)) {
                    const uploadModal = document.getElementById('releve-upload-modal');
                    if (uploadModal) {
                        uploadModal.style.display = 'flex';
                        if (typeof refreshReviewResumeBanner === 'function') refreshReviewResumeBanner();
                    }
                }
            }, 400);
        }
    } catch (error) {
        console.error('[REVIEW] Save error:', error);
        alert('Erreur lors de l\'enregistrement : ' + error.message);
    } finally {
        if (btn) { btn.disabled = false; }
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
    const total = thumbs.length;
    let autoIdx = 0;
    if (t && t._page != null) {
        const i = thumbs.findIndex(p => p.page === t._page);
        if (i >= 0) autoIdx = i;
    }
    // page manuelle (navigation) prioritaire sur le suivi automatique de la ligne
    let pageIdx = autoIdx;
    if (window._reviewState.pdfPage != null) {
        const i = thumbs.findIndex(p => p.page === window._reviewState.pdfPage);
        if (i >= 0) pageIdx = i;
    }
    const manual = window._reviewState.pdfPage != null && pageIdx !== autoIdx;
    const pageData = thumbs[pageIdx];
    const hires = (typeof getHiResPage === 'function') ? await getHiResPage(pageIdx, pageData) : null;
    const imgSrc = hires ? hires.dataUrl : pageData.thumb;
    const label = pageData ? pageData.page : '?';
    const onTxPage = !!(t && pageData && t._page != null && pageData.page === t._page);

    // rectangle surligne (coordonnees relatives de la ligne)
    let hlHtml = '';
    if (onTxPage && pageData && pageData.itemRects && pageData.itemRects.length && typeof releveCropLineDataUrl === 'function') {
        try {
            const m = findReviewLineRect(t, pageData);
            if (m) {
                hlHtml = `<div style="position:absolute; left:${m.x * 100}%; top:${m.y * 100}%; width:${m.w * 100}%; height:${m.h * 100}%; background:rgba(59,130,246,0.25); border:2px solid #3b82f6; border-radius:3px; box-shadow:0 0 0 2000px rgba(0,0,0,0.15); pointer-events:none;"></div>`;
            }
        } catch (e) {}
    }

    const prevDisabled = pageIdx <= 0 ? ' disabled' : '';
    const nextDisabled = pageIdx >= total - 1 ? ' disabled' : '';

    zone.innerHTML = `
        <div class="review-pdf-head">
            <div class="review-pdf-nav">
                <button class="review-pdf-nav-btn" onclick="reviewPdfNav(-1)"${prevDisabled} title="Page précédente" aria-label="Page précédente">‹</button>
                <span class="review-pdf-page-label">Page <strong>${label}</strong>/${total}</span>
                <button class="review-pdf-nav-btn" onclick="reviewPdfNav(1)"${nextDisabled} title="Page suivante" aria-label="Page suivante">›</button>
            </div>
            ${manual ? `<button class="review-pdf-follow" onclick="reviewPdfFollow()" title="Revenir à la page de la ligne en cours">↺ Ligne en cours</button>` : ''}
            <span class="review-pdf-hint">${onTxPage ? 'Ligne en cours surlignée — scroll pour voir le reste de la page' : 'Page consultée manuellement'}</span>
        </div>
        <div id="review-pdf-inner" style="position:relative; display:inline-block; width:100%; max-width:1100px; vertical-align:top;">
            <img id="review-pdf-img" src="${imgSrc}" alt="Page ${label}" style="width:100%; display:block; border-radius:6px; box-shadow:0 2px 8px rgba(0,0,0,0.15);">
            <div id="review-hl-wrap" style="position:absolute; inset:0; overflow:hidden; border-radius:6px; pointer-events:none;">${hlHtml}</div>
        </div>`;

    // scroll automatique du bandeau pour centrer la ligne surlignee
    if (t && onTxPage) {
        const wrap = document.getElementById('review-hl-wrap');
        const hl = wrap ? wrap.firstElementChild : null;
        if (hl) {
            const hlTop = hl.offsetTop;
            zone.scrollTop = Math.max(0, hlTop - zone.clientHeight / 2 + hl.offsetHeight / 2);
        }
    }
}

// Navigation manuelle entre les pages du PDF (toutes les pages restent accessibles)
window.reviewPdfNav = function(dir) {
    const thumbs = window.relevePageThumbs || [];
    if (!thumbs.length) return;
    const st = window._reviewState;
    let idx;
    if (st.pdfPage == null) {
        const t = pendingTransactions[st.current];
        idx = 0;
        if (t && t._page != null) {
            const i = thumbs.findIndex(p => p.page === t._page);
            if (i >= 0) idx = i;
        }
    } else {
        idx = thumbs.findIndex(p => p.page === st.pdfPage);
        if (idx < 0) idx = 0;
    }
    idx = Math.max(0, Math.min(thumbs.length - 1, idx + dir));
    st.pdfPage = thumbs[idx].page;
    renderReleveReview();
};

window.reviewPdfFollow = function() {
    window._reviewState.pdfPage = null;
    renderReleveReview();
};

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

// --- Persistance du PDF via IndexedDB (localStorage est trop petit pour un PDF) ---
const REVIEW_PDF_IDB_NAME = 'cab-releve-review';
const REVIEW_PDF_IDB_STORE = 'pdfs';

function idbOpenDb() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('IndexedDB indisponible')); return; }
        const req = window.indexedDB.open(REVIEW_PDF_IDB_NAME, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(REVIEW_PDF_IDB_STORE)) {
                req.result.createObjectStore(REVIEW_PDF_IDB_STORE);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function idbPutPdf(key, blob) {
    return idbOpenDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(REVIEW_PDF_IDB_STORE, 'readwrite');
        tx.objectStore(REVIEW_PDF_IDB_STORE).put(blob, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    })).catch(e => console.error('[REVIEW] idb put pdf:', e));
}

function idbGetPdf(key) {
    return idbOpenDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(REVIEW_PDF_IDB_STORE, 'readonly');
        const req = tx.objectStore(REVIEW_PDF_IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    })).catch(e => { console.error('[REVIEW] idb get pdf:', e); return null; });
}

function idbClearPdf() {
    return idbOpenDb().then(db => new Promise((resolve) => {
        const tx = db.transaction(REVIEW_PDF_IDB_STORE, 'readwrite');
        tx.objectStore(REVIEW_PDF_IDB_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
    })).catch(() => {});
}
window.idbClearPdf = idbClearPdf;

// Construit les vignettes + rects de texte a partir d'un PDF pdf.js deja charge
async function buildRelevePageThumbs(pdf) {
    window.relevePageThumbs = [];
    for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 30); pageNum++) {
        const page = await pdf.getPage(pageNum);
        const thumbViewport = page.getViewport({ scale: 0.35 });
        const thumbCanvas = document.createElement('canvas');
        const thumbCtx = thumbCanvas.getContext('2d');
        thumbCanvas.height = thumbViewport.height;
        thumbCanvas.width = thumbViewport.width;
        await page.render({ canvasContext: thumbCtx, viewport: thumbViewport }).promise;
        const textContent = await page.getTextContent();
        const itemRects = [];
        let lineNo = 0;
        for (const it of textContent.items) {
            if (!it.str || !it.str.trim() || !it.transform) continue;
            if (it.hasEOL) lineNo++;
            const tx = page.getViewport({ scale: 1 }).convertToViewportPoint(it.transform[4], it.transform[5]);
            itemRects.push({ str: it.str, x: tx[0], y: tx[1], w: (it.width || 0), h: (it.height || 10), _line: lineNo });
        }
        window.relevePageThumbs.push({
            page: pageNum,
            thumb: thumbCanvas.toDataURL('image/jpeg', 0.7),
            text: '',
            itemRects,
            pageHeight: page.getViewport({ scale: 1 }).height,
            pageWidth: page.getViewport({ scale: 1 }).width
        });
    }
}

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
        // persister aussi le PDF (une seule fois par fichier) pour restaurer
        // l'apercu bandeau a la reprise, meme apres rechargement de la page
        const pdfBlob = window._relevePdfBytes;
        if (pdfBlob && window._reviewPdfIdbSavedFor !== pdfBlob) {
            window._reviewPdfIdbSavedFor = pdfBlob;
            idbPutPdf('current', pdfBlob);
        }
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

window.resumeSavedReview = async function() {
    try {
        const raw = localStorage.getItem(REVIEW_STORAGE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        pendingTransactions = (data.transactions || []).map(t => ({ ...t }));
        window._reviewState.current = Math.min(data.current || 0, pendingTransactions.length - 1);
        document.getElementById('releve-upload-modal').style.display = 'none';
        window._releveReviewResumed = true;

        // recharger le PDF : d'abord la copie locale (IndexedDB),
        // sinon l'archive Supabase (bucket releves)
        await restoreReviewPdfFromIdb(data);
        if (!(window.relevePageThumbs || []).length) {
            await restoreReviewPdfFromArchive(data);
        }

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

// recharge le PDF sauvegarde localement (IndexedDB) au moment de la fermeture
async function restoreReviewPdfFromIdb(data) {
    try {
        if (!window.relevePageThumbs) window.relevePageThumbs = [];
        if (window.relevePageThumbs.length) return;
        const blob = await idbGetPdf('current');
        if (!blob || !(blob instanceof Blob)) return;
        if (typeof window.pdfjsLib === 'undefined' || !window.pdfjsLib) return;
        const pdf = await window.pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
        window._releveCurrentPdf = pdf;
        window._relevePdfBytes = blob;
        window._reviewPdfIdbSavedFor = blob;
        window._releveCurrentFile = new File([blob], data.fileName || 'releve.pdf', { type: blob.type || 'application/pdf' });
        await buildRelevePageThumbs(pdf);
        console.log('[REVIEW] PDF restaure depuis IndexedDB');
    } catch (e) {
        console.error('[REVIEW] restore pdf (idb):', e);
    }
}
window.restoreReviewPdfFromIdb = restoreReviewPdfFromIdb;

// recharge le PDF archive pour restaurer l'aperçu bandeau
async function restoreReviewPdfFromArchive(data) {
    try {
        if (!window.supabaseClient || !window.currentUser?.id) return;
        const months = [...new Set((data.transactions || []).map(t => (t.date || '').slice(0, 7)))].filter(Boolean).sort();
        if (!months.length) return;
        const { data: urlData, error } = await window.supabaseClient.storage
            .from('releves')
            .createSignedUrl(window.currentUser.id + '/' + months[0] + '.pdf', 3600);
        if (error || !urlData?.signedUrl) return;
        const resp = await fetch(urlData.signedUrl);
        const blob = await resp.blob();
        window._releveCurrentFile = new File([blob], data.fileName || months[0] + '.pdf', { type: 'application/pdf' });
        window._relevePdfBytes = blob;
        // recharger les pages PDF (thumb + itemRects) via pdf.js
        if (typeof pdfjsLib === 'undefined' || !window.pdfjsLib) return;
        const pdfjsLib = window.pdfjsLib;
        const arrayBuffer = await blob.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        window._releveCurrentPdf = pdf;
        window._relevePdfBytes = blob;
        window._reviewPdfIdbSavedFor = blob;
        window._releveCurrentFile = new File([blob], data.fileName || months[0] + '.pdf', { type: 'application/pdf' });
        await buildRelevePageThumbs(pdf);
        console.log('[REVIEW] PDF restaure depuis l\'archive:', months[0]);
    } catch (e) {
        console.error('[REVIEW] restore pdf:', e);
    }
}
window.restoreReviewPdfFromArchive = restoreReviewPdfFromArchive;

window.clearSavedReview = function() {
    localStorage.removeItem(REVIEW_STORAGE_KEY);
    window._reviewPdfIdbSavedFor = null;
    idbClearPdf();
};

// sauvegarde aussi a chaque changement de ligne courante
const _origSetReviewCurrent = window.setReviewCurrent;
window.setReviewCurrent = function(index) {
    window._reviewState.current = index;
    window._reviewState.pdfPage = null;
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


// ===== Puces de sous-categories (fiable sur mobile, contrairement aux datalist) =====
function showSousCatChips(index, query, isDepense) {
    const chips = document.getElementById(`review-souscat-chips-${index}`);
    if (!chips) return;
    const tr = pendingTransactions[index];
    const cat = tr?.category || (isDepense ? 'autres_depenses' : 'autres');
    const pool = (typeof SCM_SOUS_CATEGORIES !== 'undefined' && SCM_SOUS_CATEGORIES[cat]) ? SCM_SOUS_CATEGORIES[cat] : [];
    const learned = (typeof getSousCatSuggestions === 'function') ? getSousCatSuggestions(pendingTransactions[index]?.description, isDepense) : [];
    const all = [...new Set([...learned, ...pool])];
    const q = (query || '').toLowerCase().trim();
    const filtered = q ? all.filter(sc => sc.toLowerCase().includes(q)) : all;
    if (!filtered.length) { chips.style.display = 'none'; return; }
    chips.innerHTML = filtered.slice(0, 12).map(sc =>
        `<button type="button" class="souscat-chip" onclick="event.stopPropagation(); pickSousCatChip(${index}, ${JSON.stringify(sc).replace(/"/g, '&quot;')})">${reviewEscapeHtml(sc)}</button>`
    ).join('');
    chips.style.display = 'flex';
}
window.showSousCatChips = showSousCatChips;

function pickSousCatChip(index, sc) {
    const tr = pendingTransactions[index];
    if (!tr) return;
    tr.sous_categorie = sc;
    const input = document.getElementById(`review-souscat-input-${index}`);
    if (input) input.value = sc;
    const chips = document.getElementById(`review-souscat-chips-${index}`);
    if (chips) chips.style.display = 'none';
    saveReviewProgress();
}
window.pickSousCatChip = pickSousCatChip;

// fermer les puces au clic ailleurs
document.addEventListener('click', (e) => {
    if (!e.target.classList || !e.target.classList.contains('souscat-chip')) {
        document.querySelectorAll('.souscat-chips').forEach(el => el.style.display = 'none');
    }
});

window.hideReviewDisclaimer = function() {
    const disclaimer = document.getElementById('review-disclaimer');
    if (disclaimer) disclaimer.style.display = 'none';
    try { sessionStorage.setItem('reviewDisclaimerHidden', '1'); } catch (e) {}
};

window.toggleReviewShowDone = function() {
    window._reviewShowDone = !window._reviewShowDone;
    renderReleveReview();
};
