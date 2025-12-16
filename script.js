import { collection, addDoc, onSnapshot, doc, getDoc, setDoc, serverTimestamp } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = localStorage.getItem('quizUser') || null;

function showScreen(id) {
    document.querySelectorAll('.container').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

// LOGIN
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

// ESCUCHAR DATOS (QUIZZES Y RANKING)
function listenData() {
    // Quizzes
    onSnapshot(collection(window.db, "quizzes"), (snap) => {
        const list = document.getElementById('quiz-list');
        list.innerHTML = "<h3>Quizzes</h3>";
        snap.forEach(d => {
            const q = { id: d.id, ...d.data() };
            const div = document.createElement('div');
            div.className = 'quiz-card';
            div.innerHTML = `<b>${q.title}</b><br><small>Por: ${q.author}</small><br>`;
            const btn = document.createElement('button');
            btn.className = "btn-main";
            btn.innerText = "Jugar 🎮";
            btn.onclick = () => startQuiz(q);
            div.appendChild(btn);
            list.appendChild(div);
        });
    });

    // Ranking
    onSnapshot(collection(window.db, "scores"), (snap) => {
        const rList = document.getElementById('global-ranking-list');
        rList.innerHTML = "<h3>🏆 Ranking Global</h3>";
        let totals = {};
        snap.forEach(d => {
            const s = d.data();
            totals[s.user] = (totals[s.user] || 0) + (s.points || 0);
        });
        Object.entries(totals).sort((a,b) => b[1]-a[1]).forEach(([u, p]) => {
            rList.innerHTML += `<div class="ranking-item"><span>${u}</span><b>${p} pts</b></div>`;
        });
    });
}

// JUGAR QUIZ
function startQuiz(quiz) {
    showScreen('quiz-screen');
    const cont = document.getElementById('options-container');
    document.getElementById('current-quiz-title').innerText = quiz.title;
    cont.innerHTML = `<p>${quiz.q}</p>`;

    quiz.opts.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = "option-btn";
        btn.innerText = opt;
        btn.onclick = async () => {
            const pts = (i === 0) ? 1 : 0;
            await addDoc(collection(window.db, "scores"), {
                user: currentUser, points: pts, quizId: quiz.id
            });
            alert(pts === 1 ? "✅ ¡Correcto!" : "❌ Incorrecto");
            showHome();
        };
        cont.appendChild(btn);
    });
}

// PUBLICAR
async function saveNewQuiz() {
    const title = document.getElementById('quiz-title-input').value.trim();
    const question = document.getElementById('q-text').value.trim();
    const opts = Array.from(document.querySelectorAll('.opt-input')).map(i => i.value.trim()).filter(v => v !== "");

    if (!title || !question || opts.length < 2) return alert("Faltan datos");

    await addDoc(collection(window.db, "quizzes"), {
        title, q: question, opts, author: currentUser
    });
    alert("¡Publicado!");
    showHome();
}

// EVENTOS
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-login-action').onclick = handleLogin;
    document.getElementById('btn-logout').onclick = () => { localStorage.clear(); location.reload(); };
    document.getElementById('btn-go-editor').onclick = () => showScreen('editor-screen');
    document.getElementById('btn-back-home').onclick = () => showHome();
    document.getElementById('btn-save-quiz').onclick = saveNewQuiz;
    document.getElementById('btn-add-option').onclick = () => {
        const inp = document.createElement('input');
        inp.className = "opt-input"; inp.placeholder = "Respuesta Incorrecta";
        document.getElementById('options-setup').appendChild(inp);
    };
});

showHome();