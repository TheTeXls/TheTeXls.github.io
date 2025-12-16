// 1. INICIALIZACIÓN Y ADMIN POR DEFECTO
let usersDB = JSON.parse(localStorage.getItem('usersDB')) || {}; 
if (!usersDB["admin"]) {
    usersDB["admin"] = "gem"; // Usuario Admin configurado
    localStorage.setItem('usersDB', JSON.stringify(usersDB));
}

let allQuizzes = JSON.parse(localStorage.getItem('quizzesDB')) || [];
let allScores = JSON.parse(localStorage.getItem('scoresDB')) || [];
let currentUser = localStorage.getItem('quizUser') || null;

// 2. LOGIN CON SEGURIDAD
function handleLogin() {
    const nameInput = document.getElementById('user-name-input').value.trim();
    const pass = document.getElementById('user-pass-input').value.trim();
    if (!nameInput || !pass) return alert("Completa los campos");

    const nameLower = nameInput.toLowerCase();
    const existingKey = Object.keys(usersDB).find(k => k.toLowerCase() === nameLower);

    if (existingKey) {
        if (usersDB[existingKey] === pass) {
            loginSuccess(existingKey);
        } else {
            alert("Contraseña incorrecta para este usuario.");
        }
    } else {
        usersDB[nameInput] = pass;
        localStorage.setItem('usersDB', JSON.stringify(usersDB));
        loginSuccess(nameInput);
    }
}

function loginSuccess(name) {
    currentUser = name;
    localStorage.setItem('quizUser', name);
    showHome();
}

function logout() {
    localStorage.removeItem('quizUser');
    currentUser = null;
    showHome();
}

// 3. NAVEGACIÓN
function showHome() {
    if (!currentUser) { showScreen('login-screen'); return; }
    showScreen('home-screen');
    document.getElementById('user-display').innerText = `👤 ${currentUser}`;
    renderMenu();
    renderGlobalRanking();
}

function showScreen(id) {
    ['home-screen', 'editor-screen', 'quiz-screen', 'login-screen'].forEach(s => {
        document.getElementById(s).classList.add('hidden');
    });
    document.getElementById(id).classList.remove('hidden');
}

// 4. MENÚ Y PODERES ADMIN
function renderMenu() {
    const list = document.getElementById('quiz-list');
    list.innerHTML = "";
    allQuizzes.forEach(quiz => {
        const div = document.createElement('div');
        div.className = 'quiz-card';
        // Admin o dueño pueden borrar
        const canDelete = (quiz.author === currentUser || currentUser === "admin");
        
        div.innerHTML = `
            <b>${quiz.title}</b><br><small>Por: ${quiz.author}</small><br>
            <button onclick="startQuiz(${quiz.id})" class="btn-main" style="width:auto; margin-top:10px; padding:6px 15px">Jugar</button>
            ${canDelete ? `<button class="delete-btn" onclick="deleteQuiz(${quiz.id})">Borrar</button>` : ''}
        `;
        list.appendChild(div);
    });
}

function renderGlobalRanking() {
    const rankingDiv = document.getElementById('global-ranking-list');
    let totals = {};
    allScores.forEach(s => totals[s.user] = (totals[s.user] || 0) + s.points);
    let sorted = Object.entries(totals).sort((a,b) => b[1] - a[1]).slice(0, 10);
    
    let html = sorted.length ? sorted.map(([user, pts]) => `
        <div class="ranking-item"><span>${user}</span> <b>${pts} pts</b></div>
    `).join('') : "<p><small>Sin puntos todavía.</small></p>";

    // Botón de restaurar solo para el admin
    if (currentUser === "admin") {
        html += `<button onclick="resetRanking()" class="btn-small" style="margin-top:15px; width:100%; border-color:#e67e22; color:#e67e22;">Restaurar Ranking</button>`;
    }
    rankingDiv.innerHTML = html;
}

function resetRanking() {
    if (confirm("ADMIN: ¿Seguro que quieres borrar todo el ranking global?")) {
        allScores = [];
        localStorage.setItem('scoresDB', JSON.stringify(allScores));
        renderGlobalRanking();
    }
}

// 5. LÓGICA DE JUEGO
function startQuiz(id) {
    let quiz = allQuizzes.find(q => q.id === id);
    showScreen('quiz-screen');
    document.getElementById('current-quiz-title').innerText = quiz.title;
    const q = quiz.questions[0];
    document.getElementById('question-text').innerText = q.q;
    const container = document.getElementById('options-container');
    container.innerHTML = "";
    let shuffled = q.opts.map((t, i) => ({t, i})).sort(() => Math.random() - 0.5);
    shuffled.forEach(opt => {
        const btn = document.createElement('button');
        btn.innerText = opt.t; btn.className = 'option-btn';
        btn.onclick = () => {
            let pts = (opt.i === 0) ? 1 : 0;
            allScores.push({ user: currentUser, points: pts });
            localStorage.setItem('scoresDB', JSON.stringify(allScores));
            alert(pts > 0 ? "✅ ¡Correcto!" : "❌ Error");
            showHome();
        };
        container.appendChild(btn);
    });
}

// 6. EDITOR
function showEditor() { showScreen('editor-screen'); }
function addOptionField() {
    const container = document.getElementById('options-setup');
    if (container.getElementsByClassName('opt-input').length < 5) {
        const input = document.createElement('input');
        input.type = "text"; input.className = "opt-input"; input.placeholder = "Incorrecta ❌";
        container.appendChild(input);
    }
}

function saveNewQuiz() {
    const title = document.getElementById('quiz-title-input').value;
    const question = document.getElementById('q-text').value;
    const opts = Array.from(document.querySelectorAll('.opt-input')).map(i => i.value.trim()).filter(v => v !== "");
    if (!title || !question || opts.length < 2) return alert("Faltan datos");
    allQuizzes.push({ id: Date.now(), author: currentUser, title, questions: [{ q: question, opts, correct: 0 }] });
    localStorage.setItem('quizzesDB', JSON.stringify(allQuizzes));
    showHome();
}

function deleteQuiz(id) {
    if(confirm("¿Seguro que quieres borrar este quiz?")) {
        allQuizzes = allQuizzes.filter(q => q.id !== id);
        localStorage.setItem('quizzesDB', JSON.stringify(allQuizzes));
        renderMenu();
    }
}

showHome();

// Variable global para saber qué quiz estamos editando
let quizToEdit = null;

// MODIFICACIÓN EN RENDERMENU
function renderMenu() {
    const list = document.getElementById('quiz-list');
    list.innerHTML = "";
    allQuizzes.forEach(quiz => {
        const div = document.createElement('div');
        div.className = 'quiz-card';
        const isOwnerOrAdmin = (quiz.author === currentUser || currentUser === "admin");
        
        div.innerHTML = `
            <b>${quiz.title}</b><br><small>Por: ${quiz.author}</small><br>
            <div style="display: flex; gap: 10px; align-items: center;">
                <button onclick="startQuiz(${quiz.id})" class="btn-main" style="width:auto; margin-top:10px; padding:6px 15px">Jugar</button>
                ${isOwnerOrAdmin ? `<button class="btn-settings" onclick="openSettings(${quiz.id})">⚙️ Ajustes</button>` : ''}
            </div>
        `;
        list.appendChild(div);
    });
}

// NUEVA FUNCIÓN: ABRIR AJUSTES
function openSettings(id) {
    quizToEdit = allQuizzes.find(q => q.id === id);
    showScreen('settings-screen');
    
    const infoBox = document.getElementById('quiz-info-box');
    const qData = quizToEdit.questions[0];
    
    infoBox.innerHTML = `
        <h3 style="margin-top:0">Ver Respuestas</h3>
        <p><b>Pregunta:</b> ${qData.q}</p>
        <div class="answer-preview">
            <b>✅ Respuesta Correcta:</b><br>
            ${qData.opts[0]}
        </div>
        <p><b>❌ Respuestas Incorrectas:</b><br>
        ${qData.opts.slice(1).join(', ')}</p>
    `;
}

// CONFIRMAR ELIMINACIÓN
function confirmDelete() {
    if (confirm(`¿Estás seguro de que quieres eliminar "${quizToEdit.title}"? Esta acción no se puede deshacer.`)) {
        allQuizzes = allQuizzes.filter(q => q.id !== quizToEdit.id);
        localStorage.setItem('quizzesDB', JSON.stringify(allQuizzes));
        showHome();
    }
}

// ACTUALIZACIÓN DE SHOWSCREEN PARA INCLUIR AJUSTES
function showScreen(id) {
    ['home-screen', 'editor-screen', 'quiz-screen', 'login-screen', 'settings-screen'].forEach(s => {
        const el = document.getElementById(s);
        if (el) el.classList.add('hidden');
    });
    document.getElementById(id).classList.remove('hidden');
}

// Asegúrate de que el resto de funciones (login, save, etc.) se mantengan igual.

function startQuiz(id) {
    let quiz = allQuizzes.find(q => q.id === id);
    showScreen('quiz-screen');
    document.getElementById('current-quiz-title').innerText = quiz.title;
    const q = quiz.questions[0];
    document.getElementById('question-text').innerText = q.q;
    const container = document.getElementById('options-container');
    container.innerHTML = "";
    
    let shuffled = q.opts.map((t, i) => ({t, i})).sort(() => Math.random() - 0.5);
    shuffled.forEach(opt => {
        const btn = document.createElement('button');
        btn.innerText = opt.t; btn.className = 'option-btn';
        btn.onclick = () => {
            let isCorrect = (opt.i === 0);
            // GUARDAMOS: Quién, en qué Quiz, qué respondió y cuántos puntos
            allScores.push({ 
                user: currentUser, 
                quizId: id, 
                quizTitle: quiz.title,
                wasCorrect: isCorrect,
                answerText: opt.t,
                points: isCorrect ? 1 : 0 
            });
            localStorage.setItem('scoresDB', JSON.stringify(allScores));
            alert(isCorrect ? "✅ ¡Correcto!" : `❌ Incorrecto. Era: ${q.opts[0]}`);
            showHome();
        };
        container.appendChild(btn);
    });
}

function openSettings(id) {
    quizToEdit = allQuizzes.find(q => q.id === id);
    showScreen('settings-screen');
    
    const infoBox = document.getElementById('quiz-info-box');
    const qData = quizToEdit.questions[0];
    
    // Filtramos quiénes han jugado este quiz específico
    const playersOfThisQuiz = allScores.filter(s => s.quizId === id);

    let statsHtml = `
        <h3 style="margin-top:0">Estadísticas de Jugadores</h3>
        <table class="stats-table">
            <thead>
                <tr>
                    <th>Usuario</th>
                    <th>Respuesta</th>
                    <th>Resultado</th>
                </tr>
            </thead>
            <tbody>
                ${playersOfThisQuiz.length > 0 ? playersOfThisQuiz.map(s => `
                    <tr>
                        <td>${s.user}</td>
                        <td>${s.answerText}</td>
                        <td class="${s.wasCorrect ? 'res-correct' : 'res-wrong'}">
                            ${s.wasCorrect ? 'Acertó' : 'Falló'}
                        </td>
                    </tr>
                `).join('') : '<tr><td colspan="3">Nadie ha jugado aún.</td></tr>'}
            </tbody>
        </table>
        <hr>
        <h3>Ver Configuración</h3>
        <p><b>Pregunta:</b> ${qData.q}</p>
        <div class="answer-preview">
            <b>✅ Respuesta Correcta:</b><br>
            ${qData.opts[0]}
        </div>
    `;
    
    infoBox.innerHTML = statsHtml;
}