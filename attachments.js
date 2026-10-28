// ===== Pièces jointes sur les lignes de flux (dépenses / recettes) =====
// Permet d'associer un document (déjà uploadé dans la partie Documents)
// à une ligne de flux. Le lien est stocké dans document_id.

function attachEscapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function attachGetDocuments() {
    try {
        if (typeof allDocuments !== 'undefined' && Array.isArray(allDocuments) && allDocuments.length) return allDocuments;
    } catch (e) {}
    return (typeof documentsList !== 'undefined' && Array.isArray(documentsList)) ? documentsList : [];
}

// Modal : liste les documents de l'utilisateur pour association
window.openAttachModal = async function(movementId, isDepense) {
    let docs = attachGetDocuments();
    if (!docs.length && typeof loadDocuments === 'function') {
        try { await loadDocuments(); } catch (e) {}
        docs = attachGetDocuments();
    }
    if (!docs.length) {
        alert('Aucun document disponible. Uploadez d\'abord la pièce (facture, justificatif...) dans la partie Documents.');
        return;
    }

    const existing = document.getElementById('attachModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'attachModal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'display:flex; z-index:10002;';
    modal.innerHTML = `
        <div class="modal-card" style="max-width:520px; width:95%; max-height:80vh; display:flex; flex-direction:column;">
            <div class="modal-header" style="padding:14px 18px; border-bottom:1px solid var(--color-border);">
                <h3 style="margin:0; font-size:1rem;">📎 Associer une pièce jointe</h3>
                <button class="modal-close" onclick="closeAttachModal()">✕</button>
            </div>
            <div class="modal-body" style="padding:14px 18px; overflow-y:auto;">
                <p style="font-size:0.78rem; color:var(--color-text-secondary); margin:0 0 10px;">Sélectionnez un document déjà importé :</p>
                <input type="text" id="attachSearch" class="form-input" placeholder="Rechercher un document..." style="margin-bottom:10px; width:100%; box-sizing:border-box;" oninput="filterAttachList()">
                <div id="attachDocList">
                    ${docs.map(d => `
                        <label data-name="${attachEscapeHtml((d.file_name || '') + ' ' + (d.description || ''))}" style="display:flex; align-items:center; gap:10px; padding:9px 10px; border:1px solid var(--color-border); border-radius:8px; margin-bottom:7px; cursor:pointer;">
                            <input type="radio" name="attachDoc" value="${d.id}" onchange="selectAttachDoc('${d.id}')" style="margin:0;">
                            <div style="flex:1; min-width:0;">
                                <div style="font-size:0.82rem; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${attachEscapeHtml(d.file_name || 'Document')}</div>
                                <div style="font-size:0.7rem; color:var(--color-text-secondary);">${attachEscapeHtml(d.category || '')} ${d.doc_date ? '· ' + d.doc_date : ''}</div>
                            </div>
                        </label>`).join('')}
                </div>
            </div>
            <div style="padding:12px 18px; border-top:1px solid var(--color-border); display:flex; justify-content:flex-end; gap:10px;">
                <button class="btn-secondary" onclick="detachDocument('${movementId}', ${isDepense})" style="font-size:0.8rem;">Retirer la pièce</button>
                <button class="btn-primary" style="font-size:0.8rem;" onclick="saveAttach('${movementId}', ${isDepense})">Associer</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    window._attachSelectedDoc = null;
};

window.closeAttachModal = function() {
    document.getElementById('attachModal')?.remove();
};

window.filterAttachList = function() {
    const q = (document.getElementById('attachSearch').value || '').toLowerCase();
    document.querySelectorAll('#attachDocList label').forEach(el => {
        el.style.display = el.dataset.name.toLowerCase().includes(q) ? 'flex' : 'none';
    });
};

window.selectAttachDoc = function(docId) {
    window._attachSelectedDoc = docId;
};

window.saveAttach = async function(movementId, isDepense) {
    const docId = window._attachSelectedDoc;
    if (!docId) { alert('Sélectionnez un document.'); return; }
    const table = isDepense ? 'cabinet_depenses' : 'cabinet_recettes';
    try {
        const { error } = await supabaseClient.from(table).update({ document_id: docId }).eq('id', movementId);
        if (error) throw error;
        const list = isDepense ? cabinetDepenses : cabinetRecettes;
        const item = list.find(x => String(x.id) === String(movementId));
        if (item) item.document_id = docId;
        closeAttachModal();
        if (typeof showToast === 'function') showToast('Pièce jointe associée 📎');
        if (typeof renderFluxView === 'function') renderFluxView();
    } catch (e) {
        alert('Erreur: ' + e.message);
    }
};

window.detachDocument = async function(movementId, isDepense) {
    const table = isDepense ? 'cabinet_depenses' : 'cabinet_recettes';
    try {
        const { error } = await supabaseClient.from(table).update({ document_id: null }).eq('id', movementId);
        if (error) throw error;
        const list = isDepense ? cabinetDepenses : cabinetRecettes;
        const item = list.find(x => String(x.id) === String(movementId));
        if (item) item.document_id = null;
        closeAttachModal();
        if (typeof showToast === 'function') showToast('Pièce jointe retirée');
        if (typeof renderFluxView === 'function') renderFluxView();
    } catch (e) {
        alert('Erreur: ' + e.message);
    }
};

// Ouvre le document lié à une ligne
window.openAttachedDoc = function(docId) {
    const docs = attachGetDocuments();
    const d = docs.find(x => String(x.id) === String(docId));
    if (d && d.file_url) {
        window.open(d.file_url, '_blank');
    } else {
        alert('Document introuvable ou supprimé.');
    }
};
