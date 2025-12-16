import { 
    collection, addDoc, onSnapshot, doc, getDoc, setDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- ESTADO DE LA APP ---
let currentUser = localStorage.getItem('quizUser') || null;

// --- NAVEGACIÓN (Mantiene tu diseño CSS) ---
function showScreen(id) {
    const screens = ['login-screen', 'home-screen', 'editor-screen', 'quiz-screen', 'settings-screen'];
    screens.forEach(s => {
        const el = document.getElementById(s);
        if (el) el.classList.add('hidden'); // Usa tu clase .hidden de CSS
    });
    const target = document.getElementById(id);
    if (target) target.classList.remove('hidden');
}

// --- LOGICA DE USUARIOS ---
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
        const display = document.getElementById('user-display');
        if (display) display.innerText = `👤 ${currentUser}`;
        listenData();
    }
}

// --- CREAR Y GUARDAR QUIZ ---
async function saveNewQuiz() {
    const title = document.getElementById('quiz-title-input').value.trim();
    const question = document.getElementById('q-text').value.trim();
    const options = Array.from(document.querySelectorAll('.opt-input'))
                         .map(input => input.value.trim())
                         .filter(val => val !== "");

    if (!title || !question || options.length < 2) {
        return alert("Completa el título, la pregunta y al menos 2 opciones.");
    }

    try {
        await addDoc(collection(window.db, "quizzes"), {
            title: title,
            q: question,
            opts: options,
            author: currentUser,
            createdAt: serverTimestamp()
        });
        alert("¡Quiz publicado con éxito! 🚀");
        
        // Limpiar formulario y volver
        document.getElementById('quiz-title-input').value = "";
        document.getElementById('q-text').value = "";
        showHome();
    } catch (e) {
        alert("Error al publicar");
    }
}

// --- CARGAR DATOS (QUIZZES Y RANKING) ---
function listenData() {
    // Lista de Quizzes
    onSnapshot(collection(window.db, "quizzes"), (snap) => {
        const list = document.getElementById('quiz-list');
        if (!list) return;
        list.innerHTML = "";
        snap.forEach(d => {
            const q = d.data();
            const div = document.createElement('div');
            div.className = 'quiz-card'; // Mantiene tu diseño de tarjeta
            div.innerHTML = `
                <b>${q.title}</b><br><small>Por: ${q.author}</small><br>
                <button class="btn-main" style="width:auto; margin-top:10px">Jugar</button>
            `;
            list.appendChild(div);
        });
    });

    // Ranking Global
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

// --- ASIGNACIÓN DE EVENTOS ---
document.addEventListener('DOMContentLoaded', () => {
    // Botones de sesión
    const loginBtn = document.getElementById('btn-login-action');
    if (loginBtn) loginBtn.onclick = handleLogin;

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.onclick = () => {
        localStorage.removeItem('quizUser');
        location.reload();
    };

    // Botones de pantalla
    const goEditor = document.getElementById('btn-go-editor');
    if (goEditor) goEditor.onclick = () => showScreen('editor-screen');

    const backHome = document.getElementById('btn-back-home');
    if (backHome) backHome.onclick = () => showHome();

    // Lógica del Editor
    const saveBtn = document.getElementById('btn-save-quiz');
    if (saveBtn) saveBtn.onclick = saveNewQuiz;

    const addOptBtn = document.getElementById('btn-add-option');
    if (addOptBtn) {
        addOptBtn.onclick = () => {
            const input = document.createElement('input');
            input.className = "opt-input";
            input.placeholder = "Otra respuesta incorrecta";
            document.getElementById('options-setup').appendChild(input);
        };
    }
});

// Arrancar
showHome();