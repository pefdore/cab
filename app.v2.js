const SUPABASE_URL = 'https://wlpbnxnvctlmhndqvvim.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndscGJueG52Y3RsbWhuZHF2dmltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NjgxMTAsImV4cCI6MjA5MjU0NDExMH0.ob6hctrkA7dTzKLUGG4Ymt1iemcgDnbsCtBwgBZPHoM';

// ============================================
// AUTHENTIFICATION - Module complet et robuste
// ============================================

let supabaseClient = null;
let currentUser = null;
let currentProfile = null;
let authInitialized = false;

// --- Initialisation du client Supabase ---
function initAuth() {
    if (authInitialized) return;
    
    if (typeof supabase === 'undefined') {
        console.log('[AUTH] Waiting for Supabase library...');
        setTimeout(initAuth, 100);
        return;
    }
    
    const { createClient } = supabase;
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[AUTH] Client Supabase initialisé');
    
    // Écouter les changements d'état d'authentification
    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log('[AUTH] State change:', event, session ? 'session exists' : 'no session');
        
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            onAuthSuccess();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            currentProfile = null;
            onAuthLogout();
        } else if (event === 'TOKEN_REFRESHED' && session) {
            currentUser = session.user;
        }
    });
    
    // Vérifier si une session existe déjà
    checkExistingSession();
    
    authInitialized = true;
}

async function checkExistingSession() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            console.log('[AUTH] Session existante trouvée');
            currentUser = session.user;
            onAuthSuccess();
        } else {
            console.log('[AUTH] Aucune session, affichage login');
            onAuthLogout();
        }
    } catch (e) {
        console.error('[AUTH] Erreur vérification session:', e);
        onAuthLogout();
    }
}

async function onAuthSuccess() {
    console.log('[AUTH] Connexion réussie, user:', currentUser?.email, 'id:', currentUser?.id);
    
    // Masquer écran login, afficher app
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app-container');
    
    if (loginScreen) loginScreen.style.display = 'none';
    if (appContainer) appContainer.style.display = 'flex';
    
    // Initialize UI first
    updateMonthDisplay();
    setDefaultDate();
    populateCotationSelect();
    
    // Setup event listeners
    setupEventListeners();
    
    // Load user data (async) - sans basculer sur dashboard encore
    loadUserProfile();
    loadUserSettings();
    
    try {
        console.log('[AUTH] Calling loadData...');
        await loadData();
        console.log('[AUTH] loadData completed, entries:', entries.length);
    } catch (e) {
        console.error('[AUTH] loadData error:', e);
    }
    
    try {
        await loadPatients();
        console.log('[AUTH] loadPatients completed, patients:', patients.length);
    } catch (e) {
        console.error('[AUTH] loadPatients error:', e);
    }
    
    // NOW switch to dashboard and render - data is ready
    switchView('dashboard');
    
    console.log('[AUTH] App fully initialized');
}

function onAuthLogout() {
    console.log('[AUTH] Déconnexion');
    
    currentUser = null;
    currentProfile = null;
    entries = [];
    patients = [];
    
    // Masquer app, afficher login
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app-container');
    
    if (loginScreen) loginScreen.style.display = 'flex';
    if (appContainer) appContainer.style.display = 'none';
}

// --- Fonctions d'authentification ---
async function doLogin(email, password) {
    console.log('[AUTH] Tentative de connexion:', email);
    console.log('[AUTH] supabaseClient defined:', !!supabaseClient);
    console.log('[AUTH] supabaseClient:', supabaseClient);
    
    // Récupérer depuis le form si pas fournis
    if (!email) email = document.getElementById('login-email')?.value;
    if (!password) password = document.getElementById('login-password')?.value;
    
    if (!email || !password) {
        showError('Veuillez entrer email et mot de passe');
        return;
    }
    
    if (!supabaseClient) {
        showError('Erreur: client Supabase non initialisé. Rafraîchissez la page.');
        return;
    }
    
    try {
        const button = document.querySelector('#loginBtn');
        if (button) {
            button.disabled = true;
            button.textContent = 'Connexion...';
        }
        
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) {
            console.error('[AUTH] Erreur login:', error);
            showError(error.message);
            return;
        }
        
        if (data?.user) {
            console.log('[AUTH] Connexion réussie');
            currentUser = data.user;
            // onAuthSuccess sera appelé par le listener
        }
        
    } catch (e) {
        console.error('[AUTH] Exception login:', e);
        showError('Erreur de connexion: ' + e.message);
    } finally {
        const button = document.querySelector('#loginBtn');
        if (button) {
            button.disabled = false;
            button.textContent = 'Se connecter';
        }
    }
}

async function doSignUp(email, password, firstName, lastName, role, replaceMedecinId) {
    console.log('[AUTH] Tentative inscription:', email);
    
    if (!email || !password || !firstName || !lastName || !role) {
        showError('Veuillez remplir tous les champs');
        return;
    }
    
    if (role === 'medecin_remplacant' && !replaceMedecinId) {
        showError('Veuillez sélectionner le médecin que vous remplacez');
        return;
    }
    
    try {
        const button = document.querySelector('#register-form button[type="submit"]');
        if (button) {
            button.disabled = true;
            button.textContent = 'Création...';
        }
        
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: {
                    first_name: firstName,
                    last_name: lastName,
                    role: role,
                    remplace_medecin_id: replaceMedecinId
                }
            }
        });
        
        if (error) {
            showError(error.message);
            return;
        }
        
        alert('Compte créé! Veuillez vérifier votre email pour confirmer votre adresse.');
        showLoginForm();
        
    } catch (e) {
        showError('Erreur: ' + e.message);
    } finally {
        const button = document.querySelector('#register-form button[type="submit"]');
        if (button) {
            button.disabled = false;
            button.textContent = 'Créer mon compte';
        }
    }
}

async function doSignOut() {
    console.log('[AUTH] Déconnexion...');
    
    try {
        await supabaseClient.auth.signOut();
        // onAuthLogout sera appelé par le listener
    } catch (e) {
        console.error('[AUTH] Erreur déconnexion:', e);
    }
}

async function loadUserProfile() {
    if (!currentUser) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .eq('user_id', currentUser.id)
            .single();
        
        if (!error && data) {
            currentProfile = data;
            console.log('[AUTH] Profil chargé:', currentProfile.role);
        }
    } catch (e) {
        console.error('[AUTH] Erreur chargement profil:', e);
    }
}

async function loadUserSettings() {
    if (!currentUser) return;
    
    try {
        const { data } = await supabaseClient
            .from('user_settings')
            .select('key, value')
            .eq('user_id', currentUser.id);
        
        if (data) {
            data.forEach(s => {
                settings[s.key] = s.value;
            });
        }
        renderLogoPreview();
    } catch (e) {
        console.error('[AUTH] Erreur chargement settings:', e);
    }
}

// --- Setup des écouteurs d'événements ---
function setupAuthListeners() {
    console.log('[AUTH] Setup des listeners');
    
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            doLogin();
        });
    }
    
    // Register form
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const firstName = document.getElementById('register-firstname')?.value;
            const lastName = document.getElementById('register-lastname')?.value;
            const role = document.getElementById('register-role')?.value;
            const replaceMedecinId = document.getElementById('register-remplace')?.value || null;
            const email = document.getElementById('register-email')?.value;
            const password = document.getElementById('register-password')?.value;
            doSignUp(email, password, firstName, lastName, role, replaceMedecinId);
        });
    }
    
    // Show register link
    const showRegister = document.getElementById('show-register');
    if (showRegister) {
        showRegister.addEventListener('click', () => {
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('login-toggle').style.display = 'none';
            document.getElementById('register-form').style.display = 'flex';
        });
    }
    
    // Show login link
    const showLoginLink = document.getElementById('show-login');
    if (showLoginLink) {
        showLoginLink.addEventListener('click', showLoginForm);
    }
    
    // Logout buttons
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', doSignOut);
    }
    
    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    if (mobileLogoutBtn) {
        mobileLogoutBtn.addEventListener('click', doSignOut);
    }
}

function showLoginForm() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginToggle = document.getElementById('login-toggle');
    
    if (loginForm) loginForm.style.display = 'flex';
    if (registerForm) registerForm.style.display = 'none';
    if (loginToggle) loginToggle.style.display = 'block';
}

function showError(message) {
    alert(message);
}

// Exposer les fonctions pour les onclick HTML
window.doLogin = doLogin;
window.doSignUp = doSignUp;
window.doSignOut = doSignOut;
window.showApp = onAuthSuccess;

// ============================================
// FIN AUTHENTIFICATION
// ============================================

// App state - ALL variables
let currentDate = new Date();
let entries = [];
let patients = [];
let settings = { logo: null, signature: null };
let vlHistory = [];
let history = [];
let selectedPatientId = null;

// COTATIONS config
const COTATIONS = {
    'EHPAD': {
        'G': 30,
        'VG': 30,
        'VG+MD': 40,
        'VG+MU': 52.6,
        'ALQP003': 69.12,
        'VL': 60,
        'VL+MD': 70,
        'VG+MD+MSH': 63,
        'VG+MD+2IK': 41.22
    }
};

// Cabinet accounting categories
const CABINET_CATEGORIES = {
    'masse_salariale': {
        label: 'Masse salariale',
        sous: ['Nadine salaire net', 'Nadine prime net', 'Cécilia salaire net', 'Cécilia prime net', 'Anne Cécile salaire net', 'Anne Cécile prime net', 'Femme de ménage 1 net', 'Femme de ménage 2 net']
    },
    'urssaf': {
        label: 'URSSAF',
        sous: ['URSSAF']
    },
    'logiciel': {
        label: 'Logiciel',
        sous: ['Axisanté', 'CGM', 'AxiMessage', 'Vidal', 'Télétransmission', 'KelDoc', 'DOCTOLIB']
    },
    'services': {
        label: 'Services',
        sous: ['Semaphors', 'BNP Lease Group', 'Leascom', 'Acor', 'Orange', 'Compta\'Com', 'Séché healthcare', 'BNP', 'SCPA', 'OPCO EP', 'SCP ODY', 'KEYYO', 'APICEM', 'ONET sécurité', 'PST 35', 'HC-LEX']
    },
    'charges': {
        label: 'Charges',
        sous: ['Electricité', 'Eau', 'ASSURANCE MMA', 'DGFIP', 'CFE']
    },
    'consommables': {
        label: 'Consommables',
        sous: ['Azote', 'Draps d\'examens', 'Papiers mains', 'Savons', 'SHA', 'Masques', 'Papiers pour impressions', 'Cartouches d\'encre', 'Fournitures diverses', 'Papier ECG', 'Pharmacie', 'CADHOC', 'Café']
    },
    'materiel': {
        label: 'Matériel',
        sous: ['Lecteurs CV', 'Imprimante', 'Ordinateur']
    },
    'reception': {
        label: 'Réception/Représentation',
        sous: ['Cadeaux', 'Repas']
    }
};

const RECETTE_CATEGORIES = {
    'honoraires': { label: 'Honoraires', sous: ['Consultations', 'Visites', 'Actes techniques'] },
    'remboursements': { label: 'Remboursements', sous: ['Assurance', 'CPAM', 'Mutuelle'] },
    'autres': { label: 'Autres recettes', sous: ['Subventions', 'Dons', 'Autres'] }
};

const VL_COTATIONS = ['VL', 'VL+MD', 'VSP', 'IMT'];

function switchDashboardMode(mode) {
    document.querySelectorAll('.switch-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    
    const cotationDash = document.getElementById('cotation-dashboard');
    const cabinetDash = document.getElementById('cabinet-dashboard');
    
    console.log('[DASH] switchDashboardMode:', mode, 'cotationDash:', !!cotationDash, 'cabinetDash:', !!cabinetDash);
    
    if (mode === 'cotation') {
        if (cotationDash) {
            cotationDash.style.display = 'block';
            console.log('[DASH] Showing cotation-dashboard');
        }
        if (cabinetDash) {
            cabinetDash.style.display = 'none';
            console.log('[DASH] Hiding cabinet-dashboard');
        }
    } else {
        if (cotationDash) {
            cotationDash.style.display = 'none';
            console.log('[DASH] Hiding cotation-dashboard');
        }
        if (cabinetDash) {
            cabinetDash.style.display = 'block';
            console.log('[DASH] Showing cabinet-dashboard');
            loadCabinetData();
        }
    }
}

window.switchDashboardMode = switchDashboardMode;

// --- Month management ---
let currentMonthAdd = new Date();

function updateMonthDisplay() {
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const display = document.getElementById('currentMonthAdd');
    if (display) {
        display.textContent = monthNames[currentMonthAdd.getMonth()] + ' ' + currentMonthAdd.getFullYear();
    }
}

function changeMonth(delta) {
    currentMonthAdd.setMonth(currentMonthAdd.getMonth() + delta);
    updateMonthDisplay();
    renderEntries();
}

function setDefaultDate() {
    const dateInput = document.getElementById('visitDate');
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
}

function populateCotationSelect() {
    const select = document.getElementById('cotation');
    if (!select) return;
    
    // Default cotations
    const cotations = [
        { key: 'CS', amount: 26.50 },
        { key: 'CS+MD', amount: 31.50 },
        { key: 'CC', amount: 23.00 },
        { key: 'CC+MD', amount: 28.00 },
        { key: 'CNPSY', amount: 54.00 },
        { key: 'CNP', amount: 46.00 },
        { key: 'VL', amount: 60.00 },
        { key: 'VL+MD', amount: 70.00 },
        { key: 'AMC', amount: 30.00 },
        { key: 'AMI', amount: 26.50 },
        { key: 'DI', amount: 30.00 },
        { key: 'FP', amount: 26.50 },
        { key: 'VSP', amount: 60.00 },
        { key: 'IMT', amount: 36.00 }
    ];
    
    select.innerHTML = '<option value="">Sélectionner...</option>';
    cotations.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.key + '|' + c.amount;
        opt.textContent = c.key + ' - ' + c.amount.toFixed(2) + '€';
        select.appendChild(opt);
    });
}

function setupMobileMonthSelector() {
    // Mobile month selector - no special setup needed for now
}

async function saveCustomCotation() {
    const key = document.getElementById('customCotationKey').value;
    const amount = document.getElementById('customCotationAmount').value;
    
    if (!key || !amount) {
        alert('Veuillez entrer une clé et un montant');
        return;
    }
    
    // Save to user settings (as JSON string)
    const currentSettings = JSON.parse(localStorage.getItem('userSettings') || '{}');
    const customCotations = currentSettings.customCotations || [];
    customCotations.push({ key, amount: parseFloat(amount) });
    currentSettings.customCotations = customCotations;
    localStorage.setItem('userSettings', JSON.stringify(currentSettings));
    
    // Refresh cotation select
    populateCotationSelect();
    
    document.getElementById('customCotationKey').value = '';
    document.getElementById('customCotationAmount').value = '';
    document.getElementById('customCotation').style.display = 'none';
}

async function addNewCotationFromSettings() {
    const key = document.getElementById('newCotationKey').value;
    const amount = document.getElementById('newCotationAmount').value;
    
    if (!key || !amount) {
        alert('Veuillez entrer une clé et un montant');
        return;
    }
    
    const currentSettings = JSON.parse(localStorage.getItem('userSettings') || '{}');
    const customCotations = currentSettings.customCotations || [];
    customCotations.push({ key, amount: parseFloat(amount) });
    currentSettings.customCotations = customCotations;
    localStorage.setItem('userSettings', JSON.stringify(currentSettings));
    
    renderSettingsCotationList();
    populateCotationSelect();
    
    document.getElementById('newCotationKey').value = '';
    document.getElementById('newCotationAmount').value = '';
}

async function handleSubmit(e) {
    e.preventDefault();
    
    const patientName = document.getElementById('patientName').value;
    const date = document.getElementById('visitDate').value;
    const location = document.getElementById('visitLocation').value;
    const cotationValue = document.getElementById('cotation').value;
    
    if (!patientName || !date || !location || !cotationValue) {
        alert('Veuillez remplir tous les champs');
        return;
    }
    
    const [cotation, amount] = cotationValue.split('|');
    
    // Get or create patient
    let patientId = patients.find(p => p.name.toLowerCase() === patientName.toLowerCase())?.id;
    
    if (!patientId) {
        // Create new patient
        const { data: newPatient, error: patientError } = await supabaseClient
            .from('patients')
            .insert([{ user_id: currentUser.id, name: patientName }])
            .select()
            .single();
        
        if (patientError) {
            alert('Erreur patient: ' + patientError.message);
            return;
        }
        patientId = newPatient.id;
    }
    
    // Get month key
    const dateObj = new Date(date);
    const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
    
    // Create passage
    const { error } = await supabaseClient
        .from('passages')
        .insert([{
            user_id: currentUser.id,
            patient_id: patientId,
            date: date,
            location: location,
            cotation: cotation,
            amount: parseFloat(amount),
            month_key: monthKey
        }]);
    
    if (error) {
        alert('Erreur: ' + error.message);
        return;
    }
    
    // Reset form
    document.getElementById('patientName').value = '';
    document.getElementById('visitDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('cotation').value = '';
    document.getElementById('amountDisplay').textContent = '0€';
    
    // Reload data
    await loadData();
    await loadPatients();
    renderEntries();
    updateStats();
    renderCharts();
    
    alert('Passage enregistré!');
}

function handleLocationChange() {
    // Location change handler - could add logic here
}

function handleCotationChange() {
    const select = document.getElementById('cotation');
    const amountDisplay = document.getElementById('amountDisplay');
    
    if (select && amountDisplay) {
        const value = select.value;
        if (value) {
            const amount = value.split('|')[1];
            amountDisplay.textContent = parseFloat(amount).toFixed(2) + '€';
        } else {
            amountDisplay.textContent = '0€';
        }
    }
}

function handlePatientSearch(e) {
    const query = e.target.value.toLowerCase();
    const dropdown = document.getElementById('autocomplete-dropdown');
    
    if (query.length < 2) {
        dropdown.classList.remove('active');
        return;
    }
    
    const matches = patients.filter(p => p.name.toLowerCase().includes(query)).slice(0, 5);
    
    if (matches.length === 0) {
        dropdown.classList.remove('active');
        return;
    }
    
    dropdown.innerHTML = matches.map(p => 
        `<div class="autocomplete-item" data-name="${p.name}">${p.name}</div>`
    ).join('');
    
    dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
            document.getElementById('patientName').value = item.dataset.name;
            dropdown.classList.remove('active');
        });
    });
    
    dropdown.classList.add('active');
}

function renderSettingsCotationList() {
    const container = document.getElementById('settingsCotationList');
    if (!container) return;
    
    const settings = JSON.parse(localStorage.getItem('userSettings') || '{}');
    const customCotations = settings.customCotations || [];
    
    if (customCotations.length === 0) {
        container.innerHTML = '<p style="color: var(--color-text-secondary);">Aucune cotation personnalisée</p>';
        return;
    }
    
    container.innerHTML = customCotations.map((c, i) => `
        <div class="cotation-item">
            <span>${c.key}</span>
            <span>${c.amount.toFixed(2)}€</span>
            <button onclick="deleteCotation(${i})" style="color: var(--color-danger);">Supprimer</button>
        </div>
    `).join('');
}

function deleteCotation(index) {
    if (!confirm('Supprimer cette cotation?')) return;
    
    const settings = JSON.parse(localStorage.getItem('userSettings') || '{}');
    const customCotations = settings.customCotations || [];
    customCotations.splice(index, 1);
    settings.customCotations = customCotations;
    localStorage.setItem('userSettings', JSON.stringify(settings));
    
    renderSettingsCotationList();
    populateCotationSelect();
}

function renderHistory() {
    const container = document.getElementById('historyList');
    const noHistory = document.getElementById('noHistory');
    
    if (!container) return;
    
    if (history.length === 0) {
        container.innerHTML = '';
        if (noHistory) noHistory.style.display = 'block';
        return;
    }
    
    if (noHistory) noHistory.style.display = 'none';
    
    container.innerHTML = history.map(h => `
        <div class="history-item">
            <div class="history-info">
                <span class="history-title">${h.month}</span>
                <span class="history-date">${new Date(h.generated_at).toLocaleDateString('fr-FR')}</span>
            </div>
            <div class="history-actions">
                <button onclick="viewPDF('${h.id}')">Voir</button>
            </div>
        </div>
    `).join('');
}

function renderLogoPreview() {
    const settings = JSON.parse(localStorage.getItem('userSettings') || '{}');
    
    const logoImg = document.getElementById('logoImage');
    const logoPlaceholder = document.getElementById('logoPlaceholder');
    const logoPreview = document.getElementById('logoPreview');
    const removeLogoBtn = document.getElementById('removeLogoBtn');
    
    if (settings.logo) {
        if (logoImg) {
            logoImg.src = settings.logo;
            logoImg.style.display = 'block';
        }
        if (logoPlaceholder) logoPlaceholder.style.display = 'none';
        if (removeLogoBtn) removeLogoBtn.style.display = 'inline-block';
    } else {
        if (logoImg) logoImg.style.display = 'none';
        if (logoPlaceholder) logoPlaceholder.style.display = 'block';
        if (removeLogoBtn) removeLogoBtn.style.display = 'none';
    }
    
    const sigImg = document.getElementById('signatureImage');
    const sigPlaceholder = document.getElementById('signaturePlaceholder');
    const removeSigBtn = document.getElementById('removeSignatureBtn');
    
    if (settings.signature) {
        if (sigImg) {
            sigImg.src = settings.signature;
            sigImg.style.display = 'block';
        }
        if (sigPlaceholder) sigPlaceholder.style.display = 'none';
        if (removeSigBtn) removeSigBtn.style.display = 'inline-block';
    } else {
        if (sigImg) sigImg.style.display = 'none';
        if (sigPlaceholder) sigPlaceholder.style.display = 'block';
        if (removeSigBtn) removeSigBtn.style.display = 'none';
    }
}

function init() {
    console.log('App initialized');
    updateMonthDisplay();
    setDefaultDate();
    setupMobileMonthSelector();
    renderEntries();
    renderCharts();
    updateStats();
}

// Stub function for VL alerts
function checkVLAlert(patientId) {
    // VL checking logic placeholder
    const vlAlert = document.getElementById('vlAlert');
    if (vlAlert) vlAlert.style.display = 'none';
}

function renderRecentVLForAdd() {
    const container = document.getElementById('recentVLList');
    if (!container) return;

    const vlOnly = vlHistory.filter(v => v.cotation === 'VL' || v.cotation === 'VL+MD');

    if (vlOnly.length === 0) {
        container.innerHTML = '<p style="color: var(--color-text-secondary); font-size: 0.8125rem;">Aucune VL récente</p>';
        return;
    }

    const now = new Date();
const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

        const recentVL = vlOnly
            .filter(v => new Date(v.vlDate) > ninetyDaysAgo)
        .sort((a, b) => new Date(b.vlDate) - new Date(a.vlDate))
        .slice(0, 10);

    if (recentVL.length === 0) {
        container.innerHTML = '<p style="color: var(--color-text-secondary); font-size: 0.8125rem;">Aucune VL récente (plus de 90 jours)</p>';
        return;
    }

    container.innerHTML = recentVL.map(v => {
        const vlDate = new Date(v.vlDate);
        const daysAgo = Math.floor((now - vlDate) / (24 * 60 * 60 * 1000));
        const isSafe = daysAgo >= 21;

        return `
            <div class="recent-vl-item">
                <div>
                    <div class="patient">${v.patientName}</div>
                    <div class="vl-date">${vlDate.toLocaleDateString('fr-FR')}</div>
                </div>
                <div class="days-ago ${isSafe ? 'safe' : ''}">${daysAgo} jours</div>
            </div>
        `;
    }).join('');
}

async function loadPatients() {
    console.log('[DATA] loadPatients called');
    
    try {
        const { data: patientsData, error } = await supabaseClient
            .from('patients')
            .select('id, name')
            .eq('user_id', currentUser.id)
            .order('name', { ascending: true });

        console.log('[DATA] Patients loaded:', patientsData?.length || 0, error);
        if (error) {
            console.error('Erreur patients:', error);
        }

        if (patientsData) {
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

            const { data: visitsData } = await supabaseClient
                .from('passages')
                .select('patient_id, date')
                .eq('user_id', currentUser.id)
                .gte('date', oneYearAgo.toISOString().split('T')[0])
                .order('date', { ascending: false });
            
            const visitsMap = {};
            if (visitsData) {
                visitsData.forEach(v => {
                    if (!visitsMap[v.patient_id]) {
                        visitsMap[v.patient_id] = { count: 0, lastVisit: null };
                    }
                    visitsMap[v.patient_id].count++;
                    if (!visitsMap[v.patient_id].lastVisit) {
                        visitsMap[v.patient_id].lastVisit = v.date;
                    }
                });
            }
            
            patients = patientsData.map(p => ({
                ...p,
                visit_count: visitsMap[p.id]?.count || 0,
                last_visit: visitsMap[p.id]?.lastVisit || null
            }));
        }
    } catch (error) {
        console.error('Erreur loadPatients:', error);
    }
}

async function loadData() {
    console.log('[DATA] loadData called, currentUser:', currentUser?.email, 'id:', currentUser?.id);
    console.log('[DATA] supabaseClient:', supabaseClient ? 'OK' : 'NULL');
    
    if (!currentUser) {
        console.log('[DATA] No user logged in, skipping data load');
        return;
    }
    
    if (!supabaseClient) {
        console.error('[DATA] ERROR: supabaseClient is null!');
        return;
    }
    
    try {
        // Only load data from last 2 years to speed up
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
        const twoYearsAgoStr = twoYearsAgo.toISOString().split('T')[0];

        console.log('=== LOAD DATA ===');
        console.log('User ID:', currentUser?.id);
        console.log('Date filter (>=):', twoYearsAgoStr);

        const { data: passages, error: passagesError } = await supabaseClient
            .from('passages')
            .select('*, patients(name)')
            .eq('user_id', currentUser.id)
            .gte('date', twoYearsAgoStr)
            .order('date', { ascending: false });

        console.log('Raw Supabase response - passages:', passages, 'error:', passagesError);
        console.log('Passages loaded:', passages?.length || 0);
        if (passagesError) {
            console.error('Table passages error:', passagesError);
        } else if (passages) {
            entries = passages.map(p => ({
                id: p.id,
                patientId: p.patient_id,
                patientName: p.patients?.name || 'Inconnu',
                date: p.date,
                location: p.location,
                cotation: p.cotation,
                amount: p.amount,
                monthKey: p.month_key
            }));
            console.log('[DATA] Entries loaded:', entries.length);
        } else {
            console.log('[DATA] No passages found for user');
        }
        
        // Load only last 12 months of history
        const { data: historyData, error: historyError } = await supabaseClient
            .from('comptabilite')
            .select('*')
            .order('generated_at', { ascending: false })
            .limit(12);
        
        if (!historyError && historyData) {
            history = historyData.map(h => ({
                id: h.id,
                monthKey: h.month_key,
                monthName: h.month_name,
                totalAmount: h.total_amount,
                totalVisits: h.total_visits,
                pdfData: h.pdf_data,
                generatedAt: h.generated_at
            }));
        }
    } catch (error) {
        console.error('Erreur loadData:', error);
    }
}

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            switchView(view);
        });
    });
    
    document.getElementById('entryForm').addEventListener('submit', handleSubmit);
    document.getElementById('visitLocation').addEventListener('change', handleLocationChange);
    document.getElementById('cotation').addEventListener('change', handleCotationChange);
    document.getElementById('prevMonthAdd')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('nextMonthAdd')?.addEventListener('click', () => changeMonth(1));
    document.getElementById('generatePdfBtn')?.addEventListener('click', generatePDF);
    document.getElementById('addNewCotation').addEventListener('click', addNewCotationFromSettings);
    
    const patientInput = document.getElementById('patientName');
    patientInput.addEventListener('input', handlePatientSearch);
    patientInput.addEventListener('focus', () => {
        if (patientInput.value.length >= 2) {
            handlePatientSearch({ target: patientInput });
        }
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-wrapper')) {
            document.getElementById('autocomplete-dropdown').classList.remove('active');
        }
    });
    
    document.getElementById('saveCustomCotation')?.addEventListener('click', saveCustomCotation);
    
    // Logo upload
    document.getElementById('uploadLogoBtn')?.addEventListener('click', () => {
        document.getElementById('logoInput').click();
    });
    
    document.getElementById('logoInput')?.addEventListener('change', handleLogoUpload);
    
    document.getElementById('removeLogoBtn')?.addEventListener('click', async () => {
        await saveSetting('logo', null);
        renderLogoPreview();
    });
    
    document.getElementById('uploadSignatureBtn')?.addEventListener('click', () => {
        document.getElementById('signatureInput').click();
    });
    
    document.getElementById('signatureInput')?.addEventListener('change', handleSignatureUpload);
    
    document.getElementById('removeSignatureBtn')?.addEventListener('click', async () => {
        await saveSetting('signature', null);
        renderLogoPreview();
    });
    
    // Settings tabs
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tabName}`).classList.add('active');
        });
    });
    
    // Cabinet tabs
    document.querySelectorAll('.cabinet-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            document.querySelectorAll('.cabinet-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.cabinet-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`cabinet-${tabName}`).classList.add('active');
        });
    });
    
    // Depenses
    document.getElementById('addDepenseBtn')?.addEventListener('click', () => {
        const form = document.getElementById('depensesForm');
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
        updateSousCategoriesDepense();
    });
    document.getElementById('saveDepenseBtn')?.addEventListener('click', saveDepense);
    
    // Recettes
    document.getElementById('addRecetteBtn')?.addEventListener('click', () => {
        const form = document.getElementById('recettesForm');
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });
    document.getElementById('saveRecetteBtn')?.addEventListener('click', saveRecette);
    
    // Cabinet tabs
    document.querySelectorAll('.cabinet-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            document.querySelectorAll('.cabinet-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.cabinet-tab-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            document.getElementById('cabinet-' + tabName)?.classList.add('active');
        });
    });
}

function handleLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        const base64 = event.target.result;
        await saveSetting('logo', base64);
        renderLogoPreview();
    };
    reader.readAsDataURL(file);
}

function handleSignatureUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        const base64 = event.target.result;
        await saveSetting('signature', base64);
        renderLogoPreview();
    };
    reader.readAsDataURL(file);
}

function switchView(viewName) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewName);
    });

    // Update views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.toggle('active', view.id === `view-${viewName}`);
    });

    const pageTitles = {
        'dashboard': 'Dashboard',
        'add': 'Ajouter',
        'history': 'Documents',
        'cabinet': 'Cabinet',
        'settings': 'Paramètres'
    };
    
    const mobileTitle = document.getElementById('mobilePageTitle');
    if (mobileTitle) {
        mobileTitle.textContent = pageTitles[viewName] || 'Dashboard';
    }

    // Load data for specific views
    if (viewName === 'dashboard') {
        updateStats();
        renderRecentList();
        renderCharts();
    } else if (viewName === 'history') {
        renderHistory();
    } else if (viewName === 'settings') {
        renderSettingsCotationList();
        // On mobile, show settings as full page overlay
        if (window.innerWidth <= 768) {
            const settingsSection = document.getElementById('view-settings');
            let overlay = document.querySelector('.settings-page-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'settings-page-overlay';
                overlay.innerHTML = settingsSection.innerHTML;
                document.body.appendChild(overlay);
                
                // Add close button
                const closeBtn = document.createElement('button');
                closeBtn.className = 'overlay-close-btn';
                closeBtn.innerHTML = '← Retour';
                closeBtn.onclick = () => {
                    overlay.classList.remove('active');
                    switchView('dashboard');
                };
                overlay.insertBefore(closeBtn, overlay.firstChild);
            }
            overlay.classList.add('active');
        }
    } else if (viewName === 'cabinet') {
        loadCabinetData();
    } else if (viewName === 'add') {
        loadVLHistory().then(() => renderRecentVLForAdd());
    } else if (viewName === 'cabinet') {
        loadCabinetData();
    }
}

// ===== CABINET FUNCTIONS =====
let cabinetDepenses = [];
let cabinetRecettes = [];
let currentMoisCompta = new Date().getFullYear();

function toggleDepenseForm() {
    const form = document.getElementById('depensesForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
    updateSousCategoriesDepense();
}

function toggleRecetteForm() {
    const form = document.getElementById('recettesForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

window.toggleDepenseForm = toggleDepenseForm;
window.toggleRecetteForm = toggleRecetteForm;

async function loadCabinetData() {
    // Load data for all authenticated users
    if (currentUser) {
        console.log('Loading cabinet data for user:', currentUser.id);
        await loadDepenses();
        await loadRecettes();
        renderComptaSummary();
    }
}

async function loadDepenses() {
    console.log('[COMPTAB] loadDepenses called, user:', currentUser?.id);
    try {
        console.log('Loading depenses for user:', currentUser?.id);
        const { data, error } = await supabaseClient
            .from('cabinet_depenses')
            .select('*')
            .order('date', { ascending: false });
        
        console.log('[COMPTAB] Depenses loaded:', data?.length || 0, error);
        if (error) {
            console.error('[COMPTAB] Depenses error:', error);
        }
        if (data) {
            cabinetDepenses = data;
            renderDepenses();
            updateSousCategoriesDepense();
        }
    } catch (error) {
        console.error('Erreur loadDepenses:', error);
    }
}

async function loadRecettes() {
    console.log('[COMPTAB] loadRecettes called, user:', currentUser?.id);
    try {
        console.log('Loading recettes for user:', currentUser?.id);
        const { data, error } = await supabaseClient
            .from('cabinet_recettes')
            .select('*')
            .order('date', { ascending: false });
        
        console.log('[COMPTAB] Recettes loaded:', data?.length || 0, error);
        if (error) {
            console.error('[COMPTAB] Recettes error:', error);
        }
        if (data) {
            cabinetRecettes = data;
            renderRecettes();
        }
    } catch (error) {
        console.error('Erreur loadRecettes:', error);
    }
}

function updateSousCategoriesDepense() {
    const categorySelect = document.getElementById('depenseCategory');
    const sousCategorySelect = document.getElementById('depenseSousCategorie');
    
    if (!categorySelect || !sousCategorySelect) return;
    
    categorySelect.addEventListener('change', function() {
        const categorie = CABINET_CATEGORIES[this.value];
        sousCategorySelect.innerHTML = '<option value="">Sélectionner...</option>';
        if (categorie && categorie.sous) {
            categorie.sous.forEach(sous => {
                const option = document.createElement('option');
                option.value = sous;
                option.textContent = sous;
                sousCategorySelect.appendChild(option);
            });
        }
    });
}

function renderDepenses() {
    const container = document.getElementById('depensesList');
    if (!container) return;
    
    if (cabinetDepenses.length === 0) {
        container.innerHTML = '<div class="no-entries">Aucune dépense enregistrée</div>';
        return;
    }
    
    container.innerHTML = cabinetDepenses.map(d => {
        const cat = CABINET_CATEGORIES[d.category];
        const catLabel = cat ? cat.label : d.category;
        const dateStr = d.date ? new Date(d.date).toLocaleDateString('fr-FR') : '-';
        return `
            <div class="depense-item">
                <div>
                    <span class="date-small">${dateStr}</span>
                    <span class="description">${d.description || d.sous_categorie || '-'}</span>
                    <span class="category">${catLabel}</span>
                </div>
                <div class="depense-right">
                    <span class="amount">-${d.amount.toFixed(2)}€</span>
                    <button class="delete-btn-small" onclick="deleteDepense(${d.id})" title="Supprimer">✕</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderRecettes() {
    const container = document.getElementById('recettesList');
    if (!container) return;
    
    if (cabinetRecettes.length === 0) {
        container.innerHTML = '<div class="no-entries">Aucune recette enregistrée</div>';
        return;
    }
    
    container.innerHTML = cabinetRecettes.map(r => {
        const cat = RECETTE_CATEGORIES[r.category];
        const catLabel = cat ? cat.label : r.category;
        const dateStr = r.date ? new Date(r.date).toLocaleDateString('fr-FR') : '-';
        return `
            <div class="depense-item income">
                <div>
                    <span class="date-small">${dateStr}</span>
                    <span class="description">${r.description || '-'}</span>
                    <span class="category">${catLabel}</span>
                </div>
                <div class="depense-right">
                    <span class="amount">+${r.amount.toFixed(2)}€</span>
                    <button class="delete-btn-small" onclick="deleteRecette(${r.id})" title="Supprimer">✕</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderComptaSummary() {
    console.log('[COMPTAB] renderComptaSummary called');
    console.log('[COMPTAB] cabinetDepenses:', cabinetDepenses?.length || 0);
    console.log('[COMPTAB] cabinetRecettes:', cabinetRecettes?.length || 0);
    
    // Check if cabinet-dashboard is visible
    const cabinetDash = document.getElementById('cabinet-dashboard');
    console.log('[COMPTAB] cabinet-dashboard element:', !!cabinetDash);
    console.log('[COMPTAB] cabinet-dashboard display:', cabinetDash?.style.display);
    console.log('[COMPTAB] cabinet-dashboard computed:', cabinetDash ? window.getComputedStyle(cabinetDash).display : 'N/A');
    
    // Force visible for debugging
    if (cabinetDash) {
        cabinetDash.style.border = '3px solid red';
        cabinetDash.style.padding = '20px';
        cabinetDash.style.backgroundColor = '#fff';
    }
    
    if (!cabinetDepenses) cabinetDepenses = [];
    if (!cabinetRecettes) cabinetRecettes = [];
    
    const totalDepenses = cabinetDepenses.reduce((sum, d) => sum + d.amount, 0);
    const totalRecettes = cabinetRecettes.reduce((sum, r) => sum + r.amount, 0);
    const balance = totalRecettes - totalDepenses;
    
    console.log('[COMPTAB] Totals - Depenses:', totalDepenses, 'Recettes:', totalRecettes, 'Balance:', balance);
    
    // Force show with alert!
    alert('CA BINGO: Depenses=' + totalDepenses + '€ Recettes=' + totalRecettes + '€ Balance=' + balance + '€');
    
    // Dashboard - Cabinet mode
    const elDashTotalRecettes = document.getElementById('dashTotalRecettes');
    const elDashTotalDepenses = document.getElementById('dashTotalDepenses');
    const elDashBalance = document.getElementById('dashBalance');
    
    console.log('[COMPTAB] Elements found - dashTotalRecettes:', !!elDashTotalRecettes, 'dashTotalDepenses:', !!elDashTotalDepenses, 'dashBalance:', !!elDashBalance);
    
    if (elDashTotalRecettes) {
        elDashTotalRecettes.textContent = `${totalRecettes.toFixed(2)}€`;
        elDashTotalRecettes.style.backgroundColor = '#10b981';
        elDashTotalRecettes.style.color = 'white';
        elDashTotalRecettes.style.padding = '10px';
    }
    if (elDashTotalDepenses) {
        elDashTotalDepenses.textContent = `${totalDepenses.toFixed(2)}€`;
        elDashTotalDepenses.style.backgroundColor = '#ef4444';
        elDashTotalDepenses.style.color = 'white';
        elDashTotalDepenses.style.padding = '10px';
    }
    if (elDashBalance) {
        elDashBalance.textContent = `${balance.toFixed(2)}€`;
        elDashBalance.style.color = balance >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
        elDashBalance.style.fontWeight = 'bold';
        elDashBalance.style.fontSize = '24px';
    }
    
    // Moyennes
    const nbDepenses = cabinetDepenses.length;
    const avgDepenses = nbDepenses > 0 ? totalDepenses / nbDepenses : 0;
    const avgRecettes = cabinetRecettes.length > 0 ? totalRecettes / cabinetRecettes.length : 0;
    document.getElementById('avgDepenses').textContent = `${avgDepenses.toFixed(2)}€`;
    document.getElementById('avgRecettes').textContent = `${avgRecettes.toFixed(2)}€`;
    document.getElementById('nbDepenses').textContent = nbDepenses;
    
    // Dépenses par catégorie
    const depensesParCat = {};
    cabinetDepenses.forEach(d => {
        const cat = CABINET_CATEGORIES[d.category];
        const catLabel = cat ? cat.label : d.category;
        depensesParCat[catLabel] = (depensesParCat[catLabel] || 0) + d.amount;
    });
    
    // Top catégories triées
    const sortedCats = Object.entries(depensesParCat).sort((a, b) => b[1] - a[1]);
    const topCatContainer = document.getElementById('topCategories');
    if (topCatContainer && totalDepenses > 0) {
        topCatContainer.innerHTML = sortedCats.slice(0, 5).map(([cat, amount]) => {
            const pct = ((amount / totalDepenses) * 100).toFixed(1);
            return `<div class="top-cat-item"><span class="top-cat-name">${cat}</span><span class="top-cat-pct">${pct}%</span></div>`;
        }).join('');
    }
    
    // Donut Chart - Répartition dépenses
    const donutContainer = document.getElementById('depensesPieChart');
    if (donutContainer && totalDepenses > 0) {
        let gradient = '';
        const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        let cumulative = 0;
        sortedCats.slice(0, 6).forEach(([cat, amount], i) => {
            const pct = (amount / totalDepenses) * 100;
            const end = cumulative + pct;
            gradient += `${colors[i % colors.length]} ${cumulative}% ${end}%, `;
            cumulative = end;
        });
        gradient += `#e5e7eb ${cumulative}% 100%`;
        donutContainer.style.background = `conic-gradient(${gradient.replace(/, $/, '')})`;
    }
    
    // Evoluton mensuelle - Bar chart (12 derniers mois)
    const monthlyData = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = d.toLocaleDateString('fr-FR', { month: 'short' });
        monthlyData[key] = { label: monthLabel, depenses: 0, recettes: 0 };
    }
    
    cabinetDepenses.forEach(d => {
        const key = d.date ? d.date.substring(0, 7) : null;
        if (key && monthlyData[key]) monthlyData[key].depenses += d.amount;
    });
    cabinetRecettes.forEach(r => {
        const key = r.date ? r.date.substring(0, 7) : null;
        if (key && monthlyData[key]) monthlyData[key].recettes += r.amount;
    });
    
    const monthlyValues = Object.values(monthlyData);
    const maxValue = Math.max(...monthlyValues.map(m => Math.max(m.depenses, m.recettes)), 1);
    
    const barContainer = document.getElementById('evolutionChart');
    if (barContainer) {
        barContainer.innerHTML = monthlyValues.map(m => {
            const depHeight = (m.depenses / maxValue) * 100;
            const recHeight = (m.recettes / maxValue) * 100;
            return `
                <div class="bar-group">
                    <div class="bar-wrapper">
                        <div class="bar expense" style="height: ${depHeight}%"></div>
                        <div class="bar income" style="height: ${recHeight}%"></div>
                    </div>
                    <span class="bar-label">${m.label}</span>
                </div>
            `;
        }).join('');
    }
    
    // Dashboard - catégories
    const dashCatContainer = document.getElementById('dashDepensesParCategorie');
    if (dashCatContainer) {
        dashCatContainer.innerHTML = sortedCats.slice(0, 5).map(([cat, amount]) => `
            <div class="category-item">
                <span class="cat-label">${cat}</span>
                <span class="cat-amount">${amount.toFixed(2)}€</span>
            </div>
        `).join('') || '<div class="no-entries">Aucune dépense</div>';
    }
    
    // Dashboard - Recent depenses
    const recentDepContainer = document.getElementById('dashRecentDepenses');
    if (recentDepContainer) {
        recentDepContainer.innerHTML = cabinetDepenses.slice(0, 5).map(d => `
            <div class="recent-item">
                <span>${d.description || d.sous_categorie || '-'}</span>
                <span class="amount">-${d.amount.toFixed(2)}€</span>
            </div>
        `).join('') || '<div class="no-entries">Aucune</div>';
    }
    
    // Dashboard - Recent recettes
    const recentRecContainer = document.getElementById('dashRecentRecettes');
    if (recentRecContainer) {
        recentRecContainer.innerHTML = cabinetRecettes.slice(0, 5).map(r => `
            <div class="recent-item">
                <span>${r.description || '-'}</span>
                <span class="amount" style="color:var(--color-success)">+${r.amount.toFixed(2)}€</span>
            </div>
        `).join('') || '<div class="no-entries">Aucune</div>';
    }
}

// ===== MISSING FUNCTIONS =====

function generatePDF() {
    alert('Génération PDF en cours...');
    // Basic PDF generation placeholder
    const { jsPDF } = window.jsPDF;
    if (!jsPDF) {
        alert('Erreur: jsPDF non chargé');
        return;
    }
    
    const doc = new jsPDF();
    doc.text('Feuille de cotation', 10, 10);
    doc.text('Mois: ' + document.getElementById('currentMonthAdd')?.textContent, 10, 20);
    doc.text('Generated: ' + new Date().toLocaleDateString('fr-FR'), 10, 30);
    
    // Add entries
    let y = 50;
    entries.slice(0, 20).forEach((e, i) => {
        doc.text(`${i+1}. ${e.date} - ${e.patientName} - ${e.cotation} - ${e.amount}€`, 10, y);
        y += 7;
    });
    
    doc.save('cotation-' + new Date().toISOString().split('T')[0] + '.pdf');
}

// VL History (already declared above)

async function loadVLHistory() {
    if (!currentUser) return;
    
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const { data } = await supabaseClient
        .from('passages')
        .select('*, patients(name)')
        .eq('user_id', currentUser.id)
        .in('cotation', ['VL', 'VL+MD'])
        .gte('date', oneYearAgo.toISOString().split('T')[0])
        .order('date', { ascending: false });
    
    if (data) {
        vlHistory = data.map(p => ({
            patientId: p.patient_id,
            patientName: p.patients?.name,
            date: p.date,
            cotation: p.cotation
        }));
    }
}

function updateStats() {
    console.log('[STATS] updateStats called, entries:', entries?.length || 0);
    
    const currentMonth = currentMonthAdd.getMonth();
    const currentYear = currentMonthAdd.getFullYear();
    
    const monthEntries = entries.filter(e => {
        const d = new Date(e.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    
    console.log('[STATS] Month entries:', monthEntries.length);
    
    const totalPatients = new Set(monthEntries.map(e => e.patientId)).size;
    const totalAmount = monthEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalVisits = monthEntries.length;
    const avgPerDay = totalVisits > 0 ? totalAmount / Math.max(new Date().getDate(), 1) : 0;
    
    const el = (id) => document.getElementById(id);
    if (el('totalPatients')) {
        el('totalPatients').textContent = totalPatients;
        console.log('[STATS] Set totalPatients:', totalPatients);
    }
    if (el('totalAmount')) {
        el('totalAmount').textContent = totalAmount.toFixed(2) + '€';
        console.log('[STATS] Set totalAmount:', totalAmount);
    }
    if (el('totalVisits')) el('totalVisits').textContent = totalVisits;
    if (el('avgPerDay')) el('avgPerDay').textContent = avgPerDay.toFixed(2) + '€';
    
    console.log('[STATS] Updated:', { totalPatients, totalAmount, totalVisits });
}

function renderEntries() {
    console.log('[ENTRIES] renderEntries called, entries:', entries?.length || 0, 'currentMonth:', currentMonthAdd.getMonth());
    
    const tbody = document.getElementById('entriesBody');
    if (!tbody) {
        console.log('[ENTRIES] tbody not found!');
        return;
    }
    
    const currentMonth = currentMonthAdd.getMonth();
    const currentYear = currentMonthAdd.getFullYear();
    
    console.log('[ENTRIES] Filtering for month:', currentMonth, 'year:', currentYear);
    
    const monthEntries = entries.filter(e => {
        const d = new Date(e.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
    
    console.log('[ENTRIES] Found entries for month:', monthEntries.length);
    
    if (monthEntries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Aucun passage ce mois</td></tr>';
        return;
    }
    
    tbody.innerHTML = monthEntries.map(e => `
        <tr>
            <td>${e.date}</td>
            <td>${e.patientName}</td>
            <td>${e.location}</td>
            <td>${e.cotation}</td>
            <td>${(e.amount || 0).toFixed(2)}€</td>
            <td><button onclick="deleteEntry('${e.id}')" style="color:red;">×</button></td>
        </tr>
    `).join('');
}

async function deleteEntry(id) {
    if (!confirm('Supprimer ce passage?')) return;
    
    const { error } = await supabaseClient.from('passages').delete().eq('id', id);
    if (error) {
        alert('Erreur: ' + error.message);
        return;
    }
    
    await loadData();
    renderEntries();
    updateStats();
    renderCharts();
}

function renderCharts() {
    console.log('[CHARTS] renderCharts called, entries:', entries?.length || 0);
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    
    // ========== REVENUS MENSUELS ==========
    const monthlyData = {};
    for (let m = 0; m <= currentMonth; m++) {
        const key = `${currentYear}-${String(m + 1).padStart(2, '0')}`;
        monthlyData[key] = 0;
    }
    
    entries.forEach(e => {
        const key = e.monthKey;
        if (monthlyData.hasOwnProperty(key)) {
            monthlyData[key] += e.amount || 0;
        }
    });
    
    const barsContainer = document.getElementById('monthlyChartBars');
    const labelsContainer = document.getElementById('monthlyChartLabels');
    
    if (barsContainer) {
        const maxVal = Math.max(...Object.values(monthlyData), 1);
        barsContainer.innerHTML = Object.entries(monthlyData).map(([key, val]) => {
            const height = val > 0 ? (val / maxVal) * 100 : 2;
            return `<div class="chart-bar" style="height: ${height}%"><span class="bar-value">${val.toFixed(0)}€</span></div>`;
        }).join('');
    }
    
    if (labelsContainer) {
        labelsContainer.innerHTML = Object.keys(monthlyData).map(key => {
            const m = parseInt(key.split('-')[1]) - 1;
            return `<span>${monthNames[m]}</span>`;
        }).join('');
    }
    
    // ========== PASSAGES MENSUELS ==========
    const visitsData = {};
    for (let m = 0; m <= currentMonth; m++) {
        const key = `${currentYear}-${String(m + 1).padStart(2, '0')}`;
        visitsData[key] = 0;
    }
    
    entries.forEach(e => {
        const key = e.monthKey;
        if (visitsData.hasOwnProperty(key)) {
            visitsData[key]++;
        }
    });
    
    const visitsBars = document.getElementById('visitsChartBars');
    const visitsLabels = document.getElementById('visitsChartLabels');
    
    if (visitsBars) {
        const maxVal = Math.max(...Object.values(visitsData), 1);
        visitsBars.innerHTML = Object.entries(visitsData).map(([key, val]) => {
            const height = val > 0 ? (val / maxVal) * 100 : 2;
            return `<div class="chart-bar" style="height: ${height}%"><span class="bar-value">${val}</span></div>`;
        }).join('');
    }
    
    if (visitsLabels && labelsContainer) {
        visitsLabels.innerHTML = labelsContainer.innerHTML;
    }
    
    // Donut chart by location
    const locationData = {};
    entries.forEach(e => {
        const loc = e.location || 'Autre';
        locationData[loc] = (locationData[loc] || 0) + (e.amount || 0);
    });
    
    const donutContainer = document.getElementById('donutChart');
    const legendContainer = document.getElementById('donutLegend');
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    
    if (donutContainer && Object.keys(locationData).length > 0) {
        const total = Object.values(locationData).reduce((a, b) => a + b, 0);
        let gradient = '';
        let cumulative = 0;
        
        Object.entries(locationData).forEach(([loc, val], i) => {
            const pct = (val / total) * 100;
            const end = cumulative + pct;
            gradient += `${colors[i % colors.length]} ${cumulative}% ${end}%, `;
            cumulative = end;
        });
        
        gradient += `#e5e7eb ${cumulative}% 100%`;
        donutContainer.style.background = `conic-gradient(${gradient.replace(/, $/, '')})`;
    }
    
    if (legendContainer) {
        legendContainer.innerHTML = Object.entries(locationData).map(([loc, val]) => 
            `<div class="legend-item"><span class="legend-color" style="background:${colors[Object.keys(locationData).indexOf(loc) % colors.length]}"></span>${loc}</div>`
        ).join('');
    }
    
    // Cotation chart
    const cotationData = {};
    entries.forEach(e => {
        const c = e.cotation || 'Autre';
        cotationData[c] = (cotationData[c] || 0) + 1;
    });
    
    const cotationBars = document.getElementById('cotationChartBars');
    const cotationLabels = document.getElementById('cotationChartLabels');
    
    if (cotationBars) {
        const sorted = Object.entries(cotationData).sort((a, b) => b[1] - a[1]).slice(0, 8);
        const maxVal = Math.max(...sorted.map(([k, v]) => v), 1);
        
        cotationBars.innerHTML = sorted.map(([c, count]) => {
            const height = (count / maxVal) * 100;
            return `<div class="chart-bar" style="height: ${height}%" title="${c}: ${count}"></div>`;
        }).join('');
    }
    
    if (cotationLabels) {
        const sorted = Object.entries(cotationData).sort((a, b) => b[1] - a[1]).slice(0, 8);
        cotationLabels.innerHTML = sorted.map(([c]) => `<span>${c}</span>`).join('');
    }
}

function renderRecentList() {
    const container = document.getElementById('recentList');
    if (!container) return;
    
    const recent = entries.slice(0, 10);
    
    if (recent.length === 0) {
        container.innerHTML = '<div class="no-entries">Aucun passage récent</div>';
        return;
    }
    
    container.innerHTML = recent.map(e => `
        <div class="recent-item">
            <div class="recent-info">
                <span class="recent-patient">${e.patientName}</span>
                <span class="recent-date">${e.date} - ${e.location}</span>
            </div>
            <span class="recent-amount">${(e.amount || 0).toFixed(2)}€</span>
        </div>
    `).join('');
}

// Cabinet functions
async function saveDepense() {
    const description = document.getElementById('depenseDescription').value;
    const amount = parseFloat(document.getElementById('depenseAmount').value);
    const category = document.getElementById('depenseCategory').value;
    const sousCategorie = document.getElementById('depenseSousCategorie').value;
    const date = document.getElementById('depenseDate').value || new Date().toISOString().split('T')[0];
    
    if (!amount) {
        alert('Veuillez entrer un montant');
        return;
    }
    
    const { error } = await supabaseClient
        .from('cabinet_depenses')
        .insert([{
            user_id: currentUser.id,
            description,
            amount,
            category,
            sous_categorie: sousCategorie,
            date
        }]);
    
    if (error) {
        alert('Erreur: ' + error.message);
        return;
    }
    
    document.getElementById('depenseDescription').value = '';
    document.getElementById('depenseAmount').value = '';
    document.getElementById('depensesForm').style.display = 'none';
    
    await loadCabinetData();
    renderComptaSummary();
}

async function saveRecette() {
    const description = document.getElementById('recetteDescription').value;
    const amount = parseFloat(document.getElementById('recetteAmount').value);
    const category = document.getElementById('recetteCategory').value;
    const date = document.getElementById('recetteDate').value || new Date().toISOString().split('T')[0];
    
    if (!amount) {
        alert('Veuillez entrer un montant');
        return;
    }
    
    const { error } = await supabaseClient
        .from('cabinet_recettes')
        .insert([{
            user_id: currentUser.id,
            description,
            amount,
            category,
            date
        }]);
    
    if (error) {
        alert('Erreur: ' + error.message);
        return;
    }
    
    document.getElementById('recetteDescription').value = '';
    document.getElementById('recetteAmount').value = '';
    document.getElementById('recettesForm').style.display = 'none';
    
    await loadCabinetData();
    renderComptaSummary();
}

async function deleteDepense(id) {
    if (!confirm('Supprimer cette dépense ?')) return;
    
    const { error } = await supabaseClient
        .from('cabinet_depenses')
        .delete()
        .eq('id', id);
    
    if (error) {
        alert('Erreur: ' + error.message);
        return;
    }
    
    await loadCabinetData();
    renderComptaSummary();
}

async function deleteRecette(id) {
    if (!confirm('Supprimer cette recette ?')) return;
    
    const { error } = await supabaseClient
        .from('cabinet_recettes')
        .delete()
        .eq('id', id);
    
    if (error) {
        alert('Erreur: ' + error.message);
        return;
    }
    
    await loadCabinetData();
    renderComptaSummary();
}

// CABINET_CATEGORIES is already defined above (line 389)

function updateSousCategoriesDepense() {
    const category = document.getElementById('depenseCategory')?.value;
    const sousCatSelect = document.getElementById('depenseSousCategorie');
    
    if (!sousCatSelect || !category) return;
    
    const cat = CABINET_CATEGORIES[category];
    if (cat && cat.sous) {
        sousCatSelect.innerHTML = '<option value="">Sélectionner...</option>' + 
            cat.sous.map(s => `<option value="${s}">${s}</option>`).join('');
    }
}

function renderCabinetDepenses() {
    const container = document.getElementById('depensesList');
    if (!container) return;
    
    if (cabinetDepenses.length === 0) {
        container.innerHTML = '<div class="no-entries">Aucune dépense</div>';
        return;
    }
    
    container.innerHTML = cabinetDepenses.map(d => `
        <div class="depense-item">
            <div class="depense-info">
                <span class="depense-cat">${CABINET_CATEGORIES[d.category]?.label || d.category}</span>
                <span class="depense-desc">${d.description || d.sous_categorie || '-'}</span>
                <span class="depense-date">${d.date}</span>
            </div>
            <span class="depense-amount">-${d.amount.toFixed(2)}€</span>
            <button onclick="deleteDepense('${d.id}')" style="color:red;">×</button>
        </div>
    `).join('');
}

function renderCabinetRecettes() {
    const container = document.getElementById('recettesList');
    if (!container) return;
    
    if (cabinetRecettes.length === 0) {
        container.innerHTML = '<div class="no-entries">Aucune recette</div>';
        return;
    }
    
    container.innerHTML = cabinetRecettes.map(r => `
        <div class="recette-item">
            <div class="recette-info">
                <span class="recette-cat">${r.category}</span>
                <span class="recette-desc">${r.description || '-'}</span>
                <span class="recette-date">${r.date}</span>
            </div>
            <span class="recette-amount" style="color:var(--color-success)">+${r.amount.toFixed(2)}€</span>
            <button onclick="deleteRecette('${r.id}')" style="color:red;">×</button>
        </div>
    `).join('');
}

// Settings functions
async function loadUserProfile() {
    console.log('[PROFILE] Loading user profile');
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();
        
        if (error) {
            console.log('[PROFILE] No profile found, creating default');
            currentProfile = { role: 'medecin_installe' };
            return;
        }
        
        currentProfile = data;
        console.log('[PROFILE] Loaded:', currentProfile);
    } catch (e) {
        console.error('[PROFILE] Error:', e);
        currentProfile = { role: 'medecin_installe' };
    }
}

async function loadUserSettings() {
    console.log('[SETTINGS] Loading user settings');
    try {
        const { data } = await supabaseClient
            .from('user_settings')
            .select('*')
            .eq('user_id', currentUser.id)
            .single();
        
        if (data) {
            window.userSettings = data;
            console.log('[SETTINGS] Loaded');
        }
    } catch (e) {
        console.log('[SETTINGS] No settings found');
    }
}

async function saveSetting(key, value) {
    if (!currentUser) return;
    
    const existing = await supabaseClient
        .from('user_settings')
        .select('id')
        .eq('user_id', currentUser.id)
        .single();
    
    if (existing.data) {
        await supabaseClient
            .from('user_settings')
            .update({ [key]: value })
            .eq('user_id', currentUser.id);
    } else {
        await supabaseClient
            .from('user_settings')
            .insert({ user_id: currentUser.id, [key]: value });
    }
}

async function handleLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async () => {
        await saveSetting('logo', reader.result);
        renderLogoPreview();
    };
    reader.readAsDataURL(file);
}

async function handleSignatureUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async () => {
        await saveSetting('signature', reader.result);
        renderLogoPreview();
    };
    reader.readAsDataURL(file);
}

// Expose login functions globally for mobile
window.handleLoginClick = function() {
    console.log('[AUTH] handleLoginClick called');
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    doLogin(email, password);
};

window.doLogin = doLogin;

// Initialize auth on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
} else {
    initAuth();
}