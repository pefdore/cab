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
    return cat ? cat.label : (category || (isDepense ? 'Dépense' : 'Recette'));
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
                    rows.push(`
                        <div class="depense-item">
                            <div>
                                <span class="category">${fluxEscapeHtml(fluxCategoryLabel(d.category, true))}</span>
                                <span class="description">${fluxEscapeHtml(d.description || d.sous_categorie || '-')}</span>
                            </div>
                            <div class="depense-right">
                                <span class="amount">-${d.amount.toFixed(2)}€</span>
                                <button class="edit-btn-small" onclick="editDepense(${d.id})" title="Modifier">✎</button>
                                <button class="delete-btn-small" onclick="deleteDepense(${d.id})" title="Supprimer">✕</button>
                            </div>
                        </div>`);
                });
                byDay[dayKey].recettes.forEach(r => {
                    rows.push(`
                        <div class="depense-item income">
                            <div>
                                <span class="category">${fluxEscapeHtml(fluxCategoryLabel(r.category, false))}</span>
                                <span class="description">${fluxEscapeHtml(r.description || '-')}</span>
                            </div>
                            <div class="depense-right">
                                <span class="amount">+${r.amount.toFixed(2)}€</span>
                                <button class="edit-btn-small" onclick="editRecette(${r.id})" title="Modifier">✎</button>
                                <button class="delete-btn-small" onclick="deleteRecette(${r.id})" title="Supprimer">✕</button>
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

    // Synthèse des 6 derniers mois
    const monthsEl = document.getElementById('flux-months-summary');
    if (monthsEl) {
        const months = fluxAddMonths(fluxCurrentMonth, 6);
        monthsEl.innerHTML = months.map(m => {
            const dep = cabinetDepenses.filter(d => fluxSameMonth(d, m)).reduce((s, d) => s + d.amount, 0);
            const rec = cabinetRecettes.filter(r => fluxSameMonth(r, m)).reduce((s, r) => s + r.amount, 0);
            const bal = rec - dep;
            return `
                <div class="flux-month-row ${fluxMonthKey(m) === fluxMonthKey(fluxCurrentMonth) ? 'current' : ''}" onclick="fluxSelectMonth('${fluxMonthKey(m)}')">
                    <span class="flux-month-label">${FLUX_MONTH_NAMES[m.getMonth()]} ${m.getFullYear()}</span>
                    <span class="flux-cat-amounts">
                        <span style="color:#10b981">+${rec.toFixed(2)}€</span>
                        <span style="color:#ef4444">-${dep.toFixed(2)}€</span>
                        <span style="font-weight:600;color:${bal >= 0 ? '#10b981' : '#ef4444'}">${bal.toFixed(2)}€</span>
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

window.fluxChangeMonth = fluxChangeMonth;
window.fluxSelectMonth = fluxSelectMonth;
window.renderFluxView = renderFluxView;
