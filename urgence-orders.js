// ============================================
// MODULE SALLE D'URGENCE — Commandes, Réception, Coûts
// Dépend de urgence.js (urgenceData, saveUrgenceData, helpers)
// ============================================

console.log('[URGENCE-ORDERS] Module commandes chargé');

// ---------- Modèle de données ----------
// urgenceData.orders = [{
//   id, createdAt, status: 'pending' | 'received' | 'cancelled',
//   items: [{ productId, name, unit, qty, unitPrice }],
//   receivedAt, receivedBy, realCost (total TTC reel saisi a la reception)
// }]

function urgenceOrdersData() {
    if (!urgenceData.orders) urgenceData.orders = [];
    if (!urgenceData.costs) urgenceData.costs = {};
    return urgenceData;
}

function urgenceOrderTotal(o) {
    return urgenceOrderEstimatedTotal(o)
        + (Number(o.shipping) || 0)
        - (Number(o.discount) || 0);
}

function urgenceOrderText(o) {
    const lines = o.items.map(i => `- ${i.name} : ${i.qty} ${i.unit}` + (i.unitPrice ? ` (≈ ${urgenceFmtEur(i.qty * i.unitPrice)})` : ''));
    const extras = [];
    if (o.shipping) extras.push(`Frais de port : ${urgenceFmtEur(o.shipping)}`);
    if (o.discount) extras.push(`Remise : -${urgenceFmtEur(o.discount)}`);
    let text = `Commande${o.supplier ? ` pour ${o.supplier}` : ''} (${new Date(o.createdAt).toLocaleDateString('fr-FR')}) :\n` + lines.join('\n');
    if (extras.length) text += '\n' + extras.join('\n');
    text += `\nTotal TTC estimé : ${urgenceFmtEur(urgenceOrderTotal(o))}`;
    return text;
}

function urgenceFmtEur(n) {
    const v = Number(n) || 0;
    return v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function urgenceProductUnitPrice(p) {
    if (p.unitPrice !== undefined && p.unitPrice !== null && p.unitPrice !== '') return Number(p.unitPrice) || 0;
    return 0;
}

// ---------- Génération de commande depuis les besoins ----------

function urgenceSuggestedQty(p) {
    // quantite a commander pour revenir a 2x le seuil (minimum 1)
    const target = Math.max((p.minQuantity || 1) * 2, p.minQuantity + 1);
    const qty = target - (p.quantity || 0);
    return qty > 0 ? qty : 0;
}

// Genere un bon de commande par fournisseur a partir du manquant (apres pointage ou bouton Commander le manquant)
function urgenceBuildOrderFromNeeds() {
    urgenceOrdersData();
    const needs = urgenceData.products.filter(p => p.quantity <= p.minQuantity);
    if (needs.length === 0) {
        if (typeof showToast === 'function') showToast('Rien à commander : tous les stocks sont au-dessus des seuils ✅');
        return;
    }

    const groups = new Map();
    needs.forEach(p => {
        const key = (p.supplier || '').trim() || 'Sans fournisseur';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
    });

    let ordersCount = 0;
    let itemsCount = 0;
    groups.forEach((prods, supplier) => {
        const items = prods.map(p => ({
            productId: p.id,
            name: p.name,
            unit: p.unit,
            qty: urgenceSuggestedQty(p),
            unitPrice: urgenceProductUnitPrice(p)
        })).filter(i => i.qty > 0);
        if (items.length === 0) return;
        const named = supplier !== 'Sans fournisseur';
        const email = named && typeof urgenceSupplierEmail === 'function' ? urgenceSupplierEmail(supplier) : '';
        urgenceData.orders.unshift({
            id: 'cmd' + Date.now() + Math.random().toString(36).slice(2, 5),
            createdAt: new Date().toISOString(),
            status: 'pending',
            items,
            supplier: named ? supplier : '',
            supplierEmail: email,
            shipping: 0,
            discount: 0
        });
        ordersCount++;
        itemsCount += items.length;
    });

    if (ordersCount === 0) {
        if (typeof showToast === 'function') showToast('Aucune quantité à commander', 'error');
        return;
    }

    saveUrgenceData();
    urgenceRenderOrders();
    if (typeof showToast === 'function') showToast(`${ordersCount} bon(s) de commande créé(s) — ${itemsCount} référence(s), groupés par fournisseur`);
    document.querySelector('#cabinet-stocks .sub-tab[data-subtab="urgence-orders"]')?.click();
}

// Commande libre, hors pointage : on ajoute ensuite les references a la main
function urgenceCreateBlankOrder() {
    urgenceOrdersData();
    urgenceData.orders.unshift({
        id: 'cmd' + Date.now() + Math.random().toString(36).slice(2, 5),
        createdAt: new Date().toISOString(),
        status: 'pending',
        items: [],
        supplier: '',
        supplierEmail: '',
        shipping: 0,
        discount: 0
    });
    saveUrgenceData();
    urgenceRenderOrders();
    if (typeof showToast === 'function') showToast('Commande vierge créée — ajoutez les références et le fournisseur');
    const sel = document.querySelector('.urgence-order-add-select');
    if (sel) sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function urgenceOrderEstimatedTotal(order) {
    return order.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0);
}

function urgenceCopyOrder(orderId) {
    const order = urgenceData.orders.find(o => o.id === orderId);
    if (!order) return;
    const text = urgenceOrderText(order);
    navigator.clipboard.writeText(text).then(() => {
        if (typeof showToast === 'function') showToast('Bon de commande copié dans le presse-papiers');
    }).catch(() => alert(text));
}

// Envoi direct par mail si l'adresse du fournisseur est connue
function urgenceSendOrder(orderId) {
    const order = urgenceData.orders.find(o => o.id === orderId);
    if (!order) return;
    const email = (order.supplierEmail || (typeof urgenceSupplierEmail === 'function' ? urgenceSupplierEmail(order.supplier) : '') || '').trim();
    if (!email) {
        if (typeof showToast === 'function') showToast("Pas d'email enregistré pour ce fournisseur — utilisez « Copier » ou renseignez l'email dans la fiche produit", 'error');
        return;
    }
    const subject = encodeURIComponent(`Commande ${order.supplier || ''} — ${new Date(order.createdAt).toLocaleDateString('fr-FR')}`);
    const body = encodeURIComponent(urgenceOrderText(order) + '\n\n--\nEnvoyé depuis la gestion des stocks du cabinet');
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
}

function urgenceMarkOrdered(orderId) {
    const order = urgenceData.orders.find(o => o.id === orderId);
    if (!order || order.status !== 'pending') return;

    const existing = document.getElementById('urgenceOrderedModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'urgenceOrderedModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-card urgence-modal-content">
            <div class="modal-header">
                <h3>Commande passée</h3>
                <button type="button" class="modal-close" onclick="urgenceCloseOrderedModal()" aria-label="Fermer">✕</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Fournisseur (facultatif)</label>
                    <input type="text" id="urgenceOrderSupplier" class="form-input" list="urgenceOrderSupplierDatalist" value="${order.supplier ? urgenceEscapeHtml(order.supplier) : ''}" placeholder="Ex : Cooper, Phocépharma…">
                </div>
                <div class="form-group">
                    <label>Email du fournisseur (facultatif)</label>
                    <input type="email" id="urgenceOrderSupplierEmail" class="form-input" value="${order.supplierEmail ? urgenceEscapeHtml(order.supplierEmail) : ''}" placeholder="commandes@fournisseur.fr">
                </div>
                <p class="form-hint">La commande passera en « Commandée — en attente de livraison ». Vous pourrez réceptionner chaque référence séparément, quand elle arrive.</p>
            </div>
            <div class="modal-footer">
                <button class="action-btn" onclick="urgenceCloseOrderedModal()">Annuler</button>
                <button class="action-btn primary" onclick="urgenceConfirmOrdered('${orderId}')">Marquer commandée</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) urgenceCloseOrderedModal();
    });
    setTimeout(() => document.getElementById('urgenceOrderSupplier')?.focus(), 50);
}

function urgenceCloseOrderedModal() {
    document.getElementById('urgenceOrderedModal')?.remove();
}

function urgenceConfirmOrdered(orderId) {
    const order = urgenceData.orders.find(o => o.id === orderId);
    if (!order || order.status !== 'pending') return;
    if (!order.items || order.items.length === 0) {
        if (typeof showToast === 'function') showToast('Commande vide : ajoutez au moins une référence avant de la marquer commandée', 'error');
        return;
    }
    const supplierInput = document.getElementById('urgenceOrderSupplier');
    const supplierEmailInput = document.getElementById('urgenceOrderSupplierEmail');
    order.supplier = supplierInput ? supplierInput.value.trim() : '';
    order.supplierEmail = supplierEmailInput ? supplierEmailInput.value.trim() : '';
    if (typeof urgenceRememberSupplier === 'function') urgenceRememberSupplier(order.supplier, order.supplierEmail);
    order.status = 'ordered';
    order.orderedAt = new Date().toISOString();
    if (!order.receptions) order.receptions = [];
    saveUrgenceData();
    urgenceCloseOrderedModal();
    urgenceRenderOrders();
    if (typeof showToast === 'function') showToast(order.supplier ? `Commande passée à ${order.supplier}` : 'Commande marquée commandée');
}

function urgenceItemReceivedQty(order, item) {
    let total = 0;
    (order.receptions || []).forEach(r => {
        const line = r.items.find(x => x.productId === item.productId);
        if (line) total += line.qty;
    });
    return total;
}

function urgenceOrderRemainingItems(order) {
    return order.items.filter(i => urgenceItemReceivedQty(order, i) < i.qty);
}

function urgenceReceiveOrder(orderId) {
    const order = urgenceData.orders.find(o => o.id === orderId);
    if (!order || (order.status !== 'ordered' && order.status !== 'pending')) return;

    const existing = document.getElementById('urgenceReceiveModal');
    if (existing) existing.remove();

    const remaining = urgenceOrderRemainingItems(order);
    const rows = remaining.map(i => {
        const already = urgenceItemReceivedQty(order, i);
        const rest = i.qty - already;
        return `
        <div class="urgence-receive-row">
            <div class="urgence-receive-name">
                <strong>${urgenceEscapeHtml(i.name)}</strong>
                <span class="urgence-pointage-sub">commandé : ${i.qty} ${urgenceEscapeHtml(i.unit)} · déjà reçu : ${already} · prix unitaire : ${i.unitPrice ? urgenceFmtEur(i.unitPrice) : '—'}</span>
            </div>
            <div class="urgence-receive-line">
                <div class="urgence-pointage-input">
                    <label class="urgence-receive-check">
                        <input type="checkbox" class="urgence-receive-ok" data-pid="${i.productId}" checked>
                        Arrivé
                    </label>
                    <input type="number" min="0" max="${rest}" class="form-input urgence-receive-qty" data-pid="${i.productId}" value="${rest}">
                    <span class="urgence-pointage-unit">${urgenceEscapeHtml(i.unit)}</span>
                </div>
                <label class="urgence-receive-price-label">€/unité facturé
                    <input type="number" min="0" step="0.01" class="form-input urgence-receive-price" data-pid="${i.productId}" value="${i.unitPrice || ''}" placeholder="prix facture">
                </label>
                <span class="urgence-receive-line-total" data-linetotal="${i.productId}">${i.unitPrice ? urgenceFmtEur(rest * i.unitPrice) : '—'}</span>
            </div>
            <div class="urgence-receive-expiry-row">
                <label>📅 Péremption</label>
                <input type="date" class="form-input urgence-receive-expiry" data-pid="${i.productId}" title="Date de péremption du lot reçu (facultatif)">
            </div>
        </div>`;
    }).join('');

    const estRemaining = remaining.reduce((s, i) => s + (i.qty - urgenceItemReceivedQty(order, i)) * (i.unitPrice || 0), 0);

    const modal = document.createElement('div');
    modal.id = 'urgenceReceiveModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-card urgence-modal-content">
            <div class="modal-header">
                <h3>Réception — valider chaque référence</h3>
                <button type="button" class="modal-close" onclick="urgenceCloseReceiveModal()" aria-label="Fermer">✕</button>
            </div>
            <div class="modal-body">
                <p class="form-hint">Avec la facture sous les yeux : cochez « Arrivé », ajustez la quantité reçue et le <strong>prix unitaire facturé</strong> de chaque référence. Les références non cochées resteront « en attente de livraison ».</p>
                ${rows}
                <div class="urgence-receive-totals">
                    <div class="form-group">
                        <label>Total TTC de la facture (€)</label>
                        <input type="number" min="0" step="0.01" id="urgenceReceiveCost" class="form-input" value="${estRemaining ? estRemaining.toFixed(2) : ''}" placeholder="Ex : 45.90">
                    </div>
                    <div class="urgence-receive-sum">
                        <span class="urgence-receive-sum-label">Somme des lignes</span>
                        <strong id="urgenceReceiveLinesSum">—</strong>
                        <span id="urgenceReceiveSumCheck" class="stock-chip neutral">à vérifier</span>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="action-btn" onclick="urgenceCloseReceiveModal()">Annuler</button>
                <button class="action-btn primary" onclick="urgenceConfirmReceive('${orderId}')">Valider la réception</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) urgenceCloseReceiveModal();
    });
    const updateLinesSum = () => {
        let sum = 0;
        modal.querySelectorAll('.urgence-receive-ok').forEach(chk => {
            if (!chk.checked) return;
            const pid = chk.dataset.pid;
            const qty = parseInt(modal.querySelector(`.urgence-receive-qty[data-pid="${pid}"]`)?.value, 10) || 0;
            const price = parseFloat(modal.querySelector(`.urgence-receive-price[data-pid="${pid}"]`)?.value);
            const lineTotal = modal.querySelector(`[data-linetotal="${pid}"]`);
            if (lineTotal) lineTotal.textContent = (!isNaN(price) && price > 0) ? urgenceFmtEur(qty * price) : '—';
            if (!isNaN(price) && price > 0) sum += qty * price;
        });
        const sumEl = document.getElementById('urgenceReceiveLinesSum');
        const checkEl = document.getElementById('urgenceReceiveSumCheck');
        if (sumEl) sumEl.textContent = sum > 0 ? urgenceFmtEur(sum) : '—';
        if (checkEl) {
            const cost = parseFloat(document.getElementById('urgenceReceiveCost')?.value);
            if (sum <= 0 || isNaN(cost)) {
                checkEl.textContent = 'à vérifier';
                checkEl.className = 'stock-chip neutral';
            } else if (Math.abs(cost - sum) < 0.005) {
                checkEl.textContent = '✓ = facture';
                checkEl.className = 'stock-chip success';
            } else {
                checkEl.textContent = `${cost > sum ? '+' : ''}${urgenceFmtEur(cost - sum)} d'écart`;
                checkEl.className = 'stock-chip warning';
            }
        }
    };

    modal.querySelectorAll('.urgence-receive-ok').forEach(chk => {
        chk.addEventListener('change', () => {
            const pid = chk.dataset.pid;
            const qty = modal.querySelector(`.urgence-receive-qty[data-pid="${pid}"]`);
            if (qty) qty.disabled = !chk.checked;
            updateLinesSum();
        });
    });
    modal.querySelectorAll('.urgence-receive-qty, .urgence-receive-price').forEach(input => {
        input.addEventListener('input', updateLinesSum);
    });
    document.getElementById('urgenceReceiveCost')?.addEventListener('input', updateLinesSum);
    updateLinesSum();
}

function urgenceCloseReceiveModal() {
    document.getElementById('urgenceReceiveModal')?.remove();
}

function urgenceConfirmReceive(orderId) {
    const order = urgenceData.orders.find(o => o.id === orderId);
    if (!order || (order.status !== 'ordered' && order.status !== 'pending')) return;

    const checkboxes = document.querySelectorAll('.urgence-receive-ok');
    const receivedItems = [];
    checkboxes.forEach(chk => {
        if (!chk.checked) return;
        const pid = chk.dataset.pid;
        const qtyInput = document.querySelector(`.urgence-receive-qty[data-pid="${pid}"]`);
        const qty = parseInt(qtyInput?.value, 10);
        if (isNaN(qty) || qty <= 0) return;
        const item = order.items.find(i => i.productId === pid);
        if (!item) return;
        const already = urgenceItemReceivedQty(order, item);
        const priceInput = document.querySelector(`.urgence-receive-price[data-pid="${pid}"]`);
        const unitPrice = parseFloat(priceInput?.value);
        receivedItems.push({
            productId: pid,
            name: item.name,
            unit: item.unit,
            qty: Math.min(qty, item.qty - already),
            unitPrice: (!isNaN(unitPrice) && unitPrice > 0) ? unitPrice : 0
        });
    });

    const costInput = document.getElementById('urgenceReceiveCost');
    const realCost = costInput ? (parseFloat(costInput.value) || 0) : 0;

    if (receivedItems.length === 0) {
        if (typeof showToast === 'function') showToast('Aucune référence cochée « Arrivé » — rien à réceptionner', 'error');
        return;
    }

    if (!order.receptions) order.receptions = [];
    order.receptions.push({
        date: new Date().toISOString(),
        items: receivedItems,
        cost: realCost,
        by: (typeof currentUser !== 'undefined' && currentUser?.email) ? currentUser.email : 'secrétariat'
    });

    let updatedQty = 0;
    receivedItems.forEach(r => {
        const product = urgenceData.products.find(p => p.id === r.productId);
        if (product) {
            const expiryInput = document.querySelector(`.urgence-receive-expiry[data-pid="${r.productId}"]`);
            const expiry = expiryInput?.value || null;
            if (typeof urgenceAddStockQty === 'function') urgenceAddStockQty(product, r.qty, expiry);
            else product.quantity = (product.quantity || 0) + r.qty;
            updatedQty += r.qty;
        }
    });

    if (realCost > 0) urgenceSpreadReceptionCost(order, order.receptions[order.receptions.length - 1]);

    const fullyReceived = urgenceOrderRemainingItems(order).length === 0;
    if (fullyReceived) {
        order.status = 'received';
        order.receivedAt = new Date().toISOString();
        order.realCost = order.receptions.reduce((s, r) => s + (r.cost || 0), 0);
    } else {
        order.status = 'ordered';
    }

    saveUrgenceData();
    urgenceCloseReceiveModal();
    renderUrgenceStocks();
    renderUrgencePointage();
    urgenceRenderOrders();
    urgenceRenderCosts();

    const remainingCount = urgenceOrderRemainingItems(order).length;
    const msg = fullyReceived
        ? `Réception complète : ${receivedItems.length} référence(s), ${updatedQty} unité(s) ajoutées au stock.` + (realCost ? ` Coût : ${urgenceFmtEur(realCost)}` : '')
        : `Réception partielle enregistrée : ${receivedItems.length} référence(s) reçue(s). ${remainingCount} reste(nt) en attente de livraison.`;
    if (typeof showToast === 'function') showToast(msg);
    else alert(msg);
}

// Répartit le cout TTC d'une réception sur les produits reçus (au prorata du prix estime)
// et met a jour le prix unitaire de chaque reference.
function urgenceSpreadReceptionCost(order, reception) {
    const est = reception.items.reduce((s, i) => {
        const item = order.items.find(x => x.productId === i.productId);
        return s + i.qty * (item?.unitPrice || 0);
    }, 0);
    reception.items.forEach(i => {
        const product = urgenceData.products.find(p => p.id === i.productId);
        if (!product) return;
        const item = order.items.find(x => x.productId === i.productId);
        let unitCost;
        if (Number(i.unitPrice) > 0) {
            // Prix unitaire facture saisi a la reception : la donnee la plus fiable
            unitCost = Number(i.unitPrice);
        } else if (est > 0 && item?.unitPrice > 0) {
            const share = (i.qty * item.unitPrice) / est;
            unitCost = reception.cost * share / Math.max(i.qty, 1);
        } else if (i.qty) {
            unitCost = reception.cost / i.qty;
        } else {
            return;
        }
        product.unitPrice = Math.round((unitCost + Number.EPSILON) * 100) / 100;
        // Historique des prix : base du benchmark interne par fournisseur
        if (!Array.isArray(product.priceHistory)) product.priceHistory = [];
        product.priceHistory.push({
            date: reception.date,
            supplier: order.supplier || '',
            unitPrice: product.unitPrice
        });
        if (product.priceHistory.length > 30) product.priceHistory = product.priceHistory.slice(-30);
    });
}

function urgenceCancelOrder(orderId) {
    const order = urgenceData.orders.find(o => o.id === orderId);
    if (!order || (order.status !== 'pending' && order.status !== 'ordered')) return;
    const receivedNote = (order.receptions || []).length > 0 ? '\nDes références ont déjà été réceptionnées : le stock déjà reçu sera conservé.' : '';
    if (!confirm('Annuler cette commande ?' + receivedNote)) return;
    order.status = 'cancelled';
    order.receivedAt = new Date().toISOString();
    saveUrgenceData();
    urgenceRenderOrders();
    if (typeof showToast === 'function') showToast('Commande annulée');
}

// ---------- Gestion des fournisseurs ----------

function urgenceRenderSuppliers() {
    urgenceOrdersData();
    const wrap = document.getElementById('urgenceSuppliersPanel');
    if (!wrap) return;

    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const list = (typeof urgenceKnownSuppliers === 'function' ? urgenceKnownSuppliers() : []).slice();

    if (list.length === 0) {
        wrap.innerHTML = '<p class="urgence-empty">Aucun fournisseur enregistré. Ajoutez-en un, ou renseignez le fournisseur habituel dans une fiche produit.</p>';
        return;
    }

    wrap.innerHTML = list.map(s => {
        const orders = urgenceData.orders.filter(o => (o.supplier || '') === s.name);
        const yearOrders = orders.filter(o => new Date(o.receivedAt || o.orderedAt || o.createdAt) >= yearStart);
        const spent = orders.filter(o => o.status === 'received').reduce((sum, o) => sum + (Number(o.realCost) || 0), 0);
        const yearSpent = yearOrders.filter(o => o.status === 'received').reduce((sum, o) => sum + (Number(o.realCost) || 0), 0);
        const refs = urgenceData.products.filter(p => (p.supplier || '') === s.name);
        const lastOrder = orders.length
            ? new Date(Math.max(...orders.map(o => new Date(o.receivedAt || o.orderedAt || o.createdAt).getTime()))).toLocaleDateString('fr-FR')
            : null;
        return `
            <div class="stock-supplier-card">
                <div class="stock-card-top">
                    <strong class="stock-supplier-name">${urgenceEscapeHtml(s.name)}</strong>
                    <span class="stock-card-actions">
                        <button class="stock-icon-btn" onclick="urgenceShowSupplierModal('${urgenceEscapeHtml(s.name)}')" title="Modifier" aria-label="Modifier">✏️</button>
                        <button class="stock-icon-btn" onclick="urgenceDeleteSupplier('${urgenceEscapeHtml(s.name)}')" title="Supprimer" aria-label="Supprimer">🗑️</button>
                    </span>
                </div>
                ${s.email ? `<div class="stock-supplier-email">✉ ${urgenceEscapeHtml(s.email)}</div>` : '<div class="stock-supplier-email muted">Pas d\u2019email enregistré</div>'}
                <div class="stock-supplier-meta">
                    <span>${yearOrders.length} commande(s) cette année</span>
                    <span>· ${urgenceFmtEur(yearSpent)} payés cette année</span>
                    ${spent !== yearSpent ? `<span>· ${urgenceFmtEur(spent)} au total</span>` : ''}
                </div>
                <div class="stock-supplier-meta">
                    <span>${refs.length} référence(s) attachée(s)</span>
                    ${lastOrder ? `<span>· dernier échange : ${lastOrder}</span>` : ''}
                </div>
            </div>`;
    }).join('');
}

function urgenceShowSupplierModal(name) {
    const existing = document.getElementById('urgenceSupplierModal');
    if (existing) existing.remove();

    const s = name ? urgenceKnownSuppliers().find(x => x.name === name) : null;

    const modal = document.createElement('div');
    modal.id = 'urgenceSupplierModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-card urgence-modal-content">
            <div class="modal-header">
                <h3>${s ? 'Modifier le fournisseur' : 'Ajouter un fournisseur'}</h3>
                <button type="button" class="modal-close" onclick="urgenceCloseSupplierModal()" aria-label="Fermer">✕</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Nom du fournisseur *</label>
                    <input type="text" id="urgenceSupplierName" class="form-input" value="${s ? urgenceEscapeHtml(s.name) : ''}" placeholder="Ex : Cooper">
                </div>
                <div class="form-group">
                    <label>Email (pour l'envoi direct des bons de commande)</label>
                    <input type="email" id="urgenceSupplierEmail" class="form-input" value="${s && s.email ? urgenceEscapeHtml(s.email) : ''}" placeholder="commandes@fournisseur.fr">
                </div>
            </div>
            <div class="modal-footer">
                <button class="action-btn" onclick="urgenceCloseSupplierModal()">Annuler</button>
                <button class="action-btn primary" onclick="urgenceSaveSupplier(${s ? `'${urgenceEscapeHtml(s.name)}'` : 'null'})">${s ? 'Enregistrer' : 'Ajouter'}</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) urgenceCloseSupplierModal();
    });
    setTimeout(() => document.getElementById('urgenceSupplierName')?.focus(), 50);
}

function urgenceCloseSupplierModal() {
    document.getElementById('urgenceSupplierModal')?.remove();
}

function urgenceSaveSupplier(originalName) {
    const name = document.getElementById('urgenceSupplierName')?.value?.trim();
    const email = document.getElementById('urgenceSupplierEmail')?.value?.trim() || '';
    if (!name) {
        if (typeof showToast === 'function') showToast('Le nom du fournisseur est obligatoire', 'error');
        return;
    }
    const list = urgenceKnownSuppliers();
    let s = originalName ? list.find(x => x.name === originalName) : list.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (s) {
        const renamed = originalName && s.name !== name;
        s.name = name;
        s.email = email;
        if (renamed) {
            urgenceData.products.forEach(p => { if (p.supplier === originalName) p.supplier = name; });
            urgenceData.orders.forEach(o => { if (o.supplier === originalName) o.supplier = name; });
        }
    } else {
        list.push({ name, email });
    }
    saveUrgenceData();
    urgenceCloseSupplierModal();
    urgenceRenderSuppliers();
    urgenceRenderCosts();
    if (typeof showToast === 'function') showToast(originalName ? 'Fournisseur modifié' : 'Fournisseur ajouté');
}

function urgenceDeleteSupplier(name) {
    const refs = urgenceData.products.filter(p => p.supplier === name).length;
    if (!confirm(`Supprimer « ${name} » de la liste des fournisseurs ?` + (refs ? `\n\n${refs} référence(s) y restent rattachée(s) : vous pourrez les réaffecter dans leur fiche produit.` : ''))) return;
    urgenceData.suppliers = urgenceKnownSuppliers().filter(s => s.name !== name);
    saveUrgenceData();
    urgenceRenderSuppliers();
    if (typeof showToast === 'function') showToast('Fournisseur supprimé');
}

// ---------- Rendu : Commandes ----------

function urgenceRenderOrders() {
    urgenceOrdersData();
    const pendingEl = document.getElementById('urgenceOrdersPending');
    if (pendingEl) {
        const pending = urgenceData.orders.filter(o => o.status === 'pending');
        pendingEl.innerHTML = pending.length === 0
            ? '<p class="urgence-empty">Aucune commande en attente. Générez-en une depuis le pointage ou le bouton « Créer la commande à passer ».</p>'
            : pending.map(o => urgenceOrderEditCardHtml(o)).join('');
    }

    const orderedEl = document.getElementById('urgenceOrdersOrdered');
    if (orderedEl) {
        const ordered = urgenceData.orders.filter(o => o.status === 'ordered');
        orderedEl.innerHTML = ordered.length === 0
            ? '<p class="urgence-empty">Aucune commande en attente de livraison.</p>'
            : ordered.map(o => urgenceOrderOrderedCardHtml(o)).join('');
    }

    const histEl = document.getElementById('urgenceOrdersHistory');
    if (histEl) {
        const others = urgenceData.orders.filter(o => o.status === 'received' || o.status === 'cancelled').slice(0, 30);
        histEl.innerHTML = others.length === 0
            ? '<p class="urgence-empty">Aucun historique pour l\'instant.</p>'
            : others.map(o => urgenceOrderCardHtml(o)).join('');
    }

    if (pendingEl) urgenceBindOrderEditEvents(pendingEl);

    // Datalist partage des fournisseurs connus (memorises)
    let datalist = document.getElementById('urgenceOrderSupplierDatalist');
    if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = 'urgenceOrderSupplierDatalist';
        document.body.appendChild(datalist);
    }
    datalist.innerHTML = (typeof urgenceSupplierOptionsHtml === 'function' ? urgenceSupplierOptionsHtml() : '');
}

function urgenceOrderHeaderHtml(o, chipLabel, chipClass) {
    const dateStr = new Date(o.createdAt).toLocaleDateString('fr-FR');
    const supplier = o.supplier || 'Sans fournisseur';
    const initial = (o.supplier || '?').trim().charAt(0).toUpperCase() || '?';
    return `
    <div class="urgence-order-head">
        <span class="urgence-order-avatar">${urgenceEscapeHtml(initial)}</span>
        <div class="urgence-order-title">
            <strong class="urgence-order-supplier">${urgenceEscapeHtml(supplier)}</strong>
            <span class="urgence-order-date">Commande du ${dateStr} · ${(o.items || []).length} réf.</span>
        </div>
        <span class="urgence-state ${chipClass}">${chipLabel}</span>
    </div>`;
}

function urgenceOrderEditCardHtml(o) {
    const dateStr = new Date(o.createdAt).toLocaleDateString('fr-FR');
    const rows = o.items.map((i, idx) => `
        <div class="urgence-order-edit-row" data-idx="${idx}">
            <div class="urgence-order-edit-name">
                <strong>${urgenceEscapeHtml(i.name)}</strong>
                <span class="urgence-pointage-sub">${urgenceEscapeHtml(urgenceCategoryLabel((urgenceData.products.find(p => p.id === i.productId) || {}).category))}</span>
            </div>
            <div class="urgence-order-edit-fields">
                <label>Qté
                    <input type="number" min="1" class="form-input urgence-order-qty" data-idx="${idx}" value="${i.qty}">
                </label>
                <label>€ / ${urgenceEscapeHtml(i.unit)}
                    <input type="number" min="0" step="0.01" class="form-input urgence-order-price" data-idx="${idx}" value="${i.unitPrice || ''}" placeholder="€">
                </label>
                <span class="urgence-order-line-total" data-linetotal="${idx}">= ${i.unitPrice ? urgenceFmtEur(i.qty * i.unitPrice) : '—'}</span>
                <button class="stock-icon-btn" onclick="urgenceMoveOrderItem('${o.id}', ${idx})" title="Déplacer vers une autre commande / fournisseur">⇄</button>
                <button class="stock-icon-btn" onclick="urgenceOrderRemoveItem('${o.id}', ${idx})" title="Retirer de la commande">🗑️</button>
            </div>
        </div>`).join('');

    const notInOrder = urgenceData.products.filter(p => !o.items.some(i => i.productId === p.id));
    const addSelect = notInOrder.length > 0
        ? `<select class="form-input urgence-order-add-select" data-order="${o.id}">
               <option value="">+ Ajouter une référence…</option>
               ${notInOrder.map(p => `<option value="${p.id}">${urgenceEscapeHtml(p.name)}</option>`).join('')}
           </select>`
        : '';

    return `
        <div class="urgence-order-card" data-order="${o.id}">
            ${urgenceOrderHeaderHtml(o, 'À passer', 'warning')}
            <div class="urgence-order-meta">
                <label>Fournisseur
                    <input type="text" class="form-input urgence-order-meta-input" data-order="${o.id}" data-field="supplier" list="urgenceOrderSupplierDatalist" value="${urgenceEscapeHtml(o.supplier || '')}" placeholder="Ex : Cooper">
                </label>
                <label>Email
                    <input type="email" class="form-input urgence-order-meta-input" data-order="${o.id}" data-field="supplierEmail" value="${urgenceEscapeHtml(o.supplierEmail || '')}" placeholder="commandes@fournisseur.fr">
                </label>
                <label>Frais de port €
                    <input type="number" min="0" step="0.01" class="form-input urgence-order-meta-input" data-order="${o.id}" data-field="shipping" value="${o.shipping || ''}" placeholder="0">
                </label>
                <label>Remise €
                    <input type="number" min="0" step="0.01" class="form-input urgence-order-meta-input" data-order="${o.id}" data-field="discount" value="${o.discount || ''}" placeholder="0">
                </label>
            </div>
            <div class="urgence-order-edit-list">${rows}</div>
            <div class="urgence-order-add-row">
                ${addSelect}
                <p class="stock-price-hint">Prix pré-remplis avec la dernière valeur connue — ajustez-les si le fournisseur annonce un nouveau tarif.</p>
            </div>
            <div class="urgence-order-foot">
                <span class="urgence-order-total-wrap">Total TTC estimé : <strong class="urgence-order-total" data-ordertotal="${o.id}">${urgenceFmtEur(urgenceOrderTotal(o))}</strong></span>
                <span class="urgence-order-actions">
                    <button class="action-btn stock-btn-tonal" onclick="urgenceCopyOrder('${o.id}')" title="Copier le bon de commande pour le coller dans un mail">⠫ Copier</button>
                    <button class="action-btn stock-btn-tonal" onclick="urgenceSendOrder('${o.id}')" title="Ouvrir un mail pré-rempli vers le fournisseur">✉ Envoyer</button>
                    <button class="action-btn primary" onclick="urgenceMarkOrdered('${o.id}')">✓ Marquer commandée</button>
                    <button class="action-btn stock-btn-ghost" onclick="urgenceCancelOrder('${o.id}')" title="Annuler la commande">Annuler</button>
                </span>
            </div>
        </div>`;
}

function urgenceBindOrderEditEvents(container) {
    container.querySelectorAll('.urgence-order-edit-row').forEach(row => {
        const orderId = row.closest('.urgence-order-card')?.dataset.order;
        const idx = row.dataset.idx;
        const qtyInput = row.querySelector('.urgence-order-qty');
        const priceInput = row.querySelector('.urgence-order-price');
        const lineTotal = row.querySelector('[data-linetotal]');

        const update = () => {
            const order = urgenceData.orders.find(o => o.id === orderId);
            if (!order || !order.items[idx]) return;
            const qty = parseInt(qtyInput.value, 10);
            const price = parseFloat(priceInput.value);
            if (!isNaN(qty) && qty > 0) order.items[idx].qty = qty;
            order.items[idx].unitPrice = isNaN(price) ? 0 : price;
            lineTotal.textContent = order.items[idx].unitPrice ? urgenceFmtEur(order.items[idx].qty * order.items[idx].unitPrice) : '—';
            const totalEl = container.querySelector(`[data-ordertotal="${orderId}"]`);
            if (totalEl) totalEl.textContent = urgenceFmtEur(urgenceOrderEstimatedTotal(order));
            saveUrgenceData();
        };
        qtyInput.addEventListener('input', update);
        priceInput.addEventListener('input', update);
    });

    container.querySelectorAll('.urgence-order-meta-input[data-field="supplier"]').forEach(urgenceAttachSupplierAuto);

    container.querySelectorAll('.urgence-order-meta-input').forEach(input => {
        const orderId = input.dataset.order;
        const field = input.dataset.field;
        const apply = () => {
            const order = urgenceData.orders.find(o => o.id === orderId);
            if (!order) return;
            if (field === 'shipping' || field === 'discount') {
                const v = parseFloat(input.value);
                order[field] = isNaN(v) || v < 0 ? 0 : v;
            } else {
                order[field] = input.value.trim();
                if (field === 'supplier' && typeof urgenceRememberSupplier === 'function') {
                    urgenceRememberSupplier(order.supplier, order.supplierEmail);
                }
            }
            const totalEl = container.querySelector(`[data-ordertotal="${orderId}"]`);
            if (totalEl) totalEl.textContent = urgenceFmtEur(urgenceOrderTotal(order));
            saveUrgenceData();
        };
        input.addEventListener('input', apply);
        input.addEventListener('change', apply);
    });

    container.querySelectorAll('.urgence-order-add-select').forEach(sel => {
        sel.addEventListener('change', () => {
            if (sel.value) urgenceOrderAddItem(sel.dataset.order, sel.value);
        });
    });
}

// Deplacer une reference vers une autre commande (autre fournisseur) ou une nouvelle commande
function urgenceMoveOrderItem(orderId, idx) {
    const order = urgenceData.orders.find(o => o.id === orderId);
    const item = order?.items?.[idx];
    if (!order || !item) return;

    const existing = document.getElementById('urgenceMoveItemModal');
    if (existing) existing.remove();

    const targets = urgenceData.orders.filter(o => o.id !== orderId && o.status === 'pending');
    const product = urgenceData.products.find(p => p.id === item.productId);
    const productSupplier = product?.supplier || '';

    const targetsHtml = targets.length === 0
        ? '<p class="urgence-empty">Pas d’autre commande en préparation.</p>'
        : targets.map(t => `
            <button type="button" class="stock-menu-item urgence-move-target" onclick="urgenceConfirmMoveItem('${orderId}', ${idx}, '${t.id}')">
                ${t.supplier ? urgenceEscapeHtml(t.supplier) : 'Sans fournisseur'} — ${t.items.length} réf(s)
            </button>`).join('');

    const modal = document.createElement('div');
    modal.id = 'urgenceMoveItemModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-card urgence-modal-content">
            <div class="modal-header">
                <h3>Déplacer « ${urgenceEscapeHtml(item.name)} »</h3>
                <button type="button" class="modal-close" onclick="urgenceCloseMoveItemModal()" aria-label="Fermer">✕</button>
            </div>
            <div class="modal-body">
                <p class="form-hint">Vers quelle commande déplacer cette référence ?</p>
                ${targetsHtml}
                <button type="button" class="stock-menu-item urgence-move-target" onclick="urgenceConfirmMoveItem('${orderId}', ${idx}, 'new')">
                    ➕ Nouvelle commande${productSupplier ? ` pour ${urgenceEscapeHtml(productSupplier)}` : ''}
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) urgenceCloseMoveItemModal();
    });
}

function urgenceCloseMoveItemModal() {
    document.getElementById('urgenceMoveItemModal')?.remove();
}

function urgenceConfirmMoveItem(orderId, idx, targetId) {
    const order = urgenceData.orders.find(o => o.id === orderId);
    const item = order?.items?.[idx];
    if (!order || !item) return;

    let target;
    if (targetId === 'new') {
        const product = urgenceData.products.find(p => p.id === item.productId);
        target = {
            id: 'cmd' + Date.now() + Math.random().toString(36).slice(2, 5),
            createdAt: new Date().toISOString(),
            status: 'pending',
            items: [],
            supplier: product?.supplier || '',
            supplierEmail: product?.supplierEmail || '',
            shipping: 0,
            discount: 0
        };
        urgenceData.orders.unshift(target);
    } else {
        target = urgenceData.orders.find(o => o.id === targetId);
        if (!target || target.status !== 'pending') return;
    }

    order.items.splice(idx, 1);
    target.items.push(item);
    saveUrgenceData();
    urgenceCloseMoveItemModal();
    urgenceRenderOrders();
    if (typeof showToast === 'function') showToast(`« ${item.name} » déplacé vers ${target.supplier ? target.supplier : 'la commande sans fournisseur'}`);
}

function urgenceOrderAddItem(orderId, productId) {
    const order = urgenceData.orders.find(o => o.id === orderId);
    const product = urgenceData.products.find(p => p.id === productId);
    if (!order || !product || order.status !== 'pending') return;
    order.items.push({
        productId,
        name: product.name,
        unit: product.unit,
        qty: 1,
        unitPrice: urgenceProductUnitPrice(product)
    });
    saveUrgenceData();
    urgenceRenderOrders();
    if (typeof showToast === 'function') showToast(`« ${product.name} » ajouté à la commande`);
}

function urgenceOrderRemoveItem(orderId, idx) {
    const order = urgenceData.orders.find(o => o.id === orderId);
    if (!order || order.status !== 'pending' || !order.items[idx]) return;
    const name = order.items[idx].name;
    order.items.splice(idx, 1);
    saveUrgenceData();
    urgenceRenderOrders();
    if (typeof showToast === 'function') showToast(`« ${name} » retiré de la commande`);
}

function urgenceOrderOrderedCardHtml(o) {
    const dateStr = new Date(o.createdAt).toLocaleDateString('fr-FR');
    const rows = o.items.map(i => {
        const received = urgenceItemReceivedQty(o, i);
        const done = received >= i.qty;
        return `
        <div class="urgence-order-edit-row">
            <div class="urgence-order-edit-name">
                <strong>${urgenceEscapeHtml(i.name)}</strong>
                <span class="urgence-pointage-sub">commandé : ${i.qty} ${urgenceEscapeHtml(i.unit)} · reçu : ${received}</span>
            </div>
            <span class="urgence-state ${done ? 'success' : 'warning'}">${done ? '✓ reçu' : `${i.qty - received} en attente`}</span>
        </div>`;
    }).join('');
    const receptionsHtml = (o.receptions || []).map(r =>
        `<div class="urgence-reception-note">📦 Réception du ${new Date(r.date).toLocaleDateString('fr-FR')} : ${r.items.map(x => `${urgenceEscapeHtml(x.name)} ×${x.qty}`).join(', ')}${r.cost ? ` — ${urgenceFmtEur(r.cost)}` : ''}</div>`
    ).join('');
    const receivedTotal = (o.receptions || []).reduce((s, r) => s + (r.cost || 0), 0);
    const total = receivedTotal > 0 ? urgenceFmtEur(receivedTotal) : `≈ ${urgenceFmtEur(urgenceOrderTotal(o))}`;
    const sendBtn = o.supplierEmail
        ? `<button class="action-btn stock-btn-tonal" onclick="urgenceSendOrder('${o.id}')" title="Renvoyer le bon de commande par mail">✉ Renvoyer</button>`
        : '';
    return `
        <div class="urgence-order-card">
            ${urgenceOrderHeaderHtml(o, 'Commandée — en livraison', 'warning')}
            <div class="urgence-order-edit-list">${rows}</div>
            ${receptionsHtml}
            <div class="urgence-order-foot">
                <span>Total TTC : <strong>${total}</strong></span>
                <span class="urgence-order-actions">
                    ${sendBtn}
                    <button class="action-btn primary" onclick="urgenceReceiveOrder('${o.id}')">📥 Réceptionner</button>
                    <button class="action-btn stock-btn-ghost" onclick="urgenceCancelOrder('${o.id}')" title="Annuler la commande">Annuler</button>
                </span>
            </div>
        </div>`;
}

function urgenceOrderCardHtml(o) {
    const statusLabel = o.status === 'received' ? 'Reçue ✅' : 'Annulée';
    const statusClass = o.status === 'received' ? 'success' : 'danger';
    const dateStr = new Date(o.createdAt).toLocaleDateString('fr-FR');
    const items = o.items.map(i => {
        const received = urgenceItemReceivedQty(o, i);
        return `<li>${urgenceEscapeHtml(i.name)} — ${received > 0 ? received : i.qty} ${urgenceEscapeHtml(i.unit)}${i.unitPrice ? ` · ${urgenceFmtEur(i.unitPrice)}/${urgenceEscapeHtml(i.unit)}` : ''}</li>`;
    }).join('');
    const total = o.status === 'received' && o.realCost ? urgenceFmtEur(o.realCost) : `≈ ${urgenceFmtEur(urgenceOrderEstimatedTotal(o))}`;
    const receptionsHtml = (o.receptions || []).map(r =>
        `<div class="urgence-reception-note">📦 Réception du ${new Date(r.date).toLocaleDateString('fr-FR')} : ${r.items.map(x => `${urgenceEscapeHtml(x.name)} ×${x.qty}`).join(', ')}${r.cost ? ` — ${urgenceFmtEur(r.cost)}` : ''}</div>`
    ).join('');
    return `
        <div class="urgence-order-card">
            ${urgenceOrderHeaderHtml(o, statusLabel, statusClass)}
            <ul class="urgence-order-items">${items}</ul>
            ${receptionsHtml}
            <div class="urgence-order-foot">
                <span>Total TTC : <strong>${total}</strong></span>
                <span class="urgence-order-actions"></span>
            </div>
        </div>`;
}

// ---------- Rendu : Coûts ----------

function urgenceRenderCosts() {
    urgenceOrdersData();
    const wrap = document.getElementById('urgenceCostsPanel');
    if (!wrap) return;

    const received = urgenceData.orders.filter(o => o.status === 'received');
    const totalSpent = received.reduce((s, o) => s + (Number(o.realCost) || 0), 0);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const totalMonth = received.filter(o => new Date(o.receivedAt) >= monthStart)
        .reduce((s, o) => s + (Number(o.realCost) || 0), 0);

    // Depense cumulee par produit (somme des couts de commande receptionnees, au prorata)
    const byProduct = new Map();
    received.forEach(o => {
        const est = urgenceOrderEstimatedTotal(o);
        o.items.forEach(i => {
            const qty = i.receivedQty !== undefined ? i.receivedQty : i.qty;
            let cost;
            if (est > 0 && i.unitPrice > 0) {
                cost = (Number(o.realCost) || 0) * (i.qty * i.unitPrice) / est;
            } else {
                cost = (Number(o.realCost) || 0) / Math.max(o.items.length, 1);
            }
            const cur = byProduct.get(i.productId) || { name: i.name, unit: i.unit, qty: 0, total: 0 };
            cur.qty += qty;
            cur.total += cost;
            byProduct.set(i.productId, cur);
        });
    });

    const rows = Array.from(byProduct.values()).sort((a, b) => b.total - a.total);
    const max = rows.length ? rows[0].total : 1;

    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const totalYear = received.filter(o => new Date(o.receivedAt) >= yearStart)
        .reduce((s, o) => s + (Number(o.realCost) || 0), 0);

    const statsHtml = `
        <h4 class="stock-section-title">Coûts des achats</h4>
        <div class="urgence-cost-stats">
            <div class="urgence-cost-stat"><span class="urgence-cost-value">${urgenceFmtEur(totalYear)}</span><span class="urgence-cost-label">Cette année</span></div>
            <div class="urgence-cost-stat"><span class="urgence-cost-value">${urgenceFmtEur(totalMonth)}</span><span class="urgence-cost-label">Ce mois-ci</span></div>
            <div class="urgence-cost-stat"><span class="urgence-cost-value">${urgenceFmtEur(totalSpent)}</span><span class="urgence-cost-label">Total cumulé</span></div>
            <div class="urgence-cost-stat"><span class="urgence-cost-value">${received.length}</span><span class="urgence-cost-label">Commandes reçues</span></div>
        </div>`;

    const tableHtml = rows.length === 0
        ? '<p class="urgence-empty">Aucune dépense enregistrée. Réceptionnez une commande (avec son coût TTC) pour alimenter le suivi.</p>'
        : `<div class="inventory-table"><table>
            <thead><tr><th>Produit</th><th>Qté reçue</th><th>Dépense TTC</th><th>Prix moyen / ${'unité'}</th><th class="urgence-cost-bar-th"></th></tr></thead>
            <tbody>
            ${rows.map(r => `
                <tr>
                    <td>${urgenceEscapeHtml(r.name)}</td>
                    <td>${r.qty}</td>
                    <td><strong>${urgenceFmtEur(r.total)}</strong></td>
                    <td>${urgenceFmtEur(r.total / Math.max(r.qty, 1))}</td>
                    <td class="urgence-cost-bar-td"><div class="urgence-cost-bar" style="width:${Math.max((r.total / max) * 100, 4)}%"></div></td>
                </tr>`).join('')}
            </tbody></table></div>`;

    // Par categorie (basee sur les produits)
    const catTotals = new Map();
    byProduct.forEach((v, pid) => {
        const p = urgenceData.products.find(p => p.id === pid);
        const cat = p ? urgenceCategoryLabel(p.category) : 'Divers';
        catTotals.set(cat, (catTotals.get(cat) || 0) + v.total);
    });
    const catRows = Array.from(catTotals.entries()).sort((a, b) => b[1] - a[1]);
    const catMax = catRows.length ? catRows[0][1] : 1;
    const catHtml = catRows.length === 0 ? '' : `
        <h4 style="margin: 20px 0 8px;">Dépense par catégorie</h4>
        <div class="urgence-cost-cat-list">
        ${catRows.map(([cat, tot]) => `
            <div class="urgence-cost-cat">
                <span class="urgence-cost-cat-label">${urgenceEscapeHtml(cat)}</span>
                <div class="urgence-cost-cat-track"><div class="urgence-cost-bar primary" style="width:${Math.max((tot / catMax) * 100, 4)}%"></div></div>
                <span class="urgence-cost-cat-val">${urgenceFmtEur(tot)}</span>
            </div>`).join('')}
        </div>`;

    // Depense par fournisseur (basee sur le cout reel des receptions)
    const supTotals = new Map();
    received.forEach(o => {
        const key = o.supplier || 'Sans fournisseur';
        supTotals.set(key, (supTotals.get(key) || 0) + (Number(o.realCost) || 0));
    });
    const supRows = Array.from(supTotals.entries()).sort((a, b) => b[1] - a[1]);
    const supMax = supRows.length ? supRows[0][1] : 1;
    const supHtml = supRows.length === 0 ? '' : `
        <h4 class="stock-section-title">Dépense par fournisseur</h4>
        <div class="urgence-cost-cat-list">
        ${supRows.map(([sup, tot]) => `
            <div class="urgence-cost-cat">
                <span class="urgence-cost-cat-label">${urgenceEscapeHtml(sup)}</span>
                <div class="urgence-cost-cat-track"><div class="urgence-cost-bar primary" style="width:${Math.max((tot / supMax) * 100, 4)}%"></div></div>
                <span class="urgence-cost-cat-val">${urgenceFmtEur(tot)}</span>
            </div>`).join('')}
        </div>`;

    // Benchmark interne : evolution du prix reel par reference (au moins 2 achats)
    const priceRows = [];
    urgenceData.products.forEach(p => {
        const h = Array.isArray(p.priceHistory) ? p.priceHistory : [];
        if (h.length >= 2) {
            const last = h[h.length - 1];
            const prev = h[h.length - 2];
            const delta = prev.unitPrice ? ((last.unitPrice - prev.unitPrice) / prev.unitPrice) * 100 : 0;
            priceRows.push({ p, last, prev, delta });
        }
    });
    priceRows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const priceHtml = priceRows.length === 0 ? '' : `
        <h4 class="stock-section-title">Évolution des prix payés</h4>
        <div class="stock-price-list">
        ${priceRows.slice(0, 12).map(r => `
            <div class="stock-price-row">
                <span class="stock-price-name">${urgenceEscapeHtml(r.p.name)}</span>
                <span class="stock-price-hist">${urgenceFmtEur(r.prev.unitPrice)} ${urgenceEscapeHtml(r.prev.supplier ? '· ' + r.prev.supplier : '')} → ${urgenceFmtEur(r.last.unitPrice)} ${urgenceEscapeHtml(r.last.supplier ? '· ' + r.last.supplier : '')}</span>
                <span class="stock-chip ${r.delta > 2 ? 'danger' : (r.delta < -2 ? 'success' : 'neutral')}">${r.delta > 0 ? '▲' : (r.delta < 0 ? '▼' : '=')} ${Math.abs(r.delta).toFixed(0)} %</span>
            </div>`).join('')}
        </div>
        <p class="stock-cost-note">💡 Les prix se mettent à jour automatiquement à chaque réception (coût réel payé, fournisseur par fournisseur) : c'est votre benchmark interne. Ajustez aussi le prix sur le bon de commande quand le fournisseur annonce un nouveau tarif.</p>`;

    wrap.innerHTML = statsHtml + tableHtml + supHtml + catHtml + priceHtml;
}

// ---------- Init ----------

function initUrgenceOrdersModule() {
    urgenceOrdersData();

    const createOrderBtn = document.getElementById('urgenceCreateOrderBtn');
    if (createOrderBtn) createOrderBtn.addEventListener('click', urgenceBuildOrderFromNeeds);

    const createOrderBtn2 = document.getElementById('urgenceCreateOrderBtn2');
    if (createOrderBtn2) createOrderBtn2.addEventListener('click', urgenceBuildOrderFromNeeds);

    const createOrderBtn3 = document.getElementById('urgenceCreateOrderBtnOrders');
    if (createOrderBtn3) createOrderBtn3.addEventListener('click', urgenceBuildOrderFromNeeds);

    const blankOrderBtn = document.getElementById('urgenceBlankOrderBtn');
    if (blankOrderBtn) blankOrderBtn.addEventListener('click', urgenceCreateBlankOrder);

    const addSupplierBtn = document.getElementById('urgenceAddSupplierBtn');
    if (addSupplierBtn) addSupplierBtn.addEventListener('click', () => urgenceShowSupplierModal(null));

    urgenceRenderOrders();
    urgenceRenderCosts();
    urgenceRenderSuppliers();
}

document.addEventListener('DOMContentLoaded', initUrgenceOrdersModule);

window.urgenceBuildOrderFromNeeds = urgenceBuildOrderFromNeeds;
window.urgenceCreateBlankOrder = urgenceCreateBlankOrder;
window.urgenceSendOrder = urgenceSendOrder;
window.urgenceShowSupplierModal = urgenceShowSupplierModal;
window.urgenceCloseSupplierModal = urgenceCloseSupplierModal;
window.urgenceSaveSupplier = urgenceSaveSupplier;
window.urgenceDeleteSupplier = urgenceDeleteSupplier;
window.urgenceMoveOrderItem = urgenceMoveOrderItem;
window.urgenceCloseMoveItemModal = urgenceCloseMoveItemModal;
window.urgenceConfirmMoveItem = urgenceConfirmMoveItem;
window.urgenceReceiveOrder = urgenceReceiveOrder;
window.urgenceConfirmReceive = urgenceConfirmReceive;
window.urgenceCloseReceiveModal = urgenceCloseReceiveModal;
window.urgenceCancelOrder = urgenceCancelOrder;
window.urgenceCopyOrder = urgenceCopyOrder;
window.urgenceRenderOrders = urgenceRenderOrders;
window.urgenceRenderCosts = urgenceRenderCosts;
window.urgenceOrderAddItem = urgenceOrderAddItem;
window.urgenceOrderRemoveItem = urgenceOrderRemoveItem;
window.urgenceMarkOrdered = urgenceMarkOrdered;
window.urgenceConfirmOrdered = urgenceConfirmOrdered;
window.urgenceCloseOrderedModal = urgenceCloseOrderedModal;
