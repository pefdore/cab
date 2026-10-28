// ===== Rapprochement dépenses fournisseurs <-> commandes de stock =====
// Les dépenses importées des relevés (ou saisies) peuvent être liées à une ou
// plusieurs commandes passées dans la gestion des stocks (urgence-orders.js).
// Les données des commandes sont locales (localStorage), le lien est stocké
// sur la dépense Supabase (colonne order_ids TEXT[]).

function reconEscapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function reconAllOrders() {
    try {
        if (typeof urgenceData === 'undefined' || !urgenceData) return [];
        return urgenceData.orders || [];
    } catch (e) { return []; }
}

function reconOrderTotal(order) {
    if (order.realCost != null) return Number(order.realCost) || 0;
    return (order.items || []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0);
}

function reconOrderLabel(order) {
    const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleDateString('fr-FR') : '-';
    const supplier = order.supplier ? ` — ${order.supplier}` : '';
    const items = (order.items || []).length;
    return `Commande du ${dateStr}${supplier} (${items} produit(s), ${reconOrderTotal(order).toFixed(2)}€)`;
}

// Dépenses potentiellement liables : catégorie matériel/consommables ou non encore rapprochées
function reconUnmatchedDepenses() {
    const orders = reconAllOrders();
    return cabinetDepenses.filter(d => {
        if (d.order_ids && d.order_ids.length) return false;
        if (['materiel', 'consommables', 'fournitures'].includes(d.category)) return true;
        return orders.some(o => reconScoreMatch(d, o) > 0.5);
    });
}

// Score de correspondance dépense <-> commande
function reconScoreMatch(depense, order) {
    let score = 0;
    const amount = Number(depense.amount) || 0;
    const total = reconOrderTotal(order);
    if (total > 0 && amount > 0) {
        const ratio = amount / total;
        if (ratio >= 0.9 && ratio <= 1.1) score += 0.6;
        else if (ratio >= 0.5 && ratio <= 2) score += 0.2;
    }
    const depDate = depense.date ? new Date(depense.date) : null;
    const ordDate = order.createdAt ? new Date(order.createdAt) : null;
    if (depDate && ordDate) {
        const days = Math.abs((depDate - ordDate) / 86400000);
        if (days <= 7) score += 0.3;
        else if (days <= 30) score += 0.1;
    }
    if (order.supplier && depense.description) {
        const sup = order.supplier.toLowerCase();
        const desc = depense.description.toLowerCase();
        if (sup.length >= 3 && desc.includes(sup)) score += 0.4;
    }
    return score;
}

function reconSuggestOrders(depense) {
    const orders = reconAllOrders().filter(o => o.status !== 'cancelled');
    return orders
        .map(o => ({ order: o, score: reconScoreMatch(depense, o) }))
        .filter(m => m.score > 0.4)
        .sort((a, b) => b.score - a.score)
        .map(m => m.order);
}

// Modal de rapprochement
window.openReconModal = async function(depenseId) {
    const depense = cabinetDepenses.find(d => d.id === depenseId);
    if (!depense) return;
    const orders = reconAllOrders();
    if (orders.length === 0) {
        alert('Aucune commande dans la gestion des stocks. Créez une commande depuis Cabinet → Stocks pour rapprocher une dépense.');
        return;
    }

    const suggestions = reconSuggestOrders(depense);
    const selected = new Set(depense.order_ids || []);

    const existing = document.getElementById('reconModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'reconModal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'display:flex; z-index:10002;';
    modal.innerHTML = `
        <div class="modal-card" style="max-width:560px; width:95%; max-height:80vh; display:flex; flex-direction:column;">
            <div class="modal-header" style="padding:14px 18px; border-bottom:1px solid var(--color-border);">
                <h3 style="margin:0; font-size:1rem;">Rapprocher la dépense</h3>
                <button class="modal-close" onclick="closeReconModal()">✕</button>
            </div>
            <div class="modal-body" style="padding:16px 18px; overflow-y:auto;">
                <div style="background:var(--color-bg-secondary,#f5f5f7); border-radius:8px; padding:10px 12px; margin-bottom:14px; font-size:0.85rem;">
                    <strong>${reconEscapeHtml(depense.description || '-')}</strong><br>
                    ${new Date(depense.date).toLocaleDateString('fr-FR')} · ${Number(depense.amount).toFixed(2)}€ · ${reconEscapeHtml(depense.category || '')}
                </div>
                ${reconLinkedDetailHtml(depense)}
                <p style="font-size:0.8rem; color:var(--color-text-secondary); margin:12px 0 10px;">${(depense.order_ids || []).length ? 'Commandes liées (modifiable) :' : 'Sélectionnez la ou les commandes fournisseurs payées par cette dépense :'}</p>
                <div id="reconOrderList">
                    ${orders.map(o => {
                        const isSugg = suggestions.some(s => s.id === o.id);
                        return `
                        <label style="display:flex; align-items:flex-start; gap:10px; padding:9px 10px; border:1px solid var(--color-border); border-radius:8px; margin-bottom:8px; cursor:pointer; ${isSugg ? 'border-color:var(--color-primary); background:var(--color-primary-light,#eef2ff);' : ''}">
                            <input type="checkbox" data-orderid="${o.id}" ${selected.has(o.id) ? 'checked' : ''} style="margin-top:3px;">
                            <div style="flex:1;">
                                <div style="font-size:0.85rem;">${reconEscapeHtml(reconOrderLabel(o))}</div>
                                ${isSugg ? '<div style="font-size:0.7rem; color:var(--color-primary); font-weight:600;">Suggestion automatique</div>' : ''}
                                <div style="font-size:0.72rem; color:var(--color-text-secondary);">${(o.items || []).slice(0,3).map(i => reconEscapeHtml(i.name)).join(', ')}${(o.items || []).length > 3 ? '…' : ''}</div>
                            </div>
                        </label>`;
                    }).join('')}
                </div>
            </div>
            <div style="padding:12px 18px; border-top:1px solid var(--color-border); display:flex; justify-content:flex-end; gap:10px;">
                <button class="btn-secondary" onclick="closeReconModal()">Annuler</button>
                <button class="btn-primary" onclick="saveRecon(${depenseId})">Enregistrer le rapprochement</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
};

window.closeReconModal = function() {
    document.getElementById('reconModal')?.remove();
};

window.saveRecon = async function(depenseId) {
    const checked = [...document.querySelectorAll('#reconOrderList input[data-orderid]:checked')].map(i => i.dataset.orderid);
    try {
        const { error } = await supabaseClient
            .from('cabinet_depenses')
            .update({ order_ids: checked })
            .eq('id', depenseId);
        if (error) throw error;
        const d = cabinetDepenses.find(x => x.id === depenseId);
        if (d) d.order_ids = checked;
        closeReconModal();
        if (typeof showToast === 'function') showToast(checked.length ? `Dépense rapprochée de ${checked.length} commande(s)` : 'Rapprochement retiré');
        if (typeof renderFluxView === 'function') renderFluxView();
        if (typeof renderReconPending === 'function') renderReconPending();
    } catch (e) {
        alert('Erreur: ' + e.message);
    }
};

// Bloc "à rapprocher" dans la vue Flux
window.renderReconPending = function() {
    const container = document.getElementById('flux-recon-pending');
    if (!container) return;
    const pending = reconUnmatchedDepenses();
    if (pending.length === 0) {
        container.innerHTML = '';
        return;
    }
    const open = window._reconListOpen === true;
    container.innerHTML = `
        <div class="module-card" style="border-left: 3px solid #f59e0b;">
            <div onclick="toggleReconPending()" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; gap:8px;">
                <h3 style="margin:0; color:#b45309;">📦 ${pending.length} dépense${pending.length > 1 ? 's' : ''} à rapprocher</h3>
                <span style="font-size:0.8rem; color:var(--color-text-secondary);">${open ? '▲ Replier' : '▼ Détail'}</span>
            </div>
            <p class="module-desc" style="margin:6px 0 0;">Paiements fournisseurs du relevé probablement liés à des commandes passées dans la gestion des stocks (matériel, consommables). Rapprocher chaque dépense de sa commande pour suivre le coût réel du stock dans le dashboard.</p>
            <div id="recon-pending-body" style="display:${open ? 'block' : 'none'}; margin-top:10px;">
            ${pending.slice(0, 8).map(d => `
                <div class="depense-item flux-row">
                    <div class="flux-row-main">
                        <span class="category">${reconEscapeHtml(d.category || '')}</span>
                        <span class="description">${reconEscapeHtml(d.description || '-')}</span>
                        <span class="date-small">${d.date ? new Date(d.date).toLocaleDateString('fr-FR') : '-'}</span>
                    </div>
                    <div class="flux-row-side">
                        <span class="amount">-${Number(d.amount).toFixed(2)}€</span>
                        <button class="action-btn" onclick="openReconModal(${d.id})">Rapprocher</button>
                    </div>
                </div>`).join('')}
            ${pending.length > 8 ? `<div style="font-size:0.75rem; color:var(--color-text-secondary); padding:4px 2px;">+ ${pending.length - 8} autre(s)…</div>` : ''}
            </div>
        </div>`;
};

window.toggleReconPending = function() {
    window._reconListOpen = !window._reconListOpen;
    if (typeof renderReconPending === 'function') renderReconPending();
};

// Libellé des commandes liées à une dépense (affichage flux/dashboard)
window.reconLinkedOrdersLabel = function(depense) {
    const ids = depense.order_ids || [];
    if (!ids.length) return '';
    const orders = reconAllOrders().filter(o => ids.includes(o.id));
    return orders.map(reconOrderLabel).join(' · ');
};

// Vue detaillee d'une depense rapprochee : references, montants, receptions, ecart
function reconLinkedDetailHtml(depense) {
    const ids = depense.order_ids || [];
    if (!ids.length) return '';
    const orders = reconAllOrders().filter(o => ids.includes(o.id));
    if (!orders.length) return '';
    const totalLinked = orders.reduce((sum, o) => sum + reconOrderTotal(o), 0);
    const paid = Number(depense.amount) || 0;
    const ecart = paid - totalLinked;
    const complet = Math.abs(ecart) < 0.01;
    return `
    <div style="margin-top:10px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px;">
            <span style="font-size:0.78rem; font-weight:600; color:var(--color-text-secondary); text-transform:uppercase; letter-spacing:0.4px;">Détail de la dépense</span>
            <span style="font-size:0.72rem; font-weight:700; padding:3px 10px; border-radius:12px; ${complet ? 'background:rgba(16,185,129,0.15); color:#059669;' : 'background:rgba(245,158,11,0.15); color:#b45309;'}">${complet ? '✓ Rapprochement complet' : 'Écart : ' + ecart.toFixed(2) + '€'}</span>
        </div>
        ${orders.map(o => `
            <div style="border:1px solid var(--color-border); border-radius:8px; padding:10px 12px; margin-bottom:8px; background:rgba(16,185,129,0.04);">
                <div style="display:flex; justify-content:space-between; gap:8px; align-items:baseline;">
                    <strong style="font-size:0.85rem;">${reconEscapeHtml(o.supplier || 'Commande')} · ${o.createdAt ? new Date(o.createdAt).toLocaleDateString('fr-FR') : '-'}</strong>
                    <span style="font-size:0.85rem; font-weight:700;">${reconOrderTotal(o).toFixed(2)}€</span>
                </div>
                <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:0.75rem;">
                    ${(o.items || []).map(i => `
                        <tr>
                            <td style="padding:3px 4px; border-top:1px solid var(--color-border);">${reconEscapeHtml(i.name || i.productId)}</td>
                            <td style="padding:3px 4px; border-top:1px solid var(--color-border); text-align:right; white-space:nowrap;">${i.qty} ${reconEscapeHtml(i.unit || '')} × ${(Number(i.unitPrice) || 0).toFixed(2)}€</td>
                            <td style="padding:3px 4px; border-top:1px solid var(--color-border); text-align:right; font-weight:600; white-space:nowrap;">${((Number(i.qty) || 0) * (Number(i.unitPrice) || 0)).toFixed(2)}€</td>
                        </tr>`).join('')}
                    ${(o.receptions || []).length ? `
                        <tr><td colspan="3" style="padding:5px 4px 2px; border-top:1px solid var(--color-border); font-size:0.7rem; color:#059669; font-weight:600;">Réception(s) :</td></tr>
                        ${(o.receptions || []).map(r => `
                            <tr>
                                <td style="padding:3px 4px; border-top:1px dashed var(--color-border); color:var(--color-text-secondary);">${r.date ? new Date(r.date).toLocaleDateString('fr-FR') : '-'} · ${(r.items || []).length} réf.</td>
                                <td style="padding:3px 4px; border-top:1px dashed var(--color-border); text-align:right; color:var(--color-text-secondary);">coût réel</td>
                                <td style="padding:3px 4px; border-top:1px dashed var(--color-border); text-align:right; font-weight:600;">${(Number(r.cost) || 0).toFixed(2)}€</td>
                            </tr>`).join('')}` : ''}
                </table>
            </div>`).join('')}
        <div style="display:flex; justify-content:space-between; padding:6px 12px; border-radius:6px; background:var(--color-bg-secondary,#f5f5f7); font-size:0.8rem;">
            <span>Total payé sur le relevé</span><strong>${paid.toFixed(2)}€</strong>
        </div>
        <div style="display:flex; justify-content:space-between; padding:6px 12px; border-radius:6px; background:var(--color-bg-secondary,#f5f5f7); font-size:0.8rem; margin-top:2px;">
            <span>Total des commandes liées</span><strong>${totalLinked.toFixed(2)}€</strong>
        </div>
    </div>`;
}
window.reconLinkedDetailHtml = reconLinkedDetailHtml;
