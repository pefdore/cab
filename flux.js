// ===== VUE FLUX =====
// Flux des entrées / dépenses : jour par jour et mois par mois, par catégorie.
// Les données sont celles du cabinet (cabinet_depenses / cabinet_recettes),
// partagées avec le dashboard (renderComptaSummary s'alimente des mêmes tableaux).

let fluxCurrentMonth = new Date();
fluxCurrentMonth.setDate(1);

const FLUX_MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function fluxMonthKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

function fluxSameMonth(d, ref) {
    const date = new Date(d.date);
    return date.getFullYear() === ref.getFullYear() && date.getMonth() === ref.getMonth();
}

function fluxCategoryLabel(category, isDepense) {
    const map = isDepense ? CABINET_CATEGORIES : RECETTE_CATEGORIES;
    const cat = map[category];
    if (cat) return cat.label;
    if (!category) return isDepense ? 'Dépense' : 'Recette';
    // categories historiques : affichage selon la nouvelle nomenclature
    if (!isDepense) return 'Cotisation associé';
    return 'Dépense';
}

function fluxEscapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fluxChangeMonth(delta) {
    fluxCurrentMonth = new Date(fluxCurrentMonth.getFullYear(), fluxCurrentMonth.getMonth() + delta, 1);
    renderFluxView();
}

function fluxAddMonths(ref, count) {
    const out = [];
    for (let i = 0; i < count; i++) {
        out.push(new Date(ref.getFullYear(), ref.getMonth() - i, 1));
    }
    return out;
}

// ===== SOLDE BANCAIRE D'OUVERTURE (31/12 de l'année précédente) =====
// Saisi une fois par an ; sert de point de départ au solde bancaire de fin
// de mois, à comparer avec le solde affiché sur le relevé bancaire.
const fluxOpeningBalances = new Map(); // annee -> montant au 31/12 de l'annee precedente
let fluxOpeningLoaded = false;

async function fluxLoadOpeningBalances() {
    if (fluxOpeningLoaded) return;
    if (typeof supabaseClient === 'undefined' || typeof currentUser === 'undefined' || !currentUser) return;
    if (typeof getCabinetId !== 'function') return;
    try {
        const cabinetId = await getCabinetId();
        if (!cabinetId) { fluxOpeningLoaded = true; return; }
        const { data, error } = await supabaseClient
            .from('cabinet_opening_balances')
            .select('annee, montant')
            .eq('cabinet_id', cabinetId);
        if (error) throw error;
        fluxOpeningBalances.clear();
        (data || []).forEach(r => fluxOpeningBalances.set(parseInt(r.annee, 10), parseFloat(r.montant) || 0));
    } catch (e) {
        // table absente ou accès refusé : on continue sans solde d'ouverture
    }
    fluxOpeningLoaded = true;
    if (typeof window.renderFluxView === 'function') window.renderFluxView();
}

function fluxHasOpeningBalance(year) {
    return fluxOpeningBalances.has(year);
}

// Solde bancaire theorique a la fin du mois donne (year, monthIdx 0-based) :
// solde au 31/12 precedent + tous les flux de janvier jusqu'a la fin du mois.
function fluxBankBalanceAt(year, monthIdx) {
    let bal = fluxOpeningBalances.get(year) || 0;
    const inRange = (item) => {
        const d = new Date(item.date);
        return d.getFullYear() === year && d.getMonth() <= monthIdx;
    };
    cabinetRecettes.filter(inRange).forEach(r => { bal += r.amount; });
    cabinetDepenses.filter(inRange).forEach(d => { bal -= d.amount; });
    return bal;
}

async function fluxEditOpeningBalance() {
    const year = fluxCurrentMonth.getFullYear();
    const current = fluxHasOpeningBalance(year)
        ? fluxOpeningBalances.get(year).toFixed(2).replace('.', ',')
        : '';
    const input = prompt('Solde du compte bancaire au 31/12/' + (year - 1) + ' (en €) :', current);
    if (input === null) return;
    const val = input.trim().replace(',', '.');
    const montant = val === '' ? 0 : parseFloat(val);
    if (isNaN(montant)) { alert('Montant invalide'); return; }
    try {
        const cabinetId = await getCabinetId();
        if (!cabinetId) { alert('Aucun cabinet associé'); return; }
        const { error } = await supabaseClient
            .from('cabinet_opening_balances')
            .upsert({ cabinet_id: cabinetId, user_id: currentUser.id, annee: year, montant: montant }, { onConflict: 'cabinet_id,annee' });
        if (error) throw error;
        fluxOpeningBalances.set(year, montant);
        if (typeof showToast === 'function') showToast('Solde au 31/12/' + (year - 1) + ' enregistré');
        if (typeof window.renderFluxView === 'function') window.renderFluxView();
    } catch (err) {
        alert('Erreur : ' + err.message);
    }
}
window.fluxEditOpeningBalance = fluxEditOpeningBalance;
window.fluxHasOpeningBalance = fluxHasOpeningBalance;
window.fluxLoadOpeningBalances = fluxLoadOpeningBalances;

function fluxSelectMonth(key) {
    const parts = key.split('-');
    fluxCurrentMonth = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
    renderFluxView();
}

function renderFluxView() {
    const titleEl = document.getElementById('fluxCurrentMonth');
    if (titleEl) titleEl.textContent = FLUX_MONTH_NAMES[fluxCurrentMonth.getMonth()] + ' ' + fluxCurrentMonth.getFullYear();
    const catLabelEl = document.getElementById('fluxCatMonthLabel');
    if (catLabelEl) catLabelEl.textContent = FLUX_MONTH_NAMES[fluxCurrentMonth.getMonth()] + ' ' + fluxCurrentMonth.getFullYear();

    fluxInitCategorySelects();

    if (!fluxOpeningLoaded && typeof fluxLoadOpeningBalances === 'function') fluxLoadOpeningBalances();

    if (typeof cabinetDepenses === 'undefined') cabinetDepenses = [];
    if (typeof cabinetRecettes === 'undefined') cabinetRecettes = [];

    const monthDepenses = cabinetDepenses.filter(d => fluxSameMonth(d, fluxCurrentMonth));
    const monthRecettes = cabinetRecettes.filter(r => fluxSameMonth(r, fluxCurrentMonth));

    const totalDepenses = monthDepenses.reduce((s, d) => s + d.amount, 0);
    const totalRecettes = monthRecettes.reduce((s, r) => s + r.amount, 0);

    const recEl = document.getElementById('flux-total-recettes');
    const depEl = document.getElementById('flux-total-depenses');
    const balEl = document.getElementById('flux-total-balance');
    if (recEl) recEl.textContent = totalRecettes.toFixed(2) + '€';
    if (depEl) depEl.textContent = totalDepenses.toFixed(2) + '€';
    if (balEl) {
        balEl.textContent = (totalRecettes - totalDepenses).toFixed(2) + '€';
        balEl.style.color = (totalRecettes - totalDepenses) >= 0 ? '#10b981' : '#ef4444';
    }

    // Synthèse année en cours (depuis janvier)
    const yearNow = fluxCurrentMonth.getFullYear();
    const yDep = cabinetDepenses.filter(d => (d.date || '').slice(0, 4) === String(yearNow)).reduce((s, d) => s + d.amount, 0);
    const yRec = cabinetRecettes.filter(r => (r.date || '').slice(0, 4) === String(yearNow)).reduce((s, r) => s + r.amount, 0);
    const yDepEl = document.getElementById('flux-year-depenses');
    const yRecEl = document.getElementById('flux-year-recettes');
    const yBalEl = document.getElementById('flux-year-balance');
    const yLblEl = document.getElementById('flux-year-label');
    const mLblEl = document.getElementById('flux-month-label');
    if (yDepEl) yDepEl.textContent = yDep.toFixed(2) + '€';
    if (yRecEl) yRecEl.textContent = yRec.toFixed(2) + '€';
    if (yBalEl) {
        yBalEl.textContent = (yRec - yDep).toFixed(2) + '€';
        yBalEl.style.color = (yRec - yDep) >= 0 ? '#10b981' : '#ef4444';
    }
    if (yLblEl) yLblEl.textContent = String(yearNow);
    if (mLblEl) {
        const mName = FLUX_MONTH_NAMES[fluxCurrentMonth.getMonth()];
        mLblEl.textContent = mName.charAt(0) + mName.slice(1).toLowerCase();
    }

    // ===== HERO : solde en vedette + KPI + tendance + mini-graphe =====
    const fmt = (n) => (n < 0 ? '-' : '+') + Math.abs(n).toFixed(2).replace('.', ',') + ' €';
    const heroMonth = document.getElementById('flux-month-label-hero');
    const heroYear = document.getElementById('flux-year-label-hero');
    const heroBal = document.getElementById('flux-total-balance-hero');
    const heroRec = document.getElementById('flux-total-recettes-hero');
    const heroDep = document.getElementById('flux-total-depenses-hero');
    const heroYearBal = document.getElementById('flux-year-balance-hero');
    const heroYearLbl = document.getElementById('flux-year-label-hero2');
    if (heroMonth) heroMonth.textContent = FLUX_MONTH_NAMES[fluxCurrentMonth.getMonth()];
    if (heroYear) heroYear.textContent = String(fluxCurrentMonth.getFullYear());
    if (heroYearLbl) heroYearLbl.textContent = String(yearNow);
    if (heroRec) heroRec.textContent = totalRecettes.toFixed(2).replace('.', ',') + ' €';
    if (heroDep) heroDep.textContent = totalDepenses.toFixed(2).replace('.', ',') + ' €';
    if (heroYearBal) heroYearBal.textContent = (yRec - yDep).toFixed(2).replace('.', ',') + ' €';
    if (heroBal) {
        const bal = totalRecettes - totalDepenses;
        heroBal.textContent = fmt(bal);
        heroBal.classList.toggle('neg', bal < 0);
    }

    // tendance vs mois precedent
    const prev = new Date(fluxCurrentMonth.getFullYear(), fluxCurrentMonth.getMonth() - 1, 1);
    const pDep = cabinetDepenses.filter(d => fluxSameMonth(d, prev)).reduce((s, d) => s + d.amount, 0);
    const pRec = cabinetRecettes.filter(r => fluxSameMonth(r, prev)).reduce((s, r) => s + r.amount, 0);
    const trendEl = document.getElementById('flux-hero-trend');
    if (trendEl) {
        const pBal = pRec - pDep;
        const cBal = totalRecettes - totalDepenses;
        if (pDep + pRec === 0) {
            trendEl.textContent = '';
        } else {
            const diff = cBal - pBal;
            trendEl.textContent = (diff >= 0 ? '▲ +' : '▼ ') + Math.abs(diff).toFixed(0) + ' € vs mois précédent';
            trendEl.className = 'fhero-trend ' + (diff >= 0 ? 'up' : 'down');
        }
    }

    // solde bancaire de fin de mois (cumul depuis le 31/12) + solde d'ouverture
    const bankEl = document.getElementById('flux-hero-bank');
    if (bankEl) {
        if (fluxHasOpeningBalance(yearNow)) {
            const bank = fluxBankBalanceAt(yearNow, fluxCurrentMonth.getMonth());
            bankEl.innerHTML = 'Banque fin ' + FLUX_MONTH_NAMES[fluxCurrentMonth.getMonth()].toLowerCase()
                + ' : <strong class="' + (bank < 0 ? 'neg' : 'pos') + '">' + bank.toFixed(2).replace('.', ',') + ' €</strong>';
        } else {
            bankEl.innerHTML = 'Solde au 31/12/' + (yearNow - 1) + ' non renseigné — <em>cliquer sur ✎ ci-dessous</em>';
        }
    }
    const openingEl = document.getElementById('flux-opening-label');
    if (openingEl) {
        openingEl.innerHTML = fluxHasOpeningBalance(yearNow)
            ? 'Solde bancaire au 31/12/' + (yearNow - 1) + ' : <strong>' + fluxOpeningBalances.get(yearNow).toFixed(2).replace('.', ',') + ' €</strong>'
            : 'Solde bancaire au 31/12/' + (yearNow - 1) + ' : non renseigné';
    }

    // mini-graphe : flux net par jour du mois (barres)
    const chartEl = document.getElementById('flux-hero-chart');
    if (chartEl) {
        const daysInMonth = new Date(fluxCurrentMonth.getFullYear(), fluxCurrentMonth.getMonth() + 1, 0).getDate();
        const netByDay = new Array(daysInMonth).fill(0);
        monthDepenses.forEach(d => {
            const day = parseInt((d.date || '').slice(8, 10), 10);
            if (day >= 1 && day <= daysInMonth) netByDay[day - 1] -= d.amount;
        });
        monthRecettes.forEach(r => {
            const day = parseInt((r.date || '').slice(8, 10), 10);
            if (day >= 1 && day <= daysInMonth) netByDay[day - 1] += r.amount;
        });
        const maxAbs = Math.max(...netByDay.map(Math.abs), 1);
        chartEl.innerHTML = netByDay.map((v, i) => {
            if (v === 0) return '<i class="fchart-bar zero"></i>';
            const h = Math.max(8, Math.round(Math.abs(v) / maxAbs * 100));
            return '<i class="fchart-bar ' + (v > 0 ? 'pos' : 'neg') + '" style="--h:' + h + '%" title="' + (i + 1) + ' : ' + fmt(v) + '"></i>';
        }).join('');
    }

    // Jour par jour, groupé par catégorie
    const byDay = {};
    monthDepenses.forEach(d => {
        const dayKey = (d.date || '').slice(0, 10);
        if (!byDay[dayKey]) byDay[dayKey] = { depenses: [], recettes: [] };
        byDay[dayKey].depenses.push(d);
    });
    monthRecettes.forEach(r => {
        const dayKey = (r.date || '').slice(0, 10);
        if (!byDay[dayKey]) byDay[dayKey] = { depenses: [], recettes: [] };
        byDay[dayKey].recettes.push(r);
    });

    const dailyEl = document.getElementById('flux-daily-list');
    if (dailyEl) {
        const dayKeys = Object.keys(byDay).sort().reverse();
        if (dayKeys.length === 0) {
            dailyEl.innerHTML = '<div class="no-entries">Aucun mouvement ce mois-ci</div>';
        } else {
            dailyEl.innerHTML = dayKeys.map(dayKey => {
                const dayDate = new Date(dayKey + 'T00:00:00');
                const dayLabel = isNaN(dayDate) ? dayKey : dayDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
                const rows = [];
                byDay[dayKey].depenses.forEach(d => {
                    const linked = (typeof reconLinkedOrdersLabel === 'function' && d.order_ids && d.order_ids.length) ? reconLinkedOrdersLabel(d) : '';
                    rows.push(`
                        <div class="depense-item flux-row">
                            <div class="flux-row-main">
                                <span class="category">${fluxEscapeHtml(fluxCategoryLabel(d.category, true))}</span>
                                <span class="description">${fluxEscapeHtml(d.description || d.sous_categorie || '-')}</span>
                                <span class="flux-note" contenteditable="true" data-type="depense" data-id="${d.id}" title="Note personnelle (cliquer pour modifier)">${fluxEscapeHtml(d.note || '')}</span>
                                ${linked ? `<div style="font-size:0.72rem; color:var(--color-primary); margin-top:2px;">📦 ${fluxEscapeHtml(linked)}</div>` : ''}
                            </div>
                            <div class="flux-row-side">
                                <span class="amount">-${d.amount.toFixed(2)}€</span>
                                <div class="flux-row-actions">
                                    <button class="icon-btn-28" onclick="openReconModal(${d.id})" title="Rapprocher d'une commande">${d.order_ids && d.order_ids.length ? '⚙' : '＋'}</button>
                                    <button class="icon-btn-28 ${d.document_id ? 'active' : ''}" onclick="openAttachModal(${d.id}, true)" title="${d.document_id ? 'Voir / changer la pièce jointe' : 'Associer une pièce jointe'}">📎</button>
                                    <button class="icon-btn-28" onclick="editDepense(${d.id})" title="Modifier">✎</button>
                                    <button class="icon-btn-28 danger" onclick="deleteDepense(${d.id})" title="Supprimer">✕</button>
                                </div>
                            </div>
                        </div>`);
                });
                byDay[dayKey].recettes.forEach(r => {
                    rows.push(`
                        <div class="depense-item income flux-row">
                            <div class="flux-row-main">
                                <span class="category">${fluxEscapeHtml(fluxCategoryLabel(r.category, false))}</span>
                                <span class="description">${fluxEscapeHtml(r.description || '-')}</span>
                                <span class="flux-note" contenteditable="true" data-type="recette" data-id="${r.id}" title="Note personnelle (cliquer pour modifier)">${fluxEscapeHtml(r.note || '')}</span>
                            </div>
                            <div class="flux-row-side">
                                <span class="amount">+${r.amount.toFixed(2)}€</span>
                                <div class="flux-row-actions">
                                    <button class="icon-btn-28 ${r.document_id ? 'active' : ''}" onclick="openAttachModal(${r.id}, false)" title="${r.document_id ? 'Voir / changer la pièce jointe' : 'Associer une pièce jointe'}">📎</button>
                                    <button class="icon-btn-28" onclick="editRecette(${r.id})" title="Modifier">✎</button>
                                    <button class="icon-btn-28 danger" onclick="deleteRecette(${r.id})" title="Supprimer">✕</button>
                                </div>
                            </div>
                        </div>`);
                });
                return `
                    <div class="flux-day">
                        <div class="flux-day-header">${fluxEscapeHtml(dayLabel)}</div>
                        ${rows.join('')}
                    </div>`;
            }).join('');
        }
    }

    // Récap mensuel par catégorie
    const byCat = {};
    monthDepenses.forEach(d => {
        const label = fluxCategoryLabel(d.category, true);
        if (!byCat[label]) byCat[label] = { depenses: 0, recettes: 0 };
        byCat[label].depenses += d.amount;
    });
    monthRecettes.forEach(r => {
        const label = fluxCategoryLabel(r.category, false);
        if (!byCat[label]) byCat[label] = { depenses: 0, recettes: 0 };
        byCat[label].recettes += r.amount;
    });

    const catEl = document.getElementById('flux-category-summary');
    if (catEl) {
        const labels = Object.keys(byCat).sort((a, b) => (byCat[b].depenses + byCat[b].recettes) - (byCat[a].depenses + byCat[a].recettes));
        if (labels.length === 0) {
            catEl.innerHTML = '<div class="no-entries">Aucune catégorie ce mois-ci</div>';
        } else {
            catEl.innerHTML = labels.map(label => `
                <div class="flux-cat-row">
                    <span class="category">${fluxEscapeHtml(label)}</span>
                    <span class="flux-cat-amounts">
                        ${byCat[label].recettes > 0 ? `<span style="color:#10b981">+${byCat[label].recettes.toFixed(2)}€</span>` : ''}
                        ${byCat[label].depenses > 0 ? `<span style="color:#ef4444">-${byCat[label].depenses.toFixed(2)}€</span>` : ''}
                    </span>
                </div>`).join('');
        }
    }

    if (typeof renderReconPending === 'function') renderReconPending();
    if (typeof renderReminders === 'function') renderReminders();

    // Synthèse des 6 derniers mois
    const monthsEl = document.getElementById('flux-months-summary');
    if (monthsEl) {
        const months = fluxAddMonths(fluxCurrentMonth, 6);
        monthsEl.innerHTML = months.map(m => {
            const dep = cabinetDepenses.filter(d => fluxSameMonth(d, m)).reduce((s, d) => s + d.amount, 0);
            const rec = cabinetRecettes.filter(r => fluxSameMonth(r, m)).reduce((s, r) => s + r.amount, 0);
            const bal = rec - dep;
            const bank = fluxHasOpeningBalance(m.getFullYear())
                ? fluxBankBalanceAt(m.getFullYear(), m.getMonth())
                : null;
            return `
                <div class="flux-month-row ${fluxMonthKey(m) === fluxMonthKey(fluxCurrentMonth) ? 'current' : ''}" onclick="fluxSelectMonth('${fluxMonthKey(m)}')">
                    <span class="flux-month-label">${FLUX_MONTH_NAMES[m.getMonth()]} ${m.getFullYear()}</span>
                    <span class="flux-cat-amounts">
                        <span style="color:#10b981">+${rec.toFixed(2)}€</span>
                        <span style="color:#ef4444">-${dep.toFixed(2)}€</span>
                        <span style="font-weight:600;color:${bal >= 0 ? '#10b981' : '#ef4444'}">${bal.toFixed(2)}€</span>
                        ${bank !== null ? `<span class="flux-month-bank" title="Solde bancaire théorique fin de mois">🏦 ${bank.toFixed(2).replace('.', ',')}€</span>` : ''}
                    </span>
                </div>`;
        }).join('');
    }
}

let fluxSelectsInitialized = false;

function fluxInitCategorySelects() {
    if (fluxSelectsInitialized) return;
    const depCat = document.getElementById('add-depenseCategory');
    const recCat = document.getElementById('add-recetteCategory');
    if (!depCat || !recCat) return;

    depCat.innerHTML = '<option value="">Catégorie…</option>' +
        Object.entries(CABINET_CATEGORIES).map(([key, c]) => `<option value="${key}">${fluxEscapeHtml(c.label)}</option>`).join('');
    recCat.innerHTML = '<option value="">Catégorie…</option>' +
        Object.entries(RECETTE_CATEGORIES).map(([key, c]) => `<option value="${key}">${fluxEscapeHtml(c.label)}</option>`).join('');

    depCat.addEventListener('change', function() {
        const sousSelect = document.getElementById('add-depenseSousCategorie');
        if (!sousSelect) return;
        const cat = CABINET_CATEGORIES[this.value];
        sousSelect.innerHTML = '<option value="">Sous-catégorie…</option>' +
            (cat && cat.sous ? cat.sous.map(s => `<option value="${fluxEscapeHtml(s)}">${fluxEscapeHtml(s)}</option>`).join('') : '');
    });
    recCat.addEventListener('change', function() {
        const sousSelect = document.getElementById('add-recetteSousCategorie');
        if (!sousSelect) return;
        const cat = RECETTE_CATEGORIES[this.value];
        sousSelect.innerHTML = '<option value="">Sous-catégorie…</option>' +
            (cat && cat.sous ? cat.sous.map(s => `<option value="${fluxEscapeHtml(s)}">${fluxEscapeHtml(s)}</option>`).join('') : '');
    });

    fluxSelectsInitialized = true;
    if (typeof handleDepenseAutocomplete === 'function') handleDepenseAutocomplete();
}

// Debounce externe : les mises a jour en rafale (chargement + sync + import)
// ne declenchent qu'un seul rendu de la vue
(function() {
    const real = renderFluxView;
    let timer = null;
    window.renderFluxView = function() {
        clearTimeout(timer);
        timer = setTimeout(() => { real(); }, 150);
    };
})();

window.fluxChangeMonth = fluxChangeMonth;
window.fluxSelectMonth = fluxSelectMonth;
window.renderFluxView = renderFluxView;


// Notes inline : sauvegarde au blur (perte de focus)
document.addEventListener('blur', async (e) => {
    const el = e.target;
    if (!el.classList || !el.classList.contains('flux-note')) return;
    const id = el.dataset.id;
    const type = el.dataset.type;
    const note = el.textContent.trim();
    const table = type === 'depense' ? 'cabinet_depenses' : 'cabinet_recettes';
    const list = type === 'depense' ? cabinetDepenses : cabinetRecettes;
    const item = list.find(x => String(x.id) === String(id));
    if (item && (item.note || '') === note) return;
    try {
        const { error } = await supabaseClient.from(table).update({ note: note || null }).eq('id', id);
        if (error) throw error;
        if (item) item.note = note;
        if (!note) el.classList.remove('filled');
        else el.classList.add('filled');
        if (typeof showToast === 'function' && note) showToast('Note enregistrée');
    } catch (err) {
        alert('Erreur note: ' + err.message);
    }
}, true);

// Afficher visuellement les notes remplies / vides
window._fluxNoteObserver = new MutationObserver(() => {});
(function initNoteStyles() {
    document.addEventListener('input', (e) => {
        const el = e.target;
        if (!el.classList || !el.classList.contains('flux-note')) return;
        el.classList.toggle('filled', el.textContent.trim().length > 0);
    });
})();
