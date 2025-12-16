import { collection, addDoc, onSnapshot, doc, getDoc, setDoc, serverTimestamp } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = localStorage.getItem('quizUser') || null;

function showScreen(id) {
    document.querySelectorAll('.container').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

// LOGIN
async function handleLogin() {
    const name = document.getElementById('user-name-input').value.trim();
    const pass = document.getElementById('user-pass-input').value.trim();
    if (!name || !pass) return alert("Faltan datos");

    const userRef = doc(window.db, "users", name.toLowerCase());
    const snap = await getDoc(userRef);

    if (snap.exists() && snap.data().pass !== pass) return alert("Contraseña incorrecta");
    if (!snap.exists()) await setDoc(userRef, { originalName: name, pass: pass });

    currentUser = name;
    localStorage.setItem('quizUser', name);
    showHome();
}

function showHome() {
    if (!currentUser) return showScreen('login-screen');
    showScreen('home-screen');
    document.getElementById('user-display').innerText = `👤 ${currentUser}`;
    
    // Cargar Quizzes en tiempo real
    onSnapshot(collection(window.db, "quizzes"), (snap) => {
        const list = document.getElementById('quiz-list');
        list.innerHTML = "";
        snap.forEach(d => {
            const q = d.data();
            list.innerHTML += `<div class="quiz-card"><b>${q.title}</b><br><small>Por: ${q.author}</small></div>`;
        });
    });
}

// PUBLICAR QUIZ (ESTO ES LO QUE NO TE FUNCIONABA)
async function saveNewQuiz() {
    const title = document.getElementById('quiz-title-input').value.trim();
    const question = document.getElementById('q-text').value.trim();
    const inputs = document.querySelectorAll('.opt-input');
    const options = Array.from(inputs).map(i => i.value.trim()).filter(v => v !== "");

    if (!title || !question || options.length < 2) {
        return alert("Completa el título, la pregunta y al menos 2 opciones.");
    }

    try {
        await addDoc(collection(window.db, "quizzes"), {
            title: title,
            q: question,
            opts: options,
            author: currentUser,
            createdAt: serverTimestamp()
        });
        alert("¡Quiz publicado!");
        showHome();
    } catch (e) {
        alert("Error al publicar");
    }
}

// ASIGNAR BOTONES
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-login-action').onclick = handleLogin;
    document.getElementById('btn-logout').onclick = () => { localStorage.clear(); location.reload(); };
    document.getElementById('btn-go-editor').onclick = () => showScreen('editor-screen');
    document.getElementById('btn-back-home').onclick = () => showHome();
    document.getElementById('btn-save-quiz').onclick = saveNewQuiz;
    document.getElementById('btn-add-option').onclick = () => {
        const inp = document.createElement('input');
        inp.className = "opt-input"; inp.placeholder = "Incorrecta";
        document.getElementById('options-setup').appendChild(inp);
    };
});

showHome();