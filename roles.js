console.log('[ROLES] roles.js loading...');

// ============================================
// ROLES ET PERMISSIONS
// medecin_associe : acces a tout
// medecin_remplacant : urgence + parametres + cotation au nom du remplace
// secretaire : urgence + stocks + parametres
// ============================================

const ROLE_LABELS = {
    medecin_associe: 'Médecin associé',
    medecin_remplacant: 'Médecin remplaçant',
    secretaire: 'Secrétaire'
};

const ROLE_ACCESS = {
    medecin_associe: ['dashboard', 'urgence', 'history', 'cabinet', 'settings'],
    medecin_remplacant: ['dashboard', 'urgence', 'settings'],
    secretaire: ['urgence', 'cabinet', 'settings']
};

function getUserRole() {
    return (window.currentProfile && window.currentProfile.role) || 'medecin_associe';
}

function hasViewAccess(viewName) {
    const role = getUserRole();
    return (ROLE_ACCESS[role] || ROLE_ACCESS.medecin_associe).indexOf(viewName) !== -1;
}

window.hasViewAccess = hasViewAccess;
window.getUserRole = getUserRole;
window.ROLE_ACCESS = ROLE_ACCESS;
window.ROLE_LABELS = ROLE_LABELS;

// Masque/affiche la navigation selon le role de l'utilisateur
function applyRolePermissions() {
    const role = getUserRole();
    const allowed = ROLE_ACCESS[role] || ROLE_ACCESS.medecin_associe;

    document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(item => {
        const view = item.dataset.view;
        if (!view) return;
        item.style.display = allowed.indexOf(view) !== -1 ? '' : 'none';
    });

    document.querySelectorAll('.cabinet-tab').forEach(tab => {
        if (role === 'secretaire') {
            tab.style.display = (tab.dataset.tab === 'stocks') ? '' : 'none';
        } else {
            tab.style.display = '';
        }
    });

    const cabinetSwitchBtn = document.querySelector('#dashboardSwitcher [data-mode="cabinet"]');
    if (cabinetSwitchBtn) {
        cabinetSwitchBtn.style.display = (allowed.indexOf('cabinet') !== -1) ? '' : 'none';
    }

    console.log('[ROLES] Permissions appliquées pour le rôle:', role);
}

window.applyRolePermissions = applyRolePermissions;

// ============================================
// INSCRIPTION : ROLES + VILLE D'EXERCICE + CABINET
// ============================================

window.toggleRemplacantField = function() {
    var role = document.getElementById('register-role')?.value;
    var replaceGroup = document.getElementById('remplace-medecin-group');
    var cityGroup = document.getElementById('register-city-group');
    var addressGroup = document.getElementById('cabinet-address-group');

    if (replaceGroup) replaceGroup.style.display = (role === 'medecin_remplacant') ? 'block' : 'none';
    if (cityGroup) cityGroup.style.display = role ? 'block' : 'none';
    if (addressGroup) addressGroup.style.display = (role === 'medecin_associe') ? 'block' : 'none';

    if (role) loadCabinetsForCity();
};

// Charge les cabinets de la ville saisie et adapte l'UI :
// - aucun cabinet -> creation d'un cabinet
// - un ou plusieurs -> choix par adresse ou par noms des associes
async function loadCabinetsForCity() {
    var city = (document.getElementById('register-city')?.value || '').trim();
    var cityGroup = document.getElementById('register-city-group');
    var noCabinet = document.getElementById('register-no-cabinet');
    var selectGroup = document.getElementById('register-cabinet-select-group');
    var select = document.getElementById('register-cabinet');
    var role = document.getElementById('register-role')?.value;

    if (!cityGroup || !noCabinet || !selectGroup || !select) return;
    if (!role || city.length < 2) {
        cityGroup.style.display = role ? 'block' : 'none';
        noCabinet.style.display = 'none';
        selectGroup.style.display = 'none';
        return;
    }

    cityGroup.style.display = 'block';

    try {
        const { data: cabinets, error } = await supabaseClient
            .from('cabinet_medecins_public')
            .select('cabinet_id, cabinet_name, address, city, medecin_id, first_name, last_name')
            .ilike('city', '%' + city + '%');

        if (error) {
            console.error('[CABINET] Erreur recherche cabinets:', error);
            return;
        }

        // Grouper par cabinet (plusieurs lignes par cabinet, une par associe)
        var map = {};
        (cabinets || []).forEach(function(r) {
            if (!map[r.cabinet_id]) {
                map[r.cabinet_id] = {
                    id: r.cabinet_id,
                    name: r.cabinet_name,
                    address: r.address,
                    city: r.city,
                    medecins: []
                };
            }
            if (r.medecin_id && !map[r.cabinet_id].medecins.some(function(m) { return m.id === r.medecin_id; })) {
                map[r.cabinet_id].medecins.push({ id: r.medecin_id, name: (r.first_name || '') + ' ' + (r.last_name || '') });
            }
        });

        var list = Object.values(map);

        window._registerCabinets = list;

        if (list.length === 0) {
            noCabinet.style.display = 'block';
            selectGroup.style.display = 'none';
        } else {
            noCabinet.style.display = 'none';
            selectGroup.style.display = 'block';

            var options = '<option value="">Sélectionner un cabinet...</option>';
            list.forEach(function(cab) {
                var label = cab.address || cab.name || 'Cabinet';
                if (cab.medecins.length > 0) {
                    label += ' — Dr ' + cab.medecins.map(function(m) { return m.name.trim(); }).join(', Dr ');
                }
                options += '<option value="' + cab.id + '">' + label + '</option>';
            });
            select.innerHTML = options;

            if (role === 'medecin_remplacant') loadRemplacablesMedecins(list);
        }
    } catch (e) {
        console.error('[CABINET] Exception recherche cabinets:', e);
    }
}

// Remplit la liste des medecins associes remplacables (tous cabinets de la ville)
function loadRemplacablesMedecins(cabinetList) {
    var select = document.getElementById('register-remplace');
    if (!select) return;

    var seen = {};
    var options = '<option value="">Sélectionner...</option>';
    cabinetList.forEach(function(cab) {
        cab.medecins.forEach(function(m) {
            if (seen[m.id]) return;
            seen[m.id] = true;
            options += '<option value="' + m.id + '">Dr ' + m.name.trim() + (cab.address ? ' (' + cab.address + ')' : '') + '</option>';
        });
    });
    select.innerHTML = options;
}

// ============================================
// VALIDATION DES DEMANDES D'ACCES PAR UN ASSOCIE
// ============================================

// Charge les demandes en attente pour le cabinet du medecin associe connecte
async function loadPendingJoinRequests() {
    var container = document.getElementById('pending-join-requests');
    if (!container) return;

    if (getUserRole() !== 'medecin_associe' || !window.currentProfile?.cabinet_id) {
        container.style.display = 'none';
        return;
    }

    try {
        const { data: requests, error } = await supabaseClient
            .from('cabinet_join_requests')
            .select('*')
            .eq('cabinet_id', window.currentProfile.cabinet_id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error || !requests || requests.length === 0) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        var html = '<h3 class="join-requests-title">Demandes d\'accès au cabinet</h3>';
        requests.forEach(function(r) {
            var roleLabel = ROLE_LABELS[r.role] || r.role;
            html +=
                '<div class="join-request-item" data-request-id="' + r.id + '">' +
                    '<div class="join-request-info">' +
                        '<div class="join-request-name">' + (r.first_name || '') + ' ' + (r.last_name || '') + '</div>' +
                        '<div class="join-request-meta">' + (r.email || '') + ' · ' + roleLabel + '</div>' +
                    '</div>' +
                    '<div class="join-request-actions">' +
                        '<button type="button" class="btn-primary" onclick="decideJoinRequest(\'' + r.id + '\', \'approved\')">Accepter</button>' +
                        '<button type="button" class="btn-secondary" onclick="decideJoinRequest(\'' + r.id + '\', \'rejected\')">Refuser</button>' +
                    '</div>' +
                '</div>';
        });

        container.innerHTML = html;
        container.style.display = 'block';
    } catch (e) {
        console.error('[JOIN] Erreur chargement demandes:', e);
    }
}

// Le medecin associe accepte ou refuse une demande
window.decideJoinRequest = async function(requestId, decision) {
    if (!supabaseClient || !currentUser) return;

    try {
        const { data: request, error: reqError } = await supabaseClient
            .from('cabinet_join_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (reqError || !request) {
            showToast('Demande introuvable', 'error');
            return;
        }

        if (decision === 'approved') {
            const { error: profileError } = await supabaseClient
                .from('profiles')
                .update({
                    cabinet_id: request.cabinet_id,
                    status: 'approved',
                    remplace_medecin_id: request.remplace_medecin_id || null
                })
                .eq('id', request.user_id);

            if (profileError) {
                console.error('[JOIN] Erreur validation profil:', profileError);
                showToast('Erreur lors de la validation: ' + profileError.message, 'error');
                return;
            }
        } else {
            const { error: profileError } = await supabaseClient
                .from('profiles')
                .update({ status: 'rejected' })
                .eq('id', request.user_id);

            if (profileError) {
                console.error('[JOIN] Erreur refus profil:', profileError);
            }
        }

        const { error: updateError } = await supabaseClient
            .from('cabinet_join_requests')
            .update({ status: decision, decided_by: currentUser.id, decided_at: new Date().toISOString() })
            .eq('id', requestId);

        if (updateError) {
            console.error('[JOIN] Erreur mise à jour demande:', updateError);
        }

        showToast(decision === 'approved' ? 'Demande acceptée' : 'Demande refusée', decision === 'approved' ? 'success' : 'info');
        loadPendingJoinRequests();
    } catch (e) {
        console.error('[JOIN] Exception:', e);
        showToast('Erreur: ' + e.message, 'error');
    }
};

window.loadPendingJoinRequests = loadPendingJoinRequests;

// ============================================
// COTATION AU NOM DU MEDECIN REMPLACE
// Un remplacant cote en lieu et place du medecin associe
// qu'il remplace (exercice liberal en hopital local)
// ============================================

// Retourne l'ID du compte au nom duquel l'utilisateur courant cote :
// le remplacant cote au nom du medecin remplace
function getCotationUserId() {
    if (getUserRole() === 'medecin_remplacant' && window.currentProfile?.remplace_medecin_id) {
        return window.currentProfile.remplace_medecin_id;
    }
    return currentUser ? currentUser.id : null;
}

window.getCotationUserId = getCotationUserId;

// Affiche un bandeau informatif pour le remplacant
function applyRemplacantCotationBanner() {
    var existing = document.getElementById('remplacant-banner');
    if (getUserRole() !== 'medecin_remplacant') {
        if (existing) existing.remove();
        return;
    }

    if (!existing) {
        existing = document.createElement('div');
        existing.id = 'remplacant-banner';
        existing.style.cssText = 'display:none;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;padding:10px 16px;font-size:0.85rem;text-align:center;';
        var app = document.getElementById('app-container');
        if (app) app.prepend(existing);
    }

    if (window.currentProfile?.remplace_medecin_name) {
        existing.textContent = 'Vous exercez en tant que remplaçant : vos cotations sont enregistrées au nom du Dr ' + window.currentProfile.remplace_medecin_name + '.';
        existing.style.display = 'block';
    } else if (window.currentProfile?.remplace_medecin_id) {
        existing.textContent = 'Vous exercez en tant que remplaçant : vos cotations sont enregistrées au nom du médecin remplacé.';
        existing.style.display = 'block';
    } else {
        existing.style.display = 'none';
    }
}

window.applyRemplacantCotationBanner = applyRemplacantCotationBanner;

// Applique les permissions des que le profil est charge
var _rolesProfileObserver = setInterval(function() {
    if (window.currentProfile) {
        applyRolePermissions();
        applyRemplacantCotationBanner();
        loadPendingJoinRequests();
        clearInterval(_rolesProfileObserver);
    }
}, 300);

console.log('[ROLES] roles.js loaded');
