// ===== Onglet Affaires : taches a faire de temps en temps =====
// 1. Solde bancaire au 31/12 de l'annee precedente
// 2. Releves a integrer (checklist annuelle, rendue par reminders.js)
// 3. Rapprochement des depenses avec les commandes de stock (reconciliation.js)
// 4. Pointage des stocks (rappel hebdomadaire)
// Badge global sur l'onglet : nombre de choses non completes.

const AFFAIRES_STOCK_POINTAGE_DAYS = 7;
const AFFAIRES_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function affairesEsc(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function affairesEur(n) {
    return (Number(n) || 0).toFixed(2).replace('.', ',') + ' €';
}

// ---------- 1. Solde bancaire au 31/12 ----------
function affairesOpeningPending() {
    try {
        const year = new Date().getFullYear();
        if (typeof window.fluxHasOpeningBalance === 'function' && window.fluxHasOpeningBalance(year)) return false;
        return true;
    } catch (e) { return false; }
}

function affairesRenderOpeningBalance() {
    const el = document.getElementById('affaires-opening-balance');
    if (!el) return;
    const year = new Date().getFullYear();
    const pending = affairesOpeningPending();
    const html = `
        <div class="module-card flux-chip-card" style="border-left: 3px solid ${pending ? '#f59e0b' : '#10b981'}; margin-bottom:12px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <div>
                    <h3 style="margin:0; font-size:0.85rem; color:${pending ? '#b45309' : '#059669'};">🏦 Solde bancaire au 31/12/${year - 1}</h3>
                    <p style="margin:4px 0 0; font-size:0.75rem; color:var(--color-text-secondary);">${pending
                        ? 'À saisir en début d\u2019année : c\u2019est le point de départ du solde bancaire affiché dans Flux.'
                        : 'Solde enregistré — le solde bancaire de Flux part de la bonne base.'}</p>
                </div>
                <button class="action-btn ${pending ? 'primary' : ''}" style="padding:6px 14px; font-size:0.78rem;" onclick="affairesEditOpeningBalance()">${pending ? 'Saisir le solde' : '✓ Fait — modifier'}</button>
            </div>
        </div>`;
    if (el.dataset.html === html) return;
    el.dataset.html = html;
    el.innerHTML = html;
}

window.affairesEditOpeningBalance = async function() {
    if (typeof window.fluxEditOpeningBalance !== 'function') return;
    await window.fluxEditOpeningBalance();
    affairesRenderOpeningBalance();
    updateAffairesBadge();
};

// ---------- 2. Releves a integrer : carte de tete (checklist rendue par reminders.js) ----------
function affairesRelevePendingCount() {
    try {
        if (typeof window.remindersMissingMonths === 'function') return window.remindersMissingMonths().length;
    } catch (e) {}
    return 0;
}

function affairesRenderReleveTask() {
    const el = document.getElementById('affaires-releve-task');
    if (!el) return;
    const pending = affairesRelevePendingCount();
    const year = new Date().getFullYear();
    const html = `
        <div class="module-card flux-chip-card" style="border-left: 3px solid ${pending ? '#f59e0b' : '#10b981'}; margin-bottom:12px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <div>
                    <h3 style="margin:0; font-size:0.85rem; color:${pending ? '#b45309' : '#059669'};">📅 Relevés de compte à intégrer</h3>
                    <p style="margin:4px 0 0; font-size:0.75rem; color:var(--color-text-secondary);">${pending
                        ? pending + ' mois de relevé' + (pending > 1 ? 's' : '') + ' de ' + year + ' encore à importer (le relevé du mois courant sort le mois suivant).'
                        : 'Tous les relevés de ' + year + ' sont validés.'}</p>
                </div>
                ${pending ? '<button class="action-btn primary" style="padding:6px 14px; font-size:0.78rem;" onclick="affairesGoImport()">Importer un relevé</button>' : ''}
            </div>
        </div>`;
    if (el.dataset.html === html) return;
    el.dataset.html = html;
    el.innerHTML = html;
}

window.affairesGoImport = function() {
    const pending = (typeof window.remindersMissingMonths === 'function') ? window.remindersMissingMonths() : [];
    if (pending.length > 0 && typeof openReleveUploadFlowForMonth === 'function') {
        openReleveUploadFlowForMonth(pending[pending.length - 1].key);
    }
};

// ---------- 3. Rapprochement des depenses : carte de tete (liste rendue par reconciliation.js) ----------
function affairesReconPendingCount() {
    try {
        if (typeof reconUnmatchedDepenses === 'function') return reconUnmatchedDepenses().length;
    } catch (e) {}
    return 0;
}

function affairesRenderReconTask() {
    const el = document.getElementById('affaires-recon-task');
    if (!el) return;
    const pending = affairesReconPendingCount();
    const html = `
        <div class="module-card flux-chip-card" style="border-left: 3px solid ${pending ? '#f59e0b' : '#10b981'}; margin-bottom:12px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <div>
                    <h3 style="margin:0; font-size:0.85rem; color:${pending ? '#b45309' : '#059669'};">📦 Rapprochement des dépenses</h3>
                    <p style="margin:4px 0 0; font-size:0.75rem; color:var(--color-text-secondary);">${pending
                        ? pending + ' dépense' + (pending > 1 ? 's' : '') + ' à rapprocher de commandes fournisseurs passées dans les stocks.'
                        : 'Toutes les dépenses sont rapprochées de leurs commandes.'}</p>
                </div>
                ${pending ? '<button class="action-btn primary" style="padding:6px 14px; font-size:0.78rem;" onclick="toggleReconPending()">Rapprocher</button>' : ''}
            </div>
        </div>`;
    if (el.dataset.html === html) return;
    el.dataset.html = html;
    el.innerHTML = html;
}

// ---------- 4. Pointage des stocks ----------
function affairesStockPointagePending() {
    try {
        if (typeof window.urgenceDaysSinceLastPointage !== 'function') return false;
        const days = window.urgenceDaysSinceLastPointage();
        return days === null || days >= AFFAIRES_STOCK_POINTAGE_DAYS;
    } catch (e) { return false; }
}

function affairesRenderStockPointage() {
    const el = document.getElementById('affaires-stock-pointage');
    if (!el) return;
    const days = (typeof window.urgenceDaysSinceLastPointage === 'function') ? window.urgenceDaysSinceLastPointage() : null;
    const pending = affairesStockPointagePending();
    const desc = days === null
        ? 'Aucun pointage enregistré — cochez ce qui reste réellement dans la salle d\u2019urgence.'
        : (pending
            ? 'Dernier pointage il y a ' + days + ' jour' + (days > 1 ? 's' : '') + ' — un pointage hebdomadaire est conseillé.'
            : 'Dernier pointage il y a ' + days + ' jour' + (days > 1 ? 's' : '') + ' — à jour.');
    const html = `
        <div class="module-card flux-chip-card" style="border-left: 3px solid ${pending ? '#f59e0b' : '#10b981'}; margin-bottom:12px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <div>
                    <h3 style="margin:0; font-size:0.85rem; color:${pending ? '#b45309' : '#059669'};">📋 Pointage des stocks</h3>
                    <p style="margin:4px 0 0; font-size:0.75rem; color:var(--color-text-secondary);">${desc}</p>
                </div>
                <button class="action-btn ${pending ? 'primary' : ''}" style="padding:6px 14px; font-size:0.78rem;" onclick="affairesGoStockPointage()">${pending ? 'Pointer les stocks' : '✓ Fait — voir'}</button>
            </div>
        </div>`;
    if (el.dataset.html === html) return;
    el.dataset.html = html;
    el.innerHTML = html;
}

window.affairesGoStockPointage = function() {
    if (typeof switchView === 'function') switchView('cabinet');
    setTimeout(function() {
        document.querySelector('.cabinet-tab[data-tab=\'stocks\']')?.click();
        document.querySelector('.sub-tab[data-subtab=\'urgence-pointage\']')?.click();
    }, 150);
};

// ---------- Badge global ----------
function affairesPendingCount() {
    let n = 0;
    if (affairesOpeningPending()) n++;
    n += affairesRelevePendingCount();
    n += affairesReconPendingCount();
    if (affairesStockPointagePending()) n++;
    return n;
}

function updateAffairesBadge() {
    const count = affairesPendingCount();
    ['affairesNavBadge', 'affairesNavBadgeMobile'].forEach(id => {
        const badge = document.getElementById(id);
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    });
}
window.updateAffairesBadge = updateAffairesBadge;

// ---------- Notification debut de mois : importer le releve N-1 ----------
function affairesMonthlyNotify() {
    try {
        const now = new Date();
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevKey = prev.getFullYear() + '-' + String(prev.getMonth() + 1).padStart(2, '0');
        const missing = (typeof window.remindersMissingMonths === 'function') ? window.remindersMissingMonths() : [];
        if (!missing.some(m => m.key === prevKey)) return;
        const dayKey = 'affaires_notif_releve_' + prevKey + '_' + now.toDateString();
        if (localStorage.getItem(dayKey)) return;
        localStorage.setItem(dayKey, '1');
        const label = AFFAIRES_MONTHS[prev.getMonth()] + ' ' + prev.getFullYear();
        if (typeof showToast === 'function') {
            showToast('📅 Pensez à importer le relevé de ' + label, 'info');
        }
    } catch (e) {}
}
window.affairesMonthlyNotify = affairesMonthlyNotify;

// ---------- Rendu global ----------
function renderAffairesView() {
    affairesRenderOpeningBalance();
    affairesRenderReleveTask();
    affairesRenderReconTask();
    affairesRenderStockPointage();
    if (typeof window.renderReminders === 'function') window.renderReminders();
    if (typeof window.renderReconPending === 'function') window.renderReconPending();
    updateAffairesBadge();
    affairesMonthlyNotify();
}
window.renderAffairesView = renderAffairesView;

// Rafraichissement quand les donnees cabinet arrivent (meme si on est sur une autre vue)
(function() {
    const real = window.renderAffairesView;
    let timer = null;
    window.affairesRefresh = function() {
        clearTimeout(timer);
        timer = setTimeout(() => {
            if (document.getElementById('view-affaires')?.classList.contains('active')) {
                real();
            } else {
                updateAffairesBadge();
            }
            affairesMonthlyNotify();
        }, 150);
    };
})();
