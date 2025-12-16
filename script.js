import { 
    collection, addDoc, onSnapshot, deleteDoc, doc, getDoc, setDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Variables de estado
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

// --- LOGICA DE LOGIN ---
async function handleLogin() {
    const name = document.getElementById('user-name-input').value.trim();
    const pass = document.getElementById('user-pass-input').value.trim();

    if (!name || !pass) return alert("Por favor, rellena todos los campos.");

    try {
        const userRef = doc(window.db, "users", name.toLowerCase());
        const snap = await getDoc(userRef);

        if (snap.exists()) {
            if (snap.data().pass === pass) {
                loginSuccess(name);
            } else {
                alert("Contraseña incorrecta.");
            }
        } else {
            // Registro automático si el usuario no existe
            await setDoc(userRef, { originalName: name, pass: pass });
            loginSuccess(name);
        }
    } catch (error) {
        console.error("Error en Firebase:", error);
        alert("Error de conexión. Revisa tu consola.");
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

// --- ESCUCHAR DATOS EN TIEMPO REAL ---
function listenData() {
    // Quizzes
    onSnapshot(collection(window.db, "quizzes"), (snap) => {
        const list = document.getElementById('quiz-list');
        if (!list) return;
        list.innerHTML = "";
        snap.forEach(d => {
            const q = { id: d.id, ...d.data() };
            const div = document.createElement('div');
            div.className = 'quiz-card';
            div.innerHTML = `
                <b>${q.title}</b><br><small>Autor: ${q.author}</small><br>
                <button class="btn-main" style="width:auto; margin-top:10px" id="play-${q.id}">Jugar</button>
            `;
            list.appendChild(div);
            document.getElementById(`play-${q.id}`).onclick = () => alert("¡Pronto podrás jugar este quiz!");
        });
    });

    // Ranking
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

// --- ASIGNAR EVENTOS (Porque los módulos no permiten onclick en HTML) ---
document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('btn-login-action');
    if (loginBtn) loginBtn.onclick = handleLogin;

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.onclick = () => {
        localStorage.removeItem('quizUser');
        location.reload();
    };

    const goEditorBtn = document.getElementById('btn-go-editor');
    if (goEditorBtn) goEditorBtn.onclick = () => showScreen('editor-screen');

    const backHomeBtn = document.getElementById('btn-back-home');
    if (backHomeBtn) backHomeBtn.onclick = () => showHome();
});

// Arrancar aplicación
showHome();