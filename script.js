import { 
    collection, addDoc, onSnapshot, doc, getDoc, setDoc, 
    deleteDoc, serverTimestamp, query, where, getDocs, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 1. ESTADO GLOBAL
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

// 2. NAVEGACIÓN Y UI
function showScreen(id) {
    document.querySelectorAll('.container').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function updateEditorUI() {
    document.getElementById('questions-added-count').innerText = `Preguntas preparadas: ${tempQuestions.length}`;
    document.getElementById('q-number-display').innerText = `Pregunta #${tempQuestions.length + 1}`;
    const container = document.getElementById('editor-preview-container');
    const list = document.getElementById('editor-preview-list');
    
    if (tempQuestions.length > 0) {
        container.classList.remove('hidden');
        list.innerHTML = tempQuestions.map((q, i) => `
            <div class="preview-item">
                <span><b>${i+1}.</b> ${q.text}</span>
                <button onclick="window.removeQuestion(${i})" style="color:red; border:none; background:none; cursor:pointer; font-weight:bold;">✖</button>
            </div>`).join('');
    } else { container.classList.add('hidden'); }
}

window.removeQuestion = (index) => {
    tempQuestions.splice(index, 1);
    updateEditorUI();
};

function resetEditorInputs() {
    document.getElementById('options-setup').innerHTML = `
        <input type="text" class="opt-input" placeholder="✅ Respuesta Correcta">
        <input type="text" class="opt-input" placeholder="❌ Incorrecta">
        <input type="text" class="opt-input" placeholder="❌ Incorrecta">
        <input type="text" class="opt-input" placeholder="❌ Incorrecta">`;
    document.getElementById('q-text').value = "";
    updateEditorUI();
}

// 3. AUTENTICACIÓN
async function handleLogin() {
    const rawName = document.getElementById('user-name-input').value.trim();
    const pass = document.getElementById('user-pass-input').value.trim();
    if (!rawName || !pass) return alert("Completa los datos de acceso");
    const lowerName = rawName.toLowerCase();
    
    if (lowerName === ADMIN_ID && pass === ADMIN_PASS) {
        currentUser = ADMIN_ID; displayName = "Admin Maestro";
    } else {
        const userRef = doc(window.db, "users", lowerName);
        const snap = await getDoc(userRef);
        if (snap.exists() && snap.data().pass !== pass) return alert("Contraseña incorrecta");
        if (!snap.exists()) await setDoc(userRef, { originalName: rawName, pass: pass, createdAt: serverTimestamp() });
        displayName = snap.exists() ? snap.data().originalName : rawName;
        currentUser = lowerName;
    }
    localStorage.setItem('quizUser', currentUser);
    localStorage.setItem('quizDisplayName', displayName);
    window.showHome();
}

// 4. TIEMPO REAL Y BLINDAJE DE DATOS
async function initRealtime() {
    if (isListening) return; isListening = true;

    // Cargar mapa de usuarios para nombres reales
    const uSnap = await getDocs(collection(window.db, "users"));
    uSnap.forEach(u => userMap[u.id] = u.data().originalName);
    userMap["admin"] = "Admin Maestro";

    if(currentUser === ADMIN_ID) document.getElementById('admin-controls').classList.remove('hidden');

    const quizList = document.getElementById('quiz-list');
    const loadingStatus = document.getElementById('quiz-loading-status');

    // Listener de Quizzes con reaseguramiento
    onSnapshot(collection(window.db, "quizzes"), async (snap) => {
        // Blindaje: Solo ocultamos el loader si Firebase responde (vacío o con datos)
        loadingStatus.classList.add('hidden');
        quizList.innerHTML = snap.empty ? "<p style='padding:20px; color:#636e72;'>No hay quizzes disponibles en este momento.</p>" : "";

        // Obtener historial de juegos del usuario para bloqueo
        const scoreQuery = query(collection(window.db, "scores"), where("user", "==", currentUser));
        const scoreSnap = await getDocs(scoreQuery);
        const playedQuizIds = scoreSnap.docs.map(doc => doc.data().quizId);

        snap.forEach(d => {
            const q = d.data();
            const div = document.createElement('div'); div.className = 'quiz-card';
            div.innerHTML = `<b>${q.title}</b><br><small>${q.questions.length} preg. • Por: ${q.author}</small>`;
            
            const btn = document.createElement('button');
            btn.className = "btn-main btn-purple";
            
            const isAuthor = (q.author === displayName);
            const alreadyPlayed = playedQuizIds.includes(d.id);

            if (currentUser === ADMIN_ID) {
                btn.innerText = "Probar (Admin) 🎮";
                btn.onclick = () => startQuizSession({id: d.id, ...q});
            } else if (isAuthor) {
                btn.innerText = "Tu Quiz 🚫";
                btn.disabled = true;
            } else if (alreadyPlayed) {
                btn.innerText = "Completado ✅";
                btn.disabled = true;
            } else {
                btn.innerText = "Jugar 🎮";
                btn.onclick = () => startQuizSession({id: d.id, ...q});
            }

            // Botón de Ajustes para dueños o admin
            if (currentUser === ADMIN_ID || isAuthor) {
                const bS = document.createElement('button'); 
                bS.className = "btn-settings-corner"; bS.innerHTML = "⚙️ Ajustes";
                bS.onclick = (e) => { e.stopPropagation(); openSettings({id: d.id, ...q}); };
                div.appendChild(bS);
            }
            div.appendChild(btn); quizList.appendChild(div);
        });
    }, (error) => {
        console.error("Error de blindaje:", error);
        loadingStatus.innerHTML = "<p style='color:#d63031; font-weight:bold;'>⚠️ Error de sincronización. Reintenta.</p>";
    });

    // Listener Ranking
    onSnapshot(collection(window.db, "scores"), (snap) => {
        const rList = document.getElementById('global-ranking-list');
        if (snap.empty) { rList.innerHTML = "<p>El ranking está vacío.</p>"; return; }
        rList.innerHTML = ""; let totals = {};
        snap.forEach(d => { const s = d.data(); if(s.user) totals[s.user] = (totals[s.user]||0) + s.points; });
        Object.entries(totals).sort((a,b)=>b[1]-a[1]).forEach(([u, p], i) => {
            const medal = i===0?"🥇":i===1?"🥈":i===2?"🥉":"";
            rList.innerHTML += `<div class="ranking-item"><span>${medal} ${userMap[u]||u}</span><b>${p} pts</b></div>`;
        });
    });
}

// 5. LÓGICA DE JUEGO
function startQuizSession(quiz) {
    activeQuiz = quiz; currentQIdx = 0; sessionScore = 0;
    showScreen('quiz-screen'); renderQuestion();
}

function renderQuestion() {
    const qData = activeQuiz.questions[currentQIdx];
    document.getElementById('current-quiz-title').innerText = activeQuiz.title;
    const cont = document.getElementById('options-container');
    cont.innerHTML = `<p style="font-weight:bold; margin:20px 0;">${qData.text}</p>`;
    
    const correct = qData.opts[0];
    [...qData.opts].sort(()=>Math.random()-0.5).forEach(opt => {
        const b = document.createElement('button'); b.className="btn-main btn-purple"; b.innerText=opt;
        b.onclick = async () => {
            if(opt===correct) sessionScore++;
            currentQIdx++;
            if(currentQIdx < activeQuiz.questions.length) renderQuestion(); 
            else { 
                if(currentUser !== ADMIN_ID) {
                    await addDoc(collection(window.db, "scores"), { 
                        user: currentUser, points: sessionScore, quizId: activeQuiz.id, date: serverTimestamp() 
                    });
                }
                window.showHome();
            }
        };
        cont.appendChild(b);
    });
}

// 6. GESTIÓN (AJUSTES)
function openSettings(quiz) {
    document.getElementById('settings-quiz-title').innerText = quiz.title;
    showScreen('settings-screen');
    document.getElementById('btn-delete-quiz').onclick = async () => {
        if(confirm("¿Estás seguro de borrar este quiz para siempre?")) { 
            await deleteDoc(doc(window.db, "quizzes", quiz.id)); 
            window.showHome(); 
        }
    };
    document.getElementById('btn-view-responses').onclick = async () => {
        showScreen('responses-screen');
        const t = document.getElementById('responses-table'); t.innerHTML = "Cargando resultados...";
        const sn = await getDocs(query(collection(window.db, "scores"), where("quizId", "==", quiz.id)));
        t.innerHTML = sn.empty ? "Nadie ha respondido este quiz." : "";
        sn.forEach(d => { 
            const r = d.data(); 
            t.innerHTML += `<div class="quiz-card"><b>👤 ${userMap[r.user]||r.user}</b>: ${r.points} pts</div>`; 
        });
    };
}

// 7. EVENTOS E INICIALIZACIÓN FINAL
window.showHome = () => { 
    if (!currentUser) return showScreen('login-screen'); 
    showScreen('home-screen'); 
    document.getElementById('user-display').innerText = "👤 " + displayName; 
    initRealtime(); 
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-login-action').onclick = handleLogin;
    document.getElementById('btn-logout').onclick = () => { localStorage.clear(); location.reload(); };
    document.getElementById('btn-go-editor').onclick = () => { tempQuestions=[]; resetEditorInputs(); showScreen('editor-screen'); };
    
    document.getElementById('btn-add-option').onclick = () => {
        const setup = document.getElementById('options-setup');
        if (setup.querySelectorAll('input').length >= 6) return alert("Máximo 6 opciones.");
        const input = document.createElement('input'); 
        input.className = "opt-input"; input.placeholder = "❌ Respuesta Incorrecta";
        setup.appendChild(input);
    };

    document.getElementById('btn-next-q').onclick = () => {
        const t = document.getElementById('q-text').value.trim();
        const o = Array.from(document.querySelectorAll('.opt-input')).map(i=>i.value.trim());
        if(!t || o.some(x=>!x)) return alert("Todos los campos de la pregunta son obligatorios.");
        tempQuestions.push({text:t, opts:o});
        resetEditorInputs();
    };

    document.getElementById('btn-save-quiz').onclick = async () => {
        const title = document.getElementById('quiz-title-input').value.trim();
        if(!title || tempQuestions.length < 5) return alert("El quiz debe tener título y al menos 5 preguntas.");
        await addDoc(collection(window.db, "quizzes"), { 
            title, questions: tempQuestions, author: displayName, createdAt: serverTimestamp() 
        });
        window.showHome();
    };

    document.getElementById('btn-reset-ranking').onclick = async () => {
        if(confirm("¿RESET TOTAL? Esta acción borrará todos los puntos del ranking global.")) {
            const batch = writeBatch(window.db);
            const sn = await getDocs(collection(window.db, "scores"));
            sn.forEach(d => batch.delete(d.ref));
            await batch.commit();
            alert("Ranking reiniciado con éxito.");
        }
    };

    document.getElementById('btn-back-home').onclick = () => window.showHome();
    document.getElementById('btn-settings-back').onclick = () => window.showHome();
    document.getElementById('btn-responses-back').onclick = () => showScreen('settings-screen');

    window.showHome();
});