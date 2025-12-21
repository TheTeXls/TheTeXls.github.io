import { 
    collection, addDoc, onSnapshot, doc, getDoc, setDoc, 
    deleteDoc, serverTimestamp, query, where, getDocs, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. VARIABLES DE ESTADO GLOBAL
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
// 2. UTILIDADES DE NAVEGACIÓN Y UI
// ==========================================
function showScreen(id) {
    document.querySelectorAll('.container').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(id);
    if (target) target.classList.remove('hidden');
}

/**
 * Actualiza la vista previa del creador de quizzes
 * Muestra cuántas preguntas hay y permite eliminarlas
 */
function updateEditorUI() {
    const countDisplay = document.getElementById('questions-added-count');
    const qNumberDisplay = document.getElementById('q-number-display');
    const container = document.getElementById('editor-preview-container');
    const list = document.getElementById('editor-preview-list');

    if (countDisplay) countDisplay.innerText = `${tempQuestions.length} preparadas`;
    if (qNumberDisplay) qNumberDisplay.innerText = `Pregunta #${tempQuestions.length + 1}`;
    
    if (tempQuestions.length > 0) {
        container.classList.remove('hidden');
        list.innerHTML = tempQuestions.map((q, i) => `
            <div class="preview-item">
                <span><b>${i+1}.</b> ${q.text}</span>
                <button onclick="window.removeQuestion(${i})" style="color:#ff7675; border:none; background:none; cursor:pointer; font-weight:bold; font-size:16px;">✖</button>
            </div>`).join('');
    } else { 
        container.classList.add('hidden'); 
    }
}

/**
 * Elimina una pregunta específica del array temporal antes de publicar
 */
window.removeQuestion = (index) => {
    tempQuestions.splice(index, 1);
    updateEditorUI();
};

/**
 * Limpia los inputs del constructor de preguntas
 */
function resetEditorInputs() {
    const setup = document.getElementById('options-setup');
    if (setup) {
        setup.innerHTML = `
            <input type="text" class="opt-input modern-input" placeholder="Respuesta Correcta">
            <input type="text" class="opt-input modern-input" placeholder="Opción incorrecta">
            <input type="text" class="opt-input modern-input" placeholder="Opción incorrecta">
            <input type="text" class="opt-input modern-input" placeholder="Opción incorrecta">`;
    }
    const qText = document.getElementById('q-text');
    if (qText) qText.value = "";
    updateEditorUI();
}

// ==========================================
// 3. SISTEMA DE AUTENTICACIÓN
// ==========================================
async function handleLogin() {
    const nameInput = document.getElementById('user-name-input');
    const passInput = document.getElementById('user-pass-input');
    
    if (!nameInput || !passInput) return;

    const rawName = nameInput.value.trim();
    const pass = passInput.value.trim();

    if (!rawName || !pass) {
        alert("Por favor, completa todos los campos para continuar.");
        return;
    }

    const lowerName = rawName.toLowerCase();
    
    // Verificación de Administrador (Datos guardados en memoria del modelo)
    if (lowerName === ADMIN_ID && pass === ADMIN_PASS) {
        currentUser = ADMIN_ID;
        displayName = "Admin Maestro";
    } else {
        // Verificación de Usuario Normal en Firestore
        const userRef = doc(window.db, "users", lowerName);
        try {
            const snap = await getDoc(userRef);
            if (snap.exists()) {
                if (snap.data().pass !== pass) {
                    alert("La contraseña es incorrecta para este usuario.");
                    return;
                }
                displayName = snap.data().originalName;
            } else {
                // Registro automático si no existe
                await setDoc(userRef, { 
                    originalName: rawName, 
                    pass: pass, 
                    createdAt: serverTimestamp() 
                });
                displayName = rawName;
            }
            currentUser = lowerName;
        } catch (e) {
            console.error("Error en login:", e);
            alert("Error al conectar con la base de datos.");
            return;
        }
    }

    localStorage.setItem('quizUser', currentUser);
    localStorage.setItem('quizDisplayName', displayName);
    window.showHome();
}

// ==========================================
// 4. TIEMPO REAL Y BLINDAJE DE DATOS (V1.2)
// ==========================================
async function initRealtime() {
    if (isListening) return;
    isListening = true;

    // Sincronizar mapa de usuarios para mostrar nombres reales en el ranking
    try {
        const uSnap = await getDocs(collection(window.db, "users"));
        uSnap.forEach(u => {
            userMap[u.id] = u.data().originalName;
        });
    } catch (e) { console.error("Error cargando usuarios:", e); }
    
    userMap["admin"] = "Admin Maestro";

    // Mostrar controles de admin si corresponde
    const adminControls = document.getElementById('admin-controls');
    if (currentUser === ADMIN_ID && adminControls) {
        adminControls.classList.remove('hidden');
    }

    const quizList = document.getElementById('quiz-list');
    const loadingStatus = document.getElementById('quiz-loading-status');

    // LISTENER DE QUIZZES (Blindado contra desapariciones)
    onSnapshot(collection(window.db, "quizzes"), async (snap) => {
        if (loadingStatus) loadingStatus.classList.add('hidden');
        if (!quizList) return;

        quizList.innerHTML = snap.empty ? 
            "<p style='text-align:center; padding:20px; color:#636e72;'>No hay quizzes disponibles creados por la comunidad.</p>" : "";

        // PARCHE: Obtener historial de puntuaciones para bloquear repeticiones
        let playedQuizIds = [];
        try {
            const scoreQuery = query(collection(window.db, "scores"), where("user", "==", currentUser));
            const scoreSnap = await getDocs(scoreQuery);
            playedQuizIds = scoreSnap.docs.map(doc => doc.data().quizId);
        } catch (e) { console.error("Error validando historial:", e); }

        snap.forEach(d => {
            const q = d.data();
            const quizId = d.id;
            
            const div = document.createElement('div');
            div.className = 'quiz-card';
            div.innerHTML = `
                <div style="margin-bottom:10px;">
                    <b style="font-size:16px;">${q.title}</b><br>
                    <small style="color:#636e72;">${q.questions.length} preguntas • Autor: ${q.author}</small>
                </div>`;
            
            const btn = document.createElement('button');
            btn.className = "btn-main btn-purple";
            
            const isAuthor = (q.author === displayName);
            const alreadyPlayed = playedQuizIds.includes(quizId);

            // Lógica de estados del botón (Bloqueo de juego repetido)
            if (currentUser === ADMIN_ID) {
                btn.innerText = "Probar (Modo Admin) 🎮";
                btn.onclick = () => startQuizSession({id: quizId, ...q});
            } else if (isAuthor) {
                btn.innerText = "Es tu propio Quiz 🚫";
                btn.disabled = true;
                btn.style.opacity = "0.6";
            } else if (alreadyPlayed) {
                btn.innerText = "Ya lo completaste ✅";
                btn.disabled = true;
                btn.className = "btn-main"; 
                btn.style.background = "#dfe6e9";
                btn.style.color = "#636e72";
            } else {
                btn.innerText = "Jugar Quiz 🎮";
                btn.onclick = () => startQuizSession({id: quizId, ...q});
            }

            // Acceso a ajustes para el dueño o el admin
            if (currentUser === ADMIN_ID || isAuthor) {
                const bS = document.createElement('button'); 
                bS.className = "btn-settings-corner"; 
                bS.innerHTML = "⚙️";
                bS.title = "Configuración del Quiz";
                bS.onclick = (e) => { 
                    e.stopPropagation(); 
                    openSettings({id: quizId, ...q}); 
                };
                div.appendChild(bS);
            }

            div.appendChild(btn);
            quizList.appendChild(div);
        });
    }, (error) => {
        console.error("Error en el blindaje de tiempo real:", error);
        if (loadingStatus) {
            loadingStatus.innerHTML = "<p style='color:#d63031; font-weight:bold;'>⚠️ Error de conexión con los datos.</p>";
        }
    });

    // LISTENER DEL RANKING GLOBAL
    onSnapshot(collection(window.db, "scores"), (snap) => {
        const rList = document.getElementById('global-ranking-list');
        if (!rList) return;

        if (snap.empty) {
            rList.innerHTML = "<p style='font-size:13px; color:#b2bec3;'>Nadie ha puntuado todavía.</p>";
            return;
        }

        rList.innerHTML = "";
        let totals = {};

        snap.forEach(d => {
            const s = d.data();
            if (s.user) {
                totals[s.user] = (totals[s.user] || 0) + s.points;
            }
        });

        // Ordenar de mayor a menor y renderizar
        Object.entries(totals)
            .sort((a, b) => b[1] - a[1])
            .forEach(([userId, points], index) => {
                const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "";
                const item = document.createElement('div');
                item.className = 'ranking-item';
                item.innerHTML = `
                    <span><small style="color:#636e72;">#${index + 1}</small> ${medal} ${userMap[userId] || userId}</span>
                    <b style="color:#6c5ce7;">${points} pts</b>
                `;
                rList.appendChild(item);
            });
    });
}

// ==========================================
// 5. LÓGICA DE JUEGO (GAMEPLAY)
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
    const titleHeader = document.getElementById('current-quiz-title');
    const optionsCont = document.getElementById('options-container');

    if (titleHeader) titleHeader.innerText = activeQuiz.title;
    if (!optionsCont) return;

    optionsCont.innerHTML = `
        <div style="background:#f8fafc; padding:20px; border-radius:15px; margin-bottom:20px; border:1px solid #e2e8f0;">
            <p style="font-weight:bold; font-size:18px; color:#2d3436; margin:0;">${qData.text}</p>
        </div>
    `;
    
    const correctOption = qData.opts[0];
    const shuffledOptions = [...qData.opts].sort(() => Math.random() - 0.5);

    shuffledOptions.forEach(opt => {
        const b = document.createElement('button');
        b.className = "btn-main btn-purple";
        b.innerText = opt;
        b.style.marginBottom = "10px";
        
        b.onclick = async () => {
            // Deshabilitar todos los botones para evitar doble clic
            const allBtns = optionsCont.querySelectorAll('button');
            allBtns.forEach(btn => btn.disabled = true);

            if (opt === correctOption) {
                sessionScore++;
                b.style.background = "#00b894";
            } else {
                b.style.background = "#ff7675";
            }

            // Pequeña pausa para ver el resultado antes de la siguiente pregunta
            setTimeout(async () => {
                currentQIdx++;
                if (currentQIdx < activeQuiz.questions.length) {
                    renderQuestion();
                } else {
                    // Fin del Quiz
                    if (currentUser !== ADMIN_ID) {
                        try {
                            await addDoc(collection(window.db, "scores"), { 
                                user: currentUser, 
                                points: sessionScore, 
                                quizId: activeQuiz.id, 
                                date: serverTimestamp() 
                            });
                        } catch (e) { console.error("Error guardando puntuación:", e); }
                    }
                    alert(`¡Quiz terminado! Tu puntuación final: ${sessionScore}/${activeQuiz.questions.length}`);
                    window.showHome();
                }
            }, 600);
        };
        optionsCont.appendChild(b);
    });
}

// ==========================================
// 6. PANEL DE AJUSTES Y RESULTADOS
// ==========================================
function openSettings(quiz) {
    const settingsTitle = document.getElementById('settings-quiz-title');
    if (settingsTitle) settingsTitle.innerText = quiz.title;
    
    showScreen('settings-screen');

    // Botón Borrar
    const btnDelete = document.getElementById('btn-delete-quiz');
    btnDelete.onclick = async () => {
        if (confirm("¿Estás completamente seguro de borrar este quiz? Se eliminarán también todos los resultados asociados.")) {
            try {
                await deleteDoc(doc(window.db, "quizzes", quiz.id));
                // Opcional: Podríamos borrar también los scores asociados aquí
                window.showHome();
            } catch (e) { alert("Error al borrar."); }
        }
    };

    // Botón Ver Respuestas
    const btnViewResp = document.getElementById('btn-view-responses');
    btnViewResp.onclick = async () => {
        showScreen('responses-screen');
        const table = document.getElementById('responses-table');
        if (!table) return;

        table.innerHTML = "<p>Cargando lista de participantes...</p>";
        
        try {
            const sn = await getDocs(query(collection(window.db, "scores"), where("quizId", "==", quiz.id)));
            if (sn.empty) {
                table.innerHTML = "<p style='padding:20px; color:#636e72;'>Nadie ha jugado este quiz todavía.</p>";
            } else {
                table.innerHTML = "";
                sn.forEach(d => {
                    const r = d.data();
                    const row = document.createElement('div');
                    row.className = "quiz-card";
                    row.style.borderLeftColor = "#0984e3";
                    row.innerHTML = `
                        <b>👤 ${userMap[r.user] || r.user}</b><br>
                        <span style="color:#0984e3; font-weight:bold;">Puntos: ${r.points}</span>
                    `;
                    table.appendChild(row);
                });
            }
        } catch (e) { table.innerHTML = "Error al cargar respuestas."; }
    };
}

// ==========================================
// 7. GESTIÓN DE EVENTOS E INICIALIZACIÓN
// ==========================================
window.showHome = () => {
    if (!currentUser) {
        showScreen('login-screen');
        return;
    }
    showScreen('home-screen');
    const display = document.getElementById('user-display');
    if (display) display.innerText = "👤 " + displayName;
    initRealtime();
};

document.addEventListener('DOMContentLoaded', () => {
    // Login
    const btnLogin = document.getElementById('btn-login-action');
    if (btnLogin) btnLogin.onclick = handleLogin;

    // Logout
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.onclick = () => {
            localStorage.clear();
            location.reload();
        };
    }

    // Navegar al Editor
    const btnGoEditor = document.getElementById('btn-go-editor');
    if (btnGoEditor) {
        btnGoEditor.onclick = () => {
            tempQuestions = [];
            const titleInput = document.getElementById('quiz-title-input');
            if (titleInput) titleInput.value = "";
            resetEditorInputs();
            showScreen('editor-screen');
        };
    }

    // Añadir opción extra en el editor
    const btnAddOpt = document.getElementById('btn-add-option');
    if (btnAddOpt) {
        btnAddOpt.onclick = () => {
            const setup = document.getElementById('options-setup');
            const currentOpts = setup.querySelectorAll('input').length;
            if (currentOpts >= 6) {
                alert("Para mantener la jugabilidad, el máximo son 6 opciones.");
                return;
            }
            const input = document.createElement('input');
            input.type = "text";
            input.className = "opt-input modern-input";
            input.placeholder = "Opción incorrecta";
            setup.appendChild(input);
        };
    }

    // Guardar Pregunta Actual
    const btnNextQ = document.getElementById('btn-next-q');
    if (btnNextQ) {
        btnNextQ.onclick = () => {
            const textVal = document.getElementById('q-text').value.trim();
            const optInputs = document.querySelectorAll('.opt-input');
            const opts = Array.from(optInputs).map(i => i.value.trim());

            if (!textVal || opts.some(o => !o)) {
                alert("Asegúrate de escribir la pregunta y todas sus opciones.");
                return;
            }

            tempQuestions.push({ text: textVal, opts: opts });
            resetEditorInputs();
        };
    }

    // Publicar Quiz Completo
    const btnSaveQuiz = document.getElementById('btn-save-quiz');
    if (btnSaveQuiz) {
        btnSaveQuiz.onclick = async () => {
            const titleVal = document.getElementById('quiz-title-input').value.trim();
            
            if (!titleVal) {
                alert("El quiz necesita un título.");
                return;
            }
            if (tempQuestions.length < 5) {
                alert("Debes añadir al menos 5 preguntas antes de publicar.");
                return;
            }

            try {
                await addDoc(collection(window.db, "quizzes"), {
                    title: titleVal,
                    questions: tempQuestions,
                    author: displayName,
                    createdAt: serverTimestamp()
                });
                alert("¡Quiz publicado con éxito!");
                window.showHome();
            } catch (e) {
                alert("Error al publicar el quiz.");
            }
        };
    }

    // Reset Ranking (Solo Admin)
    const btnResetRank = document.getElementById('btn-reset-ranking');
    if (btnResetRank) {
        btnResetRank.onclick = async () => {
            if (confirm("⚠️ ¿ESTÁS SEGURO? Esta acción es irreversible y borrará todos los puntos de todos los usuarios.")) {
                try {
                    const batch = writeBatch(window.db);
                    const sn = await getDocs(collection(window.db, "scores"));
                    sn.forEach(d => batch.delete(d.ref));
                    await batch.commit();
                    alert("Ranking reseteado.");
                } catch (e) { alert("Error al resetear."); }
            }
        };
    }

    // Botones de Volver
    const btnBackHome = document.getElementById('btn-back-home');
    if (btnBackHome) btnBackHome.onclick = () => window.showHome();

    const btnSettBack = document.getElementById('btn-settings-back');
    if (btnSettBack) btnSettBack.onclick = () => window.showHome();

    const btnRespBack = document.getElementById('btn-responses-back');
    if (btnRespBack) btnRespBack.onclick = () => showScreen('settings-screen');

    // Inicio de la App
    window.showHome();
});