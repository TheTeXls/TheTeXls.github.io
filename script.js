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
let sessionDetails = [];
let isListening = false;
let userMap = {};

// ==========================================
// 2. UTILIDADES UI
// ==========================================
function showScreen(id) {
    const screens = document.querySelectorAll('.container');
    screens.forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(id);
    if(target) target.classList.remove('hidden');
}

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
    document.getElementById('q-text').value = "";
    // CORRECCIÓN: Actualizar el número de pregunta visualmente
    document.getElementById('q-number-display').innerText = `Pregunta #${tempQuestions.length + 1}`;
}

function addExtraIncorrectOption() {
    const setup = document.getElementById('options-setup');
    if (setup.querySelectorAll('input').length >= 6) return alert("Máximo 6 opciones");
    const input = document.createElement('input');
    input.type = "text"; input.className = "opt-input";
    input.placeholder = "❌ Otra Respuesta Incorrecta";
    setup.appendChild(input);
}

// ==========================================
// 3. AUTENTICACIÓN
// ==========================================
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
        if (snap.exists() && snap.data().pass !== pass) return alert("Password incorrecto");
        if (!snap.exists()) await setDoc(userRef, { originalName: rawName, pass: pass, createdAt: serverTimestamp() });
        displayName = snap.exists() ? snap.data().originalName : rawName;
        currentUser = lowerName;
    }
    localStorage.setItem('quizUser', currentUser);
    localStorage.setItem('quizDisplayName', displayName);
    window.showHome();
}

// ==========================================
// 4. FIREBASE REALTIME
// ==========================================
async function initRealtime() {
    if (isListening) return;
    isListening = true;

    // Cargar nombres reales
    const uSnap = await getDocs(collection(window.db, "users"));
    uSnap.forEach(u => userMap[u.id] = u.data().originalName);
    userMap["admin"] = "Admin Maestro";

    // Mostrar panel de admin si aplica
    if(currentUser === ADMIN_ID) document.getElementById('admin-controls').classList.remove('hidden');

    // Listener Quizzes
    onSnapshot(collection(window.db, "quizzes"), async (snap) => {
        const list = document.getElementById('quiz-list');
        list.innerHTML = "<h3>Quizzes Disponibles</h3>";
        
        // CORRECCIÓN: Obtener IDs jugados para bloqueo real
        let playedIds = [];
        const qS = query(collection(window.db, "scores"), where("user", "==", currentUser));
        const sSnap = await getDocs(qS);
        playedIds = sSnap.docs.map(d => d.data().quizId);

        snap.forEach(d => {
            const q = d.data();
            const div = document.createElement('div');
            div.className = 'quiz-card'; 
            div.style.position = 'relative'; // Para posicionar el botón de ajustes
            
            div.innerHTML = `<b>${q.title}</b><br><small>${q.questions.length} preg. • Por: ${q.author}</small>`;
            
            const btn = document.createElement('button');
            btn.className = "btn-main";

            const isAuthor = q.author === displayName;
            const isPlayed = playedIds.includes(d.id);

            // CAMBIO: Lógica de botones y etiquetas
            if (currentUser === ADMIN_ID) {
                btn.innerText = "Probar (Admin) 🎮";
                btn.onclick = () => startQuizSession({id: d.id, ...q});
            } else if (isAuthor) {
                btn.innerText = "Tu Quiz 🚫";
                btn.disabled = true;
                btn.style.background = "#ccc";
            } else if (isPlayed) {
                btn.innerText = "Completado ✅";
                btn.disabled = true;
                btn.style.background = "#ccc";
            } else {
                btn.innerText = "Jugar 🎮";
                btn.onclick = () => startQuizSession({id: d.id, ...q});
            }

            // CAMBIO: Botón ajustes arriba a la derecha
            if (currentUser === ADMIN_ID || isAuthor) {
                const bS = document.createElement('button'); 
                bS.innerHTML="⚙️";
                bS.style.cssText = "position:absolute; top:10px; right:10px; border:none; background:none; cursor:pointer; font-size:18px;";
                bS.onclick = (e) => { e.stopPropagation(); openSettings({id: d.id, ...q}); };
                div.appendChild(bS);
            }

            div.appendChild(btn);
            list.appendChild(div);
        });
    });

    // Listener Ranking
    onSnapshot(collection(window.db, "scores"), (snap) => {
        const rList = document.getElementById('global-ranking-list');
        rList.innerHTML = ""; let totals = {};
        snap.forEach(d => { const s = d.data(); if(s.user) totals[s.user] = (totals[s.user]||0) + s.points; });
        Object.entries(totals).sort((a,b)=>b[1]-a[1]).forEach(([u, p], i) => {
            const medal = i===0?"🥇":i===1?"🥈":i===2?"🥉":"";
            rList.innerHTML += `<div class="ranking-item"><span>${medal} ${userMap[u]||u}</span><b>${p} pts</b></div>`;
        });
    });
}

// ==========================================
// 5. JUEGO
// ==========================================
function startQuizSession(quiz) {
    activeQuiz = quiz; currentQIdx = 0; sessionScore = 0; sessionDetails = [];
    showScreen('quiz-screen'); renderQuestion();
}

function renderQuestion() {
    const qData = activeQuiz.questions[currentQIdx];
    document.getElementById('current-quiz-title').innerText = activeQuiz.title;
    const cont = document.getElementById('options-container');
    cont.innerHTML = `<p style="font-weight:bold; margin-bottom:15px;">${qData.text}</p>`;
    const correct = qData.opts[0];
    [...qData.opts].sort(()=>Math.random()-0.5).forEach(opt => {
        const b = document.createElement('button'); b.className="btn-main"; b.innerText=opt;
        b.onclick = () => {
            sessionDetails.push({pregunta: qData.text, respuesta: opt, correcta: opt===correct});
            if(opt===correct) sessionScore++;
            currentQIdx++;
            if(currentQIdx < activeQuiz.questions.length) renderQuestion(); else finishGame();
        };
        cont.appendChild(b);
    });
}

async function finishGame() {
    if(currentUser !== ADMIN_ID) {
        await addDoc(collection(window.db, "scores"), {
            user: currentUser, points: sessionScore, quizId: activeQuiz.id, details: sessionDetails, date: serverTimestamp()
        });
    }
    window.showHome();
}

// ==========================================
// 6. AJUSTES
// ==========================================
function openSettings(quiz) {
    document.getElementById('settings-quiz-title').innerText = quiz.title;
    showScreen('settings-screen');
    document.getElementById('btn-delete-quiz').onclick = async () => {
        if(confirm("¿Borrar este quiz definitivamente?")) { 
            await deleteDoc(doc(window.db, "quizzes", quiz.id)); 
            window.showHome(); 
        }
    };
    document.getElementById('btn-view-responses').onclick = async () => {
        showScreen('responses-screen');
        const t = document.getElementById('responses-table'); t.innerHTML = "Cargando...";
        const sn = await getDocs(query(collection(window.db, "scores"), where("quizId", "==", quiz.id)));
        t.innerHTML = sn.empty ? "Nadie ha respondido aún." : "";
        sn.forEach(d => {
            const r = d.data();
            t.innerHTML += `<div class="quiz-card"><b>👤 ${userMap[r.user]||r.user}</b>: ${r.points} pts</div>`;
        });
    };
}

// ==========================================
// 7. INICIALIZACIÓN Y EVENTOS
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
        tempQuestions=[]; 
        document.getElementById('questions-added-count').innerText = "Preguntas preparadas: 0";
        resetEditorInputs(); 
        showScreen('editor-screen'); 
    };

    document.getElementById('btn-add-option').onclick = addExtraIncorrectOption;

    document.getElementById('btn-next-q').onclick = () => {
        const t = document.getElementById('q-text').value.trim();
        const o = Array.from(document.querySelectorAll('.opt-input')).map(i=>i.value.trim());
        if(!t || o.some(x=>!x)) return alert("Completa la pregunta y todas sus opciones.");
        
        tempQuestions.push({text:t, opts:o});
        // CORRECCIÓN: Actualizar contador real
        document.getElementById('questions-added-count').innerText = `Preguntas preparadas: ${tempQuestions.length}`;
        resetEditorInputs();
    };

    document.getElementById('btn-save-quiz').onclick = async () => {
        const title = document.getElementById('quiz-title-input').value.trim();
        if(!title || tempQuestions.length < 5) return alert("Necesitas un título y al menos 5 preguntas.");
        await addDoc(collection(window.db, "quizzes"), { 
            title, questions: tempQuestions, author: displayName, createdAt: serverTimestamp() 
        });
        window.showHome();
    };

    // CAMBIO: Botón Reset Rankings (Lógica)
    document.getElementById('btn-reset-ranking').onclick = async () => {
        if(confirm("¿Estás seguro de borrar TODA la tabla de posiciones?")){
            const batch = writeBatch(window.db);
            const sn = await getDocs(collection(window.db, "scores"));
            sn.forEach(d => batch.delete(d.ref));
            await batch.commit();
            alert("Ranking reseteado.");
        }
    };

    document.getElementById('btn-back-home').onclick = () => window.showHome();
    document.getElementById('btn-settings-back').onclick = () => window.showHome();
    document.getElementById('btn-responses-back').onclick = () => showScreen('settings-screen');
    
    window.showHome();
});