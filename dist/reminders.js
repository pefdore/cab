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
    const now = new Date();
    const missing = [];
    for (let m = 0; m <= now.getMonth(); m++) {
        const d = new Date(now.getFullYear(), m, 1);
        const mKey = remindersMonthKey(d).slice(0, 7);
        if (!remindersMonthHasData(mKey)) {
            missing.push({ key: mKey, label: REMINDER_MONTHS[d.getMonth()] + ' ' + d.getFullYear() });
        }
    }
    return missing;
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

    // Carte de rappel dans la vue Flux
    const holder = document.getElementById('flux-reminders');
    if (!holder) return;
    if (missing.length === 0) {
        holder.innerHTML = '';
        return;
    }
    holder.innerHTML = `
        <div class="module-card" style="border-left: 3px solid var(--color-primary);">
            <h3>📅 Rappels relevés</h3>
            <p class="module-desc">En ${now.getFullYear()}, ces mois n'ont encore aucun mouvement enregistré — pensez à importer le relevé de compte :</p>
            ${missing.slice(0, 6).map(m => `
                <div class="flux-cat-row">
                    <span style="text-transform:capitalize; font-weight:500;">${m.label}</span>
                    <button class="action-btn" style="padding:2px 10px; font-size:0.72rem;" onclick="document.getElementById('releve-upload-modal').style.display='flex'">Importer le relevé</button>
                </div>`).join('')}
        </div>`;
}

window.renderReminders = renderReminders;
window.remindersMissingMonths = remindersMissingMonths;
