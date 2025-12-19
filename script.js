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

// --- UTILIDADES ---
function showScreen(id) {
    const screens = document.querySelectorAll('.container');
    screens.forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(id);
    if(target) target.classList.remove('hidden');
}

// Esta función genera los 4 campos que te faltaban
function resetEditorInputs() {
    const setup = document.getElementById('options-setup');
    if(setup) {
        setup.innerHTML = `
            <input type="text" class="opt-input" placeholder="✅ Respuesta Correcta">
            <input type="text" class="opt-input" placeholder="❌ Respuesta Incorrecta">
            <input type="text" class="opt-input" placeholder="❌ Respuesta Incorrecta">
            <input type="text" class="opt-input" placeholder="❌ Respuesta Incorrecta">
        `;
    }
    const qText = document.getElementById('q-text');
    if(qText) qText.value = "";
}

// --- LIMPIEZA 5 HORAS ---
async function cleanupOldQuizzes() {
    const now = Date.now();
    const fiveHours = 5 * 60 * 60 * 1000;
    try {
        const snap = await getDocs(collection(window.db, "quizzes"));
        const batch = writeBatch(window.db);
        let count = 0;
        snap.forEach(d => {
            const data = d.data();
            if (data.createdAt?.toMillis && (now - data.createdAt.toMillis() > fiveHours)) {
                batch.delete(d.ref); count++;
            }
        });
        if (count > 0) await batch.commit();
    } catch (e) {}
}

window.showHome = function() {
    if (!currentUser) return showScreen('login-screen');
    showScreen('home-screen');
    const uDisp = document.getElementById('user-display');
    if(uDisp) uDisp.innerText = displayName;
    cleanupOldQuizzes();
    initRealtime();
};

async function handleLogin() {
    const rawName = document.getElementById('user-name-input').value.trim();
    const pass = document.getElementById('user-pass-input').value.trim();
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
    let playedIds = [];
    if (currentUser !== ADMIN_ID) {
        const qS = query(collection(window.db, "scores"), where("user", "==", currentUser));
        const sSnap = await getDocs(qS);
        playedIds = sSnap.docs.map(d => d.data().quizId);
    }

    onSnapshot(collection(window.db, "quizzes"), (snap) => {
        const list = document.getElementById('quiz-list');
        list.innerHTML = "<h3>Quizzes Disponibles</h3>";
        if (snap.empty) {
            list.innerHTML += `<div id="no-quizzes-msg">No hay quizzes 😴</div>`;
            return;
        }
        snap.forEach(d => {
            const q = d.data();
            const isPlayed = playedIds.includes(d.id);
            const isAuthor = (q.author?.toLowerCase() === currentUser);
            const div = document.createElement('div');
            div.className = 'quiz-card'; 
            div.innerHTML = `<b>${q.title}</b><br><small>${q.questions?.length || 0} preguntas • Por: ${q.author}</small>`;
            
            const btn = document.createElement('button');
            btn.className = "btn-main";
            if (currentUser === ADMIN_ID) {
                btn.innerText = "Probar (Admin) 🎮"; btn.onclick = () => startQuizSession({id: d.id, ...q});
            } else if (isAuthor) {
                btn.innerText = "Tu Quiz 🚫"; btn.disabled = true; btn.style.background = "#ccc";
            } else if (isPlayed) {
                btn.innerText = "Completado ✅"; btn.disabled = true; btn.style.background = "#ccc";
            } else {
                btn.innerText = "Jugar 🎮"; btn.onclick = () => startQuizSession({id: d.id, ...q});
            }
            div.appendChild(btn);

            if (currentUser === ADMIN_ID || isAuthor) {
                const bSet = document.createElement('button');
                bSet.className = "btn-small"; bSet.style.marginTop = "10px"; bSet.innerText = "⚙️ Ajustes";
                bSet.onclick = () => openSettings({id: d.id, ...q});
                div.appendChild(bSet);
            }
            list.appendChild(div);
        });
    });

    onSnapshot(collection(window.db, "scores"), (snap) => {
        const rList = document.getElementById('global-ranking-list');
        rList.innerHTML = ""; 
        let totals = {};
        snap.forEach(d => {
            const s = d.data();
            if(s.user) totals[s.user] = (totals[s.user] || 0) + (s.points || 0);
        });
        Object.entries(totals).sort((a,b) => b[1]-a[1]).forEach(([u, p]) => {
            rList.innerHTML += `<div class="ranking-item"><span>${u}</span><b>${p} pts</b></div>`;
        });
        if (currentUser === ADMIN_ID) {
            const bR = document.createElement('button');
            bR.className = "btn-reset-admin"; bR.innerText = "♻️ Reset Rankings";
            bR.onclick = async () => {
                if(confirm("¿Borrar todo?")){
                    const b = writeBatch(window.db);
                    const sn = await getDocs(collection(window.db, "scores"));
                    sn.forEach(d => b.delete(d.ref)); await b.commit();
                }
            };
            rList.appendChild(bR);
        }
    });
}

// --- JUEGO ---
function startQuizSession(quiz) {
    activeQuiz = quiz; currentQIdx = 0; sessionScore = 0; sessionDetails = [];
    showScreen('quiz-screen');
    renderQuestion();
}

function renderQuestion() {
    const qData = activeQuiz.questions[currentQIdx];
    document.getElementById('current-quiz-title').innerText = activeQuiz.title;
    const cont = document.getElementById('options-container');
    cont.innerHTML = `<p style="font-weight:bold; margin-bottom:15px;">${qData.text}</p>`;
    
    [...qData.opts].sort(() => Math.random() - 0.5).forEach(opt => {
        const btn = document.createElement('button');
        btn.className = "btn-main"; 
        btn.style.background = "white"; btn.style.color = "#6c5ce7"; btn.style.border = "2px solid #6c5ce7";
        btn.innerText = opt;
        btn.onclick = () => {
            const ok = (opt === qData.opts[0]);
            sessionDetails.push({ pregunta: qData.text, respuesta: opt, correcta: ok });
            if (ok) { sessionScore++; alert("✅ ¡Correcto!"); } else { alert("❌ Incorrecto"); }
            currentQIdx++;
            if (currentQIdx < activeQuiz.questions.length) renderQuestion();
            else finishGame();
        };
        cont.appendChild(btn);
    });
}

async function finishGame() {
    alert(`Fin. Puntos: ${sessionScore}/${activeQuiz.questions.length}`);
    if (currentUser !== ADMIN_ID) {
        await addDoc(collection(window.db, "scores"), {
            user: currentUser, points: sessionScore, totalQuestions: activeQuiz.questions.length,
            quizId: activeQuiz.id, details: sessionDetails, date: serverTimestamp()
        });
    }
    window.showHome();
}

function openSettings(quiz) {
    document.getElementById('settings-quiz-title').innerText = quiz.title;
    showScreen('settings-screen');
    document.getElementById('btn-delete-quiz').onclick = async () => {
        if(confirm("¿Borrar?")) { await deleteDoc(doc(window.db, "quizzes", quiz.id)); window.showHome(); }
    };
    document.getElementById('btn-view-responses').onclick = async () => {
        showScreen('responses-screen');
        const table = document.getElementById('responses-table');
        table.innerHTML = "Cargando...";
        const sn = await getDocs(query(collection(window.db, "scores"), where("quizId", "==", quiz.id)));
        table.innerHTML = sn.empty ? "Sin datos" : "";
        sn.forEach(d => {
            const r = d.data();
            const div = document.createElement('div');
            div.className = "quiz-card";
            let detH = "";
            if(r.details) r.details.forEach((dt, i) => {
                detH += `<div style="font-size:11px; margin-top:5px;">${i+1}. ${dt.pregunta}<br><b style="color:${dt.correcta?'#00b894':'#ff7675'}">${dt.respuesta}</b></div>`;
            });
            div.innerHTML = `<b>👤 ${r.user}</b>: ${r.points} pts<hr>${detH}`;
            table.appendChild(div);
        });
    };
}

// --- EVENTOS ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-login-action').onclick = handleLogin;
    document.getElementById('btn-logout').onclick = () => { localStorage.clear(); window.location.reload(); };
    
    document.getElementById('btn-go-editor').onclick = () => {
        tempQuestions = [];
        document.getElementById('q-number-display').innerText = "Pregunta #1";
        document.getElementById('questions-added-count').innerText = "Preparadas: 0";
        document.getElementById('quiz-title-input').value = "";
        resetEditorInputs(); // Restaurar campos al entrar
        showScreen('editor-screen');
    };

    document.getElementById('btn-next-q').onclick = () => {
        const text = document.getElementById('q-text').value.trim();
        const opts = Array.from(document.querySelectorAll('.opt-input')).map(i => i.value.trim());
        if(!text || opts.some(o => !o)) return alert("Incompleto");
        if(tempQuestions.length >= 10) return alert("Máximo 10");
        
        tempQuestions.push({ text, opts });
        document.getElementById('q-number-display').innerText = `Pregunta #${tempQuestions.length + 1}`;
        document.getElementById('questions-added-count').innerText = `Preparadas: ${tempQuestions.length}`;
        resetEditorInputs(); // Restaurar campos para la siguiente pregunta
    };

    document.getElementById('btn-save-quiz').onclick = async () => {
        const title = document.getElementById('quiz-title-input').value.trim();
        const curT = document.getElementById('q-text').value.trim();
        const curO = Array.from(document.querySelectorAll('.opt-input')).map(i => i.value.trim());
        
        if(curT && !curO.some(o => !o) && tempQuestions.length < 10) {
            tempQuestions.push({ text: curT, opts: curO });
        }

        if(!title || tempQuestions.length < 5) return alert("Título y mínimo 5 preguntas.");
        await addDoc(collection(window.db, "quizzes"), { title, questions: tempQuestions, author: displayName, createdAt: serverTimestamp() });
        window.showHome();
    };

    document.getElementById('btn-back-home').onclick = () => window.showHome();
    document.getElementById('btn-settings-back').onclick = () => window.showHome();
    document.getElementById('btn-responses-back').onclick = () => showScreen('settings-screen');
});

window.showHome();