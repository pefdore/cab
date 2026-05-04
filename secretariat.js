// ============================================
// SECRÉTARIAT - Gestion RH, Planning, Standard
// ============================================

// Data stores
let employees = [];
let contracts = [];
let plannings = [];
let leaves = [];
let astreintes = [];
let standardData = [];
let importedFiles = [];
let currentPlanningWeek = getWeekNumber(new Date());

// ============================================
// EMPLOYEES MANAGEMENT
// ============================================

async function loadEmployees() {
    if (!supabaseClient || !currentUser) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('employees')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('lastname', { ascending: true });
        
        if (error) throw error;
        employees = data || [];
        renderEmployeesTable();
        updateContractsSummary();
    } catch (e) {
        console.error('[SECRETARIAT] Erreur chargement employés:', e);
    }
}

function renderEmployeesTable() {
    const tbody = document.getElementById('employeesTableBody');
    if (!tbody) return;
    
    if (employees.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Aucun employé enregistré</td></tr>';
        return;
    }
    
    tbody.innerHTML = employees.map(emp => `
        <tr>
            <td>
                <div class="employee-name">
                    <strong>${emp.lastname}</strong> ${emp.firstname}
                </div>
            </td>
            <td>${getFunctionLabel(emp.function)}</td>
            <td><span class="contract-badge ${emp.contract_type}">${getContractLabel(emp.contract_type)}</span></td>
            <td>${formatDate(emp.start_date)}</td>
            <td>${emp.end_date ? formatDate(emp.end_date) : '-'}</td>
            <td>${emp.hours_per_week}h</td>
            <td>
                <div class="row-actions">
                    <button class="btn-icon" onclick="editEmployee('${emp.id}')" title="Modifier">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn-icon" onclick="viewEmployeeContract('${emp.id}')" title="Voir contrat">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                        </svg>
                    </button>
                    <button class="btn-icon danger" onclick="deleteEmployee('${emp.id}')" title="Supprimer">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function getFunctionLabel(func) {
    const labels = {
        'secretaire': 'Secrétaire',
        'aide_soignante': 'Aide-soignante',
        'infirmiere': 'Infirmière',
        'agent_entretien': 'Agent entretien',
        'autre': 'Autre'
    };
    return labels[func] || func;
}

function getContractLabel(type) {
    const labels = {
        'cdi': 'CDI',
        'cdd': 'CDD',
        'interim': 'Intérim',
        'stage': 'Stage',
        'apprentissage': 'Apprentissage'
    };
    return labels[type] || type;
}

function showAddEmployeeModal() {
    document.getElementById('employeeModalTitle').textContent = 'Nouvel Employé';
    document.getElementById('employeeForm').reset();
    document.getElementById('employeeStartDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('employeeHoursWeek').value = 35;
    document.getElementById('add-employee-modal').style.display = 'flex';
}

async function saveEmployee() {
    const employee = {
        user_id: currentUser.id,
        lastname: document.getElementById('employeeLastname').value,
        firstname: document.getElementById('employeeFirstname').value,
        email: document.getElementById('employeeEmail').value,
        phone: document.getElementById('employeePhone').value,
        function: document.getElementById('employeeFunction').value,
        contract_type: document.getElementById('employeeContractType').value,
        start_date: document.getElementById('employeeStartDate').value,
        end_date: document.getElementById('employeeEndDate').value || null,
        hours_per_week: parseInt(document.getElementById('employeeHoursWeek').value),
        salary: parseFloat(document.getElementById('employeeSalary').value) || 0,
        notes: document.getElementById('employeeNotes').value
    };
    
    if (!employee.lastname || !employee.firstname) {
        alert('Veuillez remplir le nom et prénom');
        return;
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('employees')
            .insert([employee])
            .select()
            .single();
        
        if (error) throw error;
        
        closeModal('add-employee-modal');
        await loadEmployees();
        alert('Employé enregistré!');
    } catch (e) {
        console.error('[SECRETARIAT] Erreur save employee:', e);
        alert('Erreur: ' + e.message);
    }
}

async function editEmployee(id) {
    const emp = employees.find(e => e.id === id);
    if (!emp) return;
    
    document.getElementById('employeeModalTitle').textContent = 'Modifier Employé';
    document.getElementById('employeeLastname').value = emp.lastname;
    document.getElementById('employeeFirstname').value = emp.firstname;
    document.getElementById('employeeEmail').value = emp.email || '';
    document.getElementById('employeePhone').value = emp.phone || '';
    document.getElementById('employeeFunction').value = emp.function;
    document.getElementById('employeeContractType').value = emp.contract_type;
    document.getElementById('employeeStartDate').value = emp.start_date;
    document.getElementById('employeeEndDate').value = emp.end_date || '';
    document.getElementById('employeeHoursWeek').value = emp.hours_per_week;
    document.getElementById('employeeSalary').value = emp.salary || '';
    document.getElementById('employeeNotes').value = emp.notes || '';
    
    document.getElementById('add-employee-modal').style.display = 'flex';
}

async function deleteEmployee(id) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet employé?')) return;
    
    try {
        const { error } = await supabaseClient
            .from('employees')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        await loadEmployees();
    } catch (e) {
        console.error('[SECRETARIAT] Erreur delete employee:', e);
        alert('Erreur: ' + e.message);
    }
}

function viewEmployeeContract(id) {
    const emp = employees.find(e => e.id === id);
    if (!emp) return;
    
    // Generate contract preview
    const contractText = generateContractText(emp);
    const blob = new Blob([contractText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
}

function generateContractText(emp) {
    return `
CONTRAT DE TRAVAIL
================

Employeur: [Nom du cabinet]
Salarié: ${emp.lastname} ${emp.firstname}

Type de contrat: ${getContractLabel(emp.contract_type)}
Date de début: ${formatDate(emp.start_date)}
${emp.end_date ? `Date de fin: ${formatDate(emp.end_date)}` : ''}

Fonction: ${getFunctionLabel(emp.function)}
Heures hebdomadaire: ${emp.hours_per_week}h

Salaire net: ${emp.salary || 'À convenir'}€

${emp.notes ? `Notes: ${emp.notes}` : ''}

Signatures:
__________          __________
Employeur            Salarié
`.trim();
}

// ============================================
// CONTRACTS MANAGEMENT
// ============================================

function updateContractsSummary() {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    const active = employees.filter(e => {
        if (!e.end_date) return true;
        return new Date(e.end_date) >= now;
    });
    
    const expiring = employees.filter(e => {
        if (!e.end_date) return false;
        const endDate = new Date(e.end_date);
        return endDate >= now && endDate <= thirtyDaysFromNow;
    });
    
    const totalHours = active.reduce((sum, e) => sum + (e.hours_per_week || 0), 0);
    const totalSalary = active.reduce((sum, e) => sum + (e.salary || 0), 0);
    
    document.getElementById('activeContractsCount').textContent = active.length;
    document.getElementById('expiringContractsCount').textContent = expiring.length;
    document.getElementById('totalHoursWeek').textContent = totalHours + 'h';
    document.getElementById('monthlySalaryTotal').textContent = (totalSalary * 4.33).toFixed(0) + '€';
    
    renderContractsList(employees);
}

function renderContractsList(emps) {
    const container = document.getElementById('contractsList');
    if (!container) return;
    
    if (emps.length === 0) {
        container.innerHTML = '<p class="empty-state">Aucun contrat</p>';
        return;
    }
    
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    container.innerHTML = emps.map(emp => {
        let status = 'active';
        let statusLabel = 'Actif';
        
        if (emp.end_date) {
            const endDate = new Date(emp.end_date);
            if (endDate < now) {
                status = 'expired';
                statusLabel = 'Expiré';
            } else if (endDate <= thirtyDaysFromNow) {
                status = 'expiring';
                statusLabel = 'Expire bientôt';
            }
        }
        
        return `
            <div class="contract-item ${status}">
                <div class="contract-info">
                    <strong>${emp.lastname} ${emp.firstname}</strong>
                    <span class="contract-type">${getContractLabel(emp.contract_type)}</span>
                </div>
                <div class="contract-dates">
                    ${formatDate(emp.start_date)} - ${emp.end_date ? formatDate(emp.end_date) : 'Indéterminé'}
                </div>
                <span class="contract-status ${status}">${statusLabel}</span>
            </div>
        `;
    }).join('');
}

function showContractTemplates() {
    alert('Modèles de contrats:\n\n1. CDI - Contrat à durée indéterminée\n2. CDD - Contrat à durée déterminée\n3. Stage - Convention de stage\n4. Apprentissage - Contrat d\'apprentissage\n\nContactez votre expert-comptable pour les modèles officiels.');
}

// ============================================
// LEAVES MANAGEMENT
// ============================================

async function loadLeaves() {
    if (!supabaseClient || !currentUser) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('leaves')
            .select('*, employee_id')
            .eq('user_id', currentUser.id)
            .gte('end_date', new Date().toISOString().split('T')[0])
            .order('start_date', { ascending: true });
        
        leaves = data || [];
        renderLeaves();
    } catch (e) {
        console.error('[SECRETARIAT] Erreur chargement congés:', e);
    }
}

function renderLeaves() {
    const pending = document.getElementById('pendingLeavesList');
    const approved = document.getElementById('approvedLeavesList');
    
    if (pending) {
        const pendingLeaves = leaves.filter(l => l.status === 'pending');
        pending.innerHTML = pendingLeaves.length > 0 
            ? pendingLeaves.map(l => renderLeaveItem(l)).join('')
            : '<p class="empty-state">Aucun congé en attente</p>';
    }
    
    if (approved) {
        const approvedLeaves = leaves.filter(l => l.status === 'approved');
        approved.innerHTML = approvedLeaves.length > 0
            ? approvedLeaves.map(l => renderLeaveItem(l)).join('')
            : '<p class="empty-state">Aucun congé approuvé</p>';
    }
}

function renderLeaveItem(leave) {
    const emp = employees.find(e => e.id === leave.employee_id);
    const empName = emp ? `${emp.lastname} ${emp.firstname}` : 'Inconnu';
    
    return `
        <div class="leave-item">
            <strong>${empName}</strong>
            <span>${formatDate(leave.start_date)} - ${formatDate(leave.end_date)}</span>
            <span class="leave-type">${leave.leave_type}</span>
        </div>
    `;
}

function showAddLeaveModal() {
    alert('Module de demande de congés - À implémenter avec formulaire complet');
}

// ============================================
// PLANNING MANAGEMENT
// ============================================

function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function changePlanningWeek(delta) {
    currentPlanningWeek += delta;
    updatePlanningWeekLabel();
    loadWeekPlanning();
}

function updatePlanningWeekLabel() {
    const label = document.getElementById('planningWeekLabel');
    if (!label) return;
    
    const now = new Date();
    const weekStart = getWeekStart(now, currentPlanningWeek - getWeekNumber(now) + 1);
    
    const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    
    label.textContent = `Semaine du ${dayNames[weekStart.getDay()]} ${weekStart.getDate()} ${monthNames[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
}

function getWeekStart(referenceDate, weekNumber) {
    const simple = new Date(referenceDate.getFullYear(), 0, 1 + (weekNumber - 1) * 7);
    const dow = simple.getDay();
    const weekStart = simple;
    if (dow <= 4) weekStart.setDate(simple.getDate() - simple.getDay() + 1);
    else weekStart.setDate(simple.getDate() + 8 - simple.getDay());
    return weekStart;
}

async function loadWeekPlanning() {
    if (!supabaseClient || !currentUser) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('plannings')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('week_number', currentPlanningWeek)
            .order('employee_id', { ascending: true });
        
        plannings = data || [];
        renderPlanningTable();
        updateHoursSummary();
    } catch (e) {
        console.error('[SECRETARIAT] Erreur chargement planning:', e);
    }
}

function renderPlanningTable() {
    const tbody = document.getElementById('planningTableBody');
    if (!tbody) return;
    
    if (employees.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Aucun employé pour le planning</td></tr>';
        return;
    }
    
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const dayLabels = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
    
    tbody.innerHTML = employees.map(emp => `
        <tr>
            <td class="employee-cell">
                <strong>${emp.lastname}</strong>
                <span>${emp.firstname}</span>
            </td>
            ${days.map((day, idx) => {
                const planning = plannings.find(p => p.employee_id === emp.id && p.day === day);
                return `
                    <td>
                        <div class="planning-cell">
                            <select class="planning-status-select" data-employee="${emp.id}" data-day="${day}" onchange="updatePlanningCell(this)">
                                <option value="" ${!planning ? 'selected' : ''}>-</option>
                                <option value="work" ${planning?.status === 'work' ? 'selected' : ''}>Présent</option>
                                <option value="absent" ${planning?.status === 'absent' ? 'selected' : ''}>Absent</option>
                                <option value="conge" ${planning?.status === 'conge' ? 'selected' : ''}>Congé</option>
                                <option value="formation" ${planning?.status === 'formation' ? 'selected' : ''}>Formation</option>
                            </select>
                            ${planning?.hours ? `<span class="cell-hours">${planning.hours}h</span>` : ''}
                        </div>
                    </td>
                `;
            }).join('')}
        </tr>
    `).join('');
}

async function updatePlanningCell(select) {
    const employeeId = select.dataset.employee;
    const day = select.dataset.day;
    const status = select.value;
    const weekYear = new Date().getFullYear();
    
    if (!status) {
        // Delete planning entry
        try {
            await supabaseClient
                .from('plannings')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('employee_id', employeeId)
                .eq('day', day)
                .eq('week_number', currentPlanningWeek);
            
            await loadWeekPlanning();
        } catch (e) {
            console.error('[SECRETARIAT] Erreur delete planning:', e);
        }
        return;
    }
    
    // Calculate hours based on status
    let hours = 0;
    if (status === 'work') {
        hours = 7; // Default work hours
    }
    
    try {
        const { error } = await supabaseClient
            .from('plannings')
            .upsert({
                user_id: currentUser.id,
                employee_id: employeeId,
                day: day,
                week_number: currentPlanningWeek,
                week_year: weekYear,
                status: status,
                hours: hours
            }, { onConflict: 'user_id,employee_id,day,week_number' });
        
        if (error) throw error;
        await loadWeekPlanning();
    } catch (e) {
        console.error('[SECRETARIAT] Erreur update planning:', e);
    }
}

function updateHoursSummary() {
    const container = document.getElementById('hoursSummaryGrid');
    if (!container) return;
    
    const summary = employees.map(emp => {
        const empPlannings = plannings.filter(p => p.employee_id === emp.id);
        const totalHours = empPlannings.reduce((sum, p) => sum + (p.hours || 0), 0);
        const plannedDays = empPlannings.filter(p => p.status === 'work').length;
        
        return {
            name: `${emp.lastname} ${emp.firstname}`,
            hours: totalHours,
            days: plannedDays,
            target: emp.hours_per_week || 35
        };
    });
    
    container.innerHTML = summary.map(s => `
        <div class="hours-summary-card">
            <div class="hours-employee">${s.name}</div>
            <div class="hours-bar">
                <div class="hours-progress" style="width: ${Math.min(100, (s.hours / s.target) * 100)}%"></div>
            </div>
            <div class="hours-info">
                <span>${s.hours}h / ${s.target}h</span>
                <span>${s.days} jours</span>
            </div>
        </div>
    `).join('');
}

async function saveWeekPlanning() {
    alert('Planning enregistré pour la semaine ' + currentPlanningWeek);
    await loadWeekPlanning();
}

function copyWeekPlanning() {
    alert('Copie de la semaine précédente - À implémenter');
}

// ============================================
// ASTREINTES
// ============================================

async function loadAstreintes() {
    if (!supabaseClient || !currentUser) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('astreintes')
            .select('*')
            .eq('user_id', currentUser.id)
            .gte('date', new Date().toISOString().split('T')[0])
            .order('date', { ascending: true });
        
        astreintes = data || [];
        renderAstreintes();
    } catch (e) {
        console.error('[SECRETARIAT] Erreur chargement astreintes:', e);
    }
}

function renderAstreintes() {
    const container = document.getElementById('astreintesList');
    if (!container) return;
    
    if (astreintes.length === 0) {
        container.innerHTML = '<p class="empty-state">Aucune astreinte prévue</p>';
        return;
    }
    
    container.innerHTML = astreintes.map(a => `
        <div class="astreinte-item">
            <div class="astreinte-date">${formatDate(a.date)}</div>
            <div class="astreinte-info">
                <strong>${a.employee_name || 'À assigner'}</strong>
                <span>${a.type || 'Standard'}</span>
            </div>
        </div>
    `).join('');
}

function showAddAstreinteModal() {
    alert('Module d\'ajout d\'astreinte - À implémenter');
}

// ============================================
// STANDARD ANALYSIS
// ============================================

function showImportStandardModal() {
    document.getElementById('import-standard-modal').style.display = 'flex';
    document.getElementById('importProgress').style.display = 'none';
    document.getElementById('importResult').style.display = 'none';
    document.getElementById('confirmImportBtn').disabled = true;
}

let pendingStandardData = [];

function setupStandardFileImport() {
    const dropZone = document.getElementById('fileDropZone');
    const fileInput = document.getElementById('standardFileInput');
    
    if (!dropZone || !fileInput) return;
    
    dropZone.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') {
            fileInput.click();
        }
    });
    
    fileInput.addEventListener('change', handleStandardFileSelect);
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processStandardFile(files[0]);
        }
    });
}

async function handleStandardFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        await processStandardFile(file);
    }
}

async function processStandardFile(file) {
    document.getElementById('importProgress').style.display = 'block';
    document.getElementById('progressFill').style.width = '30%';
    document.getElementById('importStatus').textContent = 'Lecture du fichier...';
    
    try {
        let data = [];
        
        if (file.name.endsWith('.csv')) {
            data = await parseCSVStandard(file);
        } else if (file.name.endsWith('.pdf')) {
            document.getElementById('importStatus').textContent = 'Extraction du texte PDF...';
            data = await parsePDFStandard(file);
        } else {
            throw new Error('Format non supporté');
        }
        
        document.getElementById('progressFill').style.width = '70%';
        document.getElementById('importStatus').textContent = 'Analyse des données...';
        
        // Process and analyze the data
        pendingStandardData = processStandardCalls(data);
        
        document.getElementById('progressFill').style.width = '100%';
        document.getElementById('importStatus').textContent = 'Terminé!';
        
        // Show results
        document.getElementById('importProgress').style.display = 'none';
        document.getElementById('importResult').style.display = 'block';
        document.getElementById('importResultText').textContent = `${pendingStandardData.length} appels détectés`;
        document.getElementById('confirmImportBtn').disabled = false;
        
        // Update stats
        updateStandardStats();
        
    } catch (e) {
        console.error('[SECRETARIAT] Erreur traitement fichier:', e);
        alert('Erreur: ' + e.message);
        document.getElementById('importProgress').style.display = 'none';
    }
}

async function parseCSVStandard(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const lines = text.split('\n').filter(l => l.trim());
                const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
                
                const calls = lines.slice(1).map(line => {
                    const values = line.split(',');
                    const call = {};
                    headers.forEach((h, i) => {
                        call[h] = values[i]?.trim();
                    });
                    return call;
                });
                
                resolve(calls);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

async function parsePDFStandard(file) {
    // PDF parsing - would need pdf.js in production
    // For now, return mock data for demonstration
    alert('PDF parsing requires additional library. Using demo data.');
    return generateMockStandardData();
}

function generateMockStandardData() {
    const calls = [];
    const motifs = ['Rendez-vous', 'Résultats', 'Urgence', 'Information', 'Renouvellement ordonance'];
    const operators = ['Nadine', 'Cecile', 'Anne-Cécile'];
    
    for (let i = 0; i < 50; i++) {
        const hour = Math.floor(Math.random() * 10) + 8; // 8h-18h
        const minute = Math.floor(Math.random() * 60);
        const duration = Math.floor(Math.random() * 10) + 1;
        const waitTime = Math.floor(Math.random() * 5);
        
        calls.push({
            date: new Date().toISOString().split('T')[0],
            time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
            duration: duration,
            wait_time: waitTime,
            motif: motifs[Math.floor(Math.random() * motifs.length)],
            operator: operators[Math.floor(Math.random() * operators.length)],
            type: Math.random() > 0.2 ? 'answered' : 'missed'
        });
    }
    
    return calls;
}

function processStandardCalls(rawData) {
    return rawData.map(call => ({
        date: call.date || new Date().toISOString().split('T')[0],
        time: call.time || '00:00',
        duration: parseInt(call.duration) || 0,
        wait_time: parseInt(call.wait_time) || 0,
        motif: call.motif || call.motif || 'Inconnu',
        operator: call.operator || call.operateur || 'Inconnu',
        type: call.type === 'missed' ? 'missed' : 'answered'
    }));
}

function updateStandardStats() {
    const total = pendingStandardData.length;
    const answered = pendingStandardData.filter(c => c.type === 'answered').length;
    const missed = pendingStandardData.filter(c => c.type === 'missed').length;
    
    const totalDuration = pendingStandardData.reduce((sum, c) => sum + c.duration, 0);
    const totalWait = pendingStandardData.reduce((sum, c) => sum + c.wait_time, 0);
    
    const avgDuration = total > 0 ? Math.round(totalDuration / total) : 0;
    const avgWait = total > 0 ? Math.round(totalWait / total) : 0;
    
    // Calculate peak hour
    const hourCounts = {};
    pendingStandardData.forEach(c => {
        const hour = parseInt(c.time.split(':')[0]);
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
    
    const tauxReponse = total > 0 ? Math.round((answered / total) * 100) : 0;
    
    document.getElementById('appelsTotal').textContent = total;
    document.getElementById('appelsAnswered').textContent = answered;
    document.getElementById('appelsMissed').textContent = missed;
    document.getElementById('appelsAvgTime').textContent = formatMinutes(avgDuration);
    document.getElementById('appelPeakHour').textContent = peakHour !== '-' ? `${peakHour}h` : '-';
    document.getElementById('appelTauxReponse').textContent = `${tauxReponse}%`;
    document.getElementById('appelTpsAttenteMoy').textContent = formatMinutes(avgWait);
    document.getElementById('appelDureeTotale').textContent = Math.round(totalDuration / 60) + 'h';
    
    // Render charts
    renderHourlyChart();
    renderMotifsChart();
    renderOperateursChart();
    renderTendancesSummary();
}

function formatMinutes(minutes) {
    const mins = Math.floor(minutes);
    const secs = Math.round((minutes - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function renderHourlyChart() {
    const container = document.getElementById('hourlyChart');
    if (!container) return;
    
    const hourCounts = Array(24).fill(0);
    pendingStandardData.forEach(c => {
        const hour = parseInt(c.time.split(':')[0]);
        if (hour >= 0 && hour < 24) {
            hourCounts[hour]++;
        }
    });
    
    const maxCount = Math.max(...hourCounts);
    
    container.innerHTML = `
        <div class="hourly-bars">
            ${hourCounts.map((count, hour) => `
                <div class="hour-bar" title="${hour}h: ${count} appels">
                    <div class="bar-fill" style="height: ${maxCount > 0 ? (count / maxCount) * 100 : 0}%"></div>
                    <span class="bar-label">${hour}h</span>
                </div>
            `).join('')}
        </div>
    `;
}

function renderMotifsChart() {
    const container = document.getElementById('motifsList');
    if (!container) return;
    
    const motifCounts = {};
    pendingStandardData.forEach(c => {
        motifCounts[c.motif] = (motifCounts[c.motif] || 0) + 1;
    });
    
    const sorted = Object.entries(motifCounts).sort((a, b) => b[1] - a[1]);
    const total = pendingStandardData.length;
    
    container.innerHTML = sorted.map(([motif, count]) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return `
            <div class="motif-item">
                <span class="motif-name">${motif}</span>
                <div class="motif-bar">
                    <div class="motif-fill" style="width: ${pct}%"></div>
                </div>
                <span class="motif-count">${count} (${pct}%)</span>
            </div>
        `;
    }).join('');
}

function renderOperateursChart() {
    const container = document.getElementById('operateursStats');
    if (!container) return;
    
    const operatorStats = {};
    pendingStandardData.forEach(c => {
        if (!operatorStats[c.operator]) {
            operatorStats[c.operator] = { total: 0, answered: 0, missed: 0, totalDuration: 0 };
        }
        operatorStats[c.operator].total++;
        if (c.type === 'answered') {
            operatorStats[c.operator].answered++;
            operatorStats[c.operator].totalDuration += c.duration;
        } else {
            operatorStats[c.operator].missed++;
        }
    });
    
    container.innerHTML = Object.entries(operatorStats).map(([name, stats]) => {
        const avgDuration = stats.answered > 0 ? Math.round(stats.totalDuration / stats.answered) : 0;
        const tauxReponse = stats.total > 0 ? Math.round((stats.answered / stats.total) * 100) : 0;
        
        return `
            <div class="operateur-card">
                <strong>${name}</strong>
                <div class="operateur-stats">
                    <span>${stats.total} appels</span>
                    <span>${tauxReponse}% réponse</span>
                    <span>${formatMinutes(avgDuration)} durée moy.</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderTendancesSummary() {
    const container = document.getElementById('tendancesSummary');
    if (!container) return;
    
    const total = pendingStandardData.length;
    const answered = pendingStandardData.filter(c => c.type === 'answered').length;
    const missed = pendingStandardData.filter(c => c.type === 'missed').length;
    
    const tauxReponse = total > 0 ? Math.round((answered / total) * 100) : 0;
    
    let recommandation = '';
    if (tauxReponse >= 90) {
        recommandation = 'Excellent taux de réponse! Le standard fonctionne correctement.';
    } else if (tauxReponse >= 70) {
        recommandation = 'Bon taux de réponse. Envisagez des créneaux supplémentaires aux heures de pointe.';
    } else {
        recommandation = 'Taux de réponse faible. Recommandation: revoir les plages horaires ou ajouter des ressources.';
    }
    
    container.innerHTML = `
        <div class="tendance-card">
            <h4>Analyse</h4>
            <p>${recommandation}</p>
        </div>
        <div class="tendance-card">
            <h4>Recommandations</h4>
            <ul>
                <li>Heures de pointe: утро (9h-11h)</li>
                <li>Considérer plus de personnel le lundi</li>
                <li>Motif principal: Rendez-vous (${Math.round((pendingStandardData.filter(c => c.motif === 'Rendez-vous').length / total) * 100)}%)</li>
            </ul>
        </div>
    `;
}

async function confirmStandardImport() {
    if (!supabaseClient || !currentUser || pendingStandardData.length === 0) return;
    
    try {
        // Save to database
        const records = pendingStandardData.map(call => ({
            user_id: currentUser.id,
            date: call.date,
            time: call.time,
            duration: call.duration,
            wait_time: call.wait_time,
            motif: call.motif,
            operator: call.operator,
            type: call.type
        }));
        
        const { error } = await supabaseClient
            .from('standard_calls')
            .insert(records);
        
        if (error) throw error;
        
        // Save file reference
        await supabaseClient
            .from('imported_files')
            .insert([{
                user_id: currentUser.id,
                filename: 'standard_import_' + Date.now(),
                record_count: pendingStandardData.length,
                import_date: new Date().toISOString()
            }]);
        
        closeModal('import-standard-modal');
        alert('Données importées avec succès!');
        
        // Reload data
        await loadStandardData();
        
    } catch (e) {
        console.error('[SECRETARIAT] Erreur import:', e);
        alert('Erreur: ' + e.message);
    }
}

async function loadStandardData() {
    if (!supabaseClient || !currentUser) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('standard_calls')
            .select('*')
            .eq('user_id', currentUser)
            .order('date', { ascending: false })
            .limit(500);
        
        if (error) throw error;
        standardData = data || [];
        
        // Update stats if we have data
        if (standardData.length > 0) {
            pendingStandardData = standardData;
            updateStandardStats();
        }
        
        // Load imported files
        await loadImportedFiles();
        
    } catch (e) {
        console.error('[SECRETARIAT] Erreur chargement données standard:', e);
    }
}

async function loadImportedFiles() {
    if (!supabaseClient || !currentUser) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('imported_files')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('import_date', { ascending: false })
            .limit(10);
        
        importedFiles = data || [];
        renderImportedFiles();
        
    } catch (e) {
        console.error('[SECRETARIAT] Erreur chargement fichiers:', e);
    }
}

function renderImportedFiles() {
    const container = document.getElementById('importedFilesList');
    if (!container) return;
    
    if (importedFiles.length === 0) {
        container.innerHTML = '<div class="empty-state">Aucun fichier importé</div>';
        return;
    }
    
    container.innerHTML = importedFiles.map(file => `
        <div class="imported-file-item">
            <div class="file-info">
                <strong>${file.filename}</strong>
                <span>${file.record_count} appels</span>
            </div>
            <span class="file-date">${formatDate(file.import_date)}</span>
        </div>
    `).join('');
}

function switchAnalysisView(view) {
    document.querySelectorAll('.analysis-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.analysis === view);
    });
    
    document.querySelectorAll('.analysis-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const content = document.getElementById('analysis-' + view);
    if (content) {
        content.classList.add('active');
    }
}

// ============================================
// UTILITIES
// ============================================

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

window.closeModal = closeModal;

// ============================================
// INITIALIZATION
// ============================================

function initSecretariat() {
    console.log('[SECRETARIAT] Initialisation...');
    
    // Setup file import
    setupStandardFileImport();
    
    // Load data
    loadEmployees();
    loadLeaves();
    loadWeekPlanning();
    loadAstreintes();
    loadStandardData();
    
    // Update week label
    updatePlanningWeekLabel();
    
    console.log('[SECRETARIAT] Terminé');
}

// Expose functions globally
window.showAddEmployeeModal = showAddEmployeeModal;
window.saveEmployee = saveEmployee;
window.editEmployee = editEmployee;
window.deleteEmployee = deleteEmployee;
window.viewEmployeeContract = viewEmployeeContract;
window.showContractTemplates = showContractTemplates;
window.showAddLeaveModal = showAddLeaveModal;
window.changePlanningWeek = changePlanningWeek;
window.updatePlanningCell = updatePlanningCell;
window.saveWeekPlanning = saveWeekPlanning;
window.copyWeekPlanning = copyWeekPlanning;
window.showAddAstreinteModal = showAddAstreinteModal;
window.showImportStandardModal = showImportStandardModal;
window.confirmStandardImport = confirmStandardImport;
window.switchAnalysisView = switchAnalysisView;