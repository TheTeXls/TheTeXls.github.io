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

/**
 * Actualiza la interfaz del creador (V1.4)
 */
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
    } else { 
        previewCont.classList.add('hidden'); 
    }
}

window.removeQuestion = (index) => {
    tempQuestions.splice(index, 1);
    updateEditorUI();
};

/**
 * Resetea el constructor de preguntas con diseño V1.4
 */
function resetEditorInputs() {
    const qText = document.getElementById('q-text');
    if (qText) qText.value = "";

    const correctPlaceholder = document.getElementById('correct-option-placeholder');
    if (correctPlaceholder) {
        correctPlaceholder.innerHTML = `<input type="text" class="opt-input" data-correct="true" placeholder="✅ Respuesta Correcta">`;
    }

    const setup = document.getElementById('options-setup');
    if (setup) {
        setup.innerHTML = `
            <input type="text" class="opt-input" placeholder="❌ Opción incorrecta">
            <input type="text" class="opt-input" placeholder="❌ Opción incorrecta">
            <input type="text" class="opt-input" placeholder="❌ Opción incorrecta">`;
    }
    updateEditorUI();
}

// ==========================================
// 3. AUTENTICACIÓN
// ==========================================
async function handleLogin() {
    const nameInput = document.getElementById('user-name-input');
    const passInput = document.getElementById('user-pass-input');
    
    const rawName = nameInput.value.trim();
    const pass = passInput.value.trim();

    if (!rawName || !pass) return alert("Completa los datos");

    const lowerName = rawName.toLowerCase();
    
    if (lowerName === ADMIN_ID && pass === ADMIN_PASS) {
        currentUser = ADMIN_ID;
        displayName = "Admin Maestro";
    } else {
        const userRef = doc(window.db, "users", lowerName);
        try {
            const snap = await getDoc(userRef);
            if (snap.exists()) {
                if (snap.data().pass !== pass) return alert("Contraseña incorrecta");
                displayName = snap.data().originalName;
            } else {
                await setDoc(userRef, { originalName: rawName, pass: pass, createdAt: serverTimestamp() });
                displayName = rawName;
            }
            currentUser = lowerName;
        } catch (e) { return alert("Error de base de datos."); }
    }

    localStorage.setItem('quizUser', currentUser);
    localStorage.setItem('quizDisplayName', displayName);
    window.showHome();
}

// ==========================================
// 4. TIEMPO REAL Y BLINDAJE (V1.2)
// ==========================================
async function initRealtime() {
    if (isListening) return;
    isListening = true;

    // Mapa de usuarios
    const uSnap = await getDocs(collection(window.db, "users"));
    uSnap.forEach(u => userMap[u.id] = u.data().originalName);
    userMap["admin"] = "Admin Maestro";

    if (currentUser === ADMIN_ID) {
        const panel = document.getElementById('admin-controls');
        if (panel) panel.classList.remove('hidden');
    }

    const quizList = document.getElementById('quiz-list');
    const loadingStatus = document.getElementById('quiz-loading-status');

    // Listener de Quizzes
    onSnapshot(collection(window.db, "quizzes"), async (snap) => {
        if (loadingStatus) loadingStatus.classList.add('hidden');
        if (!quizList) return;

        quizList.innerHTML = snap.empty ? "<p>No hay quizzes aún.</p>" : "";

        // Parche no repetición
        let playedIds = [];
        const scoreSnap = await getDocs(query(collection(window.db, "scores"), where("user", "==", currentUser)));
        playedIds = scoreSnap.docs.map(doc => doc.data().quizId);

        snap.forEach(d => {
            const q = d.data();
            const qId = d.id;
            const div = document.createElement('div');
            div.className = 'quiz-card';
            
            const isAuthor = (q.author === displayName);
            const played = playedIds.includes(qId);

            div.innerHTML = `
                <div style="margin-bottom:15px">
                    <h4 style="font-size:18px; margin-bottom:5px">${q.title}</h4>
                    <span class="badge">${q.questions.length} preg.</span>
                    <small style="margin-left:10px; color:#64748b">por ${q.author}</small>
                </div>
            `;

            const btn = document.createElement('button');
            btn.className = "btn-main btn-purple";

            if (currentUser === ADMIN_ID) {
                btn.innerText = "Probar Quiz (Admin)";
                btn.onclick = () => startQuizSession({id: qId, ...q});
            } else if (isAuthor) {
                btn.innerText = "Tu creación";
                btn.disabled = true;
                btn.style.opacity = "0.5";
            } else if (played) {
                btn.innerText = "Completado ✅";
                btn.disabled = true;
                btn.style.background = "#f1f5f9";
                btn.style.color = "#94a3b8";
            } else {
                btn.innerText = "Jugar ahora";
                btn.onclick = () => startQuizSession({id: qId, ...q});
            }

            if (currentUser === ADMIN_ID || isAuthor) {
                const bS = document.createElement('button');
                bS.className = "btn-small";
                bS.style.position = "absolute"; bS.style.top = "20px"; bS.style.right = "20px";
                bS.innerHTML = "⚙️";
                bS.onclick = (e) => { e.stopPropagation(); openSettings({id: qId, ...q}); };
                div.appendChild(bS);
            }

            div.appendChild(btn);
            quizList.appendChild(div);
        });
    });

    // Listener Ranking
    onSnapshot(collection(window.db, "scores"), (snap) => {
        const rList = document.getElementById('global-ranking-list');
        if (!rList) return;
        rList.innerHTML = snap.empty ? "<p>Nadie aún.</p>" : "";
        
        let scores = {};
        snap.forEach(d => {
            const s = d.data();
            if (s.user) scores[s.user] = (scores[s.user] || 0) + s.points;
        });

        Object.entries(scores).sort((a,b) => b[1]-a[1]).forEach(([uid, pts], i) => {
            const medal = i===0?"🥇":i===1?"🥈":i===2?"🥉":"";
            rList.innerHTML += `
                <div class="ranking-item">
                    <span>${medal} ${userMap[uid] || uid}</span>
                    <b style="color:#6366f1">${pts} pts</b>
                </div>`;
        });
    });
}

// ==========================================
// 5. JUEGO
// ==========================================
function startQuizSession(quiz) {
    activeQuiz = quiz; currentQIdx = 0; sessionScore = 0;
    showScreen('quiz-screen'); renderQuestion();
}

function renderQuestion() {
    const qData = activeQuiz.questions[currentQIdx];
    document.getElementById('current-quiz-title').innerText = activeQuiz.title;
    const cont = document.getElementById('options-container');
    if (!cont) return;

    cont.innerHTML = `
        <div style="background:#f1f5f9; padding:30px; border-radius:20px; margin-bottom:25px;">
            <p style="font-size:20px; font-weight:700; color:#1e293b;">${qData.text}</p>
        </div>
    `;

    const correct = qData.opts[0];
    [...qData.opts].sort(() => Math.random() - 0.5).forEach(opt => {
        const b = document.createElement('button');
        b.className = "btn-main btn-purple";
        b.style.marginBottom = "12px";
        b.innerText = opt;
        b.onclick = async () => {
            if (opt === correct) sessionScore++;
            currentQIdx++;
            if (currentQIdx < activeQuiz.questions.length) renderQuestion();
            else {
                if (currentUser !== ADMIN_ID) {
                    await addDoc(collection(window.db, "scores"), { 
                        user: currentUser, points: sessionScore, quizId: activeQuiz.id, date: serverTimestamp() 
                    });
                }
                alert("Finalizado. Puntos: " + sessionScore);
                window.showHome();
            }
        };
        cont.appendChild(b);
    });
}

// ==========================================
// 6. GESTIÓN
// ==========================================
function openSettings(quiz) {
    document.getElementById('settings-quiz-title').innerText = quiz.title;
    showScreen('settings-screen');
    
    document.getElementById('btn-delete-quiz').onclick = async () => {
        if (confirm("¿Eliminar?")) {
            await deleteDoc(doc(window.db, "quizzes", quiz.id));
            window.showHome();
        }
    };

    document.getElementById('btn-view-responses').onclick = async () => {
        showScreen('responses-screen');
        const t = document.getElementById('responses-table');
        t.innerHTML = "Cargando...";
        const sn = await getDocs(query(collection(window.db, "scores"), where("quizId", "==", quiz.id)));
        t.innerHTML = sn.empty ? "Sin respuestas" : "";
        sn.forEach(d => {
            const r = d.data();
            t.innerHTML += `<div class="ranking-item"><span>${userMap[r.user] || r.user}</span><b>${r.points} pts</b></div>`;
        });
    };
}

// ==========================================
// 7. INICIALIZACIÓN
// ==========================================
window.showHome = () => {
    if (!currentUser) return showScreen('login-screen');
    showScreen('home-screen');
    document.getElementById('user-display').innerText = "👤 " + displayName;
    initRealtime();
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-login-action').onclick = handleLogin;
    document.getElementById('btn-logout').onclick = () => { localStorage.clear(); location.reload(); };
    
    document.getElementById('btn-go-editor').onclick = () => {
        tempQuestions = [];
        document.getElementById('quiz-title-input').value = "";
        resetEditorInputs();
        showScreen('editor-screen');
    };

    document.getElementById('btn-add-option').onclick = () => {
        const setup = document.getElementById('options-setup');
        if (setup.querySelectorAll('input').length >= 5) return alert("Máximo 6 opciones totales");
        const i = document.createElement('input');
        i.className = "opt-input"; i.placeholder = "❌ Opción incorrecta";
        setup.appendChild(i);
    };

    document.getElementById('btn-next-q').onclick = () => {
        const t = document.getElementById('q-text').value.trim();
        const opts = Array.from(document.querySelectorAll('.opt-input')).map(i => i.value.trim());
        if (!t || opts.some(o => !o)) return alert("Completa la pregunta");
        tempQuestions.push({ text: t, opts: opts });
        resetEditorInputs();
    };

    document.getElementById('btn-save-quiz').onclick = async () => {
        const title = document.getElementById('quiz-title-input').value.trim();
        if (!title || tempQuestions.length < 5) return alert("Falta título o preguntas (min 5)");
        await addDoc(collection(window.db, "quizzes"), { title, questions: tempQuestions, author: displayName, createdAt: serverTimestamp() });
        window.showHome();
    };

    document.getElementById('btn-reset-ranking').onclick = async () => {
        if (confirm("¿RESETEAR TODO?")) {
            const batch = writeBatch(window.db);
            const sn = await getDocs(collection(window.db, "scores"));
            sn.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
    };

    document.getElementById('btn-back-home').onclick = () => window.showHome();
    document.getElementById('btn-settings-back').onclick = () => window.showHome();
    document.getElementById('btn-responses-back').onclick = () => showScreen('settings-screen');

    window.showHome();
});