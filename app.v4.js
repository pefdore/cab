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
        loadTheme();
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
    console.log('[TOGGLE] switchDashboardMode called with mode:', mode);
    
    // Toggle buttons
    var btns = document.querySelectorAll('.switch-btn');
    for (var i = 0; i < btns.length; i++) {
        if (btns[i].getAttribute('data-mode') === mode) {
            btns[i].classList.add('active');
        } else {
            btns[i].classList.remove('active');
        }
    }
    
    var cotationDash = document.getElementById('cotation-dashboard');
    var cabinetDash = document.getElementById('cabinet-dashboard');
    
    if (mode === 'cotation') {
        // Hide cabinet, show cotation
        console.log('[TOGGLE] Switching to COTATION');
        if (cabinetDash) {
            cabinetDash.style.display = 'none !important';
            console.log('[TOGGLE] cabinet-dashboard hidden');
        }
        if (cotationDash) {
            cotationDash.style.display = 'block';
            console.log('[TOGGLE] cotation-dashboard shown');
            // Load cotation data when showing
            if (typeof updateStats === 'function') updateStats();
        }
    } else {
        // Hide cotation, show cabinet
        console.log('[TOGGLE] Switching to CABINET');
        if (cotationDash) {
            cotationDash.style.display = 'none !important';
            console.log('[TOGGLE] cotation-dashboard hidden');
        }
        if (cabinetDash) {
            cabinetDash.style.display = 'block';
            console.log('[TOGGLE] cabinet-dashboard shown');
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

let isChangingMonth = false;

function changeMonth(delta) {
    if (isChangingMonth) return;
    isChangingMonth = true;
    
    const newMonth = currentMonthAdd.getMonth() + delta;
    currentMonthAdd.setMonth(newMonth);
    updateMonthDisplay();
    renderEntries();
    
    setTimeout(() => { isChangingMonth = false; }, 100);
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
        { key: 'G', amount: 30 },
        { key: 'VG', amount: 30 },
        { key: 'VG+MD', amount: 40 },
        { key: 'VG+MU', amount: 52.6 },
        { key: 'ALQP003', amount: 69.12 },
        { key: 'VL', amount: 60 },
        { key: 'VL+MD', amount: 70 },
        { key: 'VG+MD+MSH', amount: 63 },
        { key: 'VG+MD+2IK', amount: 41.22 }
    ];
    
    select.innerHTML = '<option value="">Sélectionner...</option>';
    cotations.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.key + '|' + c.amount;
        opt.textContent = c.key + ' - ' + c.amount.toFixed(2) + '€';
        select.appendChild(opt);
    });
    
    // Add "Ajouter une cotation" option
    const addOption = document.createElement('option');
    addOption.value = '__add_new__';
    addOption.textContent = '+ Ajouter une cotation';
    select.appendChild(addOption);
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
    const location = document.getElementById('visitLocation').value;
    const cotationSelect = document.getElementById('cotation');
    
    if ((location === 'Médecine' || location === 'SSR') && cotationSelect) {
        // Auto-select G 30€ for Médecine or SSR
        const options = Array.from(cotationSelect.options);
        const gOption = options.find(o => o.value.startsWith('G|'));
        if (gOption) {
            cotationSelect.value = gOption.value;
            handleCotationChange();
        }
    }
}

function handleCotationChange() {
    const select = document.getElementById('cotation');
    const amountDisplay = document.getElementById('amountDisplay');
    const customCotationGroup = document.getElementById('customCotation');
    
    if (!select || !amountDisplay) return;
    
    const value = select.value;
    
    if (value === '__add_new__') {
        // Show custom cotation form
        customCotationGroup.style.display = 'flex';
        select.value = '';
        amountDisplay.textContent = '0€';
        return;
    }
    
    if (customCotationGroup) {
        customCotationGroup.style.display = 'none';
    }
    
    if (value) {
        const amount = value.split('|')[1];
        amountDisplay.textContent = parseFloat(amount).toFixed(2) + '€';
    } else {
        amountDisplay.textContent = '0€';
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
    
    dropdown.innerHTML = matches.map(p => {
        const patientEntries = entries.filter(en => en.patientId === p.id);
        const passageCount = patientEntries.length;
        const lastEntry = patientEntries.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        const lastDate = lastEntry ? new Date(lastEntry.date).toLocaleDateString('fr-FR') : '-';
        const lastLocation = lastEntry?.location || '';
        const lastCotation = lastEntry?.cotation || '';
        const lastAmount = lastEntry?.amount || '';
        const locationColor = getLocationColor(lastLocation);
        const locationBadge = lastLocation ? `<span class="location-badge" style="background:${locationColor}">${lastLocation}</span>` : '';
        
        return `
            <div class="autocomplete-item" data-name="${p.name}" data-location="${lastLocation}" data-cotation="${lastCotation}" data-amount="${lastAmount}">
                <div class="autocomplete-patient-name">${p.name}</div>
                <div class="autocomplete-patient-info">${passageCount} passage${passageCount !== 1 ? 's' : ''} · Dernier: ${lastDate}${locationBadge ? ' · ' + locationBadge : ''}</div>
            </div>
        `;
    }).join('');
    
    dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
            const name = item.dataset.name;
            const location = item.dataset.location;
            const cotation = item.dataset.cotation;
            const amount = item.dataset.amount;
            
            document.getElementById('patientName').value = name;
            
            if (location) {
                const locationSelect = document.getElementById('visitLocation');
                if (locationSelect) locationSelect.value = location;
            }
            
            if (cotation) {
                const cotationSelect = document.getElementById('cotation');
                if (cotationSelect) {
                    let opt = Array.from(cotationSelect.options).find(o => o.value.startsWith(cotation + '|'));
                    if (!opt && amount) {
                        const newOpt = document.createElement('option');
                        newOpt.value = cotation + '|' + amount;
                        newOpt.textContent = cotation + ' - ' + parseFloat(amount).toFixed(2) + '€';
                        cotationSelect.appendChild(newOpt);
                        opt = newOpt;
                    }
                    if (opt) {
                        cotationSelect.value = opt.value;
                        const amountDisplay = document.getElementById('amountDisplay');
                        if (amountDisplay) {
                            const amt = opt.value.split('|')[1];
                            amountDisplay.textContent = parseFloat(amt).toFixed(2) + '€';
                        }
                    }
                }
            }
            
            dropdown.classList.remove('active');
        });
    });
    
    dropdown.classList.add('active');
}

function getLocationColor(location) {
    const colors = {
        'Médecine': '#0ea5e9',
        'SSR': '#8b5cf6',
        'Lilias RdC': '#10b981',
        'Lilas 1er étage': '#f59e0b',
        'Tamaris': '#ec4899'
    };
    return colors[location] || '#6366f1';
}

function renderSettingsCotationList() {
    const container = document.getElementById('settingsCotationList');
    if (!container) return;
    
    // Get unique cotations from user's entries
    supabase.from('entries')
        .select('cotation_key, amount')
        .eq('user_id', currentUser.id)
        .then(({ data }) => {
            if (data && data.length > 0) {
                // Group by cotation_key and get average amount
                const cotationsMap = {};
                data.forEach(e => {
                    if (e.cotation_key) {
                        if (!cotationsMap[e.cotation_key]) {
                            cotationsMap[e.cotation_key] = { count: 0, total: 0 };
                        }
                        cotationsMap[e.cotation_key].count++;
                        cotationsMap[e.cotation_key].total += e.amount || 0;
                    }
                });
                
                const usedCotations = Object.entries(cotationsMap)
                    .map(([key, vals]) => ({
                        key,
                        amount: vals.total / vals.count,
                        count: vals.count
                    }))
                    .sort((a, b) => b.count - a.count);
                
                container.innerHTML = `
                    <div class="settings-cotation-list">
                        <h4 style="margin-bottom: 12px; font-size: var(--text-sm); color: var(--color-text-secondary);">Cotations utilisées</h4>
                        ${usedCotations.map(c => `
                            <div class="settings-cotation-item">
                                <span class="cotation-key">${c.key}</span>
                                <span class="cotation-amount">${c.amount.toFixed(2)}€</span>
                                <span class="cotation-count">${c.count}x</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else {
                container.innerHTML = '<p style="color: var(--color-text-secondary);">Aucune cotation utilisée</p>';
            }
        });
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

function downloadPDF(id) {
    console.log('[DOWNLOAD] Looking for PDF with id:', id, 'type:', typeof id);
    console.log('[DOWNLOAD] Full history:', JSON.stringify(history));
    const record = history.find(h => String(h.id) === String(id));
    console.log('[DOWNLOAD] Found record:', record);
    console.log('[DOWNLOAD] Record keys:', record ? Object.keys(record) : 'N/A');
    
    if (!record) {
        alert('Document non trouvé');
        return;
    }
    
    const pdfData = record.pdfData || record.pdf_data;
    console.log('[DOWNLOAD] pdfData exists:', !!pdfData);
    console.log('[DOWNLOAD] pdfData type:', typeof pdfData);
    console.log('[DOWNLOAD] pdfData (first 100 chars):', pdfData ? pdfData.substring(0, 100) : 'N/A');
    console.log('[DOWNLOAD] pdfData length:', pdfData?.length);
    
    if (!pdfData) {
        alert('PDF non disponible. Générez d\'abord une nouvelle feuille.');
        return;
    }
    
    // Fix: ensure proper data URI format
    let downloadUrl = pdfData;
    if (pdfData.includes('filename=generated.pdf;')) {
        downloadUrl = pdfData.replace('filename=generated.pdf;', '');
        console.log('[DOWNLOAD] Fixed URL format');
    }
    
    const monthName = record.monthName || record.monthKey || 'document';
    const fileName = 'honoraires-' + monthName + '.pdf';
    
    console.log('[DOWNLOAD] Creating download link for:', fileName);
    console.log('[DOWNLOAD] Download URL (first 50):', downloadUrl.substring(0, 50));
    
    try {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        if (isMobile) {
            // On mobile, open in new tab
            window.open(downloadUrl, '_blank');
        } else {
            // On desktop, use download link
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
        console.log('[DOWNLOAD] Done!');
    } catch (error) {
        console.error('Erreur téléchargement PDF:', error);
        alert('Erreur lors du téléchargement: ' + error.message);
    }
}

function deletePDF(id) {
    console.log('[DELETE] Looking for id:', id);
    const record = history.find(h => String(h.id) === String(id));
    if (!record) {
        alert('Document non trouvé');
        return;
    }
    if (!confirm('Voulez-vous vraiment supprimer cette feuille de cotation?')) return;
    
    supabaseClient
        .from('comptabilite')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
            if (error) {
                alert('Erreur lors de la suppression: ' + error.message);
                return;
            }
            
            history = history.filter(h => h.id !== id);
            renderHistory();
        });
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
        <div class="history-item-compact">
            <div class="history-item-left">
                <span class="history-month-compact">${h.monthName || h.monthKey}</span>
                <span class="history-date-compact">${new Date(h.generatedAt || h.generated_at).toLocaleDateString('fr-FR')}</span>
            </div>
            <div class="history-item-right">
                <span class="history-amount-compact">${(h.totalAmount || h.total_amount || 0).toFixed(2)}€</span>
                <span class="history-count-compact">${h.totalVisits || h.total_visits || 0} actes</span>
            </div>
            <div class="history-actions-compact">
                <button class="btn-icon" onclick="downloadPDF('${h.id}')" title="Télécharger">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
                <button class="btn-icon btn-icon-danger" onclick="deletePDF('${h.id}')" title="Supprimer">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
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

function getNextQuarterDate(lastVLDate) {
    const d = new Date(lastVLDate);
    const month = d.getMonth();
    const year = d.getFullYear();
    
    let nextQuarterMonth;
    if (month <= 2) nextQuarterMonth = 3;
    else if (month <= 5) nextQuarterMonth = 6;
    else if (month <= 8) nextQuarterMonth = 9;
    else nextQuarterMonth = 0;
    
    let nextYear = nextQuarterMonth === 0 ? year + 1 : year;
    return new Date(nextYear, nextQuarterMonth, 1);
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
            .filter(v => new Date(v.date) > ninetyDaysAgo)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 10);

    if (recentVL.length === 0) {
        container.innerHTML = '<p style="color: var(--color-text-secondary); font-size: 0.8125rem;">Aucune VL récente (plus de 90 jours)</p>';
        return;
    }

    container.innerHTML = recentVL.map(v => {
        const vlDate = new Date(v.date);
        const nextDate = getNextQuarterDate(v.date);
        const daysUntil = Math.ceil((nextDate - now) / (24 * 60 * 60 * 1000));
        const isEligible = daysUntil <= 0;

        return `
            <div class="recent-vl-item compact">
                <span class="vl-patient">${v.patientName}</span>
                <span class="vl-dates">${vlDate.toLocaleDateString('fr-FR', {day:'numeric', month:'numeric'})} → ${nextDate.toLocaleDateString('fr-FR', {day:'numeric', month:'numeric'})}</span>
                <span class="vl-badge ${isEligible ? 'eligible' : ''}">${isEligible ? '✓' : daysUntil}</span>
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
    // Desktop Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            switchView(view);
        });
    });
    
    // Mobile Bottom Navigation
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            
            // Update active state
            document.querySelectorAll('.mobile-nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            switchView(view);
        });
    });
    
    document.getElementById('entryForm').addEventListener('submit', handleSubmit);
    document.getElementById('visitLocation').addEventListener('change', handleLocationChange);
    document.getElementById('cotation').addEventListener('change', handleCotationChange);
    document.getElementById('prevMonthAdd')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('nextMonthAdd')?.addEventListener('click', () => changeMonth(1));
    document.getElementById('generatePdfBtn')?.addEventListener('click', generatePDF);
    const pdfBtn = document.getElementById('generatePdfBtn');
    if (pdfBtn) pdfBtn.disabled = false;
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
    
    // Settings cards navigation (new page-based system)
    document.querySelectorAll('.settings-card').forEach(card => {
        card.addEventListener('click', () => {
            const page = card.dataset.settingsPage;
            openSettingsPage(page);
        });
    });
    
    // Settings back button
    document.getElementById('settingsBackBtn')?.addEventListener('click', () => {
        closeSettingsPage();
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

// Settings page navigation
function openSettingsPage(pageName) {
    const menu = document.getElementById('settings-menu');
    const backBtn = document.getElementById('settingsBackBtn');
    const title = document.querySelector('#view-settings h2');
    
    if (menu) menu.style.display = 'none';
    if (backBtn) backBtn.style.display = 'flex';
    if (title) title.textContent = pageName.charAt(0).toUpperCase() + pageName.slice(1);
    
    // Hide all settings pages
    document.querySelectorAll('.settings-page').forEach(p => p.style.display = 'none');
    
    // Show the selected page
    const page = document.getElementById(`settings-page-${pageName}`);
    if (page) {
        page.style.display = 'block';
        page.classList.add('active');
    }
    
    // Load data for specific pages
    if (pageName === 'profil') {
        loadProfileData();
    } else if (pageName === 'cotation') {
        renderSettingsCotationList();
    } else if (pageName === 'pdf') {
        renderLogoPreview();
    } else if (pageName === 'preferences') {
        loadTheme();
    }
}

function closeSettingsPage() {
    const menu = document.getElementById('settings-menu');
    const backBtn = document.getElementById('settingsBackBtn');
    const title = document.querySelector('#view-settings h2');
    
    if (menu) menu.style.display = 'flex';
    if (backBtn) backBtn.style.display = 'none';
    if (title) title.textContent = 'Paramètres';
    
    // Hide all settings pages
    document.querySelectorAll('.settings-page').forEach(p => {
        p.style.display = 'none';
        p.classList.remove('active');
    });
}

// Expose functions to window for inline onclick handlers
window.openSettingsPage = openSettingsPage;
window.closeSettingsPage = closeSettingsPage;

// Profile functions
async function loadProfileData() {
    if (!currentUser) return;
    
    document.getElementById('profileLastname').value = currentUser.lastname || '';
    document.getElementById('profileFirstname').value = currentUser.firstname || '';
    document.getElementById('profileEmail').value = currentUser.email || '';
    document.getElementById('profileRole').value = currentUser.role || '';
}

document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
    const lastname = document.getElementById('profileLastname').value.trim();
    const firstname = document.getElementById('profileFirstname').value.trim();
    const email = document.getElementById('profileEmail').value.trim();
    
    if (!lastname || !firstname || !email) {
        alert('Veuillez remplir tous les champs');
        return;
    }
    
    try {
        const { error } = await supabase.from('users').update({
            lastname,
            firstname,
            email
        }).eq('id', currentUser.id);
        
        if (error) throw error;
        
        currentUser.lastname = lastname;
        currentUser.firstname = firstname;
        currentUser.email = email;
        localStorage.setItem('cotation_user', JSON.stringify(currentUser));
        
        alert('Profil mis à jour');
    } catch (err) {
        console.error('Error updating profile:', err);
        alert('Erreur lors de la mise à jour');
    }
});

document.getElementById('changePasswordBtn')?.addEventListener('click', async () => {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
        alert('Veuillez remplir tous les champs');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        alert('Les mots de passe ne correspondent pas');
        return;
    }
    
    if (newPassword.length < 6) {
        alert('Le mot de passe doit contenir au moins 6 caractères');
        return;
    }
    
    try {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        
        if (error) throw error;
        
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        
        alert('Mot de passe modifié');
    } catch (err) {
        console.error('Error changing password:', err);
        alert('Erreur lors du changement de mot de passe');
    }
});

// Theme switcher
document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const theme = btn.dataset.theme;
        document.documentElement.setAttribute('data-theme', theme);
        await saveSetting('theme', theme);
    });
});

// Load saved theme
async function loadTheme() {
    const savedTheme = await getSetting('theme') || 'light';
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === savedTheme);
    });
    document.documentElement.setAttribute('data-theme', savedTheme);
}

// Export functions
document.getElementById('exportCSV')?.addEventListener('click', async () => {
    const { data: entries } = await supabase
        .from('entries')
        .select('*')
        .order('date', { ascending: false });
    
    if (!entries || entries.length === 0) {
        alert('Aucune donnée à exporter');
        return;
    }
    
    const headers = ['Date', 'Patient', 'Lieu', 'Cotation', 'Montant'];
    const rows = entries.map(e => [
        e.date,
        e.patient_name,
        e.location,
        e.cotation_key,
        e.amount
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    downloadFile(csv, 'cotation-export.csv', 'text/csv');
});

document.getElementById('exportJSON')?.addEventListener('click', async () => {
    const { data: entries } = await supabase
        .from('entries')
        .select('*')
        .order('date', { ascending: false });
    
    const json = JSON.stringify(entries, null, 2);
    downloadFile(json, 'cotation-export.json', 'application/json');
});

document.getElementById('exportPDF')?.addEventListener('click', () => {
    generateMonthlyPDF();
});

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Delete all data
document.getElementById('deleteAllData')?.addEventListener('click', async () => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer toutes vos données? Cette action est irréversible.')) {
        return;
    }
    
    if (!confirm('Vraiment? Toutes les données seront perdues définitivement.')) {
        return;
    }
    
    try {
        await supabase.from('entries').delete().neq('id', 0);
        alert('Toutes les données ont été supprimées');
        location.reload();
    } catch (err) {
        console.error('Error deleting data:', err);
        alert('Erreur lors de la suppression');
    }
});

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
        // Reset to settings menu
        closeSettingsPage();
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
                
                // Set up tabs in overlay
                overlay.querySelectorAll('.settings-tab').forEach(tab => {
                    tab.addEventListener('click', () => {
                        const tabName = tab.dataset.tab;
                        overlay.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
                        overlay.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
                        tab.classList.add('active');
                        overlay.querySelector(`#tab-${tabName}`).classList.add('active');
                    });
                });
            }
            overlay.classList.add('active');
        }
    } else if (viewName === 'cabinet') {
        loadCabinetData();
        renderComptaSummary();
    } else if (viewName === 'add') {
        renderEntries();
        loadVLHistory().then(() => renderRecentVLForAdd());
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
    // Only proceed if supabaseClient is initialized
    if (currentUser && supabaseClient) {
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
    console.log('[COMPTAB] renderComptaSummary called - v74');
    
    // CRITICAL: Only render if cabinet-dashboard is actually visible
    const cabinetDash = document.getElementById('cabinet-dashboard');
    if (!cabinetDash || cabinetDash.style.display === 'none') {
        console.log('[COMPTAB] cabinet-dashboard not visible, skipping render');
        return;
    }
    
    console.log('[COMPTAB] cabinet-dashboard IS visible, rendering...');
    console.log('[COMPTAB] cabinetDepenses:', cabinetDepenses?.length || 0);
    console.log('[COMPTAB] cabinetRecettes:', cabinetRecettes?.length || 0);
    
    if (!cabinetDepenses) cabinetDepenses = [];
    if (!cabinetRecettes) cabinetRecettes = [];
    
    const totalDepenses = cabinetDepenses.reduce((sum, d) => sum + d.amount, 0);
    const totalRecettes = cabinetRecettes.reduce((sum, r) => sum + r.amount, 0);
    const balance = totalRecettes - totalDepenses;
    
    console.log('[COMPTAB] Totals - Depenses:', totalDepenses, 'Recettes:', totalRecettes, 'Balance:', balance);
    
// Dashboard - Cabinet mode (using unique IDs)
    const elDashTotalRecettes = document.getElementById('dash-cab-recettes');
    const elDashTotalDepenses = document.getElementById('dash-cab-depenses');
    const elDashBalance = document.getElementById('dash-cab-balance');
    
    console.log('[COMPTAB] Dashboard elements found:', !!elDashTotalRecettes, !!elDashTotalDepenses, !!elDashBalance);
    
if (elDashTotalRecettes) {
        elDashTotalRecettes.textContent = `${totalRecettes.toFixed(2)}€`;
    }
    if (elDashTotalDepenses) {
        elDashTotalDepenses.textContent = `${totalDepenses.toFixed(2)}€`;
    }
    if (elDashBalance) {
        elDashBalance.textContent = `${balance.toFixed(2)}€`;
    }
    
    // Build monthly data first (needed for trends)
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
    
    // Current month data
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonthDepenses = monthlyData[currentMonthKey]?.depenses || 0;
    const thisMonthRecettes = monthlyData[currentMonthKey]?.recettes || 0;

    // Calculate trends (compare to previous month)
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
    const prevMonthDepenses = monthlyData[prevMonthKey]?.depenses || 0;
    const prevMonthRecettes = monthlyData[prevMonthKey]?.recettes || 0;

    // Update new stats elements
    const elRecettesThisMonth = document.getElementById('recettesThisMonth');
    const elDepensesThisMonth = document.getElementById('depensesThisMonth');
    const elAvgMonthly = document.getElementById('avgMonthly');
    const elTauxMarge = document.getElementById('tauxMarge');
    
    if (elRecettesThisMonth) elRecettesThisMonth.textContent = `${thisMonthRecettes.toFixed(2)}€`;
    if (elDepensesThisMonth) elDepensesThisMonth.textContent = `${thisMonthDepenses.toFixed(2)}€`;
    
    // Average
    const monthsWithData = Object.values(monthlyData).filter(m => m.depenses > 0 || m.recettes > 0).length;
    const avgMonthly = monthsWithData > 0 ? (totalDepenses + totalRecettes) / monthsWithData / 2 : 0;
    if (elAvgMonthly) elAvgMonthly.textContent = `${avgMonthly.toFixed(2)}€`;

    // Margin rate
    const tauxMarge = totalRecettes > 0 ? ((totalRecettes - totalDepenses) / totalRecettes * 100) : 0;
    if (elTauxMarge) {
        elTauxMarge.textContent = `${tauxMarge.toFixed(1)}%`;
        elTauxMarge.style.color = tauxMarge >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
    }

    // Trends
    const updateTrend = (elementId, current, previous) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        if (previous === 0) {
            el.textContent = current > 0 ? '↑ Nouveau' : '';
            el.className = 'compta-trend ' + (current > 0 ? 'up' : 'neutral');
        } else {
            const diff = previous > 0 ? ((current - previous) / previous * 100).toFixed(1) : 0;
            if (diff > 0) {
                el.textContent = `↑ +${diff}%`;
                el.className = 'compta-trend up';
            } else if (diff < 0) {
                el.textContent = `↓ ${diff}%`;
                el.className = 'compta-trend down';
            } else {
                el.textContent = '→ 0%';
                el.className = 'compta-trend neutral';
            }
        }
    };
    updateTrend('recettesTrend', thisMonthRecettes, prevMonthRecettes);
    updateTrend('depensesTrend', thisMonthDepenses, prevMonthDepenses);
    updateTrend('balanceTrend', thisMonthRecettes - thisMonthDepenses, prevMonthRecettes - prevMonthDepenses);
    
    // Moyennes (legacy elements - check if exist)
    const nbDepenses = cabinetDepenses.length;
    const avgDepenses = nbDepenses > 0 ? totalDepenses / nbDepenses : 0;
    const avgRecettes = cabinetRecettes.length > 0 ? totalRecettes / cabinetRecettes.length : 0;
    const elAvgDepenses = document.getElementById('avgDepenses');
    const elAvgRecettes = document.getElementById('avgRecettes');
    const elNbDepenses = document.getElementById('nbDepenses');
    if (elAvgDepenses) elAvgDepenses.textContent = `${avgDepenses.toFixed(2)}€`;
    if (elAvgRecettes) elAvgRecettes.textContent = `${avgRecettes.toFixed(2)}€`;
    if (elNbDepenses) elNbDepenses.textContent = nbDepenses;
    
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
    
    // Evolution mensuelle - Bar chart (12 derniers mois)
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

async function generatePDF() {
    console.log('[PDF] Starting generation...');
    
    let jsPDF = null;
    if (window.jspdf && window.jspdf.jsPDF) {
        jsPDF = window.jspdf.jsPDF;
    } else if (window.jsPDF) {
        jsPDF = window.jsPDF;
    }
    
    if (!jsPDF) {
        alert('Erreur: jsPDF non chargé. Attendez 2-3 secondes puis réessayez.');
        return;
    }
    
    try {
        const monthDisplay = document.getElementById('currentMonthAdd')?.textContent || 'N/A';
        const monthKey = currentMonthAdd.getFullYear() + '-' + String(currentMonthAdd.getMonth() + 1).padStart(2, '0');
        
        const monthEntries = entries.filter(e => {
            if (!e.date || !e.monthKey) return false;
            const [year, month] = e.monthKey.split('-');
            const entryMonth = currentMonthAdd.getMonth() + 1;
            const entryYear = currentMonthAdd.getFullYear();
            return parseInt(month) === entryMonth && parseInt(year) === entryYear;
        });
        
        const doc = new jsPDF();
        
        const locations = {
            'Médecine': { name: 'MÉDECINE', ehpad: false },
            'SSR': { name: 'SSR', ehpad: false },
            'Lilias RdC': { name: 'LILIAS RdC', ehpad: true },
            'Lilas 1er étage': { name: 'LILAS 1er étage', ehpad: true },
            'Tamaris': { name: 'TAMARIS', ehpad: true }
        };
        
        const medicoSSR = monthEntries.filter(e => !locations[e.location]?.ehpad);
        const ehpad = monthEntries.filter(e => locations[e.location]?.ehpad);
        
        // ========== PAGE 1: MÉDECIN SSR ==========
        doc.addPage();
        doc.setFillColor(240, 244, 252);
        doc.rect(0, 0, 210, 40, 'F');
        
        doc.setFontSize(24);
        doc.setTextColor(30, 41, 59);
        doc.text('HONORAIRES', 105, 20, { align: 'center' });
        
        doc.setFontSize(16);
        doc.text(monthDisplay.toUpperCase(), 105, 32, { align: 'center' });
        
        doc.setFontSize(14);
        doc.setTextColor(99, 102, 241);
        doc.text('MÉDECIN / SSR', 15, 55);
        
        doc.setFontSize(11);
        doc.setTextColor(71, 85, 105);
        
        let y = 70;
        doc.setFontSize(11);
        
        const medicoByCotation = {};
        medicoSSR.forEach(e => {
            if (!medicoByCotation[e.cotation]) {
                medicoByCotation[e.cotation] = { count: 0, amount: 0 };
            }
            medicoByCotation[e.cotation].count++;
            medicoByCotation[e.cotation].amount += parseFloat(e.amount) || 0;
        });
        
        const sortedMedico = Object.entries(medicoByCotation).sort((a, b) => b[1].amount - a[1].amount);
        
        doc.setFillColor(249, 250, 251);
        doc.rect(15, y - 6, 180, 10, 'F');
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text('Acte', 20, y);
        doc.text('Nombre', 110, y);
        doc.text('Montant', 170, y);
        
        y += 10;
        doc.setTextColor(30, 41, 59);
        
        sortedMedico.forEach(([cotation, data]) => {
            doc.text(cotation, 20, y);
            doc.text(String(data.count), 110, y);
            doc.text(data.amount.toFixed(2) + ' €', 170, y);
            y += 8;
        });
        
        y += 5;
        doc.setDrawColor(226, 232, 240);
        doc.line(15, y, 195, y);
        y += 10;
        
        doc.setFontSize(12);
        doc.setTextColor(99, 102, 241);
        doc.text('TOTAL MÉDECIN / SSR', 20, y);
        const totalMedico = medicoSSR.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
        doc.text(totalMedico.toFixed(2) + ' €', 170, y);
        doc.text('(' + medicoSSR.length + ' actes)', 100, y);
        
        // ========== PAGE 2: EHPAD ==========
        doc.addPage();
        doc.setFillColor(240, 244, 252);
        doc.rect(0, 0, 210, 40, 'F');
        
        doc.setFontSize(24);
        doc.setTextColor(30, 41, 59);
        doc.text('HONORAIRES', 105, 20, { align: 'center' });
        
        doc.setFontSize(16);
        doc.text(monthDisplay.toUpperCase(), 105, 32, { align: 'center' });
        
        doc.setFontSize(14);
        doc.setTextColor(99, 102, 241);
        doc.text('EHPAD', 15, 55);
        
        doc.setFontSize(11);
        doc.setTextColor(71, 85, 105);
        
        y = 70;
        
        const ehpadByLocation = {};
        ehpad.forEach(e => {
            const loc = locations[e.location]?.name || e.location;
            if (!ehpadByLocation[loc]) {
                ehpadByLocation[loc] = {};
            }
            if (!ehpadByLocation[loc][e.cotation]) {
                ehpadByLocation[loc][e.cotation] = { count: 0, amount: 0 };
            }
            ehpadByLocation[loc][e.cotation].count++;
            ehpadByLocation[loc][e.cotation].amount += parseFloat(e.amount) || 0;
        });
        
        const sortedLocations = Object.keys(ehpadByLocation).sort();
        
        sortedLocations.forEach(locName => {
            doc.setFontSize(12);
            doc.setTextColor(30, 41, 59);
            doc.text(locName, 20, y);
            y += 8;
            
            doc.setFillColor(249, 250, 251);
            doc.rect(15, y - 6, 180, 10, 'F');
            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139);
            doc.text('Acte', 20, y);
            doc.text('Nombre', 110, y);
            doc.text('Montant', 170, y);
            
            y += 10;
            doc.setTextColor(30, 41, 59);
            
            const sortedCotations = Object.entries(ehpadByLocation[locName]).sort((a, b) => b[1].amount - a[1].amount);
            
            sortedCotations.forEach(([cotation, data]) => {
                doc.text(cotation, 20, y);
                doc.text(String(data.count), 110, y);
                doc.text(data.amount.toFixed(2) + ' €', 170, y);
                y += 8;
            });
            
            y += 5;
        });
        
        y += 5;
        doc.setDrawColor(226, 232, 240);
        doc.line(15, y, 195, y);
        y += 10;
        
        doc.setFontSize(12);
        doc.setTextColor(99, 102, 241);
        doc.text('TOTAL EHPAD', 20, y);
        const totalEhpad = ehpad.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
        doc.text(totalEhpad.toFixed(2) + ' €', 170, y);
        doc.text('(' + ehpad.length + ' actes)', 100, y);
        
        // ========== PAGE 3+: LISTE COMPLÈTE ==========
        doc.addPage();
        doc.setFillColor(240, 244, 252);
        doc.rect(0, 0, 210, 40, 'F');
        
        doc.setFontSize(24);
        doc.setTextColor(30, 41, 59);
        doc.text('LISTE DES PATIENTS', 105, 20, { align: 'center' });
        
        doc.setFontSize(16);
        doc.text(monthDisplay.toUpperCase(), 105, 32, { align: 'center' });
        
        y = 55;
        
        doc.setFillColor(249, 250, 251);
        doc.rect(15, y - 6, 180, 10, 'F');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text('Date', 20, y);
        doc.text('Patient', 50, y);
        doc.text('Lieu', 110, y);
        doc.text('Acte', 140, y);
        doc.text('Montant', 175, y);
        
        y += 10;
        
        const sortedEntries = [...monthEntries].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        sortedEntries.forEach((e, i) => {
            if (y > 270) {
                doc.addPage();
                y = 30;
            }
            
            doc.setTextColor(30, 41, 59);
            doc.setFontSize(9);
            doc.text(e.date || '-', 20, y);
            doc.text((e.patientName || '').substring(0, 25), 50, y);
            doc.text((e.location || '').substring(0, 12), 110, y);
            doc.text(e.cotation || '', 140, y);
            doc.text((e.amount || '0') + ' €', 175, y);
            
            y += 7;
        });
        
        y += 10;
        doc.setDrawColor(226, 232, 240);
        doc.line(15, y, 195, y);
        y += 10;
        
        doc.setFontSize(11);
        doc.setTextColor(99, 102, 241);
        doc.text('TOTAL GÉNÉRAL', 20, y);
        const totalAmount = monthEntries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
        doc.text(totalAmount.toFixed(2) + ' €', 170, y);
        
        // Save to database
        const pdfBase64 = doc.output('datauristring');
        
        const { data: savedRecord, error: saveError } = await supabaseClient
            .from('comptabilite')
            .insert([{
                user_id: currentUser.id,
                month_key: monthKey,
                month_name: monthDisplay,
                total_amount: totalAmount,
                total_visits: monthEntries.length,
                pdf_data: pdfBase64,
                generated_at: new Date().toISOString()
            }])
            .select()
            .single();
        
        if (saveError) {
            console.error('[PDF] Save error:', saveError);
            alert('Erreur lors de la sauvegarde: ' + saveError.message);
            return;
        }
        
        history.unshift({
            id: savedRecord.id,
            monthKey: monthKey,
            monthName: monthDisplay,
            totalAmount: totalAmount,
            totalVisits: monthEntries.length,
            pdfData: pdfBase64,
            generatedAt: savedRecord.generated_at
        });
        
        renderHistory();
        
        alert('PDF généré et sauvegardé!');
        console.log('[PDF] Done and saved!');
    } catch (err) {
        console.error('[PDF] Error:', err);
        alert('Erreur lors de la génération: ' + err.message);
    }
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
    
    // Previous month data
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    
    const prevMonthEntries = entries.filter(e => {
        const d = new Date(e.date);
        return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
    });
    
    const prevPatients = new Set(prevMonthEntries.map(e => e.patientId)).size;
    const prevAmount = prevMonthEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
    const prevVisits = prevMonthEntries.length;
    const prevAvg = prevVisits > 0 ? prevAmount / 28 : 0;
    
    console.log('[STATS] Month entries:', monthEntries.length);
    
    const totalPatients = new Set(monthEntries.map(e => e.patientId)).size;
    const totalAmount = monthEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalVisits = monthEntries.length;
    const dayOfMonth = new Date().getDate();
    const avgPerDay = totalVisits > 0 ? totalAmount / Math.max(dayOfMonth, 1) : 0;
    
    const el = (id) => document.getElementById(id);
    if (el('totalPatients')) {
        el('totalPatients').textContent = totalPatients;
        el('patientsComparison').innerHTML = formatComparison(totalPatients, prevPatients);
        console.log('[STATS] Set totalPatients:', totalPatients);
    }
    if (el('totalAmount')) {
        el('totalAmount').textContent = totalAmount.toFixed(2) + '€';
        el('amountComparison').innerHTML = formatComparison(totalAmount, prevAmount, true);
        console.log('[STATS] Set totalAmount:', totalAmount);
    }
    if (el('totalVisits')) {
        el('totalVisits').textContent = totalVisits;
        el('visitsComparison').innerHTML = formatComparison(totalVisits, prevVisits);
    }
    if (el('avgPerDay')) {
        el('avgPerDay').textContent = avgPerDay.toFixed(2) + '€';
        el('avgComparison').innerHTML = formatComparison(avgPerDay, prevAvg, true);
    }
    
    console.log('[STATS] Updated:', { totalPatients, totalAmount, totalVisits });
}

function formatComparison(current, previous, isCurrency = false) {
    if (previous === 0) {
        if (current > 0) return '<span class="positive">↑ nouveau</span>';
        return '<span class="neutral">-</span>';
    }
    
    const diff = ((current - previous) / previous) * 100;
    const arrow = diff >= 0 ? '↑' : '↓';
    const cls = diff >= 0 ? 'positive' : 'negative';
    
    if (isCurrency) {
        return `<span class="${cls}">${arrow} ${Math.abs(diff).toFixed(0)}%</span>`;
    }
    return `<span class="${cls}">${arrow} ${Math.abs(diff).toFixed(0)}%</span>`;
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
    
    tbody.innerHTML = monthEntries.map(e => {
        const locColor = getLocationColor(e.location);
        const locationBadge = e.location ? `<span class="location-badge small" style="background:${locColor}">${e.location}</span>` : e.location;
        return `
        <tr>
            <td>${e.date}</td>
            <td>${e.patientName}</td>
            <td>${locationBadge}</td>
            <td>${e.cotation}</td>
            <td>${(e.amount || 0).toFixed(2)}€</td>
            <td><button onclick="deleteEntry('${e.id}')" style="color:red;">×</button></td>
        </tr>
    `;}).join('');
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
    
    const ehpadLocations = ['Tamaris', 'Lilias RdC', 'Lilas 1er étage'];
    
    // ========== REVENUS MENSUELS ==========
    const monthlyData = {};
    const ehpadData = {};
    const medecinData = {};
    
    // Initialize all 12 months
    for (let m = 0; m < 12; m++) {
        const key = `${currentYear}-${String(m + 1).padStart(2, '0')}`;
        monthlyData[key] = 0;
        ehpadData[key] = 0;
        medecinData[key] = 0;
    }
    
    // Aggregate data
    entries.forEach(e => {
        const key = e.monthKey;
        if (monthlyData.hasOwnProperty(key)) {
            const amount = e.amount || 0;
            monthlyData[key] += amount;
            
            const location = e.location || '';
            if (ehpadLocations.includes(location)) {
                ehpadData[key] += amount;
            } else {
                medecinData[key] += amount;
            }
        }
    });
    
    // Calculate totals for legend
    const totalAnnual = Object.values(monthlyData).reduce((a, b) => a + b, 0);
    const totalEhpad = Object.values(ehpadData).reduce((a, b) => a + b, 0);
    const totalMedecin = Object.values(medecinData).reduce((a, b) => a + b, 0);
    
    // Render legend
    const legendContainer = document.getElementById('monthlyChartLegend');
    if (legendContainer) {
        legendContainer.innerHTML = `
            <div class="legend-row">
                <span class="legend-total"><span class="legend-dot" style="background: #6366f1;"></span> Total: ${totalAnnual.toFixed(0)}€</span>
                <span class="legend-ehpad"><span class="legend-dot" style="background: #10b981;"></span> EHPAD: ${totalEhpad.toFixed(0)}€</span>
                <span class="legend-medecin"><span class="legend-dot" style="background: #f59e0b;"></span> Médecine/SSR: ${totalMedecin.toFixed(0)}€</span>
            </div>
        `;
    }
    
    const barsContainer = document.getElementById('monthlyChartBars');
    const labelsContainer = document.getElementById('monthlyChartLabels');
    
    const sortedKeys = Array.from({length: 12}, (_, i) => `${currentYear}-${String(i + 1).padStart(2, '0')}`);
    const values = sortedKeys.map(k => monthlyData[k]);
    const maxVal = Math.max(...values, 1);
    
    if (barsContainer) {
        barsContainer.innerHTML = sortedKeys.map(key => {
            const val = monthlyData[key];
            const height = val > 0 ? (val / maxVal) * 100 : 0;
            const ehpadVal = ehpadData[key];
            const medecinVal = medecinData[key];
            const ehpadPct = val > 0 ? (ehpadVal / maxVal) * 100 : 0;
            const medecinPct = val > 0 ? (medecinVal / maxVal) * 100 : 0;
            const monthName = monthNames[parseInt(key.split('-')[1]) - 1];
            
            return `
                <div class="chart-bar-column" data-month="${monthName}" data-total="${val.toFixed(2)}" data-ehpad="${ehpadVal.toFixed(2)}" data-medecin="${medecinVal.toFixed(2)}">
                    <div class="chart-bar" style="height: ${height}%;">
                        ${val > 0 ? `
                            <span class="bar-value">${val.toFixed(0)}€</span>
                            <span class="data-point data-point-ehpad" style="bottom: ${ehpadPct}%;" title="EHPAD: ${ehpadVal.toFixed(0)}€"></span>
                            <span class="data-point data-point-medecin" style="bottom: ${medecinPct}%;" title="Médecine/SSR: ${medecinVal.toFixed(0)}€"></span>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    if (labelsContainer) {
        labelsContainer.innerHTML = sortedKeys.map(key => {
            const m = parseInt(key.split('-')[1]) - 1;
            return `<span>${monthNames[m]}</span>`;
        }).join('');
    }
    
    // Add click handlers for bar columns with popup
    document.querySelectorAll('.chart-bar-column').forEach(col => {
        col.style.cursor = 'pointer';
        col.addEventListener('click', function() {
            const month = this.dataset.month;
            const total = this.dataset.total;
            const ehpad = this.dataset.ehpad;
            const medecin = this.dataset.medecin;
            showMonthPopup(month, total, ehpad, medecin);
        });
    });
    
    // ========== PASSAGES MENSUELS ==========
    const visitsData = {};
    for (let m = 0; m < 12; m++) {
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
            const height = val > 0 ? (val / maxVal) * 100 : 0;
            return `<div class="chart-bar" style="height: ${height}%;"><span class="bar-value">${val}</span></div>`;
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
    const donutLegendContainer = document.getElementById('donutLegend');
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
    
    if (donutLegendContainer) {
        const total = Object.values(locationData).reduce((a, b) => a + b, 0);
        const entriesArr = Object.entries(locationData);
        donutLegendContainer.innerHTML = entriesArr.map(([loc, val], i) => {
            const pct = ((val / total) * 100).toFixed(1);
            const color = colors[i % colors.length];
            return `<div class="legend-item"><span class="legend-color" style="background:${color}"></span>${loc} <span class="legend-pct">${pct}%</span></div>`;
        }).join('');
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

function showMonthPopup(month, total, ehpad, medecin) {
    let popup = document.getElementById('monthPopup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'monthPopup';
        popup.className = 'popup-overlay';
        popup.innerHTML = `
            <div class="popup-content">
                <div class="popup-header">
                    <h3 id="popupMonthTitle"></h3>
                    <button class="popup-close" onclick="closeMonthPopup()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
                <div class="popup-body">
                    <div class="popup-row total">
                        <span class="popup-label">Total</span>
                        <span class="popup-value" id="popupTotal"></span>
                    </div>
                    <div class="popup-row ehpad">
                        <span class="popup-label"><span class="dot-ehpad"></span> EHPAD</span>
                        <span class="popup-value" id="popupEhpad"></span>
                    </div>
                    <div class="popup-row medecin">
                        <span class="popup-label"><span class="dot-medecin"></span> Médecine/SSR</span>
                        <span class="popup-value" id="popupMedecin"></span>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(popup);
        popup.addEventListener('click', function(e) {
            if (e.target === this) closeMonthPopup();
        });
    }
    
    document.getElementById('popupMonthTitle').textContent = month + ' 2026';
    document.getElementById('popupTotal').textContent = total + '€';
    document.getElementById('popupEhpad').textContent = ehpad + '€';
    document.getElementById('popupMedecin').textContent = medecin + '€';
    popup.style.display = 'flex';
}

function closeMonthPopup() {
    const popup = document.getElementById('monthPopup');
    if (popup) popup.style.display = 'none';
}

window.closeMonthPopup = closeMonthPopup;

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
    
    // Apply modern card styling
    container.querySelectorAll('.recent-item').forEach((item, index) => {
        item.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px;
            background: var(--color-bg-subtle);
            border-radius: 12px;
            margin-bottom: ${index < recent.length - 1 ? '8px' : '0'};
            transition: transform 0.2s, box-shadow 0.2s;
            cursor: pointer;
        `;
        item.addEventListener('mouseenter', () => {
            item.style.transform = 'translateY(-2px)';
            item.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        });
        item.addEventListener('mouseleave', () => {
            item.style.transform = 'translateY(0)';
            item.style.boxShadow = 'none';
        });
    });
    
    container.querySelectorAll('.recent-info').forEach(info => {
        info.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    });
    
    container.querySelectorAll('.recent-patient').forEach(patient => {
        patient.style.cssText = 'font-weight: 600; color: var(--color-text); font-size: 14px;';
    });
    
    container.querySelectorAll('.recent-date').forEach(date => {
        date.style.cssText = 'font-size: 12px; color: var(--color-text-secondary);';
    });
    
    container.querySelectorAll('.recent-amount').forEach(amount => {
        amount.style.cssText = 'font-weight: 700; color: #10b981; font-size: 16px;';
    });
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
window.downloadPDF = downloadPDF;
window.deletePDF = deletePDF;

// Initialize auth on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
} else {
    initAuth();
}