import { 
    collection, addDoc, onSnapshot, doc, getDoc, setDoc, 
    deleteDoc, serverTimestamp, query, where, getDocs, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. ESTADO GLOBAL
// ==========================================
const ADMIN_ID = "admin";
const ADMIN_PASS = "gem";

let currentUser = localStorage.getItem('quizUser') || null;
let displayName = localStorage.getItem('quizDisplayName') || null;
let tempQuestions = [];
let activeQuiz = null;
let currentQIdx = 0;
let sessionScore = 0;
let userMap = {};
let isListening = false;

// ==========================================
// 2. NAVEGACIÓN Y RENDERIZADO UI
// ==========================================
function showScreen(id) {
    document.querySelectorAll('.container').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(id);
    if (target) target.classList.remove('hidden');
}

function updateEditorUI() {
    const countBadge = document.getElementById('questions-added-count');
    const qLabel = document.getElementById('q-number-display');
    const previewCont = document.getElementById('editor-preview-container');
    const previewList = document.getElementById('editor-preview-list');

    if (countBadge) countBadge.innerText = `${tempQuestions.length} preguntas`;
    if (qLabel) qLabel.innerText = `Pregunta #${tempQuestions.length + 1}`;
    
    if (tempQuestions.length > 0) {
        previewCont.classList.remove('hidden');
        previewList.innerHTML = tempQuestions.map((q, i) => `
            <div class="ranking-item" style="font-size: 13px;">
                <span><b>${i+1}.</b> ${q.text}</span>
                <button onclick="window.removeQuestion(${i})" style="color:#ef4444; border:none; background:none; cursor:pointer; font-weight:bold;">✖</button>
            </div>`).join('');
    } else { if (previewCont) previewCont.classList.add('hidden'); }
}

window.removeQuestion = (index) => {
    tempQuestions.splice(index, 1);
    updateEditorUI();
};

function resetEditorInputs() {
    const qText = document.getElementById('q-text');
    if (qText) qText.value = "";
    const correctPlaceholder = document.getElementById('correct-option-placeholder');
    if (correctPlaceholder) correctPlaceholder.innerHTML = `<input type="text" class="opt-input" data-correct="true" placeholder="✅ Respuesta Correcta">`;
    const setup = document.getElementById('options-setup');
    if (setup) setup.innerHTML = `<input type="text" class="opt-input" placeholder="❌ Opción incorrecta"><input type="text" class="opt-input" placeholder="❌ Opción incorrecta"><input type="text" class="opt-input" placeholder="❌ Opción incorrecta">`;
    updateEditorUI();
}

// ==========================================
// 3. AUTENTICACIÓN
// ==========================================
async function handleLogin() {
    const nameInput = document.getElementById('user-name-input');
    const passInput = document.getElementById('user-pass-input');
    const rawName = nameInput.value?.trim();
    const pass = passInput.value?.trim();
    
    if (!rawName || !pass) return alert("Completa los datos");
    const lowerName = rawName.toLowerCase();
    
    try {
        if (lowerName === ADMIN_ID && pass === ADMIN_PASS) {
            currentUser = ADMIN_ID; displayName = "Admin Maestro";
        } else {
            const userRef = doc(window.db, "users", lowerName);
            const snap = await getDoc(userRef);
            if (snap.exists()) {
                if (snap.data().pass !== pass) return alert("Contraseña incorrecta");
                displayName = snap.data().originalName;
            } else {
                await setDoc(userRef, { originalName: rawName, pass: pass, createdAt: serverTimestamp() });
                displayName = rawName;
            }
            currentUser = lowerName;
        }
        localStorage.setItem('quizUser', currentUser);
        localStorage.setItem('quizDisplayName', displayName);
        window.showHome();
    } catch (e) { console.error("Login Error:", e); }
}

// ==========================================
// 4. TIEMPO REAL
// ==========================================
async function initRealtime() {
    if (isListening) return;
    isListening = true;
    
    try {
        const uSnap = await getDocs(collection(window.db, "users"));
        uSnap.forEach(u => userMap[u.id] = u.data().originalName);
        userMap["admin"] = "Admin Maestro";

        if (currentUser === ADMIN_ID) {
            const panel = document.getElementById('admin-controls');
            if (panel) panel.classList.remove('hidden');
        }

        const quizList = document.getElementById('quiz-list');
        onSnapshot(collection(window.db, "quizzes"), async (snap) => {
            const loading = document.getElementById('quiz-loading-status');
            if (loading) loading.classList.add('hidden');
            quizList.innerHTML = snap.empty ? "<p>No hay quizzes aún.</p>" : "";
            
            let playedIds = [];
            const scoreSnap = await getDocs(query(collection(window.db, "scores"), where("user", "==", currentUser)));
            playedIds = scoreSnap.docs.map(doc => doc.data().quizId);

            snap.forEach(d => {
                const q = d.data(); const qId = d.id;
                const div = document.createElement('div');
                div.className = 'quiz-card';
                const isAuthor = (q.author === displayName);
                const played = playedIds.includes(qId);
                
                div.innerHTML = `<div style="margin-bottom:15px"><h4 style="font-size:18px; margin-bottom:5px">${q.title}</h4><span class="badge">${q.questions.length} preg.</span></div>`;
                
                const btn = document.createElement('button');
                btn.className = "btn-main btn-purple";
                
                if (currentUser === ADMIN_ID) { 
                    btn.innerText = "Probar Quiz (Admin)"; 
                    btn.onclick = () => startQuizSession({id: qId, ...q}); 
                } else if (isAuthor) { 
                    btn.innerText = "Tu creación"; btn.disabled = true; btn.style.opacity = "0.5"; 
                } else if (played) { 
                    btn.innerText = "Completado ✅"; btn.disabled = true; btn.style.background = "#f1f5f9"; 
                } else { 
                    btn.innerText = "Jugar ahora"; 
                    btn.onclick = () => startQuizSession({id: qId, ...q}); 
                }
                
                div.appendChild(btn); 
                quizList.appendChild(div);
            });
        });

        onSnapshot(collection(window.db, "scores"), (snap) => {
            const rList = document.getElementById('global-ranking-list');
            if (!rList) return;
            rList.innerHTML = snap.empty ? "<p>Nadie aún.</p>" : "";
            let scores = {};
            snap.forEach(d => { const s = d.data(); if (s.user) scores[s.user] = (scores[s.user] || 0) + s.points; });
            Object.entries(scores).sort((a,b) => b[1]-a[1]).forEach(([uid, pts], i) => {
                const medal = i===0?"🥇":i===1?"🥈":i===2?"🥉":"";
                rList.innerHTML += `<div class="ranking-item"><span>${medal} ${userMap[uid] || uid}</span><b>${pts} pts</b></div>`;
            });
        });
    } catch (e) { console.error("Realtime Init Error:", e); }
}

// ==========================================
// 5. JUEGO V1.7 (BLINDAJE Y GRID DINÁMICO)
// ==========================================
async function startQuizSession(quiz) {
    if (currentUser !== ADMIN_ID) {
        const checkScore = await getDocs(query(
            collection(window.db, "scores"), 
            where("user", "==", currentUser),
            where("quizId", "==", quiz.id)
        ));

        let hasPoints = false;
        checkScore.forEach(d => { if (d.data().points > 0) hasPoints = true; });

        if (hasPoints) {
            alert("Ya tienes aciertos registrados. No puedes repetir este quiz.");
            return window.showHome();
        }
    }

    activeQuiz = quiz; 
    currentQIdx = 0; 
    sessionScore = 0;
    showScreen('quiz-screen'); 
    renderQuestion();
}

async function exitQuizSession() {
    if (confirm("¿Abandonar? Si tienes aciertos, se guardarán y no podrás volver a jugar.")) {
        if (sessionScore > 0 && currentUser !== ADMIN_ID) {
            try {
                await addDoc(collection(window.db, "scores"), { 
                    user: currentUser, points: sessionScore, quizId: activeQuiz.id, date: serverTimestamp() 
                });
                alert(`Puntuación de ${sessionScore} registrada.`);
            } catch (e) { console.error("Exit Save Error:", e); }
        }
        window.showHome();
    }
}

function renderQuestion() {
    const qData = activeQuiz.questions[currentQIdx];
    const titleElem = document.getElementById('current-quiz-title');
    if (titleElem) titleElem.innerText = activeQuiz.title;
    
    const cont = document.getElementById('options-container');
    cont.innerHTML = ""; 
    
    // Ajustar columnas según número de opciones (máximo 3 columnas para 6+ opciones)
    const numOpts = qData.opts.length;
    const gridCols = numOpts >= 6 ? "repeat(3, 1fr)" : "repeat(2, 1fr)";
    cont.style.display = "grid";
    cont.style.gridTemplateColumns = gridCols;
    cont.style.gap = "15px";

    const questionBox = document.createElement('div');
    questionBox.style = "grid-column: 1 / -1; background:#f8fafc; padding:20px; border-radius:15px; margin-bottom:10px; text-align:center; border: 1px solid #e2e8f0;";
    questionBox.innerHTML = `<p style="font-size:18px; font-weight:700;">${qData.text}</p>`;
    cont.appendChild(questionBox);

    const correct = qData.opts[0];
    [...qData.opts].sort(() => Math.random() - 0.5).forEach(opt => {
        const b = document.createElement('button');
        b.className = "btn-option-game"; // Asegúrate que tu CSS tenga este estilo
        b.innerText = opt;
        b.onclick = async () => {
            if (opt === correct) sessionScore++;
            currentQIdx++;
            if (currentQIdx < activeQuiz.questions.length) {
                renderQuestion();
            } else {
                if (currentUser !== ADMIN_ID) {
                    await addDoc(collection(window.db, "scores"), { 
                        user: currentUser, points: sessionScore, quizId: activeQuiz.id, date: serverTimestamp() 
                    });
                }
                alert("Quiz terminado. Aciertos: " + sessionScore);
                window.showHome();
            }
        };
        cont.appendChild(b);
    });

    const exitBtn = document.createElement('button');
    exitBtn.className = "btn-exit-quiz";
    exitBtn.style = "grid-column: 1 / -1; margin-top:20px; padding: 12px; border-radius: 10px; cursor: pointer;";
    exitBtn.innerText = "Sair del Quiz 🚪";
    exitBtn.onclick = exitQuizSession;
    cont.appendChild(exitBtn);
}

// ==========================================
// 6. GESTIÓN E INICIO
// ==========================================
window.showHome = () => { 
    if (!currentUser) return showScreen('login-screen'); 
    showScreen('home-screen'); 
    const uDisp = document.getElementById('user-display');
    if (uDisp) uDisp.innerText = "👤 " + displayName; 
    initRealtime(); 
};

document.addEventListener('DOMContentLoaded', () => {
    // Configuración de botones con verificaciones de existencia para evitar errores de consola
    const btnLogin = document.getElementById('btn-login-action');
    if (btnLogin) btnLogin.onclick = handleLogin;

    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) btnLogout.onclick = () => { localStorage.clear(); location.reload(); };

    const btnGoEditor = document.getElementById('btn-go-editor');
    if (btnGoEditor) btnGoEditor.onclick = () => { tempQuestions = []; resetEditorInputs(); showScreen('editor-screen'); };

    const btnAddOpt = document.getElementById('btn-add-option');
    if (btnAddOpt) btnAddOpt.onclick = () => {
        const setup = document.getElementById('options-setup');
        if (setup && setup.querySelectorAll('input').length < 10) {
            const i = document.createElement('input'); i.className = "opt-input"; i.placeholder = "❌ Opción incorrecta";
            setup.appendChild(i);
        }
    };

    const btnNextQ = document.getElementById('btn-next-q');
    if (btnNextQ) btnNextQ.onclick = () => {
        const t = document.getElementById('q-text')?.value.trim();
        const opts = Array.from(document.querySelectorAll('.opt-input')).map(i => i.value.trim());
        if (!t || opts.some(o => !o)) return alert("Faltan datos");
        tempQuestions.push({ text: t, opts: opts });
        resetEditorInputs();
    };

    const btnSaveQuiz = document.getElementById('btn-save-quiz');
    if (btnSaveQuiz) btnSaveQuiz.onclick = async () => {
        const title = document.getElementById('quiz-title-input')?.value.trim();
        if (!title || tempQuestions.length < 5) return alert("Min 5 preguntas");
        await addDoc(collection(window.db, "quizzes"), { title, questions: tempQuestions, author: displayName, createdAt: serverTimestamp() });
        window.showHome();
    };

    const btnResetRank = document.getElementById('btn-reset-ranking');
    if (btnResetRank) btnResetRank.onclick = async () => {
        if (confirm("¿Resetear ranking?")) {
            const batch = writeBatch(window.db);
            const sn = await getDocs(collection(window.db, "scores"));
            sn.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
    };

    // Botones de retroceso
    document.querySelectorAll('[id$="-back"], #btn-back-home').forEach(btn => {
        btn.onclick = () => window.showHome();
    });

    window.showHome();
});