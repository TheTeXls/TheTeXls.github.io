/**
 * QUIZZES GEM - VERSIÓN 1.0
 * Lógica dividida por secciones funcionales.
 */

import { 
    collection, addDoc, onSnapshot, doc, getDoc, setDoc, 
    deleteDoc, serverTimestamp, query, where, getDocs, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// SECCIÓN 1: ESTADO GLOBAL Y CONFIGURACIÓN
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
// SECCIÓN 2: GESTIÓN DE INTERFAZ (UI)
// ==========================================
function showScreen(id) {
    const screens = document.querySelectorAll('.container');
    screens.forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(id);
    if(target) target.classList.remove('hidden');
}

function updateEditorCounter() {
    const count = tempQuestions.length;
    document.getElementById('questions-added-count').innerText = `Preguntas preparadas: ${count}`;
    document.getElementById('q-number-display').innerText = `Pregunta #${count + 1}`;
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
    updateEditorCounter();
}

// ==========================================
// SECCIÓN 3: AUTENTICACIÓN Y SESIÓN
// ==========================================
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
        
        if (snap.exists() && snap.data().pass !== pass) {
            return alert("Contraseña incorrecta para este usuario.");
        }
        
        if (!snap.exists()) {
            await setDoc(userRef, { 
                originalName: rawName, 
                pass: pass, 
                createdAt: serverTimestamp() 
            });
        }
        
        displayName = snap.exists() ? snap.data().originalName : rawName;
        currentUser = lowerName;
    }
    
    localStorage.setItem('quizUser', currentUser);
    localStorage.setItem('quizDisplayName', displayName);
    window.showHome();
}

// ==========================================
// SECCIÓN 4: SINCRONIZACIÓN EN TIEMPO REAL
// ==========================================
async function initRealtime() {
    if (isListening) return;
    isListening = true;

    // Cargar nombres reales de usuarios para el ranking
    const uSnap = await getDocs(collection(window.db, "users"));
    uSnap.forEach(u => userMap[u.id] = u.data().originalName);
    userMap["admin"] = "Admin Maestro";

    // Mostrar controles admin si es necesario
    if(currentUser === ADMIN_ID) {
        document.getElementById('admin-controls').classList.remove('hidden');
    }

    // LISTENER: Quizzes
    onSnapshot(collection(window.db, "quizzes"), async (snap) => {
        const list = document.getElementById('quiz-list');
        list.innerHTML = "";
        
        if (snap.empty) {
            list.innerHTML = "<p style='color:#666; font-style:italic;'>No hay quizzes disponibles. ¡Sé el primero en crear uno!</p>";
            return;
        }

        // Obtener historial del usuario para bloqueo
        const qS = query(collection(window.db, "scores"), where("user", "==", currentUser));
        const sSnap = await getDocs(qS);
        const playedIds = sSnap.docs.map(d => d.data().quizId);

        snap.forEach(d => {
            const q = d.data();
            const div = document.createElement('div');
            div.className = 'quiz-card';
            div.innerHTML = `<b>${q.title}</b><br><small>${q.questions.length} preguntas • Por: ${q.author}</small>`;
            
            const btn = document.createElement('button');
            btn.className = "btn-main btn-purple";

            const isAuthor = q.author === displayName;
            const isPlayed = playedIds.includes(d.id);

            if (currentUser === ADMIN_ID) {
                btn.innerText = "Probar (Admin) 🎮";
                btn.onclick = () => startQuizSession({id: d.id, ...q});
            } else if (isAuthor) {
                btn.innerText = "Tu propio Quiz 🚫";
                btn.disabled = true;
                btn.style.background = "#ccc";
            } else if (isPlayed) {
                btn.innerText = "Completado ✅";
                btn.disabled = true;
                btn.style.background = "#ccc";
            } else {
                btn.innerText = "Jugar ahora 🎮";
                btn.onclick = () => startQuizSession({id: d.id, ...q});
            }

            // Botón Ajustes (Punto #1 imagen)
            if (currentUser === ADMIN_ID || isAuthor) {
                const bS = document.createElement('button'); 
                bS.className = "btn-settings-corner"; 
                bS.innerHTML = "⚙️ Ajustes";
                bS.onclick = (e) => { e.stopPropagation(); openSettings({id: d.id, ...q}); };
                div.appendChild(bS);
            }

            div.appendChild(btn);
            list.appendChild(div);
        });
    });

    // LISTENER: Ranking
    onSnapshot(collection(window.db, "scores"), (snap) => {
        const rList = document.getElementById('global-ranking-list');
        if (snap.empty) {
            rList.innerHTML = "<p style='font-size:12px; color:#999; text-align:center;'>Nadie ha jugado todavía.</p>";
            return;
        }
        
        rList.innerHTML = ""; 
        let totals = {};
        snap.forEach(d => { 
            const s = d.data(); 
            if(s.user) totals[s.user] = (totals[s.user] || 0) + s.points; 
        });

        Object.entries(totals)
            .sort((a,b) => b[1] - a[1])
            .forEach(([u, p], i) => {
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
                rList.innerHTML += `
                    <div class="ranking-item">
                        <span>${medal} ${userMap[u] || u}</span>
                        <b>${p} pts</b>
                    </div>`;
            });
    });
}

// ==========================================
// SECCIÓN 5: LÓGICA DE JUEGO
// ==========================================
function startQuizSession(quiz) {
    activeQuiz = quiz;
    currentQIdx = 0;
    sessionScore = 0;
    showScreen('quiz-screen');
    renderQuestion();
}

function renderQuestion() {
    const qData = activeQuiz.questions[currentQIdx];
    document.getElementById('current-quiz-title').innerText = activeQuiz.title;
    
    const cont = document.getElementById('options-container');
    cont.innerHTML = `<p class="question-text">${qData.text}</p>`;
    
    const correct = qData.opts[0];
    const shuffled = [...qData.opts].sort(() => Math.random() - 0.5);

    shuffled.forEach(opt => {
        const b = document.createElement('button');
        b.className = "btn-main btn-purple";
        b.innerText = opt;
        b.onclick = async () => {
            if(opt === correct) sessionScore++;
            currentQIdx++;
            
            if(currentQIdx < activeQuiz.questions.length) {
                renderQuestion();
            } else {
                if(currentUser !== ADMIN_ID) {
                    await addDoc(collection(window.db, "scores"), { 
                        user: currentUser, 
                        points: sessionScore, 
                        quizId: activeQuiz.id, 
                        date: serverTimestamp() 
                    });
                }
                window.showHome();
            }
        };
        cont.appendChild(b);
    });
}

// ==========================================
// SECCIÓN 6: AJUSTES Y ADMINISTRACIÓN
// ==========================================
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
        const t = document.getElementById('responses-table');
        t.innerHTML = "<p class='loading-text'>⌛ Consultando base de datos...</p>";
        
        const sn = await getDocs(query(collection(window.db, "scores"), where("quizId", "==", quiz.id)));
        t.innerHTML = sn.empty ? "<p>Nadie ha respondido este quiz aún.</p>" : "";
        
        sn.forEach(d => {
            const r = d.data();
            t.innerHTML += `<div class="quiz-card"><b>👤 ${userMap[r.user] || r.user}</b> puntuó: ${r.points} pts</div>`;
        });
    };
}

// ==========================================
// SECCIÓN 7: EVENTOS E INICIO
// ==========================================
window.showHome = () => {
    if (!currentUser) return showScreen('login-screen');
    showScreen('home-screen');
    document.getElementById('user-display').innerText = "👤 " + displayName;
    initRealtime();
};

document.addEventListener('DOMContentLoaded', () => {
    // Login y Logout
    document.getElementById('btn-login-action').onclick = handleLogin;
    document.getElementById('btn-logout').onclick = () => { localStorage.clear(); location.reload(); };
    
    // Editor
    document.getElementById('btn-go-editor').onclick = () => {
        tempQuestions = [];
        resetEditorInputs();
        showScreen('editor-screen');
    };

    document.getElementById('btn-add-option').onclick = () => {
        const setup = document.getElementById('options-setup');
        if (setup.querySelectorAll('input').length >= 6) return alert("Máximo 6 opciones.");
        const input = document.createElement('input');
        input.className = "opt-input";
        input.placeholder = "❌ Otra Respuesta Incorrecta";
        setup.appendChild(input);
    };

    document.getElementById('btn-next-q').onclick = () => {
        const t = document.getElementById('q-text').value.trim();
        const o = Array.from(document.querySelectorAll('.opt-input')).map(i => i.value.trim());
        
        if(!t || o.some(x => !x)) return alert("Completa la pregunta y todas sus opciones.");
        
        tempQuestions.push({ text: t, opts: o });
        resetEditorInputs();
    };

    document.getElementById('btn-save-quiz').onclick = async () => {
        const title = document.getElementById('quiz-title-input').value.trim();
        if(!title || tempQuestions.length < 5) return alert("El quiz debe tener título y al menos 5 preguntas.");
        
        await addDoc(collection(window.db, "quizzes"), { 
            title, 
            questions: tempQuestions, 
            author: displayName, 
            createdAt: serverTimestamp() 
        });
        window.showHome();
    };

    // Admin Reset (Punto #2 imagen)
    document.getElementById('btn-reset-ranking').onclick = async () => {
        if(confirm("¡ATENCIÓN! Esto borrará todos los puntos del ranking. ¿Continuar?")){
            const batch = writeBatch(window.db);
            const sn = await getDocs(collection(window.db, "scores"));
            sn.forEach(d => batch.delete(d.ref));
            await batch.commit();
            alert("El ranking ha sido reiniciado con éxito.");
        }
    };

    // Navegación Atrás
    document.getElementById('btn-back-home').onclick = () => window.showHome();
    document.getElementById('btn-settings-back').onclick = () => window.showHome();
    document.getElementById('btn-responses-back').onclick = () => showScreen('settings-screen');

    window.showHome();
});