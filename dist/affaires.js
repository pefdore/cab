// ===== Page « À faire » — tâches ponctuelles du cabinet =====
// Modèle unifié (Material 3 Expressive) : une carte par tâche.
//  - Tâches À FAIRE en haut, avec bouton d'action
//  - Tâches Faites en bas, réduites (titre + badge Fait), dépliables au clic
//  - Relevés et rapprochement : la checklist vit DANS la carte (plus de doublon)
// 1. Solde bancaire au 31/12 de l'année précédente
// 2. Relevés à intégrer (checklist annuelle, rendue par reminders.js)
// 3. Rapprochement des dépenses avec les commandes de stock (reconciliation.js)
// 4. Pointage des stocks (rappel hebdomadaire)

const AFFAIRES_STOCK_POINTAGE_DAYS = 7;
const AFFAIRES_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function affairesEsc(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------- Icônes (trait 2, 24px, comme le reste de l'app) ----------
const AFFAIRES_ICONS = {
    bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M4 10v11"/><path d="M20 10v11"/><path d="M8 14v3M12 14v3M16 14v3"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    match: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 13l2 2 4-4"/></svg>'
};

// ---------- 1. Solde bancaire au 31/12 ----------
function affairesOpeningPending() {
    try {
        const year = new Date().getFullYear();
        if (typeof window.fluxHasOpeningBalance === 'function' && window.fluxHasOpeningBalance(year)) return false;
        return true;
    } catch (e) { return false; }
}

window.affairesEditOpeningBalance = async function() {
    if (typeof window.fluxEditOpeningBalance !== 'function') return;
    await window.fluxEditOpeningBalance();
    renderAffairesView();
    updateAffairesBadge();
};

// ---------- 2. Relevés à intégrer ----------
function affairesRelevePendingCount() {
    try {
        if (typeof window.remindersMissingMonths === 'function') return window.remindersMissingMonths().length;
    } catch (e) {}
    return 0;
}

window.affairesGoImport = function() {
    const pending = (typeof window.remindersMissingMonths === 'function') ? window.remindersMissingMonths() : [];
    if (pending.length > 0 && typeof openReleveUploadFlowForMonth === 'function') {
        openReleveUploadFlowForMonth(pending[pending.length - 1].key);
    }
};

// ---------- 3. Rapprochement des dépenses ----------
function affairesReconPendingCount() {
    try {
        if (typeof reconUnmatchedDepenses === 'function') return reconUnmatchedDepenses().length;
    } catch (e) {}
    return 0;
}

// ---------- 4. Pointage des stocks ----------
function affairesStockPointagePending() {
    try {
        if (typeof window.urgenceDaysSinceLastPointage !== 'function') return false;
        const days = window.urgenceDaysSinceLastPointage();
        return days === null || days >= AFFAIRES_STOCK_POINTAGE_DAYS;
    } catch (e) { return false; }
}

window.affairesGoStockPointage = function() {
    if (typeof switchView === 'function') switchView('cabinet');
    setTimeout(function() {
        document.querySelector('.cabinet-tab[data-tab=\'stocks\']')?.click();
        document.querySelector('.sub-tab[data-subtab=\'urgence-pointage\']')?.click();
    }, 150);
};

// ---------- Définition des 4 tâches ----------
function affairesTaskDefs() {
    const year = new Date().getFullYear();
    const releveN = affairesRelevePendingCount();
    const reconN = affairesReconPendingCount();
    const days = (typeof window.urgenceDaysSinceLastPointage === 'function') ? window.urgenceDaysSinceLastPointage() : null;
    const stockPending = affairesStockPointagePending();
    const openingPending = affairesOpeningPending();

    return [
        {
            id: 'releve', icon: AFFAIRES_ICONS.calendar,
            title: 'Relevés de compte ' + year,
            sub: releveN > 0
                ? releveN + ' mois à importer' + (releveN > 1 ? 's' : '')
                : 'Tous les relevés de ' + year + ' sont validés',
            pending: releveN > 0, hasDetail: true,
            containerId: 'affaires-releve-checklist',
            actionLabel: 'Importer', actionFn: 'affairesGoImport()'
        },
        {
            id: 'recon', icon: AFFAIRES_ICONS.match,
            title: 'Rapprochement des dépenses',
            sub: reconN > 0
                ? reconN + ' dépense' + (reconN > 1 ? 's' : '') + ' à rattacher à une commande'
                : 'Toutes les dépenses sont rattachées à leurs commandes',
            pending: reconN > 0, hasDetail: true,
            containerId: 'affaires-recon-pending',
            actionLabel: 'Rapprocher', actionFn: 'toggleReconPending()'
        },
        {
            id: 'opening', icon: AFFAIRES_ICONS.bank,
            title: 'Solde bancaire au 31/12/' + (year - 1),
            sub: openingPending
                ? 'À saisir — point de départ du solde bancaire de Flux'
                : 'Solde enregistré — le solde de Flux part de la bonne base',
            pending: openingPending, hasDetail: false,
            actionLabel: 'Saisir', actionFn: 'affairesEditOpeningBalance()'
        },
        {
            id: 'stock', icon: AFFAIRES_ICONS.clipboard,
            title: 'Pointage des stocks',
            sub: days === null
                ? 'Aucun pointage enregistré — vérifiez la salle d\u2019urgence'
                : 'Dernier pointage il y a ' + days + ' jour' + (days > 1 ? 's' : ''),
            pending: stockPending, hasDetail: false,
            actionLabel: 'Pointer', actionFn: 'affairesGoStockPointage()'
        }
    ];
}

// ---------- Rendu : liste unifiée, fait en bas ----------
window.affairesToggleTask = function(id) {
    try {
        window._todoOpen = window._todoOpen || {};
        window._todoOpen[id] = !window._todoOpen[id];
        const card = document.getElementById('todo-card-' + id);
        if (card) card.classList.toggle('open', !!window._todoOpen[id]);
    } catch (e) {}
};

function affairesRenderCard(t) {
    const open = (window._todoOpen && window._todoOpen[t.id]) !== undefined
        ? !!window._todoOpen[t.id]
        : (t.pending && t.hasDetail); // par défaut : les tâches à faire avec checklist sont dépliées
    const chevron = t.hasDetail
        ? '<svg class="todo-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
        : '';
    return '<div class="todo-card' + (t.pending ? '' : ' todo-card-done') + (open ? ' open' : '') + '" id="todo-card-' + t.id + '">' +
        '<div class="todo-card-header" onclick="affairesToggleTask(\'' + t.id + '\')">' +
            '<span class="todo-icon">' + t.icon + '</span>' +
            '<div class="todo-card-text">' +
                '<div class="todo-title">' + affairesEsc(t.title) + '</div>' +
                '<div class="todo-sub">' + affairesEsc(t.sub) + '</div>' +
            '</div>' +
            (t.pending
                ? '<button class="todo-action" onclick="event.stopPropagation();' + t.actionFn + '">' + affairesEsc(t.actionLabel) + '</button>'
                : '<span class="todo-chip-done"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>Fait</span>') +
            chevron +
        '</div>' +
        (t.hasDetail
            ? '<div class="todo-detail"><div id="' + t.containerId + '"></div></div>'
            : '') +
    '</div>';
}

function affairesRenderTasks() {
    const pendingWrap = document.getElementById('affaires-todo-pending');
    const doneWrap = document.getElementById('affaires-todo-done-wrap');
    const doneList = document.getElementById('affaires-todo-done');
    if (!pendingWrap || !doneList) return;

    const tasks = affairesTaskDefs();
    const pending = tasks.filter(t => t.pending);
    const done = tasks.filter(t => !t.pending);

    pendingWrap.innerHTML = pending.map(affairesRenderCard).join('');
    doneList.innerHTML = done.map(affairesRenderCard).join('');
    if (doneWrap) {
        doneWrap.style.display = done.length ? '' : 'none';
        const cnt = document.getElementById('affaires-todo-done-count');
        if (cnt) cnt.textContent = done.length;
    }
}

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

// ---------- Notification début de mois : importer le relevé N-1 ----------
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
    affairesRenderTasks();
    if (typeof window.renderReminders === 'function') window.renderReminders();
    if (typeof window.renderReconPending === 'function') window.renderReconPending();
    updateAffairesBadge();
    affairesMonthlyNotify();
}
window.renderAffairesView = renderAffairesView;

// Rafraîchissement quand les données cabinet arrivent (même si on est sur une autre vue)
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
