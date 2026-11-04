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

function urgenceBuildOrderFromNeeds() {
    urgenceOrdersData();
    const needs = urgenceData.products.filter(p => p.quantity <= p.minQuantity);
    if (needs.length === 0) {
        if (typeof showToast === 'function') showToast('Rien à commander : tous les stocks sont au-dessus des seuils ✅');
        return;
    }
    const items = needs.map(p => ({
        productId: p.id,
        name: p.name,
        unit: p.unit,
        qty: urgenceSuggestedQty(p),
        unitPrice: urgenceProductUnitPrice(p)
    })).filter(i => i.qty > 0);

    if (items.length === 0) {
        if (typeof showToast === 'function') showToast('Aucune quantité à commander', 'error');
        return;
    }

    const order = {
        id: 'cmd' + Date.now(),
        createdAt: new Date().toISOString(),
        status: 'pending',
        items
    };
    urgenceData.orders.unshift(order);
    saveUrgenceData();
    urgenceRenderOrders();
    urgenceRenderCosts();
    if (typeof showToast === 'function') showToast(`Commande créée : ${items.length} produit(s), estimation ${urgenceFmtEur(urgenceOrderEstimatedTotal(order))}`);
}

function urgenceOrderEstimatedTotal(order) {
    return order.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0);
}

function urgenceCopyOrder(orderId) {
    const order = urgenceData.orders.find(o => o.id === orderId);
    if (!order) return;
    const lines = order.items.map(i => `- ${i.name} : ${i.qty} ${i.unit}` + (i.unitPrice ? ` (≈ ${urgenceFmtEur(i.qty * i.unitPrice)})` : ''));
    const text = `Commande salle d'urgence (${new Date(order.createdAt).toLocaleDateString('fr-FR')}) :\n` + lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
        if (typeof showToast === 'function') showToast('Commande copiée dans le presse-papiers');
    }).catch(() => alert(text));
}

// ---------- Réception ----------

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
                    <input type="text" id="urgenceOrderSupplier" class="form-input" value="${order.supplier ? urgenceEscapeHtml(order.supplier) : ''}" placeholder="Ex : Cooper, Phocépharma…">
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
    const supplierInput = document.getElementById('urgenceOrderSupplier');
    order.supplier = supplierInput ? supplierInput.value.trim() : '';
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
            <div class="urgence-pointage-input">
                <label class="urgence-receive-check">
                    <input type="checkbox" class="urgence-receive-ok" data-pid="${i.productId}" checked>
                    Arrivé
                </label>
                <input type="number" min="0" max="${rest}" class="form-input urgence-receive-qty" data-pid="${i.productId}" value="${rest}">
                <span class="urgence-pointage-unit">${urgenceEscapeHtml(i.unit)}</span>
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
                <p class="form-hint">Cochez « Arrivé » et ajustez la quantité reçue pour chaque référence livrée. Les références non cochées resteront « en attente de livraison » — vous pourrez les réceptionner plus tard (une commande peut être répartie sur plusieurs fournisseurs).</p>
                ${rows}
                <div class="form-group" style="margin-top: 12px;">
                    <label>Coût TTC de ce qui est reçu maintenant (€)</label>
                    <input type="number" min="0" step="0.01" id="urgenceReceiveCost" class="form-input" value="${estRemaining ? estRemaining.toFixed(2) : ''}" placeholder="Ex : 45.90">
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
    modal.querySelectorAll('.urgence-receive-ok').forEach(chk => {
        chk.addEventListener('change', () => {
            const qty = modal.querySelector(`.urgence-receive-qty[data-pid="${chk.dataset.pid}"]`);
            if (qty) qty.disabled = !chk.checked;
        });
    });
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
        receivedItems.push({
            productId: pid,
            name: item.name,
            unit: item.unit,
            qty: Math.min(qty, item.qty - already)
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
            product.quantity = (product.quantity || 0) + r.qty;
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
        if (est > 0 && item?.unitPrice > 0) {
            const share = (i.qty * item.unitPrice) / est;
            unitCost = reception.cost * share / Math.max(i.qty, 1);
        } else if (i.qty) {
            unitCost = reception.cost / i.qty;
        } else {
            return;
        }
        product.unitPrice = Math.round((unitCost + Number.EPSILON) * 100) / 100;
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
                <label>Coût TTC / ${urgenceEscapeHtml(i.unit)}
                    <input type="number" min="0" step="0.01" class="form-input urgence-order-price" data-idx="${idx}" value="${i.unitPrice || ''}" placeholder="€">
                </label>
                <span class="urgence-order-line-total" data-linetotal="${idx}">${i.unitPrice ? urgenceFmtEur(i.qty * i.unitPrice) : '—'}</span>
                <button class="action-btn" onclick="urgenceOrderRemoveItem('${o.id}', ${idx})" title="Retirer de la commande">🗑️</button>
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
            <div class="urgence-order-head">
                <strong>Commande du ${dateStr} — en préparation</strong>
                <span class="urgence-state warning">À passer / en attente</span>
            </div>
            <div class="urgence-order-edit-list">${rows}</div>
            <div class="urgence-order-add-row">
                ${addSelect}
            </div>
            <div class="urgence-order-foot">
                <span>Total TTC estimé : <strong class="urgence-order-total" data-ordertotal="${o.id}">${urgenceFmtEur(urgenceOrderEstimatedTotal(o))}</strong></span>
                <span class="urgence-order-actions">
                    <button class="action-btn" onclick="urgenceCopyOrder('${o.id}')">Copier</button>
                    <button class="action-btn primary" onclick="urgenceMarkOrdered('${o.id}')">Marquer commandée</button>
                    <button class="action-btn" onclick="urgenceCancelOrder('${o.id}')">Annuler</button>
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

    container.querySelectorAll('.urgence-order-add-select').forEach(sel => {
        sel.addEventListener('change', () => {
            if (sel.value) urgenceOrderAddItem(sel.dataset.order, sel.value);
        });
    });
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
    const total = receivedTotal > 0 ? urgenceFmtEur(receivedTotal) : `≈ ${urgenceFmtEur(urgenceOrderEstimatedTotal(o))}`;
    return `
        <div class="urgence-order-card">
            <div class="urgence-order-head">
                <strong>Commande du ${dateStr}${o.supplier ? ` — ${urgenceEscapeHtml(o.supplier)}` : ''}</strong>
                <span class="urgence-state warning">Commandée — en attente de livraison</span>
            </div>
            <div class="urgence-order-edit-list">${rows}</div>
            ${receptionsHtml}
            <div class="urgence-order-foot">
                <span>Total TTC : <strong>${total}</strong></span>
                <span class="urgence-order-actions">
                    <button class="action-btn primary" onclick="urgenceReceiveOrder('${o.id}')">Réceptionner</button>
                    <button class="action-btn" onclick="urgenceCancelOrder('${o.id}')">Annuler</button>
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
            <div class="urgence-order-head">
                <strong>Commande du ${dateStr}${o.supplier ? ` — ${urgenceEscapeHtml(o.supplier)}` : ''}</strong>
                <span class="urgence-state ${statusClass}">${statusLabel}</span>
            </div>
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

    const statsHtml = `
        <div class="urgence-cost-stats">
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

    wrap.innerHTML = statsHtml + tableHtml + catHtml;
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

    urgenceRenderOrders();
    urgenceRenderCosts();
}

document.addEventListener('DOMContentLoaded', initUrgenceOrdersModule);

window.urgenceBuildOrderFromNeeds = urgenceBuildOrderFromNeeds;
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
