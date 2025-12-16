import { 
    collection, addDoc, onSnapshot, deleteDoc, doc, getDoc, setDoc, getDocs 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Variables globales
let currentUser = localStorage.getItem('quizUser') || null;
let quizToEdit = null;

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

// --- LÓGICA DE USUARIOS ---
async function handleLogin() {
    const nameInput = document.getElementById('user-name-input');
    const passInput = document.getElementById('user-pass-input');
    
    const name = nameInput.value.trim();
    const pass = passInput.value.trim();

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
            // Si no existe, lo crea (Registro automático)
            await setDoc(userRef, { originalName: name, pass: pass });
            loginSuccess(name);
        }
    } catch (error) {
        console.error("Error en login:", error);
        alert("Error de conexión con la base de datos");
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
            const isOwner = (q.author === currentUser || currentUser === "admin");
            div.innerHTML = `
                <b>${q.title}</b><br><small>Por: ${q.author}</small><br>
                <div style="margin-top:10px">
                    <button class="btn-main" style="width:auto; padding:5px 15px" id="play-${q.id}">Jugar</button>
                    ${isOwner ? `<button class="btn-small" style="background:none; border:1px solid #ccc; color:#666; margin-left:10px" id="set-${q.id}">⚙️ Ajustes</button>` : ''}
                </div>
            `;
            list.appendChild(div);
            
            document.getElementById(`play-${q.id}`).onclick = () => startQuiz(q);
            if(isOwner) {
                const setBtn = document.getElementById(`set-${q.id}`);
                if (setBtn) setBtn.onclick = () => openSettings(q);
            }
        });
    });

    // Escuchar Ranking Global
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

// --- FUNCIONES DE JUEGO ---
function startQuiz(quiz) {
    showScreen('quiz-screen');
    document.getElementById('current-quiz-title').innerText = quiz.title;
    const container = document.getElementById('options-container');
    container.innerHTML = `<h3 style="margin-bottom:20px">${quiz.q}</h3>`;
    
    // Desordenar opciones
    const options = quiz.opts.map((text, index) => ({ text, isCorrect: index === 0 }));
    options.sort(() => Math.random() - 0.5);

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.innerText = opt.text;
        btn.className = 'option-btn';
        btn.onclick = async () => {
            await addDoc(collection(window.db, "scores"), {
                user: currentUser,
                quizId: quiz.id,
                points: opt.isCorrect ? 1 : 0,
                choice: opt.text,
                date: new Date()
            });
            alert(opt.isCorrect ? "✅ ¡Correcto!" : "❌ Incorrecto");
            showHome();
        };
        container.appendChild(btn);
    });
}

// --- CONFIGURACIÓN DE EVENTOS (BOTONES) ---
// Usamos este método porque los módulos no permiten onclick en HTML directamente
document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('btn-login-action');
    if (loginBtn) loginBtn.onclick = handleLogin;

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.onclick = () => { localStorage.removeItem('quizUser'); location.reload(); };

    const goEditorBtn = document.getElementById('btn-go-editor');
    if (goEditorBtn) goEditorBtn.onclick = () => showScreen('editor-screen');

    const backBtns = ['btn-back-home', 'btn-back-home-set'];
    backBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = () => showHome();
    });
});

// Arrancar la app
showHome();