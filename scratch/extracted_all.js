
/* SCRIPT BLOCK 1 */

/**
 * CONFIGURAÇÃO DO FIREBASE (COMPAT v9)
 */
const firebaseConfig = {
  apiKey: "AIzaSyAyfJtCTZdIt5IUG5BZNmDd9UiaKBIyKZY",
  authDomain: "arenadeconhecimento.firebaseapp.com",
  databaseURL: "https://arenadeconhecimento-default-rtdb.firebaseio.com",
  projectId: "arenadeconhecimento",
  storageBucket: "arenadeconhecimento.firebasestorage.app",
  messagingSenderId: "889132093510",
  appId: "1:889132093510:web:d9d7ddd92fec82d247ba47"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.database();

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .catch((error) => console.error('Erro ao configurar persistência:', error));

/**
 * ESTADO GLOBAL DA APLICAÇÃO
 */
let currentUser = null;
let currentProfile = { role: 'user', name: '', email: '' };
let isAuthSignUpMode = false;

let questionsBank = [];
let rawQuestionsObject = {};
let usersMap = {};
let statsMap = {};
let notificationsList = [];
let challengesList = [];
let currentActiveChallenge = null;
let certificatesMap = {};
let answerLogsList = [];
let drilldownState = { mode: 'errors', activeTab: 'errors', filterSeries: 'all', searchTerm: '', filterUser: null, filterUserName: '' };
let questionReportsList = [];
let currentReportingQuestion = null;
let currentReportButton = null;
let reportsCurrentFilter = 'all';

let challengeStagedQuestions = [];
let activeQuestion = null;
let waitingAnswer = false;
let isChallengeRunning = false;
let challengePool = [];
let challengeIndex = 0;
let challengeHits = 0;
let activeSeriesFilter = 'all';
let studentStats = { score: 0, hits: 0, total: 0 };

/**
 * SISTEMA DE CACHE
 */
class CacheManager {
    constructor() {
        this.cache = new Map();
        this.defaultTTL = 5 * 60 * 1000;
    }
    async get(key, fetcher, ttl = this.defaultTTL) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < ttl) return cached.data;
        const data = await fetcher();
        this.cache.set(key, { data, timestamp: Date.now() });
        return data;
    }
    invalidate(key) { this.cache.delete(key); }
}
const cacheManager = new CacheManager();

/**
 * SISTEMA DE RETRY
 */
async function retryOperation(operation, maxAttempts = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === maxAttempts) throw error;
            await new Promise(resolve => setTimeout(resolve, delay * attempt));
        }
    }
}

/**
 * SISTEMA DE LOADING
 */
const loadingManager = {
    overlay: null,
    init() { this.overlay = document.getElementById('loadingOverlay'); },
    show() { if (this.overlay) this.overlay.classList.add('active'); },
    hide() { if (this.overlay) this.overlay.classList.remove('active'); },
    async withLoading(operation) {
        this.show();
        try { return await operation(); } finally { this.hide(); }
    }
};

/**
 * SISTEMA DE VALIDAÇÃO
 */
const validators = {
    email: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    password: (password) => password.length >= 8 && /\d/.test(password) && /[a-zA-Z]/.test(password),
    name: (name) => name && name.trim().length >= 3
};

/**
 * SISTEMA DE TOASTS
 */
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'alert-triangle';
    if (type === 'warning') icon = 'alert-circle';
    
    toast.innerHTML = `
        <i data-lucide="${icon}" size="18"></i> 
        <span>${message}</span>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:inherit;cursor:pointer;padding:0;margin-left:auto;">
            <i data-lucide="x" size="14"></i>
        </button>
    `;
    
    container.appendChild(toast);
    lucide.createIcons();
    
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            toast.style.transition = 'all 0.3s';
            setTimeout(() => toast.remove(), 300);
        }
    }, duration);
}

/**
 * SISTEMA DE DIÁLOGOS
 */
let onDialogConfirmCallback = null;

function showConfirmDialog(title, message, onConfirm, confirmText = 'Confirmar', cancelText = 'Cancelar') {
    document.getElementById('dialogTitle').textContent = title;
    document.getElementById('dialogMessage').textContent = message;
    document.getElementById('dialogConfirmBtn').textContent = confirmText;
    document.getElementById('dialogCancelBtn').textContent = cancelText;
    
    onDialogConfirmCallback = onConfirm;
    document.getElementById('customDialogOverlay').classList.add('active');
    setTimeout(() => document.getElementById('dialogConfirmBtn').focus(), 100);
}

function closeDialog(confirmed = false) {
    document.getElementById('customDialogOverlay').classList.remove('active');
    if (confirmed && typeof onDialogConfirmCallback === 'function') onDialogConfirmCallback();
    onDialogConfirmCallback = null;
}

function handleConfirmDialogOverlayClick(event) {
    if (event.target.id === 'customDialogOverlay') {
        closeDialog(false);
    }
}
document.getElementById('dialogConfirmBtn').addEventListener('click', () => closeDialog(true));

/**
 * SKELETON LOADING
 */
function showSkeleton(containerId, type = 'card') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const skeletons = {
        card: `
            <div class="skeleton-card">
                <div class="skeleton skeleton-title"></div>
                <div class="skeleton skeleton-text"></div>
                <div class="skeleton skeleton-text"></div>
            </div>
        `,
        list: `${Array(5).fill(`
            <div style="display:flex;align-items:center;gap:1rem;padding:1rem;">
                <div class="skeleton skeleton-avatar"></div>
                <div style="flex:1;">
                    <div class="skeleton skeleton-text"></div>
                    <div class="skeleton skeleton-text" style="width:60%;"></div>
                </div>
            </div>
        `).join('')}`,
        table: `${Array(5).fill(`
            <tr>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
            </tr>
        `).join('')}`
    };
    container.innerHTML = skeletons[type] || skeletons.card;
}

/**
 * NAVEGAÇÃO
 */
function showScreen(screenId) {
    document.querySelectorAll('.app-screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
    closeAllDrawers();
    lucide.createIcons();
}

function switchToAdminScreen() {
    if (currentProfile.role !== 'admin') {
        showToast('Acesso exclusivo para administradores.', 'error');
        return;
    }
    showScreen('screenAdmin');
    switchAdminSection('secDashboard');
}

function switchToStudentScreen() { showScreen('screenApp'); }

function toggleChatSidebar() {
    document.getElementById('chatSidebar').classList.toggle('active');
    document.getElementById('drawerOverlay').classList.toggle('active');
}

function toggleAdminSidebar() {
    document.getElementById('adminSidebar').classList.toggle('active');
    document.getElementById('drawerOverlay').classList.toggle('active');
}

function closeAllDrawers() {
    document.getElementById('chatSidebar')?.classList.remove('active');
    document.getElementById('adminSidebar')?.classList.remove('active');
    document.getElementById('drawerOverlay')?.classList.remove('active');
}

function closeAllModals() {
    closeDialog(false);
    closeNotifModal();
    closeRankingModal();
    closeMoreActionsModal();
    closeAllDrawers();
}

/**
 * SISTEMA DE FEEDBACK HÁPTICO (VIBRATION API)
 */
function triggerHaptic(type = 'light') {
    if (!('vibrate' in navigator)) return;
    try {
        if (type === 'success') {
            navigator.vibrate([18, 30, 18]);
        } else if (type === 'error') {
            navigator.vibrate([35, 45, 35]);
        } else if (type === 'medium') {
            navigator.vibrate(22);
        } else {
            navigator.vibrate(12);
        }
    } catch (e) {
        // Ignora silenciosamente se o dispositivo/navegador restringir
    }
}

/**
 * MODAL / BOTTOM SHEET: MAIS AÇÕES DO CHAT
 */
function openMoreActionsModal() {
    triggerHaptic('light');
    const overlay = document.getElementById('moreActionsModalOverlay');
    if (overlay) {
        overlay.classList.add('active');
        lucide.createIcons();
    }
}

function closeMoreActionsModal() {
    const overlay = document.getElementById('moreActionsModalOverlay');
    if (overlay) overlay.classList.remove('active');
}

function handleMoreActionsOverlayClick(event) {
    if (event.target.id === 'moreActionsModalOverlay') {
        closeMoreActionsModal();
    }
}

function selectMoreAction(action) {
    closeMoreActionsModal();
    triggerHaptic('light');
    
    if (action === 'ranking') {
        showLeaderboardModal();
    } else if (action === 'badges') {
        openBadgesModal('badges');
    } else if (action === 'streak') {
        openBadgesModal('streak');
    } else if (action === 'clear_chat') {
        clearChatHistory();
    } else if (action === 'theme') {
        toggleThemeMode();
    } else {
        handleStudentCommand(action);
    }
}

/**
 * LIMPEZA E GESTÃO DO FEED DE CHAT
 */
function clearChatHistory() {
    triggerHaptic('light');
    showConfirmDialog(
        'Limpar Mensagens da Tela',
        'Deseja limpar as mensagens exibidas na tela do chat? Suas estatísticas, notas e certificados permanecerão salvos na sua conta.',
        () => {
            const feed = document.getElementById('chatFeed');
            if (feed) {
                feed.innerHTML = '';
                waitingAnswer = false;
                activeQuestion = null;
                isChallengeRunning = false;
                initStudentChatWelcome();
                showToast('Tela do chat reiniciada!', 'info');
                triggerHaptic('light');
            }
        },
        'Limpar Tela',
        'Cancelar'
    );
}

/**
 * AUTENTICAÇÃO
 */
function toggleAuthMode() {
    isAuthSignUpMode = !isAuthSignUpMode;
    const nameGroup = document.getElementById('groupFullName');
    const submitText = document.getElementById('loginSubmitText');
    const toggleText = document.getElementById('authToggleText');
    const subtitle = document.getElementById('authSubtitle');
    const feedback = document.getElementById('loginFeedback');
    const forgotBtn = document.getElementById('linkForgotPassword');
    
    feedback.style.display = 'none';
    feedback.style.color = 'var(--danger)';
    
    if (isAuthSignUpMode) {
        nameGroup.style.display = 'flex';
        if (forgotBtn) forgotBtn.style.display = 'none';
        submitText.textContent = 'Criar Minha Conta';
        toggleText.textContent = 'Já possui cadastro? Entrar agora';
        subtitle.textContent = 'Crie sua conta';
    } else {
        nameGroup.style.display = 'none';
        if (forgotBtn) forgotBtn.style.display = 'inline-block';
        submitText.textContent = 'Acessar Plataforma';
        toggleText.textContent = 'Não possui uma conta? Criar nova';
        subtitle.textContent = 'Plataforma de Treinamentos';
    }
}

function handleForgotPassword() {
    const emailInput = document.getElementById('loginEmail');
    const email = emailInput ? emailInput.value.trim() : '';
    const feedback = document.getElementById('loginFeedback');
    
    feedback.style.display = 'none';
    feedback.textContent = '';
    
    if (!email) {
        feedback.style.color = 'var(--panasonic-warning, #f59e0b)';
        feedback.textContent = 'Informe seu e-mail corporativo no campo acima para receber o link de recuperação.';
        feedback.style.display = 'block';
        if (emailInput) emailInput.focus();
        showToast('Digite seu e-mail corporativo no campo acima.', 'warning');
        return;
    }
    
    if (!validators.email(email)) {
        feedback.style.color = 'var(--danger)';
        feedback.textContent = 'Formato de e-mail inválido. Digite um e-mail corporativo válido.';
        feedback.style.display = 'block';
        if (emailInput) emailInput.focus();
        return;
    }
    
    showConfirmDialog(
        'Recuperação de Senha',
        `Deseja enviar as instruções de redefinição de senha para o e-mail:\n${email}?`,
        async () => {
            loadingManager.show();
            try {
                await auth.sendPasswordResetEmail(email);
                showToast('E-mail de recuperação enviado com sucesso!', 'success');
                feedback.style.color = 'var(--panasonic-success, #12B76A)';
                feedback.innerHTML = `<strong>E-mail enviado!</strong> Verifique a caixa de entrada de <u>${email}</u> (inclusive a pasta de spam) para redefinir sua senha.`;
                feedback.style.display = 'block';
            } catch (err) {
                let msg = 'Erro ao enviar e-mail de recuperação.';
                switch (err.code) {
                    case 'auth/user-not-found':
                        msg = 'Nenhum usuário cadastrado com este e-mail.';
                        break;
                    case 'auth/invalid-email':
                        msg = 'E-mail inválido.';
                        break;
                    case 'auth/too-many-requests':
                        msg = 'Muitas tentativas recentes. Aguarde alguns minutos antes de tentar novamente.';
                        break;
                    default:
                        if (err.message) msg = err.message;
                }
                showToast(msg, 'error');
                feedback.style.color = 'var(--danger)';
                feedback.textContent = msg;
                feedback.style.display = 'block';
            } finally {
                loadingManager.hide();
            }
        },
        'Enviar Link',
        'Cancelar'
    );
}

async function handleAuthSubmit() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const fullName = document.getElementById('regFullName').value.trim();
    const feedback = document.getElementById('loginFeedback');
    
    feedback.style.display = 'none';
    feedback.textContent = '';
    
    if (!email || !password) {
        feedback.textContent = 'Preencha e-mail e senha para prosseguir.';
        feedback.style.display = 'block';
        return;
    }
    if (!validators.email(email)) {
        feedback.textContent = 'Formato de e-mail inválido.';
        feedback.style.display = 'block';
        return;
    }
    if (!validators.password(password)) {
        feedback.textContent = 'A senha deve ter no mínimo 8 caracteres, incluindo números e letras.';
        feedback.style.display = 'block';
        return;
    }
    if (isAuthSignUpMode && !validators.name(fullName)) {
        feedback.textContent = 'Por favor, informe seu nome completo (mínimo 3 caracteres).';
        feedback.style.display = 'block';
        return;
    }
    
    loadingManager.show();
    
    try {
        await retryOperation(async () => {
            if (isAuthSignUpMode) {
                const userCred = await auth.createUserWithEmailAndPassword(email, password);
                await userCred.user.updateProfile({ displayName: fullName });
                
                const initialRole = email.toLowerCase().includes('admin') ? 'admin' : 'user';
                const userData = {
                    name: fullName,
                    email: email,
                    role: initialRole,
                    createdAt: Date.now(),
                    lastLogin: Date.now()
                };
                
                await db.ref('users/' + userCred.user.uid).set(userData);
                showToast(`Conta criada com sucesso! ${fullName}.`, 'success');
            } else {
                await auth.signInWithEmailAndPassword(email, password);
                showToast('Sessão iniciada com sucesso!', 'success');
            }
        });
    } catch (err) {
        let errorMessage = 'Erro na operação de autenticação.';
        switch (err.code) {
            case 'auth/user-not-found': errorMessage = 'Usuário não encontrado. Verifique seu e-mail.'; break;
            case 'auth/wrong-password': errorMessage = 'Senha incorreta. Tente novamente.'; break;
            case 'auth/email-already-in-use': errorMessage = 'Este e-mail já está cadastrado. Faça login.'; break;
            case 'auth/invalid-email': errorMessage = 'E-mail inválido.'; break;
            case 'auth/weak-password': errorMessage = 'Senha muito fraca. Use no mínimo 8 caracteres.'; break;
        }
        feedback.textContent = errorMessage;
        feedback.style.display = 'block';
    } finally {
        loadingManager.hide();
    }
}

async function logoutAccount() {
    showConfirmDialog(
        'Encerrar Sessão', 
        'Deseja realmente sair da sua conta?',
        async () => {
            loadingManager.show();
            try {
                await auth.signOut();
                showToast('Você saiu do sistema.', 'info');
            } catch (error) {
                showToast('Erro ao sair. Tente novamente.', 'error');
            } finally {
                loadingManager.hide();
            }
        }
    );
}

/**
 * SINCRONIZAÇÃO EM TEMPO REAL
 */
function setupRealtimeData() {
    showSkeleton('adminQuestionsList', 'list');
    showSkeleton('adminUsersTableBody', 'table');
    
    db.ref('questions').on('value', (snap) => {
        rawQuestionsObject = snap.val() || {};
        questionsBank = Object.entries(rawQuestionsObject).map(([id, q]) => ({ id, ...q }));
        cacheManager.invalidate('questions');
        renderAdminQuestionsList();
        updateKPICards();
    });

    db.ref('users').on('value', (snap) => {
        usersMap = snap.val() || {};
        cacheManager.invalidate('users');
        renderAdminUsersTable();
        renderAdminReportsTable();
        renderLeaderboardTables();
        updateKPICards();
    });

    db.ref('stats').on('value', (snap) => {
        statsMap = snap.val() || {};
        if (currentUser && statsMap[currentUser.uid]) {
            studentStats = ensureStudentStatsDefaults(statsMap[currentUser.uid]);
            updateStudentStatsUI();
            checkAndAwardBadges();
        }
        renderAdminReportsTable();
        renderLeaderboardTables();
        updateKPICards();
    });

    db.ref('challenges').on('value', (snap) => {
        const val = snap.val() || {};
        challengesList = Object.entries(val).map(([id, ch]) => ({ id, ...ch }));
        currentActiveChallenge = challengesList.find(c => c.active === true) || null;
        updateActiveChallengeSidebarBanner();
        renderAdminChallengesList();
        renderAdminReportsTable();
        updateKPICards();
    });

    db.ref('certificates').on('value', (snap) => {
        certificatesMap = snap.val() || {};
        if (currentUser && certificatesMap[currentUser.uid] && Object.keys(certificatesMap[currentUser.uid]).length > 0) {
            if (studentStats) studentStats.hasCertificate = true;
            checkAndAwardBadges();
        }
        renderAdminReportsTable();
        updateKPICards();
    });

    db.ref('notifications').on('value', (snap) => {
        const val = snap.val() || {};
        notificationsList = Object.entries(val).map(([id, n]) => ({ id, ...n }));
        renderBroadcastHistory();
        updateNotificationBadges();
        updateKPICards();
    });

    db.ref('answer_logs').limitToLast(1000).on('value', (snap) => {
        const val = snap.val() || {};
        answerLogsList = Object.entries(val).map(([id, log]) => ({ id, ...log }));
        const overlay = document.getElementById('analyticsDrilldownOverlay');
        if (overlay && overlay.classList.contains('active')) {
            renderDrilldownContent();
        }
    });

    db.ref('question_reports').on('value', (snap) => {
        const val = snap.val() || {};
        questionReportsList = Object.entries(val).map(([id, r]) => ({ id, ...r }));
        questionReportsList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        updateQuestionReportsBadge();
        const sec = document.getElementById('secQuestionReports');
        if (sec && sec.classList.contains('active')) {
            renderAdminQuestionReports();
        }
    });
}

/**
 * SISTEMA DE NOTIFICAÇÕES
 */
function updateNotificationBadges() {
    const badge = document.getElementById('studentNotifBadge');
    if (!badge || !currentUser) return;
    
    const storageKey = `panasonic_notif_read_${currentUser.uid}`;
    const lastReadTime = parseInt(localStorage.getItem(storageKey) || '0');
    const unreadList = notificationsList.filter(n => n.timestamp > lastReadTime);
    
    if (unreadList.length > 0) {
        badge.style.display = 'flex';
        badge.textContent = unreadList.length > 9 ? '9+' : unreadList.length;
    } else {
        badge.style.display = 'none';
    }
}

function showStudentNotifications() {
    const content = document.getElementById('notifModalContent');
    content.innerHTML = '<div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text"></div>';
    
    setTimeout(() => {
        if (notificationsList.length === 0) {
            content.innerHTML = `
                <div class="empty-state-box" style="padding:2rem 1rem;">
                    <div class="empty-state-icon"><i data-lucide="bell" size="26"></i></div>
                    <h4 class="empty-state-title">Tudo em Dia!</h4>
                    <p class="empty-state-desc">Você não possui nenhum comunicado corporativo ou aviso pendente no momento.</p>
                </div>
            `;
            lucide.createIcons();
            return;
        } else {
            const sorted = [...notificationsList].sort((a, b) => b.timestamp - a.timestamp);
           
          content.innerHTML = sorted.map(n => `
    <div style="background:var(--panasonic-gray-50); border:1px solid var(--border); border-left:4px solid var(--accent); border-radius:0.75rem; padding:1.25rem;">
        <div style="display:flex;justify-content:space-between; align-items:flex-start; margin-bottom:0.6rem; gap:1rem;">
            <strong style="font-size:1rem;color:var(--text-main); line-height:1.3;">${n.title}</strong>
            <span style="font-size:0.75rem;color:var(--text-muted); white-space:nowrap;">
                ${new Date(n.timestamp).toLocaleDateString('pt-BR', { 
                    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
            </span>
        </div>
        ${n.imageUrl ? `
            <img src="${n.imageUrl}" alt="${n.title}" 
                 style="width:100%;border-radius:0.65rem;margin-bottom:0.85rem;display:block;border:1px solid var(--border);"
                 onerror="this.style.display='none'">
        ` : ''}
        <p style="font-size:0.92rem;color:var(--text-muted);line-height:1.6;">${n.body}</p>
    </div>
`).join('');
        }
        
        if (currentUser) {
            const storageKey = `panasonic_notif_read_${currentUser.uid}`;
            localStorage.setItem(storageKey, Date.now().toString());
            updateNotificationBadges();
        }
        lucide.createIcons();
    }, 300);
    
    document.getElementById('notifModalOverlay').classList.add('active');
    if (window.innerWidth <= 900) closeAllDrawers();
}

function closeNotifModal() {
    document.getElementById('notifModalOverlay').classList.remove('active');
}

function handleNotifOverlayClick(event) {
    if (event.target.id === 'notifModalOverlay') {
        closeNotifModal();
    }
}

/**
 * MODAL DE RANKING (completo - antes era apenas mensagem no chat)
 */
function showLeaderboardModal() {
    const content = document.getElementById('rankingModalContent');
    content.innerHTML = '<div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text"></div>';
    
    setTimeout(() => {
        const users = Object.entries(usersMap);
        
        if (users.length === 0) {
            content.innerHTML = `
                <div class="empty-state-box" style="padding:2rem 1rem;">
                    <div class="empty-state-icon"><i data-lucide="medal" size="26"></i></div>
                    <h4 class="empty-state-title">Ranking em Construção</h4>
                    <p class="empty-state-desc">Participe dos treinamentos e desafios para pontuar e figurar entre os líderes da Panasonic!</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }
        
        const ranked = users.map(([uid, u]) => {
            const s = statsMap[uid] || { hits: 0, total: 0, score: 0 };
            const acc = s.total === 0 ? 0 : Math.round((s.hits / s.total) * 100);
            return {
                uid,
                name: u.name || (u.email ? u.email.split('@')[0] : 'Sem nome'),
                email: u.email || '',
                score: s.score || 0,
                hits: s.hits || 0,
                total: s.total || 0,
                accuracy: acc
            };
        }).sort((a, b) => b.score - a.score || b.hits - a.hits);
        
        const isMe = (uid) => currentUser && currentUser.uid === uid;
        const medalEmoji = (i) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
        
        content.innerHTML = ranked.map((r, i) => {
            const topClass = i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : '';
            const highlight = isMe(r.uid) ? 'outline:2px solid var(--accent); outline-offset:-2px;' : '';
            return `
                <div class="rank-row ${topClass}" style="${highlight}">
                    <div class="rank-position">${medalEmoji(i)}</div>
                    <div class="rank-info">
                        <strong>${r.name}${isMe(r.uid) ? ' (Você)' : ''}</strong>
                        <span>${r.hits}/${r.total} acertos • ${r.accuracy}% precisão</span>
                    </div>
                    <div class="rank-score">${r.score} pts</div>
                </div>
            `;
        }).join('');
        
        lucide.createIcons();
    }, 300);
    
    document.getElementById('rankingModalOverlay').classList.add('active');
    if (window.innerWidth <= 900) closeAllDrawers();
}

function closeRankingModal() {
    document.getElementById('rankingModalOverlay').classList.remove('active');
}

function handleRankingOverlayClick(event) {
    if (event.target.id === 'rankingModalOverlay') {
        closeRankingModal();
    }
}

/**
 * UI - SIDEBAR & STATS
 */
function updateActiveChallengeSidebarBanner() {
    const banner = document.getElementById('sidebarActiveChallengeBanner');
    const title = document.getElementById('sidebarChallengeTitle');
    const meta = document.getElementById('sidebarChallengeMeta');

    if (currentActiveChallenge) {
        banner.style.display = 'flex';
        title.textContent = currentActiveChallenge.title;
        const count = Array.isArray(currentActiveChallenge.questions) 
            ? currentActiveChallenge.questions.length 
            : (currentActiveChallenge.questionCount || 0);
        meta.textContent = `Aproveitamento Mín: ${currentActiveChallenge.minScore}% | ${count} Questões | Carga: ${currentActiveChallenge.workload || '8 Horas'}`;
    } else {
        banner.style.display = 'none';
    }
}

/* =============================================================================
   6. GAMIFICAÇÃO CORPORATIVA E ENGAJAMENTO (6.1 STREAKS & 6.2 BADGES)
   ============================================================================= */

const CORPORATE_BADGES = [
    {
        id: 'tiro_certeiro',
        title: 'Tiro Certeiro',
        icon: '🎯',
        desc: 'Acertou 10 questões seguidas sem nenhum erro.',
        requirement: '10 acertos consecutivos',
        check: (stats) => (stats.consecutiveHits || 0) >= 10 || (stats.maxConsecutiveHits || 0) >= 10,
        getProgress: (stats) => `${Math.min(10, Math.max(stats.consecutiveHits || 0, stats.maxConsecutiveHits || 0))}/10 acertos`
    },
    {
        id: 'velocista',
        title: 'Velocista',
        icon: '⚡',
        desc: 'Concluiu um plano cronometrado com 100% de precisão.',
        requirement: '1 plano cronometrado perfeito (≥3 questões)',
        check: (stats) => (stats.timedPerfectCount || 0) >= 1,
        getProgress: (stats) => `${Math.min(1, stats.timedPerfectCount || 0)}/1 plano`
    },
    {
        id: 'graduado',
        title: 'Graduado Panasonic',
        icon: '📜',
        desc: 'Conquistou seu primeiro certificado oficial de treinamento.',
        requirement: '1 certificado emitido',
        check: (stats) => !!stats.hasCertificate || (typeof currentUser !== 'undefined' && currentUser && typeof certificatesMap !== 'undefined' && certificatesMap[currentUser.uid] && Object.keys(certificatesMap[currentUser.uid]).length > 0),
        getProgress: (stats) => (stats.hasCertificate || (typeof currentUser !== 'undefined' && currentUser && typeof certificatesMap !== 'undefined' && certificatesMap[currentUser.uid] && Object.keys(certificatesMap[currentUser.uid]).length > 0)) ? '1/1 certificado' : '0/1 certificado'
    },
    {
        id: 'multi_series',
        title: 'Mestre Multi-Séries',
        icon: '🌟',
        desc: 'Concluiu questões com acerto em todos os níveis.',
        requirement: 'Acertos em Básico, Intermediário e Avançado',
        check: (stats) => {
            const sh = stats.seriesHits || {};
            return (sh['básico'] || 0) > 0 && (sh['intermediário'] || 0) > 0 && (sh['avançado'] || 0) > 0;
        },
        getProgress: (stats) => {
            const sh = stats.seriesHits || {};
            const done = ((sh['básico'] || 0) > 0 ? 1 : 0) + ((sh['intermediário'] || 0) > 0 ? 1 : 0) + ((sh['avançado'] || 0) > 0 ? 1 : 0);
            return `${done}/3 níveis`
        }
    },
    {
        id: 'foco_de_aco',
        title: 'Foco de Aço',
        icon: '🔥',
        desc: 'Manteve uma ofensiva de estudos ativa por 3 ou mais dias seguidos.',
        requirement: 'Ofensiva ≥ 3 dias consecutivos',
        check: (stats) => (stats.streak || 0) >= 3,
        getProgress: (stats) => `${Math.min(3, stats.streak || 0)}/3 dias`
    },
    {
        id: 'elite_panasonic',
        title: 'Elite Panasonic',
        icon: '🏆',
        desc: 'Alcançou 500+ pontos no ranking corporativo da Panasonic.',
        requirement: 'Score corporativo ≥ 500 pontos',
        check: (stats) => (stats.score || 0) >= 500,
        getProgress: (stats) => `${Math.min(500, stats.score || 0)}/500 pts`
    }
];

function ensureStudentStatsDefaults(s) {
    if (!s || typeof s !== 'object') s = { score: 0, hits: 0, total: 0 };
    if (typeof s.score !== 'number') s.score = 0;
    if (typeof s.hits !== 'number') s.hits = 0;
    if (typeof s.total !== 'number') s.total = 0;
    if (typeof s.streak !== 'number') s.streak = 0;
    if (!s.streakHistory || typeof s.streakHistory !== 'object') s.streakHistory = {};
    if (typeof s.consecutiveHits !== 'number') s.consecutiveHits = 0;
    if (typeof s.maxConsecutiveHits !== 'number') s.maxConsecutiveHits = 0;
    if (!s.seriesHits || typeof s.seriesHits !== 'object') {
        s.seriesHits = { 'básico': 0, 'intermediário': 0, 'avançado': 0 };
    }
    if (typeof s.timedPerfectCount !== 'number') s.timedPerfectCount = 0;
    if (!s.unlockedBadges || typeof s.unlockedBadges !== 'object') s.unlockedBadges = {};
    return s;
}

function getLocalDateString(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getCalendarDaysDiff(dateStr1, dateStr2) {
    if (!dateStr1 || !dateStr2) return null;
    try {
        const [y1, m1, d1] = dateStr1.split('-').map(Number);
        const [y2, m2, d2] = dateStr2.split('-').map(Number);
        const date1 = new Date(y1, m1 - 1, d1);
        const date2 = new Date(y2, m2 - 1, d2);
        const diffMs = date2.getTime() - date1.getTime();
        return Math.round(diffMs / (1000 * 60 * 60 * 24));
    } catch (e) {
        return null;
    }
}

function processDailyStreak() {
    if (!currentUser) return;
    ensureStudentStatsDefaults(studentStats);
    const today = getLocalDateString();

    studentStats.streakHistory[today] = true;

    if (!studentStats.lastStudyDate) {
        studentStats.streak = 1;
        studentStats.lastStudyDate = today;
        showToast('🔥 Ofensiva Iniciada! 1º dia de estudos consecutivo.', 'success');
        return;
    }

    if (studentStats.lastStudyDate === today) {
        return; // Já registrado hoje
    }

    const diff = getCalendarDaysDiff(studentStats.lastStudyDate, today);
    if (diff === 1) {
        studentStats.streak = (studentStats.streak || 0) + 1;
        studentStats.lastStudyDate = today;

        // Bônus progressivo: +5 a +50 pts de bônus corporativo
        const bonus = Math.min(50, (studentStats.streak || 1) * 5);
        studentStats.score = (studentStats.score || 0) + bonus;

        showToast(`🔥 Ofensiva Mantida! ${studentStats.streak} dias seguidos (+${bonus} pts de bônus corporativo)!`, 'success');
        confetti({ particleCount: 75, spread: 60, origin: { y: 0.6 } });
        triggerHaptic('success');
    } else if (diff > 1) {
        studentStats.streak = 1;
        studentStats.lastStudyDate = today;
        showToast('🔥 Nova ofensiva iniciada: 1º dia de estudos!', 'info');
    } else {
        studentStats.lastStudyDate = today;
    }
}

function checkAndAwardBadges() {
    if (!currentUser) return;
    ensureStudentStatsDefaults(studentStats);

    let newlyUnlocked = [];

    CORPORATE_BADGES.forEach(badge => {
        if (!studentStats.unlockedBadges[badge.id]) {
            try {
                if (badge.check(studentStats)) {
                    studentStats.unlockedBadges[badge.id] = Date.now();
                    newlyUnlocked.push(badge);
                }
            } catch (err) {
                console.warn('Erro ao avaliar badge', badge.id, err);
            }
        }
    });

    if (newlyUnlocked.length > 0) {
        triggerHaptic('success');
        confetti({ particleCount: 160, spread: 90, origin: { y: 0.5 } });

        newlyUnlocked.forEach((badge, idx) => {
            setTimeout(() => {
                showToast(`🎉 Conquista Desbloqueada: ${badge.title}!`, 'success');
                appendChatMessage(
                    `🏆 **NOVA CONQUISTA DESBLOQUEADA!**\n\n` +
                    `${badge.icon} **${badge.title}**\n` +
                    `_${badge.desc}_\n\n` +
                    `Parabéns pela dedicação ao seu desenvolvimento profissional! Digite \`/medalhas\` para ver sua galeria.`,
                    'bot',
                    ['/medalhas', '/ofensiva', '/desafio', '/pergunta']
                );
            }, idx * 600);
        });

        if (currentUser) {
            db.ref(`stats/${currentUser.uid}`).set(studentStats).catch(e => console.warn(e));
        }
    }

    updateStudentStatsUI();
}

function processGamificationEvent(options = {}) {
    ensureStudentStatsDefaults(studentStats);
    const { isCorrect = false, series = 'Básico' } = options;

    if (isCorrect) {
        studentStats.consecutiveHits = (studentStats.consecutiveHits || 0) + 1;
        if (studentStats.consecutiveHits > (studentStats.maxConsecutiveHits || 0)) {
            studentStats.maxConsecutiveHits = studentStats.consecutiveHits;
        }

        const sNorm = (series || 'básico').toLowerCase();
        if (sNorm.includes('bás') || sNorm.includes('bas')) {
            studentStats.seriesHits['básico'] = (studentStats.seriesHits['básico'] || 0) + 1;
        } else if (sNorm.includes('inter')) {
            studentStats.seriesHits['intermediário'] = (studentStats.seriesHits['intermediário'] || 0) + 1;
        } else if (sNorm.includes('avan')) {
            studentStats.seriesHits['avançado'] = (studentStats.seriesHits['avançado'] || 0) + 1;
        }
    } else {
        studentStats.consecutiveHits = 0;
    }

    processDailyStreak();
    checkAndAwardBadges();
    updateStudentStatsUI();
}

function openBadgesModal(tab = 'badges') {
    triggerHaptic('light');
    switchBadgesTab(tab);
    renderBadgesModal();
    const overlay = document.getElementById('badgesModalOverlay');
    if (overlay) {
        overlay.classList.add('active');
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }
}

function closeBadgesModal() {
    triggerHaptic('light');
    const overlay = document.getElementById('badgesModalOverlay');
    if (overlay) overlay.classList.remove('active');
}

function handleBadgesOverlayClick(e) {
    if (e.target.id === 'badgesModalOverlay') {
        closeBadgesModal();
    }
}

function switchBadgesTab(tab) {
    const tabBadges = document.getElementById('badgesTabContent');
    const tabStreak = document.getElementById('streakTabContent');
    const btnBadges = document.getElementById('tabBtnBadges');
    const btnStreak = document.getElementById('tabBtnStreak');

    if (tab === 'badges') {
        if (tabBadges) tabBadges.style.display = 'flex';
        if (tabStreak) tabStreak.style.display = 'none';
        if (btnBadges) btnBadges.classList.add('active');
        if (btnStreak) btnStreak.classList.remove('active');
    } else {
        if (tabBadges) tabBadges.style.display = 'none';
        if (tabStreak) tabStreak.style.display = 'flex';
        if (btnBadges) btnBadges.classList.remove('active');
        if (btnStreak) btnStreak.classList.add('active');
    }
    renderBadgesModal();
}

function renderBadgesModal() {
    ensureStudentStatsDefaults(studentStats);
    updateStudentStatsUI();

    const grid = document.getElementById('badgesGridContainer');
    if (grid) {
        grid.innerHTML = CORPORATE_BADGES.map(badge => {
            const isUnlocked = !!(studentStats.unlockedBadges && studentStats.unlockedBadges[badge.id]);
            const unlockedAt = isUnlocked ? new Date(studentStats.unlockedBadges[badge.id]).toLocaleDateString('pt-BR') : '';
            const progress = badge.getProgress ? badge.getProgress(studentStats) : '';

            return `
            <div class="badge-card ${isUnlocked ? 'unlocked' : 'locked'}">
                <div class="badge-icon-box" style="background:${isUnlocked ? 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)' : 'var(--panasonic-gray-200)'};color:${isUnlocked ? '#D97706' : 'var(--text-muted)'};font-size:1.6rem;display:flex;align-items:center;justify-content:center;box-shadow:${isUnlocked ? '0 4px 10px rgba(245, 158, 11, 0.25)' : 'none'};">
                    ${badge.icon}
                </div>
                <div class="badge-details">
                    <div class="badge-name">
                        <span>${badge.title}</span>
                        ${isUnlocked ? '<i data-lucide="check-circle-2" size="16" style="color:#10B981;"></i>' : '<i data-lucide="lock" size="14" style="color:var(--text-muted);"></i>'}
                    </div>
                    <div class="badge-desc">${badge.desc}</div>
                    <div class="badge-progress-tag">
                        ${isUnlocked 
                            ? `✓ Conquistada em ${unlockedAt}` 
                            : `Progresso: ${progress}`}
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }

    const weekTracker = document.getElementById('streakWeekTracker');
    if (weekTracker) {
        const weekDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0 = Domingo, 1 = Segunda
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(today);
        monday.setDate(today.getDate() + mondayOffset);

        let weekHtml = '';
        for (let i = 0; i < 7; i++) {
            const currentD = new Date(monday);
            currentD.setDate(monday.getDate() + i);
            const dateStr = getLocalDateString(currentD);
            const isToday = dateStr === getLocalDateString(today);
            const hasStudied = !!(studentStats.streakHistory && studentStats.streakHistory[dateStr]);

            weekHtml += `
            <div class="streak-day-item">
                <div class="streak-day-dot ${hasStudied ? 'active' : ''} ${isToday ? 'today' : ''}" title="${weekDays[i]}: ${hasStudied ? 'Estudou' : isToday ? 'Hoje' : 'Sem atividade'}">
                    ${hasStudied ? '🔥' : isToday ? '•' : ''}
                </div>
                <span class="streak-day-name" style="${isToday ? 'color:var(--accent);font-weight:800;' : ''}">${weekDays[i]}</span>
            </div>
            `;
        }
        weekTracker.innerHTML = weekHtml;
    }

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

function updateStudentStatsUI() {
    ensureStudentStatsDefaults(studentStats);
    const accuracy = studentStats.total === 0 ? 0 : Math.round((studentStats.hits / studentStats.total) * 100);
    const scoreEl = document.getElementById('statScore');
    const hitsEl = document.getElementById('statHits');
    const accEl = document.getElementById('statAccuracy');
    const mScoreEl = document.getElementById('mStatScore');
    const mHitsEl = document.getElementById('mStatHits');
    const mAccEl = document.getElementById('mStatAccuracy');

    if (scoreEl) scoreEl.textContent = studentStats.score;
    if (hitsEl) hitsEl.textContent = studentStats.hits;
    if (accEl) accEl.textContent = `${accuracy}%`;
    if (mScoreEl) mScoreEl.textContent = studentStats.score;
    if (mHitsEl) mHitsEl.textContent = studentStats.hits;
    if (mAccEl) mAccEl.textContent = `${accuracy}%`;

    const streak = studentStats.streak || 0;
    const unlockedCount = Object.keys(studentStats.unlockedBadges || {}).length;

    const streakChip = document.getElementById('streakChipCount');
    if (streakChip) streakChip.textContent = `${streak}d`;

    const sideStreak = document.getElementById('sidebarStreakVal');
    if (sideStreak) sideStreak.textContent = `${streak} Dias 🔥`;

    const mStreak = document.getElementById('mStatStreak');
    if (mStreak) mStreak.textContent = `${streak}d 🔥`;

    const headerBadges = document.getElementById('headerBadgesCount');
    if (headerBadges) headerBadges.textContent = unlockedCount;

    const mBadges = document.getElementById('mStatBadges');
    if (mBadges) mBadges.textContent = `${unlockedCount}/6 🏅`;

    const modalBadges = document.getElementById('modalBadgesCount');
    if (modalBadges) modalBadges.textContent = unlockedCount;

    const modalStreak = document.getElementById('modalStreakCount');
    if (modalStreak) modalStreak.textContent = streak;

    const bannerTitle = document.getElementById('streakBannerTitle');
    if (bannerTitle) bannerTitle.textContent = `🔥 ${streak} Dia${streak === 1 ? '' : 's'} Seguidos!`;
}
  function toggleStatsDropdown() {
    const el = document.getElementById('mobileStatsDropdown');
    if (!el) return;
    el.classList.toggle('open');
}

/**
 * FUNÇÕES DE CHAT
 */
function appendChatMessage(text, sender = 'bot', options = null) {
    const feed = document.getElementById('chatFeed');
    const row = document.createElement('div');
    row.className = `chat-bubble-row ${sender}`;
    
    const icon = sender === 'user' ? 'user' : 'bot';
    let optionsMarkup = '';
    
    if (options && options.length > 0) {
        optionsMarkup = `
            <div class="options-grid">
                ${options.map(opt => {
                    const encoded = encodeURIComponent(opt);
                    const safeLabel = String(opt)
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                    let iconName = 'circle-dot';
                    const lowerOpt = opt.toLowerCase();
                    if (lowerOpt.includes('pergunta')) iconName = 'play';
                    else if (lowerOpt.includes('desafio')) iconName = 'trophy';
                    else if (lowerOpt.includes('certificado')) iconName = 'award';
                    else if (lowerOpt.includes('ajuda')) iconName = 'help-circle';
                    else if (lowerOpt.includes('dica')) iconName = 'lightbulb';
                    else if (lowerOpt.includes('ranking')) iconName = 'medal';
                    else if (lowerOpt.includes('série') || lowerOpt.includes('serie')) iconName = 'layers';

                    return `
                    <button class="opt-btn" onclick="onStudentOptionClick(this, decodeURIComponent('${encoded}'))">
                        <i data-lucide="${iconName}" size="16"></i> 
                        <span>${safeLabel}</span>
                    </button>
                    `;
                }).join('')}
            </div>
        `;
    }
    
    const formattedText = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>')
        .replace(/`(.*?)`/g, '<code style="background:var(--panasonic-gray-100);padding:0.2rem 0.4rem;border-radius:0.3rem;">$1</code>');
    
    const avatarMarkup = sender === 'user' 
        ? `<i data-lucide="user" size="18"></i>` 
        : `<img src="icon-192.png" alt="Bot" onerror="this.outerHTML='<i data-lucide=\\'bot\\' size=\\'18\\'></i>'">`;
    
    row.innerHTML = `
        <div class="chat-avatar">
            ${avatarMarkup}
        </div>
        <div style="display:flex;flex-direction:column;width:100%;min-width:0;">
            <div class="chat-bubble">${formattedText}</div>
            ${optionsMarkup}
        </div>
    `;
    
    feed.appendChild(row);

    // Proteção de memória e performance mobile: mantém no máximo 45 mensagens na sessão
    while (feed.children.length > 45) {
        feed.removeChild(feed.firstElementChild);
    }

    lucide.createIcons();
    requestAnimationFrame(() => {
        feed.scrollTop = feed.scrollHeight;
    });
}

function submitChatMessage() {
    const input = document.getElementById('chatTextInput');
    const val = input.value.trim();
    if (!val) return;
    
    input.value = '';
    input.disabled = true;
    handleStudentCommand(val);
    
    setTimeout(() => {
        input.disabled = false;
        input.focus();
    }, 300);
}

function handleStudentCommand(cmd) {
    const clean = cmd.trim().toLowerCase();
    appendChatMessage(cmd, 'user');

    if (clean === '/ajuda' || clean === 'ajuda' || clean === 'help') {
        appendChatMessage(`📚 **Comandos do Treinamentos:**\n\n• \`/desafio\` - Iniciar o Desafio Oficial Ativo (Garante o Certificado)\n• \`/plano\` - Configurar Plano de Estudo Personalizado (Botão +)\n• \`/certificado\` - Baixar seu certificado oficial emitido\n• \`/pergunta\` - Estudo livre no banco geral\n• \`/series\` - Filtrar estudo livre por nível\n• \`/dica\` - Obter pista da pergunta atual\n• \`/ranking\` - Ver líderes corporativos\n• \`/ofensiva\` ou \`/medalhas\` - Ver Ofensiva Diária e Galeria de Conquistas`, 'bot', ['/desafio', '/plano', '/pergunta', '/certificado', '/series', '/ranking', '/medalhas']);
        return;
    }

    if (clean === '/plano' || clean === 'plano' || clean === '+ novo plano de estudo' || clean === 'novo plano de estudo' || clean === 'plano de estudo' || clean === 'configurar plano') {
        openStudyPlanModal();
        return;
    }

    if (clean === '/desafio' || clean === 'desafio' || clean === 'iniciar desafio' || clean === 'iniciar desafio oficial') {
        startChallengeMode();
        return;
    }

    if (clean === '/pergunta' || clean === 'pergunta' || clean === 'nova pergunta' || clean === 'outra pergunta' || clean === 'praticar') {
        isChallengeRunning = false;
        deliverFreePracticeQuestion();
        return;
    }

    if (clean === '/ranking' || clean === 'ranking') { showLeaderboardModal(); return; }
    if (clean === '/certificado' || clean === 'certificado' || clean === 'meu certificado') { emitStudentCertificate(); return; }
    if (clean === '/ofensiva' || clean === 'ofensiva' || clean === '/streak' || clean === 'streak') { openBadgesModal('streak'); return; }
    if (clean === '/medalhas' || clean === 'medalhas' || clean === '/badges' || clean === 'badges' || clean === '/conquistas' || clean === 'conquistas') { openBadgesModal('badges'); return; }

    if (clean === '/dica' || clean === 'dica') {
        if (!waitingAnswer || !activeQuestion) {
            appendChatMessage("⚠️ Nenhuma questão ativa no momento. Digite `/desafio` para o desafio oficial ou `/pergunta` para estudo livre.", 'bot', ['/desafio', '/pergunta']);
            return;
        }
        const hint = activeQuestion.answer.substring(0, Math.ceil(activeQuestion.answer.length / 2));
        appendChatMessage(`💡 **Dica:** Resposta começa com... **"${hint}..."**`);
        return;
    }

    if (clean === '/series' || clean === 'series' || clean === 'série' || clean === 'serie' || clean === 'nível' || clean === 'nivel') {
        appendChatMessage("Selecione o nível de dificuldade desejado:", 'bot', ['Todas as Séries', 'Básico', 'Intermediário', 'Avançado']);
        return;
    }

    if (clean === 'todas as séries' || clean === 'todas as series' || clean === 'todas') {
        activeSeriesFilter = 'all';
        appendChatMessage("📂 Filtro de estudo redefinido para: **Todas as Séries**.");
        setTimeout(deliverFreePracticeQuestion, 400);
        return;
    }

    const validLevels = ['básico', 'basico', 'intermediário', 'intermediario', 'avançado', 'avancado'];
    if (validLevels.includes(clean)) {
        if (clean.includes('bás') || clean.includes('bas')) activeSeriesFilter = 'Básico';
        else if (clean.includes('inter')) activeSeriesFilter = 'Intermediário';
        else if (clean.includes('avan')) activeSeriesFilter = 'Avançado';
        appendChatMessage(`📂 Filtro de estudo ativado para o nível: **${activeSeriesFilter}**.`);
        setTimeout(deliverFreePracticeQuestion, 400);
        return;
    }

    if (waitingAnswer && activeQuestion) {
        evaluateStudentAnswer(cmd);
        return;
    }

    appendChatMessage("Comando não reconhecido. Digite `/ajuda` para ver as opções ou toque em `/desafio`.", 'bot', ['/desafio', '/pergunta', '/ajuda']);
}

/**
 * DESAFIO
 */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

async function startChallengeMode() {
    if (typeof customStudyPlan !== 'undefined' && customStudyPlan.isRunning) {
        customStudyPlan.isRunning = false;
        clearQuestionTimer();
        const fabBadge = document.getElementById('fabProgressBadge');
        if (fabBadge) fabBadge.style.display = 'none';
    }
    if (!currentActiveChallenge) {
        appendChatMessage("⚠️ **Nenhum Desafio Oficial Ativo no momento.**\nA administração do sistema ainda não habilitou um desafio vigente. Aguarde ou pratique no modo livre com `/pergunta`.", 'bot', ['/pergunta']);
        return;
    }
    
    let candidateQuestions = Array.isArray(currentActiveChallenge.questions) ? currentActiveChallenge.questions : [];
    
    if (candidateQuestions.length === 0) {
        if (currentActiveChallenge.series && currentActiveChallenge.series !== 'all') {
            candidateQuestions = questionsBank.filter(q => q.series === currentActiveChallenge.series);
        } else {
            candidateQuestions = questionsBank;
        }
    }
    
    if (candidateQuestions.length === 0) {
        appendChatMessage("⚠️ Este desafio oficial não possui perguntas cadastradas. Solicite ao administrador que anexe o JSON de perguntas na aba \"Desafios & Certificação\".", 'bot', ['/pergunta', '/ajuda']);
        return;
    }
    
    const qCount = Math.min(candidateQuestions.length, currentActiveChallenge.questionCount || candidateQuestions.length);
    challengePool = shuffleArray(candidateQuestions).slice(0, qCount);
    challengeIndex = 0;
    challengeHits = 0;
    isChallengeRunning = true;
    
    appendChatMessage(`🎯 **DESAFIO INICIADO:**\n\n🏆 **${currentActiveChallenge.title}**\n📝 ${currentActiveChallenge.description || ''}\n\n📊 **Regras do Desafio:**\n• Total de Perguntas Exclusivas: **${qCount}**\n• Aproveitamento Mínimo para Certificação: **${currentActiveChallenge.minScore}%**\n• Carga Horária Reconhecida: **${currentActiveChallenge.workload || '8 Horas'}**\n\nBoa sorte, **${currentProfile.name}**! Vamos para a primeira questão:`);
    
    setTimeout(deliverNextChallengeQuestion, 900);
}

function deliverNextChallengeQuestion() {
    if (challengeIndex >= challengePool.length) {
        finishOfficialChallenge();
        return;
    }
    activeQuestion = challengePool[challengeIndex];
    waitingAnswer = true;

    const feed = document.getElementById('chatFeed');
    if (!feed) return;

    let card = document.getElementById('activeChallengeStageCard');
    const progressPct = Math.round(((challengeIndex) / challengePool.length) * 100);
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    const normSeries = getQuestionSeries(activeQuestion);
    const badgeClass = getSeriesBadgeClass(normSeries);

    const cardContent = `
        <div class="stage-card-header">
            <div class="stage-header-top">
                <div class="stage-badge-wrap">
                    <span class="badge-pill badge-admin" style="font-size:0.7rem;padding:0.2rem 0.5rem;">Desafio Oficial</span>
                    <span class="badge-pill ${badgeClass}" style="font-size:0.7rem;padding:0.2rem 0.5rem;">${normSeries}</span>
                    <h4 class="stage-challenge-title">${currentActiveChallenge?.title || 'Avaliação Corporativa'}</h4>
                </div>
                <span class="stage-progress-text">Questão ${challengeIndex + 1} de ${challengePool.length} (${progressPct}%)</span>
            </div>
            <div class="stage-progress-track">
                <div class="stage-progress-fill" style="width: ${progressPct}%;"></div>
            </div>
        </div>
        <div class="stage-question-body">${activeQuestion.question}</div>
        <div class="stage-options-grid" id="stageOptionsGrid">
            ${(activeQuestion.options || []).map((opt, i) => {
                const encoded = encodeURIComponent(opt);
                const safeOpt = String(opt).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return `
                    <button class="stage-opt-btn" onclick="submitStageChallengeAnswer('${encoded}', this)">
                        <div class="stage-opt-letter">${letters[i] || (i + 1)}</div>
                        <span style="flex:1;">${safeOpt}</span>
                    </button>
                `;
            }).join('')}
        </div>
        <div id="stageFeedbackSlot" style="display:none;"></div>
    `;

    if (!card) {
        card = document.createElement('div');
        card.id = 'activeChallengeStageCard';
        card.className = 'challenge-stage-card';
        card.innerHTML = cardContent;
        feed.appendChild(card);
    } else {
        card.innerHTML = cardContent;
        card.classList.remove('stage-card-reanimate');
        void card.offsetWidth;
        card.classList.add('stage-card-reanimate');
    }

    lucide.createIcons();
    requestAnimationFrame(() => {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
}

function submitStageChallengeAnswer(encodedOpt, btnElement) {
    if (!waitingAnswer || !isChallengeRunning || !activeQuestion) return;
    waitingAnswer = false;

    const answerText = decodeURIComponent(encodedOpt);
    const isCorrect = answerText.trim().toLowerCase() === activeQuestion.answer.trim().toLowerCase();

    // Desabilita opções para evitar múltiplos cliques
    const container = document.getElementById('stageOptionsGrid');
    if (container) {
        const allBtns = container.querySelectorAll('.stage-opt-btn');
        allBtns.forEach(b => {
            b.disabled = true;
            const text = b.querySelector('span')?.textContent?.trim()?.toLowerCase();
            if (text === activeQuestion.answer.trim().toLowerCase()) {
                b.classList.add('correct-choice');
            }
        });
    }

    const feedbackSlot = document.getElementById('stageFeedbackSlot');

    // Registra pontuação e logs
    if (currentUser) {
        if (!statsMap[currentUser.uid]) statsMap[currentUser.uid] = { hits: 0, total: 0, score: 0 };
        studentStats = ensureStudentStatsDefaults(statsMap[currentUser.uid]);
        studentStats.total += 1;
        if (isCorrect) {
            studentStats.hits += 1;
            studentStats.score += 10;
        }
        processGamificationEvent({ isCorrect, series: activeQuestion.series || 'Básico' });
        db.ref(`stats/${currentUser.uid}`).set(studentStats).catch(e => console.warn(e));

        try {
            const uName = (currentProfile && currentProfile.name) || (currentUser.displayName) || 'Colaborador';
            const uEmail = (currentProfile && currentProfile.email) || (currentUser.email) || '';
            const logEntry = {
                userId: currentUser.uid,
                userName: uName,
                userEmail: uEmail,
                questionId: activeQuestion.id || null,
                questionText: activeQuestion.question || '',
                questionSeries: activeQuestion.series || 'Básico',
                correctAnswer: activeQuestion.answer || '',
                studentAnswer: answerText || '',
                isCorrect: !!isCorrect,
                options: activeQuestion.options || [],
                timestamp: firebase.database.ServerValue ? firebase.database.ServerValue.TIMESTAMP : Date.now()
            };
            db.ref('answer_logs').push(logEntry).catch(e => console.warn('Log resposta aviso:', e));
        } catch (errLog) {
            console.warn('Erro ao salvar answer_log:', errLog);
        }
    }

    if (isCorrect) {
        challengeHits += 1;
        triggerHaptic('success');
        if (btnElement) btnElement.classList.add('correct-choice');
        if (feedbackSlot) {
            feedbackSlot.className = 'stage-feedback-banner success';
            feedbackSlot.innerHTML = `<i data-lucide="check-circle" size="18"></i> <span><strong>Correto!</strong> Resposta precisa. Avançando...</span>`;
            feedbackSlot.style.display = 'flex';
            lucide.createIcons();
        }
        challengeIndex += 1;
        setTimeout(deliverNextChallengeQuestion, 1000);
    } else {
        triggerHaptic('error');
        if (btnElement) btnElement.classList.add('wrong-choice');
        if (feedbackSlot) {
            feedbackSlot.className = 'stage-feedback-banner error';
            feedbackSlot.innerHTML = `<i data-lucide="x-circle" size="18"></i> <span><strong>Incorreto.</strong> A resposta correta era: <strong>${activeQuestion.answer}</strong></span>`;
            feedbackSlot.style.display = 'flex';
            lucide.createIcons();
        }
        challengeIndex += 1;
        setTimeout(deliverNextChallengeQuestion, 1800);
    }
}

function deliverFreePracticeQuestion() {
    if (typeof customStudyPlan !== 'undefined' && customStudyPlan.isRunning) {
        customStudyPlan.isRunning = false;
        clearQuestionTimer();
        const fabBadge = document.getElementById('fabProgressBadge');
        if (fabBadge) fabBadge.style.display = 'none';
    }
    let pool = questionsBank;
    if (activeSeriesFilter !== 'all') {
        pool = questionsBank.filter(q => getQuestionSeries(q) === activeSeriesFilter);
        if (pool.length === 0) {
            appendChatMessage(`⚠️ Nenhuma questão disponível para o nível "${activeSeriesFilter}". Selecione outro nível ou redefina o filtro:`, 'bot', ['Todas as Séries', 'Básico', 'Intermediário', 'Avançado']);
            return;
        }
    }
    
    // Se o banco geral estiver vazio, aproveita as questões cadastradas no desafio ativo
    if (pool.length === 0 && currentActiveChallenge && Array.isArray(currentActiveChallenge.questions) && currentActiveChallenge.questions.length > 0) {
        if (activeSeriesFilter !== 'all') {
            pool = currentActiveChallenge.questions.filter(q => getQuestionSeries(q) === activeSeriesFilter);
            if (pool.length === 0) pool = currentActiveChallenge.questions;
        } else {
            pool = currentActiveChallenge.questions;
        }
    }
    
    if (pool.length === 0) {
        appendChatMessage("⚠️ **Banco de Questões Vazio.**\nO administrador ainda não cadastrou nenhuma pergunta no sistema. Volte mais tarde!", 'bot', ['/desafio', '/ajuda']);
        return;
    }
    
    // Evita repetir imediatamente a mesma pergunta se houver mais de uma
    let available = pool;
    if (pool.length > 1 && activeQuestion) {
        const filtered = pool.filter(q => q.question !== activeQuestion.question);
        if (filtered.length > 0) available = filtered;
    }
    
    const randomQ = available[Math.floor(Math.random() * available.length)];
    activeQuestion = randomQ;
    waitingAnswer = true;
    appendChatMessage(`**Prática Livre [Nível ${randomQ.series || 'Básico'}]:**\n${randomQ.question}`, 'bot', randomQ.options);
}

function onStudentOptionClick(btn, optionText) {
    triggerHaptic('light');
    const parent = btn.closest('.options-grid');
    if (parent) parent.querySelectorAll('.opt-btn').forEach(b => b.disabled = true);
    
    const clean = optionText.trim().toLowerCase();
    const isCommand = clean.startsWith('/') || 
                      ['todas as séries', 'todas as series', 'todas', 'básico', 'basico', 'intermediário', 'intermediario', 'avançado', 'avancado', 'desafio', 'pergunta', 'certificado', 'ranking', 'ajuda', 'dica', '+ novo plano de estudo', 'novo plano de estudo', 'plano de estudo', 'plano'].includes(clean) ||
                      !waitingAnswer;

    if (isCommand) {
        handleStudentCommand(optionText);
    } else {
        appendChatMessage(optionText, 'user');
        evaluateStudentAnswer(optionText);
    }
}

async function evaluateStudentAnswer(answerText) {
    if (!waitingAnswer || !activeQuestion) return;
    
    waitingAnswer = false;
    clearQuestionTimer();

    const answeredQuestion = { ...activeQuestion };

    ensureStudentStatsDefaults(studentStats);
    studentStats.total += 1;
    const isCorrect = answerText.trim().toLowerCase() === activeQuestion.answer.trim().toLowerCase();
    
    if (isCorrect) {
        triggerHaptic('success');
        studentStats.hits += 1;
        studentStats.score += 10;
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
    } else {
        triggerHaptic('error');
        const grids = document.querySelectorAll('#chatFeed .options-grid');
        const lastGrid = grids.length > 0 ? grids[grids.length - 1] : null;
        if (lastGrid) {
            lastGrid.querySelectorAll('.opt-btn').forEach(b => {
                const span = b.querySelector('span');
                const text = (span ? span.innerText : b.innerText).trim().toLowerCase();
                if (text === activeQuestion.answer.trim().toLowerCase()) {
                    b.classList.add('correct-hint');
                }
            });
        }
    }
    
    // Injeta botão discreto de reportar erro nesta questão ao ADM
    try {
        const grids = document.querySelectorAll('#chatFeed .options-grid');
        const lastGrid = grids.length > 0 ? grids[grids.length - 1] : null;
        if (lastGrid && !lastGrid.parentElement.querySelector('.question-report-bar')) {
            const reportBar = document.createElement('div');
            reportBar.className = 'question-report-bar';
            
            const qDataSafe = encodeURIComponent(JSON.stringify({
                id: answeredQuestion.id || '',
                question: answeredQuestion.question || '',
                series: answeredQuestion.series || 'Básico',
                answer: answeredQuestion.answer || '',
                options: answeredQuestion.options || [],
                explanation: answeredQuestion.explanation || ''
            }));
            
            reportBar.innerHTML = `
                <button type="button" class="btn-report-question" onclick="openReportQuestionModal('${qDataSafe}', this)" title="Reportar erro ou inconsistência nesta questão ao administrador">
                    <i data-lucide="flag" style="width:13px;height:13px;"></i>
                    Reportar questão ao ADM
                </button>
            `;
            lastGrid.parentElement.appendChild(reportBar);
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        }
    } catch (errReport) {
        console.warn('Erro ao injetar botão de reporte:', errReport);
    }
    
    processGamificationEvent({ isCorrect, series: answeredQuestion.series || 'Básico' });
    updateStudentStatsUI();
    if (currentUser) {
        await retryOperation(async () => {
            await db.ref('stats/' + currentUser.uid).set(studentStats);
        });

        // Registro detalhado para Drill-down Analítico do ADM (Perguntas e Colaboradores que erraram)
        if (activeQuestion) {
            try {
                const uName = (currentProfile && currentProfile.name) || 
                              (currentUser.displayName) || 
                              'Colaborador';
                const uEmail = (currentProfile && currentProfile.email) || 
                               (currentUser.email) || 
                               '';
                const logEntry = {
                    userId: currentUser.uid,
                    userName: uName,
                    userEmail: uEmail,
                    questionId: activeQuestion.id || null,
                    questionText: activeQuestion.question || '',
                    questionSeries: activeQuestion.series || 'Básico',
                    correctAnswer: activeQuestion.answer || '',
                    studentAnswer: answerText || '',
                    isCorrect: !!isCorrect,
                    options: activeQuestion.options || [],
                    timestamp: firebase.database.ServerValue ? firebase.database.ServerValue.TIMESTAMP : Date.now()
                };
                db.ref('answer_logs').push(logEntry).catch(e => console.warn('Log resposta aviso:', e));
            } catch (errLog) {
                console.warn('Erro ao salvar answer_log:', errLog);
            }
        }
    }

    // Se estiver em Plano de Estudo Personalizado, delega o fluxo da rodada
    if (typeof customStudyPlan !== 'undefined' && customStudyPlan.isRunning) {
        evaluateCustomStudyAnswer(isCorrect);
        return;
    }

    if (isCorrect) {
        if (isChallengeRunning) {
            challengeHits += 1;
            appendChatMessage("✅ **Correto!** Resposta precisa.");
            challengeIndex += 1;
            setTimeout(deliverNextChallengeQuestion, 1000);
        } else {
            appendChatMessage("✅ **Correto!** Deseja outra pergunta livre ou iniciar o Desafio Oficial?", 'bot', ['/pergunta', '/desafio']);
        }
    } else {
        if (isChallengeRunning) {
            appendChatMessage(`❌ **Incorreto.** A resposta certa era: **${activeQuestion.answer}**`);
            challengeIndex += 1;
            setTimeout(deliverNextChallengeQuestion, 1300);
        } else {
            appendChatMessage(`❌ **Resposta incorreta.** A resposta correta é: **${activeQuestion.answer}**`, 'bot', ['/pergunta', '/desafio']);
        }
    }
}

async function finishOfficialChallenge() {
    isChallengeRunning = false;
    waitingAnswer = false;
    
    const totalQ = challengePool.length;
    const finalAccuracy = Math.round((challengeHits / totalQ) * 100);
    const requiredScore = currentActiveChallenge.minScore || 70;
    const isApproved = finalAccuracy >= requiredScore;
    
    if (currentUser) {
        const attemptData = {
            challengeId: currentActiveChallenge.id,
            challengeTitle: currentActiveChallenge.title,
            hits: challengeHits,
            total: totalQ,
            accuracy: finalAccuracy,
            isApproved: isApproved,
            completedAt: Date.now()
        };
        await db.ref(`challenge_results/${currentUser.uid}/${currentActiveChallenge.id}`).set(attemptData);
    }
    
    if (isApproved) {
        studentStats.hasCertificate = true;
        checkAndAwardBadges();
        confetti({ particleCount: 300, spread: 120, origin: { y: 0.5 } });
        
        const authCode = 'PAN-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
        
        const certRecord = {
            userId: currentUser.uid,
            userName: currentProfile.name,
            userEmail: currentProfile.email,
            challengeId: currentActiveChallenge.id,
            challengeTitle: currentActiveChallenge.title,
            workload: currentActiveChallenge.workload || '8 Horas',
            accuracy: finalAccuracy,
            score: studentStats.score,
            authCode: authCode,
            issuedAt: Date.now()
        };
        
        if (currentUser) {
            await db.ref(`certificates/${currentUser.uid}/${currentActiveChallenge.id}`).set(certRecord);
        }
        
        appendChatMessage(`🎉 **PARABÉNS, ${currentProfile.name.toUpperCase()}! VOCÊ FOI APROVADO(A)!**\n\n🏆 **Desafio:** ${currentActiveChallenge.title}\n✅ Acertos: **${challengeHits} de ${totalQ} (${finalAccuracy}%)**\n🎯 Nota de Corte Exigida: ${requiredScore}%\n📜 **Carga Horária Reconhecida:** ${currentActiveChallenge.workload || '8 Horas'}\n\nSeu **Certificado Oficial** foi emitido e registrado no sistema! Clique no botão abaixo para baixar o PDF:`, 'bot', ['/certificado']);
    } else {
        appendChatMessage(`🏁 **Desafio Oficial Finalizado.**\n\nVocê concluiu a rodada com **${challengeHits} de ${totalQ} acertos (${finalAccuracy}%)**.\n⚠️ A nota mínima estipulada para certificação é **${requiredScore}%**.\n\nNão desanime! Revise o conteúdo através do modo de prática livre e tente novamente quando se sentir preparado(a).`, 'bot', ['/desafio', '/pergunta']);
    }

    const stageCard = document.getElementById('activeChallengeStageCard');
    if (stageCard) {
        stageCard.innerHTML = `
            <div style="text-align:center;padding:1.25rem 0.75rem;display:flex;flex-direction:column;align-items:center;gap:0.75rem;">
                <div style="width:58px;height:58px;border-radius:50%;background:${isApproved ? '#ecfdf5' : '#fef2f2'};color:${isApproved ? '#10b981' : '#ef4444'};display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.06);">
                    <i data-lucide="${isApproved ? 'award' : 'alert-circle'}" size="30"></i>
                </div>
                <h3 style="margin:0;font-size:1.15rem;font-weight:800;color:var(--text-main);">
                    ${isApproved ? '🎉 Desafio Concluído com Sucesso!' : 'Avaliação Concluída'}
                </h3>
                <p style="margin:0;font-size:0.9rem;color:var(--text-muted);max-width:380px;line-height:1.5;">
                    ${isApproved 
                        ? `Parabéns, <strong>${currentProfile.name}</strong>! Você obteve <strong>${finalAccuracy}% de aproveitamento</strong> (${challengeHits}/${totalQ} acertos) e conquistou a Certificação Oficial.`
                        : `Você concluiu a rodada com <strong>${finalAccuracy}% de aproveitamento</strong> (${challengeHits}/${totalQ} acertos). A nota de corte exigida é de <strong>${requiredScore}%</strong>.`}
                </p>
                <div style="display:flex;gap:0.6rem;margin-top:0.5rem;flex-wrap:wrap;justify-content:center;">
                    ${isApproved ? `
                        <button class="btn btn-primary" onclick="handleStudentCommand('/certificado')">
                            <i data-lucide="award" size="16"></i> Emitir Certificado
                        </button>
                    ` : `
                        <button class="btn btn-primary" onclick="handleStudentCommand('/desafio')">
                            <i data-lucide="rotate-ccw" size="16"></i> Tentar Novamente
                        </button>
                    `}
                    <button class="btn btn-secondary" onclick="handleStudentCommand('/pergunta')">
                        <i data-lucide="play" size="16"></i> Prática Livre
                    </button>
                </div>
            </div>
        `;
        lucide.createIcons();
    }
}

async function emitStudentCertificate() {
    if (!currentUser) {
        showToast('Faça login para acessar seus certificados.', 'info');
        return;
    }
    
    loadingManager.show();
    
    try {
        const snap = await retryOperation(async () => {
            return await db.ref(`certificates/${currentUser.uid}`).once('value');
        });
        
        const userCerts = snap.val();
        
        if (!userCerts) {
            showToast('Você ainda não possui certificados emitidos.', 'info');
            appendChatMessage("⚠️ **Nenhum Certificado Emitido Ainda.**\nPara receber seu certificado, seja aprovado no **Desafio Oficial** digitando `/desafio`.");
            return;
        }
        
        let certToPrint = null;
        if (currentActiveChallenge && userCerts[currentActiveChallenge.id]) {
            certToPrint = userCerts[currentActiveChallenge.id];
        } else {
            certToPrint = Object.values(userCerts).pop();
        }
        
        if (certToPrint) {
            generateOfficialCertificatePDF(
                certToPrint.userName || currentProfile.name,
                certToPrint.challengeTitle,
                certToPrint.workload,
                certToPrint.accuracy,
                certToPrint.authCode,
                certToPrint.issuedAt
            );
        }
    } catch (error) {
        showToast('Erro ao carregar certificado.', 'error');
    } finally {
        loadingManager.hide();
    }
}

/**
 * GERAÇÃO DE CERTIFICADO PDF (Padrão Panasonic)
 */
function generateOfficialCertificatePDF(userName, challengeTitle, workload, accuracy, authCode, issuedAt) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Cor principal Panasonic: RGB(11, 78, 162)
    // Molduras
    doc.setDrawColor(11, 78, 162);
    doc.setLineWidth(4);
    doc.rect(10, 10, pageWidth - 20, pageHeight - 20);
    
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(1);
    doc.rect(14, 14, pageWidth - 28, pageHeight - 28);
    
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.5);
    doc.rect(16, 16, pageWidth - 32, pageHeight - 32);
    
    // Cabeçalho
    doc.setFontSize(28);
    doc.setTextColor(11, 78, 162);
    doc.text('CERTIFICADO OFICIAL DE CONCLUSÃO', pageWidth / 2, 42, { align: 'center' });
    
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text('PROGRAMA CORPORATIVO DE CAPACITAÇÃO E TREINAMENTO • PANASONIC', pageWidth / 2, 50, { align: 'center' });
    
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(1.5);
    doc.line(pageWidth / 2 - 60, 56, pageWidth / 2 + 60, 56);
    
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text('Certificamos por meio deste documento oficial que', pageWidth / 2, 72, { align: 'center' });
    
    doc.setFontSize(25);
    doc.setTextColor(11, 78, 162);
    doc.text(userName.toUpperCase(), pageWidth / 2, 88, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setTextColor(51, 65, 85);
    const bodyText = `concluiu com êxito a avaliação do Desafio Oficial "${challengeTitle || 'Capacitação Técnica'}", cumprindo com distinção a carga horária programada de ${workload || '8 Horas'} e obtendo aproveitamento final de ${accuracy}% nos testes práticos e conceituais da plataforma de Treinamentos Panasonic.`;
    doc.text(bodyText, pageWidth / 2, 108, { align: 'center', maxWidth: 215 });
    
    const dateToUse = issuedAt ? new Date(issuedAt) : new Date();
    const dataExtenso = dateToUse.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Emitido oficialmente em ${dataExtenso}`, pageWidth / 2, 142, { align: 'center' });
    
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.5);
    doc.line(pageWidth / 2 - 40, 164, pageWidth / 2 + 40, 164);
    
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Diretoria de Treinamento & Desenvolvimento', pageWidth / 2, 171, { align: 'center' });
    
    const hash = authCode || ('PAN-' + Math.random().toString(36).substring(2, 8).toUpperCase());
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Registro Autêntico de Validação: ${hash}`, 22, pageHeight - 16);
    doc.text(`Panasonic Certification Engine`, pageWidth - 22, pageHeight - 16, { align: 'right' });
    
    doc.save(`Certificado_Panasonic_${userName.replace(/\s+/g, '_')}.pdf`);
    showToast('Certificado Oficial Panasonic gerado e baixado com sucesso!', 'success');
}

/**
 * ADMIN - NAVEGAÇÃO
 */
let chartAccuracyInstance = null;
let chartQuestionsInstance = null;
let chartTimelineInstance = null;

function switchAdminSection(sectionId) {
    document.querySelectorAll('.admin-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.admin-nav-item').forEach(btn => btn.classList.remove('active'));
    const target = document.getElementById(sectionId);
    if (target) target.classList.add('active');
    const navBtn = document.querySelector(`.admin-nav-item[onclick*="${sectionId}"]`);
    if (navBtn) {
        navBtn.classList.add('active');
        document.getElementById('adminViewTitle').textContent = navBtn.querySelector('span').textContent;
    }
    closeAllDrawers();
    lucide.createIcons();
    if (sectionId === 'secDashboard') {
        setTimeout(initOrUpdateAdminCharts, 80);
    }
    if (sectionId === 'secQuestionReports') {
        renderAdminQuestionReports();
    }
}

function updateKPICards() {
    document.getElementById('kpiQuestionsCount').textContent = questionsBank.length;
    document.getElementById('kpiChallengesCount').textContent = challengesList.length;
    document.getElementById('kpiUsersCount').textContent = Object.keys(usersMap).length;
    let certCount = 0;
    Object.values(certificatesMap).forEach(userCerts => {
        certCount += Object.keys(userCerts).length;
    });
    document.getElementById('kpiCertificatesCount').textContent = certCount;
    initOrUpdateAdminCharts();
}

/**
 * Normaliza e classifica a série / nível de uma questão
 * Retorna garantidamente: 'Básico', 'Intermediário' ou 'Avançado'
 */
function getQuestionSeries(q) {
    if (!q) return 'Básico';
    const val = (typeof q === 'string') 
        ? q 
        : (q.series || q.level || q.dificuldade || q.nivel || q.complexity || '');
    
    const s = String(val).trim().toLowerCase();
    const sNorm = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // 1. Intermediário
    if (
        sNorm.includes('inter') || 
        sNorm.includes('medio') || 
        sNorm === '2' || 
        sNorm.includes('nivel 2') || 
        sNorm.includes('serie 2') ||
        sNorm.includes('modulo 2')
    ) {
        return 'Intermediário';
    }

    // 2. Avançado
    if (
        sNorm.includes('avan') || 
        sNorm.includes('dificil') || 
        sNorm === '3' || 
        sNorm.includes('nivel 3') || 
        sNorm.includes('serie 3') ||
        sNorm.includes('modulo 3')
    ) {
        return 'Avançado';
    }

    // 3. Qualquer outra questão pertence ao nível 'Básico'
    return 'Básico';
}

function initOrUpdateAdminCharts() {
    if (typeof Chart === 'undefined') return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94A3B8' : '#475467';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';

    // 1. GRÁFICO DE PIZZA / ROSCA: ACERTOS VS ERROS
    let totalHits = 0;
    let totalAnswers = 0;
    Object.values(statsMap || {}).forEach(s => {
        totalHits += (s.hits || 0);
        totalAnswers += (s.total || 0);
    });
    // Se answerLogsList tiver mais dados que statsMap, sincroniza os totais
    if (answerLogsList && answerLogsList.length > totalAnswers) {
        totalAnswers = answerLogsList.length;
        totalHits = answerLogsList.filter(l => l.isCorrect).length;
    }
    const totalErrors = Math.max(0, totalAnswers - totalHits);
    const overallAcc = totalAnswers > 0 ? Math.round((totalHits / totalAnswers) * 100) : 0;

    const accBadge = document.getElementById('chartAccuracyBadge');
    if (accBadge) accBadge.textContent = totalAnswers > 0 ? `${overallAcc}% Acertos` : '0% Geral';
    const statHitsEl = document.getElementById('chartStatHits');
    if (statHitsEl) statHitsEl.textContent = totalHits;
    const statErrorsEl = document.getElementById('chartStatErrors');
    if (statErrorsEl) statErrorsEl.textContent = totalErrors;
    const statTotalEl = document.getElementById('chartStatTotal');
    if (statTotalEl) statTotalEl.textContent = totalAnswers;

    const accCanvas = document.getElementById('chartAccuracyCanvas');
    if (accCanvas) {
        if (chartAccuracyInstance) chartAccuracyInstance.destroy();
        const dataValues = totalAnswers > 0 ? [totalHits, totalErrors] : [1, 0];
        const dataLabels = totalAnswers > 0 ? ['Acertos', 'Erros'] : ['Sem respostas ainda', ''];
        const dataColors = totalAnswers > 0 ? ['#12B76A', '#F04438'] : ['#CBD5E1', '#E2E8F0'];

        chartAccuracyInstance = new Chart(accCanvas, {
            type: 'doughnut',
            data: {
                labels: dataLabels,
                datasets: [{
                    data: dataValues,
                    backgroundColor: dataColors,
                    borderWidth: 2,
                    borderColor: isDark ? '#0F172A' : '#FFFFFF'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (evt, elements, chart) => {
                    if (!elements || elements.length === 0) {
                        openAnalyticsDrilldown('errors');
                        return;
                    }
                    const idx = elements[0].index;
                    const label = chart.data.labels[idx];
                    if (label === 'Erros') {
                        openAnalyticsDrilldown('errors');
                    } else if (label === 'Acertos') {
                        openAnalyticsDrilldown('hits');
                    } else {
                        openAnalyticsDrilldown('all');
                    }
                },
                onHover: (event, chartElement) => {
                    const canvas = event?.native?.target;
                    if (canvas) canvas.style.cursor = (chartElement && chartElement.length > 0) ? 'pointer' : 'default';
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: textColor, font: { family: 'Inter', size: 11, weight: '600' }, boxWidth: 12, padding: 12 },
                        onClick: (e, legendItem) => {
                            if (legendItem.text === 'Erros') {
                                openAnalyticsDrilldown('errors');
                            } else if (legendItem.text === 'Acertos') {
                                openAnalyticsDrilldown('hits');
                            } else {
                                openAnalyticsDrilldown('all');
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => totalAnswers > 0 ? ` ${ctx.label}: ${ctx.raw} (${Math.round((ctx.raw / totalAnswers) * 100)}%) - Clique para ver detalhes` : ' Nenhuma resposta registrada'
                        }
                    }
                },
                cutout: '68%'
            }
        });
    }

    // 2. GRÁFICO DE BARRAS: VOLUME & COMPLEXIDADE POR NÍVEL
    const basCount = questionsBank.filter(q => getQuestionSeries(q) === 'Básico').length;
    const intCount = questionsBank.filter(q => getQuestionSeries(q) === 'Intermediário').length;
    const advCount = questionsBank.filter(q => getQuestionSeries(q) === 'Avançado').length;

    const qBadge = document.getElementById('chartQuestionsBadge');
    if (qBadge) qBadge.textContent = `${questionsBank.length} Total`;
    const statBasEl = document.getElementById('chartStatBasico');
    if (statBasEl) statBasEl.textContent = basCount;
    const statIntEl = document.getElementById('chartStatInter');
    if (statIntEl) statIntEl.textContent = intCount;
    const statAdvEl = document.getElementById('chartStatAdv');
    if (statAdvEl) statAdvEl.textContent = advCount;

    const qCanvas = document.getElementById('chartQuestionsCanvas');
    if (qCanvas) {
        if (chartQuestionsInstance) chartQuestionsInstance.destroy();
        chartQuestionsInstance = new Chart(qCanvas, {
            type: 'bar',
            data: {
                labels: ['Básico', 'Intermediário', 'Avançado'],
                datasets: [{
                    label: 'Questões',
                    data: [basCount, intCount, advCount],
                    backgroundColor: ['#12B76A', '#F79009', '#F04438'],
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (evt, elements, chart) => {
                    if (!elements || elements.length === 0) {
                        openAnalyticsDrilldown('series', 'all');
                        return;
                    }
                    const idx = elements[0].index;
                    const seriesName = chart.data.labels[idx];
                    openAnalyticsDrilldown('series', seriesName);
                },
                onHover: (event, chartElement) => {
                    const canvas = event?.native?.target;
                    if (canvas) canvas.style.cursor = (chartElement && chartElement.length > 0) ? 'pointer' : 'default';
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${ctx.raw} pergunta(s) - Clique para abrir diagnóstico`
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: textColor, font: { family: 'Inter', size: 11, weight: '600' } },
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: textColor, precision: 0, font: { family: 'Inter', size: 10 } },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    }

    // 3. GRÁFICO DE LINHA: ADESÃO & CERTIFICAÇÕES AO LONGO DO TEMPO (7 DIAS)
    const days = [];
    const dayLabels = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        days.push(`${yyyy}-${mm}-${dd}`);
        dayLabels.push(`${dd}/${mm}`);
    }

    const userCountsByDay = Array(7).fill(0);
    const certCountsByDay = Array(7).fill(0);

    Object.values(usersMap || {}).forEach(u => {
        if (u.createdAt) {
            const uDate = new Date(u.createdAt);
            const key = `${uDate.getFullYear()}-${String(uDate.getMonth() + 1).padStart(2, '0')}-${String(uDate.getDate()).padStart(2, '0')}`;
            const idx = days.indexOf(key);
            if (idx !== -1) userCountsByDay[idx]++;
        }
    });

    Object.values(certificatesMap || {}).forEach(userCerts => {
        Object.values(userCerts || {}).forEach(cert => {
            if (cert.issuedAt) {
                const cDate = new Date(cert.issuedAt);
                const key = `${cDate.getFullYear()}-${String(cDate.getMonth() + 1).padStart(2, '0')}-${String(cDate.getDate()).padStart(2, '0')}`;
                const idx = days.indexOf(key);
                if (idx !== -1) certCountsByDay[idx]++;
            }
        });
    });

    // Se todos os últimos 7 dias forem zero, insere os totais acumulados no dia de hoje para leitura amigável
    const sumUsers = userCountsByDay.reduce((a, b) => a + b, 0);
    const sumCerts = certCountsByDay.reduce((a, b) => a + b, 0);
    if (sumUsers === 0 && Object.keys(usersMap || {}).length > 0) {
        userCountsByDay[6] = Object.keys(usersMap || {}).length;
    }
    let totalGlobalCerts = 0;
    Object.values(certificatesMap || {}).forEach(uc => totalGlobalCerts += Object.keys(uc).length);
    if (sumCerts === 0 && totalGlobalCerts > 0) {
        certCountsByDay[6] = totalGlobalCerts;
    }

    const timelineCanvas = document.getElementById('chartTimelineCanvas');
    if (timelineCanvas) {
        if (chartTimelineInstance) chartTimelineInstance.destroy();
        chartTimelineInstance = new Chart(timelineCanvas, {
            type: 'line',
            data: {
                labels: dayLabels,
                datasets: [
                    {
                        label: 'Novos Cadastros',
                        data: userCountsByDay,
                        borderColor: '#0B4EA2',
                        backgroundColor: 'rgba(11, 78, 162, 0.12)',
                        fill: true,
                        tension: 0.35,
                        pointBackgroundColor: '#0B4EA2',
                        pointRadius: 4,
                        pointHoverRadius: 6
                    },
                    {
                        label: 'Certificados Emitidos',
                        data: certCountsByDay,
                        borderColor: '#12B76A',
                        backgroundColor: 'rgba(18, 183, 106, 0.12)',
                        fill: true,
                        tension: 0.35,
                        pointBackgroundColor: '#12B76A',
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (evt, elements, chart) => {
                    openAnalyticsDrilldown('users');
                },
                onHover: (event, chartElement) => {
                    const canvas = event?.native?.target;
                    if (canvas) canvas.style.cursor = (chartElement && chartElement.length > 0) ? 'pointer' : 'default';
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: textColor, font: { family: 'Inter', size: 11, weight: '600' }, boxWidth: 14 }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw} - Clique para ver detalhes`
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: textColor, font: { family: 'Inter', size: 11 } },
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: textColor, precision: 0, font: { family: 'Inter', size: 10 } },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    }
}

/**
 * =========================================================================
 * DRILL-DOWN ANALÍTICO DE ERROS E QUESTÕES (MODAL EXTRA DOS GRÁFICOS)
 * =========================================================================
 */
function openAnalyticsDrilldown(mode = 'errors', filterVal = 'all') {
    const overlay = document.getElementById('analyticsDrilldownOverlay');
    if (!overlay) return;

    drilldownState.mode = mode;
    drilldownState.searchTerm = '';
    drilldownState.filterUser = null;
    drilldownState.filterUserName = '';
    const searchInput = document.getElementById('drilldownSearchInput');
    if (searchInput) searchInput.value = '';

    const filterBar = document.getElementById('drillUserFilterBar');
    if (filterBar) filterBar.style.display = 'none';

    const seriesSelect = document.getElementById('drilldownSeriesSelect');
    if (mode === 'series' && filterVal && filterVal !== 'all') {
        drilldownState.filterSeries = filterVal;
        if (seriesSelect) seriesSelect.value = filterVal;
    } else {
        drilldownState.filterSeries = 'all';
        if (seriesSelect) seriesSelect.value = 'all';
    }

    // Configura aba ativa de acordo com o modo
    if (mode === 'errors') {
        drilldownState.activeTab = 'errors';
    } else if (mode === 'hits') {
        drilldownState.activeTab = 'all';
    } else if (mode === 'users') {
        drilldownState.activeTab = 'users';
    } else if (mode === 'series') {
        drilldownState.activeTab = 'errors';
    } else {
        drilldownState.activeTab = 'errors';
    }

    updateDrilldownTabUI();
    updateDrilldownHeaderInfo();
    updateDrilldownKPIs();
    renderDrilldownContent();

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeAnalyticsDrilldown() {
    const overlay = document.getElementById('analyticsDrilldownOverlay');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
    drilldownState.filterUser = null;
    drilldownState.filterUserName = '';
    const filterBar = document.getElementById('drillUserFilterBar');
    if (filterBar) filterBar.style.display = 'none';
}

function handleDrilldownOverlayClick(event) {
    if (event.target && event.target.id === 'analyticsDrilldownOverlay') {
        closeAnalyticsDrilldown();
    }
}

function setDrilldownTab(tabName) {
    drilldownState.activeTab = tabName;
    updateDrilldownTabUI();
    renderDrilldownContent();
}

function filterDrilldownByUser(userId) {
    if (!userId) return;
    const u = (usersMap && usersMap[userId]) || {};
    const userName = u.name || 'Colaborador';
    drilldownState.filterUser = userId;
    drilldownState.filterUserName = userName;
    drilldownState.activeTab = 'errors';

    const filterBar = document.getElementById('drillUserFilterBar');
    const nameEl = document.getElementById('drillFilteredUserName');
    if (nameEl) nameEl.textContent = userName;
    if (filterBar) filterBar.style.display = 'flex';

    updateDrilldownTabUI();
    updateDrilldownHeaderInfo();
    renderDrilldownContent();

    const container = document.getElementById('drilldownModalContent');
    if (container) container.scrollTop = 0;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function clearUserDrilldownFilter() {
    drilldownState.filterUser = null;
    drilldownState.filterUserName = '';
    const filterBar = document.getElementById('drillUserFilterBar');
    if (filterBar) filterBar.style.display = 'none';

    updateDrilldownHeaderInfo();
    renderDrilldownContent();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateDrilldownTabUI() {
    const tabMap = {
        'errors': 'drillTabErrors',
        'users': 'drillTabUsers',
        'all': 'drillTabAll'
    };
    ['errors', 'users', 'all'].forEach(t => {
        const btn = document.getElementById(tabMap[t]);
        if (btn) {
            if (drilldownState.activeTab === t) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
}

function filterDrilldownItems() {
    const searchInput = document.getElementById('drilldownSearchInput');
    const seriesSelect = document.getElementById('drilldownSeriesSelect');
    drilldownState.searchTerm = (searchInput ? searchInput.value : '').trim().toLowerCase();
    drilldownState.filterSeries = seriesSelect ? seriesSelect.value : 'all';
    renderDrilldownContent();
}

function updateDrilldownHeaderInfo() {
    const titleEl = document.getElementById('drilldownTitle');
    const subEl = document.getElementById('drilldownSubtitle');
    if (!titleEl || !subEl) return;

    if (drilldownState.filterUser) {
        titleEl.innerHTML = `<i data-lucide="user-x" size="22" style="color:var(--panasonic-error);"></i> Erros de: ${drilldownState.filterUserName || 'Colaborador'}`;
        subEl.textContent = 'Visualizando auditoria detalhada das respostas incorretas deste colaborador';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    if (drilldownState.mode === 'errors') {
        titleEl.innerHTML = `<i data-lucide="alert-triangle" size="22" style="color:var(--panasonic-error);"></i> Diagnóstico de Perguntas com Erros`;
        subEl.textContent = 'Veja quais perguntas tiveram erros e quais colaboradores responderam incorretamente';
    } else if (drilldownState.mode === 'hits') {
        titleEl.innerHTML = `<i data-lucide="check-circle-2" size="22" style="color:var(--panasonic-success);"></i> Diagnóstico de Acertos & Domínio`;
        subEl.textContent = 'Mapeamento de questões com alta assertividade pelos colaboradores';
    } else if (drilldownState.mode === 'series') {
        const sName = drilldownState.filterSeries === 'all' ? 'Todas as Séries' : drilldownState.filterSeries;
        titleEl.innerHTML = `<i data-lucide="bar-chart-2" size="22" style="color:var(--panasonic-blue);"></i> Complexidade: ${sName}`;
        subEl.textContent = `Detalhamento de aproveitamento pedagógico no nível ${sName}`;
    } else {
        titleEl.innerHTML = `<i data-lucide="pie-chart" size="22" style="color:var(--panasonic-blue);"></i> Desempenho Analítico Geral`;
        subEl.textContent = 'Auditoria completa de respostas, erros e assertividade por colaborador';
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateDrilldownKPIs() {
    let totalHits = 0;
    let totalAnswers = 0;
    Object.values(statsMap || {}).forEach(s => {
        totalHits += (s.hits || 0);
        totalAnswers += (s.total || 0);
    });
    if (answerLogsList && answerLogsList.length > totalAnswers) {
        totalAnswers = answerLogsList.length;
        totalHits = answerLogsList.filter(l => l.isCorrect).length;
    }
    const totalErrors = Math.max(0, totalAnswers - totalHits);
    const totalUsers = Object.keys(usersMap || {}).length;

    const ansEl = document.getElementById('drillTotalAnswers');
    if (ansEl) ansEl.textContent = totalAnswers;
    const errEl = document.getElementById('drillTotalErrors');
    if (errEl) errEl.textContent = totalErrors;
    const hitEl = document.getElementById('drillTotalHits');
    if (hitEl) hitEl.textContent = totalHits;
    const usrEl = document.getElementById('drillTotalUsers');
    if (usrEl) usrEl.textContent = totalUsers;
}

function renderDrilldownContent() {
    const container = document.getElementById('drilldownModalContent');
    const footerCount = document.getElementById('drilldownFooterCount');
    if (!container) return;

    updateDrilldownKPIs();

    const searchTerm = (drilldownState.searchTerm || '').toLowerCase();
    const filterSeries = drilldownState.filterSeries || 'all';
    const activeTab = drilldownState.activeTab || 'errors';

    // Mapeamento dos usuários com dados de erro agregados (de statsMap)
    const usersWithStats = Object.entries(usersMap || {}).map(([uid, u]) => {
        const st = (statsMap && statsMap[uid]) || { hits: 0, total: 0, score: 0 };
        const errors = Math.max(0, (st.total || 0) - (st.hits || 0));
        const acc = (st.total || 0) > 0 ? Math.round(((st.hits || 0) / st.total) * 100) : 0;
        return {
            uid,
            name: u.name || 'Colaborador',
            email: u.email || '',
            role: u.role || 'user',
            hits: st.hits || 0,
            total: st.total || 0,
            errors,
            accuracy: acc
        };
    });

    // =========================================================================
    // ABA 1: PERGUNTAS COM ERROS
    // =========================================================================
    if (activeTab === 'errors') {
        let errorLogs = (answerLogsList || []).filter(l => !l.isCorrect);

        // Se houver filtro específico de colaborador
        if (drilldownState.filterUser) {
            errorLogs = errorLogs.filter(l => l.userId === drilldownState.filterUser);
        }

        const questionsMap = {};

        // 1. Registra perguntas que possuem logs reais de erro
        errorLogs.forEach(log => {
            const qKey = (log.questionText || '').trim();
            if (!qKey) return;
            if (!questionsMap[qKey]) {
                const qOrig = (questionsBank || []).find(qb => (qb.question || '').trim() === qKey);
                questionsMap[qKey] = {
                    id: log.questionId || (qOrig ? qOrig.id : null),
                    question: qKey,
                    series: log.questionSeries || (qOrig ? qOrig.series : 'Básico'),
                    answer: log.correctAnswer || (qOrig ? qOrig.answer : ''),
                    options: (qOrig && qOrig.options) ? qOrig.options : (log.options || []),
                    errorCount: 0,
                    failedUsers: []
                };
            }
            questionsMap[qKey].errorCount++;
            questionsMap[qKey].failedUsers.push({
                userId: log.userId,
                userName: log.userName || 'Colaborador',
                userEmail: log.userEmail || '',
                studentAnswer: log.studentAnswer || 'Incorreta',
                timestamp: log.timestamp || null
            });
        });

        // 2. Fallback gracioso: Se o histórico tem erros acumulados (ex: 31 erros) mas answer_logs é recente
        const targetUserObj = drilldownState.filterUser ? usersWithStats.find(u => u.uid === drilldownState.filterUser) : null;
        const totalAggregatedErrors = targetUserObj ? targetUserObj.errors : usersWithStats.reduce((acc, u) => acc + u.errors, 0);

        if (Object.keys(questionsMap).length === 0 && (questionsBank || []).length > 0 && totalAggregatedErrors > 0) {
            const failedUsersList = targetUserObj ? [targetUserObj] : usersWithStats.filter(u => u.errors > 0);
            (questionsBank || []).forEach(qb => {
                const qKey = (qb.question || '').trim();
                questionsMap[qKey] = {
                    id: qb.id,
                    question: qKey,
                    series: qb.series || 'Básico',
                    answer: qb.answer || '',
                    options: qb.options || [],
                    errorCount: Math.max(1, Math.round(totalAggregatedErrors / Math.max(1, questionsBank.length))),
                    failedUsers: failedUsersList.map(u => ({
                        userId: u.uid,
                        userName: u.name,
                        userEmail: u.email,
                        studentAnswer: 'Registrado no histórico acumulado (' + u.errors + ' erro(s) geral)',
                        timestamp: null
                    }))
                };
            });
        }

        let items = Object.values(questionsMap);

        // Se filtrado por usuário, mantém apenas perguntas onde esse usuário errou
        if (drilldownState.filterUser) {
            items = items.filter(it => (it.failedUsers || []).some(fu => fu.userId === drilldownState.filterUser));
        }

        // Filtro por série
        if (filterSeries !== 'all') {
            items = items.filter(it => getQuestionSeries(it.series || it) === filterSeries);
        }

        // Filtro por busca
        if (searchTerm) {
            items = items.filter(it => {
                const matchQ = (it.question || '').toLowerCase().includes(searchTerm);
                const matchAns = (it.answer || '').toLowerCase().includes(searchTerm);
                const matchUser = (it.failedUsers || []).some(fu => 
                    (fu.userName || '').toLowerCase().includes(searchTerm) || 
                    (fu.userEmail || '').toLowerCase().includes(searchTerm) ||
                    (fu.studentAnswer || '').toLowerCase().includes(searchTerm)
                );
                return matchQ || matchAns || matchUser;
            });
        }

        // Ordena por maior quantidade de erros
        items.sort((a, b) => b.errorCount - a.errorCount);

        if (footerCount) {
            if (drilldownState.filterUser) {
                footerCount.textContent = `Mostrando ${items.length} pergunta(s) com erros associados a ${drilldownState.filterUserName}`;
            } else {
                footerCount.textContent = `Mostrando ${items.length} pergunta(s) com erros registrados`;
            }
        }

        if (items.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:3rem 1rem;color:var(--text-muted);">
                    <i data-lucide="check-circle" size="48" style="color:var(--panasonic-success);margin-bottom:0.75rem;"></i>
                    <h4 style="font-weight:700;color:var(--text-main);margin-bottom:0.35rem;">
                        ${drilldownState.filterUser ? `Nenhum erro registrado para ${drilldownState.filterUserName}` : 'Nenhum erro registrado neste filtro'}
                    </h4>
                    <p style="font-size:0.85rem;">
                        ${drilldownState.filterUser ? 'Este colaborador não possui erros nas perguntas selecionadas ou na busca atual.' : 'Todas as perguntas avaliadas obtiveram 100% de acertos ou não correspondem à busca.'}
                    </p>
                    ${drilldownState.filterUser ? `
                        <button type="button" class="btn btn-secondary btn-sm" onclick="clearUserDrilldownFilter()" style="margin-top:1rem;display:inline-flex;align-items:center;gap:0.4rem;">
                            <i data-lucide="arrow-left" size="14"></i> Ver todas as perguntas com erros
                        </button>
                    ` : ''}
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        let html = '';

        // Banner informativo se estiver filtrando por um colaborador
        if (drilldownState.filterUser) {
            const uObj = usersWithStats.find(u => u.uid === drilldownState.filterUser);
            const userErrCount = uObj ? uObj.errors : 0;
            html += `
                <div style="background:var(--panasonic-white);border:1px solid var(--panasonic-blue);border-left:4px solid var(--panasonic-blue);padding:0.85rem 1.15rem;border-radius:0.6rem;display:flex;align-items:center;justify-content:space-between;gap:0.75rem;box-shadow:0 2px 8px rgba(11,78,162,0.06);flex-wrap:wrap;">
                    <div style="display:flex;align-items:center;gap:0.65rem;">
                        <i data-lucide="user-check" size="22" style="color:var(--panasonic-blue);flex-shrink:0;"></i>
                        <div>
                            <div style="font-size:0.9rem;font-weight:800;color:var(--text-main);">
                                Filtrado por: ${drilldownState.filterUserName}
                            </div>
                            <div style="font-size:0.76rem;color:var(--text-muted);">
                                ${userErrCount} erro(s) no total de respostas | ${items.length} questão(ões) exibida(s)
                            </div>
                        </div>
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="clearUserDrilldownFilter()" style="font-size:0.76rem;padding:0.35rem 0.75rem;display:flex;align-items:center;gap:0.35rem;">
                        <i data-lucide="x" size="13"></i> Limpar Filtro
                    </button>
                </div>
            `;
        }

        items.forEach((item, idx) => {
            const normSeries = getQuestionSeries(item.series || item);
            const seriesBadgeClass = getSeriesBadgeClass(normSeries);
            
            let usersRowsHtml = '';
            const usersToShow = drilldownState.filterUser ? item.failedUsers.filter(fu => fu.userId === drilldownState.filterUser) : item.failedUsers;
            
            if (usersToShow && usersToShow.length > 0) {
                usersRowsHtml = usersToShow.map(fu => {
                    const initials = (fu.userName || 'C').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
                    const dateStr = fu.timestamp ? new Date(fu.timestamp).toLocaleDateString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
                    return `
                        <div class="drill-user-err-row" onclick="filterDrilldownByUser('${fu.userId}')" style="cursor:pointer;" title="Clique para filtrar apenas os erros de ${fu.userName}">
                            <div class="drill-user-info">
                                <div style="width:26px;height:26px;border-radius:50%;background:#FEECEB;color:#F04438;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.72rem;flex-shrink:0;">
                                    ${initials}
                                </div>
                                <div style="overflow:hidden;text-overflow:ellipsis;">
                                    <div style="font-weight:700;color:var(--text-main);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${fu.userName}</div>
                                    <div style="font-size:0.72rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${fu.userEmail}</div>
                                </div>
                            </div>
                            <div style="display:flex;align-items:center;gap:0.4rem;flex-shrink:0;">
                                <span class="drill-user-bad-ans" title="Alternativa assinalada pelo colaborador">
                                    <i data-lucide="x-circle" size="12"></i> Marcou: <strong>${fu.studentAnswer}</strong>
                                </span>
                                ${dateStr ? `<span style="font-size:0.7rem;color:var(--text-muted);">${dateStr}</span>` : ''}
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                usersRowsHtml = `<div style="font-size:0.8rem;color:var(--text-muted);padding:0.4rem;">Nenhum usuário detalhado no momento.</div>`;
            }

            html += `
                <div class="drill-question-card">
                    <div class="drill-q-head">
                        <div style="display:flex;flex-direction:column;gap:0.4rem;flex:1;">
                            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                                <span class="badge-pill ${seriesBadgeClass}">${normSeries}</span>
                                <span style="background:var(--panasonic-error-bg);color:var(--panasonic-error);font-weight:800;font-size:0.72rem;padding:0.15rem 0.55rem;border-radius:999px;display:flex;align-items:center;gap:0.3rem;">
                                    <i data-lucide="alert-circle" size="12"></i> ${item.errorCount} erro(s) registrado(s)
                                </span>
                            </div>
                            <div class="drill-q-title">
                                #${idx + 1}. ${item.question}
                            </div>
                        </div>
                    </div>

                    <div class="drill-q-answer-box">
                        <i data-lucide="check-circle-2" size="17" style="color:var(--panasonic-success);flex-shrink:0;"></i>
                        <div>
                            <span style="font-size:0.74rem;color:var(--text-muted);display:block;text-transform:uppercase;letter-spacing:0.5px;">Gabarito Correto:</span>
                            <span style="font-size:0.88rem;color:var(--panasonic-success);font-weight:700;">${item.answer}</span>
                        </div>
                    </div>

                    <div class="drill-q-users-list">
                        <div style="font-size:0.75rem;font-weight:800;color:var(--text-muted);display:flex;align-items:center;gap:0.4rem;text-transform:uppercase;letter-spacing:0.5px;">
                            <i data-lucide="users" size="13" style="color:var(--panasonic-blue);"></i> Colaboradores que erraram esta pergunta (${usersToShow.length}):
                        </div>
                        ${usersRowsHtml}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    // =========================================================================
    // ABA 2: COLABORADORES QUE ERRARAM
    // =========================================================================
    if (activeTab === 'users') {
        let usersList = usersWithStats.filter(u => u.errors > 0 || u.total > 0);

        if (searchTerm) {
            usersList = usersList.filter(u => 
                (u.name || '').toLowerCase().includes(searchTerm) || 
                (u.email || '').toLowerCase().includes(searchTerm)
            );
        }

        // Ordena por maior número de erros (quem mais precisa de reforço no topo)
        usersList.sort((a, b) => b.errors - a.errors);

        if (footerCount) {
            footerCount.textContent = `Mostrando ${usersList.length} colaborador(es) com histórico de respostas`;
        }

        if (usersList.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:3rem 1rem;color:var(--text-muted);">
                    <i data-lucide="award" size="48" style="color:var(--panasonic-success);margin-bottom:0.75rem;"></i>
                    <h4 style="font-weight:700;color:var(--text-main);margin-bottom:0.35rem;">Nenhum colaborador com erros encontrado</h4>
                    <p style="font-size:0.85rem;">Todos os colaboradores ativos estão com 100% de aproveitamento ou a busca não retornou resultados.</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        let html = '';
        usersList.forEach(u => {
            const initials = (u.name || 'C').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
            const userErrorLogs = (answerLogsList || []).filter(l => l.userId === u.uid && !l.isCorrect);

            let specificErrorsHtml = '';
            if (userErrorLogs.length > 0) {
                specificErrorsHtml = `
                    <div style="margin-top:0.75rem;padding:0.6rem;background:var(--panasonic-gray-50);border-radius:0.5rem;border:1px solid var(--panasonic-gray-200);">
                        <div style="font-size:0.74rem;font-weight:700;color:var(--panasonic-error);margin-bottom:0.4rem;display:flex;align-items:center;gap:0.3rem;">
                            <i data-lucide="alert-triangle" size="12"></i> Perguntas específicas erradas por ${u.name}:
                        </div>
                        <div style="display:flex;flex-direction:column;gap:0.35rem;">
                            ${userErrorLogs.map(uel => `
                                <div style="font-size:0.78rem;background:var(--panasonic-white);padding:0.4rem 0.6rem;border-radius:0.35rem;border:1px solid var(--panasonic-gray-200);display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
                                    <span style="font-weight:600;color:var(--text-main);">${uel.questionText}</span>
                                    <span class="drill-user-bad-ans">Marcou: <strong>${uel.studentAnswer}</strong></span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            } else if (u.errors > 0) {
                // Histórico acumulado existente
                specificErrorsHtml = `
                    <div style="margin-top:0.75rem;padding:0.6rem 0.85rem;background:var(--panasonic-blue-lighter);border-radius:0.5rem;border:1px solid rgba(11,78,162,0.15);display:flex;align-items:center;justify-content:space-between;gap:0.5rem;">
                        <div style="font-size:0.78rem;color:var(--text-main);display:flex;align-items:center;gap:0.4rem;">
                            <i data-lucide="info" size="15" style="color:var(--panasonic-blue);flex-shrink:0;"></i>
                            <span>Possui <strong>${u.errors} erro(s)</strong> registrados no histórico geral de avaliações.</span>
                        </div>
                        <span style="font-size:0.75rem;font-weight:700;color:var(--panasonic-blue);white-space:nowrap;display:flex;align-items:center;gap:0.25rem;">
                            Clique para filtrar questões <i data-lucide="chevron-right" size="13"></i>
                        </span>
                    </div>
                `;
            }

            const isCardActive = drilldownState.filterUser === u.uid;

            html += `
                <div class="drill-question-card drill-user-card-clickable ${isCardActive ? 'drill-user-card-active' : ''}" onclick="filterDrilldownByUser('${u.uid}')" title="Clique para filtrar diretamente os erros de ${u.name}">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;">
                        <div style="display:flex;align-items:center;gap:0.75rem;min-width:0;">
                            <div style="width:42px;height:42px;border-radius:50%;background:var(--panasonic-blue-lighter);color:var(--panasonic-blue);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1rem;flex-shrink:0;">
                                ${initials}
                            </div>
                            <div style="min-width:0;">
                                <h4 style="font-size:0.95rem;font-weight:800;color:var(--text-main);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.name}</h4>
                                <div style="font-size:0.78rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.email}</div>
                            </div>
                        </div>

                        <div style="display:flex;gap:0.5rem;align-items:center;flex-shrink:0;">
                            <span style="background:var(--panasonic-error-bg);color:var(--panasonic-error);font-weight:800;font-size:0.78rem;padding:0.25rem 0.65rem;border-radius:0.4rem;border:1px solid rgba(240,68,56,0.2);">
                                ${u.errors} erro(s)
                            </span>
                            <span style="background:var(--panasonic-success-bg);color:var(--panasonic-success);font-weight:800;font-size:0.78rem;padding:0.25rem 0.65rem;border-radius:0.4rem;border:1px solid rgba(18,183,106,0.2);">
                                ${u.hits} acerto(s)
                            </span>
                            <button type="button" class="btn btn-primary btn-sm" onclick="event.stopPropagation(); filterDrilldownByUser('${u.uid}')" style="font-size:0.75rem;padding:0.3rem 0.75rem;display:flex;align-items:center;gap:0.35rem;border-radius:0.5rem;margin-left:0.25rem;">
                                <i data-lucide="zoom-in" size="13"></i> Ver ${u.errors} Erros
                            </button>
                        </div>
                    </div>

                    <div style="margin-top:0.5rem;">
                        <div style="display:flex;justify-content:space-between;font-size:0.74rem;color:var(--text-muted);margin-bottom:0.25rem;">
                            <span>Aproveitamento Geral: <strong>${u.accuracy}% Acertos</strong></span>
                            <span>Total de respostas: <strong>${u.total}</strong></span>
                        </div>
                        <div style="height:8px;background:var(--panasonic-gray-200);border-radius:999px;overflow:hidden;display:flex;">
                            <div style="width:${u.accuracy}%;background:var(--panasonic-success);"></div>
                            <div style="width:${100 - u.accuracy}%;background:var(--panasonic-error);"></div>
                        </div>
                    </div>

                    ${specificErrorsHtml}

                    <div style="font-size:0.73rem;color:var(--panasonic-blue);display:flex;align-items:center;gap:0.35rem;font-weight:600;margin-top:0.25rem;">
                        <i data-lucide="mouse-pointer-click" size="12"></i> Clique neste colaborador para abrir a auditoria das perguntas que ele errou
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    // =========================================================================
    // ABA 3: BANCO DE QUESTÕES COMPLETO
    // =========================================================================
    if (activeTab === 'all') {
        let items = [...(questionsBank || [])];

        if (filterSeries !== 'all') {
            items = items.filter(q => getQuestionSeries(q) === filterSeries);
        }

        if (searchTerm) {
            items = items.filter(q => 
                (q.question || '').toLowerCase().includes(searchTerm) || 
                (q.answer || '').toLowerCase().includes(searchTerm) ||
                (q.series || '').toLowerCase().includes(searchTerm)
            );
        }

        if (footerCount) {
            footerCount.textContent = `Mostrando ${items.length} de ${questionsBank.length} perguntas cadastradas`;
        }

        if (items.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:3rem 1rem;color:var(--text-muted);">
                    <i data-lucide="help-circle" size="48" style="color:var(--panasonic-gray-400);margin-bottom:0.75rem;"></i>
                    <h4 style="font-weight:700;color:var(--text-main);margin-bottom:0.35rem;">Nenhuma pergunta encontrada</h4>
                    <p style="font-size:0.85rem;">Nenhuma pergunta corresponde aos filtros selecionados.</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        let html = '';
        items.forEach((q, idx) => {
            const normSeries = getQuestionSeries(q);
            const seriesBadgeClass = getSeriesBadgeClass(normSeries);
            const optList = (q.options || []).map(opt => {
                const isCorrect = (opt || '').trim().toLowerCase() === (q.answer || '').trim().toLowerCase();
                return `
                    <div style="padding:0.35rem 0.65rem;border-radius:0.4rem;font-size:0.8rem;display:flex;align-items:center;gap:0.4rem;background:${isCorrect ? 'var(--panasonic-success-bg)' : 'var(--panasonic-white)'};border:1px solid ${isCorrect ? 'var(--panasonic-success)' : 'var(--panasonic-gray-200)'};color:${isCorrect ? '#0E6245' : 'var(--text-main)'};font-weight:${isCorrect ? '700' : '500'};">
                        ${isCorrect ? '<i data-lucide="check" size="14"></i>' : '<i data-lucide="circle" size="10" style="color:var(--panasonic-gray-400)"></i>'}
                        <span>${opt}</span>
                    </div>
                `;
            }).join('');

            html += `
                <div class="drill-question-card">
                    <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                        <span class="badge-pill ${seriesBadgeClass}">${normSeries}</span>
                        <span style="font-size:0.75rem;color:var(--text-muted);">Pergunta #${idx + 1}</span>
                    </div>

                    <div class="drill-q-title">
                        ${q.question}
                    </div>

                    <div style="display:flex;flex-direction:column;gap:0.4rem;margin-top:0.2rem;">
                        <div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Alternativas:</div>
                        ${optList}
                    </div>

                    <div class="drill-q-answer-box">
                        <i data-lucide="check-circle-2" size="16"></i>
                        <span>Resposta Oficial: <strong>${q.answer}</strong></span>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function printOrExportDrilldown() {
    exportAnalyticsDrilldownPDF();
}

function printAnalyticsDrilldown() {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'visible';
    window.print();
    setTimeout(() => {
        const overlay = document.getElementById('analyticsDrilldownOverlay');
        if (overlay && overlay.classList.contains('active')) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = prevOverflow || '';
        }
    }, 1000);
}

function exportAnalyticsDrilldownPDF() {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
        showToast('Biblioteca jsPDF não disponível. Abrindo impressão do navegador...', 'warning');
        printAnalyticsDrilldown();
        return;
    }

    showToast('Gerando PDF do diagnóstico completo...', 'info');

    try {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = 210;
        const pageHeight = 297;
        const marginX = 14;
        const usableWidth = pageWidth - (marginX * 2); // 182mm
        const maxContentY = 272; // Margem para rodapé

        // 1. Coleta e consolidação de dados
        let totalHits = 0;
        let totalAnswers = 0;
        Object.values(statsMap || {}).forEach(s => {
            totalHits += (s.hits || 0);
            totalAnswers += (s.total || 0);
        });
        if (answerLogsList && answerLogsList.length > totalAnswers) {
            totalAnswers = answerLogsList.length;
            totalHits = answerLogsList.filter(l => l.isCorrect).length;
        }
        const totalErrors = Math.max(0, totalAnswers - totalHits);
        const overallAcc = totalAnswers > 0 ? Math.round((totalHits / totalAnswers) * 100) : 0;
        const totalUsers = Object.keys(usersMap || {}).length;

        const usersWithStats = Object.entries(usersMap || {}).map(([uid, u]) => {
            const st = (statsMap && statsMap[uid]) || { hits: 0, total: 0, score: 0 };
            const errors = Math.max(0, (st.total || 0) - (st.hits || 0));
            const acc = (st.total || 0) > 0 ? Math.round(((st.hits || 0) / st.total) * 100) : 0;
            return {
                uid,
                name: u.name || 'Colaborador',
                email: u.email || '',
                role: u.role || 'user',
                hits: st.hits || 0,
                total: st.total || 0,
                errors,
                accuracy: acc
            };
        });

        const targetUserObj = drilldownState.filterUser ? usersWithStats.find(u => u.uid === drilldownState.filterUser) : null;
        const totalAggregatedErrors = targetUserObj ? targetUserObj.errors : usersWithStats.reduce((acc, u) => acc + u.errors, 0);

        // Mapeamento das questões com erro
        let errorLogs = (answerLogsList || []).filter(l => !l.isCorrect);
        if (drilldownState.filterUser) {
            errorLogs = errorLogs.filter(l => l.userId === drilldownState.filterUser);
        }

        const questionsMap = {};
        errorLogs.forEach(log => {
            const qKey = (log.questionText || '').trim();
            if (!qKey) return;
            if (!questionsMap[qKey]) {
                const qOrig = (questionsBank || []).find(qb => (qb.question || '').trim() === qKey);
                questionsMap[qKey] = {
                    id: log.questionId || (qOrig ? qOrig.id : null),
                    question: qKey,
                    series: log.questionSeries || (qOrig ? qOrig.series : 'Básico'),
                    answer: log.correctAnswer || (qOrig ? qOrig.answer : ''),
                    options: (qOrig && qOrig.options) ? qOrig.options : (log.options || []),
                    errorCount: 0,
                    failedUsers: []
                };
            }
            questionsMap[qKey].errorCount++;
            questionsMap[qKey].failedUsers.push({
                userId: log.userId,
                userName: log.userName || 'Colaborador',
                userEmail: log.userEmail || '',
                studentAnswer: log.studentAnswer || 'Incorreta',
                timestamp: log.timestamp || null
            });
        });

        // Fallback para histórico acumulado se ainda não houver answer_logs individuais
        if (Object.keys(questionsMap).length === 0 && (questionsBank || []).length > 0 && totalAggregatedErrors > 0) {
            const failedUsersList = targetUserObj ? [targetUserObj] : usersWithStats.filter(u => u.errors > 0);
            (questionsBank || []).forEach(qb => {
                const qKey = (qb.question || '').trim();
                questionsMap[qKey] = {
                    id: qb.id,
                    question: qKey,
                    series: qb.series || 'Básico',
                    answer: qb.answer || '',
                    options: qb.options || [],
                    errorCount: Math.max(1, Math.round(totalAggregatedErrors / Math.max(1, questionsBank.length))),
                    failedUsers: failedUsersList.map(u => ({
                        userId: u.uid,
                        userName: u.name,
                        userEmail: u.email,
                        studentAnswer: 'Registrado no histórico geral (' + u.errors + ' erro(s) geral)',
                        timestamp: null
                    }))
                };
            });
        }

        let items = Object.values(questionsMap);

        // Se filtrado por usuário
        if (drilldownState.filterUser) {
            items = items.filter(it => (it.failedUsers || []).some(fu => fu.userId === drilldownState.filterUser));
        }

        // Filtro por série
        if (drilldownState.filterSeries && drilldownState.filterSeries !== 'all') {
            items = items.filter(it => getQuestionSeries(it.series || it) === drilldownState.filterSeries);
        }

        // Filtro por busca
        if (drilldownState.searchTerm) {
            const term = drilldownState.searchTerm.toLowerCase();
            items = items.filter(it => {
                const matchQ = (it.question || '').toLowerCase().includes(term);
                const matchAns = (it.answer || '').toLowerCase().includes(term);
                const matchUser = (it.failedUsers || []).some(fu => 
                    (fu.userName || '').toLowerCase().includes(term) || 
                    (fu.userEmail || '').toLowerCase().includes(term) ||
                    (fu.studentAnswer || '').toLowerCase().includes(term)
                );
                return matchQ || matchAns || matchUser;
            });
        }

        // Ordena por maior número de erros
        items.sort((a, b) => b.errorCount - a.errorCount);

        // Função para cabeçalho de continuação
        function drawContinuationHeader() {
            doc.setFillColor(11, 78, 162);
            doc.rect(0, 0, pageWidth, 11, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(255, 255, 255);
            doc.text('PANASONIC DO BRASIL • DIAGNÓSTICO ANALÍTICO DE TREINAMENTOS', marginX, 7.5);
            doc.setFont('helvetica', 'normal');
            doc.text('AUDITORIA OFICIAL (CONTINUAÇÃO)', pageWidth - marginX, 7.5, { align: 'right' });
        }

        // ==========================================
        // PÁGINA 1: CABEÇALHO PRINCIPAL E RESUMO
        // ==========================================
        doc.setFillColor(11, 78, 162);
        doc.rect(0, 0, pageWidth, 20, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.text('PANASONIC DO BRASIL • SISTEMA DE CAPACITAÇÃO E TREINAMENTO', marginX, 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text('AUDITORIA ANALÍTICA OFICIAL', pageWidth - marginX, 12, { align: 'right' });

        let y = 30;

        if (drilldownState.filterUser) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(15);
            doc.setTextColor(11, 78, 162);
            doc.text(`AUDITORIA INDIVIDUAL: ${drilldownState.filterUserName.toUpperCase()}`, marginX, y);
            y += 6;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(100, 116, 139);
            doc.text(`Colaborador: ${targetUserObj ? targetUserObj.name : drilldownState.filterUserName} | E-mail: ${targetUserObj ? targetUserObj.email : 'N/A'}`, marginX, y);
            y += 5;
            const sName = drilldownState.filterSeries === 'all' ? 'Todas as Séries' : drilldownState.filterSeries;
            doc.text(`Filtro de Complexidade: ${sName} • Emissão: ${new Date().toLocaleString('pt-BR')}`, marginX, y);
            y += 8;
        } else {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(15);
            doc.setTextColor(11, 78, 162);
            doc.text('DIAGNÓSTICO ANALÍTICO GERAL DE ERROS E DESEMPENHO', marginX, y);
            y += 6;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(100, 116, 139);
            doc.text('Auditoria completa de respostas, taxa de assertividade e questões com erros por colaborador', marginX, y);
            y += 5;
            const sName = drilldownState.filterSeries === 'all' ? 'Todas as Séries' : drilldownState.filterSeries;
            doc.text(`Filtro de Complexidade: ${sName} • Emissão: ${new Date().toLocaleString('pt-BR')}`, marginX, y);
            y += 8;
        }

        // KPI Box
        const kpiBoxHeight = 22;
        doc.setDrawColor(203, 213, 225);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(marginX, y, usableWidth, kpiBoxHeight, 2, 2, 'FD');

        const colW = usableWidth / 4;
        const kpiY = y + 7;

        // KPI 1: Total Respostas
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text('TOTAL RESPOSTAS', marginX + 6, kpiY);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(15, 23, 42);
        const kpiResp = targetUserObj ? targetUserObj.total : totalAnswers;
        doc.text(String(kpiResp), marginX + 6, kpiY + 8);

        // KPI 2: Erros
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text('ERROS REGISTRADOS', marginX + colW + 4, kpiY);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(240, 68, 56);
        const kpiErr = targetUserObj ? targetUserObj.errors : totalErrors;
        doc.text(String(kpiErr), marginX + colW + 4, kpiY + 8);

        // KPI 3: Acertos
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text('ACERTOS REGISTRADOS', marginX + (colW * 2) + 4, kpiY);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(18, 183, 106);
        const kpiHit = targetUserObj ? targetUserObj.hits : totalHits;
        doc.text(String(kpiHit), marginX + (colW * 2) + 4, kpiY + 8);

        // KPI 4: Assertividade / Colaboradores
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        const lblKpi4 = targetUserObj ? 'ASSERTIVIDADE' : 'ASSERTIVIDADE GERAL';
        doc.text(lblKpi4, marginX + (colW * 3) + 4, kpiY);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(11, 78, 162);
        const kpiAcc = targetUserObj ? targetUserObj.accuracy : overallAcc;
        doc.text(`${kpiAcc}%`, marginX + (colW * 3) + 4, kpiY + 8);

        y += kpiBoxHeight + 8;

        // Seção 1: Perguntas com Erros
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(11, 78, 162);
        const secTitle = drilldownState.filterUser
            ? `1. PERGUNTAS COM ERRO DO COLABORADOR (${items.length} QUESTÕES ENCONTRADAS)`
            : `1. AUDITORIA DE PERGUNTAS COM ERROS (${items.length} QUESTÕES REGISTRADAS)`;
        doc.text(secTitle, marginX, y);
        y += 3;
        doc.setDrawColor(11, 78, 162);
        doc.setLineWidth(0.5);
        doc.line(marginX, y, marginX + usableWidth, y);
        y += 6;

        if (items.length === 0) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(100, 116, 139);
            doc.text('Nenhuma pergunta com erro encontrada para os filtros selecionados.', marginX, y);
            y += 10;
        } else {
            items.forEach((item, idx) => {
                const normSeries = getQuestionSeries(item.series || item);
                const qLines = doc.splitTextToSize(`#${idx + 1}. ${item.question || ''}`, usableWidth - 12);
                const aLines = doc.splitTextToSize(`Gabarito Oficial: ${item.answer || ''}`, usableWidth - 20);

                const usersToShow = drilldownState.filterUser
                    ? (item.failedUsers || []).filter(fu => fu.userId === drilldownState.filterUser)
                    : (item.failedUsers || []);

                const userRowsCount = Math.max(1, usersToShow.length);
                const qTextH = qLines.length * 4.3;
                const aBoxH = Math.max(6.5, aLines.length * 4.2 + 2.5);
                const usersListH = 5 + (userRowsCount * 5.2);
                const cardHeight = 8 + qTextH + 2 + aBoxH + 2 + usersListH + 3;

                // Quebra de página automática
                if (y + cardHeight > maxContentY) {
                    doc.addPage();
                    drawContinuationHeader();
                    y = 20;
                }

                // Fundo do card da questão
                doc.setDrawColor(226, 232, 240);
                doc.setFillColor(255, 255, 255);
                doc.roundedRect(marginX, y, usableWidth, cardHeight, 1.5, 1.5, 'FD');

                let curY = y + 5;

                // Linha de badge (Série + Erros)
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.5);
                doc.setFillColor(241, 245, 249);
                doc.setDrawColor(203, 213, 225);
                doc.roundedRect(marginX + 4, curY - 3, 28, 4.5, 1, 1, 'FD');
                doc.setTextColor(71, 85, 105);
                doc.text(normSeries, marginX + 6, curY);

                // Badge de erros
                doc.setFillColor(254, 242, 242);
                doc.setDrawColor(254, 205, 202);
                doc.roundedRect(marginX + 34, curY - 3, 34, 4.5, 1, 1, 'FD');
                doc.setTextColor(240, 68, 56);
                doc.text(`${item.errorCount} erro(s) registrado(s)`, marginX + 36, curY);

                curY += 5.5;

                // Enunciado da Pergunta
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.5);
                doc.setTextColor(15, 23, 42);
                doc.text(qLines, marginX + 4, curY);
                curY += qTextH + 2;

                // Box do Gabarito Correto
                doc.setFillColor(236, 253, 243);
                doc.setDrawColor(166, 244, 197);
                doc.roundedRect(marginX + 4, curY - 3, usableWidth - 8, aBoxH, 1, 1, 'FD');
                doc.setTextColor(14, 98, 69);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.text(aLines, marginX + 7, curY + 1);
                curY += aBoxH + 3;

                // Lista de Colaboradores com erro
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.2);
                doc.setTextColor(100, 116, 139);
                doc.text(`Colaborador(es) que erraram (${usersToShow.length}):`, marginX + 4, curY);
                curY += 4;

                if (usersToShow.length > 0) {
                    usersToShow.forEach(fu => {
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(7.5);
                        doc.setTextColor(15, 23, 42);
                        const userText = `• ${fu.userName} (${fu.userEmail})`;
                        doc.text(userText, marginX + 6, curY);

                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(240, 68, 56);
                        doc.text(`Marcou: ${fu.studentAnswer}`, marginX + 110, curY);

                        if (fu.timestamp) {
                            const dateStr = new Date(fu.timestamp).toLocaleDateString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                            doc.setFont('helvetica', 'normal');
                            doc.setTextColor(148, 163, 184);
                            doc.text(dateStr, marginX + usableWidth - 6, curY, { align: 'right' });
                        }
                        curY += 4.8;
                    });
                } else {
                    doc.setFont('helvetica', 'italic');
                    doc.setFontSize(7.2);
                    doc.setTextColor(148, 163, 184);
                    doc.text('Nenhum detalhe adicional de tentativa.', marginX + 6, curY);
                    curY += 4.8;
                }

                y += cardHeight + 4;
            });
        }

        // Seção 2: Resumo de Colaboradores (apenas se for relatório geral)
        if (!drilldownState.filterUser && usersWithStats.length > 0) {
            if (y + 35 > maxContentY) {
                doc.addPage();
                drawContinuationHeader();
                y = 20;
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(11, 78, 162);
            doc.text(`2. QUADRO RESUMO DE COLABORADORES (${usersWithStats.length} COLABORADORES)`, marginX, y);
            y += 3;
            doc.setDrawColor(11, 78, 162);
            doc.setLineWidth(0.5);
            doc.line(marginX, y, marginX + usableWidth, y);
            y += 6;

            // Ordena quem mais tem erros primeiro
            const sortedUsers = [...usersWithStats].sort((a, b) => b.errors - a.errors);

            sortedUsers.forEach(u => {
                if (y + 11 > maxContentY) {
                    doc.addPage();
                    drawContinuationHeader();
                    y = 20;
                }

                doc.setDrawColor(226, 232, 240);
                doc.setFillColor(248, 250, 252);
                doc.roundedRect(marginX, y - 3.5, usableWidth, 9, 1, 1, 'FD');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.setTextColor(15, 23, 42);
                doc.text(u.name, marginX + 4, y + 2);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.2);
                doc.setTextColor(100, 116, 139);
                doc.text(`(${u.email})`, marginX + 45, y + 2);

                doc.setFont('helvetica', 'bold');
                doc.setTextColor(240, 68, 56);
                doc.text(`${u.errors} erro(s)`, marginX + 105, y + 2);

                doc.setTextColor(18, 183, 106);
                doc.text(`${u.hits} acerto(s)`, marginX + 130, y + 2);

                doc.setTextColor(11, 78, 162);
                doc.text(`${u.accuracy}% assertividade (${u.total} resp.)`, marginX + usableWidth - 4, y + 2, { align: 'right' });

                y += 10.5;
            });
        }

        // Rodapé de Numeração de Páginas em TODAS as páginas
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.4);
            doc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.text('Panasonic Treinamentos • Relatório Corporativo de Diagnóstico e Auditoria Pedagógica', marginX, pageHeight - 7);
            doc.text(`Página ${i} de ${totalPages}`, pageWidth - marginX, pageHeight - 7, { align: 'right' });
        }

        // Salva o documento
        const cleanName = (drilldownState.filterUserName || 'geral').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const filename = drilldownState.filterUser
            ? `panasonic_diagnostico_${cleanName}_${Date.now()}.pdf`
            : `panasonic_diagnostico_geral_${Date.now()}.pdf`;

        doc.save(filename);
        showToast('Diagnóstico completo exportado em PDF com sucesso!', 'success');
    } catch (err) {
        console.error('Erro ao gerar PDF do diagnóstico:', err);
        showToast('Erro ao gerar PDF: ' + err.message, 'error');
    }
}

function getSeriesBadgeClass(series) {
    const s = getQuestionSeries(series);
    if (s === 'Intermediário') return 'badge-series-intermediario';
    if (s === 'Avançado') return 'badge-series-avancado';
    return 'badge-series-basico';
}

function changeQuestionsPage(delta) {
    tablePaginationState.questionsPage += delta;
    renderAdminQuestionsList();
    triggerHaptic('light');
}

function renderAdminQuestionsList() {
    const list = document.getElementById('adminQuestionsList');
    const counter = document.getElementById('totalQuestionsCount');
    if (!list) return;

    const term = (document.getElementById('searchQuestionInput')?.value || '').trim().toLowerCase();
    const filtered = questionsBank.filter(q => {
        const text = ((q.question || '') + ' ' + getQuestionSeries(q)).toLowerCase();
        return !term || text.includes(term);
    });

    counter.textContent = questionsBank.length;
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / tablePaginationState.questionsLimit));
    if (tablePaginationState.questionsPage > totalPages) tablePaginationState.questionsPage = totalPages;
    if (tablePaginationState.questionsPage < 1) tablePaginationState.questionsPage = 1;

    const startIdx = (tablePaginationState.questionsPage - 1) * tablePaginationState.questionsLimit;
    const endIdx = Math.min(totalItems, startIdx + tablePaginationState.questionsLimit);
    const paged = filtered.slice(startIdx, endIdx);

    const pageIndicator = document.getElementById('questionsPageIndicator');
    if (pageIndicator) pageIndicator.textContent = `${tablePaginationState.questionsPage} / ${totalPages}`;
    const info = document.getElementById('questionsPaginationInfo');
    if (info) info.textContent = totalItems > 0 
        ? `Mostrando ${startIdx + 1}–${endIdx} de ${totalItems} questões` 
        : `Nenhuma questão encontrada`;
    const btnPrev = document.getElementById('btnPrevQuestionsPage');
    if (btnPrev) btnPrev.disabled = tablePaginationState.questionsPage <= 1;
    const btnNext = document.getElementById('btnNextQuestionsPage');
    if (btnNext) btnNext.disabled = tablePaginationState.questionsPage >= totalPages;

    if (totalItems === 0) {
        list.innerHTML = `
            <div class="empty-state-box">
                <div class="empty-state-icon"><i data-lucide="help-circle" size="26"></i></div>
                <h4 class="empty-state-title">Nenhuma Questão Cadastrada</h4>
                <p class="empty-state-desc">${term ? 'Nenhuma pergunta corresponde aos termos pesquisados.' : 'Cadastre sua primeira pergunta no formulário acima ou faça a importação de um backup JSON com o banco de itens.'}</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    list.innerHTML = paged.map(q => {
        const normSeries = getQuestionSeries(q);
        const badgeClass = getSeriesBadgeClass(normSeries);
        return `
            <div class="question-card-row" data-search="${((q.question || '') + ' ' + normSeries).toLowerCase()}">
                <div class="q-card-content">
                    <div class="q-card-title">${q.question}</div>
                    <div class="q-card-meta">
                        <span class="badge-pill ${badgeClass}">${normSeries}</span>
                        <span>Correta: <strong class="q-card-answer">${q.answer}</strong></span>
                        <span>• ${q.options?.length || 0} opções</span>
                    </div>
                </div>
                <div style="display:flex;gap:0.4rem;">
                    <button class="btn btn-secondary btn-sm" onclick="startEditQuestion('${q.id}')">
                        <i data-lucide="edit" size="14"></i> <span class="desktop-only">Editar</span>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="removeQuestion('${q.id}')">
                        <i data-lucide="trash-2" size="14"></i> <span class="desktop-only">Excluir</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
    lucide.createIcons();
}

function filterQuestionsList() {
    tablePaginationState.questionsPage = 1;
    renderAdminQuestionsList();
}

function renderAdminChallengesList() {
    const list = document.getElementById('adminChallengesList');
    const badge = document.getElementById('challengesTotalBadge');
    if (!list) return;
    
    badge.textContent = challengesList.length;
    
    if (challengesList.length === 0) {
        list.innerHTML = `
            <div class="empty-state-box">
                <div class="empty-state-icon"><i data-lucide="trophy" size="26"></i></div>
                <h4 class="empty-state-title">Nenhum Desafio Cadastrado</h4>
                <p class="empty-state-desc">Crie um novo desafio oficial de capacitação ou baixe o modelo JSON para subir as perguntas da avaliação.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }
    
    list.innerHTML = challengesList.map(ch => {
        const isActive = ch.active === true;
        const qAttachedCount = Array.isArray(ch.questions) ? ch.questions.length : 0;
        
        return `
            <div class="challenge-card-item ${isActive ? 'is-current-active' : ''}">
                <div class="challenge-card-header">
                    <div style="min-width:0;">
                        <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.35rem;">
                            <strong style="font-size:1.05rem;color:var(--text-main);">${ch.title}</strong>
                            <span class="badge-pill ${isActive ? 'badge-active' : 'badge-inactive'}">
                                ${isActive ? '🟢 DESAFIO OFICIAL ATIVO' : 'Inativo'}
                            </span>
                            <span class="badge-pill badge-series-default">Nível: ${ch.series === 'all' ? 'Multidisciplinar' : ch.series}</span>
                            <span class="badge-pill" style="background:#fef3c7;color:#b45309;font-weight:700;">
                                <i data-lucide="paperclip" size="12"></i> ${qAttachedCount} Perguntas Anexadas
                            </span>
                        </div>
                        <p style="font-size:0.85rem;color:var(--text-muted);">${ch.description || 'Sem descrição.'}</p>
                    </div>
                    <div style="display:flex;gap:0.4rem;flex-shrink:0;flex-wrap:wrap;">
                        ${!isActive ? `
                            <button class="btn btn-success btn-sm" onclick="setActiveChallengeOfficial('${ch.id}')">
                                <i data-lucide="check-circle" size="14"></i> Ativar como Vigente
                            </button>
                        ` : ''}
                        <button class="btn btn-secondary btn-sm" onclick="exportChallengeQuestionsJSON('${ch.id}')" title="Baixar JSON das perguntas deste desafio">
                            <i data-lucide="download" size="14"></i> JSON
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="startEditChallenge('${ch.id}')">
                            <i data-lucide="edit" size="14"></i> Editar
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="removeChallenge('${ch.id}')">
                            <i data-lucide="trash-2" size="14"></i>
                        </button>
                    </div>
                </div>
                
                <div style="display:flex;gap:1.5rem;font-size:0.82rem;color:var(--text-muted);border-top:1px solid var(--border);padding-top:0.75rem;flex-wrap:wrap;">
                    <div>Nota de Corte Mínima: <strong style="color:var(--text-main);">${ch.minScore}%</strong></div>
                    <div>Perguntas na Avaliação: <strong style="color:var(--text-main);">${ch.questionCount || qAttachedCount}</strong></div>
                    <div>Carga Horária no Certificado: <strong style="color:var(--text-main);">${ch.workload || '8 Horas'}</strong></div>
                </div>
            </div>
        `;
    }).join('');
    lucide.createIcons();
}

/**
 * ESTADO DE PAGINAÇÃO DAS TABELAS ADMINISTRATIVAS
 */
const tablePaginationState = {
    usersPage: 1,
    usersLimit: 10,
    reportsPage: 1,
    reportsLimit: 10,
    questionsPage: 1,
    questionsLimit: 10
};

const tableSortState = {
    users: { field: 'name', dir: 'asc' },
    reports: { field: 'name', dir: 'asc' }
};

function updateTableSortIndicators(tableType) {
    const state = tableSortState[tableType];
    const fields = tableType === 'users' 
        ? ['name', 'email', 'role', 'createdAt'] 
        : ['name', 'hits', 'accuracy', 'status', 'score'];
    fields.forEach(f => {
        const icon = document.getElementById(`sortIcon_${tableType}_${f}`);
        const th = icon ? icon.closest('th') : null;
        if (icon) {
            if (state.field === f) {
                icon.textContent = state.dir === 'asc' ? '▲' : '▼';
                if (th) th.classList.add('active-sort');
            } else {
                icon.textContent = '⇅';
                if (th) th.classList.remove('active-sort');
            }
        }
    });
}

function toggleUsersSort(field) {
    if (tableSortState.users.field === field) {
        tableSortState.users.dir = tableSortState.users.dir === 'asc' ? 'desc' : 'asc';
    } else {
        tableSortState.users.field = field;
        tableSortState.users.dir = 'asc';
    }
    triggerHaptic('light');
    renderAdminUsersTable();
}

function toggleReportsSort(field) {
    if (tableSortState.reports.field === field) {
        tableSortState.reports.dir = tableSortState.reports.dir === 'asc' ? 'desc' : 'asc';
    } else {
        tableSortState.reports.field = field;
        tableSortState.reports.dir = 'asc';
    }
    triggerHaptic('light');
    renderAdminReportsTable();
}

function changeUsersPage(delta) {
    tablePaginationState.usersPage += delta;
    renderAdminUsersTable();
    triggerHaptic('light');
}

function changeReportsPage(delta) {
    tablePaginationState.reportsPage += delta;
    renderAdminReportsTable();
    triggerHaptic('light');
}

function renderAdminUsersTable() {
    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;
    const entries = Object.entries(usersMap);
    const searchInput = document.getElementById('searchUserInput');
    const term = searchInput ? searchInput.value.trim().toLowerCase() : '';

    const filtered = entries.filter(([uid, u]) => {
        const text = (((u.name || '') + ' ' + (u.email || '')).toLowerCase());
        return !term || text.includes(term);
    });

    filtered.sort((a, b) => {
        const uA = a[1] || {};
        const uB = b[1] || {};
        let valA, valB;
        if (tableSortState.users.field === 'email') {
            valA = (uA.email || '').toLowerCase();
            valB = (uB.email || '').toLowerCase();
        } else if (tableSortState.users.field === 'role') {
            valA = (uA.role || 'user').toLowerCase();
            valB = (uB.role || 'user').toLowerCase();
        } else if (tableSortState.users.field === 'createdAt') {
            valA = uA.createdAt || 0;
            valB = uB.createdAt || 0;
        } else {
            valA = (uA.name || uA.email || '').toLowerCase();
            valB = (uB.name || uB.email || '').toLowerCase();
        }
        if (valA < valB) return tableSortState.users.dir === 'asc' ? -1 : 1;
        if (valA > valB) return tableSortState.users.dir === 'asc' ? 1 : -1;
        return 0;
    });

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / tablePaginationState.usersLimit));
    if (tablePaginationState.usersPage > totalPages) tablePaginationState.usersPage = totalPages;
    if (tablePaginationState.usersPage < 1) tablePaginationState.usersPage = 1;

    const startIdx = (tablePaginationState.usersPage - 1) * tablePaginationState.usersLimit;
    const endIdx = Math.min(totalItems, startIdx + tablePaginationState.usersLimit);
    const paged = filtered.slice(startIdx, endIdx);

    const pageIndicator = document.getElementById('usersPageIndicator');
    if (pageIndicator) pageIndicator.textContent = `${tablePaginationState.usersPage} / ${totalPages}`;
    const info = document.getElementById('usersPaginationInfo');
    if (info) info.textContent = totalItems > 0 
        ? `Mostrando ${startIdx + 1}–${endIdx} de ${totalItems} colaboradores` 
        : `Nenhum colaborador encontrado`;
    const btnPrev = document.getElementById('btnPrevUsersPage');
    if (btnPrev) btnPrev.disabled = tablePaginationState.usersPage <= 1;
    const btnNext = document.getElementById('btnNextUsersPage');
    if (btnNext) btnNext.disabled = tablePaginationState.usersPage >= totalPages;

    updateTableSortIndicators('users');

    if (totalItems === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="padding:1.5rem 0.5rem;">
                    <div class="empty-state-box">
                        <div class="empty-state-icon"><i data-lucide="users" size="26"></i></div>
                        <h4 class="empty-state-title">Nenhum Colaborador Encontrado</h4>
                        <p class="empty-state-desc">${term ? 'Nenhum usuário corresponde aos termos da pesquisa.' : 'Ainda não há colaboradores cadastrados nesta base.'}</p>
                    </div>
                </td>
            </tr>
        `;
        lucide.createIcons();
        return;
    }

    tbody.innerHTML = paged.map(([uid, u]) => {
        const isAdmin = u.role === 'admin';
        const isSelf = currentUser && currentUser.uid === uid;
        const dateFormatted = u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : '-';
        return `
            <tr data-usersearch="${(((u.name || '') + ' ' + (u.email || '')).toLowerCase())}">
                <td data-label="Colaborador"><strong>${u.name || (u.email ? u.email.split('@')[0] : 'Sem nome')}</strong></td>
                <td data-label="E-mail">${u.email || '-'}</td>
                <td data-label="Cargo"><span class="badge-pill ${isAdmin ? 'badge-admin' : 'badge-user'}">${isAdmin ? 'Administrador' : 'Colaborador'}</span></td>
                <td data-label="Cadastrado em">${dateFormatted}</td>
                <td data-label="Ações" style="text-align:right;">
                    ${isSelf ? '<span style="font-size:0.75rem;color:var(--text-muted);">Sua Conta</span>' : `
                        <div style="display:inline-flex;gap:0.4rem;">
                            <button class="btn btn-secondary btn-sm" onclick="toggleUserRoleAdmin('${uid}', '${u.role || 'user'}')">
                                ${isAdmin ? 'Tornar Aluno' : 'Tornar Admin'}
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="resetUserProgress('${uid}')" title="Zerar Pontuação">
                                <i data-lucide="rotate-ccw" size="13"></i>
                            </button>
                        </div>
                    `}
                </td>
            </tr>
        `;
    }).join('');
    lucide.createIcons();
}

function filterUsersList() {
    tablePaginationState.usersPage = 1;
    renderAdminUsersTable();
}

function renderAdminReportsTable() {
    const tbody = document.getElementById('adminReportsTableBody');
    if (!tbody) return;
    const users = Object.entries(usersMap);

    users.sort((a, b) => {
        const uidA = a[0];
        const uidB = b[0];
        const uA = a[1] || {};
        const uB = b[1] || {};
        const sA = statsMap[uidA] || { hits: 0, total: 0 };
        const sB = statsMap[uidB] || { hits: 0, total: 0 };
        let valA, valB;
        if (tableSortState.reports.field === 'hits') {
            valA = sA.hits || 0;
            valB = sB.hits || 0;
        } else if (tableSortState.reports.field === 'accuracy') {
            valA = sA.total ? Math.round((sA.hits / sA.total) * 100) : 0;
            valB = sB.total ? Math.round((sB.hits / sB.total) * 100) : 0;
        } else {
            valA = (uA.name || uA.email || '').toLowerCase();
            valB = (uB.name || uB.email || '').toLowerCase();
        }
        if (valA < valB) return tableSortState.reports.dir === 'asc' ? -1 : 1;
        if (valA > valB) return tableSortState.reports.dir === 'asc' ? 1 : -1;
        return 0;
    });

    const totalItems = users.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / tablePaginationState.reportsLimit));
    if (tablePaginationState.reportsPage > totalPages) tablePaginationState.reportsPage = totalPages;
    if (tablePaginationState.reportsPage < 1) tablePaginationState.reportsPage = 1;

    const startIdx = (tablePaginationState.reportsPage - 1) * tablePaginationState.reportsLimit;
    const endIdx = Math.min(totalItems, startIdx + tablePaginationState.reportsLimit);
    const pagedUsers = users.slice(startIdx, endIdx);

    const pageIndicator = document.getElementById('reportsPageIndicator');
    if (pageIndicator) pageIndicator.textContent = `${tablePaginationState.reportsPage} / ${totalPages}`;
    const info = document.getElementById('reportsPaginationInfo');
    if (info) info.textContent = totalItems > 0 
        ? `Mostrando ${startIdx + 1}–${endIdx} de ${totalItems} colaboradores` 
        : `Nenhum relatório disponível`;
    const btnPrev = document.getElementById('btnPrevReportsPage');
    if (btnPrev) btnPrev.disabled = tablePaginationState.reportsPage <= 1;
    const btnNext = document.getElementById('btnNextReportsPage');
    if (btnNext) btnNext.disabled = tablePaginationState.reportsPage >= totalPages;

    updateTableSortIndicators('reports');

    if (totalItems === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding:1.5rem 0.5rem;">
                    <div class="empty-state-box">
                        <div class="empty-state-icon"><i data-lucide="bar-chart-3" size="26"></i></div>
                        <h4 class="empty-state-title">Nenhum Registro de Treinamento</h4>
                        <p class="empty-state-desc">Os colaboradores ainda não iniciaram desafios ou simulados para gerar relatórios.</p>
                    </div>
                </td>
            </tr>
        `;
        lucide.createIcons();
        return;
    }

    db.ref('challenge_results').once('value').then(resSnap => {
        const resultsMap = resSnap.val() || {};
        tbody.innerHTML = pagedUsers.map(([uid, u]) => {
            const s = statsMap[uid] || { hits: 0, total: 0, score: 0 };
            const accuracy = s.total === 0 ? 0 : Math.round((s.hits / s.total) * 100);
            const name = u.name || u.email;
            let challengeStatus = `<span class="badge-pill" style="background:#f1f5f9;color:#64748b;">Não Realizado</span>`;
            let challengeScoreTxt = `-`;
            let hasCert = false;
            let certObj = null;
            
            if (currentActiveChallenge && resultsMap[uid] && resultsMap[uid][currentActiveChallenge.id]) {
                const res = resultsMap[uid][currentActiveChallenge.id];
                challengeScoreTxt = `${res.hits}/${res.total} (${res.accuracy}%)`;
                if (res.isApproved) {
                    challengeStatus = `<span class="badge-pill badge-active">Aprovado</span>`;
                } else {
                    challengeStatus = `<span class="badge-pill" style="background:#fee2e2;color:#991b1b;">Reprovado</span>`;
                }
            }
            
            if (certificatesMap[uid]) {
                if (currentActiveChallenge && certificatesMap[uid][currentActiveChallenge.id]) {
                    hasCert = true;
                    certObj = certificatesMap[uid][currentActiveChallenge.id];
                } else {
                    const allCerts = Object.values(certificatesMap[uid]);
                    if (allCerts.length > 0) { hasCert = true; certObj = allCerts[0]; }
                }
            }
            
            const safeName = (certObj && certObj.userName ? certObj.userName : name).replace(/'/g, "\\'");
            const safeTitle = (certObj && certObj.challengeTitle ? certObj.challengeTitle : '').replace(/'/g, "\\'");
            
            return `
                <tr>
                    <td data-label="Colaborador"><strong>${name}</strong></td>
                    <td data-label="Acertos / Total">${s.hits} / ${s.total}</td>
                    <td data-label="Precisão">${accuracy}%</td>
                    <td data-label="Status Desafio">${challengeStatus}</td>
                    <td data-label="Nota do Desafio"><strong>${challengeScoreTxt}</strong></td>
                    <td data-label="Certificado" style="text-align:right;">
                        ${hasCert && certObj ? `
                            <button class="btn btn-secondary btn-sm" onclick="generateOfficialCertificatePDF('${safeName}', '${safeTitle}', '${certObj.workload || '8 Horas'}', ${certObj.accuracy || 0}, '${certObj.authCode || ''}', ${certObj.issuedAt || Date.now()})">
                                <i data-lucide="award" size="14"></i> Baixar PDF
                            </button>
                        ` : `<span style="font-size:0.75rem;color:var(--text-muted);">Sem Certificado</span>`}
                    </td>
                </tr>
            `;
        }).join('');
        lucide.createIcons();
    });
}

function renderLeaderboardTables() {
    const users = Object.entries(usersMap);
    const ranked = users.map(([uid, u]) => {
        const s = statsMap[uid] || { hits: 0, total: 0, score: 0 };
        const acc = s.total === 0 ? 0 : Math.round((s.hits / s.total) * 100);
        return {
            uid,
            name: u.name || (u.email ? u.email.split('@')[0] : 'Sem nome'),
            email: u.email || '',
            score: s.score || 0,
            hits: s.hits || 0,
            total: s.total || 0,
            accuracy: acc
        };
    }).sort((a, b) => b.score - a.score || b.hits - a.hits);
    
    const podiumEl = document.getElementById('adminPodiumContainer');
    if (podiumEl) {
        const p1 = ranked[0] || { name: '-', score: 0 };
        const p2 = ranked[1] || { name: '-', score: 0 };
        const p3 = ranked[2] || { name: '-', score: 0 };
        
        podiumEl.innerHTML = `
            <div class="podium-slot pos-2">
                <div class="podium-avatar">2</div>
                <strong style="font-size:0.85rem;margin-bottom:0.2rem;word-break:break-word;">${p2.name}</strong>
                <span style="font-size:0.75rem;color:var(--text-muted);">${p2.score} pts</span>
                <div class="podium-block">2º</div>
            </div>
            <div class="podium-slot pos-1">
                <div class="podium-avatar">1</div>
                <strong style="font-size:0.92rem;margin-bottom:0.2rem;word-break:break-word;">${p1.name}</strong>
                <span style="font-size:0.8rem;color:var(--text-muted);">${p1.score} pts</span>
                <div class="podium-block">1º</div>
            </div>
            <div class="podium-slot pos-3">
                <div class="podium-avatar">3</div>
                <strong style="font-size:0.85rem;margin-bottom:0.2rem;word-break:break-word;">${p3.name}</strong>
                <span style="font-size:0.75rem;color:var(--text-muted);">${p3.score} pts</span>
                <div class="podium-block">3º</div>
            </div>
        `;
    }
    
    const tbody = document.getElementById('adminLeaderboardTableBody');
    if (tbody) {
        tbody.innerHTML = ranked.map((r, i) => `
            <tr>
                <td><strong>#${i + 1}</strong></td>
                <td><strong>${r.name}</strong> <span style="font-size:0.75rem;color:var(--text-muted);">(${r.email})</span></td>
                <td><span style="color:var(--accent);font-weight:700;">${r.score} pts</span></td>
                <td>${r.hits} / ${r.total}</td>
                <td>${r.accuracy}%</td>
            </tr>
        `).join('');
    }
}

/**
 * CRUD - QUESTÕES
 */
function initOptionsBuilder(options = [], correctIdx = 0) {
    const container = document.getElementById('optionsBuilderContainer');
    container.innerHTML = '';
    const initialCount = options.length > 0 ? options.length : 4;
    for (let i = 0; i < initialCount; i++) {
        const text = options[i] || '';
        const isChecked = i === correctIdx;
        addOptionBuilderRow(isChecked, text);
    }
}

function addOptionBuilderRow(checked = false, textValue = '') {
    const container = document.getElementById('optionsBuilderContainer');
    const index = container.children.length;
    const div = document.createElement('div');
    div.className = 'option-builder-item';
    div.innerHTML = `
        <input type="text" class="opt-builder-input" placeholder="Opção ${index + 1}" value="${textValue.replace(/"/g, '&quot;')}">
        <label class="radio-tag">
            <input type="radio" name="builderCorrectRadio" value="${index}" ${checked ? 'checked' : ''}>
            <span>Correta</span>
        </label>
        ${index >= 2 ? `<button type="button" class="btn btn-secondary btn-sm" onclick="this.parentElement.remove()" style="padding:0.35rem 0.5rem;"><i data-lucide="trash-2" size="14"></i></button>` : ''}
    `;
    container.appendChild(div);
    lucide.createIcons();
}

async function saveOrUpdateQuestion() {
    const editId = document.getElementById('editingQuestionId').value;
    const title = document.getElementById('adminQTitle').value.trim();
    const series = document.getElementById('adminQSeries').value || 'Básico';
    const question = document.getElementById('adminQText').value.trim();
    const rows = document.querySelectorAll('#optionsBuilderContainer .option-builder-item');
    let correctAnswer = null;
    const options = [];
    rows.forEach(row => {
        const input = row.querySelector('.opt-builder-input');
        const radio = row.querySelector('input[type="radio"]');
        const val = input ? input.value.trim() : '';
        if (val) {
            options.push(val);
            if (radio && radio.checked) {
                correctAnswer = val;
            }
        }
    });
    
    if (!question) { showToast('Informe o enunciado da questão.', 'error'); return; }
    if (options.length < 2) { showToast('Insira no mínimo 2 alternativas de resposta.', 'error'); return; }
    if (!correctAnswer) { showToast('Selecione qual das opções é a correta.', 'error'); return; }
    
    const payload = {
        title: title || question.substring(0, 30),
        series: series,
        question: question,
        options: options,
        answer: correctAnswer,
        updatedAt: Date.now()
    };
    
    try {
        if (editId) {
            await db.ref('questions/' + editId).update(payload);
            showToast('Questão atualizada com sucesso!', 'success');
        } else {
            payload.createdAt = Date.now();
            await db.ref('questions').push(payload);
            showToast('Nova questão adicionada com sucesso!', 'success');
        }
        cancelEditingQuestion();
    } catch (err) { showToast('Erro ao gravar dados: ' + err.message, 'error'); }
}

function startEditQuestion(id) {
    const q = questionsBank.find(item => item.id === id);
    if (!q) return;
    document.getElementById('editingQuestionId').value = id;
    document.getElementById('adminQTitle').value = q.title || '';
    const seriesSelect = document.getElementById('adminQSeries');
    seriesSelect.value = (q.series === 'Intermediário' || q.series === 'Avançado') ? q.series : 'Básico';
    document.getElementById('adminQText').value = q.question || '';
    const correctIndex = q.options.indexOf(q.answer);
    initOptionsBuilder(q.options, correctIndex >= 0 ? correctIndex : 0);
    document.getElementById('questionFormTitle').innerHTML = `<i data-lucide="edit" size="20"></i> Editando Questão`;
    document.getElementById('btnSaveQuestionText').textContent = 'Atualizar Questão';
    document.getElementById('btnCancelEdit').style.display = 'inline-flex';
    document.querySelector('.admin-content-scroll').scrollTop = 0;
    lucide.createIcons();
}

function cancelEditingQuestion() {
    document.getElementById('editingQuestionId').value = '';
    document.getElementById('adminQTitle').value = '';
    document.getElementById('adminQSeries').value = 'Básico';
    document.getElementById('adminQText').value = '';
    document.getElementById('questionFormTitle').innerHTML = `<i data-lucide="plus-circle" size="20"></i> Cadastrar Nova Questão`;
    document.getElementById('btnSaveQuestionText').textContent = 'Salvar Questão';
    document.getElementById('btnCancelEdit').style.display = 'none';
    initOptionsBuilder();
    lucide.createIcons();
}

function removeQuestion(id) {
    showConfirmDialog('Excluir Pergunta', 'Deseja remover esta questão definitivamente?', async () => {
        try {
            await db.ref('questions/' + id).remove();
            showToast('Questão apagada com sucesso.', 'success');
        } catch (e) {
            showToast('Erro ao remover: ' + e.message, 'error');
        }
    });
}

function exportQuestionsJSON() {
    if (questionsBank.length === 0) { showToast('Nenhuma questão para exportar.', 'info'); return; }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(questionsBank, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `panasonic_questoes_${Date.now()}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('Backup JSON gerado com sucesso!', 'success');
}

function importQuestionsJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) { showToast('Formato JSON inválido. Deve ser uma lista de questões.', 'error'); return; }
            for (const item of imported) {
                const { id, ...cleanQ } = item;
                if (!['Básico', 'Intermediário', 'Avançado'].includes(cleanQ.series)) { cleanQ.series = 'Básico'; }
                await db.ref('questions').push({ ...cleanQ, importedAt: Date.now() });
            }
            showToast(`${imported.length} questões importadas com sucesso!`, 'success');
        } catch (err) { showToast('Falha na importação do arquivo: ' + err.message, 'error'); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

/**
 * CRUD - DESAFIOS
 */
function downloadChallengeJsonTemplate() {
    const template = [
        {
            "question": "Qual tecnologia exclusiva da Panasonic elimina odores e microrganismos no ar por meio de radicais OH?",
            "options": ["Nanoe™ X", "Turbo Cool", "Inverter Plus", "Eco Flow"],
            "answer": "Nanoe™ X",
            "series": "Básico"
        },
        {
            "question": "A principal vantagem da tecnologia Panasonic Inverter é:",
            "options": ["Ajustar a rotação de forma contínua proporcionando alta eficiência energética", "Desligar o compressor a cada ciclo de 5 minutos", "Aumentar o ruído sonoro para indicar refrigeração", "Funcionar exclusivamente em 110V"],
            "answer": "Ajustar a rotação de forma contínua proporcionando alta eficiência energética",
            "series": "Básico"
        }
    ];
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(template, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `modelo_perguntas_desafio_panasonic.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('Modelo JSON baixado! Preencha e clique em "Carregar Desafio (JSON)".', 'info');
}

function handleChallengeJsonUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const parsed = JSON.parse(e.target.result);
            if (!Array.isArray(parsed) || parsed.length === 0) {
                showToast('O arquivo JSON deve conter uma lista com pelo menos 1 pergunta.', 'error');
                return;
            }
            
            const cleanList = [];
            for (let i = 0; i < parsed.length; i++) {
                const item = parsed[i];
                if (!item.question || typeof item.question !== 'string' || item.question.trim().length === 0) {
                    showToast(`Pergunta ${i + 1} inválida: campo "question" é obrigatório.`, 'error');
                    return;
                }
                if (!Array.isArray(item.options) || item.options.length < 2) {
                    showToast(`Pergunta ${i + 1} inválida: campo "options" deve conter ao menos 2 alternativas.`, 'error');
                    return;
                }
                if (!item.answer || !item.options.includes(item.answer)) {
                    showToast(`Pergunta ${i + 1} inválida: a resposta "answer" deve ser idêntica a uma das opções em "options".`, 'error');
                    return;
                }
                
                cleanList.push({
                    question: item.question.trim(),
                    options: item.options.map(opt => String(opt).trim()),
                    answer: String(item.answer).trim(),
                    series: ['Básico', 'Intermediário', 'Avançado'].includes(item.series) ? item.series : 'Básico'
                });
            }
            
            challengeStagedQuestions = cleanList;
            document.getElementById('challengeQuestionCountInput').value = cleanList.length;
            renderStagedQuestions();
            showToast(`✅ ${cleanList.length} perguntas carregadas e anexadas ao desafio com sucesso!`, 'success');
        } catch (err) {
            showToast('Erro ao ler o arquivo JSON: formato incorreto ou sintaxe inválida.', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function removeStagedQuestion(index) {
    challengeStagedQuestions.splice(index, 1);
    document.getElementById('challengeQuestionCountInput').value = challengeStagedQuestions.length;
    renderStagedQuestions();
    showToast('Pergunta removida do desafio.', 'info');
}

function renderStagedQuestions() {
    const container = document.getElementById('stagedQuestionsContainer');
    if (!container) return;
    
    if (!challengeStagedQuestions || challengeStagedQuestions.length === 0) {
        container.innerHTML = `<p style="font-size:0.85rem;color:var(--text-muted);font-style:italic;">Nenhuma pergunta anexada a este desafio ainda. Clique em "Carregar Desafio (JSON)" ou baixe o modelo acima.</p>`;
        return;
    }
    
    container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.4rem;flex-wrap:wrap;gap:0.5rem;">
            <span style="font-size:0.82rem;font-weight:700;color:var(--accent);">
                Total de Questões Anexadas: ${challengeStagedQuestions.length}
            </span>
            <button class="btn btn-secondary btn-sm" type="button" onclick="challengeStagedQuestions=[];renderStagedQuestions();" style="color:var(--danger);">
                Limpar Todas
            </button>
        </div>
        ${challengeStagedQuestions.map((q, idx) => `
            <div class="attached-question-pill">
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${idx + 1}. ${q.question}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">
                        Gabarito: <strong style="color:var(--success);">${q.answer}</strong> • ${q.options.length} alternativas • Nível: ${q.series || 'Básico'}
                    </div>
                </div>
                <button class="btn btn-danger btn-sm" type="button" onclick="removeStagedQuestion(${idx})" style="padding:0.3rem 0.5rem;">
                    <i data-lucide="x" size="14"></i>
                </button>
            </div>
        `).join('')}
    `;
    lucide.createIcons();
}

async function saveOrUpdateChallenge() {
    const editId = document.getElementById('editingChallengeId').value;
    const title = document.getElementById('challengeTitleInput').value.trim();
    const series = document.getElementById('challengeSeriesSelect').value;
    const workload = document.getElementById('challengeWorkloadInput').value.trim() || '8 Horas';
    const minScore = parseInt(document.getElementById('challengeMinScoreInput').value) || 70;
    const questionCount = parseInt(document.getElementById('challengeQuestionCountInput').value) || (challengeStagedQuestions.length || 5);
    const description = document.getElementById('challengeDescriptionInput').value.trim();
    
    if (!title) {
        showToast('Informe o título do Desafio Oficial (constará no Certificado).', 'error');
        return;
    }
    
    if (!challengeStagedQuestions || challengeStagedQuestions.length === 0) {
        showToast('Atenção: Carregue o arquivo JSON com as perguntas deste desafio antes de salvar.', 'error');
        return;
    }
    
    const payload = {
        title,
        series,
        workload,
        minScore: Math.min(100, Math.max(10, minScore)),
        questionCount: Math.min(questionCount, challengeStagedQuestions.length),
        description: description || 'Desafio de Certificação & Treinamentos Panasonic.',
        questions: challengeStagedQuestions,
        updatedAt: Date.now()
    };
    
    try {
        if (editId) {
            await db.ref('challenges/' + editId).update(payload);
            showToast('Desafio e perguntas anexadas atualizados com sucesso!', 'success');
        } else {
            payload.active = challengesList.length === 0;
            payload.createdAt = Date.now();
            await db.ref('challenges').push(payload);
            showToast('Novo desafio oficial e suas perguntas foram salvos no Firebase!', 'success');
        }
        cancelChallengeEdit();
    } catch (err) {
        showToast('Erro ao salvar desafio: ' + err.message, 'error');
    }
}

function startEditChallenge(id) {
    const c = challengesList.find(item => item.id === id);
    if (!c) return;
    
    document.getElementById('editingChallengeId').value = id;
    document.getElementById('challengeTitleInput').value = c.title || '';
    document.getElementById('challengeSeriesSelect').value = c.series || 'all';
    document.getElementById('challengeWorkloadInput').value = c.workload || '8 Horas';
    document.getElementById('challengeMinScoreInput').value = c.minScore || 70;
    document.getElementById('challengeQuestionCountInput').value = c.questionCount || (c.questions?.length || 5);
    document.getElementById('challengeDescriptionInput').value = c.description || '';
    
    challengeStagedQuestions = Array.isArray(c.questions) ? JSON.parse(JSON.stringify(c.questions)) : [];
    renderStagedQuestions();
    
    document.getElementById('challengeFormTitle').innerHTML = `<i data-lucide="edit" size="20"></i> Editando Desafio & Perguntas`;
    document.getElementById('btnSaveChallengeText').textContent = 'Atualizar Desafio';
    document.getElementById('btnCancelChallengeEdit').style.display = 'inline-flex';
    
    document.querySelector('.admin-content-scroll').scrollTop = 0;
    lucide.createIcons();
}

function cancelChallengeEdit() {
    document.getElementById('editingChallengeId').value = '';
    document.getElementById('challengeTitleInput').value = '';
    document.getElementById('challengeSeriesSelect').value = 'all';
    document.getElementById('challengeWorkloadInput').value = '8 Horas';
    document.getElementById('challengeMinScoreInput').value = 70;
    document.getElementById('challengeQuestionCountInput').value = 5;
    document.getElementById('challengeDescriptionInput').value = '';
    challengeStagedQuestions = [];
    renderStagedQuestions();
    
    document.getElementById('challengeFormTitle').innerHTML = `<i data-lucide="plus-circle" size="20"></i> Criar Novo Desafio`;
    document.getElementById('btnSaveChallengeText').textContent = 'Salvar Desafio';
    document.getElementById('btnCancelChallengeEdit').style.display = 'none';
    lucide.createIcons();
}

async function setActiveChallengeOfficial(targetId) {
    showConfirmDialog('Ativar Desafio Oficial', 'Definir este desafio como o Desafio Oficial ativo para todos os participantes?', async () => {
        try {
            const updates = {};
            challengesList.forEach(ch => {
                updates['challenges/' + ch.id + '/active'] = (ch.id === targetId);
            });
            await db.ref().update(updates);
            showToast('Desafio ativado com sucesso como oficial!', 'success');
        } catch (e) {
            showToast('Erro ao ativar: ' + e.message, 'error');
        }
    });
}

function removeChallenge(id) {
    showConfirmDialog('Excluir Desafio', 'Tem certeza que deseja apagar este desafio e todas as suas perguntas vinculadas?', async () => {
        try {
            await db.ref('challenges/' + id).remove();
            showToast('Desafio removido com sucesso.', 'success');
        } catch (e) {
            showToast('Erro ao remover: ' + e.message, 'error');
        }
    });
}

function exportChallengeQuestionsJSON(id) {
    const c = challengesList.find(item => item.id === id);
    if (!c || !Array.isArray(c.questions) || c.questions.length === 0) {
        showToast('Este desafio não possui perguntas anexadas para exportar.', 'info');
        return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(c.questions, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `perguntas_desafio_${c.title.replace(/\s+/g, '_').toLowerCase()}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('JSON de perguntas do desafio exportado!', 'success');
}

/**
 * USUÁRIOS
 */
function toggleUserRoleAdmin(uid, currentRole) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    showConfirmDialog('Alterar Papel de Acesso', `Deseja alterar a permissão deste colaborador para ${newRole}?`, async () => {
        try {
            await db.ref('users/' + uid + '/role').set(newRole);
            showToast('Permissão atualizada.', 'success');
        } catch (e) { showToast('Erro: ' + e.message, 'error'); }
    });
}

function resetUserProgress(uid) {
    showConfirmDialog('Zerar Progresso', 'Deseja reiniciar a pontuação e acertos deste aluno?', async () => {
        try {
            await db.ref('stats/' + uid).set({ hits: 0, total: 0, score: 0 });
            await db.ref(`challenge_results/${uid}`).remove();
            showToast('Progresso zerado com sucesso.', 'success');
        } catch (e) { showToast('Erro ao zerar: ' + e.message, 'error'); }
    });
}

/**
 * RELATÓRIOS
 */
function exportFullTrainingPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.setTextColor(11, 78, 162);
    doc.text('Relatório Consolidado de Treinamento', 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);
    doc.text(`Desafio Oficial Vigente: ${currentActiveChallenge ? currentActiveChallenge.title : 'Nenhum'}`, 14, 34, { maxWidth: 180 });
    
    let y = 46;
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Desempenho Geral por Colaborador:', 14, y);
    y += 8;
    
    const entries = Object.entries(usersMap);
    entries.forEach(([uid, u]) => {
        if (y > 275) { doc.addPage(); y = 20; }
        const s = statsMap[uid] || { hits: 0, total: 0, score: 0 };
        const accuracy = s.total === 0 ? 0 : Math.round((s.hits / s.total) * 100);
        const name = u.name || u.email;
        doc.setFontSize(9);
        doc.text(`• ${name} (${u.email}) | Precisão: ${accuracy}% (${s.hits}/${s.total}) | Score: ${s.score} pts`, 16, y);
        y += 7;
    });
    
    doc.save(`panasonic_relatorio_geral_${Date.now()}.pdf`);
    showToast('Relatório geral exportado em PDF com sucesso!', 'success');
}

/**
 * NOTIFICAÇÕES
 */
async function submitNotificationBroadcast() {
    const editId = document.getElementById('editingNotificationId').value;
    const title = document.getElementById('broadcastTitle').value.trim();
    const series = document.getElementById('broadcastSeries').value;
    const body = document.getElementById('broadcastBody').value.trim();
    const imageUrl = document.getElementById('broadcastImageUrl').value.trim();
    
    if (!title || !body) { showToast('Preencha título e mensagem.', 'error'); return; }
    
    if (imageUrl && !/^https?:\/\/.+\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(imageUrl)) {
        showToast('URL da imagem inválida. Use um link direto para .png, .jpg, .jpeg, .gif, .webp ou .svg', 'error');
        return;
    }
    
    const payload = {
        title,
        body,
        series: series || null,
        imageUrl: imageUrl || null
    };
    
    try {
        if (editId) {
            // ATUALIZAR notificação existente
            payload.updatedAt = Date.now();
            await db.ref('notifications/' + editId).update(payload);
            showToast('Comunicado atualizado com sucesso!', 'success');
            cancelBroadcastEdit();
        } else {
            // CRIAR nova notificação
            payload.timestamp = Date.now();
            await db.ref('notifications').push(payload);
            showToast('Comunicado enviado aos colaboradores com sucesso!', 'success');
            resetBroadcastForm();
        }
    } catch (e) {
        showToast('Erro ao salvar comunicado: ' + e.message, 'error');
    }
}

function resetBroadcastForm() {
    document.getElementById('editingNotificationId').value = '';
    document.getElementById('broadcastTitle').value = '';
    document.getElementById('broadcastSeries').value = '';
    document.getElementById('broadcastBody').value = '';
    document.getElementById('broadcastImageUrl').value = '';
    clearBroadcastImage();
    document.getElementById('btnSubmitBroadcastText').textContent = 'Disparar Comunicado';
    document.getElementById('btnCancelBroadcastEdit').style.display = 'none';
}

function cancelBroadcastEdit() {
    resetBroadcastForm();
    showToast('Edição cancelada.', 'info');
    lucide.createIcons();
}

function startEditNotification(id) {
    const notif = notificationsList.find(n => n.id === id);
    if (!notif) { showToast('Comunicado não encontrado.', 'error'); return; }
    
    document.getElementById('editingNotificationId').value = id;
    document.getElementById('broadcastTitle').value = notif.title || '';
    document.getElementById('broadcastSeries').value = notif.series || '';
    document.getElementById('broadcastBody').value = notif.body || '';
    document.getElementById('broadcastImageUrl').value = notif.imageUrl || '';
    
    if (notif.imageUrl) previewBroadcastImage();
    
    document.getElementById('btnSubmitBroadcastText').textContent = 'Atualizar Comunicado';
    document.getElementById('btnCancelBroadcastEdit').style.display = 'inline-flex';
    
    // Rola para o topo e foca no título
    document.querySelector('.admin-content-scroll').scrollTop = 0;
    setTimeout(() => document.getElementById('broadcastTitle').focus(), 100);
    
    showToast('Editando comunicado. Altere e clique em Atualizar.', 'info');
    lucide.createIcons();
}

async function removeNotification(id) {
    showConfirmDialog(
        'Excluir Comunicado',
        'Tem certeza que deseja apagar este comunicado? Ele desaparecerá para todos os colaboradores.',
        async () => {
            try {
                await db.ref('notifications/' + id).remove();
                showToast('Comunicado excluído com sucesso.', 'success');
            } catch (e) {
                showToast('Erro ao excluir: ' + e.message, 'error');
            }
        },
        'Excluir',
        'Cancelar'
    );
}

  function previewBroadcastImage() {
    const url = document.getElementById('broadcastImageUrl').value.trim();
    const preview = document.getElementById('broadcastImagePreview');
    const img = document.getElementById('broadcastImagePreviewImg');
    
    if (url && /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url)) {
        img.src = url;
        img.onerror = () => {
            preview.style.display = 'none';
            showToast('Não foi possível carregar a imagem. Verifique se o link está público.', 'warning');
        };
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
}

function clearBroadcastImage() {
    document.getElementById('broadcastImageUrl').value = '';
    document.getElementById('broadcastImagePreviewImg').src = '';
    document.getElementById('broadcastImagePreview').style.display = 'none';
    lucide.createIcons();
}

function renderBroadcastHistory() {
    const list = document.getElementById('broadcastHistoryList');
    if (!list) return;
    
    if (notificationsList.length === 0) {
        list.innerHTML = `
            <div class="empty-state-box" style="padding:2rem 1rem;">
                <div class="empty-state-icon"><i data-lucide="bell-off" size="24"></i></div>
                <h4 class="empty-state-title" style="font-size:0.95rem;">Nenhum Comunicado Enviado</h4>
                <p class="empty-state-desc" style="font-size:0.8rem;">Utilize o formulário ao lado para disparar avisos e comunicados importantes para a equipe.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }
    
    list.innerHTML = [...notificationsList].sort((a, b) => (b.updatedAt || b.timestamp) - (a.updatedAt || a.timestamp)).map(n => {
        const badgeClass = n.series ? getSeriesBadgeClass(n.series) : 'badge-series-default';
        const isEditing = document.getElementById('editingNotificationId').value === n.id;
        return `
            <div style="background:var(--panasonic-gray-50);border:1px solid ${isEditing ? 'var(--accent)' : 'var(--border)'};border-left:4px solid var(--accent);border-radius:0.75rem;padding:0.85rem 1rem;${isEditing ? 'box-shadow: 0 0 0 3px rgba(11, 78, 162, 0.15);' : ''}">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.25rem;gap:0.5rem;flex-wrap:wrap;">
                    <strong style="font-size:0.95rem;color:var(--text-main);">${n.title}</strong>
                    <span style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">
                        ${new Date(n.timestamp).toLocaleDateString('pt-BR')}
                        ${n.updatedAt ? '<span style="color:var(--accent);"> • editado</span>' : ''}
                    </span>
                </div>
                <div style="display:flex;gap:0.75rem;align-items:flex-start;margin-bottom:0.5rem;">
                    ${n.imageUrl ? `
                        <img src="${n.imageUrl}" alt="" 
                             style="width:64px;height:64px;object-fit:cover;border-radius:0.5rem;flex-shrink:0;border:1px solid var(--border);"
                             onerror="this.style.display='none'">
                    ` : ''}
                    <p style="font-size:0.88rem;color:var(--text-muted);line-height:1.4;margin:0;flex:1;">${n.body}</p>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                    <span class="badge-pill ${badgeClass}">
                        Público: ${n.series ? n.series : 'Todos'}
                    </span>
                    <div style="display:flex;gap:0.4rem;">
                        <button class="btn btn-secondary btn-sm" onclick="startEditNotification('${n.id}')" title="Editar">
                            <i data-lucide="edit" size="13"></i> Editar
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="removeNotification('${n.id}')" title="Excluir">
                            <i data-lucide="trash-2" size="13"></i> Excluir
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    lucide.createIcons();
}

/**
 * OBSERVER DE AUTENTICAÇÃO
 */
auth.onAuthStateChanged(async (user) => {
    console.log('[Auth] Observer disparou. User:', user ? user.uid : 'null');
    
    if (!user) {
        currentUser = null;
        currentProfile = { role: 'user', name: '', email: '' };
        showScreen('screenLogin');
        return;
    }

    currentUser = user;

    // Preenche com defaults do Auth imediatamente — a tela abre mesmo sem banco
    currentProfile = {
        name: user.displayName || (user.email ? user.email.split('@')[0] : 'Colaborador'),
        email: user.email || '',
        role: 'user'
    };

    // Conecta listeners e MOSTRA A TELA ANTES de tentar ler o banco
    try { setupRealtimeData(); } catch (e) { console.warn('[Realtime] Falha:', e); }
    
    // Atualiza UI com defaults
    renderStudentUI();
    showScreen('screenApp');
    console.log('[Auth] screenApp deve estar visível agora');

    // Depois, em background, tenta enriquecer com dados do banco
    try {
        const snap = await db.ref('users/' + user.uid).once('value');
        const data = snap.val() || {};
        
        if (data.name) currentProfile.name = data.name;
        if (data.role) currentProfile.role = data.role;

        // Se o nó não existe, cria (usuário novo no projeto novo)
        if (!data.name) {
            await db.ref('users/' + user.uid).set({
                name: currentProfile.name,
                email: currentProfile.email,
                role: currentProfile.role,
                createdAt: Date.now(),
                lastLogin: Date.now()
            });
        } else {
            db.ref('users/' + user.uid + '/lastLogin').set(Date.now()).catch(() => {});
        }

        renderStudentUI(); // Atualiza UI com dados completos
    } catch (err) {
        console.warn('[Auth] Não foi possível ler/escrever dados do usuário:', err);
    }

    initStudentChatWelcome();
});

function initStudentChatWelcome() {
    const feed = document.getElementById('chatFeed');
    if (!feed || feed.children.length > 0) return;
    setTimeout(() => {
        if (feed.children.length === 0) {
            appendChatMessage(`👋 Olá, **${currentProfile.name}**! Seja bem-vindo(a) à plataforma de Treinamentos.\n\nEscolha uma opção abaixo para começar seus estudos livres ou iniciar sua avaliação:`, 'bot', ['/desafio', '/pergunta', '/ajuda']);
        }
    }, 300);
}

// Função auxiliar para não repetir código
function renderStudentUI() {
    document.getElementById('studentWelcomeText').textContent = ` ${currentProfile.name}`;
    document.getElementById('userSidebarName').textContent = currentProfile.name;
    document.getElementById('userSidebarRole').textContent =
        currentProfile.role === 'admin' ? 'Administrador' : 'Colaborador';
    document.getElementById('adminCurrentUserName').textContent = currentProfile.name;

    const initials = currentProfile.name
        .split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    document.getElementById('userSidebarInitials').textContent = initials || 'PN';

    document.getElementById('btnEnterAdmin').style.display =
        currentProfile.role === 'admin' ? 'inline-flex' : 'none';
}

/**
 * SISTEMA DE TEMA ESCURO / CLARO (DARK MODE)
 */
function initThemeMode() {
    const savedTheme = localStorage.getItem('panasonic_app_theme') || 'light';
    applyThemeMode(savedTheme);
}

function applyThemeMode(theme) {
    const isDark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('panasonic_app_theme', isDark ? 'dark' : 'light');

    // Atualiza a cor da barra de status do navegador no celular
    const metaTheme = document.getElementById('metaThemeColor');
    if (metaTheme) {
        metaTheme.setAttribute('content', isDark ? '#0B1629' : '#0B4EA2');
    }

    // Atualiza ícones dos botões de alternância
    document.querySelectorAll('.theme-icon-slot').forEach(iconEl => {
        iconEl.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    });
    lucide.createIcons();

    // Sincroniza cores dos gráficos se o dashboard admin estiver visível
    if (typeof initOrUpdateAdminCharts === 'function' && document.getElementById('secDashboard')?.classList.contains('active')) {
        setTimeout(initOrUpdateAdminCharts, 60);
    }
}

function toggleThemeMode() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyThemeMode(nextTheme);
    showToast(nextTheme === 'dark' ? '🌙 Modo Escuro ativado.' : '☀️ Modo Claro ativado.', 'info', 2000);
}

/**
 * SISTEMA PWA (PROGRESSIVE WEB APP - INSTALAÇÃO E SERVICE WORKER)
 */
let deferredPwaPrompt = null;

function initPwaSystem() {
    // 1. Registro do Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('[PWA] Service Worker registrado com sucesso:', reg.scope))
                .catch(err => console.warn('[PWA] Falha ao registrar Service Worker:', err));
        });
    }

    // 2. Captura do evento de instalação
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPwaPrompt = e;
        
        // Exibe botão de instalação na topbar
        const installBtn = document.getElementById('btnPwaInstall');
        if (installBtn) installBtn.style.display = 'inline-flex';

        // Se ainda não dispensou o banner nesta sessão, exibe o banner flutuante
        const bannerDismissed = sessionStorage.getItem('pwa_banner_dismissed');
        if (!bannerDismissed) {
            const banner = document.getElementById('pwaInstallBanner');
            if (banner) banner.style.display = 'flex';
        }
        lucide.createIcons();
    });

    // 3. Notifica após instalado com sucesso
    window.addEventListener('appinstalled', () => {
        console.log('[PWA] Aplicativo instalado com sucesso pelo usuário.');
        const installBtn = document.getElementById('btnPwaInstall');
        if (installBtn) installBtn.style.display = 'none';
        dismissPwaBanner();
        showToast('🎉 Aplicativo Treinamentos instalado com sucesso!', 'success');
        deferredPwaPrompt = null;
    });
}

function triggerPwaInstall() {
    if (deferredPwaPrompt) {
        deferredPwaPrompt.prompt();
        deferredPwaPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('[PWA] Usuário aceitou a instalação.');
            } else {
                console.log('[PWA] Usuário recusou a instalação.');
            }
            deferredPwaPrompt = null;
            dismissPwaBanner();
        });
    } else {
        // Se já instalado ou em iOS Safari
        const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
        if (isIos) {
            showToast('Para instalar no iPhone/iPad: toque em Compartilhar e selecione "Adicionar à Tela de Início".', 'info', 6000);
        } else {
            showToast('O aplicativo já está instalado ou seu navegador não suporta instalação direta.', 'info', 3000);
        }
    }
}

function dismissPwaBanner() {
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.style.display = 'none';
    sessionStorage.setItem('pwa_banner_dismissed', 'true');
}

/**
 * INICIALIZAÇÃO
 */
document.addEventListener('DOMContentLoaded', () => {
    loadingManager.init();
    initThemeMode();
    initPwaSystem();
    
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === '/') {
            e.preventDefault();
            handleStudentCommand('/ajuda');
        }
        if (e.key === 'Escape') closeAllModals();
    });
    
    window.addEventListener('online', () => showToast('Conexão restaurada!', 'success'));
    window.addEventListener('offline', () => showToast('Sem conexão com a internet.', 'warning'));
});

// Inicialização imediata de tema e componentes
initThemeMode();
initOptionsBuilder();
lucide.createIcons();

/**
 * PLANO DE ESTUDO PERSONALIZADO
 */
let customStudyPlan = {
    level: 'all',
    count: 5,
    mode: 'livre',
    timePerQuestion: 30,
    pool: [],
    currentIndex: 0,
    hits: 0,
    isRunning: false,
    timerInterval: null,
    timerBarEl: null
};

function getAvailableQuestionsForLevel(level) {
    let pool = questionsBank.slice();
    if (currentActiveChallenge && Array.isArray(currentActiveChallenge.questions) && currentActiveChallenge.questions.length > 0) {
        const challengeQs = currentActiveChallenge.questions;
        challengeQs.forEach(cq => {
            if (!pool.find(q => q.question === cq.question)) pool.push(cq);
        });
    }
    if (level !== 'all') {
        const normTarget = level.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        pool = pool.filter(q => {
            const s = getQuestionSeries(q).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return s === normTarget;
        });
    }
    return pool;
}

function openStudyPlanModal() {
    updateStudyPlanStats();
    document.getElementById('studyPlanOverlay').classList.add('active');
    lucide.createIcons();
}

function closeStudyPlanModal() {
    document.getElementById('studyPlanOverlay').classList.remove('active');
}

function handleStudyPlanOverlayClick(e) {
    if (e.target === document.getElementById('studyPlanOverlay')) closeStudyPlanModal();
}

function updateStudyPlanStats() {
    const all = getAvailableQuestionsForLevel('all');
    const bas = getAvailableQuestionsForLevel('Basico');
    const int = getAvailableQuestionsForLevel('Intermediario');
    const adv = getAvailableQuestionsForLevel('Avancado');

    document.getElementById('spBankTotal').textContent = all.length;
    document.getElementById('spBankBasico').textContent = bas.length;
    document.getElementById('spBankInter').textContent = int.length;
    document.getElementById('spBankAdv').textContent = adv.length;

    // Atualiza o display atual
    updateQCountDisplay();
}

function selectStudyLevel(level) {
    customStudyPlan.level = level;

    // Reseta chips
    document.getElementById('spChipAll').className = 'sp-chip';
    document.getElementById('spChipBas').className = 'sp-chip';
    document.getElementById('spChipInt').className = 'sp-chip';
    document.getElementById('spChipAdv').className = 'sp-chip';

    if (level === 'all')             document.getElementById('spChipAll').className = 'sp-chip active-all';
    else if (level === 'Basico' || level === 'Básico') document.getElementById('spChipBas').className = 'sp-chip active-bas';
    else if (level === 'Intermediario' || level === 'Intermediário') document.getElementById('spChipInt').className = 'sp-chip active-int';
    else if (level === 'Avancado' || level === 'Avançado') document.getElementById('spChipAdv').className = 'sp-chip active-adv';

    updateQCountDisplay();
}

function updateQCountDisplay() {
    const available = getAvailableQuestionsForLevel(customStudyPlan.level);
    const max = available.length;
    const slider = document.getElementById('spQtySlider');
    const display = document.getElementById('spQtyDisplay');
    const hint = document.getElementById('spQtyHint');
    const warning = document.getElementById('spLevelWarning');
    const startBtn = document.getElementById('spStartBtn');
    const minusBtn = document.getElementById('spQtyMinus');
    const plusBtn = document.getElementById('spQtyPlus');

    if (max === 0) {
        warning.style.display = 'block';
        hint.className = 'sp-qty-hint warn';
        hint.textContent = 'Nenhuma questao disponivel neste nivel.';
        startBtn.disabled = true;
        slider.disabled = true;
        minusBtn.disabled = true;
        plusBtn.disabled = true;
        slider.value = 0;
        display.textContent = '0';
        customStudyPlan.count = 0;
        updateSummaryCard();
        return;
    }

    warning.style.display = 'none';
    startBtn.disabled = false;
    slider.disabled = false;
    slider.max = max;

    // Clamp current count
    let current = parseInt(slider.value) || 5;
    current = Math.max(1, Math.min(current, max));
    slider.value = current;
    customStudyPlan.count = current;
    display.textContent = current;

    hint.className = 'sp-qty-hint';
    hint.textContent = `${current} de ${max} pergunta${max !== 1 ? 's' : ''} disponivel${max !== 1 ? 'is' : ''}`;

    minusBtn.disabled = current <= 1;
    plusBtn.disabled = current >= max;

    updateSummaryCard();
}

function onSliderChange(val) {
    const available = getAvailableQuestionsForLevel(customStudyPlan.level);
    const max = available.length;
    let v = Math.max(1, Math.min(parseInt(val), max));
    customStudyPlan.count = v;
    document.getElementById('spQtyDisplay').textContent = v;
    document.getElementById('spQtySlider').value = v;
    document.getElementById('spQtyHint').textContent = `${v} de ${max} pergunta${max !== 1 ? 's' : ''} disponivel${max !== 1 ? 'is' : ''}`;
    document.getElementById('spQtyMinus').disabled = v <= 1;
    document.getElementById('spQtyPlus').disabled = v >= max;
    updateSummaryCard();
}

function changeStudyQty(delta) {
    const slider = document.getElementById('spQtySlider');
    const newVal = parseInt(slider.value) + delta;
    slider.value = newVal;
    onSliderChange(newVal);
}

function selectStudyMode(mode) {
    customStudyPlan.mode = mode;
    ['livre', 'treino', 'cronometrado'].forEach(m => {
        const card = document.getElementById(`spModeCard-${m}`);
        if (card) card.classList.remove('selected');
    });
    const sel = document.getElementById(`spModeCard-${mode}`);
    if (sel) sel.classList.add('selected');

    const timeOpts = document.getElementById('spTimeOptions');
    timeOpts.style.display = mode === 'cronometrado' ? 'flex' : 'none';
    document.getElementById('spSumTimeRow').style.display = mode === 'cronometrado' ? 'flex' : 'none';

    updateSummaryCard();
    lucide.createIcons();
}

function selectStudyTime(seconds) {
    customStudyPlan.timePerQuestion = seconds;
    document.querySelectorAll('.sp-time-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('spSumTime').textContent = `${seconds}s`;
}

function updateSummaryCard() {
    const levelLabels = { all: 'Todas as series', Basico: 'Basico', Básico: 'Basico', Intermediario: 'Intermediario', Intermediário: 'Intermediario', Avancado: 'Avancado', Avançado: 'Avancado' };
    const modeLabels = { livre: 'Estudo Livre', treino: 'Modo Treino', cronometrado: 'Modo Cronometrado' };
    document.getElementById('spSumLevel').textContent = levelLabels[customStudyPlan.level] || 'Todas as series';
    document.getElementById('spSumCount').textContent = `${customStudyPlan.count} pergunta${customStudyPlan.count !== 1 ? 's' : ''}`;
    document.getElementById('spSumMode').textContent = modeLabels[customStudyPlan.mode] || 'Estudo Livre';
    document.getElementById('spSumTime').textContent = `${customStudyPlan.timePerQuestion}s`;
}

function startCustomStudyPlan() {
    const available = getAvailableQuestionsForLevel(customStudyPlan.level);
    if (available.length === 0) {
        showToast('Nenhuma questao disponivel neste nivel.', 'error');
        return;
    }

    const count = Math.min(customStudyPlan.count, available.length);
    const pool = shuffleArray(available).slice(0, count);

    customStudyPlan.pool = pool;
    customStudyPlan.currentIndex = 0;
    customStudyPlan.hits = 0;
    customStudyPlan.isRunning = true;

    closeStudyPlanModal();

    // Para qualquer desafio oficial em andamento
    isChallengeRunning = false;
    clearQuestionTimer();

    const levelLabels = { all: 'Todas as Series', Basico: 'Basico', Básico: 'Basico', Intermediario: 'Intermediario', Intermediário: 'Intermediario', Avancado: 'Avancado', Avançado: 'Avancado' };
    const modeLabels = { livre: 'Estudo Livre', treino: 'Modo Treino', cronometrado: 'Modo Cronometrado' };
    const levelStr = levelLabels[customStudyPlan.level] || 'Todas';
    const modeStr = modeLabels[customStudyPlan.mode];
    const timeStr = customStudyPlan.mode === 'cronometrado' ? ` | ⏱️ ${customStudyPlan.timePerQuestion}s/questao` : '';

    appendChatMessage(
        `📚 **Plano de Estudo Iniciado!**\n\n🎯 **Nivel:** ${levelStr}\n📝 **Questoes:** ${count}\n⚡ **Modo:** ${modeStr}${timeStr}\n\nVamos comecar! Primeira questao:`,
        'bot'
    );

    updateFabProgress();
    setTimeout(deliverCustomStudyQuestion, 900);
}

function deliverCustomStudyQuestion() {
    if (!customStudyPlan.isRunning) return;
    if (customStudyPlan.currentIndex >= customStudyPlan.pool.length) {
        finishCustomStudyPlan();
        return;
    }

    clearQuestionTimer();

    const q = customStudyPlan.pool[customStudyPlan.currentIndex];
    activeQuestion = q;
    waitingAnswer = true;

    const idx = customStudyPlan.currentIndex + 1;
    const total = customStudyPlan.pool.length;
    const modeLabel = customStudyPlan.mode === 'livre' ? 'Livre' : customStudyPlan.mode === 'treino' ? 'Treino' : 'Cronometrado';

    appendChatMessage(
        `**Plano Personalizado [${modeLabel}] — Questao ${idx}/${total}:**\n${q.question}`,
        'bot',
        q.options
    );

    // Inicia timer se modo cronometrado
    if (customStudyPlan.mode === 'cronometrado') {
        startQuestionTimer(customStudyPlan.timePerQuestion);
    }

    updateFabProgress();
}

function evaluateCustomStudyAnswer(isCorrect) {
    if (!customStudyPlan.isRunning) return;
    clearQuestionTimer();

    customStudyPlan.currentIndex += 1;
    if (isCorrect) customStudyPlan.hits += 1;

    const remaining = customStudyPlan.pool.length - customStudyPlan.currentIndex;

    if (customStudyPlan.mode === 'livre') {
        if (isCorrect) {
            if (remaining > 0) {
                appendChatMessage(`✅ **Correto!** Proxima questao em instantes...`);
            }
        } else {
            if (remaining > 0) {
                appendChatMessage(`❌ **Incorreto.** A resposta correta e: **${activeQuestion.answer}**`);
            }
        }
    } else if (customStudyPlan.mode === 'treino') {
        const acc = Math.round((customStudyPlan.hits / customStudyPlan.currentIndex) * 100);
        if (isCorrect) {
            const msg = remaining > 0
                ? `✅ **Correto! +10 pontos**\n\n📊 Sessao atual: ${customStudyPlan.hits}/${customStudyPlan.currentIndex} acertos (${acc}%) | ${remaining} questao(oes) restante(s)`
                : `✅ **Correto! +10 pontos**`;
            appendChatMessage(msg);
        } else {
            const msg = `❌ **Incorreto.**\nResposta certa: **${activeQuestion.answer}**\n📊 Sessao atual: ${customStudyPlan.hits}/${customStudyPlan.currentIndex} acertos (${acc}%) | ${remaining} questao(oes) restante(s)`;
            appendChatMessage(msg);
        }
    } else {
        // cronometrado - feedback rapido
        if (isCorrect) {
            appendChatMessage(`✅ **Correto!** ⏱️ Respondido no tempo!`);
        } else {
            appendChatMessage(`❌ **Incorreto.** Resposta: **${activeQuestion.answer}**`);
        }
    }

    if (customStudyPlan.currentIndex >= customStudyPlan.pool.length) {
        setTimeout(finishCustomStudyPlan, 1200);
    } else {
        setTimeout(deliverCustomStudyQuestion, 1200);
    }
}

function finishCustomStudyPlan() {
    customStudyPlan.isRunning = false;
    waitingAnswer = false;
    clearQuestionTimer();

    const total = customStudyPlan.pool.length;
    const hits = customStudyPlan.hits;
    const acc = total > 0 ? Math.round((hits / total) * 100) : 0;
    const modeLabels = { livre: 'Estudo Livre', treino: 'Modo Treino', cronometrado: 'Modo Cronometrado' };

    let emoji = acc >= 80 ? '🏆' : acc >= 60 ? '🎯' : '💪';
    let feedback = acc >= 80 ? 'Excelente desempenho!' : acc >= 60 ? 'Bom resultado! Continue praticando.' : 'Continue praticando, voce vai melhorar!';

    if (hits === total) {
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
        if (customStudyPlan.mode === 'cronometrado' && total >= 3) {
            ensureStudentStatsDefaults(studentStats);
            studentStats.timedPerfectCount = (studentStats.timedPerfectCount || 0) + 1;
            checkAndAwardBadges();
        }
    }

    appendChatMessage(
        `${emoji} **Plano de Estudo Concluido!**\n\n` +
        `📊 **Resultado da Sessao:**\n` +
        `• Questoes respondidas: **${total}**\n` +
        `• Acertos: **${hits} de ${total} (${acc}%)**\n` +
        `• Modo: **${modeLabels[customStudyPlan.mode]}**\n\n` +
        `💬 ${feedback}\n\nO que deseja fazer agora?`,
        'bot',
        ['+ Novo Plano de Estudo', '/desafio', '/pergunta', '/ajuda']
    );

    // Reseta o FAB
    document.getElementById('fabProgressBadge').style.display = 'none';
}

function updateFabProgress() {
    const badge = document.getElementById('fabProgressBadge');
    if (!badge) return;
    if (customStudyPlan.isRunning) {
        const remaining = customStudyPlan.pool.length - customStudyPlan.currentIndex;
        badge.style.display = 'flex';
        badge.textContent = remaining;
    } else {
        badge.style.display = 'none';
    }
}

function startQuestionTimer(seconds) {
    clearQuestionTimer();

    // Injeta barra de timer no ultimo chat-bubble
    const feed = document.getElementById('chatFeed');
    const bubbles = feed.querySelectorAll('.chat-bubble');
    const lastBubble = bubbles[bubbles.length - 1];
    if (!lastBubble) return;

    const bar = document.createElement('div');
    bar.className = 'chat-timer-bar';
    bar.id = 'activeTimerBar';
    lastBubble.prepend(bar);
    customStudyPlan.timerBarEl = bar;

    let remaining = seconds;
    const step = 100 / seconds;
    bar.style.width = '100%';
    bar.style.background = 'var(--panasonic-blue)';

    customStudyPlan.timerInterval = setInterval(() => {
        remaining -= 1;
        const pct = Math.max(0, (remaining / seconds) * 100);
        bar.style.width = pct + '%';

        if (remaining <= 5 && remaining > 2) {
            bar.style.background = '#F79009';
        } else if (remaining <= 2) {
            bar.style.background = '#F04438';
        }

        if (remaining <= 0) {
            clearQuestionTimer();
            if (waitingAnswer && customStudyPlan.isRunning) {
                // Desabilita opcoes
                const grids = feed.querySelectorAll('.options-grid');
                const lastGrid = grids[grids.length - 1];
                if (lastGrid) lastGrid.querySelectorAll('.opt-btn').forEach(b => b.disabled = true);

                appendChatMessage(`⏰ **Tempo esgotado!** A resposta correta era: **${activeQuestion ? activeQuestion.answer : '?'}**`);
                waitingAnswer = false;

                // Injeta botão de reporte caso o tempo tenha esgotado
                try {
                    if (lastGrid && !lastGrid.parentElement.querySelector('.question-report-bar') && activeQuestion) {
                        const reportBar = document.createElement('div');
                        reportBar.className = 'question-report-bar';
                        const qDataSafe = encodeURIComponent(JSON.stringify({
                            id: activeQuestion.id || '',
                            question: activeQuestion.question || '',
                            series: activeQuestion.series || 'Básico',
                            answer: activeQuestion.answer || '',
                            options: activeQuestion.options || [],
                            explanation: activeQuestion.explanation || ''
                        }));
                        reportBar.innerHTML = `
                            <button type="button" class="btn-report-question" onclick="openReportQuestionModal('${qDataSafe}', this)" title="Reportar erro ou inconsistência nesta questão ao administrador">
                                <i data-lucide="flag" style="width:13px;height:13px;"></i>
                                Reportar questão ao ADM
                            </button>
                        `;
                        lastGrid.parentElement.appendChild(reportBar);
                        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
                    }
                } catch (eRep) {}

                if (currentUser && activeQuestion) {
                    try {
                        const uName = (currentProfile && currentProfile.name) || (currentUser.displayName) || 'Colaborador';
                        const uEmail = (currentProfile && currentProfile.email) || (currentUser.email) || '';
                        db.ref('answer_logs').push({
                            userId: currentUser.uid,
                            userName: uName,
                            userEmail: uEmail,
                            questionId: activeQuestion.id || null,
                            questionText: activeQuestion.question || '',
                            questionSeries: activeQuestion.series || 'Básico',
                            correctAnswer: activeQuestion.answer || '',
                            studentAnswer: 'Tempo Esgotado',
                            isCorrect: false,
                            timestamp: firebase.database.ServerValue ? firebase.database.ServerValue.TIMESTAMP : Date.now()
                        }).catch(() => {});
                    } catch(e) {}
                }
                evaluateCustomStudyAnswer(false);
            }
        }
    }, 1000);
}

function clearQuestionTimer() {
    if (customStudyPlan.timerInterval) {
        clearInterval(customStudyPlan.timerInterval);
        customStudyPlan.timerInterval = null;
    }
    const bar = document.getElementById('activeTimerBar');
    if (bar) bar.remove();
    customStudyPlan.timerBarEl = null;
}

/**
 * =========================================================================
 * SISTEMA DE REPORTES DE QUESTÕES (AUDITORIA E CORREÇÃO PELO ADM)
 * =========================================================================
 */

function openReportQuestionModal(encodedQData, btnElement) {
    try {
        let qData = null;
        if (typeof encodedQData === 'string') {
            qData = JSON.parse(decodeURIComponent(encodedQData));
        } else {
            qData = encodedQData;
        }

        if (!qData || !qData.question) {
            showToast('Não foi possível carregar os dados desta questão.', 'error');
            return;
        }

        currentReportingQuestion = qData;
        currentReportButton = btnElement || null;

        // Preenche dados da questão no modal
        const badgeEl = document.getElementById('reportQSeriesBadge');
        if (badgeEl) {
            const normSeries = getQuestionSeries(qData.series || qData);
            badgeEl.textContent = normSeries;
            badgeEl.className = `badge-pill ${getSeriesBadgeClass(normSeries)}`;
        }

        const qTextEl = document.getElementById('reportQText');
        if (qTextEl) {
            qTextEl.textContent = qData.question || 'Pergunta não informada';
        }

        const qAnsEl = document.getElementById('reportQAnswer');
        if (qAnsEl) {
            qAnsEl.textContent = qData.answer || 'Não especificado';
        }

        // Reseta formulário
        const reasonEl = document.getElementById('reportReasonSelect');
        if (reasonEl) reasonEl.selectedIndex = 0;

        const detailsEl = document.getElementById('reportDetailsInput');
        if (detailsEl) detailsEl.value = '';

        // Exibe modal
        const overlay = document.getElementById('reportQuestionOverlay');
        if (overlay) {
            overlay.classList.add('active');
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            setTimeout(() => {
                if (detailsEl) detailsEl.focus();
            }, 100);
        }
    } catch (err) {
        console.error('Erro ao abrir modal de reporte:', err);
        showToast('Erro ao abrir diálogo de reporte.', 'error');
    }
}

function closeReportQuestionModal() {
    const overlay = document.getElementById('reportQuestionOverlay');
    if (overlay) overlay.classList.remove('active');
    currentReportingQuestion = null;
}

function handleReportOverlayClick(event) {
    if (event.target.id === 'reportQuestionOverlay') {
        closeReportQuestionModal();
    }
}

async function submitQuestionReport() {
    if (!currentReportingQuestion) {
        showToast('Nenhuma questão selecionada para reporte.', 'error');
        return;
    }

    const reasonEl = document.getElementById('reportReasonSelect');
    const detailsEl = document.getElementById('reportDetailsInput');
    const btnSubmit = document.getElementById('btnSubmitQuestionReport');

    const reason = (reasonEl ? reasonEl.value : 'Outro') || 'Outro';
    const details = detailsEl ? detailsEl.value.trim() : '';

    if (!details) {
        showToast('Por favor, informe a explicação ou detalhes do problema encontrado.', 'warning');
        if (detailsEl) detailsEl.focus();
        return;
    }

    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<span class="loading-spinner"></span> Enviando...`;
    }

    try {
        const uName = (currentProfile && currentProfile.name) || 
                      (currentUser && currentUser.displayName) || 
                      'Colaborador';
        const uEmail = (currentProfile && currentProfile.email) || 
                       (currentUser && currentUser.email) || 
                       '';
        const uId = currentUser ? currentUser.uid : 'anonimo';

        const reportPayload = {
            questionId: currentReportingQuestion.id || null,
            questionText: currentReportingQuestion.question || '',
            questionSeries: currentReportingQuestion.series || 'Básico',
            correctAnswer: currentReportingQuestion.answer || '',
            options: currentReportingQuestion.options || [],
            reason: reason,
            details: details,
            userId: uId,
            userName: uName,
            userEmail: uEmail,
            status: 'pending',
            timestamp: (typeof firebase !== 'undefined' && firebase.database && firebase.database.ServerValue) 
                ? firebase.database.ServerValue.TIMESTAMP 
                : Date.now()
        };

        await db.ref('question_reports').push(reportPayload);

        // Se o botão da questão estiver visível no chat, exibe tag de sucesso
        if (currentReportButton && currentReportButton.parentElement) {
            currentReportButton.parentElement.innerHTML = `
                <span class="report-submitted-tag">
                    <i data-lucide="check" style="width:13px;height:13px;"></i>
                    Reporte enviado ao ADM
                </span>
            `;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        }

        closeReportQuestionModal();
        showToast('Reporte enviado com sucesso! O administrador analisará a questão.', 'success');
    } catch (err) {
        console.error('Erro ao enviar reporte:', err);
        showToast('Erro ao enviar reporte: ' + err.message, 'error');
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = `<i data-lucide="send" size="14"></i> Enviar Reporte ao ADM`;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        }
    }
}

function updateQuestionReportsBadge() {
    const list = questionReportsList || [];
    const pendingList = list.filter(r => r.status === 'pending' || !r.status);
    const resolvedList = list.filter(r => r.status === 'resolved');

    const badge = document.getElementById('adminReportsBadge');
    if (badge) {
        if (pendingList.length > 0) {
            badge.style.display = 'inline-block';
            badge.textContent = pendingList.length > 99 ? '99+' : pendingList.length;
        } else {
            badge.style.display = 'none';
        }
    }

    const countAll = document.getElementById('countReportsAll');
    if (countAll) countAll.textContent = list.length;

    const countPending = document.getElementById('countReportsPending');
    if (countPending) countPending.textContent = pendingList.length;

    const countResolved = document.getElementById('countReportsResolved');
    if (countResolved) countResolved.textContent = resolvedList.length;

    const sumTotal = document.getElementById('reportsSummaryTotal');
    if (sumTotal) sumTotal.textContent = `${list.length} Total`;

    const sumPending = document.getElementById('reportsSummaryPending');
    if (sumPending) sumPending.textContent = `${pendingList.length} Pendente(s)`;
}

function filterReportsByStatus(status) {
    reportsCurrentFilter = status;

    const tabAll = document.getElementById('tabReportFilterAll');
    const tabPending = document.getElementById('tabReportFilterPending');
    const tabResolved = document.getElementById('tabReportFilterResolved');

    if (tabAll) tabAll.classList.toggle('active', status === 'all');
    if (tabPending) tabPending.classList.toggle('active', status === 'pending');
    if (tabResolved) tabResolved.classList.toggle('active', status === 'resolved');

    renderAdminQuestionReports();
}

function renderAdminQuestionReports() {
    const container = document.getElementById('adminReportsList');
    if (!container) return;

    updateQuestionReportsBadge();

    const searchInput = document.getElementById('searchReportsInput');
    const searchTerm = (searchInput ? searchInput.value : '').trim().toLowerCase();

    let items = [...(questionReportsList || [])];

    // Filtro por status
    if (reportsCurrentFilter === 'pending') {
        items = items.filter(r => r.status === 'pending' || !r.status);
    } else if (reportsCurrentFilter === 'resolved') {
        items = items.filter(r => r.status === 'resolved');
    }

    // Filtro por termo de busca
    if (searchTerm) {
        items = items.filter(r => {
            const qText = (r.questionText || '').toLowerCase();
            const qReason = (r.reason || '').toLowerCase();
            const qDetails = (r.details || '').toLowerCase();
            const qUser = (r.userName || '').toLowerCase();
            const qEmail = (r.userEmail || '').toLowerCase();
            const qAns = (r.correctAnswer || '').toLowerCase();
            return qText.includes(searchTerm) || 
                   qReason.includes(searchTerm) || 
                   qDetails.includes(searchTerm) || 
                   qUser.includes(searchTerm) || 
                   qEmail.includes(searchTerm) ||
                   qAns.includes(searchTerm);
        });
    }

    if (items.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:3.5rem 1rem;color:var(--text-muted);background:var(--panasonic-white);border:1px dashed var(--panasonic-gray-300);border-radius:1rem;">
                <div style="width:54px;height:54px;border-radius:50%;background:var(--panasonic-gray-100);display:flex;align-items:center;justify-content:center;margin:0 auto 1rem auto;color:var(--text-muted);">
                    <i data-lucide="check-check" size="26"></i>
                </div>
                <h4 style="font-size:1.05rem;font-weight:700;color:var(--text-main);margin:0 0 0.35rem 0;">Nenhum reporte encontrado</h4>
                <p style="font-size:0.85rem;margin:0;max-width:380px;margin:0 auto;">
                    ${reportsCurrentFilter === 'pending' 
                        ? 'Excelente! Não há nenhum apontamento de erro pendente de revisão no momento.' 
                        : 'Nenhum reporte corresponde aos filtros ou busca informados.'}
                </p>
            </div>
        `;
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        return;
    }

    let html = '';
    items.forEach((r) => {
        const isResolved = r.status === 'resolved';
        const cardClass = isResolved ? 'admin-report-card resolved' : 'admin-report-card pending';
        const normSeries = getQuestionSeries(r.questionSeries || r.questionText);
        const seriesBadgeClass = getSeriesBadgeClass(normSeries);
        const formattedDate = r.timestamp ? new Date(r.timestamp).toLocaleString('pt-BR') : 'Data não registrada';

        const safeQuestionText = (r.questionText || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        const safeDetails = (r.details || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        const safeAnswer = (r.correctAnswer || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        const rawEscapedQText = encodeURIComponent(r.questionText || '');

        html += `
            <div class="${cardClass}" id="reportCard_${r.id}">
                <!-- Topo do Card -->
                <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:0.5rem;">
                    <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                        ${isResolved ? `
                            <span style="background:var(--panasonic-success-bg);color:#0E6245;font-weight:800;font-size:0.75rem;padding:0.25rem 0.65rem;border-radius:999px;border:1px solid rgba(18,183,106,0.3);display:inline-flex;align-items:center;gap:0.3rem;">
                                <i data-lucide="check-circle-2" size="13"></i> Resolvido
                            </span>
                        ` : `
                            <span style="background:#FEECEB;color:#F04438;font-weight:800;font-size:0.75rem;padding:0.25rem 0.65rem;border-radius:999px;border:1px solid rgba(240,68,56,0.3);display:inline-flex;align-items:center;gap:0.3rem;">
                                <i data-lucide="alert-circle" size="13"></i> Pendente de Revisão
                            </span>
                        `}
                        <span class="badge-pill ${seriesBadgeClass}">${normSeries}</span>
                        <span style="font-size:0.75rem;color:var(--text-muted);display:inline-flex;align-items:center;gap:0.25rem;">
                            <i data-lucide="clock" size="12"></i> ${formattedDate}
                        </span>
                    </div>

                    <div style="display:flex;align-items:center;gap:0.4rem;">
                        <!-- Botão Corrigir Questão -->
                        <button type="button" class="btn btn-primary btn-sm" onclick="editQuestionFromReport('${r.id}', '${r.questionId || ''}', '${rawEscapedQText}')" style="font-size:0.78rem;padding:0.35rem 0.75rem;display:inline-flex;align-items:center;gap:0.35rem;font-weight:700;">
                            <i data-lucide="edit-3" size="14"></i> Corrigir Questão
                        </button>

                        <!-- Botão Alternar Status -->
                        ${isResolved ? `
                            <button type="button" class="btn btn-secondary btn-sm" onclick="toggleReportStatus('${r.id}', 'pending')" title="Reabrir como pendente" style="font-size:0.78rem;padding:0.35rem 0.7rem;display:inline-flex;align-items:center;gap:0.3rem;">
                                <i data-lucide="rotate-ccw" size="13"></i> Reabrir
                            </button>
                        ` : `
                            <button type="button" class="btn btn-secondary btn-sm" onclick="toggleReportStatus('${r.id}', 'resolved')" title="Marcar como resolvido" style="font-size:0.78rem;padding:0.35rem 0.7rem;display:inline-flex;align-items:center;gap:0.3rem;color:var(--panasonic-success);border-color:rgba(18,183,106,0.4);">
                                <i data-lucide="check" size="14"></i> Resolvido
                            </button>
                        `}

                        <!-- Botão Excluir -->
                        <button type="button" class="btn btn-secondary btn-sm" onclick="deleteQuestionReport('${r.id}')" title="Excluir este reporte" style="padding:0.35rem 0.55rem;color:var(--panasonic-error);border-color:transparent;">
                            <i data-lucide="trash-2" size="14"></i>
                        </button>
                    </div>
                </div>

                <!-- Enunciado e Gabarito da Questão Reportada -->
                <div style="background:var(--panasonic-gray-50);border:1px solid var(--panasonic-gray-200);border-radius:0.65rem;padding:0.75rem 0.95rem;display:flex;flex-direction:column;gap:0.45rem;">
                    <div style="font-weight:700;font-size:0.88rem;color:var(--text-main);line-height:1.45;">
                        ${safeQuestionText}
                    </div>
                    <div style="font-size:0.78rem;color:#0E6245;background:var(--panasonic-success-bg);padding:0.3rem 0.6rem;border-radius:0.35rem;border:1px solid rgba(18,183,106,0.25);font-weight:600;display:inline-flex;align-items:center;gap:0.35rem;align-self:flex-start;">
                        <i data-lucide="check-circle" size="13"></i>
                        <span>Gabarito cadastrado: <strong>${safeAnswer}</strong></span>
                    </div>
                </div>

                <!-- Motivo e Relato do Colaborador -->
                <div class="report-feedback-bubble">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.35rem;flex-wrap:wrap;gap:0.3rem;">
                        <span style="font-weight:800;font-size:0.8rem;color:var(--text-main);display:flex;align-items:center;gap:0.35rem;">
                            <i data-lucide="help-circle" size="14" style="color:var(--panasonic-blue);"></i>
                            Motivo: <span style="color:#B42318;">${r.reason || 'Não informado'}</span>
                        </span>
                        <span style="font-size:0.74rem;color:var(--text-muted);display:flex;align-items:center;gap:0.3rem;">
                            <i data-lucide="user" size="12"></i>
                            <strong>${r.userName || 'Colaborador'}</strong> (${r.userEmail || 'e-mail não informado'})
                        </span>
                    </div>
                    <div style="font-size:0.84rem;color:var(--text-main);white-space:pre-wrap;line-height:1.5;">${safeDetails}</div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

function editQuestionFromReport(reportId, questionId, rawEscapedQText) {
    try {
        const questionText = decodeURIComponent(rawEscapedQText || '').trim();
        let targetQuestion = null;

        // 1. Tenta achar por ID
        if (questionId && questionsBank && questionsBank.length > 0) {
            targetQuestion = questionsBank.find(q => q.id === questionId);
        }

        // 2. Se não achar por ID, tenta achar por texto idêntico ou similar
        if (!targetQuestion && questionText && questionsBank && questionsBank.length > 0) {
            targetQuestion = questionsBank.find(q => (q.question || '').trim().toLowerCase() === questionText.toLowerCase());
        }

        if (!targetQuestion) {
            showToast('A questão correspondente não foi encontrada no banco atual de questões cadastradas (pode ter sido renomeada ou excluída).', 'warning');
            return;
        }

        // Alterna para a seção de Questões do ADM e aciona o formulário de edição
        switchAdminSection('secQuestions');
        startEditQuestion(targetQuestion.id);

        showToast('Questão carregada no formulário de edição! Ajuste o gabarito ou enunciado e salve.', 'info');
    } catch (err) {
        console.error('Erro ao editar questão a partir do reporte:', err);
        showToast('Erro ao carregar questão para edição.', 'error');
    }
}

async function toggleReportStatus(reportId, newStatus) {
    try {
        await db.ref('question_reports/' + reportId).update({
            status: newStatus,
            resolvedAt: newStatus === 'resolved' ? Date.now() : null
        });
        showToast(newStatus === 'resolved' ? 'Reporte marcado como resolvido!' : 'Reporte reaberto para revisão.', 'success');
    } catch (err) {
        console.error('Erro ao alternar status do reporte:', err);
        showToast('Erro ao atualizar status: ' + err.message, 'error');
    }
}

function deleteQuestionReport(reportId) {
    showConfirmDialog('Excluir Reporte', 'Deseja remover este registro de reporte definitivamente?', async () => {
        try {
            await db.ref('question_reports/' + reportId).remove();
            showToast('Reporte excluído com sucesso.', 'success');
        } catch (err) {
            console.error('Erro ao excluir reporte:', err);
            showToast('Erro ao excluir reporte: ' + err.message, 'error');
        }
    });
}

