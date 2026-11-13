// ===== Rappels : mois sans relevé importé =====
// Vérifie quels des 12 derniers mois n'ont aucun mouvement (dépense ni recette)
// et le signale : badge sur la nav (icône Flux) + carte de rappel dans la vue Flux.

const REMINDER_MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function remindersMonthKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function remindersMonthHasData(mKey) {
    // Un mois est valide UNIQUEMENT par validation explicite du medecin
    try {
        const map = window._releveImportedMonthsCache;
        if (map && map.get) return !!(map.get(mKey) && map.get(mKey).validated);
    } catch (e) {}
    return false;
}

function remindersMonthStarted(mKey) {
    // Un releve a ete importe pour ce mois, mais le mois n'est pas valide
    // (2e quinzaine possiblement manquante)
    try {
        const map = window._releveImportedMonthsCache;
        if (map && map.get) return !!(map.get(mKey) && map.get(mKey).imported && !map.get(mKey).validated);
    } catch (e) {}
    return false;
}

// Charge les statuts des mois (importe / valide) puis rafraichit l'affichage
async function remindersLoadImportedMonths() {
    if (typeof getReleveMonthStatuses !== 'function') return;
    const map = await getReleveMonthStatuses();
    window._releveImportedMonthsCache = map;
    renderReminders();
}
window.remindersLoadImportedMonths = remindersLoadImportedMonths;

function remindersMissingMonths() {
    return remindersYearMonths().filter(m => !m.imported);
}

// Liste de tous les mois de l'annee en cours, jusqu'au mois courant, avec statut d'import
function remindersYearMonths() {
    const now = new Date();
    const months = [];
    // le relevé du mois COURANT n'existe pas encore (il sort en début de mois suivant) :
    // on n'attend que les mois écoulés (janvier -> mois précédent)
    const lastExpected = now.getMonth() - 1;
    for (let m = 0; m <= Math.max(0, lastExpected); m++) {
        const d = new Date(now.getFullYear(), m, 1);
        const mKey = remindersMonthKey(d).slice(0, 7);
        const depCount = (typeof cabinetDepenses !== 'undefined' ? cabinetDepenses : []).filter(e => (e.date || '').slice(0, 7) === mKey).length;
        const recCount = (typeof cabinetRecettes !== 'undefined' ? cabinetRecettes : []).filter(e => (e.date || '').slice(0, 7) === mKey).length;
        months.push({
            key: mKey,
            label: REMINDER_MONTHS[d.getMonth()] + ' ' + d.getFullYear(),
            short: REMINDER_MONTHS[d.getMonth()],
            imported: remindersMonthHasData(mKey),
            started: remindersMonthStarted(mKey),
            movements: depCount + recCount
        });
    }
    return months;
}

function renderReminders() {
    if (!window._releveImportedMonthsCache && typeof getReleveMonthStatuses === 'function') {
        remindersLoadImportedMonths();
    }
    const missing = remindersMissingMonths();
    const recent = missing.slice(0, 3);

    // Badge global de l'onglet Affaires (calcule par affaires.js)
    if (typeof window.updateAffairesBadge === 'function') window.updateAffairesBadge();

    // Banniere de reprise d'import en cours
    const resumeZone = document.getElementById('affaires-releve-resume');
    if (resumeZone) {
        if (typeof hasSavedReview === 'function' && hasSavedReview()) {
            const raw = localStorage.getItem('releve_review_progress_v1');
            let fileName = '';
            try {
                const d = JSON.parse(raw);
                fileName = d.fileName ? ' — ' + d.fileName : '';
            } catch (e) {}
            resumeZone.innerHTML = `
                <div style="background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.4); border-radius:10px; padding:10px 14px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                    <span style="font-size:0.8rem;">⏸ <strong>Import de relevé en cours${fileName ? ' — ' + fileName : ''}</strong> — les lignes validées seront enregistrées à la fin de la revue.</span>
                    <span style="display:flex; gap:8px;">
                        <button class="action-btn primary" style="padding:6px 14px; font-size:0.78rem;" onclick="resumeSavedReview()">▶ Reprendre</button>
                        <button class="action-btn" style="padding:6px 14px; font-size:0.78rem;" onclick="clearSavedReview(); renderReminders();">Abandonner</button>
                    </span>
                </div>`;
            resumeZone.style.display = 'block';
        } else {
            resumeZone.innerHTML = '';
            resumeZone.style.display = 'none';
            // import lance sur un autre appareil (ex. photos prises sur le telephone)
            if (typeof hasRemoteSavedReview === 'function' && typeof resumeRemoteReview === 'function') {
                hasRemoteSavedReview().then(ok => {
                    if (!ok || resumeZone.innerHTML) return;
                    resumeZone.innerHTML = `
                        <div style="background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.4); border-radius:10px; padding:10px 14px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                            <span style="font-size:0.8rem;">📱 <strong>Un import de relevé a été lancé sur un autre appareil</strong> — reprenez-le ici, les photos sont synchronisées.</span>
                            <span style="display:flex; gap:8px;">
                                <button class="action-btn primary" style="padding:6px 14px; font-size:0.78rem;" onclick="resumeSavedReview()">▶ Reprendre ici</button>
                                <button class="action-btn" style="padding:6px 14px; font-size:0.78rem;" onclick="clearSavedReview(); renderReminders();">Abandonner</button>
                            </span>
                        </div>`;
                    resumeZone.style.display = 'block';
                });
            }
        }
    }

    // Checklist annuelle dans la vue Flux (pliee par defaut)
    const holder = document.getElementById('affaires-releve-checklist');
    if (!holder) return;
    const all = remindersYearMonths();
    const okCount = all.filter(m => m.imported).length;
    const startedCount = all.filter(m => m.started).length;
    const pendingCount = all.length - okCount;
    const open = window._releveListOpen === true;
    const headerColor = pendingCount > 0 ? '#b45309' : '#059669';
    const headerTxt = pendingCount > 0
        ? `${pendingCount} mois de relevé${pendingCount > 1 ? 's' : ''} à finaliser${startedCount ? ` (dont ${startedCount} en cours)` : ''}`
        : `Tous les relevés ${new Date().getFullYear()} sont validés ✅`;
    // quand tout est fait, le module À FAIRE n'existe plus
    if (pendingCount === 0) {
        if (window.__lastChecklistHtml !== '') { window.__lastChecklistHtml = ''; holder.innerHTML = ''; }
        return;
    }
    const __checklistHtml = `
        <div class="module-card flux-chip-card" style="border-left: 3px solid var(--color-primary);">
            <div onclick="toggleReleveChecklist()" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; gap:8px;">
                <h3 style="margin:0; color:${headerColor}; font-size:0.82rem;">📅 ${headerTxt}</h3>
                <span style="font-size:0.75rem; color:var(--color-text-secondary);">${open ? '▲' : '▼ ' + okCount + '/' + all.length}</span>
            </div>
            <div id="releve-checklist-body" class="af-months" style="display:${open ? 'block' : 'none'};" data-open="${open ? '1' : ''}">
            <div class="af-months-grid">
                ${all.filter(m => !m.imported).map(m => m.started ? `
                    <div class="af-month af-month--started">
                        <span class="af-month-name">
                            <svg class="af-month-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>${m.short}
                        </span>
                        <span class="af-month-side">
                            <button class="af-btn" onclick="validateReleveMonth('${m.key}')" title="Tout le relevé de ${m.short} est fait : valider ce mois">Valider</button>
                            <button class="af-btn" onclick="openReleveUploadFlowForMonth('${m.key}')" title="Ajouter un 2ᵉ relevé pour ${m.short} (quinzaine)">＋</button>
                        </span>
                    </div>` : `
                    <div class="af-month af-month--todo">
                        <span class="af-month-name">
                            <svg class="af-month-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>${m.short}
                        </span>
                        <span class="af-month-side">
                            <button class="af-btn af-btn--filled" onclick="openReleveUploadFlowForMonth('${m.key}')" title="Importer le relevé de ${m.short}">Importer</button>
                        </span>
                    </div>`).join('')}
            </div>
            ${(() => {
                const done = all.filter(m => m.imported);
                if (!done.length) return '';
                const showDone = window._releveShowDone === true;
                return `
            <button class="af-showall" onclick="toggleReleveDoneMonths()">${showDone ? 'Masquer' : 'Afficher'} les ${done.length} mois déjà validés ✓</button>
            <div class="af-months-grid af-months-done" style="display:${showDone ? 'grid' : 'none'};">
                ${done.map(m => `
                    <div class="af-month af-month--done">
                        <span class="af-month-name">
                            <svg class="af-month-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>${m.short}
                        </span>
                        <span class="af-month-side">
                            <span class="af-month-meta">${m.movements} mvt</span>
                            <button class="af-btn" onclick="viewRelevePdf('${m.key}')" title="Voir le PDF importé de ${m.short}">PDF</button>
                        </span>
                    </div>`).join('')}
            </div>`;
            })()}
            <p class="af-hint">Bleu = relevé importé, mois à valider · Ambre = relevé à importer (le relevé du mois courant sort le mois suivant). Les mois validés sont repliés ci-dessus.</p>
            </div>
        </div>`;
    // DIFF : ne pas reecrire le DOM si le contenu est identique -> zero clignotement
    if (window.__lastChecklistHtml === __checklistHtml) return;
    window.__lastChecklistHtml = __checklistHtml;
    holder.innerHTML = __checklistHtml;
}

window.renderReminders = renderReminders;
window.remindersMissingMonths = remindersMissingMonths;

// Debounce : les multiples declencheurs (chargement, sync, import) ne font
// qu'UN rendu -> plus de clignotement des cartes
(function() {
    const realRenderReminders = renderReminders;
    let timer = null;
    window.renderReminders = function() {
        clearTimeout(timer);
        timer = setTimeout(() => { realRenderReminders(); }, 150);
    };
})();

// Afficher / masquer les mois déjà validés (repliés par défaut : l'œil
// va d'abord à ce qui reste à faire)
window.toggleReleveDoneMonths = function() {
    window._releveShowDone = !(window._releveShowDone === true);
    renderReminders();
};

window.toggleReleveChecklist = function() {
    window._releveListOpen = !window._releveListOpen;
    renderReminders();
};
