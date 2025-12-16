import { 
    collection, addDoc, onSnapshot, deleteDoc, doc, getDoc, setDoc, getDocs 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = localStorage.getItem('quizUser') || null;
let quizToEdit = null;

// --- NAVEGACIÓN ---
function showScreen(id) {
    document.querySelectorAll('.container').forEach(c => c.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

// --- LOGICA DE USUARIOS ---
async function handleLogin() {
    const name = document.getElementById('user-name-input').value.trim();
    const pass = document.getElementById('user-pass-input').value.trim();
    if (!name || !pass) return alert("Escribe usuario y contraseña");

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
    // Quizzes
    onSnapshot(collection(window.db, "quizzes"), (snap) => {
        const list = document.getElementById('quiz-list');
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
                    ${isOwner ? `<button class="btn-small" style="background:none; border:1px solid #ccc; color:#666" id="set-${q.id}">⚙️ Ajustes</button>` : ''}
                </div>
            `;
            list.appendChild(div);
            document.getElementById(`play-${q.id}`).onclick = () => startQuiz(q);
            if(isOwner) document.getElementById(`set-${q.id}`).onclick = () => openSettings(q);
        });
    });

    // Ranking
    onSnapshot(collection(window.db, "scores"), (snap) => {
        const rList = document.getElementById('global-ranking-list');
        let totals = {};
        snap.forEach(d => {
            const s = d.data();
            totals[s.user] = (totals[s.user] || 0) + s.points;
        });
        const sorted = Object.entries(totals).sort((a,b) => b[1]-a[1]).slice(0,5);
        rList.innerHTML = sorted.map(([u, p]) => `<div class="ranking-item">${u}: <b>${p} pts</b></div>`).join('');
    });
}

// --- FUNCIONES DE JUEGO Y EDITOR ---
async function saveNewQuiz() {
    const title = document.getElementById('quiz-title-input').value;
    const q = document.getElementById('q-text').value;
    const opts = Array.from(document.querySelectorAll('.opt-input')).map(i => i.value.trim()).filter(v => v !== "");
    if (!title || !q || opts.length < 2) return alert("Faltan datos");

    await addDoc(collection(window.db, "quizzes"), { author: currentUser, title, q, opts });
    showHome();
}

function startQuiz(quiz) {
    showScreen('quiz-screen');
    document.getElementById('current-quiz-title').innerText = quiz.title;
    const container = document.getElementById('options-container');
    container.innerHTML = `<h3 style="margin-bottom:20px">${quiz.q}</h3>`;
    
    quiz.opts.map((t, i) => ({t, i})).sort(() => Math.random() - 0.5).forEach(opt => {
        const btn = document.createElement('button');
        btn.innerText = opt.t; btn.className = 'option-btn';
        btn.onclick = async () => {
            const correct = (opt.i === 0);
            await addDoc(collection(window.db, "scores"), {
                user: currentUser, quizId: quiz.id, points: correct ? 1 : 0, choice: opt.t
            });
            alert(correct ? "✅ ¡Correcto!" : "❌ Incorrecto");
            showHome();
        };
        container.appendChild(btn);
    });
}

async function openSettings(quiz) {
    quizToEdit = quiz;
    showScreen('settings-screen');
    const box = document.getElementById('quiz-info-box');
    box.innerHTML = `Cargando respuestas...`;
    
    const sSnap = await getDocs(collection(window.db, "scores"));
    let resHtml = `<b>Pregunta:</b> ${quiz.q}<br><b>Correcta:</b> ${quiz.opts[0]}<hr><b>Jugadores:</b><br>`;
    sSnap.forEach(d => {
        if(d.data().quizId === quiz.id) resHtml += `<div>• ${d.data().user}: ${d.data().choice}</div>`;
    });
    box.innerHTML = resHtml;
}

// --- ASIGNAR EVENTOS A BOTONES ---
document.getElementById('btn-login-action').onclick = handleLogin;
document.getElementById('btn-logout').onclick = () => { localStorage.removeItem('quizUser'); location.reload(); };
document.getElementById('btn-go-editor').onclick = () => showScreen('editor-screen');
document.getElementById('btn-back-home').onclick = () => showHome();
document.getElementById('btn-back-home-set').onclick = () => showHome();
document.getElementById('btn-save-quiz').onclick = saveNewQuiz;
document.getElementById('btn-add-option').onclick = () => {
    const input = document.createElement('input');
    input.className = "opt-input"; input.placeholder = "Otra respuesta incorrecta";
    document.getElementById('options-setup').appendChild(input);
};
document.getElementById('btn-delete-quiz').onclick = async () => {
    if(confirm("¿Seguro que quieres borrar este quiz?")) {
        await deleteDoc(doc(window.db, "quizzes", quizToEdit.id));
        showHome();
    }
};

// Iniciar app
showHome();