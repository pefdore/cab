// ============================================
// MODULE SALLE D'URGENCE
// Stocks + Pointage hebdomadaire + Protocoles (TTS)
// ============================================

console.log('[URGENCE] Module chargé');

const URGENCE_STORAGE_KEY = 'urgence_room_data_v1';

const URGENCE_CATEGORIES = [
    { id: 'desinfection', label: 'Désinfection' },
    { id: 'suture', label: 'Suture / petit matériel' },
    { id: 'injection', label: 'Injections / perfusion' },
    { id: 'medicament', label: 'Médicaments' },
    { id: 'divers', label: 'Divers' }
];

const URGENCE_DEFAULT_PRODUCTS = [
    { id: 'p1', name: 'Désinfectant (Bétadine dermique 10%)', category: 'desinfection', unit: 'flacon', quantity: 2, minQuantity: 2, expiry: null },
    { id: 'p2', name: 'Compresses stériles 10x10', category: 'desinfection', unit: 'paquet', quantity: 4, minQuantity: 2, expiry: null },
    { id: 'p3', name: 'Kit de suture complet', category: 'suture', unit: 'kit', quantity: 1, minQuantity: 1, expiry: null },
    { id: 'p4', name: 'Fils de suture (3-0, 4-0, 5-0)', category: 'suture', unit: 'boîte', quantity: 3, minQuantity: 2, expiry: null },
    { id: 'p5', name: 'Gants stériles', category: 'suture', unit: 'paire', quantity: 6, minQuantity: 4, expiry: null },
    { id: 'p6', name: 'Aiguilles IM / SC', category: 'injection', unit: 'boîte', quantity: 1, minQuantity: 1, expiry: null },
    { id: 'p7', name: 'Seringues 5 ml / 10 ml', category: 'injection', unit: 'boîte', quantity: 2, minQuantity: 1, expiry: null },
    { id: 'p8', name: 'Matériel de perfusion (gaines, cathéters)', category: 'injection', unit: 'kit', quantity: 2, minQuantity: 2, expiry: null },
    { id: 'p9', name: 'Sérum physiologique (poches 500 ml)', category: 'injection', unit: 'poche', quantity: 2, minQuantity: 2, expiry: null },
    { id: 'p10', name: 'Rocéphine (ceftriaxone) 1 g', category: 'medicament', unit: 'flacon', quantity: 2, minQuantity: 2, expiry: null },
    { id: 'p11', name: 'Adrénaline (épinéphrine) 1 mg/mL', category: 'medicament', unit: 'ampoule', quantity: 3, minQuantity: 3, expiry: null },
    { id: 'p12', name: 'Solupred (prednisolone) 20 mg', category: 'medicament', unit: 'comprimé', quantity: 10, minQuantity: 5, expiry: null },
    { id: 'p13', name: 'Furosémide 20 mg', category: 'medicament', unit: 'ampoule', quantity: 3, minQuantity: 2, expiry: null }
];

let urgenceData = null;
let urgenceTTSActive = false;
let urgenceTTSQueue = [];

// ---------- Persistance ----------

function loadUrgenceData() {
    try {
        const raw = localStorage.getItem(URGENCE_STORAGE_KEY);
        if (raw) {
            urgenceData = JSON.parse(raw);
            if (!Array.isArray(urgenceData.products)) urgenceData.products = URGENCE_DEFAULT_PRODUCTS.slice();
            if (!Array.isArray(urgenceData.pointages)) urgenceData.pointages = [];
            if (!urgenceData.lastPointage) urgenceData.lastPointage = null;
        } else {
            urgenceData = {
                products: URGENCE_DEFAULT_PRODUCTS.slice(),
                pointages: [],
                lastPointage: null
            };
            saveUrgenceData();
        }
    } catch (e) {
        console.error('[URGENCE] Erreur chargement:', e);
        urgenceData = { products: URGENCE_DEFAULT_PRODUCTS.slice(), pointages: [], lastPointage: null };
    }
}

function saveUrgenceData() {
    try {
        localStorage.setItem(URGENCE_STORAGE_KEY, JSON.stringify(urgenceData));
    } catch (e) {
        console.error('[URGENCE] Erreur sauvegarde:', e);
        if (typeof showToast === 'function') showToast('Erreur : stockage local indisponible', 'error');
    }
}

// ---------- Utilitaires ----------

function urgenceEscapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function urgenceCategoryLabel(catId) {
    const cat = URGENCE_CATEGORIES.find(c => c.id === catId);
    return cat ? cat.label : 'Divers';
}

function urgenceDaysSinceLastPointage() {
    if (!urgenceData.lastPointage) return null;
    const last = new Date(urgenceData.lastPointage);
    const now = new Date();
    return Math.floor((now - last) / 86400000);
}

function urgenceStockState(p) {
    if (!p.quantity) return 'rupture';
    if (p.quantity <= p.minQuantity) return 'bas';
    return 'ok';
}

// ---------- Rendu : Stocks ----------

function renderUrgenceStocks() {
    const tbody = document.getElementById('urgenceStockBody');
    const cabinetTbody = document.getElementById('cabinetUrgenceStockBody');

    const filter = document.getElementById('urgenceStockFilter')?.value || '';
    const products = urgenceData.products.filter(p => !filter || p.category === filter);

    if (tbody) {
        // Page Salle d'urgence : lecture seule, vue rapide de ce qui est disponible
        tbody.innerHTML = products.length === 0
            ? '<tr><td colspan="5" class="urgence-empty">Aucun produit enregistré. Ajoutez-le depuis Cabinet → Stocks.</td></tr>'
            : products.map(p => {
                const state = urgenceStockState(p);
                const stateLabel = state === 'rupture' ? 'RUPTURE' : (state === 'bas' ? 'Stock bas' : 'OK');
                const stateClass = state === 'rupture' ? 'danger' : (state === 'bas' ? 'warning' : 'success');
                const expiryHtml = p.expiry ? urgenceEscapeHtml(p.expiry) : '-';
                return `
                    <tr>
                        <td>${urgenceEscapeHtml(p.name)}</td>
                        <td><span class="urgence-cat-badge">${urgenceEscapeHtml(urgenceCategoryLabel(p.category))}</span></td>
                        <td>${p.quantity} ${urgenceEscapeHtml(p.unit)}</td>
                        <td>${expiryHtml}</td>
                        <td><span class="urgence-state ${stateClass}">${stateLabel}</span></td>
                    </tr>`;
            }).join('');
    }

    if (cabinetTbody) {
        // Cabinet → Stocks : gestion complète (modifier / supprimer)
        cabinetTbody.innerHTML = products.length === 0
            ? '<tr><td colspan="7" class="urgence-empty">Aucun produit. Ajoutez-en avec le bouton « Ajouter un produit ».</td></tr>'
            : products.map(p => {
                const state = urgenceStockState(p);
                const stateLabel = state === 'rupture' ? 'RUPTURE' : (state === 'bas' ? 'À commander' : 'OK');
                const stateClass = state === 'rupture' ? 'danger' : (state === 'bas' ? 'warning' : 'success');
                const expiryHtml = p.expiry ? urgenceEscapeHtml(p.expiry) : '-';
                return `
                    <tr>
                        <td>${urgenceEscapeHtml(p.name)}</td>
                        <td><span class="urgence-cat-badge">${urgenceEscapeHtml(urgenceCategoryLabel(p.category))}</span></td>
                        <td>${p.quantity} ${urgenceEscapeHtml(p.unit)}</td>
                        <td>${p.minQuantity}</td>
                        <td>${expiryHtml}</td>
                        <td><span class="urgence-state ${stateClass}">${stateLabel}</span></td>
                        <td class="urgence-actions">
                            <button class="action-btn" onclick="urgenceEditProduct('${p.id}')" title="Modifier">✏️</button>
                            <button class="action-btn" onclick="urgenceDeleteProduct('${p.id}')" title="Supprimer">🗑️</button>
                        </td>
                    </tr>`;
            }).join('');
    }

    renderUrgenceAlerts();
}

function renderUrgenceAlerts() {
    const alertsEl = document.getElementById('urgenceStockAlerts');
    if (!alertsEl) return;

    const toOrder = urgenceData.products.filter(p => p.quantity <= p.minQuantity);
    const expired = urgenceData.products.filter(p => p.expiry && new Date(p.expiry) < new Date());

    let html = '';
    if (toOrder.length > 0) {
        html += `<div class="urgence-alert danger">⚠️ <strong>${toOrder.length} produit(s) à commander :</strong> ${toOrder.map(p => urgenceEscapeHtml(p.name)).join(', ')}</div>`;
    }
    if (expired.length > 0) {
        html += `<div class="urgence-alert warning">⏳ <strong>Produits périmés :</strong> ${expired.map(p => urgenceEscapeHtml(p.name)).join(', ')}</div>`;
    }
    if (toOrder.length === 0 && expired.length === 0) {
        html = '<div class="urgence-alert success">✅ Stocks salle d\'urgence au complet, rien à signaler.</div>';
    }
    alertsEl.innerHTML = html;

    const cabinetAlertsEl = document.getElementById('cabinetUrgenceStockAlerts');
    if (cabinetAlertsEl && cabinetAlertsEl !== alertsEl) cabinetAlertsEl.innerHTML = html;

    const orderBtn = document.getElementById('urgenceCopyOrderBtn');
    if (orderBtn) orderBtn.disabled = toOrder.length === 0;
    const orderBtnCabinet = document.getElementById('urgenceCopyOrderBtnCabinet');
    if (orderBtnCabinet) orderBtnCabinet.disabled = toOrder.length === 0;
}

function urgenceCopyOrderList() {
    const toOrder = urgenceData.products.filter(p => p.quantity <= p.minQuantity);
    if (toOrder.length === 0) return;
    const lines = toOrder.map(p => `- ${p.name} (reste ${p.quantity} ${p.unit}, seuil ${p.minQuantity})`);
    const text = 'Commande salle d\'urgence :\n' + lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
        if (typeof showToast === 'function') showToast('Liste de commande copiée dans le presse-papiers');
    }).catch(() => {
        alert(text);
    });
}

// ---------- Ajout / édition produit ----------

function urgenceShowAddProductModal() {
    urgenceShowProductModal(null);
}

function urgenceShowProductModal(product) {
    const existing = document.getElementById('urgenceProductModal');
    if (existing) existing.remove();

    const isEdit = !!product;
    const cats = URGENCE_CATEGORIES.map(c => `<option value="${c.id}" ${product && product.category === c.id ? 'selected' : ''}>${c.label}</option>`).join('');

    const modal = document.createElement('div');
    modal.id = 'urgenceProductModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-card urgence-modal-content">
            <div class="modal-header"><h3>${isEdit ? 'Modifier le produit' : 'Ajouter un produit'}</h3></div>
            <div class="form-group">
                <label>Nom du produit *</label>
                <input type="text" id="urgenceProductName" class="form-input" value="${product ? urgenceEscapeHtml(product.name) : ''}" placeholder="Ex : Adrénaline 1 mg/mL">
            </div>
            <div class="form-group">
                <label>Catégorie</label>
                <select id="urgenceProductCategory" class="form-input">${cats}</select>
            </div>
            <div class="urgence-form-row">
                <div class="form-group">
                    <label>Unité</label>
                    <input type="text" id="urgenceProductUnit" class="form-input" value="${product ? urgenceEscapeHtml(product.unit) : 'unité'}" placeholder="flacon, ampoule, kit...">
                </div>
                <div class="form-group">
                    <label>Quantité actuelle</label>
                    <input type="number" id="urgenceProductQty" class="form-input" min="0" value="${product ? product.quantity : 0}">
                </div>
                <div class="form-group">
                    <label>Seuil d'alerte</label>
                    <input type="number" id="urgenceProductMin" class="form-input" min="0" value="${product ? product.minQuantity : 1}">
                </div>
            </div>
            <div class="form-group">
                <label>Date de péremption (facultatif)</label>
                <input type="date" id="urgenceProductExpiry" class="form-input" value="${product && product.expiry ? product.expiry : ''}">
            </div>
            <div class="modal-footer urgence-modal-actions">
                <button class="action-btn" onclick="urgenceCloseProductModal()">Annuler</button>
                <button class="action-btn primary" onclick="urgenceSaveProduct(${isEdit ? `'${product.id}'` : 'null'})">${isEdit ? 'Enregistrer' : 'Ajouter'}</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

function urgenceCloseProductModal() {
    document.getElementById('urgenceProductModal')?.remove();
}

function urgenceSaveProduct(productId) {
    const name = document.getElementById('urgenceProductProductName')?.value?.trim() || document.getElementById('urgenceProductName')?.value?.trim();
    const category = document.getElementById('urgenceProductCategory')?.value;
    const unit = document.getElementById('urgenceProductUnit')?.value?.trim() || 'unité';
    const qty = parseInt(document.getElementById('urgenceProductQty')?.value, 10) || 0;
    const min = parseInt(document.getElementById('urgenceProductMin')?.value, 10) || 0;
    const expiryRaw = document.getElementById('urgenceProductExpiry')?.value;
    const expiry = expiryRaw || null;

    if (!name) {
        if (typeof showToast === 'function') showToast('Le nom du produit est obligatoire', 'error');
        return;
    }

    if (productId) {
        const p = urgenceData.products.find(p => p.id === productId);
        if (p) {
            p.name = name; p.category = category; p.unit = unit;
            p.quantity = qty; p.minQuantity = min; p.expiry = expiry;
        }
    } else {
        urgenceData.products.push({
            id: 'p' + Date.now(),
            name, category, unit,
            quantity: qty, minQuantity: min, expiry
        });
    }

    saveUrgenceData();
    urgenceCloseProductModal();
    renderUrgenceStocks();
    renderUrgencePointage();
    if (typeof showToast === 'function') showToast(productId ? 'Produit modifié' : 'Produit ajouté');
}

function urgenceEditProduct(id) {
    const p = urgenceData.products.find(p => p.id === id);
    if (p) urgenceShowProductModal(p);
}

function urgenceDeleteProduct(id) {
    const p = urgenceData.products.find(p => p.id === id);
    if (!p) return;
    if (!confirm(`Supprimer « ${p.name} » de la liste ?`)) return;
    urgenceData.products = urgenceData.products.filter(p => p.id !== id);
    saveUrgenceData();
    renderUrgenceStocks();
    renderUrgencePointage();
    if (typeof showToast === 'function') showToast('Produit supprimé');
}

// ---------- Pointage hebdomadaire (secrétaire) ----------

function renderUrgencePointage() {
    const container = document.getElementById('urgencePointageList');
    if (!container) return;

    const products = urgenceData.products;
    if (products.length === 0) {
        container.innerHTML = '<p class="urgence-empty">Ajoutez d\'abord des produits dans l\'onglet Stocks.</p>';
        return;
    }

    const daysSince = urgenceDaysSinceLastPointage();
    const infoEl = document.getElementById('urgencePointageInfo');
    if (infoEl) {
        if (daysSince === null) {
            infoEl.innerHTML = 'Premier pointage. Cochez ce qui reste réellement dans la salle d\'urgence.';
        } else if (daysSince >= 7) {
            infoEl.innerHTML = `<strong>⚠️ Pointage à faire :</strong> dernier pointage il y a ${daysSince} jours.`;
        } else {
            infoEl.innerHTML = `Dernier pointage : il y a ${daysSince} jour(s). Prochain pointage conseillé dans ${7 - daysSince} jour(s).`;
        }
    }

    container.innerHTML = products.map(p => `
        <div class="urgence-pointage-row" data-id="${p.id}">
            <div class="urgence-pointage-name">
                <strong>${urgenceEscapeHtml(p.name)}</strong>
                <span class="urgence-pointage-sub">${urgenceEscapeHtml(urgenceCategoryLabel(p.category))} · stock actuel : ${p.quantity} ${urgenceEscapeHtml(p.unit)} (seuil ${p.minQuantity})</span>
            </div>
            <div class="urgence-pointage-input">
                <label>Reste :</label>
                <input type="number" min="0" class="form-input urgence-pointage-qty" data-id="${p.id}" value="${p.quantity}">
                <span class="urgence-pointage-unit">${urgenceEscapeHtml(p.unit)}</span>
                <span class="urgence-pointage-flag" data-flag="${p.id}"></span>
            </div>
        </div>`).join('');

    container.querySelectorAll('.urgence-pointage-qty').forEach(input => {
        input.addEventListener('input', () => urgenceUpdatePointageFlag(input));
    });
}

function urgenceUpdatePointageFlag(input) {
    const id = input.dataset.id;
    const product = urgenceData.products.find(p => p.id === id);
    const flag = document.querySelector(`.urgence-pointage-flag[data-flag="${id}"]`);
    if (!product || !flag) return;
    const qty = parseInt(input.value, 10) || 0;
    if (qty <= product.minQuantity) {
        flag.textContent = '→ à commander';
        flag.className = 'urgence-pointage-flag warning';
    } else {
        flag.textContent = '✓';
        flag.className = 'urgence-pointage-flag success';
    }
}

function urgenceSavePointage() {
    const inputs = document.querySelectorAll('.urgence-pointage-qty');
    if (inputs.length === 0) return;

    let changed = false;
    const snapshot = {};
    inputs.forEach(input => {
        const id = input.dataset.id;
        const qty = parseInt(input.value, 10);
        if (isNaN(qty) || qty < 0) return;
        const product = urgenceData.products.find(p => p.id === id);
        if (!product) return;
        if (product.quantity !== qty) {
            product.quantity = qty;
            changed = true;
        }
        snapshot[id] = qty;
    });

    const now = new Date().toISOString();
    urgenceData.lastPointage = now;
    urgenceData.pointages.push({
        date: now,
        items: snapshot,
        by: (typeof currentUser !== 'undefined' && currentUser?.email) ? currentUser.email : 'secrétariat'
    });
    if (urgenceData.pointages.length > 60) urgenceData.pointages = urgenceData.pointages.slice(-60);

    saveUrgenceData();
    renderUrgenceStocks();
    renderUrgencePointage();

    const toOrder = urgenceData.products.filter(p => p.quantity <= p.minQuantity);
    const msg = toOrder.length > 0
        ? `Pointage enregistré. ${toOrder.length} produit(s) à commander.`
        : 'Pointage enregistré. Tout est en ordre ✅';
    if (typeof showToast === 'function') showToast(msg);
    else alert(msg);

    if (toOrder.length > 0 && confirm(`Générer la liste à commander (${toOrder.length} produit(s)) ?\n\nVous pourrez la copier pour le fournisseur.`)) {
        urgenceCopyOrderList();
    }
}

// ---------- Protocoles d'urgence ----------

const URGENCE_PROTOCOLS = [
    {
        id: 'sca',
        title: 'SCA — Syndrome Coronarien Aigu',
        icon: '❤️',
        color: 'danger',
        intro: 'Douleur thoracique constrictive > 15 min, irradiant bras/mâchoire, sueurs, nausées. Penser au SCA chez le diabétique et la femme (symptômes atypiques).',
        steps: [
            { title: 'Appel', text: 'Appeler le 15 (SAMU) immédiatement et préciser « suspicion de SCA ». Ne jamais laisser le patient seul.' },
            { title: 'Position & repos', text: 'Patient au repos, position demi-assise. Déshabiller le torse pour le scope.' },
            { title: 'Monitor', text: 'Prendre les constantes : fréquence cardiaque, tension artérielle, saturation, fréquence respiratoire. Poser scope si disponible et rechercher troubles du rythme.' },
            { title: 'Aspirine', text: 'Aspirine 300 mg à croquer, per os, sauf allergie ou hémorragie active.' },
            { title: 'Trinitrine', text: 'Trinitrine sublinguale 0,15 mg si douleur persistante, PAS si PAS inférieure à 100 mmHg, infarctus inférieur avec extension droite, ou traitement récent par inhibiteur de PDE5.' },
            { title: 'Oxygène', text: 'Oxygène seulement si saturation inférieure à 90 % : débit 2 à 4 litres par minute.' },
            { title: 'Voir', text: 'Poser une voie veineuse et garder le patient sous surveillance continue jusqu\'à l\'arrivée du SAMU. Transmettre ECG et constantes.' }
        ]
    },
    {
        id: 'avc',
        title: 'AVC — Accident Vasculaire Cérébral',
        icon: '🧠',
        color: 'warning',
        intro: 'Déficit neurologique brutal : asymétrie du visage, faiblesse d\'un bras, trouble de la parole. Règle FAST + heure de début exacte des symptômes = information capitale.',
        steps: [
            { title: 'Heure de début', text: 'Déterminer et noter l\'heure exacte de début des symptômes (ou l\'heure du dernier examen normal). C\'est le critère clé pour la thrombolyse.' },
            { title: 'Appel', text: 'Appeler le 15 immédiatement et préciser « suspicion d\'AVC » pour orientation vers une unité neurovasculaire (UNV).' },
            { title: 'Examen FAST', text: 'Face : sourire asymétrique ? Bras : faiblesse d\'un bras à l\'élévation ? Parole : propos confus ou impossibles ? Vision et équilibre : vérifier aussi.' },
            { title: 'Constantes', text: 'Fréquence cardiaque, tension, saturation, glycémie capillaire : corriger une hypoglycémie qui peut mimer un AVC.' },
            { title: 'Position', text: 'Patient allongé, tête légèrement surélevée à 30 degrés. Rien par voie orale : risque de fausse route.' },
            { title: 'Ne pas faire', text: 'Ne PAS donner d\'aspirine ni d\'antihypertenseur en phase aiguë avant avis médical : hémorragie cérébrale non exclue.' },
            { title: 'Documents', text: 'Préparer la liste des traitements et anticoagulants du patient, et les constantes pour le SAMU.' }
        ]
    },
    {
        id: 'anaphylaxie',
        title: 'Choc anaphylactique',
        icon: '⚡',
        color: 'danger',
        intro: 'Réaction allergique brutale avec atteinte respiratoire (urticaire généralisé + détresse) et/ou hypotension. Urgence vitale absolue : l\'adrénaline IM est le traitement immédiat.',
        steps: [
            { title: 'Appel 15', text: 'Appeler le 15 (SAMU) immédiatement.' },
            { title: 'Adrénaline IM', text: 'Adrénaline 1 mg/mL, 0,5 mg en intramusculaire, face antéro-latérale de la cuisse. Adulte : 0,5 mg. Enfant : 0,01 mg par kilo, maximum 0,5 mg. À renouveler toutes les 5 à 15 minutes si pas d\'amélioration.' },
            { title: 'Position', text: 'Patient allongé, jambes surélevées si hypotension. Si gêne respiratoire : position demi-assise. En cas de perte de conscience : PLS.' },
            { title: 'Arrêter l\'exposition', text: 'Retirer le contact allergène : arrêter le médicament, retirer le repas, éloigner l\'insecte. Ne pas faire saigner ni aspirer un venin de piqûre.' },
            { title: 'Oxygène & PLS', text: 'Oxygène haut débit si disponible. Voie veineuse avec sérum physiologique si choc : remplissage rapide.' },
            { title: 'Surveillance', text: 'Réévaluer toutes les 5 minutes : conscience, respiration, tension. Réactions biphasiques possibles dans les 12 heures : hospitalisation systématique.' }
        ]
    },
    {
        id: 'purpura',
        title: 'Purpura fulminans',
        icon: '🟣',
        color: 'danger',
        intro: 'Purpura nécrotique extensif + fièvre + signes de choc. Urgence infectieuse absolue : l\'antibiotique est administré AVANT tout transfert, sans attendre le laboratoire.',
        steps: [
            { title: 'Reconnaître', text: 'Purpura pétéchial ou écchymotique extensif, éléments nécrotiques, fièvre élevée, hypotension, confusion. Le purpura ne s\'efface pas à la vitropression.' },
            { title: 'Appel 15', text: 'Appeler le 15 (SAMU) immédiatement en précisant « purpura fulminans ».' },
            { title: 'Antibiotique immédiat', text: 'Rocéphine (ceftriaxone) 100 mg par kilo en intraveineuse lente ou intramusculaire, sans dépasser 2 g par injection, dès la suspicion, avant le transfert. Alternative : amoxicilline si disponible.' },
            { title: 'Hémoculture', text: 'Si possible : une seule hémoculture prélevée avant ou en même temps que l\'antibiotique, SANS retarder l\'antibiothérapie.' },
            { title: 'Remplissage', text: 'Poser une voie veineuse et débuter un remplissage par sérum physiologique si hypotension : 500 ml chez l\'adulte, 20 ml par kilo chez l\'enfant, à répéter selon la tension.' },
            { title: 'Surveillance', text: 'Constantes toutes les 5 minutes : tension, conscience, respiration. Ne jamais laisser le patient debout ou marcher.' }
        ]
    }
];

function renderUrgenceProtocols() {
    const container = document.getElementById('urgenceProtocolsGrid');
    if (!container) return;

    container.innerHTML = URGENCE_PROTOCOLS.map(proto => `
        <div class="urgence-protocol-card collapsed" data-proto="${proto.id}">
            <div class="urgence-protocol-header ${proto.color}" onclick="urgenceToggleProtocol('${proto.id}')">
                <span class="urgence-protocol-icon">${proto.icon}</span>
                <h4>${urgenceEscapeHtml(proto.title)}</h4>
                <span class="urgence-protocol-toggle" data-toggle="${proto.id}">▾</span>
            </div>
            <div class="urgence-protocol-body">
                <p class="urgence-protocol-intro">${urgenceEscapeHtml(proto.intro)}</p>
                <ol class="urgence-steps">
                    ${proto.steps.map((s, i) => `
                        <li class="urgence-step" data-proto="${proto.id}" data-step="${i}">
                            <span class="urgence-step-num">${i + 1}</span>
                            <div class="urgence-step-content">
                                <strong>${urgenceEscapeHtml(s.title)}</strong>
                                <p>${urgenceEscapeHtml(s.text)}</p>
                            </div>
                        </li>`).join('')}
                </ol>
                <div class="urgence-tts-controls">
                    <button class="action-btn primary" onclick="urgenceTTSPlay('${proto.id}')">🔊 Écouter le protocole</button>
                    <button class="action-btn" onclick="urgenceTTSStop()" style="display:none;" data-tts="stop-${proto.id}">⏹ Stop</button>
                </div>
            </div>
        </div>`).join('');
}

function urgenceToggleProtocol(protoId) {
    const card = document.querySelector(`.urgence-protocol-card[data-proto="${protoId}"]`);
    if (!card) return;
    const wasCollapsed = card.classList.contains('collapsed');
    urgenceCollapseAllProtocols();
    if (wasCollapsed) {
        card.classList.remove('collapsed');
        card.classList.add('open');
    }
}

function urgenceCollapseAllProtocols() {
    document.querySelectorAll('.urgence-protocol-card').forEach(c => {
        c.classList.add('collapsed');
        c.classList.remove('open');
    });
}

// ---------- TTS (synthèse vocale) ----------

function urgenceTTSVoice() {
    const voices = speechSynthesis.getVoices();
    return voices.find(v => v.lang === 'fr-FR') || voices.find(v => v.lang && v.lang.startsWith('fr')) || null;
}

function urgenceTTSPlay(protoId) {
    const proto = URGENCE_PROTOCOLS.find(p => p.id === protoId);
    if (!proto || !('speechSynthesis' in window)) {
        if (typeof showToast === 'function') showToast('Synthèse vocale non disponible sur cet appareil', 'error');
        return;
    }

    urgenceTTSStop();

    const fullText = `Protocole : ${proto.title.replace('—', '-')} . ${proto.intro} ` +
        proto.steps.map((s, i) => ` Étape ${i + 1} : ${s.title} . ${s.text}`).join(' ') +
        ' Fin du protocole.';

    const utter = new SpeechSynthesisUtterance(fullText);
    utter.lang = 'fr-FR';
    utter.rate = 0.95;
    const voice = urgenceTTSVoice();
    if (voice) utter.voice = voice;

    utter.onstart = () => {
        urgenceTTSActive = true;
        document.querySelector(`[data-tts="stop-${protoId}"]`)?.style.setProperty('display', 'inline-flex');
        document.querySelector(`.urgence-protocol-card[data-proto="${protoId}"]`)?.classList.add('urgence-speaking');
    };
    utter.onend = () => {
        urgenceTTSActive = false;
        document.querySelector(`[data-tts="stop-${protoId}"]`)?.style.setProperty('display', 'none');
        document.querySelector(`.urgence-protocol-card[data-proto="${protoId}"]`)?.classList.remove('urgence-speaking');
    };
    utter.onerror = utter.onend;

    speechSynthesis.speak(utter);
}

function urgenceTTSStop() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    urgenceTTSActive = false;
    document.querySelectorAll('[data-tts]').forEach(b => b.style.setProperty('display', 'none'));
    document.querySelectorAll('.urgence-speaking').forEach(c => c.classList.remove('urgence-speaking'));
}

// ---------- Initialisation ----------

function initUrgenceModule() {
    loadUrgenceData();

    const filter = document.getElementById('urgenceStockFilter');
    if (filter) filter.addEventListener('change', renderUrgenceStocks);

    const addBtn = document.getElementById('urgenceAddProductBtn');
    if (addBtn) addBtn.addEventListener('click', urgenceShowAddProductModal);

    const copyBtn = document.getElementById('urgenceCopyOrderBtn');
    if (copyBtn) copyBtn.addEventListener('click', urgenceCopyOrderList);

    const copyBtnCabinet = document.getElementById('urgenceCopyOrderBtnCabinet');
    if (copyBtnCabinet) copyBtnCabinet.addEventListener('click', urgenceCopyOrderList);

    const savePointageBtn = document.getElementById('urgenceSavePointageBtn');
    if (savePointageBtn) savePointageBtn.addEventListener('click', urgenceSavePointage);

    const exportBtn = document.getElementById('urgenceExportStocksBtn');
    if (exportBtn) exportBtn.addEventListener('click', urgenceExportStocks);

    renderUrgenceStocks();
    renderUrgencePointage();
    renderUrgenceProtocols();

    if ('speechSynthesis' in window) {
        speechSynthesis.getVoices();
        speechSynthesis.onvoiceschanged = () => {};
    }
}

function refreshUrgenceView() {
    if (!urgenceData) loadUrgenceData();
    renderUrgenceStocks();
    renderUrgenceProtocols();
    urgenceTTSStop();
}

function urgenceExportStocks() {
    const rows = [
        ['Produit', 'Catégorie', 'Quantité', 'Unité', 'Seuil', 'Péremption', 'État'].join(';')
    ];
    urgenceData.products.forEach(p => {
        const state = urgenceStockState(p);
        const stateLabel = state === 'rupture' ? 'RUPTURE' : (state === 'bas' ? 'À commander' : 'OK');
        const exp = p.expiry ? new Date(p.expiry).toLocaleDateString('fr-FR') : '';
        rows.push([
            `"${p.name}"`, urgenceCategoryLabel(p.category), p.quantity, p.unit, p.minQuantity, exp, stateLabel
        ].join(';'));
    });
    const csv = rows.join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stocks_salle_urgence_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', initUrgenceModule);

window.urgenceShowAddProductModal = urgenceShowAddProductModal;
window.urgenceEditProduct = urgenceEditProduct;
window.urgenceDeleteProduct = urgenceDeleteProduct;
window.urgenceSaveProduct = urgenceSaveProduct;
window.urgenceCloseProductModal = urgenceCloseProductModal;
window.urgenceTTSPlay = urgenceTTSPlay;
window.urgenceTTSStop = urgenceTTSStop;
window.urgenceCopyOrderList = urgenceCopyOrderList;
window.refreshUrgenceView = refreshUrgenceView;
window.urgenceToggleProtocol = urgenceToggleProtocol;
