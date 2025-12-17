import { 
    collection, addDoc, onSnapshot, doc, getDoc, setDoc, 
    deleteDoc, serverTimestamp, query, where, getDocs, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- CONFIGURACIÓN Y ESTADO GLOBAL ---
const ADMIN_ID = "admin";
const ADMIN_PASS = "gem";

let currentUser = localStorage.getItem('quizUser') || null;
let displayName = localStorage.getItem('quizDisplayName') || null;

let tempQuestions = [];
let activeQuiz = null;
let currentQIdx = 0;
let sessionScore = 0;
let sessionDetails = []; // Guarda: { pregunta, respuesta, correcta }

// --- NAVEGACIÓN ---
function showScreen(id) {
    const screens = document.querySelectorAll('.container');
    screens.forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

// --- PUNTO 3: AUTO-ELIMINACIÓN (5 HORAS) ---
async function cleanupOldQuizzes() {
    console.log("Revisando quizzes caducados...");
    const now = Date.now();
    const fiveHoursInMs = 5 * 60 * 60 * 1000;
    
    try {
        const querySnap = await getDocs(collection(window.db, "quizzes"));
        const batch = writeBatch(window.db);
        let deletedCount = 0;

        querySnap.forEach((d) => {
            const data = d.data();
            if (data.createdAt) {
                const createdAtMs = data.createdAt.toMillis();
                if (now - createdAtMs > fiveHoursInMs) {
                    batch.delete(d.ref);
                    deletedCount++;
                }
            }
        });

        if (deletedCount > 0) {
            await batch.commit();
            console.log(`🧹 Limpieza completada: ${deletedCount} eliminados.`);
        }
    } catch (error) {
        console.error("Error en limpieza:", error);
    }
}

// --- HOME Y LOGIN ---
window.showHome = function() {
    if (!currentUser) {
        showScreen('login-screen');
        return;
    }
    showScreen('home-screen');
    document.getElementById('user-display').innerText = `👤 ${displayName}`;
    cleanupOldQuizzes();
    initRealtime();
};

async function handleLogin() {
    const rawName = document.getElementById('user-name-input').value.trim();
    const pass = document.getElementById('user-pass-input').value.trim();
    
    if (!rawName || !pass) return alert("Por favor, rellena todos los campos.");
    
    const lowerName = rawName.toLowerCase();

    if (lowerName === ADMIN_ID && pass === ADMIN_PASS) {
        currentUser = ADMIN_ID;
        displayName = "Admin Maestro";
    } else {
        const userRef = doc(window.db, "users", lowerName);
        const snap = await getDoc(userRef);
        
        if (snap.exists()) {
            if (snap.data().pass !== pass) return alert("Contraseña incorrecta.");
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

// --- ESCUCHA DE DATOS EN TIEMPO REAL ---
async function initRealtime() {
    // 1. Mapear nombres de usuarios
    const usersSnap = await getDocs(collection(window.db, "users"));
    let nameMap = { "admin": "Admin Maestro" };
    usersSnap.forEach(u => { nameMap[u.id] = u.data().originalName; });

    // 2. Ver qué quizzes ya jugó el usuario actual
    let playedQuizIds = [];
    if (currentUser !== ADMIN_ID) {
        const qScores = query(collection(window.db, "scores"), where("user", "==", currentUser));
        const scoreSnap = await getDocs(qScores);
        playedQuizIds = scoreSnap.docs.map(d => d.data().quizId);
    }

    // 3. Listener de Quizzes (Punto 5 incluido)
    onSnapshot(collection(window.db, "quizzes"), (snap) => {
        const list = document.getElementById('quiz-list');
        list.innerHTML = "<h3>Quizzes Disponibles</h3>";
        
        if (snap.empty) {
            list.innerHTML += `<div id="no-quizzes-msg">No hay quizzes publicados en este momento 😴</div>`;
            return;
        }

        snap.forEach(d => {
            const q = { id: d.id, ...d.data() };
            const totalQuestions = q.questions ? q.questions.length : 0;
            const isPlayed = playedQuizIds.includes(q.id);
            const isAdmin = (currentUser === ADMIN_ID);
            const isAuthor = (q.author && q.author.toLowerCase() === currentUser);
            
            const div = document.createElement('div');
            div.className = 'quiz-card';
            div.innerHTML = `<b>${q.title}</b><br><small>${totalQuestions} preguntas • Por: ${q.author}</small>`;
            
            const btnJugar = document.createElement('button');
            btnJugar.className = "btn-main";
            
            if (isAdmin) {
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
                btnSetStyle(btnAjustes);
                btnAjustes.innerText = "⚙️ Ajustes";
                btnAjustes.onclick = () => openSettings(q);
                div.appendChild(btnAjustes);
            }
            list.appendChild(div);
        });
    });

    // 4. Listener de Rankings (Botón Reset Reparado)
    onSnapshot(collection(window.db, "scores"), (snap) => {
        const rList = document.getElementById('global-ranking-list');
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
            const nameToShow = nameMap[u] || u;
            rList.innerHTML += `<div class="ranking-item"><span>${nameToShow}</span><b>${p} pts</b></div>`;
        });

        if (currentUser === ADMIN_ID) {
            const btnReset = document.createElement('button');
            btnReset.className = "btn-main btn-reset-admin";
            btnReset.innerText = "♻️ Resetear Todos los Rankings";
            btnReset.onclick = async () => {
                if(confirm("¿Seguro? Se borrarán todos los puntos.")){
                    const batch = writeBatch(window.db);
                    const snaps = await getDocs(collection(window.db, "scores"));
                    snaps.forEach(d => batch.delete(d.ref));
                    await batch.commit();
                }
            };
            rList.appendChild(btnReset);
        }
    });
}

function btnSetStyle(btn) {
    btn.className = "btn-small";
    btn.style.marginTop = "8px";
    btn.style.display = "block";
    btn.style.width = "100%";
}

// --- JUEGO (Punto 6: Recolección de detalles) ---
function startQuizSession(quiz) {
    activeQuiz = quiz;
    currentQIdx = 0;
    sessionScore = 0;
    sessionDetails = [];
    showScreen('quiz-screen');
    renderQuestion();
}

function renderQuestion() {
    const qData = activeQuiz.questions[currentQIdx];
    document.getElementById('current-quiz-title').innerText = `${activeQuiz.title} (${currentQIdx + 1}/${activeQuiz.questions.length})`;
    
    const cont = document.getElementById('options-container');
    cont.innerHTML = `<p style="font-size:18px; margin-bottom:20px; font-weight:bold;">${qData.text}</p>`;
    
    const shuffledOpts = [...qData.opts].sort(() => Math.random() - 0.5);
    
    shuffledOpts.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = "btn-main";
        btn.style.background = "white"; btn.style.color = "#6c5ce7"; btn.style.border = "2px solid #6c5ce7";
        btn.innerText = opt;
        btn.onclick = () => processAnswer(opt, qData.opts[0], qData.text);
        cont.appendChild(btn);
    });
}

async function processAnswer(selected, correct, questionText) {
    const isCorrect = (selected === correct);
    
    // Guardamos el detalle para el Punto 6
    sessionDetails.push({
        pregunta: questionText,
        respuesta: selected,
        correcta: isCorrect
    });

    if (isCorrect) {
        sessionScore++;
        alert("✅ ¡Correcto!");
    } else {
        alert("❌ Incorrecto");
    }

    currentQIdx++;

    if (currentQIdx < activeQuiz.questions.length) {
        renderQuestion();
    } else {
        await saveFinalResults();
    }
}

async function saveFinalResults() {
    alert(`🏁 Fin del Quiz. Puntuación: ${sessionScore}/${activeQuiz.questions.length}`);
    
    if (currentUser !== ADMIN_ID) {
        await addDoc(collection(window.db, "scores"), {
            user: currentUser,
            points: sessionScore,
            totalQuestions: activeQuiz.questions.length,
            quizId: activeQuiz.id,
            details: sessionDetails, // Punto 6
            date: serverTimestamp()
        });
    }
    window.showHome();
}

// --- EDITOR (Puntos 1, 2, 7) ---
function nextQuestion() {
    if (tempQuestions.length >= 10) return alert("Máximo 10 preguntas permitidas.");

    const text = document.getElementById('q-text').value.trim();
    const opts = Array.from(document.querySelectorAll('.opt-input')).map(i => i.value.trim());
    
    if(!text) return alert("Escribe una pregunta.");
    if(opts.length < 4) return alert("Mínimo 4 respuestas.");
    if(opts.some(o => !o)) return alert("Rellena todas las opciones.");
    
    tempQuestions.push({ text, opts });
    
    // Limpiar para la siguiente
    document.getElementById('q-text').value = "";
    document.getElementById('options-setup').innerHTML = `
        <input type="text" class="opt-input" placeholder="Opción Correcta">
        <input type="text" class="opt-input" placeholder="Opción Incorrecta">
        <input type="text" class="opt-input" placeholder="Opción Incorrecta">
        <input type="text" class="opt-input" placeholder="Opción Incorrecta">
    `;
    document.getElementById('q-number-display').innerText = `Pregunta #${tempQuestions.length + 1}`;
    document.getElementById('questions-added-count').innerText = `Preguntas preparadas: ${tempQuestions.length}`;
}

// --- AJUSTES Y RESPUESTAS DETALLADAS (Punto 6) ---
function openSettings(quiz) {
    document.getElementById('settings-quiz-title').innerText = `Ajustes: ${quiz.title}`;
    showScreen('settings-screen');

    document.getElementById('btn-delete-quiz').onclick = async () => {
        if(confirm(`¿Estás seguro de borrar "${quiz.title}"?`)) {
            await deleteDoc(doc(window.db, "quizzes", quiz.id));
            window.showHome();
        }
    };

    document.getElementById('btn-view-responses').onclick = async () => {
        showScreen('responses-screen');
        const table = document.getElementById('responses-table');
        table.innerHTML = "Cargando resultados...";
        
        const qQuery = query(collection(window.db, "scores"), where("quizId", "==", quiz.id));
        const snap = await getDocs(qQuery);
        
        table.innerHTML = snap.empty ? "Nadie ha completado este quiz todavía." : "";
        
        snap.forEach(d => {
            const r = d.data();
            const resDiv = document.createElement('div');
            resDiv.className = "quiz-card";
            resDiv.style.textAlign = "left";
            resDiv.style.borderLeft = "5px solid #6c5ce7";

            let detailsHTML = "";
            if (r.details) {
                r.details.forEach((det, idx) => {
                    detailsHTML += `
                        <div style="margin-top:10px; padding:5px; background:#f9f9f9; border-radius:5px;">
                            <small><b>${idx + 1}. ${det.pregunta}</b></small><br>
                            <small style="color: ${det.correcta ? 'green' : 'red'}">
                                ${det.correcta ? '✅' : '❌'} Respondió: ${det.respuesta}
                            </small>
                        </div>`;
                });
            }

            resDiv.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <b>👤 ${r.user}</b>
                    <span class="badge">${r.points} / ${r.totalQuestions || '?'}</span>
                </div>
                <hr>
                ${detailsHTML}
            `;
            table.appendChild(resDiv);
        });
    };
}

// --- EVENTOS INICIALES ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-login-action').onclick = handleLogin;
    
    document.getElementById('btn-logout').onclick = () => {
        localStorage.clear();
        window.location.reload();
    };
    
    document.getElementById('btn-go-editor').onclick = () => {
        tempQuestions = [];
        document.getElementById('questions-added-count').innerText = "Preguntas preparadas: 0";
        document.getElementById('q-number-display').innerText = "Pregunta #1";
        document.getElementById('options-setup').innerHTML = `
            <input type="text" class="opt-input" placeholder="Opción Correcta">
            <input type="text" class="opt-input" placeholder="Opción Incorrecta">
            <input type="text" class="opt-input" placeholder="Opción Incorrecta">
            <input type="text" class="opt-input" placeholder="Opción Incorrecta">
        `;
        showScreen('editor-screen');
    };

    document.getElementById('btn-add-option').onclick = () => {
        const inputs = document.querySelectorAll('.opt-input');
        if (inputs.length >= 6) return alert("Máximo 6 respuestas.");
        const inp = document.createElement('input');
        inp.className = "opt-input";
        inp.placeholder = "Opción Incorrecta";
        document.getElementById('options-setup').appendChild(inp);
    };

    document.getElementById('btn-next-q').onclick = nextQuestion;

    document.getElementById('btn-save-quiz').onclick = async () => {
        const title = document.getElementById('quiz-title-input').value.trim();
        const curText = document.getElementById('q-text').value.trim();
        const curOpts = Array.from(document.querySelectorAll('.opt-input')).map(i => i.value.trim());

        // Punto 7: Auto-incluir la pregunta actual si está completa
        if (curText !== "" && curOpts.length >= 4 && !curOpts.some(o => !o)) {
            if (tempQuestions.length < 10) {
                tempQuestions.push({ text: curText, opts: curOpts });
            }
        }

        if (!title) return alert("Ponle un título al quiz.");
        if (tempQuestions.length < 5) return alert(`Necesitas mínimo 5 preguntas. Llevas ${tempQuestions.length}`);

        await addDoc(collection(window.db, "quizzes"), {
            title: title,
            questions: tempQuestions,
            author: displayName,
            createdAt: serverTimestamp()
        });

        alert("¡Quiz Publicado!");
        window.showHome();
    };

    document.getElementById('btn-back-home').onclick = () => window.showHome();
    document.getElementById('btn-settings-back').onclick = () => window.showHome();
    document.getElementById('btn-responses-back').onclick = () => showScreen('settings-screen');
});

// Iniciar App
window.showHome();