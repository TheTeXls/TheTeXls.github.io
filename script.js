import { 
    collection, addDoc, onSnapshot, doc, getDoc, setDoc, 
    deleteDoc, serverTimestamp, query, where, getDocs, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. ESTADO GLOBAL
// ==========================================
const ADMIN_ID = "admin";
const ADMIN_PASS = "gem";

let currentUser = localStorage.getItem('quizUser') || null;
let displayName = localStorage.getItem('quizDisplayName') || null;
let tempQuestions = [];
let activeQuiz = null;
let currentQIdx = 0;
let sessionScore = 0;
let sessionDetails = [];
let isListening = false;
let userMap = {}; // Para guardar ID -> Nombre Real

// ==========================================
// 2. UTILIDADES UI
// ==========================================
function showScreen(id) {
    const screens = document.querySelectorAll('.container');
    screens.forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(id);
    if(target) target.classList.remove('hidden');
}

// Restaura los campos básicos (1 correcta, 3 incorrectas)
function resetEditorInputs() {
    const setup = document.getElementById('options-setup');
    if(setup) {
        setup.innerHTML = `
            <input type="text" class="opt-input" placeholder="✅ Respuesta Correcta">
            <input type="text" class="opt-input" placeholder="❌ Respuesta Incorrecta">
            <input type="text" class="opt-input" placeholder="❌ Respuesta Incorrecta">
            <input type="text" class="opt-input" placeholder="❌ Respuesta Incorrecta">
        `;
    }
    document.getElementById('q-text').value = "";
}

// Nueva función para el botón que no funcionaba
function addExtraIncorrectOption() {
    const setup = document.getElementById('options-setup');
    const input = document.createElement('input');
    input.type = "text";
    input.className = "opt-input";
    input.placeholder = "❌ Otra Respuesta Incorrecta";
    setup.appendChild(input);
}

// ==========================================
// 3. AUTENTICACIÓN
// ==========================================
async function handleLogin() {
    const rawName = document.getElementById('user-name-input').value.trim();
    const pass = document.getElementById('user-pass-input').value.trim();
    if (!rawName || !pass) return alert("Rellena los campos");
    
    const lowerName = rawName.toLowerCase();
    try {
        if (lowerName === ADMIN_ID && pass === ADMIN_PASS) {
            currentUser = ADMIN_ID; displayName = "Admin Maestro";
        } else {
            const userRef = doc(window.db, "users", lowerName);
            const snap = await getDoc(userRef);
            if (snap.exists()) {
                if (snap.data().pass !== pass) return alert("Password incorrecto");
                displayName = snap.data().originalName || rawName;
            } else {
                await setDoc(userRef, { originalName: rawName, pass: pass, createdAt: serverTimestamp() });
                displayName = rawName;
            }
            currentUser = lowerName;
        }
        localStorage.setItem('quizUser', currentUser);
        localStorage.setItem('quizDisplayName', displayName);
        window.showHome();
    } catch(e) { console.error(e); }
}

// ==========================================
// 4. FIREBASE REALTIME (Corregido Ranking)
// ==========================================
async function initRealtime() {
    if (isListening) return;
    isListening = true;

    // Cargar nombres reales para el Ranking
    const loadUserNames = async () => {
        const uSnap = await getDocs(collection(window.db, "users"));
        uSnap.forEach(u => { userMap[u.id] = u.data().originalName; });
        userMap["admin"] = "Admin Maestro";
    };
    await loadUserNames();

    // Listen Quizzes
    onSnapshot(collection(window.db, "quizzes"), async (snap) => {
        const list = document.getElementById('quiz-list');
        list.innerHTML = "<h3>Quizzes Disponibles</h3>";
        
        let playedIds = [];
        if (currentUser !== ADMIN_ID) {
            const qS = query(collection(window.db, "scores"), where("user", "==", currentUser));
            const sSnap = await getDocs(qS);
            playedIds = sSnap.docs.map(d => d.data().quizId);
        }

        snap.forEach(d => {
            const q = d.data();
            const div = document.createElement('div');
            div.className = 'quiz-card';
            div.innerHTML = `<b>${q.title}</b><br><small>${q.questions?.length} preg. • Por: ${q.author}</small>`;
            
            const btn = document.createElement('button');
            btn.className = "btn-main";
            if (currentUser === ADMIN_ID) {
                btn.innerText = "Probar (Admin) 🎮"; btn.onclick = () => startQuizSession({id: d.id, ...q});
            } else if (q.author === displayName) {
                btn.innerText = "Tu Quiz 🚫"; btn.disabled = true; btn.style.background = "#ccc";
            } else if (playedIds.includes(d.id)) {
                btn.innerText = "Completado ✅"; btn.disabled = true; btn.style.background = "#ccc";
            } else {
                btn.innerText = "Jugar 🎮"; btn.onclick = () => startQuizSession({id: d.id, ...q});
            }
            div.appendChild(btn);
            list.appendChild(div);
        });
    });

    // Listen Ranking (Corregido para mostrar displayName)
    onSnapshot(collection(window.db, "scores"), (snap) => {
        const rList = document.getElementById('global-ranking-list');
        rList.innerHTML = ""; 
        let totals = {};
        snap.forEach(d => {
            const s = d.data();
            if(s.user) totals[s.user] = (totals[s.user] || 0) + (s.points || 0);
        });
        Object.entries(totals).sort((a,b) => b[1]-a[1]).forEach(([u, p]) => {
            const nameToShow = userMap[u] || u; // Usa el mapa o el ID si no lo encuentra
            rList.innerHTML += `<div class="ranking-item"><span>${nameToShow}</span><b>${p} pts</b></div>`;
        });
    });
}

// ==========================================
// 5. JUEGO (Mantiene lógica v2.6)
// ==========================================
function renderQuestion() {
    const qData = activeQuiz.questions[currentQIdx];
    document.getElementById('current-quiz-title').innerText = activeQuiz.title;
    const cont = document.getElementById('options-container');
    cont.innerHTML = `<p style="font-weight:bold; margin-bottom:15px;">${qData.text}</p>`;
    
    const correctAns = qData.opts[0];
    [...qData.opts].sort(() => Math.random() - 0.5).forEach(opt => {
        const btn = document.createElement('button');
        btn.className = "btn-main";
        btn.innerText = opt;
        btn.onclick = () => {
            const ok = (opt === correctAns);
            sessionDetails.push({ pregunta: qData.text, respuesta: opt, correcta: ok });
            if (ok) sessionScore++;
            currentQIdx++;
            if (currentQIdx < activeQuiz.questions.length) renderQuestion();
            else finishGame();
        };
        cont.appendChild(btn);
    });
}

function startQuizSession(quiz) {
    activeQuiz = quiz; currentQIdx = 0; sessionScore = 0; sessionDetails = [];
    showScreen('quiz-screen');
    renderQuestion();
}

async function finishGame() {
    if (currentUser !== ADMIN_ID) {
        await addDoc(collection(window.db, "scores"), {
            user: currentUser, points: sessionScore, quizId: activeQuiz.id, 
            details: sessionDetails, date: serverTimestamp()
        });
    }
    window.showHome();
}

// ==========================================
// 6. EDITOR
// ==========================================
async function cleanupOldQuizzes() {
    const now = Date.now();
    const snap = await getDocs(collection(window.db, "quizzes"));
    const batch = writeBatch(window.db);
    snap.forEach(d => {
        const created = d.data().createdAt?.toMillis() || now;
        if (now - created > 5 * 60 * 60 * 1000) batch.delete(d.ref);
    });
    await batch.commit();
}

// ==========================================
// 7. INICIALIZACIÓN
// ==========================================
window.showHome = function() {
    if (!currentUser) return showScreen('login-screen');
    showScreen('home-screen');
    document.getElementById('user-display').innerText = displayName;
    cleanupOldQuizzes();
    initRealtime();
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-login-action').onclick = handleLogin;
    document.getElementById('btn-logout').onclick = () => { localStorage.clear(); location.reload(); };
    
    document.getElementById('btn-go-editor').onclick = () => {
        tempQuestions = [];
        resetEditorInputs();
        showScreen('editor-screen');
    };

    // CONEXIÓN DE LOS BOTONES DEL EDITOR
    document.getElementById('btn-add-option').onclick = addExtraIncorrectOption;

    document.getElementById('btn-next-q').onclick = () => {
        const text = document.getElementById('q-text').value.trim();
        const opts = Array.from(document.querySelectorAll('.opt-input')).map(i => i.value.trim());
        if(!text || opts.some(o => !o)) return alert("Completa todo");
        tempQuestions.push({ text, opts });
        resetEditorInputs();
    };

    document.getElementById('btn-save-quiz').onclick = async () => {
        const title = document.getElementById('quiz-title-input').value.trim();
        if(!title || tempQuestions.length < 5) return alert("Título + 5 preguntas mín.");
        await addDoc(collection(window.db, "quizzes"), { 
            title, questions: tempQuestions, author: displayName, createdAt: serverTimestamp() 
        });
        window.showHome();
    };

    document.getElementById('btn-back-home').onclick = () => window.showHome();
});