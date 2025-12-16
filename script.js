import { collection, addDoc, onSnapshot, doc, getDoc, setDoc, deleteDoc, serverTimestamp, query, where, getDocs } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = localStorage.getItem('quizUser') || null;

function showScreen(id) {
    document.querySelectorAll('.container').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

window.showHome = function() {
    if (!currentUser) return showScreen('login-screen');
    showScreen('home-screen');
    document.getElementById('user-display').innerText = `👤 ${currentUser}`;
    initRealtime();
}

async function handleLogin() {
    const name = document.getElementById('user-name-input').value.trim();
    const pass = document.getElementById('user-pass-input').value.trim();
    if (!name || !pass) return alert("Completa los datos");
    const userRef = doc(window.db, "users", name.toLowerCase());
    const snap = await getDoc(userRef);
    if (snap.exists() && snap.data().pass !== pass) return alert("Pass incorrecto");
    if (!snap.exists()) await setDoc(userRef, { originalName: name, pass: pass });
    currentUser = name;
    localStorage.setItem('quizUser', name);
    window.showHome();
}

async function initRealtime() {
    // 1. Obtener los IDs de los quizzes que el usuario ya jugó
    const qScores = query(collection(window.db, "scores"), where("user", "==", currentUser));
    const scoreSnap = await getDocs(qScores);
    const playedQuizIds = scoreSnap.docs.map(d => d.data().quizId);

    // 2. Escuchar Quizzes
    onSnapshot(collection(window.db, "quizzes"), (snap) => {
        const list = document.getElementById('quiz-list');
        list.innerHTML = "<h3>Quizzes Disponibles</h3>";
        snap.forEach(d => {
            const q = { id: d.id, ...d.data() };
            const isPlayed = playedQuizIds.includes(q.id);
            
            const div = document.createElement('div');
            div.className = 'quiz-card';
            div.innerHTML = `<b>${q.title}</b><br><small>Por: ${q.author}</small>`;
            
            const btnJugar = document.createElement('button');
            btnJugar.className = "btn-main";
            
            if (isPlayed) {
                btnJugar.innerText = "Ya jugaste este quiz";
                btnJugar.style.background = "#b2bec3"; // Gris
                btnJugar.style.cursor = "not-allowed";
                btnJugar.disabled = true;
            } else {
                btnJugar.innerText = "Jugar 🎮";
                btnJugar.onclick = () => startQuiz(q);
            }
            
            div.appendChild(btnJugar);

            if (q.author === currentUser) {
                const btnAjustes = document.createElement('button');
                btnAjustes.className = "btn-small";
                btnAjustes.innerText = "⚙️ Ajustes";
                btnAjustes.style.marginTop = "10px";
                btnAjustes.onclick = () => openSettings(q);
                div.appendChild(btnAjustes);
            }
            list.appendChild(div);
        });
    });

    // 3. Ranking Global
    onSnapshot(collection(window.db, "scores"), (snap) => {
        const rList = document.getElementById('global-ranking-list');
        rList.innerHTML = "<h3>🏆 Ranking Global</h3>";
        let totals = {};
        snap.forEach(d => {
            const s = d.data();
            if(s.user) totals[s.user] = (totals[s.user] || 0) + (s.points || 0);
        });
        Object.entries(totals).sort((a,b) => b[1]-a[1]).forEach(([u, p]) => {
            rList.innerHTML += `<div class="ranking-item"><span>${u}</span><b>${p} pts</b></div>`;
        });
    });
}

function startQuiz(quiz) {
    showScreen('quiz-screen');
    document.getElementById('current-quiz-title').innerText = quiz.title;
    const cont = document.getElementById('options-container');
    cont.innerHTML = `<p>${quiz.q}</p>`;
    quiz.opts.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = "btn-main";
        btn.style.background = "white"; btn.style.color = "#6c5ce7";
        btn.innerText = opt;
        btn.onclick = async () => {
            const acerto = (i === 0);
            await addDoc(collection(window.db, "scores"), {
                user: currentUser, 
                points: acerto ? 1 : 0, 
                quizId: quiz.id,
                acerto: acerto,
                date: serverTimestamp()
            });
            alert(acerto ? "✅ ¡Correcto!" : "❌ Incorrecto");
            window.showHome();
        };
        cont.appendChild(btn);
    });
}

function openSettings(quiz) {
    document.getElementById('settings-quiz-title').innerText = `Ajustes: ${quiz.title}`;
    showScreen('settings-screen');

    document.getElementById('btn-delete-quiz').onclick = async () => {
        if(confirm("¿Eliminar este quiz?")) {
            await deleteDoc(doc(window.db, "quizzes", quiz.id));
            window.showHome();
        }
    };

    document.getElementById('btn-view-responses').onclick = async () => {
        showScreen('responses-screen');
        const table = document.getElementById('responses-table');
        table.innerHTML = "Cargando...";
        const q = query(collection(window.db, "scores"), where("quizId", "==", quiz.id));
        const snap = await getDocs(q);
        table.innerHTML = snap.empty ? "Sin respuestas." : "";
        snap.forEach(d => {
            const r = d.data();
            table.innerHTML += `<div class="ranking-item"><span>${r.user}</span><b>${r.acerto ? "✅" : "❌"}</b></div>`;
        });
    };
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-login-action').onclick = handleLogin;
    document.getElementById('btn-logout').onclick = () => { localStorage.clear(); location.reload(); };
    document.getElementById('btn-go-editor').onclick = () => showScreen('editor-screen');
    document.getElementById('btn-back-home').onclick = () => window.showHome();
    document.getElementById('btn-save-quiz').onclick = async () => {
        const title = document.getElementById('quiz-title-input').value;
        const q = document.getElementById('q-text').value;
        const opts = Array.from(document.querySelectorAll('.opt-input')).map(i => i.value);
        await addDoc(collection(window.db, "quizzes"), { title, q, opts, author: currentUser });
        window.showHome();
    };
    document.getElementById('btn-add-option').onclick = () => {
        const inp = document.createElement('input');
        inp.className = "opt-input"; inp.placeholder = "Incorrecta";
        document.getElementById('options-setup').appendChild(inp);
    };
});

window.showHome();