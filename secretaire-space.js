// ============================================
// ESPACE SECRETAIRE
// - Validation de l'acces cabinet par un associe
// - Dashboard secretaire : taches + stocks + raccourcis
// - Gestionnaire de taches partage (cabinet_tasks)
// ============================================

console.log('[SECRETARIAT-SPACE] Module charge');

const SECRETARY_ROLE = 'secretaire';

let secSpaceRequestsUnsub = null;
let secSpacePollTimer = null;

// ---------- Helpers ----------

function secIsSecretary() {
    const p = window.currentProfile || (typeof currentProfile !== 'undefined' ? currentProfile : null);
    const meta = window.currentUser?.user_metadata;
    return p?.role === SECRETARY_ROLE || meta?.role === SECRETARY_ROLE;
}

function secIsApproved() {
    try { return sessionStorage.getItem('cab_sec_approved') === '1'; } catch (e) { return false; }
}

function secSetApproved(v) {
    try { sessionStorage.setItem('cab_sec_approved', v ? '1' : '0'); } catch (e) {}
}

async function secGetCabinetId() {
    try {
        if (typeof supabaseClient === 'undefined' || !supabaseClient || !window.currentUser?.id) return null;
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('cabinet_id')
            .eq('id', window.currentUser.id)
            .single();
        if (error || !data?.cabinet_id) return null;
        return data.cabinet_id;
    } catch (e) { return null; }
}

async function secResolveCabinetByAddress(address) {
    try {
        if (!address) return null;
        const { data } = await supabaseClient
            .from('cabinets')
            .select('id, address, profiles(id)')
            .ilike('address', '%' + address + '%')
            .limit(5);
        if (!data || !data.length) return null;
        const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
        // En cas de cabinets partages (meme adresse), privilegier celui qui a
        // deja des membres (le vrai cabinet) plutit que le premier trouve
        const withMembers = data.filter(c => Array.isArray(c.profiles) && c.profiles.length > 0);
        const pool = withMembers.length ? withMembers : data;
        const exact = pool.find(c => norm(c.address) === norm(address));
        return (exact || pool[0]).id;
    } catch (e) { return null; }
}

function secGetStoredCabinetId() {
    try { return localStorage.getItem('cab_pending_secretary_cabinet_id'); } catch (e) { return null; }
}

function secEsc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Validation des demandes (cote medecin associe) ----------

async function secLoadJoinRequests() {
    try {
        if (typeof supabaseClient === 'undefined' || !supabaseClient || !window.currentUser?.id) return [];
        const { data: profile, error: pErr } = await supabaseClient
            .from('profiles')
            .select('cabinet_id, role')
            .eq('id', window.currentUser.id)
            .single();
        // Tolerance : on ne filtre plus sur le role (user_profiles peut diverger de
        // profiles et la table lue par loadUserProfile est user_profiles) ; la RLS
        // de cabinet_join_requests limite deja la lecture aux membres du cabinet.
        // En cas de divergence role, on tente l'affichage quand meme si un cabinet existe.
        if (!profile?.cabinet_id) {
            console.warn('[SEC-SPACE] pas de cabinet sur le profil');
            return [];
        }
        if (profile.role !== 'medecin_installe') {
            console.warn('[SEC-SPACE] role dans profiles =', profile.role, '- tentative d\'affichage quand meme');
        }

        const { data, error } = await supabaseClient
            .from('cabinet_join_requests')
            .select('*, cabinets(address, name)')
            .eq('cabinet_id', profile.cabinet_id)
            .eq('status', 'pending')
            .order('created_at', { ascending: true });
        if (error) {
            console.error('[SEC-SPACE] loadJoinRequests:', error.message);
            return [];
        }
        if (!data || data.length === 0) {
            console.log('[SEC-SPACE] 0 demande pending pour le cabinet', profile.cabinet_id);
        }
        return data || [];
    } catch (e) {
        console.error('[SEC-SPACE] loadJoinRequests:', e);
        return [];
    }
}

async function secRenderJoinRequestsBanner() {
    const wrap = document.getElementById('secJoinRequestsBanner');
    if (!wrap) return;
    const requests = await secLoadJoinRequests();

    // Badge de notification sur le menu Cabinet (desktop + mobile)
    const badge = document.getElementById('secNavBadge');
    const badgeMobile = document.getElementById('secNavBadgeMobile');
    [badge, badgeMobile].forEach(b => {
        if (!b) return;
        if (requests.length > 0) {
            b.textContent = requests.length;
            b.style.display = 'flex';
        } else {
            b.style.display = 'none';
        }
    });

    if (!requests.length) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }

    wrap.style.display = 'block';
    wrap.innerHTML =
        '<h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L11.6 1.6a1.5 1.5 0 0 1 2.63 0l1.31 2.26 2.55.38a1.5 1.5 0 0 1 .83 2.56l-1.85 1.8.44 2.54a1.5 1.5 0 0 1-2.17 1.58L12 11.6l-2.29 1.2a1.5 1.5 0 0 1-2.17-1.58l.44-2.54-1.85-1.8a1.5 1.5 0 0 1 .83-2.56l2.55-.38z"/></svg> Demandes d\'acc\u00e8s en attente</h3>' +
        '<p class="sec-banner-desc">Ces secr\u00e9taires demandent \u00e0 rejoindre l\'espace cabinet. Approuvez pour leur donner acc\u00e8s.</p>' +
        requests.map(r =>
            '<div class="sec-request-card" data-request="' + r.id + '" data-requester="' + (r.requester_id || '') + '">' +
                '<div class="sec-request-info">' +
                    '<span class="sec-request-name">' + secEsc((r.requester_name || '').trim() || 'Secretaire') + '</span>' +
                    '<span class="sec-request-email">' + secEsc(r.requester_email || '') + '</span>' +
                    (r.cabinets?.address ? '<span class="sec-request-cabinet">Cabinet : ' + secEsc(r.cabinets.address) + '</span>' : '') +
                '</div>' +
                '<div class="sec-request-actions">' +
                    '<button class="action-btn primary" onclick="secApproveRequest(\'' + r.id + '\')">Approuver</button>' +
                    '<button class="action-btn" onclick="secRejectRequest(\'' + r.id + '\')">Refuser</button>' +
                '</div>' +
            '</div>'
        ).join('');
}

async function secDecideRequest(requestId, approve) {
    try {
        const { data: req, error: fetchErr } = await supabaseClient
            .from('cabinet_join_requests')
            .select('id, cabinet_id, requester_id')
            .eq('id', requestId)
            .single();
        if (fetchErr || !req) throw fetchErr || new Error('Demande introuvable');
        const requesterId = req.requester_id;
        const cabinetId = req.cabinet_id;

        const { error } = await supabaseClient
            .from('cabinet_join_requests')
            .update({
                status: approve ? 'approved' : 'rejected',
                decided_by: window.currentUser.id,
                decided_at: new Date().toISOString()
            })
            .eq('id', requestId);
        if (error) throw error;

        if (approve && requesterId) {
            await supabaseClient
                .from('profiles')
                .update({ cabinet_id: cabinetId })
                .eq('id', requesterId);
        }

        if (typeof showToast === 'function') {
            showToast(approve ? 'Acc\u00e8s cabinet accord\u00e9 au secr\u00e9taire' : 'Demande refus\u00e9e', 'success');
        }
        secRenderJoinRequestsBanner();
    } catch (e) {
        console.error('[SEC-SPACE] decideRequest:', e);
        if (typeof showToast === 'function') showToast('Erreur lors de la validation : ' + e.message, 'error');
    }
}

window.secApproveRequest = (id) => secDecideRequest(id, true);
window.secRejectRequest = (id) => secDecideRequest(id, false);

// ---------- Filet de securite cote medecin : creer les demandes manquantes ----------
// Pour chaque secretaire du cabinet sans demande en base, le medecin cree la
// demande pending (utile si l'insert cote secretaire a ete bloque par RLS).
async function secBackfillRequestsForCabinet() {
    try {
        const cabinetId = await secGetCabinetId();
        if (!cabinetId) return;
        const { data: secretaries, error } = await supabaseClient
            .from('profiles')
            .select('id, first_name, last_name, email, role, cabinet_address')
            .eq('role', 'secretaire')
            .or(`cabinet_id.eq.${cabinetId},and(cabinet_id.isnull,cabinet_address.not.isnull)`);
        if (error) {
            console.error('[SEC-SPACE] backfill secretaires:', error.message);
            return;
        }
        if (!secretaries || !secretaries.length) {
            console.log('[SEC-SPACE] backfill: aucune secretaire trouvee');
            return;
        }
        for (const s of secretaries) {
            // Son cabinet vise : celui du profil, sinon resolution par adresse
            let targetCabinet = s.cabinet_id;
            if (!targetCabinet && s.cabinet_address) {
                targetCabinet = await secResolveCabinetByAddress(s.cabinet_address);
            }
            if (!targetCabinet) continue;
            if (String(targetCabinet) !== String(cabinetId)) continue;
            const { data: existing } = await supabaseClient
                .from('cabinet_join_requests')
                .select('id')
                .eq('requester_id', s.id)
                .eq('cabinet_id', cabinetId)
                .limit(1);
            if (existing && existing.length) continue;
            const { error: insErr } = await supabaseClient
                .from('cabinet_join_requests')
                .insert({
                    cabinet_id: cabinetId,
                    requester_id: s.id,
                    requester_name: ((s.first_name || '') + ' ' + (s.last_name || '')).trim() || 'Secretaire',
                    requester_email: s.email || '',
                    role: SECRETARY_ROLE
                });
            if (insErr) console.error('[SEC-SPACE] backfill insert:', insErr.message);
            else console.log('[SEC-SPACE] backfill: demande creee pour', s.email);
        }
        secRenderJoinRequestsBanner();
    } catch (e) {
        console.error('[SEC-SPACE] backfill:', e);
    }
}

// ---------- Creation de la demande (a l'inscription secretaire) ----------

function secGoToStocksTab() {
    if (typeof switchView === 'function') switchView('cabinet');
    setTimeout(function() {
        document.querySelector('.cabinet-tab[data-tab=\'stocks\']')?.click();
    }, 100);
}
window.secGoToStocksTab = secGoToStocksTab;

async function secCreateJoinRequest(cabinetId) {
    try {
        const user = window.currentUser;
        if (!user) return;
        const name = ((user.user_metadata?.first_name || '') + ' ' + (user.user_metadata?.last_name || '')).trim();
        const { error } = await supabaseClient
            .from('cabinet_join_requests')
            .insert({
                cabinet_id: cabinetId,
                requester_id: user.id,
                requester_name: name || 'Secretaire',
                requester_email: user.email || '',
                role: SECRETARY_ROLE
            });
        if (error) {
            console.error('[SEC-SPACE] createJoinRequest erreur (probablement RLS):', error.message, error.code, error.hint);
        } else {
            console.log('[SEC-SPACE] Demande de validation creee pour le cabinet', cabinetId);
        }
    } catch (e) {
        console.error('[SEC-SPACE] createJoinRequest:', e);
    }
}

// ---------- Espace secretaire : activation de la vue ----------

function secResetUiOnLogout() {
    const secSpace = document.getElementById('secretarySpace');
    if (secSpace) secSpace.style.display = 'none';
    const banner = document.getElementById('secPendingApprovalBanner');
    if (banner) banner.style.display = 'none';
    const joinBanner = document.getElementById('secJoinRequestsBanner');
    if (joinBanner) { joinBanner.style.display = 'none'; joinBanner.innerHTML = ''; }
    ['secNavBadge', 'secNavBadgeMobile'].forEach(id => {
        const b = document.getElementById(id);
        if (b) b.style.display = 'none';
    });
    // Restaurer la visibilite par defaut des vues et onglets
    ['view-dashboard', 'view-flux', 'view-history', 'view-urgence'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
    });
    document.querySelectorAll('.nav-item, .mobile-nav-item, .cabinet-tab').forEach(item => {
        item.style.display = '';
    });
    ['cabinet-secretariat', 'cabinet-reunions', 'cabinet-remplacants'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.style.display = ''; el.classList.remove('active'); }
    });
    if (secSpacePollTimer) { clearInterval(secSpacePollTimer); secSpacePollTimer = null; }
    // Restaurer le FAB pour le prochain utilisateur
    const fab = document.getElementById('fabContainer');
    if (fab) fab.style.display = '';
    document.querySelectorAll('[data-settings-page]').forEach(el => { el.style.display = ''; });
    ['settings-page-pdf', 'settings-page-cotation'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function secApplySecretarySpace() {
    const secSpace = document.getElementById('secretarySpace');
    if (!secSpace) return;

    if (!secIsSecretary()) {
        secSpace.style.display = 'none';
        return;
    }

    // Toute secretaire (validee ou non) est soustraite aux vues medecin :
    // dashboard cotation/finances, flux, documents, urgence
    ['view-dashboard', 'view-flux', 'view-history', 'view-urgence'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(item => {
        if (item.dataset.view && ['dashboard', 'flux', 'history', 'urgence'].includes(item.dataset.view)) {
            item.style.display = 'none';
        }
    });
    // Dans l'espace Cabinet : masquer les onglets reserves aux medecins
    // (Secretariat RH, Reunions, Remplacants) ainsi que leurs contenus.
    // L'onglet Stocks reste visible seulement si la secretaire est approuvee.
    const approved = secIsApproved();
    const tabsToHide = approved
        ? ['secretariat', 'reunions', 'remplacants']
        : ['secretariat', 'reunions', 'remplacants', 'stocks'];
    document.querySelectorAll('.cabinet-tab').forEach(tab => {
        if (tabsToHide.includes(tab.dataset.tab)) {
            tab.style.display = 'none';
        }
    });
    const contentsToHide = approved
        ? ['cabinet-secretariat', 'cabinet-reunions', 'cabinet-remplacants']
        : ['cabinet-secretariat', 'cabinet-reunions', 'cabinet-remplacants', 'cabinet-stocks'];
    contentsToHide.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.classList.remove('active'); el.style.display = 'none'; }
    });
    // Le bouton flottant (FAB) donne acces aux releves bancaires et depenses :
    // reserve aux medecins. Masque pour toute secretaire.
    const fab = document.getElementById('fabContainer');
    if (fab) fab.style.display = 'none';
    // Parametres : les pages reservees aux medecins sont masquees.
    // La secretaire garde : profil, preferences (theme), donnees.
    // Lui retirer : PDF & documents (logo, signature, IBAN, modeles),
    // cotations, passages, IA, zone dangereuse.
    document.querySelectorAll('[data-settings-page="pdf"], [data-settings-page="cotation"]').forEach(el => {
        el.style.display = 'none';
    });
    const medPages = ['settings-page-pdf', 'settings-page-cotation'];
    medPages.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const content = document.getElementById('secSpaceContent');
    const pendingBanner = document.getElementById('secPendingApprovalBanner');

    if (secIsApproved()) {
        if (pendingBanner) pendingBanner.style.display = 'none';
        if (content) content.style.display = 'block';
        secSpace.style.display = 'block';
        secRefreshSpace();
    } else {
        // Acces pas encore valide : seul le bandeau d'attente est affiche
        if (content) content.style.display = 'none';
        if (pendingBanner) pendingBanner.style.display = 'flex';
        secSpace.style.display = 'block';
    }
}

async function secRefreshSpace() {
    await secRenderTasks();
    await secRenderSpaceStocksSummary();
}

// ---------- Gestionnaire de taches ----------

let secTasks = [];

async function secLoadTasks() {
    const cabinetId = await secGetCabinetId();
    if (!cabinetId) { secTasks = []; return; }
    const { data, error } = await supabaseClient
        .from('cabinet_tasks')
        .select('*')
        .eq('cabinet_id', cabinetId)
        .order('created_at', { ascending: false });
    if (error) {
        console.error('[SEC-SPACE] loadTasks:', error.message);
        return;
    }
    secTasks = data || [];
}

function secTaskBadge(t) {
    const prioClass = t.priority === 'haute' ? 'sec-task-prio-high' : (t.priority === 'basse' ? 'sec-task-prio-low' : 'sec-task-prio-normal');
    const prioLabel = t.priority === 'haute' ? 'Haute' : (t.priority === 'basse' ? 'Basse' : 'Normale');
    return '<span class="sec-task-prio ' + prioClass + '">' + prioLabel + '</span>';
}

async function secRenderTasks() {
    const todoEl = document.getElementById('secTasksTodo');
    const doneEl = document.getElementById('secTasksDone');
    if (!todoEl || !doneEl) return;

    await secLoadTasks();
    const todo = secTasks.filter(t => t.status === 'todo');
    const done = secTasks.filter(t => t.status === 'done');

    const counter = document.getElementById('secTasksCounter');
    if (counter) counter.textContent = todo.length;

    const today = new Date().toISOString().slice(0, 10);

    todoEl.innerHTML = todo.length === 0
        ? '<p class="sec-task-empty">Aucune t\u00e2che en cours. Ajoutez-en une ou attendez les instructions des m\u00e9decins associ\u00e9s.</p>'
        : todo.map(t => {
            const late = t.due_date && t.due_date < today;
            return '<div class="sec-task-card" data-task="' + t.id + '">' +
                '<label class="sec-task-check"><input type="checkbox" onchange="secToggleTask(\'' + t.id + '\', true)" aria-label="Terminer"></label>' +
                '<div class="sec-task-body">' +
                    '<span class="sec-task-title">' + secEsc(t.title) + '</span>' +
                    (t.notes ? '<span class="sec-task-notes">' + secEsc(t.notes) + '</span>' : '') +
                    '<span class="sec-task-meta">' + secTaskBadge(t) +
                        (t.due_date ? '<span class="sec-task-due' + (late ? ' late' : '') + '">\u{1F4C5} ' + secEsc(t.due_date) + (late ? ' (en retard)' : '') + '</span>' : '') +
                    '</span>' +
                '</div>' +
                '<button class="sec-task-del" onclick="secDeleteTask(\'' + t.id + '\')" title="Supprimer">\u2715</button>' +
            '</div>';
        }).join('');

    doneEl.innerHTML = done.length === 0
        ? '<p class="sec-task-empty">Aucune t\u00e2che termin\u00e9e pour le moment.</p>'
        : done.slice(0, 20).map(t =>
            '<div class="sec-task-card done" data-task="' + t.id + '">' +
                '<label class="sec-task-check"><input type="checkbox" checked onchange="secToggleTask(\'' + t.id + '\', false)" aria-label="R\u00e9ouvrir"></label>' +
                '<div class="sec-task-body">' +
                    '<span class="sec-task-title">' + secEsc(t.title) + '</span>' +
                '</div>' +
                '<button class="sec-task-del" onclick="secDeleteTask(\'' + t.id + '\')" title="Supprimer">\u2715</button>' +
            '</div>'
        ).join('');
}

async function secAddTask() {
    const titleEl = document.getElementById('secNewTaskTitle');
    const notesEl = document.getElementById('secNewTaskNotes');
    const dueEl = document.getElementById('secNewTaskDue');
    const prioEl = document.getElementById('secNewTaskPrio');
    const title = (titleEl?.value || '').trim();
    if (!title) {
        if (typeof showToast === 'function') showToast('Donnez un titre \u00e0 la t\u00e2che', 'error');
        return;
    }
    const cabinetId = await secGetCabinetId();
    if (!cabinetId) {
        if (typeof showToast === 'function') showToast('Cabinet non configur\u00e9', 'error');
        return;
    }
    const { error } = await supabaseClient
        .from('cabinet_tasks')
        .insert({
            cabinet_id: cabinetId,
            created_by: window.currentUser.id,
            assigned_to: window.currentUser.id,
            title: title,
            notes: (notesEl?.value || '').trim() || null,
            due_date: dueEl?.value || null,
            priority: prioEl?.value || 'normale',
            status: 'todo'
        });
    if (error) {
        console.error('[SEC-SPACE] addTask:', error.message);
        if (typeof showToast === 'function') showToast('Erreur : ' + error.message, 'error');
        return;
    }
    if (titleEl) titleEl.value = '';
    if (notesEl) notesEl.value = '';
    if (dueEl) dueEl.value = '';
    secRenderTasks();
}

async function secToggleTask(taskId, done) {
    const { error } = await supabaseClient
        .from('cabinet_tasks')
        .update({ status: done ? 'done' : 'todo', updated_at: new Date().toISOString() })
        .eq('id', taskId);
    if (error) {
        console.error('[SEC-SPACE] toggleTask:', error.message);
        return;
    }
    secRenderTasks();
}

async function secDeleteTask(taskId) {
    const { error } = await supabaseClient
        .from('cabinet_tasks')
        .delete()
        .eq('id', taskId);
    if (error) {
        console.error('[SEC-SPACE] deleteTask:', error.message);
        if (typeof showToast === 'function') showToast('Suppression r\u00e9serv\u00e9e aux m\u00e9decins associ\u00e9s', 'error');
        return;
    }
    secRenderTasks();
}

window.secAddTask = secAddTask;
window.secToggleTask = secToggleTask;
window.secDeleteTask = secDeleteTask;

// ---------- Synthese stocks (cabinet_stock_data partage) ----------

async function secRenderSpaceStocksSummary() {
    const wrap = document.getElementById('secSpaceStocksSummary');
    if (!wrap) return;
    try {
        const cabinetId = await secGetCabinetId();
        if (!cabinetId) { wrap.innerHTML = ''; return; }
        const { data, error } = await supabaseClient
            .from('cabinet_stock_data')
            .select('data')
            .eq('cabinet_id', cabinetId)
            .single();
        if (error || !data?.data) {
            wrap.innerHTML = '<p class="sec-task-empty">Aucun stock partag\u00e9 pour le moment.</p>';
            return;
        }
        const products = Array.isArray(data.data.products) ? data.data.products : [];
        const low = products.filter(p => (Number(p.quantity) || 0) <= (Number(p.minQuantity) || 0));
        const today = new Date().toISOString().slice(0, 10);
        const expiring = products.filter(p => p.expiry && p.expiry <= today);
        const lastPointage = data.data.lastPointage?.date || null;

        wrap.innerHTML =
            '<div class="sec-stock-tiles">' +
                '<div class="sec-stock-tile"><span class="sec-stock-num">' + products.length + '</span><span class="sec-stock-label">Produits suivis</span></div>' +
                '<div class="sec-stock-tile warn"><span class="sec-stock-num">' + low.length + '</span><span class="sec-stock-label">Stocks bas / rupture</span></div>' +
                '<div class="sec-stock-tile warn"><span class="sec-stock-num">' + expiring.length + '</span><span class="sec-stock-label">P\u00e9rim\u00e9s / bient\u00f4t</span></div>' +
                '<div class="sec-stock-tile"><span class="sec-stock-num">' + (lastPointage ? secEsc(lastPointage) : '\u2014') + '</span><span class="sec-stock-label">Dernier pointage</span></div>' +
            '</div>' +
            (low.length ? '<div class="sec-stock-lowlist"><strong>\u00c0 recommander :</strong> ' + low.slice(0, 8).map(p => secEsc(p.name)).join(', ') + (low.length > 8 ? '\u2026' : '') + '</div>' : '');
    } catch (e) {
        console.error('[SEC-SPACE] stocksSummary:', e);
    }
}

// ---------- Bandeau secretaire non valide ----------

async function secRenderPendingBanner() {
    const banner = document.getElementById('secPendingApprovalBanner');
    if (!banner) return;
    banner.style.display = 'flex';
    try {
        const { data } = await supabaseClient
            .from('cabinet_join_requests')
            .select('status, created_at')
            .eq('requester_id', window.currentUser.id)
            .order('created_at', { ascending: false })
            .limit(1);
        if (data && data.length && data[0].status === 'rejected') {
            banner.querySelector('.sec-pending-title').textContent = 'Demande refus\u00e9e';
            banner.querySelector('.sec-pending-text').textContent = 'Un m\u00e9decin associ\u00e9 a refus\u00e9 votre demande d\'acc\u00e8s au cabinet. Contactez le cabinet directement.';
        }
    } catch (e) {}
}

// ---------- Verrou d'acces : la secretaire ne voit l'espace que si approuvee ----------

async function secCheckApproval() {
    if (!secIsSecretary()) return true;
    try {
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('cabinet_id, cabinet_address')
            .eq('id', window.currentUser.id)
            .single();
        if (profile?.cabinet_id) {
            const { data: req } = await supabaseClient
                .from('cabinet_join_requests')
                .select('status')
                .eq('requester_id', window.currentUser.id)
                .eq('cabinet_id', profile.cabinet_id)
                .order('created_at', { ascending: false })
                .limit(1);
            const status = req && req.length ? req[0].status : null;
            // Une secretaire n'accede a l'espace que si une demande a ete APPROUVEE
            const approved = status === 'approved';
            secSetApproved(approved);
            if (!approved) secRenderPendingBanner();
            return approved;
        }
        // Pas encore rattachee a un cabinet : on regarde si une demande a ete approuvee
        const storedAddress = (function() {
            try { return localStorage.getItem('cab_pending_secretary_cabinet'); } catch (e) { return null; }
        })();
        const cabinetId = window._pendingSecretaryCabinetId || secGetStoredCabinetId() || await secResolveCabinetByAddress(profile?.cabinet_address || storedAddress);
        if (cabinetId) {
            const { data: req } = await supabaseClient
                .from('cabinet_join_requests')
                .select('status')
                .eq('requester_id', window.currentUser.id)
                .eq('cabinet_id', cabinetId)
                .order('created_at', { ascending: false })
                .limit(1);
            if (req && req.length && req[0].status === 'approved') {
                secSetApproved(true);
                return true;
            }
        }
        secSetApproved(false);
        secRenderPendingBanner();
        return false;
    } catch (e) {
        console.error('[SEC-SPACE] checkApproval:', e);
        return false;
    }
}

// ---------- Polling des demandes (cote medecin) ----------

function secStartRequestsPolling() {
    if (secSpacePollTimer) return;
    secSpacePollTimer = setInterval(() => {
        if (!window.currentUser) return;
        const role = window.currentProfile?.role || window.currentUser.user_metadata?.role;
        if (role === 'medecin_installe') secRenderJoinRequestsBanner();
    }, 30000);
}

function secStartApprovalWatch() {
    // Le profil charge en async : on re-evalue le role quelques fois apres le login
    // pour afficher le bandeau/badge des demandes des que currentProfile arrive
    let tries = 0;
    const watcher = setInterval(() => {
        tries++;
        if (!window.currentUser || tries > 20) { clearInterval(watcher); return; }
        const role = window.currentProfile?.role || window.currentUser.user_metadata?.role;
        if (role === 'medecin_installe') {
            secRenderJoinRequestsBanner();
            secStartRequestsPolling();
            secBackfillRequestsForCabinet();
            clearInterval(watcher);
        }
    }, 500);
}

// ---------- Init ----------

async function initSecretarySpace() {
    if (!window.currentUser) return;

    // Inscription secretaire : la demande de validation est envoyee a la premiere connexion
    if (secIsSecretary()) {
        const pendingCabinetId = window._pendingSecretaryCabinetId;
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('cabinet_id, cabinet_address')
            .eq('id', window.currentUser.id)
            .single();
        const storedAddress = (function() {
            try { return localStorage.getItem('cab_pending_secretary_cabinet'); } catch (e) { return null; }
        })();
        const cabinetId = profile?.cabinet_id || pendingCabinetId || secGetStoredCabinetId() || await secResolveCabinetByAddress(profile?.cabinet_address || storedAddress);
        if (cabinetId) {
            // La demande de validation est (re)creee si elle n'existe pas encore,
            // y compris pour une secretaire deja rattachee par un ancien bug :
            // tant qu'aucune demande approved n'existe, l'acces reste verrouille
            if (!profile?.cabinet_id) window._pendingSecretaryCabinetId = cabinetId;
            const { data: existing } = await supabaseClient
                .from('cabinet_join_requests')
                .select('id, status')
                .eq('requester_id', window.currentUser.id)
                .eq('cabinet_id', cabinetId)
                .limit(1);
            if (!existing || existing.length === 0) {
                await secCreateJoinRequest(cabinetId);
            }
        }
    }

    const approved = await secCheckApproval();
    secApplySecretarySpace();

    const role = window.currentProfile?.role || window.currentUser.user_metadata?.role;
    if (role === 'medecin_installe') {
        secRenderJoinRequestsBanner();
        secStartRequestsPolling();
        secBackfillRequestsForCabinet();
    } else {
        // currentProfile pas encore charge : surveiller son arrivee
        secStartApprovalWatch();
    }
}

function initSecretarySpaceWhenReady() {
    const tryInit = async () => {
        if (!window.supabaseClient || !window.currentUser) {
            setTimeout(tryInit, 300);
            return;
        }
        // currentProfile est charge async par app.v5.js ; on attend un peu
        setTimeout(initSecretarySpace, 400);
    };
    tryInit();
}

if (typeof window !== 'undefined') {
    window.initSecretarySpace = initSecretarySpace;
    window.initSecretarySpaceWhenReady = initSecretarySpaceWhenReady;
    window.secRenderJoinRequestsBanner = secRenderJoinRequestsBanner;
    window.secCreateJoinRequest = secCreateJoinRequest;
    window.secRefreshSpace = secRefreshSpace;
    window.secApplySecretarySpace = secApplySecretarySpace;
    window.secResetUiOnLogout = secResetUiOnLogout;
}
