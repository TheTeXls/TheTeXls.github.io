import { collection, addDoc, onSnapshot, doc, getDoc, setDoc, deleteDoc, serverTimestamp, query, where, getDocs, writeBatch } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const ADMIN_ID = "admin";
const ADMIN_PASS = "gem";

let currentUser = localStorage.getItem('quizUser') || null;
let displayName = localStorage.getItem('quizDisplayName') || null;

// Variables de estado
let tempQuestions = [];
let activeQuiz = null;
let currentQIdx = 0;
let sessionScore = 0;

function showScreen(id) {
    document.querySelectorAll('.container').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

window.showHome = function() {
    if (!currentUser) return showScreen('login-screen');
    showScreen('home-screen');
    document.getElementById('user-display').innerText = `👤 ${displayName}`;
    initRealtime();
};

async function handleLogin() {
    const rawName = document.getElementById('user-name-input').value.trim();
    const pass = document.getElementById('user-pass-input').value.trim();
    if (!rawName || !pass) return alert("Faltan datos");
    const lowerName = rawName.toLowerCase();
    if (lowerName === ADMIN_ID && pass === ADMIN_PASS) {
        currentUser = ADMIN_ID; displayName = "Admin Maestro";
    } else {
        const userRef = doc(window.db, "users", lowerName);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
            if (snap.data().pass !== pass) return alert("Password incorrecto");
            displayName = snap.data().originalName || rawName;
        } else {
            await setDoc(userRef, { originalName: rawName, pass: pass, createdAt: serverTimestamp() });
            displayName = rawName;
        }
        currentUser = lowerName;
    }
    localStorage.setItem('quizUser', currentUser);
    localStorage.setItem('quizDisplayName', displayName);
    window.showHome();
}

async function initRealtime() {
    const usersSnap = await getDocs(collection(window.db, "users"));
    let nameMap = { "admin": "Admin Maestro" };
    usersSnap.forEach(u => { nameMap[u.id] = u.data().originalName; });

    let playedQuizIds = [];
    if (currentUser !== ADMIN_ID) {
        const qScores = query(collection(window.db, "scores"), where("user", "==", currentUser));
        const scoreSnap = await getDocs(qScores);
        playedQuizIds = scoreSnap.docs.map(d => d.data().quizId);
    }

    // Listener de Quizzes
    onSnapshot(collection(window.db, "quizzes"), (snap) => {
        const list = document.getElementById('quiz-list');
        list.innerHTML = "<h3>Quizzes Disponibles</h3>";
        snap.forEach(d => {
            const q = { id: d.id, ...d.data() };
            const numPreguntas = q.questions ? q.questions.length : 0;
            const isPlayed = playedQuizIds.includes(q.id);
            const isAdmin = (currentUser === ADMIN_ID);
            const isAuthor = (q.author && q.author.toLowerCase() === currentUser);
            
            const div = document.createElement('div');
            div.className = 'quiz-card';
            div.innerHTML = `<b>${q.title}</b><br><small>${numPreguntas} preguntas • Por: ${q.author}</small>`;
            
            const btnJugar = document.createElement('button');
            btnJugar.className = "btn-main";
            
            if (numPreguntas === 0 && !isAdmin) {
                btnJugar.innerText = "No compatible ⚠️";
                btnJugar.disabled = true;
                btnJugar.style.background = "#fab1a0";
            } else if (isAdmin) {
                btnJugar.innerText = "Probar (Admin) 🎮";
                btnJugar.onclick = () => startQuizSession(q);
            } else if (isAuthor) {
                btnJugar.innerText = "Tu Quiz 🚫";
                btnJugar.disabled = true;
                btnJugar.style.background = "#b2bec3";
            } else if (isPlayed) {
                btnJugar.innerText = "Completado ✅";
                btnJugar.disabled = true;
                btnJugar.style.background = "#b2bec3";
            } else {
                btnJugar.innerText = "Jugar 🎮";
                btnJugar.onclick = () => startQuizSession(q);
            }
            div.appendChild(btnJugar);

            if (isAdmin || isAuthor) {
                const btnAjustes = document.createElement('button');
                btnAjustes.className = "btn-small";
                btnAjustes.style.marginTop = "8px";
                btnAjustes.innerText = "⚙️ Ajustes";
                btnAjustes.onclick = () => openSettings(q);
                div.appendChild(btnAjustes);
            }
            list.appendChild(div);
        });
    });

    // Listener de Rankings con Botón Reset Reparado
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
            const nameToShow = nameMap[u] || u;
            rList.innerHTML += `<div class="ranking-item"><span>${nameToShow}</span><b>${p} pts</b></div>`;
        });

        if (currentUser === ADMIN_ID) {
            const btnReset = document.createElement('button');
            btnReset.className = "btn-main btn-reset-admin";
            btnReset.innerText = "♻️ Resetear Rankings";
            btnReset.onclick = async () => {
                if(confirm("¿Borrar todos los puntos del ranking?")){
                    const batch = writeBatch(window.db);
                    const snaps = await getDocs(collection(window.db, "scores"));
                    snaps.forEach(d => batch.delete(d.ref));
                    await batch.commit();
                    alert("Ranking reiniciado.");
                }
            };
            rList.appendChild(btnReset);
        }
    });
}

// --- JUEGO ---
function startQuizSession(quiz) {
    activeQuiz = quiz;
    currentQIdx = 0;
    sessionScore = 0;
    showScreen('quiz-screen');
    renderQuestion();
}

function renderQuestion() {
    const qData = activeQuiz.questions[currentQIdx];
    document.getElementById('current-quiz-title').innerText = `${activeQuiz.title} (${currentQIdx + 1}/${activeQuiz.questions.length})`;
    const cont = document.getElementById('options-container');
    cont.innerHTML = `<p style="font-size:18px; margin-bottom:20px;">${qData.text}</p>`;
    const shuffledOpts = [...qData.opts].sort(() => Math.random() - 0.5);
    shuffledOpts.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = "btn-main";
        btn.style.background = "white"; btn.style.color = "#6c5ce7"; btn.style.border = "2px solid #6c5ce7";
        btn.innerText = opt;
        btn.onclick = () => handleAnswer(opt === qData.opts[0]);
        cont.appendChild(btn);
    });
}

async function handleAnswer(isCorrect) {
    if (isCorrect) { sessionScore++; alert("✅ ¡Correcto!"); } 
    else { alert("❌ Incorrecto"); }
    currentQIdx++;
    if (currentQIdx < activeQuiz.questions.length) {
        renderQuestion();
    } else {
        alert(`🏁 Fin. Puntuación: ${sessionScore}/${activeQuiz.questions.length}`);
        if (currentUser !== ADMIN_ID) {
            await addDoc(collection(window.db, "scores"), {
                user: currentUser, points: sessionScore, quizId: activeQuiz.id, date: serverTimestamp()
            });
        }
        window.showHome();
    }
}

// --- EDITOR CON LÍMITES 5-10 ---
function nextQuestion() {
    if (tempQuestions.length >= 10) return alert("Máximo 10 preguntas alcanzado.");
    const text = document.getElementById('q-text').value.trim();
    const opts = Array.from(document.querySelectorAll('.opt-input')).map(i => i.value.trim());
    if(!text || opts.some(o => !o)) return alert("Completa la pregunta y opciones.");
    
    tempQuestions.push({ text, opts });
    document.getElementById('q-text').value = "";
    document.getElementById('options-setup').innerHTML = `
        <input type="text" class="opt-input" placeholder="Opción Correcta">
        <input type="text" class="opt-input" placeholder="Opción Incorrecta">
    `;
    document.getElementById('q-number-display').innerText = `Pregunta #${tempQuestions.length + 1}`;
    document.getElementById('questions-added-count').innerText = `Preguntas preparadas: ${tempQuestions.length}`;
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
        table.innerHTML = snap.empty ? "Sin respuestas." : "";
        snap.forEach(d => {
            const r = d.data();
            table.innerHTML += `<div class="ranking-item"><span>${r.user}</span><b>${r.points} pts</b></div>`;
        });
    };
}

// --- EVENTOS ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-login-action').onclick = handleLogin;
    document.getElementById('btn-logout').onclick = () => { localStorage.clear(); window.location.reload(); };
    
    document.getElementById('btn-go-editor').onclick = () => {
        tempQuestions = [];
        document.getElementById('questions-added-count').innerText = "Preguntas añadidas: 0";
        document.getElementById('q-number-display').innerText = "Pregunta #1";
        showScreen('editor-screen');
    };

    document.getElementById('btn-add-option').onclick = () => {
        const inp = document.createElement('input');
        inp.className = "opt-input"; inp.placeholder = "Otra incorrecta";
        document.getElementById('options-setup').appendChild(inp);
    };

    document.getElementById('btn-next-q').onclick = nextQuestion;

    document.getElementById('btn-save-quiz').onclick = async () => {
        const title = document.getElementById('quiz-title-input').value.trim();
        const curQText = document.getElementById('q-text').value.trim();
        const curOpts = Array.from(document.querySelectorAll('.opt-input')).map(i => i.value.trim());

        // Punto 7: Auto-guardar la pregunta actual si está completa
        if (curQText !== "" && !curOpts.some(o => o === "")) {
            if (tempQuestions.length < 10) {
                tempQuestions.push({ text: curQText, opts: curOpts });
            }
        }

        // Punto 1: Validar límites
        if (!title) return alert("Falta el título.");
        if (tempQuestions.length < 5) return alert(`Mínimo 5 preguntas (llevas ${tempQuestions.length})`);
        if (tempQuestions.length > 10) return alert("Máximo 10 preguntas.");
        
        await addDoc(collection(window.db, "quizzes"), {
            title, questions: tempQuestions, author: displayName, createdAt: serverTimestamp()
        });
        alert("¡Publicado!");
        window.showHome();
    };

    document.getElementById('btn-back-home').onclick = () => window.showHome();
    document.getElementById('btn-settings-back').onclick = () => window.showHome();
    document.getElementById('btn-responses-back').onclick = () => showScreen('settings-screen');
});

window.showHome();