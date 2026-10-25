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

function urgenceReceiveOrder(orderId) {
    const order = urgenceData.orders.find(o => o.id === orderId);
    if (!order || order.status !== 'pending') return;

    const existing = document.getElementById('urgenceReceiveModal');
    if (existing) existing.remove();

    const rows = order.items.map(i => `
        <div class="urgence-receive-row">
            <div class="urgence-receive-name">
                <strong>${urgenceEscapeHtml(i.name)}</strong>
                <span class="urgence-pointage-sub">commandé : ${i.qty} ${urgenceEscapeHtml(i.unit)} · prix unitaire : ${i.unitPrice ? urgenceFmtEur(i.unitPrice) : '—'}</span>
            </div>
            <div class="urgence-pointage-input">
                <label>Reçu :</label>
                <input type="number" min="0" max="9999" class="form-input urgence-receive-qty" data-pid="${i.productId}" value="${i.qty}">
            </div>
        </div>`).join('');

    const est = urgenceOrderEstimatedTotal(order);

    const modal = document.createElement('div');
    modal.id = 'urgenceReceiveModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-card urgence-modal-content">
            <div class="modal-header">
                <h3>Réception de commande</h3>
                <button type="button" class="modal-close" onclick="urgenceCloseReceiveModal()" aria-label="Fermer">✕</button>
            </div>
            <div class="modal-body">
                <p class="form-hint">Ajustez les quantités réellement reçues puis validez : le stock sera mis à jour.</p>
                ${rows}
                <div class="form-group" style="margin-top: 12px;">
                    <label>Coût total réel TTC de la commande (€)</label>
                    <input type="number" min="0" step="0.01" id="urgenceReceiveCost" class="form-input" value="${est ? est.toFixed(2) : ''}" placeholder="Ex : 45.90">
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
}

function urgenceCloseReceiveModal() {
    document.getElementById('urgenceReceiveModal')?.remove();
}

function urgenceConfirmReceive(orderId) {
    const order = urgenceData.orders.find(o => o.id === orderId);
    if (!order || order.status !== 'pending') return;

    const qtyInputs = document.querySelectorAll('.urgence-receive-qty');
    const costInput = document.getElementById('urgenceReceiveCost');
    const realCost = costInput ? (parseFloat(costInput.value) || 0) : 0;

    let updated = 0;
    qtyInputs.forEach(input => {
        const pid = input.dataset.pid;
        const received = parseInt(input.value, 10);
        if (isNaN(received) || received < 0) return;
        const item = order.items.find(i => i.productId === pid);
        const product = urgenceData.products.find(p => p.id === pid);
        if (!product) return;
        product.quantity = (product.quantity || 0) + received;
        if (item) item.receivedQty = received;
        updated++;
    });

    order.status = 'received';
    order.receivedAt = new Date().toISOString();
    order.receivedBy = (typeof currentUser !== 'undefined' && currentUser?.email) ? currentUser.email : 'secrétariat';
    order.realCost = realCost;

    if (realCost > 0) urgenceSpreadCost(order);

    saveUrgenceData();
    urgenceCloseReceiveModal();
    renderUrgenceStocks();
    renderUrgencePointage();
    urgenceRenderOrders();
    urgenceRenderCosts();

    const msg = `Réception enregistrée : ${updated} produit(s) mis à jour dans le stock.` + (realCost ? ` Coût : ${urgenceFmtEur(realCost)}` : '');
    if (typeof showToast === 'function') showToast(msg);
    else alert(msg);
}

// Répartit le cout reel TTC sur les produits de la commande (au prorata du prix estime)
// et met a jour le prix unitaire de chaque reference.
function urgenceSpreadCost(order) {
    const est = urgenceOrderEstimatedTotal(order);
    order.items.forEach(i => {
        const product = urgenceData.products.find(p => p.id === i.productId);
        if (!product) return;
        let unitCost;
        if (est > 0 && i.unitPrice > 0) {
            const share = (i.qty * i.unitPrice) / est;
            unitCost = order.realCost * share / Math.max(i.receivedQty || i.qty, 1);
        } else if (i.receivedQty || i.qty) {
            unitCost = order.realCost / (i.receivedQty || i.qty);
        } else {
            return;
        }
        product.unitPrice = Math.round((unitCost + Number.EPSILON) * 100) / 100;
    });
}

function urgenceCancelOrder(orderId) {
    const order = urgenceData.orders.find(o => o.id === orderId);
    if (!order || order.status !== 'pending') return;
    if (!confirm('Annuler cette commande (aucun stock ne sera modifié) ?')) return;
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
            : pending.map(o => urgenceOrderCardHtml(o)).join('');
    }

    const histEl = document.getElementById('urgenceOrdersHistory');
    if (histEl) {
        const others = urgenceData.orders.filter(o => o.status !== 'pending').slice(0, 30);
        histEl.innerHTML = others.length === 0
            ? '<p class="urgence-empty">Aucun historique pour l\'instant.</p>'
            : others.map(o => urgenceOrderCardHtml(o)).join('');
    }
}

function urgenceOrderCardHtml(o) {
    const statusLabel = o.status === 'pending' ? 'À passer / en attente' : (o.status === 'received' ? 'Reçue ✅' : 'Annulée');
    const statusClass = o.status === 'pending' ? 'warning' : (o.status === 'received' ? 'success' : 'danger');
    const dateStr = new Date(o.createdAt).toLocaleDateString('fr-FR');
    const items = o.items.map(i =>
        `<li>${urgenceEscapeHtml(i.name)} — ${i.receivedQty !== undefined ? i.receivedQty : i.qty} ${urgenceEscapeHtml(i.unit)}${i.unitPrice ? ` · ${urgenceFmtEur(i.unitPrice)}/${urgenceEscapeHtml(i.unit)}` : ''}</li>`
    ).join('');
    const total = o.status === 'received' && o.realCost ? urgenceFmtEur(o.realCost) : `≈ ${urgenceFmtEur(urgenceOrderEstimatedTotal(o))}`;
    const actions = o.status === 'pending'
        ? `<button class="action-btn" onclick="urgenceCopyOrder('${o.id}')">Copier</button>
           <button class="action-btn primary" onclick="urgenceReceiveOrder('${o.id}')">Réceptionner</button>
           <button class="action-btn" onclick="urgenceCancelOrder('${o.id}')">Annuler</button>`
        : '';
    return `
        <div class="urgence-order-card">
            <div class="urgence-order-head">
                <strong>Commande du ${dateStr}</strong>
                <span class="urgence-state ${statusClass}">${statusLabel}</span>
            </div>
            <ul class="urgence-order-items">${items}</ul>
            <div class="urgence-order-foot">
                <span>Total TTC : <strong>${total}</strong></span>
                <span class="urgence-order-actions">${actions}</span>
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
