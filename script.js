import { 
    collection, addDoc, onSnapshot, deleteDoc, doc, getDoc, setDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- VARIABLES ---
let currentUser = localStorage.getItem('quizUser') || null;

// --- NAVEGACIÓN ---
function showScreen(id) {
    const screens = ['login-screen', 'home-screen', 'editor-screen', 'quiz-screen', 'settings-screen'];
    screens.forEach(s => {
        const el = document.getElementById(s);
        if (el) el.classList.add('hidden');
    });
    const target = document.getElementById(id);
    if (target) target.classList.remove('hidden');
}

// --- LOGIN Y REGISTRO ---
async function handleLogin() {
    const name = document.getElementById('user-name-input').value.trim();
    const pass = document.getElementById('user-pass-input').value.trim();

    if (!name || !pass) return alert("Escribe usuario y contraseña");

    try {
        const userRef = doc(window.db, "users", name.toLowerCase());
        const snap = await getDoc(userRef);

        if (snap.exists()) {
            if (snap.data().pass === pass) {
                loginSuccess(name);
            } else {
                alert("Contraseña incorrecta");
            }
        } else {
            await setDoc(userRef, { originalName: name, pass: pass });
            loginSuccess(name);
        }
    } catch (e) {
        console.error("Error:", e);
        alert("Error de conexión");
    }
}

function loginSuccess(name) {
    currentUser = name;
    localStorage.setItem('quizUser', name);
    showHome();
}

function showHome() {
    if (!currentUser) {
        showScreen('login-screen');
    } else {
        showScreen('home-screen');
        document.getElementById('user-display').innerText = `👤 ${currentUser}`;
        listenData();
    }
}

// --- DATOS EN TIEMPO REAL ---
function listenData() {
    // Escuchar Quizzes
    onSnapshot(collection(window.db, "quizzes"), (snap) => {
        const list = document.getElementById('quiz-list');
        if (!list) return;
        list.innerHTML = "";
        snap.forEach(d => {
            const q = { id: d.id, ...d.data() };
            const div = document.createElement('div');
            div.className = 'quiz-card';
            div.innerHTML = `
                <b>${q.title}</b><br><small>Por: ${q.author}</small><br>
                <button class="btn-main" style="width:auto; margin-top:10px" id="play-${q.id}">Jugar</button>
            `;
            list.appendChild(div);
            document.getElementById(`play-${q.id}`).onclick = () => startQuiz(q);
        });
    });

    // Escuchar Ranking
    onSnapshot(collection(window.db, "scores"), (snap) => {
        const rList = document.getElementById('global-ranking-list');
        if (!rList) return;
        let totals = {};
        snap.forEach(d => {
            const s = d.data();
            totals[s.user] = (totals[s.user] || 0) + (s.points || 0);
        });
        const sorted = Object.entries(totals).sort((a,b) => b[1]-a[1]).slice(0,5);
        rList.innerHTML = sorted.map(([u, p]) => `<div class="ranking-item">${u}: <b>${p} pts</b></div>`).join('');
    });
}

// --- JUEGO ---
function startQuiz(quiz) {
    showScreen('quiz-screen');
    document.getElementById('current-quiz-title').innerText = quiz.title;
    const container = document.getElementById('options-container');
    container.innerHTML = `<h3>${quiz.q}</h3>`;
    
    quiz.opts.forEach((text, index) => {
        const btn = document.createElement('button');
        btn.innerText = text;
        btn.className = 'option-btn';
        btn.onclick = async () => {
            const isCorrect = (index === 0);
            await addDoc(collection(window.db, "scores"), {
                user: currentUser, points: isCorrect ? 1 : 0, quizId: quiz.id
            });
            alert(isCorrect ? "✅ ¡Correcto!" : "❌ Incorrecto");
            showHome();
        };
        container.appendChild(btn);
    });
}

// --- EVENTOS DE BOTONES ---
document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('btn-login-action');
    if (loginBtn) loginBtn.onclick = handleLogin;

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.onclick = () => {
        localStorage.removeItem('quizUser');
        location.reload();
    };

    const goEditor = document.getElementById('btn-go-editor');
    if (goEditor) goEditor.onclick = () => showScreen('editor-screen');

    const backHome = document.getElementById('btn-back-home');
    if (backHome) backHome.onclick = () => showHome();
});

// Iniciar
showHome();