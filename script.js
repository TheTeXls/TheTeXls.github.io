import { collection, addDoc, onSnapshot, doc, getDoc, setDoc, serverTimestamp, query, orderBy } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = localStorage.getItem('quizUser') || null;

function showScreen(id) {
    document.querySelectorAll('.container').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(id);
    if(target) target.classList.remove('hidden');
}

// --- LOGICA DE LOGIN ---
async function handleLogin() {
    const name = document.getElementById('user-name-input').value.trim();
    const pass = document.getElementById('user-pass-input').value.trim();
    if (!name || !pass) return alert("Faltan datos");

    const userRef = doc(window.db, "users", name.toLowerCase());
    const snap = await getDoc(userRef);

    if (snap.exists() && snap.data().pass !== pass) return alert("Contraseña incorrecta");
    if (!snap.exists()) await setDoc(userRef, { originalName: name, pass: pass });

    currentUser = name;
    localStorage.setItem('quizUser', name);
    showHome();
}

function showHome() {
    if (!currentUser) return showScreen('login-screen');
    showScreen('home-screen');
    document.getElementById('user-display').innerText = `👤 ${currentUser}`;
    listenData();
}

// --- ESCUCHAR DATOS (QUIZZES Y RANKING) ---
function listenData() {
    // 1. Cargar Quizzes con Botón de Jugar
    onSnapshot(collection(window.db, "quizzes"), (snap) => {
        const list = document.getElementById('quiz-list');
        list.innerHTML = "<h3>Quizzes Disponibles</h3>";
        snap.forEach(d => {
            const q = d.data();
            const quizDiv = document.createElement('div');
            quizDiv.className = 'quiz-card';
            quizDiv.innerHTML = `
                <b>${q.title}</b><br>
                <small>Creado por: ${q.author}</small><br>
                <button class="btn-main" style="margin-top:10px; padding:5px; font-size:14px" onclick="alert('Iniciando juego...')">Jugar ahora 🎮</button>
            `;
            list.appendChild(quizDiv);
        });
    });

    // 2. Cargar Ranking Global
    onSnapshot(collection(window.db, "scores"), (snap) => {
        const rList = document.getElementById('global-ranking-list');
        rList.innerHTML = "<h3>🏆 Ranking Global</h3>";
        let scores = {};
        snap.forEach(d => {
            const s = d.data();
            scores[s.user] = (scores[s.user] || 0) + (s.points || 0);
        });
        
        const sorted = Object.entries(scores).sort((a,b) => b[1]-a[1]);
        sorted.forEach(([user, pts]) => {
            const item = document.createElement('div');
            item.className = 'ranking-item';
            item.innerHTML = `<span>${user}</span> <b>${pts} pts</b>`;
            rList.appendChild(item);
        });
    });
}

// --- PUBLICAR QUIZ ---
async function saveNewQuiz() {
    const title = document.getElementById('quiz-title-input').value.trim();
    const question = document.getElementById('q-text').value.trim();
    const inputs = document.querySelectorAll('.opt-input');
    const options = Array.from(inputs).map(i => i.value.trim()).filter(v => v !== "");

    if (!title || !question || options.length < 2) return alert("Completa todos los campos");

    try {
        await addDoc(collection(window.db, "quizzes"), {
            title, q: question, opts: options, author: currentUser, createdAt: serverTimestamp()
        });
        alert("¡Publicado!");
        showHome();
    } catch (e) { alert("Error al publicar"); }
}

// --- ASIGNAR EVENTOS ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-login-action').onclick = handleLogin;
    document.getElementById('btn-logout').onclick = () => { localStorage.clear(); location.reload(); };
    document.getElementById('btn-go-editor').onclick = () => showScreen('editor-screen');
    document.getElementById('btn-back-home').onclick = () => showHome();
    document.getElementById('btn-save-quiz').onclick = saveNewQuiz;
    document.getElementById('btn-add-option').onclick = () => {
        const inp = document.createElement('input');
        inp.className = "opt-input"; inp.placeholder = "Incorrecta";
        document.getElementById('options-setup').appendChild(inp);
    };
});

showHome();