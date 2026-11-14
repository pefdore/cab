/* ============================================================
   MARKETPLACE REMPLACEMENTS — mise en relation intelligente
   Medecins installes / Remplacants / Docteurs juniors
   Offres ponctuelles ou regulieres, disponibilites, mises en
   relation bidirectionnelles, notifications et contrats.
   ============================================================ */
(function() {
    'use strict';

    var RM = {
        ready: false,
        role: null,
        offres: [],
        mesOffres: [],
        dispos: [],
        mesDispos: [],
        candidaturesRecues: [],
        mesCandidatures: [],
        notifications: [],
        unreadCount: 0,
        pollTimer: null,
        currentTab: 'marche'
    };
    window.RM_MARKET = RM;

    var TYPES_OFFRE = {
        ponctuel: { label: 'Remplacement ponctuel', icon: '📅' },
        regulier: { label: 'Remplacement régulier', icon: '🔁' },
        collaboration: { label: 'Collaboration', icon: '🤝' },
        assistantat: { label: 'Assistanat', icon: '🎓' },
        junior: { label: 'Docteur junior', icon: '🩺' }
    };

    function esc(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/[&<>"']/g, function(c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function fmtDate(d) {
        if (!d) return '—';
        try {
            var dt = new Date(d);
            return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch (e) { return String(d); }
    }
    function fmtMoney(n) {
        if (n === null || n === undefined || n === '') return '—';
        return Number(n).toLocaleString('fr-FR') + ' €';
    }
    function sb() { return window.supabaseClient; }
    function uid() { return window.currentUser && window.currentUser.id; }
    function profile() { return window.currentProfile || {}; }
    function myRole() {
        return (profile().role) || (window.currentUser && window.currentUser.user_metadata && window.currentUser.user_metadata.role) || null;
    }
    function isInstalled() { return RM.role === 'medecin_installe' || RM.role === 'admin'; }
    function isJunior() { return RM.role === 'docteur_junior'; }
    function isRemplacantSide() { return RM.role === 'medecin_remplacant' || isJunior(); }

    function typeLabel(t) { return (TYPES_OFFRE[t] && TYPES_OFFRE[t].label) || t; }
    function typeIcon(t) { return (TYPES_OFFRE[t] && TYPES_OFFRE[t].icon) || '📋'; }

    /* ============================================================
       NOTIFICATIONS
       ============================================================ */
    async function notify(userId, type, titre, message) {
        if (!userId || !sb()) return;
        try {
            await sb().from('mp_notifications').insert({
                user_id: userId, type: type, titre: titre, message: message || ''
            });
        } catch (e) {
            console.error('[RM] notification insert error', e);
        }
    }

    async function loadNotifications() {
        if (!uid() || !sb()) return;
        try {
            var res = await sb().from('mp_notifications')
                .select('*').eq('user_id', uid())
                .order('created_at', { ascending: false }).limit(50);
            if (!res.error) {
                RM.notifications = res.data || [];
                var prevUnread = RM.unreadCount;
                RM.unreadCount = RM.notifications.filter(function(n) { return !n.lue; }).length;
                updateNavBadge();
                renderNotificationBell();
                if (RM.ready && RM.unreadCount > prevUnread && prevUnread >= 0) {
                    RM.notifications.filter(function(n) { return !n.lue; }).slice(0, 3).forEach(function(n) {
                        toast('🔔 ' + n.titre);
                    });
                }
            }
        } catch (e) {
            console.error('[RM] loadNotifications error', e);
        }
    }

    function updateNavBadge() {
        ['remplNavBadge', 'remplNavBadgeMobile'].forEach(function(id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.style.display = RM.unreadCount > 0 ? 'flex' : 'none';
            el.textContent = RM.unreadCount > 9 ? '9+' : RM.unreadCount;
        });
    }

    function toast(msg) {
        var t = document.createElement('div');
        t.className = 'rm-toast';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(function() { t.classList.add('visible'); }, 10);
        setTimeout(function() {
            t.classList.remove('visible');
            setTimeout(function() { t.remove(); }, 400);
        }, 4500);
    }

    window.rmMarkAllRead = async function() {
        if (!uid() || !sb()) return;
        try {
            await sb().from('mp_notifications').update({ lue: true }).eq('user_id', uid()).eq('lue', false);
            RM.notifications.forEach(function(n) { n.lue = true; });
            RM.unreadCount = 0;
            updateNavBadge();
            renderNotificationBell();
        } catch (e) { console.error('[RM] markAllRead', e); }
    };

    window.rmDeleteNotification = async function(id) {
        if (!sb()) return;
        try { await sb().from('mp_notifications').delete().eq('id', id).eq('user_id', uid()); } catch (e) {}
        loadNotifications();
    };

    /* ============================================================
       CHARGEMENT DES DONNEES
       ============================================================ */
    async function loadOffres() {
        if (!sb()) return;
        try {
            var res = await sb().from('mp_offres').select('*').order('created_at', { ascending: false });
            if (res.error) throw res.error;
            RM.offres = (res.data || []);
            RM.mesOffres = RM.offres.filter(function(o) { return o.auteur_id === uid(); });
        } catch (e) {
            console.error('[RM] loadOffres error', e);
            RM.offres = []; RM.mesOffres = [];
        }
    }

    async function loadDispos() {
        if (!sb()) return;
        try {
            var res = await sb().from('mp_dispos').select('*').order('created_at', { ascending: false });
            if (res.error) throw res.error;
            RM.dispos = (res.data || []);
            RM.mesDispos = RM.dispos.filter(function(d) { return d.medecin_id === uid(); });
        } catch (e) {
            console.error('[RM] loadDispos error', e);
            RM.dispos = []; RM.mesDispos = [];
        }
    }

    async function loadCandidatures() {
        if (!uid() || !sb()) return;
        try {
            var res = await sb().from('mp_candidatures').select('*').order('created_at', { ascending: false });
            if (res.error) throw res.error;
            var all = res.data || [];
            RM.candidaturesRecues = all.filter(function(c) { return c.cible_id === uid(); });
            RM.mesCandidatures = all.filter(function(c) { return c.candidat_id === uid(); });
        } catch (e) {
            console.error('[RM] loadCandidatures error', e);
            RM.candidaturesRecues = []; RM.mesCandidatures = [];
        }
    }

    async function refreshAll() {
        await Promise.all([loadOffres(), loadDispos(), loadCandidatures(), loadNotifications()]);
        render();
        var results = document.getElementById('rm-results');
        if (results) window.rmApplySearch();
    }

    /* ============================================================
       MOTEUR DE RECHERCHE
       ============================================================ */
    function periodeOverlap(oStart, oEnd, fStart, fEnd) {
        if (!fStart && !fEnd) return true;
        var s = oStart || '';
        var e = oEnd || oStart || '9999-12-31';
        if (fStart && e < fStart) return false;
        if (fEnd && s > fEnd) return false;
        return true;
    }

    function filterOffres() {
        var lieu = (document.getElementById('rm-search-lieu') && document.getElementById('rm-search-lieu').value || '').trim().toLowerCase();
        var fStart = (document.getElementById('rm-search-debut') || {}).value || '';
        var fEnd = (document.getElementById('rm-search-fin') || {}).value || '';
        var type = (document.getElementById('rm-search-type') || {}).value || '';
        var specEl = document.getElementById('rm-search-spec');
        var spec = specEl ? specEl.value.trim().toLowerCase() : '';

        return RM.offres.filter(function(o) {
            if (o.statut !== 'active') return false;
            if (o.auteur_id === uid()) return false;
            if (lieu) {
                var hay = ((o.lieu || '') + ' ' + (o.code_postal || '') + ' ' + (o.adresse_cabinet || '')).toLowerCase();
                if (hay.indexOf(lieu) === -1) return false;
            }
            if (!periodeOverlap(o.date_debut, o.date_fin, fStart, fEnd)) return false;
            if (type && o.type !== type) return false;
            if (spec) {
                var s = ((o.specialite || '') + ' ' + (o.titre || '')).toLowerCase();
                if (s.indexOf(spec) === -1) return false;
            }
            return true;
        });
    }

    function filterDispos() {
        var lieuEl = document.getElementById('rm-search-lieu');
        var lieu = lieuEl ? lieuEl.value.trim().toLowerCase() : '';
        var fStart = (document.getElementById('rm-search-debut') || {}).value || '';
        var fEnd = (document.getElementById('rm-search-fin') || {}).value || '';
        var profil = (document.getElementById('rm-search-type') || {}).value || '';
        var specEl = document.getElementById('rm-search-spec');
        var spec = specEl ? specEl.value.trim().toLowerCase() : '';

        return RM.dispos.filter(function(d) {
            if (d.statut !== 'active') return false;
            if (d.medecin_id === uid()) return false;
            if (lieu) {
                var hay = ((d.zones || '') + ' ' + (d.code_postal || '')).toLowerCase();
                if (hay.indexOf(lieu) === -1) return false;
            }
            if (!periodeOverlap(d.date_debut, d.date_fin, fStart, fEnd)) return false;
            if (profil && d.profil !== profil) return false;
            if (spec) {
                var s = ((d.specialite || '') + ' ' + (d.titre || '')).toLowerCase();
                if (s.indexOf(spec) === -1) return false;
            }
            return true;
        });
    }

    /* ============================================================
       RENDU
       ============================================================ */
    function render() {
        var view = document.getElementById('view-remplacement');
        if (!view) return;
        if (!RM.role) RM.role = myRole();
        if (!RM.role) return;

        var html = '';
        html += '<div class="rm-header">';
        html += '<div><h2 class="rm-title">🤝 Remplacement</h2>';
        html += '<p class="rm-subtitle">' + sousTitre() + '</p></div>';
        html += '<div id="rm-bell"></div>';
        html += '</div>';

        if (isRemplacantSide()) {
            html += parcoursBanner();
            html += '<div class="rm-tabs">';
            html += tabBtn('marche', '🔎 Offres de remplacement');
            html += tabBtn('madispo', '📣 Ma disponibilité' + (RM.mesDispos.length ? ' <span class="rm-count">' + RM.mesDispos.length + '</span>' : ''));
            html += tabBtn('mesCand', '📨 Mes candidatures' + (RM.mesCandidatures.length ? ' <span class="rm-count">' + RM.mesCandidatures.length + '</span>' : ''));
            var invits = RM.candidaturesRecues.length;
            html += tabBtn('invits', '🔔 Invitations reçues' + (invits ? ' <span class="rm-count rm-count-hot">' + invits + '</span>' : ''));
            html += '</div>';
        } else {
            html += '<div class="rm-tabs">';
            html += tabBtn('marche', '🔎 Remplaçants & juniors disponibles');
            html += tabBtn('mesoffres', '📋 Mes offres' + (RM.mesOffres.length ? ' <span class="rm-count">' + RM.mesOffres.length + '</span>' : ''));
            var cands = RM.candidaturesRecues.filter(function(c) { return c.statut === 'en_attente'; }).length;
            html += tabBtn('cand', '📨 Candidatures reçues' + (cands ? ' <span class="rm-count rm-count-hot">' + cands + '</span>' : ''));
            html += tabBtn('mesSollicitations', '📤 Mes sollicitations' + (RM.mesCandidatures.length ? ' <span class="rm-count">' + RM.mesCandidatures.length + '</span>' : ''));
            html += '</div>';
        }
        html += '<div id="rm-body"></div>';
        view.innerHTML = html;
        renderTab();
        renderNotificationBell();
    }

    function sousTitre() {
        if (isInstalled()) return 'Publiez vos offres de remplacement, trouvez des remplaçants et docteurs juniors disponibles près de chez vous.';
        if (isJunior()) return 'Parcours docteur junior : trouvez un cabinet qui vous accueillera pour vous installer, puis évoluez vers le remplacement et la collaboration.';
        return 'Trouvez des offres de remplacement là où vous voulez travailler, ou publiez vos disponibilités : les cabinets viendront à vous.';
    }

    function parcoursBanner() {
        return '<div class="rm-parcours"><span class="rm-parcours-step">🩺 Docteur junior</span><span class="rm-parcours-arrow">→</span>' +
            '<span class="rm-parcours-step">🔁 Remplaçant</span><span class="rm-parcours-arrow">→</span>' +
            '<span class="rm-parcours-step">🤝 Collaborateur</span><span class="rm-parcours-arrow">→</span>' +
            '<span class="rm-parcours-step">🏥 Médecin installé</span></div>';
    }

    function tabBtn(id, label) {
        return '<button class="rm-tab ' + (RM.currentTab === id ? 'active' : '') + '" onclick="rmSwitchTab(\'' + id + '\')">' + label + '</button>';
    }

    window.rmSwitchTab = function(tab) {
        RM.currentTab = tab;
        document.querySelectorAll('#view-remplacement .rm-tab').forEach(function(b) { b.classList.remove('active'); });
        var btns = document.querySelectorAll('#view-remplacement .rm-tab');
        var order = isRemplacantSide() ? ['marche', 'madispo', 'mesCand', 'invits'] : ['marche', 'mesoffres', 'cand', 'mesSollicitations'];
        var idx = order.indexOf(tab);
        if (idx >= 0 && btns[idx]) btns[idx].classList.add('active');
        renderTab();
    };

    function renderTab() {
        var body = document.getElementById('rm-body');
        if (!body) return;
        var tab = RM.currentTab;
        var html = '';
        if (isRemplacantSide()) {
            if (tab === 'marche') html = renderMarcheRemplacant();
            else if (tab === 'madispo') html = renderMesDispos();
            else if (tab === 'mesCand') html = renderCandidaturesList(RM.mesCandidatures, false);
            else if (tab === 'invits') html = renderCandidaturesList(RM.candidaturesRecues, true);
        } else {
            if (tab === 'marche') html = renderMarcheInstalle();
            else if (tab === 'mesoffres') html = renderMesOffres();
            else if (tab === 'cand') html = renderCandidaturesList(RM.candidaturesRecues, true);
            else if (tab === 'mesSollicitations') html = renderCandidaturesList(RM.mesCandidatures, false);
        }
        body.innerHTML = html;
        var results = document.getElementById('rm-results');
        if (results && typeof window.rmApplySearch === 'function') window.rmApplySearch();
    }

    /* ---------- Barre de recherche ---------- */
    function searchBar(opts) {
        var html = '<div class="rm-search">';
        html += '<div class="rm-search-field"><label>' + opts.lieuLabel + '</label><input type="text" id="rm-search-lieu" placeholder="' + opts.lieuPlaceholder + '" oninput="rmApplySearch()"></div>';
        html += '<div class="rm-search-field"><label>Disponible à partir du</label><input type="date" id="rm-search-debut" onchange="rmApplySearch()"></div>';
        html += '<div class="rm-search-field"><label>Jusqu\'au</label><input type="date" id="rm-search-fin" onchange="rmApplySearch()"></div>';
        html += '<div class="rm-search-field"><label>Type</label><select id="rm-search-type" onchange="rmApplySearch()">' + opts.typeOpts + '</select></div>';
        html += '<div class="rm-search-field"><label>Spécialité</label><input type="text" id="rm-search-spec" placeholder="Généraliste, ..." oninput="rmApplySearch()"></div>';
        html += '</div>';
        return html;
    }

    /* ---------- Marché côté remplaçant : offres ---------- */
    function renderMarcheRemplacant() {
        var html = searchBar({
            lieuLabel: 'Où voulez-vous travailler ?',
            lieuPlaceholder: 'Ville ou code postal',
            typeOpts: '<option value="">Tous les types</option>' + Object.keys(TYPES_OFFRE).map(function(t) {
                return '<option value="' + t + '">' + TYPES_OFFRE[t].label + '</option>';
            }).join('')
        });
        html += '<div id="rm-results"></div>';
        return html;
    }

    /* ---------- Marché côté installé : disponibilités ---------- */
    function renderMarcheInstalle() {
        var html = '<div class="rm-toolbar"><button class="rm-btn rm-btn-primary" onclick="rmOpenOffreModal()">➕ Publier une offre de remplacement</button></div>';
        html += searchBar({
            lieuLabel: 'Où cherchez-vous un remplaçant ?',
            lieuPlaceholder: 'Ville ou code postal',
            typeOpts: '<option value="">Remplaçants et juniors</option><option value="remplacant">Remplaçants</option><option value="junior">Docteurs juniors</option>'
        });
        html += '<div id="rm-results"></div>';
        return html;
    }

    window.rmApplySearch = function() {
        var results = document.getElementById('rm-results');
        if (!results) return;
        if (isRemplacantSide()) {
            var offres = filterOffres();
            results.innerHTML = offres.length === 0
                ? '<div class="rm-empty">😕 Aucune offre ne correspond à vos critères.<br>Élargissez votre recherche ou publiez votre disponibilité : les cabinets vous contacteront.</div>'
                : '<div class="rm-grid">' + offres.map(cardOffre).join('') + '</div>';
        } else {
            var dispos = filterDispos();
            results.innerHTML = dispos.length === 0
                ? '<div class="rm-empty">😕 Aucun remplaçant disponible ne correspond à vos critères.</div>'
                : '<div class="rm-grid">' + dispos.map(cardDispo).join('') + '</div>';
        }
    };

    /* ---------- Cartes ---------- */
    function periodeTxt(debut, fin, regularite) {
        var txt = fmtDate(debut) + (fin ? ' → ' + fmtDate(fin) : ' → à définir');
        if (regularite) txt += ' <span class="rm-chip rm-chip-reg">' + esc(regularite) + '</span>';
        return txt;
    }

    function cardOffre(o) {
        var dejaPostule = RM.mesCandidatures.some(function(c) { return c.offre_id === o.id && c.statut !== 'refusee' && c.statut !== 'annulee'; });
        var html = '<div class="rm-card">';
        html += '<div class="rm-card-head"><span class="rm-card-icon">' + typeIcon(o.type) + '</span><div>';
        html += '<h4 class="rm-card-title">' + esc(o.titre) + '</h4>';
        html += '<span class="rm-chip">' + typeLabel(o.type) + '</span>';
        html += '</div></div>';
        html += '<div class="rm-card-row">📍 ' + esc(o.lieu) + (o.code_postal ? ' (' + esc(o.code_postal) + ')' : '') + '</div>';
        html += '<div class="rm-card-row">🗓️ ' + periodeTxt(o.date_debut, o.date_fin, o.regularite) + '</div>';
        if (o.specialite) html += '<div class="rm-card-row">💼 ' + esc(o.specialite) + '</div>';
        if (o.tarif_journalier) html += '<div class="rm-card-row">💰 ' + fmtMoney(o.tarif_journalier) + ' / jour' + (o.retrocession ? ' · rétrocession ' + esc(o.retrocession) + '%' : '') + '</div>';
        if (o.description) html += '<p class="rm-card-desc">' + esc(o.description) + '</p>';
        html += '<div class="rm-card-actions">';
        if (dejaPostule) {
            html += '<button class="rm-btn" disabled>✅ Candidature envoyée</button>';
        } else {
            html += '<button class="rm-btn rm-btn-primary" onclick="rmOpenPostulerModal(\'' + o.id + '\')">Je postule</button>';
        }
        html += '</div></div>';
        return html;
    }

    function cardDispo(d) {
        var dejaSollicite = RM.mesCandidatures.some(function(c) { return c.dispo_id === d.id && c.statut !== 'refusee' && c.statut !== 'annulee'; });
        var html = '<div class="rm-card">';
        html += '<div class="rm-card-head"><span class="rm-card-icon">' + (d.profil === 'junior' ? '🩺' : '🔁') + '</span><div>';
        html += '<h4 class="rm-card-title">' + esc(d.titre) + '</h4>';
        html += '<span class="rm-chip">' + (d.profil === 'junior' ? 'Docteur junior' : 'Médecin remplaçant') + '</span>';
        html += '</div></div>';
        html += '<div class="rm-card-row">📍 ' + esc(d.zones || 'France entière') + (d.code_postal ? ' (' + esc(d.code_postal) + ')' : '') + '</div>';
        html += '<div class="rm-card-row">🗓️ ' + periodeTxt(d.date_debut, d.date_fin, d.regularite) + '</div>';
        if (d.specialite) html += '<div class="rm-card-row">💼 ' + esc(d.specialite) + '</div>';
        if (d.description) html += '<p class="rm-card-desc">' + esc(d.description) + '</p>';
        html += '<div class="rm-card-actions">';
        if (dejaSollicite) {
            html += '<button class="rm-btn" disabled>✅ Sollicitation envoyée</button>';
        } else {
            html += '<button class="rm-btn rm-btn-primary" onclick="rmOpenSolliciterModal(\'' + d.id + '\')">Proposer un contrat</button>';
        }
        html += '</div></div>';
        return html;
    }

    /* ---------- Mes offres (installé) ---------- */
    function renderMesOffres() {
        var html = '<div class="rm-toolbar"><button class="rm-btn rm-btn-primary" onclick="rmOpenOffreModal()">➕ Publier une offre</button></div>';
        if (RM.mesOffres.length === 0) {
            html += '<div class="rm-empty">Aucune offre publiée. Publiez une offre ponctuelle ou régulière : les remplaçants proches de vous la verront instantanément.</div>';
            return html;
        }
        html += '<div class="rm-grid">';
        RM.mesOffres.forEach(function(o) {
            var nbCand = RM.candidaturesRecues.filter(function(c) { return c.offre_id === o.id && c.statut === 'en_attente'; }).length;
            html += '<div class="rm-card">';
            html += '<div class="rm-card-head"><span class="rm-card-icon">' + typeIcon(o.type) + '</span><div>';
            html += '<h4 class="rm-card-title">' + esc(o.titre) + '</h4>';
            html += '<span class="rm-chip">' + typeLabel(o.type) + '</span> ';
            html += '<span class="rm-chip ' + (o.statut === 'active' ? 'rm-chip-ok' : 'rm-chip-off') + '">' + (o.statut === 'active' ? 'En ligne' : o.statut === 'pourvue' ? 'Pourvue' : 'Fermée') + '</span>';
            html += '</div></div>';
            html += '<div class="rm-card-row">📍 ' + esc(o.lieu) + '</div>';
            html += '<div class="rm-card-row">🗓️ ' + periodeTxt(o.date_debut, o.date_fin, o.regularite) + '</div>';
            if (nbCand > 0) html += '<div class="rm-card-row rm-hot">📨 ' + nbCand + ' candidature' + (nbCand > 1 ? 's' : '') + ' en attente</div>';
            html += '<div class="rm-card-actions">';
            html += '<button class="rm-btn" onclick="rmToggleOffreStatut(\'' + o.id + '\')">' + (o.statut === 'active' ? 'Mettre en pause' : 'Remettre en ligne') + '</button>';
            html += '<button class="rm-btn rm-btn-danger" onclick="rmDeleteOffre(\'' + o.id + '\')">Supprimer</button>';
            html += '</div></div>';
        });
        html += '</div>';
        return html;
    }

    /* ---------- Mes disponibilités (remplaçant/junior) ---------- */
    function renderMesDispos() {
        var html = '<div class="rm-toolbar"><button class="rm-btn rm-btn-primary" onclick="rmOpenDispoModal()">➕ Publier ma disponibilité</button></div>';
        if (RM.mesDispos.length === 0) {
            html += '<div class="rm-empty">Publiez vos créneaux de disponibilité : les cabinets de votre zone pourront vous proposer directement un contrat.</div>';
            return html;
        }
        html += '<div class="rm-grid">';
        RM.mesDispos.forEach(function(d) {
            var nbInvit = RM.candidaturesRecues.filter(function(c) { return c.dispo_id === d.id && c.statut === 'en_attente'; }).length;
            html += '<div class="rm-card">';
            html += '<div class="rm-card-head"><span class="rm-card-icon">📣</span><div>';
            html += '<h4 class="rm-card-title">' + esc(d.titre) + '</h4>';
            html += '<span class="rm-chip ' + (d.statut === 'active' ? 'rm-chip-ok' : 'rm-chip-off') + '">' + (d.statut === 'active' ? 'En ligne' : 'Fermée') + '</span>';
            html += '</div></div>';
            html += '<div class="rm-card-row">📍 ' + esc(d.zones || 'France entière') + '</div>';
            html += '<div class="rm-card-row">🗓️ ' + periodeTxt(d.date_debut, d.date_fin, d.regularite) + '</div>';
            if (nbInvit > 0) html += '<div class="rm-card-row rm-hot">🔔 ' + nbInvit + ' invitation' + (nbInvit > 1 ? 's' : '') + ' reçue' + (nbInvit > 1 ? 's' : '') + '</div>';
            html += '<div class="rm-card-actions">';
            html += '<button class="rm-btn" onclick="rmToggleDispoStatut(\'' + d.id + '\')">' + (d.statut === 'active' ? 'Mettre en pause' : 'Remettre en ligne') + '</button>';
            html += '<button class="rm-btn rm-btn-danger" onclick="rmDeleteDispo(\'' + d.id + '\')">Supprimer</button>';
            html += '</div></div>';
        });
        html += '</div>';
        return html;
    }

    /* ---------- Candidatures / mises en relation ---------- */
    function renderCandidaturesList(list, recues) {
        if (!list.length) {
            return '<div class="rm-empty">' + (recues
                ? 'Aucune candidature ou invitation reçue pour le moment.'
                : 'Aucune candidature envoyée. Parcourez le marché et postulez aux offres qui vous intéressent.') + '</div>';
        }
        var html = '<div class="rm-cand-list">';
        list.forEach(function(c) {
            var objet = null;
            if (c.offre_id) objet = RM.offres.find(function(o) { return o.id === c.offre_id; });
            if (c.dispo_id) objet = RM.dispos.find(function(d) { return d.id === c.dispo_id; });
            var titreObjet = objet ? objet.titre : 'Annonce';
            var sensTxt = c.sens === 'offre'
                ? (recues ? 'Souhaite remplacer pour' : 'Votre candidature sur')
                : (recues ? 'Vous propose un contrat pour' : 'Votre sollicitation de');
            var statutCls = { en_attente: 'rm-chip-wait', acceptee: 'rm-chip-ok', refusee: 'rm-chip-off', annulee: 'rm-chip-off' }[c.statut] || 'rm-chip-wait';
            var statutTxt = { en_attente: 'En attente', acceptee: 'Acceptée', refusee: 'Refusée', annulee: 'Annulée' }[c.statut] || c.statut;

            html += '<div class="rm-cand">';
            html += '<div class="rm-cand-head"><h4>' + esc(titreObjet) + '</h4><span class="rm-chip ' + statutCls + '">' + statutTxt + '</span></div>';
            html += '<div class="rm-card-row">' + (c.sens === 'offre' ? '🔁 ' : '📤 ') + sensTxt + ' : <strong>' + esc(titreObjet) + '</strong></div>';
            if (objet) html += '<div class="rm-card-row">🗓️ ' + periodeTxt(objet.date_debut, objet.date_fin, objet.regularite) + '</div>';
            if (c.message) html += '<p class="rm-card-desc">💬 ' + esc(c.message) + '</p>';
            html += '<div class="rm-card-actions">';
            if (recues && c.statut === 'en_attente') {
                html += '<button class="rm-btn rm-btn-primary" onclick="rmAcceptCandidature(\'' + c.id + '\')">✅ Accepter & créer le contrat</button>';
                html += '<button class="rm-btn rm-btn-danger" onclick="rmRefuseCandidature(\'' + c.id + '\')">Refuser</button>';
            } else if (!recues && c.statut === 'en_attente') {
                html += '<button class="rm-btn rm-btn-danger" onclick="rmCancelCandidature(\'' + c.id + '\')">Annuler</button>';
            }
            if (c.statut === 'acceptee' && c.contrat_id) {
                html += '<span class="rm-chip rm-chip-ok">📄 Contrat créé — à valider par le Conseil de l\'Ordre</span>';
            }
            html += '</div></div>';
        });
        html += '</div>';
        return html;
    }

    /* ---------- Cloche notifications ---------- */
    function renderNotificationBell() {
        var bell = document.getElementById('rm-bell');
        if (!bell) return;
        var html = '<div class="rm-bell-wrap">';
        html += '<button class="rm-bell-btn" onclick="rmToggleNotifPanel()">🔔' + (RM.unreadCount ? '<span class="rm-bell-badge">' + RM.unreadCount + '</span>' : '') + '</button>';
        html += '<div class="rm-notif-panel" id="rm-notif-panel" style="display:none;">';
        html += '<div class="rm-notif-head"><strong>Notifications</strong><button class="rm-btn" onclick="rmMarkAllRead()">Tout marquer lu</button></div>';
        if (RM.notifications.length === 0) {
            html += '<div class="rm-notif-empty">Aucune notification.</div>';
        } else {
            RM.notifications.slice(0, 15).forEach(function(n) {
                html += '<div class="rm-notif-item ' + (n.lue ? '' : 'unread') + '">';
                html += '<div><strong>' + esc(n.titre) + '</strong>';
                if (n.message) html += '<p>' + esc(n.message) + '</p>';
                html += '<span class="rm-notif-date">' + fmtDate(n.created_at) + '</span></div>';
                html += '<button class="rm-notif-del" onclick="rmDeleteNotification(\'' + n.id + '\')">×</button>';
                html += '</div>';
            });
        }
        html += '</div></div>';
        bell.innerHTML = html;
    }

    window.rmToggleNotifPanel = function() {
        var p = document.getElementById('rm-notif-panel');
        if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
    };

    /* ============================================================
       ACTIONS — OFFRES
       ============================================================ */
    window.rmOpenOffreModal = function() {
        openModal('Publier une offre de remplacement', offreFormHtml(), 'rmSaveOffre');
    };

    function offreFormHtml() {
        var html = '<div class="rm-form">';
        html += '<div class="rm-form-row"><label>Type de contrat proposé</label><select id="rmf-type">';
        Object.keys(TYPES_OFFRE).forEach(function(t) {
            html += '<option value="' + t + '">' + TYPES_OFFRE[t].icon + ' ' + TYPES_OFFRE[t].label + '</option>';
        });
        html += '</select></div>';
        html += '<div class="rm-form-row"><label>Titre de l\'annonce *</label><input type="text" id="rmf-titre" placeholder="Ex : Remplacement MG - juillet 2026"></div>';
        html += '<div class="rm-form-row"><label>Description du cabinet et de l\'activité</label><textarea id="rmf-description" rows="3" placeholder="Patientèle, horaires, équipe, logiciels..."></textarea></div>';
        html += '<div class="rm-form-cols">';
        html += '<div class="rm-form-row"><label>Date de début *</label><input type="date" id="rmf-debut"></div>';
        html += '<div class="rm-form-row"><label>Date de fin</label><input type="date" id="rmf-fin"></div>';
        html += '</div>';
        html += '<div class="rm-form-row"><label>Régularité (si remplacement régulier)</label><input type="text" id="rmf-regularite" placeholder="Ex : 1 semaine/mois, tous les mardis"></div>';
        html += '<div class="rm-form-cols">';
        html += '<div class="rm-form-row"><label>Ville *</label><input type="text" id="rmf-lieu"></div>';
        html += '<div class="rm-form-row"><label>Code postal</label><input type="text" id="rmf-cp"></div>';
        html += '</div>';
        html += '<div class="rm-form-row"><label>Adresse du cabinet</label><input type="text" id="rmf-adresse"></div>';
        html += '<div class="rm-form-cols">';
        html += '<div class="rm-form-row"><label>Spécialité</label><input type="text" id="rmf-spec" placeholder="Médecine générale"></div>';
        html += '<div class="rm-form-row"><label>Tarif journalier (€)</label><input type="number" id="rmf-tarif" min="0" step="10"></div>';
        html += '</div>';
        html += '<div class="rm-form-row"><label>Rétrocession (%)</label><input type="number" id="rmf-retro" min="0" max="100" step="1" value="70"></div>';
        html += '<div class="rm-form-row rm-form-check"><input type="checkbox" id="rmf-junior" style="width:auto;"> <label for="rmf-junior" style="margin:0;">Cabinet ouvert à l\'installation d\'un docteur junior</label></div>';
        html += '</div>';
        return html;
    }

    window.rmSaveOffre = async function() {
        var titre = document.getElementById('rmf-titre').value.trim();
        var debut = document.getElementById('rmf-debut').value;
        var lieu = document.getElementById('rmf-lieu').value.trim();
        if (!titre || !debut || !lieu) { alert('Titre, date de début et ville sont obligatoires.'); return; }
        var payload = {
            auteur_id: uid(),
            type: document.getElementById('rmf-type').value,
            titre: titre,
            description: document.getElementById('rmf-description').value.trim(),
            date_debut: debut,
            date_fin: document.getElementById('rmf-fin').value || null,
            regularite: document.getElementById('rmf-regularite').value.trim() || null,
            lieu: lieu,
            code_postal: document.getElementById('rmf-cp').value.trim() || null,
            adresse_cabinet: document.getElementById('rmf-adresse').value.trim() || null,
            specialite: document.getElementById('rmf-spec').value.trim() || null,
            tarif_journalier: document.getElementById('rmf-tarif').value || null,
            retrocession: document.getElementById('rmf-retro').value || 70,
            accepte_junior: document.getElementById('rmf-junior').checked,
            statut: 'active'
        };
        try {
            var res = await sb().from('mp_offres').insert(payload);
            if (res.error) throw res.error;
            closeModal();
            toast('✅ Offre publiée : elle est visible par les remplaçants et juniors.');
            await refreshAll();
        } catch (e) {
            console.error('[RM] save offre', e);
            alert('Erreur lors de la publication : ' + (e.message || e));
        }
    };

    window.rmToggleOffreStatut = async function(id) {
        var o = RM.mesOffres.find(function(x) { return x.id === id; });
        if (!o || !sb()) return;
        try {
            var res = await sb().from('mp_offres')
                .update({ statut: o.statut === 'active' ? 'fermee' : 'active', updated_at: new Date().toISOString() })
                .eq('id', id);
            if (res.error) throw res.error;
            await refreshAll();
        } catch (e) { alert('Erreur : ' + (e.message || e)); }
    };

    window.rmDeleteOffre = async function(id) {
        if (!confirm('Supprimer définitivement cette offre ?')) return;
        try {
            var res = await sb().from('mp_offres').delete().eq('id', id);
            if (res.error) throw res.error;
            await refreshAll();
        } catch (e) { alert('Erreur : ' + (e.message || e)); }
    };

    /* ============================================================
       ACTIONS — DISPONIBILITES
       ============================================================ */
    window.rmOpenDispoModal = function() {
        openModal('Publier ma disponibilité', dispoFormHtml(), 'rmSaveDispo');
    };

    function dispoFormHtml() {
        var html = '<div class="rm-form">';
        html += '<div class="rm-form-row"><label>Titre *</label><input type="text" id="rmf-titre" placeholder="Ex : Dispo août 2026 - Bretagne"></div>';
        html += '<div class="rm-form-row"><label>Description</label><textarea id="rmf-description" rows="3" placeholder="Votre profil, votre expérience, ce que vous cherchez..."></textarea></div>';
        html += '<div class="rm-form-cols">';
        html += '<div class="rm-form-row"><label>Disponible à partir du *</label><input type="date" id="rmf-debut"></div>';
        html += '<div class="rm-form-row"><label>Jusqu\'au</label><input type="date" id="rmf-fin"></div>';
        html += '</div>';
        html += '<div class="rm-form-row"><label>Régularité</label><input type="text" id="rmf-regularite" placeholder="Ex : 1 semaine/mois, vacances scolaires"></div>';
        html += '<div class="rm-form-cols">';
        html += '<div class="rm-form-row"><label>Zones de travail *</label><input type="text" id="rmf-lieu" placeholder="Villes, rayon..."></div>';
        html += '<div class="rm-form-row"><label>Code postal</label><input type="text" id="rmf-cp"></div>';
        html += '</div>';
        html += '<div class="rm-form-cols">';
        html += '<div class="rm-form-row"><label>Spécialité</label><input type="text" id="rmf-spec" placeholder="Médecine générale"></div>';
        html += '<div class="rm-form-row"><label>N° RPPS</label><input type="text" id="rmf-rpps"></div>';
        html += '</div>';
        html += '<div class="rm-form-cols">';
        html += '<div class="rm-form-row"><label>Téléphone</label><input type="tel" id="rmf-tel"></div>';
        html += '<div class="rm-form-row"><label>Email de contact</label><input type="email" id="rmf-email"></div>';
        html += '</div>';
        html += '</div>';
        return html;
    }

    window.rmSaveDispo = async function() {
        var titre = document.getElementById('rmf-titre').value.trim();
        var debut = document.getElementById('rmf-debut').value;
        var zones = document.getElementById('rmf-lieu').value.trim();
        if (!titre || !debut || !zones) { alert('Titre, date de début et zones sont obligatoires.'); return; }
        var payload = {
            medecin_id: uid(),
            profil: isJunior() ? 'junior' : 'remplacant',
            titre: titre,
            description: document.getElementById('rmf-description').value.trim(),
            date_debut: debut,
            date_fin: document.getElementById('rmf-fin').value || null,
            regularite: document.getElementById('rmf-regularite').value.trim() || null,
            zones: zones,
            code_postal: document.getElementById('rmf-cp').value.trim() || null,
            specialite: document.getElementById('rmf-spec').value.trim() || null,
            rpps: document.getElementById('rmf-rpps').value.trim() || null,
            telephone: document.getElementById('rmf-tel').value.trim() || null,
            email_contact: document.getElementById('rmf-email').value.trim() || null,
            statut: 'active'
        };
        try {
            var res = await sb().from('mp_dispos').insert(payload);
            if (res.error) throw res.error;
            closeModal();
            toast('✅ Disponibilité publiée : les cabinets de votre zone peuvent vous contacter.');
            await refreshAll();
        } catch (e) {
            console.error('[RM] save dispo', e);
            alert('Erreur lors de la publication : ' + (e.message || e));
        }
    };

    window.rmToggleDispoStatut = async function(id) {
        var d = RM.mesDispos.find(function(x) { return x.id === id; });
        if (!d || !sb()) return;
        try {
            var res = await sb().from('mp_dispos')
                .update({ statut: d.statut === 'active' ? 'fermee' : 'active', updated_at: new Date().toISOString() })
                .eq('id', id);
            if (res.error) throw res.error;
            await refreshAll();
        } catch (e) { alert('Erreur : ' + (e.message || e)); }
    };

    window.rmDeleteDispo = async function(id) {
        if (!confirm('Supprimer cette disponibilité ?')) return;
        try {
            var res = await sb().from('mp_dispos').delete().eq('id', id);
            if (res.error) throw res.error;
            await refreshAll();
        } catch (e) { alert('Erreur : ' + (e.message || e)); }
    };

    /* ============================================================
       ACTIONS — MISES EN RELATION
       ============================================================ */
    window.rmOpenPostulerModal = function(offreId) {
        var o = RM.offres.find(function(x) { return x.id === offreId; });
        if (!o) return;
        RM._targetOffre = o;
        openModal('Postuler : ' + o.titre,
            '<div class="rm-form"><p class="rm-modal-intro">Le cabinet de ' + esc(o.lieu) + ' sera notifié immédiatement de votre candidature.</p>' +
            '<div class="rm-form-row"><label>Message au cabinet</label><textarea id="rmf-message" rows="4" placeholder="Présentez-vous : expérience, disponibilités, attentes..."></textarea></div></div>',
            'rmSendPostule');
    };

    window.rmSendPostule = async function() {
        var o = RM._targetOffre;
        if (!o || !sb()) return;
        var message = document.getElementById('rmf-message').value.trim();
        try {
            var res = await sb().from('mp_candidatures').insert({
                sens: 'offre',
                offre_id: o.id,
                dispo_id: null,
                candidat_id: uid(),
                cible_id: o.auteur_id,
                message: message,
                statut: 'en_attente'
            });
            if (res.error) throw res.error;
            await notify(o.auteur_id, 'candidature', 'Nouvelle candidature reçue',
                'Un ' + (isJunior() ? 'docteur junior' : 'remplaçant') + ' a postulé à votre offre « ' + o.titre + ' ».');
            closeModal();
            toast('📨 Candidature envoyée ! Le cabinet est notifié.');
            await refreshAll();
        } catch (e) {
            console.error('[RM] postuler', e);
            alert('Erreur : ' + (e.message || e));
        }
    };

    window.rmOpenSolliciterModal = function(dispoId) {
        var d = RM.dispos.find(function(x) { return x.id === dispoId; });
        if (!d) return;
        RM._targetDispo = d;
        openModal('Proposer un contrat : ' + d.titre,
            '<div class="rm-form"><p class="rm-modal-intro">' + (d.profil === 'junior' ? 'Ce docteur junior' : 'Ce remplaçant') + ' sera notifié de votre proposition de contrat.</p>' +
            '<div class="rm-form-row"><label>Message d\'accompagnement</label><textarea id="rmf-message" rows="4" placeholder="Présentez votre cabinet et votre proposition (dates, rétrocession...)."></textarea></div></div>',
            'rmSendSollicite');
    };

    window.rmSendSollicite = async function() {
        var d = RM._targetDispo;
        if (!d || !sb()) return;
        var message = document.getElementById('rmf-message').value.trim();
        try {
            var res = await sb().from('mp_candidatures').insert({
                sens: 'dispo',
                offre_id: null,
                dispo_id: d.id,
                candidat_id: uid(),
                cible_id: d.medecin_id,
                message: message,
                statut: 'en_attente'
            });
            if (res.error) throw res.error;
            await notify(d.medecin_id, 'invitation', 'Un cabinet vous a fait une proposition !',
                'Un médecin installé vous propose un contrat pour votre disponibilité « ' + d.titre + ' ».');
            closeModal();
            toast('📤 Proposition envoyée ! Le médecin est notifié.');
            await refreshAll();
        } catch (e) {
            console.error('[RM] solliciter', e);
            alert('Erreur : ' + (e.message || e));
        }
    };

    window.rmRefuseCandidature = async function(id) {
        if (!sb()) return;
        var c = RM.candidaturesRecues.find(function(x) { return x.id === id; });
        if (!c) return;
        try {
            var res = await sb().from('mp_candidatures')
                .update({ statut: 'refusee', updated_at: new Date().toISOString() }).eq('id', id);
            if (res.error) throw res.error;
            await notify(c.candidat_id, 'refus', 'Candidature non retenue', 'Votre candidature n\'a pas été retenue cette fois-ci. D\'autres offres vous attendent sur le marché !');
            await refreshAll();
        } catch (e) { alert('Erreur : ' + (e.message || e)); }
    };

    window.rmCancelCandidature = async function(id) {
        if (!sb()) return;
        try {
            var res = await sb().from('mp_candidatures')
                .update({ statut: 'annulee', updated_at: new Date().toISOString() }).eq('id', id);
            if (res.error) throw res.error;
            await refreshAll();
        } catch (e) { alert('Erreur : ' + (e.message || e)); }
    };

    /* ---------- Acceptation + création du contrat ---------- */
    window.rmAcceptCandidature = async function(id) {
        if (!sb()) return;
        var c = RM.candidaturesRecues.find(function(x) { return x.id === id; });
        if (!c) return;
        var objet = c.offre_id ? RM.offres.find(function(o) { return o.id === c.offre_id; })
                               : RM.dispos.find(function(d) { return d.id === c.dispo_id; });
        var typeContrat = (c.offre_id && objet) ? objet.type : 'ponctuel';
        var titreContrat = objet ? objet.titre : 'Remplacement';

        try {
            var contratPayload = {
                user_id: uid(),
                titre: titreContrat,
                date_debut: objet ? objet.date_debut : new Date().toISOString().slice(0, 10),
                date_fin: objet ? (objet.date_fin || null) : null,
                tarif_journalier: objet ? (objet.tarif_journalier || null) : null,
                conditions: 'Contrat de type : ' + typeLabel(typeContrat) + '. À valider par le Conseil de l\'Ordre.',
                statut: 'brouillon'
            };
            var contratId = null;
            var contratRes = await sb().from('contrats_remplacement').insert(contratPayload).select('id').single();
            if (!contratRes.error && contratRes.data) contratId = contratRes.data.id;
            else console.error('[RM] contrat insert error', contratRes.error);

            var res = await sb().from('mp_candidatures')
                .update({ statut: 'acceptee', contrat_id: contratId, updated_at: new Date().toISOString() })
                .eq('id', id);
            if (res.error) throw res.error;

            if (c.offre_id && objet) {
                await sb().from('mp_offres').update({ statut: 'pourvue', updated_at: new Date().toISOString() }).eq('id', c.offre_id);
            }

            await notify(c.candidat_id, 'acceptation', '🎉 Votre candidature est acceptée !',
                'Un contrat « ' + titreContrat + ' » a été créé. Retrouvez-le dans vos remplacements : à valider par le Conseil de l\'Ordre.');
            toast('✅ Mise en relation acceptée — contrat créé (brouillon).');
            await refreshAll();
        } catch (e) {
            console.error('[RM] accept', e);
            alert('Erreur : ' + (e.message || e));
        }
    };

    /* ============================================================
       MODALE GENERIQUE
       ============================================================ */
    function openModal(title, bodyHtml, saveAction) {
        var existing = document.getElementById('rm-modal');
        if (existing) existing.remove();
        var m = document.createElement('div');
        m.id = 'rm-modal';
        m.className = 'modal-overlay';
        m.style.display = 'flex';
        m.style.zIndex = '10001';
        m.innerHTML = '<div class="modal-card" style="max-width:620px;">' +
            '<div class="modal-header"><h3>' + esc(title) + '</h3>' +
            '<button class="modal-close" onclick="rmCloseModal()">×</button></div>' +
            '<div class="modal-body">' + bodyHtml + '</div>' +
            '<div class="modal-actions">' +
            '<button class="btn-secondary" onclick="rmCloseModal()">Annuler</button>' +
            '<button class="btn-primary" onclick="' + saveAction + '()">Valider</button>' +
            '</div></div>';
        document.body.appendChild(m);
    }

    window.rmCloseModal = function() {
        var m = document.getElementById('rm-modal');
        if (m) m.remove();
    };

    /* ============================================================
       INIT / POLLING
       ============================================================ */
    function applyRoleVisibility() {
        var role = myRole();
        var show = (role === 'medecin_installe' || role === 'medecin_remplacant' || role === 'docteur_junior' || role === 'admin');
        document.querySelectorAll('[data-view="remplacement"]').forEach(function(el) {
            el.style.display = show ? '' : 'none';
        });
    }

    window.onRemplacementViewShown = function() {
        if (!RM.ready) return;
        RM.role = myRole();
        render();
        refreshAll();
    };

    window.initRemplacementMarket = async function() {
        if (RM.ready || !window.currentUser || !window.supabaseClient) return;
        RM.ready = true;
        RM.role = myRole();
        injectStyles();
        applyRoleVisibility();
        if (RM.pollTimer) clearInterval(RM.pollTimer);
        RM.pollTimer = setInterval(function() {
            if (!window.currentUser) return;
            loadNotifications();
            loadCandidatures();
        }, 30000);
        await refreshAll();
        console.log('[RM] Marketplace remplacements initialisé (rôle : ' + RM.role + ')');
    };

    window.rmInitMarketplaceWhenReady = function() {
        var tries = 0;
        var timer = setInterval(function() {
            tries++;
            if (window.currentUser && window.supabaseClient) {
                clearInterval(timer);
                window.initRemplacementMarket();
            } else if (tries > 120) {
                clearInterval(timer);
            }
        }, 500);
    };

    function injectStyles() {
        if (document.getElementById('rm-styles')) return;
        var css = document.createElement('style');
        css.id = 'rm-styles';
        css.textContent = [
            '.rm-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px;flex-wrap:wrap;}',
            '.rm-title{margin:0;font-size:1.5rem;}',
            '.rm-subtitle{margin:4px 0 0;color:#64748b;font-size:.92rem;max-width:640px;}',
            '.rm-parcours{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:linear-gradient(90deg,#eff6ff,#f0fdf4);border:1px solid #dbeafe;border-radius:12px;padding:10px 14px;margin-bottom:16px;}',
            '.rm-parcours-step{background:white;border-radius:999px;padding:4px 12px;font-size:.8rem;font-weight:600;color:#1e40af;box-shadow:0 1px 2px rgba(0,0,0,.06);}',
            '.rm-parcours-arrow{color:#94a3b8;font-weight:700;}',
            '.rm-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;border-bottom:2px solid #e2e8f0;}',
            '.rm-tab{border:none;background:none;padding:10px 16px;font-size:.9rem;font-weight:600;color:#64748b;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px;border-radius:8px 8px 0 0;}',
            '.rm-tab.active{color:#2563eb;border-bottom-color:#2563eb;background:#eff6ff;}',
            '.rm-count{background:#e2e8f0;color:#334155;border-radius:999px;padding:1px 8px;font-size:.7rem;margin-left:4px;}',
            '.rm-count-hot{background:#ef4444;color:white;}',
            '.rm-search{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:16px;}',
            '.rm-search-field{display:flex;flex-direction:column;gap:4px;}',
            '.rm-search-field label{font-size:.72rem;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:.03em;}',
            '.rm-search-field input,.rm-search-field select{padding:9px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:.9rem;background:white;}',
            '.rm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;}',
            '.rm-card{background:white;border:1px solid #e2e8f0;border-radius:14px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.05);display:flex;flex-direction:column;gap:8px;transition:box-shadow .15s,transform .15s;}',
            '.rm-card:hover{box-shadow:0 6px 18px rgba(37,99,235,.10);transform:translateY(-1px);}',
            '.rm-card-head{display:flex;gap:10px;align-items:flex-start;}',
            '.rm-card-icon{font-size:1.6rem;line-height:1;}',
            '.rm-card-title{margin:0 0 4px;font-size:1rem;}',
            '.rm-chip{display:inline-block;background:#eff6ff;color:#2563eb;border-radius:999px;padding:2px 10px;font-size:.7rem;font-weight:700;}',
            '.rm-chip-reg{background:#fef3c7;color:#b45309;margin-left:4px;}',
            '.rm-chip-ok{background:#dcfce7;color:#16a34a;}',
            '.rm-chip-off{background:#f1f5f9;color:#64748b;}',
            '.rm-chip-wait{background:#fef9c3;color:#a16207;}',
            '.rm-card-row{font-size:.85rem;color:#334155;}',
            '.rm-card-row.rm-hot{color:#dc2626;font-weight:700;}',
            '.rm-card-desc{margin:0;font-size:.84rem;color:#475569;white-space:pre-wrap;}',
            '.rm-card-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;padding-top:6px;}',
            '.rm-btn{padding:8px 14px;border-radius:10px;border:1px solid #cbd5e1;background:white;font-size:.84rem;font-weight:600;cursor:pointer;color:#334155;}',
            '.rm-btn:hover{background:#f1f5f9;}',
            '.rm-btn-primary{background:#2563eb;border-color:#2563eb;color:white;}',
            '.rm-btn-primary:hover{background:#1d4ed8;}',
            '.rm-btn-danger{background:white;border-color:#fecaca;color:#dc2626;}',
            '.rm-btn-danger:hover{background:#fef2f2;}',
            '.rm-btn[disabled]{opacity:.6;cursor:default;}',
            '.rm-empty{text-align:center;color:#64748b;padding:40px 20px;background:#f8fafc;border-radius:14px;font-size:.95rem;line-height:1.6;}',
            '.rm-toolbar{display:flex;justify-content:flex-end;margin-bottom:14px;}',
            '.rm-cand-list{display:flex;flex-direction:column;gap:12px;}',
            '.rm-cand{background:white;border:1px solid #e2e8f0;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:8px;}',
            '.rm-cand-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;}',
            '.rm-cand-head h4{margin:0;font-size:1rem;}',
            '.rm-bell-wrap{position:relative;}',
            '.rm-bell-btn{position:relative;font-size:1.3rem;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;padding:8px 14px;cursor:pointer;}',
            '.rm-bell-badge{position:absolute;top:-6px;right:-6px;background:#ef4444;color:white;font-size:.65rem;font-weight:700;border-radius:999px;min-width:18px;height:18px;display:flex;align-items:center;justify-content:center;padding:0 4px;}',
            '.rm-notif-panel{position:absolute;right:0;top:calc(100% + 8px);width:min(380px,90vw);max-height:420px;overflow:auto;background:white;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.15);z-index:500;padding:10px;}',
            '.rm-notif-head{display:flex;justify-content:space-between;align-items:center;padding:4px 6px 10px;border-bottom:1px solid #f1f5f9;}',
            '.rm-notif-item{display:flex;justify-content:space-between;gap:10px;padding:10px 6px;border-bottom:1px solid #f8fafc;font-size:.85rem;}',
            '.rm-notif-item.unread{background:#eff6ff;border-radius:8px;}',
            '.rm-notif-item p{margin:2px 0;color:#475569;font-size:.82rem;}',
            '.rm-notif-date{color:#94a3b8;font-size:.72rem;}',
            '.rm-notif-del{border:none;background:none;color:#94a3b8;font-size:1.1rem;cursor:pointer;}',
            '.rm-notif-empty{padding:24px;text-align:center;color:#64748b;font-size:.9rem;}',
            '.rm-form{display:flex;flex-direction:column;gap:12px;}',
            '.rm-form-row{display:flex;flex-direction:column;gap:4px;}',
            '.rm-form-row label{font-size:.75rem;font-weight:700;color:#475569;}',
            '.rm-form-row input,.rm-form-row select,.rm-form-row textarea{padding:9px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:.9rem;font-family:inherit;}',
            '.rm-form-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px;}',
            '.rm-form-check{flex-direction:row;align-items:center;gap:8px;}',
            '.rm-modal-intro{margin:0 0 4px;color:#475569;font-size:.9rem;}',
            '.rm-toast{position:fixed;bottom:20px;right:20px;background:#1e293b;color:white;padding:12px 18px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.25);font-size:.9rem;z-index:20000;opacity:0;transform:translateY(10px);transition:opacity .3s,transform .3s;max-width:340px;}',
            '.rm-toast.visible{opacity:1;transform:translateY(0);}',
            '@media (max-width:768px){.rm-form-cols{grid-template-columns:1fr;}.rm-notif-panel{right:-40px;}}'
        ].join('\n');
        document.head.appendChild(css);
    }

    document.addEventListener('click', function(e) {
        var panel = document.getElementById('rm-notif-panel');
        if (panel && panel.style.display === 'block' && !e.target.closest('.rm-bell-wrap')) {
            panel.style.display = 'none';
        }
        var modal = document.getElementById('rm-modal');
        if (modal && e.target === modal) window.rmCloseModal();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.rmInitMarketplaceWhenReady);
    } else {
        window.rmInitMarketplaceWhenReady();
    }
})();
