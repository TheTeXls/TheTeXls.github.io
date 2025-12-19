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
let isListening = false;
let userMap = {};

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
    // Error 3 corregido: Actualizar el h3 dinámicamente
    document.getElementById('q-number-display').innerText = `Pregunta #${tempQuestions.length + 1}`;
}

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

async function initRealtime() {
    if (isListening) return;
    isListening = true;

    const uSnap = await getDocs(collection(window.db, "users"));
    uSnap.forEach(u => userMap[u.id] = u.data().originalName);
    userMap["admin"] = "Admin Maestro";

    if(currentUser === ADMIN_ID) document.getElementById('admin-controls').classList.remove('hidden');

    onSnapshot(collection(window.db, "quizzes"), async (snap) => {
        const list = document.getElementById('quiz-list');
        list.innerHTML = "<h3>Quizzes Disponibles</h3>";
        
        // Error 1: Bloqueo real de jugados
        const qS = query(collection(window.db, "scores"), where("user", "==", currentUser));
        const sSnap = await getDocs(qS);
        const playedIds = sSnap.docs.map(d => d.data().quizId);

        snap.forEach(d => {
            const q = d.data();
            const div = document.createElement('div');
            div.className = 'quiz-card';
            div.innerHTML = `<b>${q.title}</b><br><small>${q.questions.length} preg. • Por: ${q.author}</small>`;
            
            const btn = document.createElement('button');
            btn.className = "btn-main";

            const isAuthor = q.author === displayName;
            const isPlayed = playedIds.includes(d.id);

            // Cambio 1: Etiquetas separadas
            if (currentUser === ADMIN_ID) {
                btn.innerText = "Probar (Admin) 🎮";
                btn.onclick = () => startQuizSession({id: d.id, ...q});
            } else if (isAuthor) {
                btn.innerText = "Tu Quiz 🚫"; btn.disabled = true; btn.style.background = "#ccc";
            } else if (isPlayed) {
                btn.innerText = "Completado ✅"; btn.disabled = true; btn.style.background = "#ccc";
            } else {
                btn.innerText = "Jugar 🎮";
                btn.onclick = () => startQuizSession({id: d.id, ...q});
            }

            // Cambio 3: Botón ajustes en la esquina (Punto 1 de la imagen)
            if (currentUser === ADMIN_ID || isAuthor) {
                const bS = document.createElement('button'); 
                bS.className = "btn-settings-corner"; bS.innerHTML = "⚙️ Ajustes";
                bS.onclick = (e) => { e.stopPropagation(); openSettings({id: d.id, ...q}); };
                div.appendChild(bS);
            }
            div.appendChild(btn);
            list.appendChild(div);
        });
    });

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

function startQuizSession(quiz) {
    activeQuiz = quiz; currentQIdx = 0; sessionScore = 0; sessionDetails = [];
    showScreen('quiz-screen'); renderQuestion();
}

function renderQuestion() {
    const qData = activeQuiz.questions[currentQIdx];
    document.getElementById('current-quiz-title').innerText = activeQuiz.title;
    const cont = document.getElementById('options-container');
    cont.innerHTML = `<p style="font-weight:bold;">${qData.text}</p>`;
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

function openSettings(quiz) {
    document.getElementById('settings-quiz-title').innerText = quiz.title;
    showScreen('settings-screen');
    document.getElementById('btn-delete-quiz').onclick = async () => {
        if(confirm("¿Borrar?")) { await deleteDoc(doc(window.db, "quizzes", quiz.id)); window.showHome(); }
    };
    document.getElementById('btn-view-responses').onclick = async () => {
        showScreen('responses-screen');
        const t = document.getElementById('responses-table'); t.innerHTML = "Cargando...";
        const sn = await getDocs(query(collection(window.db, "scores"), where("quizId", "==", quiz.id)));
        t.innerHTML = sn.empty ? "Nadie aún" : "";
        sn.forEach(d => {
            const r = d.data();
            t.innerHTML += `<div class="quiz-card"><b>👤 ${userMap[r.user]||r.user}</b>: ${r.points} pts</div>`;
        });
    };
}

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
        // Error 2 corregido: Resetear contador visual al entrar
        document.getElementById('questions-added-count').innerText = "Preguntas preparadas: 0";
        resetEditorInputs(); 
        showScreen('editor-screen'); 
    };
    document.getElementById('btn-add-option').onclick = () => {
        const setup = document.getElementById('options-setup');
        if (setup.querySelectorAll('input').length >= 6) return alert("Máx 6");
        const input = document.createElement('input'); input.className = "opt-input"; input.placeholder = "❌ Incorrecta";
        setup.appendChild(input);
    };
    document.getElementById('btn-next-q').onclick = () => {
        const t = document.getElementById('q-text').value.trim();
        const o = Array.from(document.querySelectorAll('.opt-input')).map(i=>i.value.trim());
        if(!t || o.some(x=>!x)) return alert("Completa todo");
        tempQuestions.push({text:t, opts:o});
        // Error 2 corregido: Contador real
        document.getElementById('questions-added-count').innerText = `Preguntas preparadas: ${tempQuestions.length}`;
        resetEditorInputs();
    };
    document.getElementById('btn-save-quiz').onclick = async () => {
        const title = document.getElementById('quiz-title-input').value.trim();
        if(!title || tempQuestions.length < 5) return alert("Título y 5 preguntas mín.");
        await addDoc(collection(window.db, "quizzes"), { title, questions: tempQuestions, author: displayName, createdAt: serverTimestamp() });
        window.showHome();
    };
    // Cambio 2: Reset Ranking
    document.getElementById('btn-reset-ranking').onclick = async () => {
        if(confirm("¿Borrar ranking?")){
            const batch = writeBatch(window.db);
            const sn = await getDocs(collection(window.db, "scores"));
            sn.forEach(d => batch.delete(d.ref));
            await batch.commit();
            alert("Ranking limpio");
        }
    };
    document.getElementById('btn-back-home').onclick = () => window.showHome();
    document.getElementById('btn-settings-back').onclick = () => window.showHome();
    document.getElementById('btn-responses-back').onclick = () => showScreen('settings-screen');
    window.showHome();
});