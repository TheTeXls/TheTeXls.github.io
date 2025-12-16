import { collection, addDoc, onSnapshot, doc, getDoc, setDoc, deleteDoc, serverTimestamp, query, where, getDocs, writeBatch } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- CREDENCIALES MAESTRAS ---
const ADMIN_ID = "admin";
const ADMIN_PASS = "gem";

let currentUser = localStorage.getItem('quizUser') || null;
let displayName = localStorage.getItem('quizDisplayName') || null;

function showScreen(id) {
    document.querySelectorAll('.container').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

window.showHome = function() {
    if (!currentUser) return showScreen('login-screen');
    showScreen('home-screen');
    
    // Mostramos el nombre bonito
    document.getElementById('user-display').innerText = `👤 ${displayName || currentUser}`;
    
    // ERROR 3 CORREGIDO: Verificación forzada para mostrar botón de restaurar
    const adminBtn = document.getElementById('btn-admin-reset');
    if (currentUser === ADMIN_ID) {
        adminBtn.classList.remove('hidden');
    } else {
        adminBtn.classList.add('hidden');
    }

    initRealtime();
}

async function handleLogin() {
    const rawName = document.getElementById('user-name-input').value.trim();
    const pass = document.getElementById('user-pass-input').value.trim();
    if (!rawName || !pass) return alert("Completa los datos");

    const lowerName = rawName.toLowerCase();

    // LOGIN ADMIN
    if (lowerName === ADMIN_ID && pass === ADMIN_PASS) {
        currentUser = ADMIN_ID;
        displayName = "Administrador Supremo";
    } else {
        // LOGIN NORMAL
        const userRef = doc(window.db, "users", lowerName);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
            if (snap.data().pass !== pass) return alert("Contraseña incorrecta");
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
    // ERROR 1 CORREGIDO: Si es admin, playedQuizIds siempre estará vacío para él
    let playedQuizIds = [];
    if (currentUser !== ADMIN_ID) {
        const qScores = query(collection(window.db, "scores"), where("user", "==", currentUser));
        const scoreSnap = await getDocs(qScores);
        playedQuizIds = scoreSnap.docs.map(d => d.data().quizId);
    }

    onSnapshot(collection(window.db, "quizzes"), (snap) => {
        const list = document.getElementById('quiz-list');
        list.innerHTML = "<h3>Quizzes Disponibles</h3>";
        
        snap.forEach(d => {
            const q = { id: d.id, ...d.data() };
            const isPlayed = playedQuizIds.includes(q.id);
            const isAdmin = (currentUser === ADMIN_ID);
            
            const div = document.createElement('div');
            div.className = 'quiz-card';
            div.innerHTML = `<b>${q.title}</b><br><small>Por: ${q.author}</small>`;
            
            const btnJugar = document.createElement('button');
            btnJugar.className = "btn-main";
            
            // Si es admin, NUNCA se bloquea el botón
            if (isPlayed && !isAdmin) {
                btnJugar.innerText = "Ya jugaste este quiz";
                btnJugar.disabled = true;
                btnJugar.style.background = "#b2bec3";
            } else {
                btnJugar.innerText = isAdmin ? "Probar Quiz (Admin) 🎮" : "Jugar 🎮";
                btnJugar.onclick = () => startQuiz(q);
            }
            div.appendChild(btnJugar);

            // ERROR 2 CORREGIDO: El admin ahora ve el botón de Ajustes en TODOS los quizzes
            // Comparamos el autor en minúsculas con el currentUser
            if (isAdmin || (q.author && q.author.toLowerCase() === currentUser)) {
                const btnAjustes = document.createElement('button');
                btnAjustes.className = "btn-small";
                btnAjustes.style.marginTop = "10px";
                btnAjustes.innerText = isAdmin && (q.author.toLowerCase() !== currentUser) ? "⚙️ Gestionar (Admin)" : "⚙️ Ajustes";
                btnAjustes.onclick = () => openSettings(q);
                div.appendChild(btnAjustes);
            }
            list.appendChild(div);
        });
    });

    // Ranking Global
    onSnapshot(collection(window.db, "scores"), (snap) => {
        const rList = document.getElementById('global-ranking-list');
        if(!rList) return;
        rList.innerHTML = "<h3>🏆 Ranking Global</h3>";
        let totals = {};
        snap.forEach(d => {
            const s = d.data();
            if(s.user) {
                const u = s.user.toLowerCase();
                totals[u] = (totals[u] || 0) + (s.points || 0);
            }
        });
        Object.entries(totals).sort((a,b) => b[1]-a[1]).forEach(([u, p]) => {
            rList.innerHTML += `<div class="ranking-item"><span>${u}</span><b>${p} pts</b></div>`;
        });
    });
}

// ERROR 3: Función de restauración mejorada
async function resetRanking() {
    if (currentUser !== ADMIN_ID) return;
    if (!confirm("⚠️ ¿BORRAR TODO EL RANKING? Los usuarios podrán volver a jugar todo.")) return;
    
    try {
        const scoresSnap = await getDocs(collection(window.db, "scores"));
        const batch = writeBatch(window.db);
        scoresSnap.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        alert("¡Ranking y progreso reiniciados con éxito!");
        window.location.reload();
    } catch (e) { 
        console.error(e);
        alert("Error al restaurar"); 
    }
}

function startQuiz(quiz) {
    showScreen('quiz-screen');
    document.getElementById('current-quiz-title').innerText = quiz.title;
    const cont = document.getElementById('options-container');
    cont.innerHTML = `<p>${quiz.q}</p>`;
    
    quiz.opts.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = "btn-main";
        btn.style.background = "white"; btn.style.color = "#6c5ce7";
        btn.innerText = opt;
        btn.onclick = async () => {
            const acerto = (i === 0);
            // El admin también puede guardar scores para probar, pero no le bloquea el botón
            await addDoc(collection(window.db, "scores"), {
                user: currentUser, 
                points: acerto ? 1 : 0, 
                quizId: quiz.id,
                acerto: acerto,
                date: serverTimestamp()
            });
            alert(acerto ? "✅ ¡Correcto!" : "❌ Incorrecto");
            window.showHome();
        };
        cont.appendChild(btn);
    });
}

function openSettings(quiz) {
    document.getElementById('settings-quiz-title').innerText = `Ajustes: ${quiz.title}`;
    showScreen('settings-screen');
    
    // ERROR 2: Botón eliminar ahora funciona para cualquier quiz si es admin
    document.getElementById('btn-delete-quiz').onclick = async () => {
        if(confirm(`¿Eliminar el quiz "${quiz.title}" definitivamente?`)) {
            await deleteDoc(doc(window.db, "quizzes", quiz.id));
            alert("Quiz eliminado");
            window.showHome();
        }
    };

    // ERROR 2: Ver respuestas ahora carga los resultados del quiz seleccionado
    document.getElementById('btn-view-responses').onclick = async () => {
        showScreen('responses-screen');
        const table = document.getElementById('responses-table');
        table.innerHTML = "Cargando respuestas...";
        
        const qQuery = query(collection(window.db, "scores"), where("quizId", "==", quiz.id));
        const snap = await getDocs(qQuery);
        
        table.innerHTML = snap.empty ? "Nadie ha respondido este quiz aún." : "";
        snap.forEach(d => {
            const r = d.data();
            table.innerHTML += `<div class="ranking-item"><span>${r.user}</span><b>${r.acerto ? "✅ Acertó" : "❌ Falló"}</b></div>`;
        });
    };
}

document.addEventListener('DOMContentLoaded', () => {
    if(document.getElementById('btn-login-action')) {
        document.getElementById('btn-login-action').onclick = handleLogin;
    }
    if(document.getElementById('btn-logout')) {
        document.getElementById('btn-logout').onclick = () => { 
            localStorage.clear(); 
            window.location.reload(); 
        };
    }
    document.getElementById('btn-go-editor').onclick = () => showScreen('editor-screen');
    document.getElementById('btn-back-home').onclick = () => window.showHome();
    
    const resetBtn = document.getElementById('btn-admin-reset');
    if(resetBtn) resetBtn.onclick = resetRanking;

    document.getElementById('btn-save-quiz').onclick = async () => {
        const title = document.getElementById('quiz-title-input').value;
        const qText = document.getElementById('q-text').value;
        const opts = Array.from(document.querySelectorAll('.opt-input')).map(i => i.value);
        if(!title || !qText || opts.length < 2) return alert("Faltan datos");
        await addDoc(collection(window.db, "quizzes"), { title, q: qText, opts, author: displayName });
        alert("¡Publicado!");
        window.showHome();
    };
    
    document.getElementById('btn-add-option').onclick = () => {
        const inp = document.createElement('input');
        inp.className = "opt-input"; inp.placeholder = "Incorrecta";
        document.getElementById('options-setup').appendChild(inp);
    };
});

window.showHome();