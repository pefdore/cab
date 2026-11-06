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
            <div id="releve-checklist-body" style="display:${open ? 'block' : 'none'}; margin-top:12px;" data-open="${open ? '1' : ''}">
            <p class="module-desc">Relevés de compte de l'année en cours. Les mois en vert sont validés par vos soins, pas besoin de les refaire. « En cours » : un relevé est enregistré mais le mois n'est pas encore validé (2ᵉ quinzaine possible).</p>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:8px;">
                ${all.map(m => m.imported ? `
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; padding:8px 10px; border-radius:8px; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.4);">
                        <span style="font-size:0.82rem; font-weight:500; color:#10b981;">✅ ${m.short}</span>
                        <span style="display:flex; align-items:center; gap:6px;">
                            <span style="font-size:0.68rem; color:#059669;">${m.movements} mvt</span>
                            <button class="action-btn" style="padding:1px 8px; font-size:0.68rem;" onclick="viewRelevePdf('${m.key}')" title="Voir le PDF importé de ${m.short}">📄 PDF</button>
                        </span>
                    </div>` : m.started ? `
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; padding:8px 10px; border-radius:8px; background:rgba(59,130,246,0.10); border:1px solid rgba(59,130,246,0.4);">
                        <span style="font-size:0.82rem; font-weight:500; color:#2563eb;" title="Relevé importé mais mois non validé (2ᵉ quinzaine possible)">🔄 ${m.short}</span>
                        <span style="display:flex; align-items:center; gap:4px;">
                            <button class="action-btn" style="padding:1px 8px; font-size:0.68rem;" onclick="validateReleveMonth('${m.key}')" title="Tout le relevé de ${m.short} est fait : valider ce mois">✓ Valider</button>
                            <button class="action-btn" style="padding:1px 8px; font-size:0.68rem;" onclick="openReleveUploadFlowForMonth('${m.key}')" title="Ajouter un 2ᵉ relevé pour ${m.short} (quinzaine)">＋</button>
                        </span>
                    </div>` : `
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; padding:8px 10px; border-radius:8px; background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.4);">
                        <span style="font-size:0.82rem; font-weight:500; color:#b45309;">⏳ ${m.short}</span>
                        <button class="action-btn" style="padding:1px 8px; font-size:0.68rem;" onclick="openReleveUploadFlowForMonth('${m.key}')" title="Importer le relevé de ${m.short}">Importer</button>
                    </div>`).join('')}
            </div>
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

window.toggleReleveChecklist = function() {
    window._releveListOpen = !window._releveListOpen;
    renderReminders();
};
