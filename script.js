import { collection, addDoc, onSnapshot, doc, getDoc, setDoc, deleteDoc, serverTimestamp, query, where, getDocs, writeBatch } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- CONFIGURACIÓN ADMIN ---
const ADMIN_USER = "corban"; // Cambia esto al nombre de tu usuario principal en minúsculas

let currentUser = localStorage.getItem('quizUser') || null;
let displayName = localStorage.getItem('quizDisplayName') || null;

function showScreen(id) {
    document.querySelectorAll('.container').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

window.showHome = function() {
    if (!currentUser) return showScreen('login-screen');
    showScreen('home-screen');
    document.getElementById('user-display').innerText = `👤 ${displayName || currentUser}`;
    
    // Mostrar botón de restaurar ranking solo si es admin
    const adminBtn = document.getElementById('btn-admin-reset');
    if (currentUser === ADMIN_USER) adminBtn.classList.remove('hidden');
    else adminBtn.classList.add('hidden');

    initRealtime();
}

async function handleLogin() {
    const rawName = document.getElementById('user-name-input').value.trim();
    const pass = document.getElementById('user-pass-input').value.trim();
    if (!rawName || !pass) return alert("Completa los datos");

    const lowerName = rawName.toLowerCase();
    const userRef = doc(window.db, "users", lowerName);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
        if (snap.data().pass !== pass) return alert("Contraseña incorrecta");
        displayName = snap.data().originalName || rawName;
    } else {
        await setDoc(userRef, { originalName: rawName, pass: pass, createdAt: serverTimestamp() });
        displayName = rawName;
    }

    currentUser = lowerName;
    localStorage.setItem('quizUser', currentUser);
    localStorage.setItem('quizDisplayName', displayName);
    window.showHome();
}

async function initRealtime() {
    const qScores = query(collection(window.db, "scores"), where("user", "==", currentUser));
    const scoreSnap = await getDocs(qScores);
    const playedQuizIds = scoreSnap.docs.map(d => d.data().quizId);

    onSnapshot(collection(window.db, "quizzes"), (snap) => {
        const list = document.getElementById('quiz-list');
        list.innerHTML = "<h3>Quizzes Disponibles</h3>";
        snap.forEach(d => {
            const q = { id: d.id, ...d.data() };
            const isPlayed = playedQuizIds.includes(q.id);
            const isAdmin = (currentUser === ADMIN_USER);
            
            const div = document.createElement('div');
            div.className = 'quiz-card';
            div.innerHTML = `<b>${q.title}</b><br><small>Por: ${q.author}</small>`;
            
            const btnJugar = document.createElement('button');
            btnJugar.className = "btn-main";
            
            if (isPlayed) {
                btnJugar.innerText = "Ya jugaste este quiz";
                btnJugar.disabled = true;
                btnJugar.style.background = "#b2bec3";
            } else {
                btnJugar.innerText = "Jugar 🎮";
                btnJugar.onclick = () => startQuiz(q);
            }
            div.appendChild(btnJugar);

            // CONTROL DE QUIZZES (Para autor O para Admin)
            if (q.author.toLowerCase() === currentUser || isAdmin) {
                const btnAjustes = document.createElement('button');
                btnAjustes.className = "btn-small";
                btnAjustes.innerText = isAdmin && q.author.toLowerCase() !== currentUser ? "⚙️ Ajustes (Admin)" : "⚙️ Ajustes";
                btnAjustes.style.marginTop = "10px";
                btnAjustes.onclick = () => openSettings(q);
                div.appendChild(btnAjustes);
            }
            list.appendChild(div);
        });
    });

    onSnapshot(collection(window.db, "scores"), (snap) => {
        const rList = document.getElementById('global-ranking-list');
        rList.innerHTML = "<h3>🏆 Ranking Global</h3>";
        let totals = {};
        snap.forEach(d => {
            const s = d.data();
            const userKey = s.user.toLowerCase();
            if(userKey) totals[userKey] = (totals[userKey] || 0) + (s.points || 0);
        });
        Object.entries(totals).sort((a,b) => b[1]-a[1]).forEach(([u, p]) => {
            rList.innerHTML += `<div class="ranking-item"><span>${u}</span><b>${p} pts</b></div>`;
        });
    });
}

// RESTAURAR RANKING (Función Admin)
async function resetRanking() {
    if (!confirm("⚠️ ¿ESTÁS SEGURO? Esto borrará TODOS los puntos y permitirá que todos vuelvan a jugar los quizzes.")) return;
    
    try {
        const scoresSnap = await getDocs(collection(window.db, "scores"));
        const batch = writeBatch(window.db);
        scoresSnap.forEach((d) => {
            batch.delete(d.ref);
        });
        await batch.commit();
        alert("Ranking restaurado y historial de juegos limpio.");
        location.reload();
    } catch (e) {
        alert("Error al restaurar");
    }
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
        if(confirm("¿Eliminar este quiz definitivamente?")) {
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
    document.getElementById('btn-admin-reset').onclick = resetRanking;
    document.getElementById('btn-save-quiz').onclick = async () => {
        const title = document.getElementById('quiz-title-input').value;
        const qText = document.getElementById('q-text').value;
        const opts = Array.from(document.querySelectorAll('.opt-input')).map(i => i.value);
        await addDoc(collection(window.db, "quizzes"), { title, q: qText, opts, author: displayName });
        window.showHome();
    };
    document.getElementById('btn-add-option').onclick = () => {
        const inp = document.createElement('input');
        inp.className = "opt-input"; inp.placeholder = "Incorrecta";
        document.getElementById('options-setup').appendChild(inp);
    };
});

window.showHome();