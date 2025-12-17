import { collection, addDoc, onSnapshot, doc, getDoc, setDoc, deleteDoc, serverTimestamp, query, where, getDocs, writeBatch } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const ADMIN_ID = "admin";
const ADMIN_PASS = "gem";

let currentUser = localStorage.getItem('quizUser') || null;
let displayName = localStorage.getItem('quizDisplayName') || null;

function showScreen(id) {
    document.querySelectorAll('.container').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

window.showHome = function() {
    if (!currentUser) return showScreen('login-screen');
    showScreen('home-screen');
    // Usamos el displayName (el nombre con mayúsculas/minúsculas original)
    document.getElementById('user-display').innerText = `👤 ${displayName}`;
    initRealtime();
}

async function handleLogin() {
    const rawName = document.getElementById('user-name-input').value.trim();
    const pass = document.getElementById('user-pass-input').value.trim();
    if (!rawName || !pass) return alert("Faltan datos");

    const lowerName = rawName.toLowerCase();

    if (lowerName === ADMIN_ID && pass === ADMIN_PASS) {
        currentUser = ADMIN_ID;
        displayName = "Admin Maestro";
    } else {
        const userRef = doc(window.db, "users", lowerName);
        const snap = await getDoc(userRef);
        
        if (snap.exists()) {
            if (snap.data().pass !== pass) return alert("Password incorrecto");
            // Recuperamos el nombre original guardado en la DB
            displayName = snap.data().originalName || rawName;
        } else {
            // Guardamos por primera vez el ID en minúsculas y el nombre como se escribió
            await setDoc(userRef, { 
                originalName: rawName, 
                pass: pass, 
                createdAt: serverTimestamp() 
            });
            displayName = rawName;
        }
        currentUser = lowerName;
    }

    localStorage.setItem('quizUser', currentUser);
    localStorage.setItem('quizDisplayName', displayName);
    window.showHome();
}

async function initRealtime() {
    // Primero obtenemos un mapa de todos los nombres originales para el ranking
    const usersSnap = await getDocs(collection(window.db, "users"));
    let nameMap = { "admin": "Admin Maestro" };
    usersSnap.forEach(u => {
        nameMap[u.id] = u.data().originalName;
    });

    let playedQuizIds = [];
    if (currentUser !== ADMIN_ID) {
        const qScores = query(collection(window.db, "scores"), where("user", "==", currentUser));
        const scoreSnap = await getDocs(qScores);
        playedQuizIds = scoreSnap.docs.map(d => d.data().quizId);
    }

    // QUIZZES
    onSnapshot(collection(window.db, "quizzes"), (snap) => {
        const list = document.getElementById('quiz-list');
        list.innerHTML = "<h3>Quizzes Disponibles</h3>";
        snap.forEach(d => {
            const q = { id: d.id, ...d.data() };
            const isPlayed = playedQuizIds.includes(q.id);
            const isAdmin = (currentUser === ADMIN_ID);
            
            const div = document.createElement('div');
            div.className = 'quiz-card';
            // Mostramos el autor tal cual se guardó
            div.innerHTML = `<b>${q.title}</b><br><small>Por: ${q.author}</small>`;
            
            const btnJugar = document.createElement('button');
            btnJugar.className = "btn-main";
            
            if (isPlayed && !isAdmin) {
                btnJugar.innerText = "Completado ✅";
                btnJugar.disabled = true;
                btnJugar.style.background = "#b2bec3";
            } else {
                btnJugar.innerText = isAdmin ? "Probar (Admin) 🎮" : "Jugar 🎮";
                btnJugar.onclick = () => startQuiz(q);
            }
            div.appendChild(btnJugar);

            if (isAdmin || (q.author && q.author.toLowerCase() === currentUser)) {
                const btnAjustes = document.createElement('button');
                btnAjustes.className = "btn-small";
                btnAjustes.style.marginTop = "8px";
                btnAjustes.innerText = isAdmin && (q.author.toLowerCase() !== currentUser) ? "⚙️ Gestionar Admin" : "⚙️ Mis Ajustes";
                btnAjustes.onclick = () => openSettings(q);
                div.appendChild(btnAjustes);
            }
            list.appendChild(div);
        });
    });

    // RANKING (Usa el mapa de nombres para mostrar el originalName)
    onSnapshot(collection(window.db, "scores"), (snap) => {
        const rList = document.getElementById('global-ranking-list');
        rList.innerHTML = "<h3>🏆 Ranking Global</h3>";
        let totals = {};
        snap.forEach(d => {
            const s = d.data();
            if(s.user) {
                const u = s.user.toLowerCase();
                totals[u] = (totals[u] || 0) + (s.points || 0);
            }
        });
        
        Object.entries(totals).sort((a,b) => b[1]-a[1]).forEach(([u, p]) => {
            // Buscamos el nombre bonito en el mapa, si no existe usamos el ID
            const nameToShow = nameMap[u] || u;
            rList.innerHTML += `<div class="ranking-item"><span>${nameToShow}</span><b>${p} pts</b></div>`;
        });

        if (currentUser === ADMIN_ID) {
            const btnReset = document.createElement('button');
            btnReset.innerText = "⚠️ Restaurar Ranking";
            btnReset.className = "btn-small btn-reset-admin";
            btnReset.onclick = resetRanking;
            rList.appendChild(btnReset);
        }
    });
}

async function resetRanking() {
    if (!confirm("¿Borrar todos los puntos?")) return;
    try {
        const scoresSnap = await getDocs(collection(window.db, "scores"));
        const batch = writeBatch(window.db);
        scoresSnap.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        alert("¡Todo borrado!");
        window.location.reload();
    } catch (e) { alert("Error"); }
}

function startQuiz(quiz) {
    showScreen('quiz-screen');
    document.getElementById('current-quiz-title').innerText = quiz.title;
    const cont = document.getElementById('options-container');
    cont.innerHTML = `<p>${quiz.q}</p>`;
    quiz.opts.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = "btn-main";
        btn.style.background = "white"; btn.style.color = "#6c5ce7"; btn.style.border = "2px solid #6c5ce7";
        btn.innerText = opt;
        btn.onclick = async () => {
            const acerto = (i === 0);
            await addDoc(collection(window.db, "scores"), {
                user: currentUser, points: acerto ? 1 : 0, quizId: quiz.id, acerto, date: serverTimestamp()
            });
            alert(acerto ? "✅ ¡Correcto!" : "❌ Mal");
            window.showHome();
        };
        cont.appendChild(btn);
    });
}

function openSettings(quiz) {
    document.getElementById('settings-quiz-title').innerText = `Ajustes: ${quiz.title}`;
    showScreen('settings-screen');
    document.getElementById('btn-delete-quiz').onclick = async () => {
        if(confirm(`¿Borrar "${quiz.title}"?`)) {
            await deleteDoc(doc(window.db, "quizzes", quiz.id));
            window.showHome();
        }
    };
    document.getElementById('btn-view-responses').onclick = async () => {
        showScreen('responses-screen');
        const table = document.getElementById('responses-table');
        table.innerHTML = "Cargando...";
        const qQuery = query(collection(window.db, "scores"), where("quizId", "==", quiz.id));
        const snap = await getDocs(qQuery);
        
        // Aquí también usamos un mapa rápido para los nombres de las respuestas
        const usersSnap = await getDocs(collection(window.db, "users"));
        let localMap = { "admin": "Admin Maestro" };
        usersSnap.forEach(u => localMap[u.id] = u.data().originalName);

        table.innerHTML = snap.empty ? "Sin respuestas." : "";
        snap.forEach(d => {
            const r = d.data();
            const n = localMap[r.user.toLowerCase()] || r.user;
            table.innerHTML += `<div class="ranking-item"><span>${n}</span><b>${r.acerto ? "✅" : "❌"}</b></div>`;
        });
    };
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-login-action').onclick = handleLogin;
    document.getElementById('btn-logout').onclick = () => { localStorage.clear(); window.location.reload(); };
    document.getElementById('btn-go-editor').onclick = () => showScreen('editor-screen');
    document.getElementById('btn-back-home').onclick = () => window.showHome();
    document.getElementById('btn-settings-back').onclick = () => window.showHome();
    document.getElementById('btn-responses-back').onclick = () => showScreen('settings-screen');

    document.getElementById('btn-save-quiz').onclick = async () => {
        const title = document.getElementById('quiz-title-input').value;
        const qText = document.getElementById('q-text').value;
        const opts = Array.from(document.querySelectorAll('.opt-input')).map(i => i.value);
        if(!title || !qText || opts.length < 2) return alert("Faltan datos");
        // Al guardar el quiz, usamos el displayName (el nombre bonito)
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