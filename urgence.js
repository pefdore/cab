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
        criteria: [
            { t: 'Douleur typique', d: 'Constrictive, rétrosternale, en étau, > 15–20 min, non calmée par le repos, irradiant vers bras gauche, mâchoire ou dos.' },
            { t: 'Signes associés', d: 'Sueurs, nausées/vomissements, dyspnée, anxiété, lipothymie.' },
            { t: 'Formes atypiques (femme, diabétique, sujet âgé)', d: 'Douleur épigastrique ou fausse dyspepsie, fatigue isolée, malaise — le doute impose l’ECG.' },
            { t: 'ECG (si disponible)', d: 'Sus-décalage ST ≥ 1 mm dans ≥ 2 dérivations contigués, ondes T pointues, bloc de branche nouveau, BAV ou FA récente.' }
        ],
        differential: 'Ne pas confondre avec : dissection aortique (douleur déchirante migratrice vers le dos, asymétrie des pouls ou de la TA aux deux bras → PAS de trinitrine), péricardite (douleur soulagée penché en avant, frottement), embolie pulmonaire (dyspnée prédominante, contexte thrombotique), douleur pariétale (reproduite à la palpation). Au doute : aspirine oui, trinitrine seulement si PAS ≥ 100 et pas de suspicion de dissection.',
        material: [
            'Aspirine 300 mg non entérosidé (à croquer)',
            'Trinitrine cp sublingual 0,15 mg',
            'Oxymètre de pouls (SpO2)',
            'Tensiomètre',
            'Scope / ECG 12 dérivations si disponible',
            'VVP + sérum physiologique',
            'Oxygène avec débitmètre',
            'Ordonnances du patient (traitements en cours)'
        ],
        steps: [
            { title: 'Appel', text: 'Appeler le 15 (SAMU) immédiatement et préciser « suspicion de SCA ». Ne jamais laisser le patient seul.' },
            { title: 'Position & repos', text: 'Patient au repos, position demi-assise. Déshabiller le torse pour le scope.' },
            { title: 'Monitor', text: 'Constantes : FC, TA, SpO2, FR toutes les 5 min. Poser le scope et rechercher des troubles du rythme.' },
            { title: 'Aspirine 300 mg', text: 'Aspirine 300 mg per os À CROQUER (effet plus rapide), sauf allergie, hémorragie active ou ulcère évolutif.' },
            { title: 'Trinitrine 0,15 mg', text: 'Trinitrine sublinguale 0,15 mg si douleur persistante et PAS ≥ 100 mmHg, renouvelable 1 fois après 5 min. Ne PAS donner si PAS < 100, IDM inférieur avec extension droite, ou inhibiteur de PDE5 dans les 48 h.' },
            { title: 'Oxygène', text: 'Oxygène seulement si SpO2 < 90 % : 2 à 4 L/min au masque.' },
            { title: 'VVP & surveillance', text: 'Poser une voie veineuse, surveiller en continu jusqu’au SAMU, transmettre ECG et constantes. Douleur rebelle + TA effondrée = choc cardiogénique : le signaler au 15.' }
        ]
    },
    {
        id: 'avc',
        title: 'AVC — Accident Vasculaire Cérébral',
        icon: '🧠',
        color: 'warning',
        intro: 'Déficit neurologique brutal : asymétrie du visage, faiblesse d’un bras, trouble de la parole. Règle FAST + heure de début exacte des symptômes = information capitale.',
        criteria: [
            { t: 'Déficit brutal (FAST)', d: 'Face : sourire asymétrique ? Bras : un bras qui tombe à l’élévation maintenue 10 s ? Parole : propos confus, aphasie ou dysarthrie ?' },
            { t: 'Autres signes focaux', d: 'Hémianopsie, amaurose monoculaire, ataxie cérébelleuse (marche ivre), hypoesthésie d’un hémicorps, vertige rotatoire inquiétant si associé à des signes du tronc.' },
            { t: 'Heure de début', d: 'Heure exacte d’apparition ou du « dernier examen normal » — critère clé pour la thrombolyse (< 4,5 h) et la thrombectomie (< 6 h).' },
            { t: 'Terrain', d: 'Âge, HTA, diabète, FA (cardioembolique), sténose carotidienne, anticoagulants.' }
        ],
        differential: 'Ne pas confondre avec : hypoglycémie (glycémie capillaire obligatoire, se corrige par G5 — mais un vrai AVC peut coexister), migraine avec aura (aura progressive sur 20–30 min, céphalées, déficit qui ondule), déficit post-critique de Todd (crise épileptique initiale), hémorragie cérébrale (céphalées brutales + HTA sévère). Règle : tout déficit neurologique brutal = AVC jusqu’à preuve du contraire.',
        material: [
            'Glucomètre + bandelettes',
            'Tensiomètre',
            'Oxymètre de pouls (SpO2)',
            'Ordonnances / pilulier du patient (anticoagulants !)',
            'Carte vitale et documents médicaux'
        ],
        steps: [
            { title: 'Heure de début', text: 'Noter l’heure exacte de début des symptômes (ou du dernier examen normal) : critère clé pour la thrombolyse.' },
            { title: 'Appel', text: 'Appeler le 15 immédiatement : « suspicion d’AVC » + heure de début, pour orientation vers une unité neurovasculaire (UNV).' },
            { title: 'Examen + constantes', text: 'FAST, FC, TA, SpO2, glycémie capillaire : corriger une hypoglycémie qui peut mimer un AVC. Ne pas traiter l’HTA sans consigne du 15.' },
            { title: 'Position', text: 'Patient allongé, tête surélevée à 30°. Rien par voie orale : risque de fausse route.' },
            { title: 'Anticoagulants', text: 'Relever le traitement (AVK/AOD, heure de la dernière prise, INR si connu) : capital pour la décision de thrombolyse, à transmettre au 15.' },
            { title: 'Ne pas faire', text: 'Ne PAS donner d’aspirine ni d’antihypertenseur en phase aiguë avant avis médical : hémorragie cérébrale non exclue.' },
            { title: 'Surveillance & documents', text: 'Constantes toutes les 5 min, conscience et respiration sous surveillance. Préparer traitements et dossier pour le SAMU.' }
        ]
    },
    {
        id: 'anaphylaxie',
        title: 'Choc anaphylactique',
        icon: '⚡',
        color: 'danger',
        intro: 'Réaction allergique brutale avec atteinte respiratoire et/ou hypotension. Urgence vitale absolue : adrénaline IM immédiate — la dose selon le poids est donnée par le calculateur en haut de page.',
        criteria: [
            { t: 'Terrain', d: 'Exposition récente : médicament, piqûre d’insecte, aliment, latex (dans les minutes ou l’heure).' },
            { t: 'Atteinte cutanéo-muqueuse', d: 'Urticaire généralisé, flush, œdème des lèvres ou de la langue, prurit palmo-plantaire, larmoiement.' },
            { t: 'Signes de gravité = adrénaline immédiate', d: 'Détresse respiratoire (dyspnée, sibilants, stridor, voix rauque = œdème laryngé), vomissements/diarrhée, tachycardie, hypotension, malaise ou syncope.' },
            { t: 'Grades (SFAR)', d: 'Grade 1 : cutané isolé (surveillance). Grade 2 : cutané + signes modérés. Grade 3 : détresse respiratoire. Grade 4 : arrêt cardiaque. Adrénaline IM dès le grade 2, sans attendre le choc installé.' }
        ],
        differential: 'Ne pas confondre avec : malaise vagal (bradycardie, pâleur, régression allongé, PAS d’urticaire ni de signe respiratoire), crise d’asthme isolée (pas d’urticaire ni de contexte allergique), œdème bradykinique sous IEC (œdème isolé SANS urticaire, réponse médiocre → 15). Au doute avec un vrai choc : l’adrénaline IM correctement dosée est peu dangereuse — ne pas retarder.',
        material: [
            'Adrénaline ampoule 1 mg/mL (1 mg/1 mL)',
            'Seringue 1 mL + aiguille IM 25G × 25 mm (adulte)',
            'Oxygène haut débit + masque',
            'VVP 18–20G + sérum physiologique 500 mL',
            'Antihistaminique + corticoïde (en relais seulement)',
            'Matériel de PLS / couverture'
        ],
        steps: [
            { title: 'Appel 15', text: 'Appeler le 15 (SAMU) immédiatement.' },
            { title: 'Arrêter l’exposition', text: 'Arrêter le médicament en cause. Piqûre sur un membre : garrot large ≈ 10 cm au-dessus de la piqûre, à desserrer 2 min toutes les 15 min. Ne pas aspirer ni inciser.' },
            { title: 'Adrénaline — dose selon le poids', text: 'ADULTE : 0,5 mg = 0,5 mL de solution à 1 mg/mL. ENFANT : 0,01 mg/kg, maximum 0,5 mg — dose exacte et volume à prélever dans le calculateur en haut de page. Renouveler toutes les 5 à 15 min si pas d’amélioration.' },
            { title: 'Où et comment piquer', text: 'Face ANTÉRO-LATÉRALE de la cuisse (muscle vaste externe), au milieu du tiers moyen entre hanche et genou. Aiguille perpendiculaire à la peau, enfoncer d’un coup sec jusqu’au muscle, ne PAS aspirer, injecter en 3–5 s puis retirer. Patient en surpoids : aiguille plus longue (35–40 mm) pour atteindre le muscle. Deuxième injection : cuisse controlatérale.' },
            { title: 'Position', text: 'Allongé, jambes surélevées si hypotension ; position demi-assise si gêne respiratoire ; PLS si perte de conscience ; massage cardiaque si arrêt cardiaque.' },
            { title: 'Oxygène & remplissage', text: 'Oxygène 6–8 L/min si disponible. Remplissage par sérum physiologique si choc : 500 mL adulte, 20 mL/kg enfant (calculateur en haut), à répéter selon la tension.' },
            { title: 'Surveillance', text: 'Réévaluer toutes les 5 min : conscience, respiration, TA. Bronchodilatateur si sibilants persistants. Hospitalisation 12 h systématique (réaction biphasique possible). Antihistaminique et corticoïde en RELAIS — jamais à la place de l’adrénaline.' }
        ]
    },
    {
        id: 'purpura',
        title: 'Purpura fulminans',
        icon: '🟣',
        color: 'danger',
        intro: 'Purpura fébrile évolutif = urgence infectieuse absolue. L’antibiotique est administré AVANT tout transfert, sans attendre le laboratoire — dose selon le poids dans le calculateur en haut de page.',
        criteria: [
            { t: 'Purpura typique', d: 'Pétéchies et/ou écchymoses diffuses, éléments NÉCROTIQUES « en carte de géographie » ou en étoile, NE S’EFFAÇANT PAS à la vitropression, extension rapide en 1–2 h.' },
            { t: 'Contexte infectieux', d: 'Fièvre ≥ 38,5 °C, frissons, myalgies, céphalées, vomissements, syndrome méningé possible.' },
            { t: 'Signes de choc', d: 'Marbrures, tachycardie, hypotension, cyanose, extrémités froides, oligurie, confusion ou agitation.' },
            { t: 'Terrain', d: 'Sujet jeune sain, asplénie, déficit en complément ou properdine, antécédent de purpura fulminans.' }
        ],
        differential: 'Ne pas confondre avec : purpura vasculaire simple (petites pétéchies non palpables du sujet âgé ou sous corticoïdes : SANS fièvre, SANS choc, non extensif), purpura thrombopénique (saignements muqueux, pas de nécrose ni de fièvre), purpura rhumatoïde/IgA de l’enfant (lésions déclives en bottes + arthralgies et douleurs abdominales, enfant apyrétique). RÈGLE D’OR : tout purpura fébrile, a fortiori nécrotique et extensif, = purpura fulminans jusqu’à preuve du contraire → antibiotique immédiat.',
        material: [
            'Ceftriaxone flacon 1 g + solvant',
            'Seringue 20 mL + aiguilles (IM si pas de VVP)',
            'VVP 18–20G + sérum physiologique 500 mL',
            'Tensiomètre, oxymètre',
            '1 flacon d’hémoculture aérobie si possible',
            'Oxygène'
        ],
        steps: [
            { title: 'Reconnaître', text: 'Vitropression négative + fièvre + extension rapide = diagnostic clinique immédiat, au cabinet, sans aucun examen complémentaire.' },
            { title: 'Appel 15 & position', text: 'Appeler le 15 en précisant « purpura fulminans ». Patient couché, interdiction absolue de se lever ou de marcher.' },
            { title: 'Ceftriaxone — dose selon le poids', text: '100 mg/kg en IV lente (3–5 min) ou IM, SANS dépasser 2 g par injection, dès la suspicion, AVANT tout transfert (dose exacte dans le calculateur en haut de page). Alternative : amoxicilline 100 mg/kg. Sans VVP : injection IM dans le vaste externe de la cuisse ou le deltoïde, aiguille perpendiculaire jusqu’au muscle.' },
            { title: 'Hémoculture', text: 'Si possible : UNE seule hémoculture aérobie prélevée avant ou en même temps que l’antibiotique, SANS jamais retarder l’antibiothérapie. Pas de ponction lombaire au cabinet.' },
            { title: 'Remplissage si choc', text: 'Sérum physiologique : 500 mL adulte, 20 mL/kg enfant (calculateur en haut), à répéter selon la TA jusqu’à régression des marbrures.' },
            { title: 'Surveillance', text: 'Constantes toutes les 5 min : TA, FC, FR, SpO2, conscience. Oxygène si SpO2 < 92 %. Jamais debout.' },
            { title: 'Transmettre', text: 'Heure de début des signes, heure de l’antibiotique, terrain (asplénie, vaccins), constantes → SAMU.' }
        ]
    },
    {
        id: 'acr',
        title: 'ACR — Arrêt CardioRespiratoire',
        icon: '💔',
        color: 'danger',
        intro: 'Inconscience + absence de ventilation normale = RCP immédiate. Ne pas chercher le pouls plus de 10 secondes. Chaque minute sans massage divise la survie par deux.',
        criteria: [
            { t: 'Inconscience', d: 'Patient ne répond pas, ne réagit à aucune stimulation (parole, secousse des épaules).' },
            { t: 'Absence de ventilation normale', d: 'Regarder la poitrine 10 secondes maximum : aucun mouvement respiratoire, ou gasps agoniques (respirations lentes, bruyantes, inefficaces = signe d’ACR, pas d’une respiration normale).' },
            { t: 'Pas de pouls (si formé)', d: 'Pouls carotidien absent — mais ne pas perdre de temps : inconscience + pas de ventilation normale = débuter la RCP sans chercher le pouls si doute.' }
        ],
        differential: 'Ne pas confondre avec : syncope (réveil spontané en position allongée, pouls présent, ventilation normale), coma hypoglycémique ou opiacé (ventilation présente même lente et bruyante), malaise vagal (bradycardie, pâleur, récupération rapide). Le gasp agonique = ACR : ne pas le prendre pour une respiration.',
        material: [
            'Plan dur / sol',
            'DAE (défibrillateur) — le chercher en même temps que la RCP',
            'Masque à oxygène + ballon de réanimation (BAVU)',
            'VVP ou voie intra-osseuse (trocart IO)',
            'Adrénaline ampoules 1 mg/mL',
            'Amiodarone 150 mg si disponible',
            'Couverture / protection du sol'
        ],
        steps: [
            { title: 'Sécuriser & alerter', text: 'Vérifier sécurité, secouer les épaules, crier. Si pas de réaction : appeler le 15 (ou faire appeler par un témoin) et envoyer chercher le DAE immédiatement.' },
            { title: 'Vérifier la ventilation', text: 'Basculer la tête en arrière, élever le menton, regarder la poitrine MAXIMUM 10 secondes. Pas de ventilation normale = commencer le massage.' },
            { title: 'Massage cardiaque', text: 'Au centre du thorax, talon de la main nues les deux mains superposées, bras tendus : comprimer VERTICALEMENT de 5 à 6 cm, 100 à 120 compressions par minute, laisser le thorax se réexpandre complètement entre chaque compression. Enfant : une main ou deux doigts selon la taille. Ne pas interrompre plus de 10 s.' },
            { title: 'Insufflations 30:2', text: 'Si seule : 30 compressions puis 2 insufflations (1 s chacune) avec bascule tête + pincement du nez, ou masque du BAVU. Si plusieurs sauveteurs formés ou DAE posé : RCP en continu sans insufflations tant que le DAE analyse.' },
            { title: 'DAE dès que disponible', text: 'Poitrine nue, électrodes comme indiqué sur les dessins, personne ne touche le patient pendant l’analyse. Si choc conseillé : choc puis reprise immédiate du massage. Si choc non conseillé : reprendre le massage immédiatement.' },
            { title: 'Identifier le rythme au DAE', text: 'Le DAE indique s’il conseille un choc : RYTHME CHOCABLE = fibrillation ventriculaire (FV) ou tachycardie ventriculaire (FVT) sans pouls. RYTHME NON CHOCABLE = asystolie ou activité électrique sans pouls (AESP). Le timing de l’adrénaline dépend de ce rythme — suivre la ligne correspondante ci-dessous.' },
            { title: 'SI NON CHOCABLE (asystolie / AESP) : adrénaline immédiate', text: 'Adrénaline 1 mg IV/IO (1 mL de solution 1 mg/mL) DÈS QUE LA VOIE EST POSÉE, puis toutes les 3 à 5 min, sans jamais interrompre le massage. ENFANT : 0,01 mg/kg, maximum 1 mg. PAS d’amiodarone dans les rythmes non chocables.' },
            { title: 'SI CHOCABLE (FV / FVT sans pouls) : RCP + chocs d’abord', text: 'Priorité aux chocs du DAE et à la RCP. PAS d’adrénaline avant le 3e choc. Après le 3e choc : adrénaline 1 mg IV/IO (puis toutes les 3 à 5 min) ET amiodarone 300 mg diluée dans 20 mL de G5 IV/IO (150 mg après le 5e choc). ENFANT : adrénaline 0,01 mg/kg (max 1 mg), amiodarone 5 mg/kg.' },
            { title: 'Continuer jusqu’à', text: 'Reprise d’une ventilation normale ou d’un mouvement, épuisement du sauveteur, ou prise en charge par le SAMU. Changer de masseur toutes les 2 min si possible.' }
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
                <div class="urgence-suggested" data-suggested="${proto.id}"></div>

                <div class="urgence-protocol-section">
                    <h5 class="urgence-section-title">🔍 Critères diagnostiques</h5>
                    <ul class="urgence-criteria">
                        ${proto.criteria.map(c => `
                            <li>
                                <strong>${urgenceEscapeHtml(c.t)}</strong>
                                <span>${urgenceEscapeHtml(c.d)}</span>
                            </li>`).join('')}
                    </ul>
                    ${proto.differential ? `<p class="urgence-differential"><strong>Ne pas confondre :</strong> ${urgenceEscapeHtml(proto.differential)}</p>` : ''}
                </div>

                <div class="urgence-protocol-section">
                    <h5 class="urgence-section-title">🪚 Matériel nécessaire</h5>
                    <ul class="urgence-material">
                        ${proto.material.map(m => `<li>${urgenceEscapeHtml(m)}</li>`).join('')}
                    </ul>
                </div>

                <div class="urgence-protocol-section">
                    <h5 class="urgence-section-title">📑 Conduite à tenir</h5>
                    <ol class="urgence-steps">
                        ${proto.steps.map((st, i) => `
                            <li class="urgence-step" data-proto="${proto.id}" data-step="${i}">
                                <span class="urgence-step-num">${i + 1}</span>
                                <div class="urgence-step-content">
                                    <strong>${urgenceEscapeHtml(st.title)}</strong>
                                    <p>${urgenceEscapeHtml(st.text)}</p>
                                </div>
                            </li>`).join('')}
                    </ol>
                </div>

                <div class="urgence-tts-controls">
                    ${proto.id === 'acr' ? `<button class="action-btn urgence-metro-btn" onclick="urgenceToggleMetronome()" data-metro-btn>🧨 Métronome massage : OFF</button>
                    <button class="action-btn urgence-adre-btn" onclick="urgenceToggleAdrePanel()" data-adre-btn>💉 Adrénaline : dose suivante</button>
                    <div class="urgence-adre-panel" data-adre-panel style="display:none;"></div>` : ''}
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


// ---------- Doses suggérées par protocole selon le poids ----------

function urgenceUpdateSuggestedDoses(w, isAdult) {
    const fmt = n => (Math.round(n * 100) / 100).toString().replace('.', ',');
    const adreIM = Math.min(0.5, 0.01 * w);
    const adreIV = isAdult ? 1 : Math.min(1, 0.01 * w);
    const cef = Math.min(2, 0.1 * w);
    const amio = isAdult ? 300 : 5 * w;

    const content = {
        sca: `<strong>Dose suggérée (${fmt(w)} kg)</strong> — Aspirine <strong>300 mg</strong> à croquer · Trinitrine <strong>0,15 mg</strong> sublinguale (si PAS ≥ 100)`,
        avc: `<strong>Aucun médicament à donner (${fmt(w)} kg)</strong> — pas d’aspirine ni d’antihypertenseur avant avis du 15. Glycémie capillaire obligatoire.`,
        anaphylaxie: `<strong>Dose suggérée (${fmt(w)} kg)</strong> — Adrénaline IM : <strong>${fmt(adreIM)} mg = ${fmt(adreIM)} mL</strong> (sol. 1 mg/mL, cuisse)`,
        purpura: `<strong>Dose suggérée (${fmt(w)} kg)</strong> — Ceftriaxone : <strong>${fmt(cef)} g = ${fmt(cef * 10)} mL</strong> (1 g/10 mL, IVL ou IM) · Remplissage si choc : <strong>${isAdult ? '500 mL' : fmt(w * 20) + ' mL'}</strong>`,
        acr: `<strong>Dose suggérée (${fmt(w)} kg) — selon le rythme :</strong> NON CHOCABLE (asystolie/AESP) : adrénaline <strong>${fmt(adreIV)} mg = ${fmt(adreIV)} mL</strong> IV/IO / 3–5 min, dès la voie posée · CHOCABLE (FV/FVT) : adrénaline <strong>${fmt(adreIV)} mg</strong> + amiodarone <strong>${fmt(amio)} mg</strong> seulement APRÈS le 3e choc`
    };

    document.querySelectorAll('.urgence-suggested').forEach(el => {
        const id = el.dataset.suggested;
        if (id && content[id]) el.innerHTML = content[id];
    });
}



// ---------- Suivi des doses d'adrénaline (ACR) ----------

let urgenceAdreState = {
    doses: [],       // { time: Date, context: 'asystolie' | 'choc3' }
    countdown: null, // setInterval
    countdownEnd: null
};

let urgenceTTSPrimed = false;
function urgencePrimeTTS() {
    if (urgenceTTSPrimed || !('speechSynthesis' in window)) return;
    urgenceTTSPrimed = true;
    try {
        speechSynthesis.getVoices();
        const warm = new SpeechSynthesisUtterance(' ');
        warm.volume = 0;
        speechSynthesis.speak(warm);
    } catch (e) {}
}

function urgenceToggleAdrePanel() {
    urgencePrimeTTS();
    const panel = document.querySelector('[data-adre-panel]');
    if (!panel) return;
    const open = panel.style.display === 'none' || panel.style.display === '';
    panel.style.display = open ? 'block' : 'none';
    const btn = document.querySelector('[data-adre-btn]');
    if (btn) btn.classList.toggle('open', open);
    if (open) urgenceRenderAdrePanel();
}

function urgenceRenderAdrePanel() {
    const panel = document.querySelector('[data-adre-panel]');
    if (!panel) return;
    const nb = urgenceAdreState.doses.length;
    const last = urgenceAdreState.doses[urgenceAdreState.doses.length - 1];

    let html = '';
    if (nb === 0) {
        html = '<p class="urgence-adre-hint">1<sup>re</sup> dose — dans quel contexte ?</p>';
    } else {
        html = '<p class="urgence-adre-hint">Dose suivante — rappel du contexte :</p>';
    }
    html += `
        <button class="action-btn urgence-adre-choice" onclick="urgenceRecordAdreDose('asystolie')">
            ⚡ Asystolie / AESP (non chocable)
        </button>
        <button class="action-btn urgence-adre-choice" onclick="urgenceRecordAdreDose('choc3')">
            🔋 3<sup>e</sup> choc non récupérateur (FV/FVT)
        </button>`;

    if (nb > 0) {
        const ctxTxt = last.context === 'asystolie' ? 'asystolie/AESP' : '3e choc non récupérateur';
        const heure = new Date(last.time).toLocaleTimeString('fr-FR');
        html += `
            <div class="urgence-adre-log">
                <strong>💉 Dose №${nb}</strong> passée à <strong>${heure}</strong> (${ctxTxt})`;
        if (urgenceAdreState.countdownEnd) {
            const remaining = Math.max(0, Math.ceil((urgenceAdreState.countdownEnd - Date.now()) / 1000));
            const m = Math.floor(remaining / 60);
            const sec = remaining % 60;
            html += remaining > 0
                ? ` · <span class="urgence-adre-countdown">⏱ prochaine dose possible dans <strong>${m}:${String(sec).padStart(2, '0')}</strong></span>`
                : ' · <span class="urgence-adre-countdown due">prochaine dose possible</span>';
        }
        const w = parseFloat(document.getElementById('urgenceWeightInput')?.value);
        if (w > 0) {
            const dose = w >= 30 ? 1 : Math.min(1, 0.01 * w);
            html += ` · dose : <strong>${dose.toString().replace('.', ',')} mg</strong>`;
        }
        html += '</div>';
    }

    panel.innerHTML = html;
}

function urgenceSpeakAdre(text) {
    if (!('speechSynthesis' in window)) return;
    try {
        // Message prioritaire : on interrompt la lecture en cours (protocole long)
        // pour ne pas manquer l'annonce de dose, puis on la relance apres.
        speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'fr-FR';
        utter.rate = 1;
        const voice = urgenceTTSVoice();
        if (voice) utter.voice = voice;
        speechSynthesis.speak(utter);
        // Filet de securite : certains navigateurs ignorent le 1er speak
        // si les voix ne sont pas encore chargees -> une seule reprise.
        setTimeout(() => {
            if (!speechSynthesis.speaking && !speechSynthesis.pending) {
                const retry = new SpeechSynthesisUtterance(text);
                retry.lang = 'fr-FR';
                const v = urgenceTTSVoice();
                if (v) retry.voice = v;
                speechSynthesis.speak(retry);
            }
        }, 300);
    } catch (e) {}
}

function urgenceRecordAdreDose(context) {
    const now = Date.now();
    urgenceAdreState.doses.push({ time: now, context });
    const nb = urgenceAdreState.doses.length;
    urgenceStartAdreCountdown(nb);
    urgenceRenderAdrePanel();
    const heure = new Date(now).toLocaleTimeString('fr-FR');
    urgenceSpeakAdre(`Dose ${nb} d'adrénaline enregistrée à ${heure}. Nouveau compte à rebours de 4 minutes.`);
}

function urgenceStartAdreCountdown(nb) {
    if (urgenceAdreState.countdown) clearInterval(urgenceAdreState.countdown);
    urgenceAdreState.countdownEnd = Date.now() + 4 * 60 * 1000;
    urgenceAdreState.countdown = setInterval(() => {
        if (Date.now() >= urgenceAdreState.countdownEnd) {
            clearInterval(urgenceAdreState.countdown);
            urgenceAdreState.countdown = null;
            urgenceRenderAdrePanel();
            urgenceSpeakAdre('4 minutes passées. Nouvelle dose d\u2019adrénaline possible.');
        } else {
            urgenceRenderAdrePanel();
        }
    }, 1000);
}

function urgenceResetAdreState() {
    if (urgenceAdreState.countdown) clearInterval(urgenceAdreState.countdown);
    urgenceAdreState = { doses: [], countdown: null, countdownEnd: null };
}

// ---------- Métronome de massage cardiaque (ACR, 110/min) ----------

let urgenceMetroTimer = null;
let urgenceMetroCtx = null;

function urgenceMetroBeep() {
    if (!urgenceMetroCtx) return;
    const ctx = urgenceMetroCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
}

function urgenceMetroVibrate() {
    if (navigator.vibrate) {
        try { navigator.vibrate(80); } catch (e) {}
    }
}

function urgenceToggleMetronome() {
    if (urgenceMetroTimer) {
        urgenceStopMetronome();
    } else {
        urgenceStartMetronome();
    }
}

function urgenceStartMetronome() {
    try {
        urgenceMetroCtx = urgenceMetroCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (urgenceMetroCtx.state === 'suspended') urgenceMetroCtx.resume();
    } catch (e) {
        if (typeof showToast === 'function') showToast('Audio non disponible sur cet appareil', 'error');
        return;
    }
    // 110 compressions par minute (centre de la fourchette 100-120/min)
    const intervalMs = 60000 / 110;
    urgenceMetroBeep();
    urgenceMetroVibrate();
    urgenceMetroTimer = setInterval(() => {
        urgenceMetroBeep();
        urgenceMetroVibrate();
    }, intervalMs);
    urgenceRefreshMetroButtons();
}

function urgenceStopMetronome() {
    if (urgenceMetroTimer) {
        clearInterval(urgenceMetroTimer);
        urgenceMetroTimer = null;
    }
    urgenceRefreshMetroButtons();
}

function urgenceRefreshMetroButtons() {
    const on = !!urgenceMetroTimer;
    document.querySelectorAll('[data-metro-btn]').forEach(btn => {
        btn.textContent = on ? '\u{1F9E8} M\u00E9tronome : ON (110/min) \u2014 cliquer pour arr\u00EAter' : '\u{1F9E8} M\u00E9tronome massage : OFF';
        btn.classList.toggle('metro-on', on);
    });
}

// ---------- Calculateur de doses selon le poids ----------

function urgenceComputeDoses() {
    const input = document.getElementById('urgenceWeightInput');
    const out = document.getElementById('urgenceDoseResults');
    if (!input || !out) return;

    const w = parseFloat(input.value);
    if (!w || w <= 0 || w > 250) {
        out.innerHTML = '<div class="urgence-alert info">Entrez un poids en kg pour obtenir les doses.</div>';
        document.querySelectorAll('.urgence-suggested').forEach(el => { el.innerHTML = ''; });
        return;
    }
    const isAdult = w >= 30;
    const fmt = n => (Math.round(n * 100) / 100).toString().replace('.', ',');

    let rows = '';
    if (isAdult) {
        const adreDose = Math.min(0.5, 0.01 * w);
        const cefDose = Math.min(2, 0.1 * w);
        const cefVol = cefDose / 0.1;
        rows = `
            <tr><td>Adrénaline IM (anaphylaxie)</td><td><strong>${fmt(adreDose)} mg</strong></td><td>${fmt(adreDose)} mL (sol. 1 mg/mL)</td><td>0,01 mg/kg, max 0,5 mg — renouvelable / 5–15 min</td></tr>
            <tr><td>Ceftriaxone IVL/IM (purpura)</td><td><strong>${fmt(cefDose)} g</strong></td><td>${fmt(cefVol)} mL (1 g / 10 mL)</td><td>100 mg/kg, max 2 g par injection, avant transfert</td></tr>
            <tr><td>Remplissage NaCl 0,9 % si choc</td><td><strong>500 mL</strong></td><td>1 poche 500 mL</td><td>500 mL chez l’adulte, à répéter selon la TA</td></tr>
            <tr><td>Aspirine (SCA)</td><td><strong>300 mg</strong></td><td>1 cp à croquer</td><td>Dose fixe adulte, sauf allergie/hémorragie</td></tr>
            <tr><td>Trinitrine (SCA, si PAS ≥ 100)</td><td><strong>0,15 mg</strong></td><td>1 cp sublingual</td><td>Renouvelable 1× après 5 min si douleur</td></tr>`;
    } else {
        const adreDose = Math.min(0.5, 0.01 * w);
        const cefDose = Math.min(2, 0.1 * w);
        const cefVol = cefDose / 0.1;
        const rempl = Math.round(w * 20 / 10) * 10;
        rows = `
            <tr><td>Adrénaline IM (anaphylaxie)</td><td><strong>${fmt(adreDose)} mg</strong></td><td>${fmt(adreDose)} mL (sol. 1 mg/mL)</td><td>0,01 mg/kg, max 0,5 mg — cuisse, aiguille 25G</td></tr>
            <tr><td>Ceftriaxone IVL/IM (purpura)</td><td><strong>${fmt(cefDose)} g</strong></td><td>${fmt(cefVol)} mL (1 g / 10 mL)</td><td>100 mg/kg, max 2 g, avant transfert</td></tr>
            <tr><td>Remplissage NaCl 0,9 % si choc</td><td><strong>${rempl} mL</strong></td><td>${Math.max(1, Math.round(rempl / 100))} poche(s) 100 mL</td><td>20 mL/kg, à répéter selon la TA</td></tr>`;
    }

    urgenceUpdateSuggestedDoses(w, isAdult);
    out.innerHTML = `
        <div class="urgence-alert ${isAdult ? 'info' : 'warning'}">
            ${isAdult ? 'Poids adulte (≥ 30 kg)' : 'Poids pédiatrique (< 30 kg) : vérifier les doses de l’enfant avec le 15.'}
        </div>
        <div class="inventory-table">
            <table>
                <thead>
                    <tr><th>Médicament</th><th>Dose</th><th>Prélever</th><th>Règle</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

// ---------- TTS (synthèse vocale) ----------

function urgenceTTSVoice() {
    const voices = speechSynthesis.getVoices();
    return voices.find(v => v.lang === 'fr-FR') || voices.find(v => v.lang && v.lang.startsWith('fr')) || null;
}

function urgenceTTSPlay(protoId) {
    urgencePrimeTTS();
    const proto = URGENCE_PROTOCOLS.find(p => p.id === protoId);
    if (!proto || !('speechSynthesis' in window)) {
        if (typeof showToast === 'function') showToast('Synthèse vocale non disponible sur cet appareil', 'error');
        return;
    }

    urgenceTTSStop();

    const critText = (proto.criteria || []).map(c => ` ${c.t} : ${c.d}`).join(' . ');
    const fullText = proto.id === 'acr'
        ? `Protocole : ${proto.title.replace('—', '-')} . Conduite à tenir immédiatement. ` +
            proto.steps.map((s, i) => ` Étape ${i + 1} : ${s.title} . ${s.text}`).join(' ') +
            ' Fin du protocole.'
        : `Protocole : ${proto.title.replace('—', '-')} . ${proto.intro} ` +
            (critText ? ` Critères diagnostiques . ${critText} .` : '') +
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

    const weightInput = document.getElementById('urgenceWeightInput');
    if (weightInput) weightInput.addEventListener('input', urgenceComputeDoses);
    urgenceComputeDoses();
    document.getElementById('urgenceProtocolsGrid')?.addEventListener('change', () => urgenceComputeDoses());

    const exportBtn = document.getElementById('urgenceExportStocksBtn');
    if (exportBtn) exportBtn.addEventListener('click', urgenceExportStocks);

    renderUrgenceStocks();
    renderUrgencePointage();
    renderUrgenceProtocols();
    urgenceRefreshMetroButtons();

    if ('speechSynthesis' in window) {
        speechSynthesis.getVoices();
        speechSynthesis.onvoiceschanged = () => {};
    }
}

function refreshUrgenceView() {
    urgenceResetAdreState();
    urgenceStopMetronome();
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
window.urgenceComputeDoses = urgenceComputeDoses;
window.urgenceToggleMetronome = urgenceToggleMetronome;
window.urgenceToggleAdrePanel = urgenceToggleAdrePanel;
window.urgenceRecordAdreDose = urgenceRecordAdreDose;
