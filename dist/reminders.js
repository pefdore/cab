// ===== Rappels : mois sans relevé importé =====
// Vérifie quels des 12 derniers mois n'ont aucun mouvement (dépense ni recette)
// et le signale : badge sur la nav (icône Flux) + carte de rappel dans la vue Flux.

const REMINDER_MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function remindersMonthKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function remindersMonthHasData(mKey) {
    const inMonth = (list) => (list || []).some(e => {
        const k = (e.date || '').slice(0, 7);
        return k === mKey;
    });
    return inMonth(typeof cabinetDepenses !== 'undefined' ? cabinetDepenses : []) ||
           inMonth(typeof cabinetRecettes !== 'undefined' ? cabinetRecettes : []);
}

function remindersMissingMonths() {
    return remindersYearMonths().filter(m => !m.imported);
}

// Liste de tous les mois de l'annee en cours, jusqu'au mois courant, avec statut d'import
function remindersYearMonths() {
    const now = new Date();
    const months = [];
    for (let m = 0; m <= now.getMonth(); m++) {
        const d = new Date(now.getFullYear(), m, 1);
        const mKey = remindersMonthKey(d).slice(0, 7);
        const depCount = (typeof cabinetDepenses !== 'undefined' ? cabinetDepenses : []).filter(e => (e.date || '').slice(0, 7) === mKey).length;
        const recCount = (typeof cabinetRecettes !== 'undefined' ? cabinetRecettes : []).filter(e => (e.date || '').slice(0, 7) === mKey).length;
        months.push({
            key: mKey,
            label: REMINDER_MONTHS[d.getMonth()] + ' ' + d.getFullYear(),
            short: REMINDER_MONTHS[d.getMonth()],
            imported: (depCount + recCount) > 0,
            movements: depCount + recCount
        });
    }
    return months;
}

function renderReminders() {
    const missing = remindersMissingMonths();
    const recent = missing.slice(0, 3);

    // Badge sur la nav (desktop + mobile)
    ['fluxNavBadge', 'fluxNavBadgeMobile'].forEach(id => {
        const badge = document.getElementById(id);
        if (!badge) return;
        if (recent.length > 0) {
            badge.textContent = recent.length;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    });

    // Checklist annuelle dans la vue Flux
    const holder = document.getElementById('flux-reminders');
    if (!holder) return;
    const all = remindersYearMonths();
    const okCount = all.filter(m => m.imported).length;
    holder.innerHTML = `
        <div class="module-card" style="border-left: 3px solid var(--color-primary);">
            <h3>📅 Relevés ${new Date().getFullYear()} — ${okCount}/${all.length} importés</h3>
            <p class="module-desc">Relevés de compte de l'année en cours. Les mois en vert sont importés, pas besoin de les refaire. Les mois en attente attendent leur relevé.</p>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:8px;">
                ${all.map(m => m.imported ? `
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; padding:8px 10px; border-radius:8px; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.4);">
                        <span style="font-size:0.82rem; font-weight:500; color:#10b981;">✅ ${m.short}</span>
                        <span style="font-size:0.68rem; color:#059669;">${m.movements} mvt</span>
                    </div>` : `
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; padding:8px 10px; border-radius:8px; background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.4);">
                        <span style="font-size:0.82rem; font-weight:500; color:#b45309;">⏳ ${m.short}</span>
                        <button class="action-btn" style="padding:1px 8px; font-size:0.68rem;" onclick="document.getElementById('releve-upload-modal').style.display='flex'" title="Importer le relevé de ${m.short}">Importer</button>
                    </div>`).join('')}
            </div>
        </div>`;
}

window.renderReminders = renderReminders;
window.remindersMissingMonths = remindersMissingMonths;
