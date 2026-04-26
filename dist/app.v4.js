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
    console.log('[AUTH] Connexion réussie, user:', currentUser?.email);
    
    // Masquer écran login, afficher app
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app-container');
    
    if (loginScreen) loginScreen.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';
    
    // Initialiser l'UI immédiatement
    updateMonthDisplay();
    setDefaultDate();
    populateCotationSelect();
    
    // Charger les données utilisateur (async)
    loadUserProfile();
    loadUserSettings();
    await loadData();
    await loadPatients();
    
    renderEntries();
    renderCharts();
    updateStats();
    
    // Setup les eventListeners pour l'app
    setupEventListeners();
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
    
    // Récupérer depuis le form si pas fournis
    if (!email) email = document.getElementById('login-email')?.value;
    if (!password) password = document.getElementById('login-password')?.value;
    
    if (!email || !password) {
        showError('Veuillez entrer email et mot de passe');
        return;
    }
    
    try {
        const button = document.querySelector('#login-form button[type="submit"]');
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
        const button = document.querySelector('#login-form button[type="submit"]');
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
        'CH': 25,
        'CS': 26,
        'CSP': 30,
        'CNPSY': 30,
        'CNP': 26,
        'APS': 26,
        'AP': 26,
        'VU': 26,
        'VPP': 26,
        'VS': 30,
        'VL': 60,
        'VL+MD': 70,
        'VSP': 55,
        'IMT': 26,
        'Forfait': 20
    }
};

const VL_COTATIONS = ['VL', 'VL+MD', 'VSP', 'IMT'];

// Legacy compatibility - fonctions minimales
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
    try {
        const { data: patientsData, error } = await supabaseClient
            .from('patients')
            .select('id, name')
            .eq('user_id', currentUser.id)
            .order('name', { ascending: true });

        if (error) {
            console.error('Erreur patients:', error);
            throw error;
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
    if (!currentUser) {
        console.log('[DATA] No user logged in, skipping data load');
        return;
    }
    
    try {
        // Only load data from last 2 years to speed up
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

        console.log('=== LOAD DATA ===');
        console.log('User ID:', currentUser?.id);
        console.log('User ID matches DB:', currentUser?.id === 'fa155f5d-8dbb-4f76-885a-39a1095e1e8b');

        const { data: passages, error: passagesError } = await supabaseClient
            .from('passages')
            .select('*, patients(name)')
            .eq('user_id', currentUser.id)
            .gte('date', twoYearsAgo.toISOString().split('T')[0])
            .order('date', { ascending: false });

        console.log('Passages loaded:', passages?.length || 0, passagesError);
        if (passagesError) {
            console.log('Table passages error:', passagesError);
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
    });
    
    document.getElementById('saveDepenseBtn')?.addEventListener('click', saveDepense);
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
        'vl': 'Suivi VL',
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
    } else if (viewName === 'vl') {
        loadVLHistory().then(() => renderVLList());
    } else if (viewName === 'add') {
        loadVLHistory().then(() => renderRecentVLForAdd());
    } else if (viewName === 'cabinet') {
        loadCabinetData();
    }
}

// ===== CABINET FUNCTIONS =====
let cabinetDepenses = [];

async function loadCabinetData() {
    if (currentProfile?.role === 'secretaire') {
        // Secretary can see all
        await loadDepenses();
        await loadDocuments();
    } else if (currentProfile?.role === 'medecin_installe') {
        // Doctor can see their own
        await loadDepenses();
        await loadDocuments();
    }
    // medecin_remplacant doesn't have cabinet access
}

async function loadDepenses() {
    try {
        const { data, error } = await supabaseClient
            .from('cabinet_depenses')
            .select('*')
            .order('date', { ascending: false });
        
        if (data) {
            cabinetDepenses = data;
            renderDepenses();
        }
    } catch (error) {
        console.error('Erreur loadDepenses:', error);
    }
}

function renderDepenses() {
    const container = document.getElementById('depensesList');
    const totalEl = document.getElementById('totalDepenses');
    
    if (!container) return;
    
    const total = cabinetDepenses.reduce((sum, d) => sum + d.amount, 0);
    if (totalEl) totalEl.textContent = `${total.toFixed(2)}€`;
    
    if (cabinetDepenses.length === 0) {
        container.innerHTML = '<div class="no-entries">Aucune dépense enregistrée</div>';
        return;
    }
    
    container.innerHTML = cabinetDepenses.map(d => `
        <div class="depense-item">
            <div>
                <span class="description">${d.description}</span>
                <span class="category">${d.category}</span>
            </div>
            <span class="amount">-${d.amount.toFixed(2)}€</span>
        </div>
    `).join('');
}

async function saveDepense() {
    const description = document.getElementById('depenseDescription').value;
    const amount = parseFloat(document.getElementById('depenseAmount').value);
    const category = document.getElementById('depenseCategory').value;
    const date = document.getElementById('depenseDate').value || new Date().toISOString().split('T')[0];
    
    if (!description || !amount) {
        alert('Veuillez remplir tous les champs');
        return;
    }
    
    const { error } = await supabaseClient
        .from('cabinet_depenses')
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
    
    document.getElementById('depenseDescription').value = '';
    document.getElementById('depenseAmount').value = '';
    document.getElementById('depensesForm').style.display = 'none';
    
    await loadDepenses();
}

let cabinetDocuments = [];

async function loadDocuments() {
    try {
        const { data, error } = await supabaseClient
            .from('cabinet_documents')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (data) {
            cabinetDocuments = data;
            renderDocuments();
        }
    } catch (error) {
        console.error('Erreur loadDocuments:', error);
    }
}

function renderDocuments() {
    const container = document.getElementById('documentsList');
    
    if (!container) return;
    
    if (cabinetDocuments.length === 0) {
        container.innerHTML = '<div class="no-entries">Aucun document enregistré</div>';
        return;
    }
    
    container.innerHTML = cabinetDocuments.map(d => `
        <div class="document-item">
            <div>
                <span class="description">${d.title}</span>
                <span class="type">${d.type}</span>
            </div>
        </div>
    `).join('');
}

function renderRecentList() {
    const container = document.getElementById('recentList');
    if (!container) return;
    
    const monthKey = getCurrentMonthKey();
    const monthEntries = entries.filter(e => e.monthKey === monthKey).slice(0, 5);
    
    if (monthEntries.length === 0) {
        container.innerHTML = '<div class="no-entries">Aucun passage ce mois-ci</div>';
        return;
    }
    
    container.innerHTML = monthEntries.map(entry => `
        <div class="recent-item">
            <div>
                <div class="patient">${entry.patientName}</div>
                <div class="info">
                    <span class="location-badge ${getLocationClass(entry.location)}">${entry.location}</span>
                    <span class="cotation-badge">${entry.cotation}</span>
                </div>
            </div>
            <div class="amount">${entry.amount.toFixed(2)}€</div>
        </div>
    `).join('');
}

function renderCharts() {
    const monthKey = getCurrentMonthKey();
    const monthEntries = entries.filter(e => e.monthKey === monthKey);
    
    const currentYear = new Date().getFullYear();
    const yearEntries = entries.filter(e => e.monthKey.startsWith(String(currentYear)));

    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    
    // Create all 12 months for current year
    const months = [];
    for (let m = 1; m <= 12; m++) {
        const key = `${currentYear}-${String(m).padStart(2, '0')}`;
        const monthData = yearEntries.filter(e => e.monthKey === key);
        months.push({
            key,
            amount: monthData.reduce((sum, e) => sum + e.amount, 0),
            count: monthData.length,
            name: monthNames[m - 1]
        });
    }

    // Monthly revenue chart
    const monthlyBars = document.getElementById('monthlyChartBars');
    const monthlyLabels = document.getElementById('monthlyChartLabels');
    if (monthlyBars && monthlyLabels) {
        const maxAmount = Math.max(...months.map(m => m.amount), 1);
        monthlyBars.innerHTML = months.map(m =>
            `<div class="chart-bar revenue" style="height: ${(m.amount / maxAmount) * 100}%">
                <span class="bar-value">${m.amount.toFixed(0)}€</span>
            </div>`
        ).join('');
        monthlyLabels.innerHTML = months.map(m =>
            `<span class="chart-label">${m.name}</span>`
        ).join('');
    }

    // Visits chart
    const visitsChartBars = document.getElementById('visitsChartBars');
    const visitsChartLabels = document.getElementById('visitsChartLabels');
    if (visitsChartBars && visitsChartLabels) {
        const maxVisits = Math.max(...months.map(m => m.count), 1);
        visitsChartBars.innerHTML = months.map(m =>
            `<div class="chart-bar visits" style="height: ${(m.count / maxVisits) * 100}%">
                <span class="bar-value">${m.count}</span>
            </div>`
        ).join('');
        visitsChartLabels.innerHTML = months.map(m =>
            `<span class="chart-label">${m.name}</span>`
        ).join('');
}

    // Cotation chart
    const cotationBars = document.getElementById('cotationChartBars');
    const cotationLabels = document.getElementById('cotationChartLabels');
    if (cotationBars && cotationLabels) {
        const byCotation = {};
        monthEntries.forEach(e => {
            byCotation[e.cotation] = (byCotation[e.cotation] || 0) + 1;
        });
        const sortedCotations = Object.entries(byCotation).sort((a, b) => b[1] - a[1]).slice(0, 6);
        if (sortedCotations.length > 0) {
            const maxCotation = Math.max(...sortedCotations.map(c => c[1]), 1);
            cotationBars.innerHTML = sortedCotations.map(([c, count]) => 
                `<div class="chart-bar" style="height: ${(count / maxCotation) * 100}%">
                    <span class="bar-value">${count}</span>
                </div>`
            ).join('');
            cotationLabels.innerHTML = sortedCotations.map(([c]) => 
                `<span class="chart-label">${c}</span>`
            ).join('');
        } else {
            cotationBars.innerHTML = '';
            cotationLabels.innerHTML = '<span class="chart-label">-</span>';
        }
    }
    
    // Donut chart - Repartition by location
    const donutChart = document.getElementById('donutChart');
    const donutLegend = document.getElementById('donutLegend');
    
    if (donutChart && donutLegend) {
        const byLocation = {};
        monthEntries.forEach(e => {
            byLocation[e.location] = (byLocation[e.location] || 0) + 1;
        });
        
        const colors = {
            'Médecine': '#4F46E5',
            'SSR': '#8b5cf6',
            'Lilias RdC': '#10b981',
            'Lilas 1er étage': '#f59e0b',
            'Tamaris': '#ec4899'
        };
        
        const total = Object.values(byLocation).reduce((a, b) => a + b, 0) || 1;
        let currentAngle = 0;
        
        const gradientParts = Object.entries(byLocation).map(([loc, count]) => {
            const percentage = (count / total) * 100;
            const startAngle = currentAngle;
            currentAngle += percentage;
            return `${colors[loc] || '#94a3b8'} ${startAngle}% ${currentAngle}%`;
        });
        
        donutChart.style.background = `conic-gradient(${gradientParts.join(', ')})`;
        
        // Add total in center
        donutChart.dataset.total = total + ' actes';
        
        donutLegend.innerHTML = Object.entries(byLocation).map(([loc, count]) => {
            const percentage = ((count / total) * 100).toFixed(0);
            return `
            <div class="legend-item">
                <span class="legend-dot" style="background: ${colors[loc] || '#94a3b8'}"></span>
                ${loc}
                <strong>${count} (${percentage}%)</strong>
            </div>
        `;
        }).join('');
}
}

function renderSettingsCotationList() {
    const container = document.getElementById('settingsCotationList');
    const cotations = COTATIONS['EHPAD'];
    
    container.innerHTML = Object.entries(cotations).map(([key, value]) => `
        <div class="settings-cotation-item" data-key="${key}">
            <span class="cotation-key">${key}</span>
            <input type="number" class="cotation-amount" value="${value}" step="0.01" onchange="updateCotationPrice('${key}', this.value)">
            <span>€</span>
            <button class="delete-cotation" onclick="deleteCotation('${key}')" title="Supprimer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
            </button>
        </div>
    `).join('');
}

function updateCotationPrice(key, newPrice) {
    const price = parseFloat(newPrice);
    if (isNaN(price) || price <= 0) {
        alert('Montant invalide');
        renderSettingsCotationList();
        return;
    }
    COTATIONS['EHPAD'][key] = price;
    
    // Update select if open
    handleLocationChange();
}

function deleteCotation(key) {
    if (!confirm(`Supprimer la cotation ${key} ?`)) return;
    
    delete COTATIONS['EHPAD'][key];
    handleLocationChange();
    renderSettingsCotationList();
}

function addNewCotationFromSettings() {
    const key = document.getElementById('newCotationKey').value.trim().toUpperCase();
    const amount = parseFloat(document.getElementById('newCotationAmount').value);
    
    if (!key || isNaN(amount) || amount <= 0) {
        alert('Veuillez entrer une clé et un montant valide');
        return;
    }
    
    if (COTATIONS['EHPAD'][key]) {
        alert('Cette cotation existe déjà');
        return;
    }
    
    COTATIONS['EHPAD'][key] = amount;
    handleLocationChange();
    renderSettingsCotationList();
    
    document.getElementById('newCotationKey').value = '';
    document.getElementById('newCotationAmount').value = '';
}

function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('visitDate').value = today;
}

function updateMonthDisplay() {
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const monthStr = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    const currentMonthEl = document.getElementById('currentMonth');
    const currentMonthAddEl = document.getElementById('currentMonthAdd');
    if (currentMonthEl) currentMonthEl.textContent = monthStr;
    if (currentMonthAddEl) currentMonthAddEl.textContent = monthStr;
}

function updateMobileMonthDisplay() {
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const monthStr = `${monthNames[currentDate.getMonth()]}`;
    const mobileMonthEl = document.getElementById('mobileCurrentMonth');
    if (mobileMonthEl) mobileMonthEl.textContent = monthStr;
}

function setupMobileMonthSelector() {
    const mobilePrev = document.getElementById('mobilePrevMonth');
    const mobileNext = document.getElementById('mobileNextMonth');
    if (mobilePrev) {
        mobilePrev.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            changeMonth(-1);
        });
    }
    if (mobileNext) {
        mobileNext.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            changeMonth(1);
        });
    }

    const mobileBackBtn = document.getElementById('mobileBackBtn');
    if (mobileBackBtn) {
        mobileBackBtn.addEventListener('click', () => {
            switchView('dashboard');
        });
    }
}

function changeMonth(delta) {
    console.log('changeMonth called with delta:', delta, 'currentDate before:', currentDate.toISOString());
    currentDate.setMonth(currentDate.getMonth() + delta);
    console.log('currentDate after:', currentDate.toISOString());
    updateMonthDisplay();
    updateMobileMonthDisplay();
    renderEntries();
    renderCharts();
    updateStats();
}

function getCurrentMonthKey() {
    return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
}

function populateCotationSelect() {
    handleLocationChange();
}

function handleLocationChange() {
    const location = document.getElementById('visitLocation').value;
    const cotationSelect = document.getElementById('cotation');
    const customCotationDiv = document.getElementById('customCotation');
    
    cotationSelect.innerHTML = '<option value="">Sélectionner...</option>';
    customCotationDiv.style.display = 'none';
    
    if (!location) {
        handleCotationChange();
        return;
    }
    
    // Médecine et SSR = toujours G
    if (location === 'Médecine' || location === 'SSR') {
        const option = document.createElement('option');
        option.value = 'G';
        option.textContent = 'G - 30€';
        option.dataset.amount = 30;
        option.selected = true;
        cotationSelect.appendChild(option);
        handleCotationChange();
        return;
    }
    
    // EHPAD = toutes les cotations + option nouvelle
    const cotations = COTATIONS['EHPAD'];
    for (const [key, value] of Object.entries(cotations)) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = `${key} - ${value}€`;
        option.dataset.amount = value;
        cotationSelect.appendChild(option);
    }
    
    // Option nouvelle cotation
    const newOption = document.createElement('option');
    newOption.value = '__new__';
    newOption.textContent = '+ Nouvelle cotation...';
    cotationSelect.appendChild(newOption);
    
    handleCotationChange();
}

function handleCotationChange() {
    const select = document.getElementById('cotation');
    const selectedOption = select.options[select.selectedIndex];
    const customCotationDiv = document.getElementById('customCotation');
    const vlAlert = document.getElementById('vlAlert');
    
    if (selectedOption.value === '__new__') {
        customCotationDiv.style.display = 'flex';
        const amountDisplay = document.getElementById('amountDisplay');
        if (amountDisplay) amountDisplay.textContent = '0€';
        if (vlAlert) vlAlert.style.display = 'none';
        return;
    }
    
    customCotationDiv.style.display = 'none';
    const amount = selectedOption.dataset.amount || '0';
    const amountDisplay2 = document.getElementById('amountDisplay');
    if (amountDisplay2) amountDisplay2.textContent = `${amount}€`;
    
    // Reset alert style
    if (vlAlert) {
        vlAlert.style.background = '#FEF3C7';
        vlAlert.style.borderColor = '#F59E0B';
        vlAlert.style.color = '#92400E';
    }
    
    // Check VL/VSP/IMT conditions
    if (VL_COTATIONS.includes(selectedOption.value) && selectedPatientId) {
        checkVLAlert(selectedPatientId);
    } else if (vlAlert) {
        vlAlert.style.display = 'none';
    }
}

function saveCustomCotation() {
    const key = document.getElementById('customCotationKey').value.trim().toUpperCase();
    const amount = parseFloat(document.getElementById('customCotationAmount').value);
    
    if (!key || isNaN(amount) || amount <= 0) {
        alert('Veuillez entrer une clé et un montant valide');
        return;
    }
    
    // Ajouter la nouvelle cotation
    COTATIONS['EHPAD'][key] = amount;
    
    // Ajouter au select
    const cotationSelect = document.getElementById('cotation');
    const newOption = document.createElement('option');
    newOption.value = key;
    newOption.textContent = `${key} - ${amount}€`;
    newOption.dataset.amount = amount;
    
    // Insérer avant l'option "Nouvelle cotation"
    const newOptionEl = Array.from(cotationSelect.options).find(o => o.value === '__new__');
    if (newOptionEl) {
        cotationSelect.insertBefore(newOption, newOptionEl);
    } else {
        cotationSelect.appendChild(newOption);
    }
    
    // Sélectionner la nouvelle cotation
    cotationSelect.value = key;
    
    // Masquer les inputs et mettre à jour le montant
    document.getElementById('customCotation').style.display = 'none';
    document.getElementById('customCotationKey').value = '';
    document.getElementById('customCotationAmount').value = '';
    const amountDisplay3 = document.getElementById('amountDisplay');
    if (amountDisplay3) amountDisplay3.textContent = `${amount}€`;
}

function handlePatientSearch(e) {
    const query = e.target.value.toUpperCase().trim();
    const dropdown = document.getElementById('autocomplete-dropdown');
    
    if (query.length < 2) {
        dropdown.classList.remove('active');
        selectedPatientId = null;
        return;
    }
    
    const matches = patients.filter(p => 
        p.name.toUpperCase().includes(query)
    ).slice(0, 5);
    
    if (matches.length === 0) {
        dropdown.classList.remove('active');
        selectedPatientId = null;
        return;
    }
    
    dropdown.innerHTML = matches.map(p => {
        const lastVisitFormatted = p.last_visit ? new Date(p.last_visit).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Jamais';
        return `
        <div class="autocomplete-item" data-id="${p.id}" data-name="${p.name}">
            <div class="patient-name">${p.name}</div>
            <div class="patient-info">
                <span>Dernière visite: ${lastVisitFormatted}</span>
                <span>${p.visit_count || 0} passages</span>
            </div>
        </div>
    `}).join('');
    
    dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => selectPatient(item.dataset.id, item.dataset.name));
    });
    
    dropdown.classList.add('active');
}

async function selectPatient(patientId, patientName) {
    const input = document.getElementById('patientName');
    input.value = patientName;
    selectedPatientId = parseInt(patientId);
    document.getElementById('autocomplete-dropdown').classList.remove('active');
    
    const { data: lastVisit } = await supabaseClient
        .from('passages')
        .select('location, cotation')
        .eq('patient_id', patientId)
        .order('date', { ascending: false })
        .limit(1)
        .single();
    
    if (lastVisit) {
        document.getElementById('visitLocation').value = lastVisit.location;
        handleLocationChange();
        
        // Si Médecine ou SSR, forcer G sinon utiliser la dernière cotation
        setTimeout(() => {
            if (lastVisit.location === 'Médecine' || lastVisit.location === 'SSR') {
                document.getElementById('cotation').value = 'G';
            } else {
                document.getElementById('cotation').value = lastVisit.cotation;
            }
            handleCotationChange();
        }, 50);
    }
    
    // Check VL/VSP/IMT alert if one is currently selected
    const cotationSelect = document.getElementById('cotation');
    if (VL_COTATIONS.includes(cotationSelect.value)) {
        checkVLAlert(selectedPatientId);
    }
}

function formatPatientName(input) {
    const parts = input.trim().split(/\s+/);
    if (parts.length < 2) return input;
    
    const lastName = parts[0].toUpperCase();
    const firstName = parts.slice(1).map(n => n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()).join(' ');
    
    return `${lastName} ${firstName}`;
}

async function handleSubmit(e) {
    e.preventDefault();
    
    let patientName = formatPatientName(document.getElementById('patientName').value);
    
    let patientId = selectedPatientId;
    
    if (!patientId) {
        const existing = patients.find(p => p.name.toUpperCase() === patientName.toUpperCase());
        if (existing) {
            patientId = existing.id;
        } else {
            // Determiner l'user_id pour le patient: si remplacant, utiliser le medecin remplace
            const patientUserId = currentProfile?.role === 'medecin_remplacant' && currentProfile?.remplace_medecin_id
                ? currentProfile.remplace_medecin_id
                : currentUser.id;
            
            const { data: newPatient, error } = await supabaseClient
                .from('patients')
                .insert([{ name: patientName, user_id: patientUserId }])
                .select()
                .single();
            
            if (error) {
                alert('Erreur: ' + error.message);
                return;
            }
            
            patientId = newPatient.id;
            patients.push(newPatient);
        }
    }
    
    const cotationValue = document.getElementById('cotation').value;
    
    if (VL_COTATIONS.includes(cotationValue) && patientId) {
        const vlCheck = canCoteVL(patientId, cotationValue);
        if (!vlCheck.canCote) {
            alert(vlCheck.message);
            return;
        }
    }
    
    // Determiner l'user_id: si remplacant, utiliser le medecin remplace
    const userId = currentProfile?.role === 'medecin_remplacant' && currentProfile?.remplace_medecin_id
        ? currentProfile.remplace_medecin_id
        : currentUser.id;
    
    const entry = {
        patient_id: patientId,
        user_id: userId,
        date: document.getElementById('visitDate').value,
        location: document.getElementById('visitLocation').value,
        cotation: cotationValue,
        amount: parseFloat(document.getElementById('amountDisplay').textContent.replace('€', '')) || 0,
        month_key: getMonthKeyFromDate(document.getElementById('visitDate').value)
    };
    
    const { data, error } = await supabaseClient
        .from('passages')
        .insert([entry])
        .select()
        .single();
    
    if (error) {
        alert('Erreur: ' + error.message);
        return;
    }
    
    entries.unshift({
        id: data.id,
        patientId: data.patient_id,
        patientName: patientName,
        date: data.date,
        location: data.location,
        cotation: data.cotation,
        amount: data.amount,
        monthKey: data.month_key
    });
    
    renderEntries();
    renderCharts();
    updateStats();
    
    document.getElementById('entryForm').reset();
    setDefaultDate();
    selectedPatientId = null;
    populateCotationSelect();
    const amountDisplay4 = document.getElementById('amountDisplay');
    if (amountDisplay4) amountDisplay4.textContent = '0€';
}

function getMonthKeyFromDate(dateStr) {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

async function deleteEntry(id) {
    const { error } = await supabaseClient
        .from('passages')
        .delete()
        .eq('id', id);
    
    if (error) {
        alert('Erreur: ' + error.message);
        return;
    }
    
    entries = entries.filter(e => e.id !== id);
    renderEntries();
    renderCharts();
    updateStats();
}

function renderEntries() {
    const monthKey = getCurrentMonthKey();
    const monthEntries = entries.filter(e => e.monthKey === monthKey);
    
    const tbody = document.getElementById('entriesBody');
    const noEntries = document.getElementById('noEntries');
    
    if (monthEntries.length === 0) {
        tbody.innerHTML = '';
        noEntries.style.display = 'block';
        return;
    }
    
    noEntries.style.display = 'none';
    monthEntries.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    tbody.innerHTML = monthEntries.map(entry => {
        const locationClass = getLocationClass(entry.location);
        const dateFormatted = formatDate(entry.date);
        
        return `
            <tr>
                <td>${dateFormatted}</td>
                <td>${entry.patientName}</td>
                <td><span class="location-badge ${locationClass}">${entry.location}</span></td>
                <td><span class="cotation-badge">${entry.cotation}</span></td>
                <td class="amount-cell">${entry.amount.toFixed(2)}€</td>
                <td>
                    <button class="delete-btn" onclick="deleteEntry(${entry.id})" title="Supprimer">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function getLocationClass(location) {
    if (location === 'Médecine' || location === 'SSR') return 'Médecin';
    if (location.includes('Lilias')) return 'Lilias';
    if (location.includes('Lilas')) return 'Lilas';
    if (location === 'Tamaris') return 'Tamaris';
    return '';
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function updateStats() {
    const monthKey = getCurrentMonthKey();
    const monthEntries = entries.filter(e => e.monthKey === monthKey);
    
    const totalPatients = new Set(monthEntries.map(e => e.patientId)).size;
    
    // Only apply 10% deduction to Médecine and SSR
    const medecinSSRAmount = monthEntries
        .filter(e => e.location === 'Médecine' || e.location === 'SSR')
        .reduce((sum, e) => sum + e.amount, 0);
    const ehpadAmount = monthEntries
        .filter(e => e.location !== 'Médecine' && e.location !== 'SSR')
        .reduce((sum, e) => sum + e.amount, 0);
    const grossAmount = medecinSSRAmount + ehpadAmount;
    const retainedAmount = medecinSSRAmount * 0.1;
    const netAmount = ehpadAmount + (medecinSSRAmount * 0.9);
    
    const totalVisits = monthEntries.length;
    
    const uniqueDays = new Set(monthEntries.map(e => e.date)).size;
    const avgPerDay = uniqueDays > 0 ? netAmount / uniqueDays : 0;
    const avgPerPatient = totalPatients > 0 ? netAmount / totalPatients : 0;
    const avgPerVisit = totalVisits > 0 ? netAmount / totalVisits : 0;
    
    // Stats by location
    const byLocation = {};
    monthEntries.forEach(e => {
        byLocation[e.location] = (byLocation[e.location] || 0) + 1;
    });
    const topLocation = Object.entries(byLocation).sort((a, b) => b[1] - a[1])[0];
    
    const totalPatientsEl = document.getElementById('totalPatients');
    const totalAmountEl = document.getElementById('totalAmount');
    const totalVisitsEl = document.getElementById('totalVisits');
    const avgPerDayEl = document.getElementById('avgPerDay');
    
    if (totalPatientsEl) totalPatientsEl.textContent = totalPatients;
    if (totalAmountEl) totalAmountEl.textContent = `${netAmount.toFixed(2)}€`;
    if (totalVisitsEl) totalVisitsEl.textContent = totalVisits;
    if (avgPerDayEl) avgPerDayEl.textContent = `${avgPerDay.toFixed(2)}€`;
    
    // Add more stats to additional elements
    const existingExtraStats = document.getElementById('extraStats');
    if (existingExtraStats) {
        existingExtraStats.innerHTML = `
            <div class="stat-card mini">
                <span class="stat-label">Brut</span>
                <span class="stat-value">${grossAmount.toFixed(2)}€</span>
            </div>
            <div class="stat-card mini">
                <span class="stat-label">Retenue 10%</span>
                <span class="stat-value danger">-${retainedAmount.toFixed(2)}€</span>
            </div>
            <div class="stat-card mini">
                <span class="stat-label">Moy/patient</span>
                <span class="stat-value">${avgPerPatient.toFixed(2)}€</span>
            </div>
            <div class="stat-card mini">
                <span class="stat-label">Moy/visite</span>
                <span class="stat-value">${avgPerVisit.toFixed(2)}€</span>
            </div>
            <div class="stat-card mini">
                <span class="stat-label">Top lieu</span>
                <span class="stat-value">${topLocation ? topLocation[0] : '-'}</span>
            </div>
            <div class="stat-card mini">
                <span class="stat-label">Jours actifs</span>
                <span class="stat-value">${uniqueDays}</span>
            </div>
        `;
    }
}

function generatePDF() {
    try {
        const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
        if (!jsPDF) {
            console.error('jsPDF not found', window.jspdf);
            alert('Erreur: jsPDF non chargé');
            return;
        }
        
        const monthKey = getCurrentMonthKey();
        const monthEntries = entries.filter(e => e.monthKey === monthKey);
        
        if (monthEntries.length === 0) {
            alert('Aucun passage enregistré ce mois-ci');
            return;
        }
        
        const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                            'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        const monthNum = parseInt(monthKey.split('-')[1]);
        const year = monthKey.split('-')[0];
        const monthName = monthNames[monthNum - 1];
        
const doc = new jsPDF();
        doc.setFont('helvetica', 'bold');
    
    // ===== PAGE 1: MÉDECINE - SSR =====
    const medecineSSR = monthEntries.filter(e => e.location === 'Médecine' || e.location === 'SSR');
    
    // Header
    if (settings.logo) {
        try {
            doc.addImage(settings.logo, 'JPEG', 15, 5, 25, 25);
        } catch (e) {
            console.warn('Could not add logo:', e);
        }
    }
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('CENTRE HOSPITALIER SAINT JEAN', 105, 15, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('63, Faubourg de Rennes, 35130 LA GUERCHE DE BRETAGNE', 105, 22, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('HONORAIRES MÉDICAUX', 105, 32, { align: 'center' });
    doc.text('EN SERVICES DE MÉDECINE - SSR', 105, 39, { align: 'center' });
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('RÉFÉRENCES :', 14, 50);
    doc.text('Application de la loi 2021-502 du 26 avril 2021 (notamment l\'article 19)', 14, 55);
    doc.text('Application des articles L 6146-2 et L 6146-41 du Code de la santé publique', 14, 60);
    
    doc.text('Les honoraires sont fixés à 100% de la valeur de l\'acte conventionné.', 14, 68);
    doc.text('Sur ces honoraires est due à l\'établissement une redevance de 10% pour participation aux frais', 14, 73);
    doc.text('de structure, de personnel et d\'équipements hospitaliers de l\'établissement.', 14, 78);
    
    doc.setFont('helvetica', 'bold');
    doc.text('DÉSIGNATION :', 14, 88);
    doc.setFont('helvetica', 'normal');
    doc.text('Docteur DORE Pierre-François', 14, 93);
    doc.text('Médecin généraliste, autorisé à exercer dans l\'établissement.', 14, 98);
    doc.text('CCM BETTON IBAN FR7615589351100287012394050', 14, 103);
    
    doc.setFont('helvetica', 'bold');
    doc.text('ETAT DES SOMMES DUES POUR LE MOIS DE :', 14, 113);
    doc.setFont('helvetica', 'normal');
    doc.text(monthName, 80, 113);
    
    // Table header
    let yPos = 125;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Nombre', 20, yPos);
    doc.text('Actes', 50, yPos);
    doc.text('Prix', 90, yPos);
    doc.text('Montant', 130, yPos);
    doc.line(15, yPos + 2, 160, yPos + 2);
    
    yPos += 10;
    doc.setFont('helvetica', 'normal');
    
    // Count cotations for Médecine/SSR
    let medCount = { G: 0, VG: 0, MPA: 0 };
    medecineSSR.forEach(e => {
        if (e.cotation === 'G') medCount.G++;
    });
    
    doc.text(medCount.G.toString(), 20, yPos);
    doc.text('G', 50, yPos);
    doc.text('30,00 €', 90, yPos);
    doc.text((medCount.G * 30).toFixed(2).replace('.', ',') + ' €', 130, yPos);
    yPos += 7;
    
    doc.text('0', 20, yPos);
    doc.text('VG', 50, yPos);
    doc.text('40,00 €', 90, yPos);
    doc.text('0', 130, yPos);
    yPos += 7;
    
    doc.text('0', 20, yPos);
    doc.text('MPA', 50, yPos);
    doc.text('5,00 €', 90, yPos);
    doc.text('0', 130, yPos);
    yPos += 15;
    
    const medTotal = medCount.G * 30;
    
    doc.setFont('helvetica', 'bold');
    doc.text('Montant total', 20, yPos);
    doc.text(medTotal.toFixed(2).replace('.', ','), 130, yPos);
    yPos += 7;
    
    doc.text('Retenue 10%', 20, yPos);
    doc.text((medTotal * 0.1).toFixed(2).replace('.', ','), 130, yPos);
    yPos += 7;
    
    doc.text('Montant à verser', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text((medTotal * 0.9).toFixed(2).replace('.', ','), 130, yPos);
    
    // Footer page 1
    yPos += 20;
    doc.setFont('helvetica', 'italic');
    doc.text('Arrêt le présent mémoire à la somme de : ' + (medTotal * 0.9).toFixed(2).replace('.', ',') + ' €', 14, yPos);
    
    yPos += 15;
    const today = new Date();
    const monthNamesFr = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    doc.setFont('helvetica', 'normal');
    doc.text('La Guerche de Bretagne, le ' + today.getDate() + ' ' + monthNamesFr[today.getMonth()] + ' ' + today.getFullYear(), 14, yPos);
    
    yPos += 15;
doc.setFont('helvetica', 'bold');
    doc.text('Docteur DORE', 14, yPos);
    yPos += 10;
    doc.line(14, yPos, 80, yPos);
    
    if (settings.signature) {
        try {
            doc.addImage(settings.signature, 'JPEG', 14, yPos + 8, 40, 20);
        } catch (e) {
            console.warn('Could not add signature:', e);
        }
    }
    
    doc.setFontSize(8);
    doc.text('Signature', 35, yPos + 35);
    
    // ===== PAGE 2: EHPAD =====
    doc.addPage();
    
    const ehpad = monthEntries.filter(e => e.location !== 'Médecine' && e.location !== 'SSR');
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('CENTRE HOSPITALIER SAINT JEAN', 105, 15, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('63, Faubourg de Rennes, 35130 LA GUERCHE DE BRETAGNE', 105, 22, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('HONORAIRES MÉDICAUX', 105, 32, { align: 'center' });
    doc.text('EN ÉTABLISSEMENTS POUR PERSONNES ÂGÉES (EHPAD)', 105, 39, { align: 'center' });
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('RÉFÉRENCES :', 14, 50);
    doc.text('Convention médicale - Tarifs applies aux actes en EHPAD', 14, 55);
    
    doc.setFont('helvetica', 'bold');
    doc.text('DÉSIGNATION :', 14, 65);
    doc.setFont('helvetica', 'normal');
    doc.text('Docteur DORE Pierre-François', 14, 70);
    doc.text('Médecin généraliste intervenant en EHPAD', 14, 75);
    doc.text('CCM BETTON IBAN FR7615589351100287012394050', 14, 80);
    
    doc.setFont('helvetica', 'bold');
    doc.text('ETAT DES SOMMES DUES POUR LE MOIS DE :', 14, 90);
    doc.setFont('helvetica', 'normal');
    doc.text(monthName, 80, 90);
    
    // EHPAD table
    yPos = 102;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Nombre', 20, yPos);
    doc.text('Actes', 50, yPos);
    doc.text('Prix', 90, yPos);
    doc.text('Montant', 130, yPos);
    doc.line(15, yPos + 2, 160, yPos + 2);
    
    yPos += 10;
    doc.setFont('helvetica', 'normal');
    
    const ehpadCotations = {};
    ehpad.forEach(e => {
        ehpadCotations[e.cotation] = (ehpadCotations[e.cotation] || 0) + 1;
    });
    
    let ehpadTotal = 0;
    Object.entries(ehpadCotations).forEach(([cot, count]) => {
        const price = COTATIONS['EHPAD'][cot] || 0;
        const subtotal = count * price;
        ehpadTotal += subtotal;
        doc.text(count.toString(), 20, yPos);
        doc.text(cot, 50, yPos);
        doc.text(price.toFixed(2).replace('.', ',') + ' €', 90, yPos);
        doc.text(subtotal.toFixed(2).replace('.', ',') + ' €', 130, yPos);
        yPos += 7;
    });
    
    yPos += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Montant total EHPAD', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(ehpadTotal.toFixed(2).replace('.', ',') + ' €', 130, yPos);
    
    // Footer EHPAD
    yPos += 20;
    doc.setFont('helvetica', 'italic');
    doc.text('Arrêt le présent mémoire à la somme de : ' + ehpadTotal.toFixed(2).replace('.', ',') + ' €', 14, yPos);
    
    yPos += 15;
    doc.setFont('helvetica', 'normal');
    doc.text('La Guerche de Bretagne, le ' + today.getDate() + ' ' + monthNamesFr[today.getMonth()] + ' ' + today.getFullYear(), 14, yPos);
    
    yPos += 15;
    doc.setFont('helvetica', 'bold');
    doc.text('Docteur DORE', 14, yPos);
    yPos += 10;
    doc.line(14, yPos, 80, yPos);
    
    if (settings.signature) {
        try {
            doc.addImage(settings.signature, 'JPEG', 14, yPos + 8, 40, 20);
        } catch (e) {
            console.warn('Could not add signature:', e);
        }
    }
    
    doc.setFontSize(8);
    doc.text('Signature', 35, yPos + 35);
    
    // ===== PAGE 3: DETAIL DES PASSAGES =====
    doc.addPage();
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('DÉTAIL DES PASSAGES', 105, 15, { align: 'center' });
    doc.text(monthName + ' ' + year, 105, 22, { align: 'center' });
    
    // Sort entries by date
    const sortedEntries = [...monthEntries].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    yPos = 35;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Date', 15, yPos);
    doc.text('Patient', 45, yPos);
    doc.text('Lieu', 100, yPos);
    doc.text('Cotation', 140, yPos);
    doc.text('Montant', 175, yPos);
    yPos += 3;
    doc.line(15, yPos, 190, yPos);
    yPos += 5;
    
    doc.setFont('helvetica', 'normal');
    
    sortedEntries.forEach(entry => {
        if (yPos > 270) {
            doc.addPage();
            yPos = 20;
        }
        
        const dateFormatted = entry.date.split('-').reverse().join('/');
        const patientName = entry.patientName.length > 20 ? entry.patientName.substring(0, 18) + '...' : entry.patientName;
        const location = entry.location.length > 15 ? entry.location.substring(0, 13) + '...' : entry.location;
        
        doc.text(dateFormatted, 15, yPos);
        doc.text(patientName, 45, yPos);
        doc.text(location, 100, yPos);
        doc.text(entry.cotation, 140, yPos);
        doc.text(entry.amount.toFixed(2).replace('.', ',') + ' €', 175, yPos);
        yPos += 6;
    });
    
    // Total
    yPos += 3;
    doc.line(15, yPos, 190, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL:', 140, yPos);
    doc.text(monthEntries.reduce((s, e) => s + e.amount, 0).toFixed(2).replace('.', ',') + ' €', 175, yPos);
    
    // Summary by location
    yPos += 15;
    doc.setFont('helvetica', 'bold');
    doc.text('RÉCAPITULATIF PAR LIEU:', 15, yPos);
    yPos += 8;
    doc.setFont('helvetica', 'normal');
    
    const locSummary = {};
    monthEntries.forEach(e => {
        locSummary[e.location] = (locSummary[e.location] || 0) + e.amount;
    });
    
    Object.entries(locSummary).forEach(([loc, amount]) => {
        doc.text(loc + ': ' + amount.toFixed(2).replace('.', ',') + ' €', 20, yPos);
        yPos += 5;
    });
    
    // Summary by cotation
    yPos += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('RÉCAPITULATIF PAR COTATION:', 15, yPos);
    yPos += 8;
    doc.setFont('helvetica', 'normal');
    
    const cotSummary = {};
    monthEntries.forEach(e => {
        cotSummary[e.cotation] = (cotSummary[e.cotation] || 0) + e.amount;
    });
    
    Object.entries(cotSummary).sort((a, b) => b[1] - a[1]).forEach(([cot, amount]) => {
        doc.text(cot + ': ' + amount.toFixed(2).replace('.', ',') + ' €', 20, yPos);
        yPos += 5;
    });
    
    const grandTotal = monthEntries.reduce((sum, e) => sum + e.amount, 0);
        const pdfBase64 = doc.output('datauristring');
        
        saveHistory(monthKey, `${monthName} ${year}`, grandTotal, monthEntries.length, pdfBase64);
    } catch (err) {
        console.error('Erreur PDF:', err);
        alert('Erreur lors de la génération du PDF: ' + err.message);
    }
}

async function saveHistory(monthKey, monthName, totalAmount, totalVisits, pdfBase64) {
    const historyItem = {
        month_key: monthKey,
        month_name: monthName,
        total_amount: totalAmount,
        total_visits: totalVisits,
        pdf_data: pdfBase64,
        generated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabaseClient
        .from('comptabilite')
        .insert([historyItem])
        .select();
    
    if (error) {
        alert('Erreur: ' + error.message);
        return;
    }
    
    if (data && data[0]) {
        history.unshift({
            id: data[0].id,
            monthKey: data[0].month_key,
            monthName: data[0].month_name,
            totalAmount: data[0].total_amount,
            totalVisits: data[0].total_visits,
            pdfData: data[0].pdf_data,
            generatedAt: data[0].generated_at
        });
    }
    
    renderHistory();
    alert('Feuille générée avec succès!');
}

function renderHistory() {
    const historyList = document.getElementById('historyList');
    const noHistory = document.getElementById('noHistory');
    
    if (history.length === 0) {
        historyList.innerHTML = '';
        noHistory.style.display = 'block';
        return;
    }
    
    noHistory.style.display = 'none';
    
    historyList.innerHTML = history.map((item, index) => `
        <div class="history-item">
            <div class="history-info">
                <span class="history-month">${item.monthName}</span>
                <span class="history-stats">${item.totalVisits} passages - Total: ${item.totalAmount.toFixed(2)}€</span>
            </div>
            <div class="history-actions">
                ${item.pdfData ? `<button class="history-btn view-btn" onclick="viewHistoryPdfByIndex(${index})">Voir PDF</button>` : ''}
                <button class="history-btn delete-history-btn" onclick="deleteHistory(${item.id})">Supprimer</button>
            </div>
        </div>
    `).join('');
}

function viewHistoryPdfByIndex(index) {
    const item = history[index];
    if (item && item.pdfData) {
        window.open(item.pdfData, '_blank');
    }
}

function viewHistoryPdf(pdfData) {
    if (pdfData) {
        window.open(pdfData, '_blank');
    }
}

async function deleteHistory(id) {
    if (!confirm('Supprimer cette feuille ?')) return;
    
    const { error } = await supabaseClient
        .from('comptabilite')
        .delete()
        .eq('id', id);
    
    if (error) {
        alert('Erreur: ' + error.message);
        return;
    }
    
    history = history.filter(h => h.id !== id);
    renderHistory();
}

// ========== VL TRACKING FUNCTIONS ==========
async function loadVLHistory() {
    if (!currentUser) return;
    try {
        const { data, error } = await supabaseClient
            .from('passages')
            .select('*, patients(name)')
            .eq('user_id', currentUser.id)
            .in('cotation', ['VL', 'VL+MD', 'VSP', 'IMT'])
            .order('date', { ascending: false });
        
        if (!error && data) {
            vlHistory = data.map(p => ({
                id: p.id,
                patientId: p.patient_id,
                patientName: p.patients?.name || 'Inconnu',
                vlDate: p.date,
                cotation: p.cotation
            }));
        }
        console.log('[VL] Historique chargé:', vlHistory.length);
    } catch (e) {
        console.error('[VL] Erreur chargement:', e);
    }
}

function renderVLList() {
    const container = document.getElementById('vlList');
    if (!container) {
        console.log('[VL] Container vlList non trouvé');
        return;
    }
    
    // Grouper les VL par patient
    const patientVLs = {};
    vlHistory.forEach(v => {
        if (!patientVLs[v.patientId]) {
            patientVLs[v.patientId] = {
                name: v.patientName,
                vlDates: []
            };
        }
        patientVLs[v.patientId].vlDates.push({
            date: v.vlDate,
            cotation: v.cotation
        });
    });
    
    if (Object.keys(patientVLs).length === 0) {
        container.innerHTML = '<div class="no-entries">Aucun patient avec VL enregistré</div>';
        return;
    }
    
    container.innerHTML = Object.entries(patientVLs).map(([patientId, data]) => {
        // Trier les dates par ordre décroissant
        data.vlDates.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        const lastVL = data.vlDates[0];
        const lastVLDate = new Date(lastVL.date);
        const nextPossible = new Date(lastVLDate);
        nextPossible.setDate(nextPossible.getDate() + 90); // 90 jours après
        
        const now = new Date();
        const canCote = now >= nextPossible;
        const daysUntil = Math.ceil((nextPossible - now) / (1000 * 60 * 60 * 24));
        
        const lastVLFormatted = lastVLDate.toLocaleDateString('fr-FR');
        const nextPossibleFormatted = nextPossible.toLocaleDateString('fr-FR');
        
        // Compter les VL cette année
        const currentYear = new Date().getFullYear();
        const vlThisYear = data.vlDates.filter(v => 
            new Date(v.date).getFullYear() === currentYear && 
            (v.cotation === 'VL' || v.cotation === 'VL+MD')
        ).length;
        
        return `
            <div class="vl-patient-card">
                <div class="vl-patient-name">${data.name}</div>
                <div class="vl-details">
                    <div class="vl-info">
                        <span class="vl-label">Dernière VL:</span>
                        <span class="vl-value">${lastVLFormatted} (${lastVL.cotation})</span>
                    </div>
                    <div class="vl-info">
                        <span class="vl-label">Prochaine possible:</span>
                        <span class="vl-value ${canCote ? 'can-cote' : ''}">${nextPossibleFormatted}</span>
                    </div>
                    <div class="vl-info">
                        <span class="vl-label">VL cette année:</span>
                        <span class="vl-value">${vlThisYear}/4</span>
                    </div>
                    ${!canCote ? `<div class="vl-wait">Dans ${daysUntil} jours</div>` : '<div class="vl-ready">✓ Cotation possible</div>'}
                </div>
                <div class="vl-history">
                    ${data.vlDates.slice(0, 5).map(v => `
                        <span class="vl-badge">${v.cotation} - ${new Date(v.date).toLocaleDateString('fr-FR', {month:'2-digit', year:'2-digit'})}</span>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function getNextQuarterStart(currentDate) {
    const month = currentDate.getMonth();
    const year = currentDate.getFullYear();
    
    // Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec
    if (month >= 0 && month <= 2) return new Date(year, 3, 1); // Q2
    if (month >= 3 && month <= 5) return new Date(year, 6, 1); // Q3
    if (month >= 6 && month <= 8) return new Date(year, 9, 1); // Q4
    if (month >= 9 && month <= 11) return new Date(year + 1, 0, 1); // Q1 next year
    return new Date(year, 3, 1);
}

function renderRecentVLForAdd() {
    const container = document.getElementById('recentVLList');
    if (!container) return;

    const vlOnly = vlHistory.filter(v => v.cotation === 'VL' || v.cotation === 'VL+MD');

    if (vlOnly.length === 0) {
        container.innerHTML = '<p style="color: var(--color-text-secondary); font-size: 0.8125rem;">Aucune VL récente</p>';
        return;
    }

    // Grouper par patient pour calculer les dates de prochain trimestre
    const patientLastVL = {};
    vlOnly.forEach(v => {
        if (!patientLastVL[v.patientId] || new Date(v.vlDate) > new Date(patientLastVL[v.patientId].vlDate)) {
            patientLastVL[v.patientId] = v;
        }
    });

    const now = new Date();
    const currentYear = now.getFullYear();

    const vlList = Object.values(patientLastVL).map(v => {
        const lastVLDate = new Date(v.vlDate);
        const nextQuarter = getNextQuarterStart(lastVLDate);
        const canCote = now >= nextQuarter;
        const daysUntil = Math.ceil((nextQuarter - now) / (1000 * 60 * 60 * 24));
        
        // Compter les VL cette année
        const vlThisYear = vlOnly.filter(p => 
            p.patientId === v.patientId && 
            new Date(p.vlDate).getFullYear() === currentYear
        ).length;

        return {
            ...v,
            lastVLDate,
            nextQuarter,
            canCote,
            daysUntil,
            vlThisYear
        };
    }).sort((a, b) => {
        // Trier: d'abord ceux qui peuvent coter, puis par date
        if (a.canCote && !b.canCote) return -1;
        if (!a.canCote && b.canCote) return 1;
        return a.nextQuarter - b.nextQuarter;
    });

    container.innerHTML = vlList.slice(0, 8).map(v => {
        const vlDate = v.lastVLDate;
        const nextDate = v.nextQuarter;
        const nextQuarterStr = `Q${Math.ceil((nextDate.getMonth() + 1) / 3)} ${nextDate.getFullYear()}`;
        
        return `
            <div class="recent-vl-item">
                <div class="vl-patient-info">
                    <div class="patient">${v.patientName}</div>
                    <div class="vl-date">Dernière: ${vlDate.toLocaleDateString('fr-FR')}</div>
                </div>
                <div class="vl-status-info">
                    <div class="vl-next-date ${v.canCote ? 'can-cote' : ''}">
                        ${v.canCote ? '✓ Possible' : nextQuarterStr}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function checkVLAlert(patientId) {
    const patientVLs = vlHistory.filter(v => v.patientId === patientId);
    const vlOnly = patientVLs.filter(v => v.cotation === 'VL' || v.cotation === 'VL+MD');
    
    if (vlOnly.length === 0) {
        const vlAlert = document.getElementById('vlAlert');
        if (vlAlert) vlAlert.style.display = 'none';
        return;
    }
    
    // Trier par date décroissante
    vlOnly.sort((a, b) => new Date(b.vlDate) - new Date(a.vlDate));
    
    const lastVL = vlOnly[0];
    const lastVLDate = new Date(lastVL.vlDate);
    const nextPossible = new Date(lastVLDate);
    nextPossible.setDate(nextPossible.getDate() + 90);
    
    const now = new Date();
    const canCote = now >= nextPossible;
    
    const vlAlert = document.getElementById('vlAlert');
    const vlAlertText = document.getElementById('vlAlertText');
    
    if (!canCote && vlAlert && vlAlertText) {
        const daysUntil = Math.ceil((nextPossible - now) / (1000 * 60 * 60 * 24));
        vlAlert.style.display = 'flex';
        vlAlert.style.background = '#FEF3C7';
        vlAlert.style.borderColor = '#F59E0B';
        vlAlert.style.color = '#92400E';
        vlAlertText.textContent = `VL possible le ${nextPossible.toLocaleDateString('fr-FR')} (dans ${daysUntil} jours)`;
    } else if (vlAlert) {
        vlAlert.style.display = 'none';
    }
}

// ========== END VL TRACKING ==========

function startApp() {
    console.log('[APP] Démarrage...');
    
    // Setup les listeners d'authentification
    setupAuthListeners();
    
    // Initialiser Supabase et l'auth
    initAuth();
}

// Démarrer l'app quand le DOM est prêt
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}

// ========== VL POPUP ==========
function showVLPopup(patientId, patientName) {
    const patientVLs = vlHistory.filter(v => v.patientId === patientId && (v.cotation === 'VL' || v.cotation === 'VL+MD'));
    patientVLs.sort((a, b) => new Date(b.vlDate) - new Date(a.vlDate));
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const vlThisYear = patientVLs.filter(v => new Date(v.vlDate).getFullYear() === currentYear).length;
    
    // Calculer les prochains trimestres
    const quarters = [];
    for (let y = currentYear; y <= currentYear + 1; y++) {
        for (let q = 1; q <= 4; q++) {
            const qStart = new Date(y, (q - 1) * 3, 1);
            if (qStart > now) quarters.push({ quarter: `Q${q} ${y}`, date: qStart });
        }
    }
    
    // Trouver le prochain trimestre disponible
    let nextAvailable = null;
    for (const q of quarters) {
        const vlInQuarter = patientVLs.filter(v => {
            const vDate = new Date(v.vlDate);
            return vDate.getFullYear() === q.date.getFullYear() && 
                   Math.ceil((vDate.getMonth() + 1) / 3) === Math.ceil((q.date.getMonth() + 1) / 3);
        });
        if (vlInQuarter.length === 0 && !nextAvailable) {
            nextAvailable = q;
            break;
        }
    }
    
    const historyHtml = patientVLs.slice(0, 5).map(v => `
        <div class="vl-popup-history-item">
            <span class="vl-popup-cotation">${v.cotation}</span>
            <span class="vl-popup-date">${new Date(v.vlDate).toLocaleDateString('fr-FR')}</span>
        </div>
    `).join('');
    
    const popup = document.createElement('div');
    popup.className = 'vl-popup-overlay';
    popup.innerHTML = `
        <div class="vl-popup">
            <div class="vl-popup-header">
                <h3>${patientName}</h3>
                <button class="vl-popup-close" onclick="this.closest('.vl-popup-overlay').remove()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="vl-popup-content">
                <div class="vl-popup-summary">
                    <div class="vl-popup-stat">
                        <span class="vl-popup-stat-value">${vlThisYear}</span>
                        <span class="vl-popup-stat-label">VL cette année</span>
                    </div>
                    <div class="vl-popup-stat">
                        <span class="vl-popup-stat-value">${patientVLs.length}</span>
                        <span class="vl-popup-stat-label">Total VL</span>
                    </div>
                </div>
                ${nextAvailable ? `
                    <div class="vl-popup-next">
                        <span class="vl-popup-label">Prochain trimestre disponible:</span>
                        <span class="vl-popup-next-date">${nextAvailable.quarter}</span>
                    </div>
                ` : ''}
                <div class="vl-popup-rules">
                    <h4>Règles de cotation VL / VSP:</h4>
                    <ul>
                        <li><strong>VL</strong> (Visite Longue) : 60€ - <strong>VL+MD</strong> : 70€</li>
                        <li><strong>Bénéficiaires</strong> : Patients ALD 80+, patho neurodégénératives (Alzheimer, Parkinson, SEP), nouveaux patients ALD/>80 ans</li>
                        <li><strong>Fréquence</strong> : 4 fois/an (1x par trimestre civil) pour patients ALD 80+ ou neurodégénératifs</li>
                        <li><strong>Première contact</strong> : Code IMT (une seule fois) - nouveau médecin traitant patient ALD ou >80 ans</li>
                        <li><strong>Soins palliatifs</strong> : Utiliser code VSP (pas de limite)</li>
                    </ul>
                </div>
                <div class="vl-popup-history">
                    <h4>Historique:</h4>
                    ${historyHtml || '<p>Aucune VL enregistrée</p>'}
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(popup);
    
    popup.addEventListener('click', (e) => {
        if (e.target === popup) popup.remove();
    });
}

window.showVLPopup = showVLPopup;

// ========== END VL POPUP ==========