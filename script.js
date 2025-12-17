import { 
    collection, addDoc, onSnapshot, doc, getDoc, setDoc, 
    deleteDoc, serverTimestamp, query, where, getDocs, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const ADMIN_ID = "admin";
const ADMIN_PASS = "gem";

let currentUser = localStorage.getItem('quizUser') || null;
let displayName = localStorage.getItem('quizDisplayName') || null;

let tempQuestions = [];
let activeQuiz = null;
let currentQIdx = 0;
let sessionScore = 0;
let sessionDetails = [];

function showScreen(id) {
    const screens = document.querySelectorAll('.container');
    screens.forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(id);
    if(target) target.classList.remove('hidden');
}

// --- LIMPIEZA AUTOMÁTICA ---
async function cleanupOldQuizzes() {
    const now = Date.now();
    const fiveHoursInMs = 5 * 60 * 60 * 1000;
    try {
        const querySnap = await getDocs(collection(window.db, "quizzes"));
        const batch = writeBatch(window.db);
        let count = 0;
        querySnap.forEach((d) => {
            const data = d.data();
            if (data.createdAt && data.createdAt.toMillis) {
                if (now - data.createdAt.toMillis() > fiveHoursInMs) {
                    batch.delete(d.ref);
                    count++;
                }
            }
        });
        if (count > 0) await batch.commit();
    } catch (e) { console.error("Error limpieza:", e); }
}

window.showHome = function() {
    if (!currentUser) return showScreen('login-screen');
    showScreen('home-screen');
    const display = document.getElementById('user-display');
    if(display) display.innerText = `👤 ${displayName}`;
    cleanupOldQuizzes();
    initRealtime();
};

async function handleLogin() {
    const nameInput = document.getElementById('user-name-input');
    const passInput = document.getElementById('user-pass-input');
    if(!nameInput || !passInput) return;

    const rawName = nameInput.value.trim();
    const pass = passInput.value.trim();
    if (!rawName || !pass) return alert("Rellena los campos");
    
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
    // 1. Nombres de usuarios
    const nameMap = { "admin": "Admin Maestro" };
    try {
        const uSnap = await getDocs(collection(window.db, "users"));
        uSnap.forEach(u => { nameMap[u.id] = u.data().originalName; });
    } catch(e){}

    // 2. Quizzes jugados (Validación de existencia)
    let playedQuizIds = [];
    if (currentUser && currentUser !== ADMIN_ID) {
        try {
            const qScores = query(collection(window.db, "scores"), where("user", "==", currentUser));
            const scoreSnap = await getDocs(qScores);
            playedQuizIds = scoreSnap.docs.map(d => d.data().quizId);
        } catch(e){}
    }

    // 3. Listener de Quizzes con ESCUDO DE SEGURIDAD (Línea 76 corregida)
    onSnapshot(collection(window.db, "quizzes"), (snap) => {
        const list = document.getElementById('quiz-list');
        if(!list) return;
        list.innerHTML = "<h3>Quizzes Disponibles</h3>";
        
        if (snap.empty) {
            list.innerHTML += `<div id="no-quizzes-msg">No hay quizzes 😴</div>`;
            return;
        }

        snap.forEach(d => {
            const q = d.data();
            const qId = d.id;
            // ESCUDO: Si no hay preguntas, ponemos 0 en lugar de romper el código
            const totalQ = (q.questions && Array.isArray(q.questions)) ? q.questions.length : 0;
            
            const isPlayed = playedQuizIds.includes(qId);
            const isAdmin = (currentUser === ADMIN_ID);
            const isAuthor = (q.author && q.author.toLowerCase() === currentUser);
            
            const div = document.createElement('div');
            div.className = 'quiz-card';
            div.innerHTML = `<b>${q.title || 'Sin título'}</b><br><small>${totalQ} preguntas • Por: ${q.author || 'Anon'}</small>`;
            
            const btn = document.createElement('button');
            btn.className = "btn-main";
            
            if (isAdmin) {
                btn.innerText = "Probar (Admin) 🎮";
                btn.onclick = () => startQuizSession({id: qId, ...q});
            } else if (isAuthor) {
                btn.innerText = "Tu Quiz 🚫"; btn.disabled = true; btn.style.background = "#b2bec3";
            } else if (isPlayed) {
                btn.innerText = "Completado ✅"; btn.disabled = true; btn.style.background = "#b2bec3";
            } else if (totalQ === 0) {
                btn.innerText = "Incompleto ⚠️"; btn.disabled = true;
            } else {
                btn.innerText = "Jugar 🎮";
                btn.onclick = () => startQuizSession({id: qId, ...q});
            }
            div.appendChild(btn);

            if (isAdmin || isAuthor) {
                const bSet = document.createElement('button');
                bSet.className = "btn-small"; bSet.style.marginTop = "8px"; bSet.innerText = "⚙️ Ajustes";
                bSet.onclick = () => openSettings({id: qId, ...q});
                div.appendChild(bSet);
            }
            list.appendChild(div);
        });
    });

    // 4. Ranking
    onSnapshot(collection(window.db, "scores"), (snap) => {
        const rList = document.getElementById('global-ranking-list');
        if(!rList) return;
        rList.innerHTML = ""; 
        let totals = {};
        snap.forEach(d => {
            const s = d.data();
            if(s.user) {
                const u = s.user.toLowerCase();
                totals[u] = (totals[u] || 0) + (s.points || 0);
            }
        });

        Object.entries(totals).sort((a,b) => b[1]-a[1]).forEach(([u, p]) => {
            rList.innerHTML += `<div class="ranking-item"><span>${nameMap[u] || u}</span><b>${p} pts</b></div>`;
        });

        if (currentUser === ADMIN_ID) {
            const bRes = document.createElement('button');
            bRes.className = "btn-main btn-reset-admin"; bRes.innerText = "♻️ Reset Rankings";
            bRes.onclick = async () => {
                if(confirm("¿Borrar todo?")){
                    const b = writeBatch(window.db);
                    const sn = await getDocs(collection(window.db, "scores"));
                    sn.forEach(d => b.delete(d.ref));
                    await b.commit();
                }
            };
            rList.appendChild(bRes);
        }
    });
}

// --- JUEGO ---
function startQuizSession(quiz) {
    if(!quiz.questions || quiz.questions.length === 0) return alert("Error: Quiz sin preguntas.");
    activeQuiz = quiz;
    currentQIdx = 0;
    sessionScore = 0;
    sessionDetails = [];
    showScreen('quiz-screen');
    renderQuestion();
}

function renderQuestion() {
    const qData = activeQuiz.questions[currentQIdx];
    const titleEl = document.getElementById('current-quiz-title');
    if(titleEl) titleEl.innerText = `${activeQuiz.title} (${currentQIdx + 1}/${activeQuiz.questions.length})`;
    
    const cont = document.getElementById('options-container');
    if(!cont) return;
    cont.innerHTML = `<p style="font-size:18px; margin-bottom:20px; font-weight:bold;">${qData.text}</p>`;
    
    const shuffled = [...qData.opts].sort(() => Math.random() - 0.5);
    shuffled.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = "btn-main";
        btn.style.background = "white"; btn.style.color = "#6c5ce7"; btn.style.border = "2px solid #6c5ce7";
        btn.innerText = opt;
        btn.onclick = () => {
            const ok = (opt === qData.opts[0]);
            sessionDetails.push({ pregunta: qData.text, respuesta: opt, correcta: ok });
            if (ok) { sessionScore++; alert("✅ Correcto"); } else { alert("❌ Incorrecto"); }
            currentQIdx++;
            if (currentQIdx < activeQuiz.questions.length) renderQuestion();
            else finishGame();
        };
        cont.appendChild(btn);
    });
}

async function finishGame() {
    alert(`Fin. Puntos: ${sessionScore}`);
    if (currentUser !== ADMIN_ID) {
        await addDoc(collection(window.db, "scores"), {
            user: currentUser, points: sessionScore, totalQuestions: activeQuiz.questions.length,
            quizId: activeQuiz.id, details: sessionDetails, date: serverTimestamp()
        });
    }
    window.showHome();
}

// --- EDITOR Y AJUSTES ---
function openSettings(quiz) {
    document.getElementById('settings-quiz-title').innerText = `Ajustes: ${quiz.title}`;
    showScreen('settings-screen');
    document.getElementById('btn-delete-quiz').onclick = async () => {
        if(confirm("¿Borrar?")) { await deleteDoc(doc(window.db, "quizzes", quiz.id)); window.showHome(); }
    };
    document.getElementById('btn-view-responses').onclick = async () => {
        showScreen('responses-screen');
        const table = document.getElementById('responses-table');
        table.innerHTML = "Cargando...";
        const qQ = query(collection(window.db, "scores"), where("quizId", "==", quiz.id));
        const sn = await getDocs(qQ);
        table.innerHTML = sn.empty ? "Sin datos" : "";
        sn.forEach(d => {
            const r = d.data();
            const div = document.createElement('div');
            div.className = "quiz-card"; div.style.textAlign = "left";
            let detH = "";
            if(r.details) r.details.forEach((dt, i) => {
                detH += `<small>${i+1}. ${dt.pregunta}<br><span style="color:${dt.correcta?'green':'red'}">${dt.correcta?'✅':'❌'} ${dt.respuesta}</span></small><br>`;
            });
            div.innerHTML = `<b>👤 ${r.user}</b> - ${r.points} pts<hr>${detH}`;
            table.appendChild(div);
        });
    };
}

document.addEventListener('DOMContentLoaded', () => {
    const bLogin = document.getElementById('btn-login-action');
    if(bLogin) bLogin.onclick = handleLogin;
    
    const bLogout = document.getElementById('btn-logout');
    if(bLogout) bLogout.onclick = () => { localStorage.clear(); window.location.reload(); };
    
    const bGoEd = document.getElementById('btn-go-editor');
    if(bGoEd) bGoEd.onclick = () => {
        tempQuestions = [];
        document.getElementById('q-number-display').innerText = "Pregunta #1";
        document.getElementById('options-setup').innerHTML = `
            <input type="text" class="opt-input" placeholder="Opción Correcta">
            <input type="text" class="opt-input" placeholder="Opción Incorrecta">
            <input type="text" class="opt-input" placeholder="Opción Incorrecta">
            <input type="text" class="opt-input" placeholder="Opción Incorrecta">
        `;
        showScreen('editor-screen');
    };

    const bNext = document.getElementById('btn-next-q');
    if(bNext) bNext.onclick = () => {
        const text = document.getElementById('q-text').value.trim();
        const opts = Array.from(document.querySelectorAll('.opt-input')).map(i => i.value.trim());
        if(!text || opts.some(o => !o)) return alert("Incompleto");
        tempQuestions.push({ text, opts });
        document.getElementById('q-text').value = "";
        document.getElementById('q-number-display').innerText = `Pregunta #${tempQuestions.length + 1}`;
    };

    const bSave = document.getElementById('btn-save-quiz');
    if(bSave) bSave.onclick = async () => {
        const title = document.getElementById('quiz-title-input').value.trim();
        if(!title || tempQuestions.length < 5) return alert("Título o mínimo 5 preguntas.");
        await addDoc(collection(window.db, "quizzes"), { title, questions: tempQuestions, author: displayName, createdAt: serverTimestamp() });
        window.showHome();
    };

    document.getElementById('btn-back-home').onclick = () => window.showHome();
    document.getElementById('btn-settings-back').onclick = () => window.showHome();
    document.getElementById('btn-responses-back').onclick = () => showScreen('settings-screen');
});

window.showHome();