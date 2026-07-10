// ======================== ВИЗНАЧЕННЯ ПЛАТФОРМИ ========================
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const supportsSpeechRecognition = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
const supportsSpeechSynthesis = 'speechSynthesis' in window;

console.log('📱 Платформа:', {
    isIOS,
    isSafari,
    isMobile,
    supportsSpeechRecognition,
    supportsSpeechSynthesis
});

// ======================== ГЛОБАЛЬНІ ЗМІННІ ========================
let THEMES_HIERARCHY = {};
let masterWords = {};
let phraseLibrary = {};
let listeningLibrary = {};
let DIALOGUES = {};

let ALL_THEMES = {};
let currentThemeId = "A1_zaklad";
let currentThemeData = null;
let currentWords = [];
let currentPhrases = [];
let currentListeningItems = [];

// Стан прогресу
let progressData = {};
let currentCardIndex = 0, showTranslation = false;
let currentQuizQuestion = null, quizAnswered = false;
let currentPhraseIndex = 0, currentTokensMix = [], currentUserSentence = [], phraseAnswered = false;
let currentListeningIndex = 0, listeningAnswered = false;

// Діалоги
let currentDialogueTheme = "Знайомство", currentDialogueIndex = 0, currentDialogueLines = [];

// Web Speech
let activeRecognition = null;
let currentMicButton = null;
let availableVoices = [];
let voiceLoadAttempts = 0;
const MAX_VOICE_ATTEMPTS = 5;
let isSpeechInitialized = false;

// ======================== ЗАВАНТАЖЕННЯ ГОЛОСІВ ========================
function loadVoices() {
    return new Promise((resolve) => {
        if (!window.speechSynthesis) {
            resolve([]);
            return;
        }
        
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            availableVoices = voices;
            console.log('✅ Голоси завантажено:', voices.length);
            resolve(voices);
            return;
        }
        
        const delay = isIOS ? 500 : 100;
        
        const checkVoices = () => {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
                availableVoices = voices;
                console.log('✅ Голоси завантажено (повторно):', voices.length);
                resolve(voices);
                return;
            }
            
            voiceLoadAttempts++;
            if (voiceLoadAttempts < MAX_VOICE_ATTEMPTS) {
                console.log(`🔄 Спроба ${voiceLoadAttempts}/${MAX_VOICE_ATTEMPTS}...`);
                setTimeout(checkVoices, delay);
            } else {
                console.warn('⚠️ Не вдалося завантажити голоси');
                resolve([]);
            }
        };
        
        if (window.speechSynthesis) {
            window.speechSynthesis.onvoiceschanged = () => {
                const voices = window.speechSynthesis.getVoices();
                if (voices.length > 0) {
                    availableVoices = voices;
                    resolve(voices);
                }
            };
        }
        
        setTimeout(checkVoices, delay);
    });
}

// ======================== TTS ТА РОЗПІЗНАВАННЯ ========================
function speakText(text, lang = 'sk-SK') {
    if (!text) return;
    
    if (!window.speechSynthesis) {
        if (isIOS) {
            showIOSFallback(text);
        } else {
            alert("Ваш браузер не підтримує озвучення.");
        }
        return;
    }
    
    // Для iOS: потрібно викликати в контексті жесту користувача
    if (isIOS && !isSpeechInitialized) {
        isSpeechInitialized = true;
        // Запитуємо дозвіл при першому використанні
        try {
            window.speechSynthesis.getVoices();
        } catch(e) {}
    }
    
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // Вибір голосу
    let selectedVoice = null;
    
    if (availableVoices.length === 0) {
        availableVoices = window.speechSynthesis.getVoices();
    }
    
    if (isIOS) {
        // Пріоритет для iOS: спочатку словацькі голоси Apple
        const iosPriority = [
            'Zuzana', 'Laura', 'Slovak', 'sk-SK', 'sk',
            'Iveta', 'cs-CZ', 'Ewa', 'pl-PL'
        ];
        
        for (const pref of iosPriority) {
            selectedVoice = availableVoices.find(v => 
                v.name.includes(pref) || 
                v.lang === pref ||
                v.lang.startsWith(pref.replace('-', ''))
            );
            if (selectedVoice) break;
        }
        
        // Якщо немає словацького, беремо будь-який жіночий голос
        if (!selectedVoice) {
            selectedVoice = availableVoices.find(v => 
                v.lang === 'cs-CZ' || 
                v.lang === 'pl-PL' ||
                v.lang.startsWith('cs') ||
                v.lang.startsWith('pl')
            );
        }
    } else {
        // Для Android/інших
        const priority = [
            'Google slovak', 'Google čeština', 'Google polski',
            'sk-SK', 'sk', 'cs-CZ', 'pl-PL'
        ];
        
        for (const pref of priority) {
            selectedVoice = availableVoices.find(v => 
                v.name.toLowerCase().includes(pref.toLowerCase()) ||
                v.lang === pref
            );
            if (selectedVoice) break;
        }
    }
    
    // Якщо все ще немає голосу, беремо перший доступний
    if (!selectedVoice && availableVoices.length > 0) {
        selectedVoice = availableVoices[0];
    }
    
    if (selectedVoice) {
        utterance.voice = selectedVoice;
        console.log('🎤 Вибрано голос:', selectedVoice.name, selectedVoice.lang);
        
        // Оптимальна швидкість для різних голосів
        if (selectedVoice.name.includes('Google')) {
            utterance.rate = 0.9;
        } else if (selectedVoice.name.includes('Zuzana') || selectedVoice.name.includes('Laura')) {
            utterance.rate = 0.85;
        }
    } else {
        console.warn('⚠️ Не знайдено відповідного голосу');
    }
    
    // Обробка помилок
    utterance.onerror = (event) => {
        console.error('❌ Помилка озвучення:', event);
        if (isIOS) {
            showIOSFallback(text);
        }
    };
    
    utterance.onend = () => {
        console.log('✅ Озвучення завершено');
    };
    
    try {
        window.speechSynthesis.speak(utterance);
    } catch (error) {
        console.error('❌ Помилка виклику speak:', error);
        if (isIOS) {
            showIOSFallback(text);
        }
    }
}

// ======================== FALLBACK ДЛЯ IOS ========================
function showIOSFallback(text) {
    const existing = document.getElementById('iosSpeechFallback');
    if (existing) existing.remove();
    
    const div = document.createElement('div');
    div.id = 'iosSpeechFallback';
    div.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #1e3c72;
        color: white;
        padding: 16px 24px;
        border-radius: 16px;
        max-width: 90%;
        z-index: 9999;
        font-size: 1rem;
        text-align: center;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        animation: fadeInUp 0.3s ease;
    `;
    div.innerHTML = `
        <div style="margin-bottom: 8px;">🔊 Натисніть для озвучення:</div>
        <div style="font-weight: 600; font-size: 1.2rem; word-wrap: break-word;">${text}</div>
        <button onclick="this.parentElement.remove()" style="
            margin-top: 12px;
            padding: 8px 20px;
            border: none;
            border-radius: 20px;
            background: rgba(255,255,255,0.2);
            color: white;
            font-weight: 600;
            cursor: pointer;
        ">✕ Закрити</button>
    `;
    document.body.appendChild(div);
    
    setTimeout(() => {
        if (div.parentElement) div.remove();
    }, 8000);
}

// ======================== АДАПТОВАНИЙ МІКРОФОН ДЛЯ IOS ========================
function startListening(expectedText, callback, buttonElement) {
    // Перевірка підтримки на iOS
    if (isIOS && !supportsSpeechRecognition) {
        showIOSMicFallback(expectedText, callback);
        return;
    }
    
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        if (isIOS) {
            showIOSMicFallback(expectedText, callback);
        } else {
            callback(false, "Розпізнавання не підтримується.");
        }
        return;
    }
    
    if (activeRecognition) {
        try { activeRecognition.abort(); } catch(e) {}
        activeRecognition = null;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'sk-SK';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    
    // Для iOS додаткові налаштування
    if (isIOS) {
        recognition.lang = 'sk-SK';
        recognition.interimResults = true;
    }
    
    if (buttonElement) {
        currentMicButton = buttonElement;
        buttonElement.classList.add('recording');
        buttonElement.innerHTML = '🔴 Слухаю...';
        buttonElement.disabled = true;
    }
    
    recognition.start();
    
    recognition.onresult = (event) => {
        let spoken = '';
        if (event.results.length > 0) {
            const lastResult = event.results[event.results.length - 1];
            if (lastResult.isFinal) {
                spoken = lastResult[0].transcript;
            } else if (event.results[0][0]) {
                spoken = event.results[0][0].transcript;
            }
        }
        
        if (spoken) {
            const normalizedSpoken = spoken.toLowerCase().trim().replace(/\s+/g, ' ');
            const normalizedExpected = expectedText.toLowerCase().trim().replace(/\s+/g, ' ');
            callback(normalizedSpoken === normalizedExpected, spoken);
            stopListeningUI(buttonElement);
        }
    };
    
    recognition.onerror = (event) => {
        let errorMsg = 'Помилка розпізнавання';
        
        if (isIOS) {
            switch(event.error) {
                case 'not-allowed':
                    errorMsg = 'Дозвольте доступ до мікрофона в налаштуваннях iPhone';
                    break;
                case 'audio-capture':
                    errorMsg = 'Не вдалося отримати доступ до мікрофона';
                    break;
                case 'network':
                    errorMsg = 'Помилка мережі. Спробуйте ще раз.';
                    break;
                default:
                    errorMsg = `Помилка: ${event.error}`;
            }
        } else {
            errorMsg = event.error === 'not-allowed' ? 'Немає дозволу на мікрофон.' : event.error;
        }
        
        callback(false, errorMsg);
        stopListeningUI(buttonElement);
    };
    
    recognition.onend = () => {
        stopListeningUI(buttonElement);
        if (buttonElement) buttonElement.disabled = false;
    };
    
    activeRecognition = recognition;
    
    const timeout = isIOS ? 15000 : 10000;
    setTimeout(() => {
        if (activeRecognition) {
            try { activeRecognition.abort(); } catch(e) {}
            stopListeningUI(buttonElement);
            if (buttonElement) buttonElement.disabled = false;
            callback(false, "Час вичерпано.");
        }
    }, timeout);
}

// ======================== FALLBACK ДЛЯ МІКРОФОНА НА IOS ========================
function showIOSMicFallback(expectedText, callback) {
    // Показуємо діалог для ручного введення
    const userInput = prompt(`📱 Введіть текст словацькою:\n(очікується: "${expectedText}")`);
    if (userInput !== null && userInput.trim() !== '') {
        const normalizedInput = userInput.trim().toLowerCase().replace(/\s+/g, ' ');
        const normalizedExpected = expectedText.toLowerCase().trim().replace(/\s+/g, ' ');
        callback(normalizedInput === normalizedExpected, userInput.trim());
    } else {
        callback(false, "Введення скасовано");
    }
}

function stopListeningUI(buttonElement) {
    if (buttonElement) {
        buttonElement.classList.remove('recording');
        buttonElement.innerHTML = buttonElement.getAttribute('data-original-text') || '🎤 Вимова';
        buttonElement.disabled = false;
    }
    if (activeRecognition) {
        try { activeRecognition.abort(); } catch(e) {}
        activeRecognition = null;
    }
    currentMicButton = null;
}

function setupMicButton(buttonId, expectedTextGetter, feedbackId, successMessage) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.setAttribute('data-original-text', btn.innerHTML);
    btn.addEventListener("click", () => {
        const expected = (typeof expectedTextGetter === "function") ? expectedTextGetter() : expectedTextGetter;
        if (!expected) {
            const fb = document.getElementById(feedbackId);
            if (fb) fb.innerHTML = "❌ Немає слова для перевірки.";
            return;
        }
        startListening(expected, (ok, spoken) => {
            const fb = document.getElementById(feedbackId);
            if (fb) {
                if (ok) {
                    fb.innerHTML = `✅ ${successMessage || "Вимова правильна!"}`;
                    fb.style.color = '#10b981';
                } else {
                    fb.innerHTML = `❌ ${spoken || "Помилка"}. Очікувалось: "${expected}"`;
                    fb.style.color = '#ef4444';
                }
            }
        }, btn);
    });
}

// ======================== ЗАВАНТАЖЕННЯ ДАНИХ ========================
async function loadData() {
    try {
        const [hierarchy, words, phrases, listening, dialogues] = await Promise.all([
            fetch('data/hierarchy.json').then(r => r.json()),
            fetch('data/words.json').then(r => r.json()),
            fetch('data/phrases.json').then(r => r.json()),
            fetch('data/listening.json').then(r => r.json()),
            fetch('data/dialogues.json').then(r => r.json())
        ]);
        
        THEMES_HIERARCHY = hierarchy;
        masterWords = words;
        phraseLibrary = phrases;
        listeningLibrary = listening;
        DIALOGUES = dialogues;
        
        buildAllThemes();
        fillPanels();
        
        // Завантажуємо голоси
        await loadVoices();
        
        initApp();
    } catch (error) {
        console.error('❌ Помилка завантаження даних:', error);
        document.getElementById('themeHierarchy').innerHTML = `
            <div style="color:red; padding:20px; text-align:center;">
                ❌ Помилка завантаження даних. Переконайтеся, що всі JSON файли знаходяться в папці data/
                <br><br>
                <details>
                    <summary>Деталі помилки</summary>
                    <pre style="text-align:left; background:#f1f5f9; padding:10px; border-radius:8px; overflow:auto;">${error.message}</pre>
                </details>
            </div>
        `;
    }
}

function buildAllThemes() {
    ALL_THEMES = {};
    for (let levelId in THEMES_HIERARCHY) {
        for (let catId in THEMES_HIERARCHY[levelId].categories) {
            for (let themeId in THEMES_HIERARCHY[levelId].categories[catId].themes) {
                const theme = THEMES_HIERARCHY[levelId].categories[catId].themes[themeId];
                theme.words = (masterWords[themeId] || []).map(e => { 
                    let [sk, uk] = e.split(","); 
                    return { sk: sk.trim(), uk: uk.trim() }; 
                });
                theme.phrases = phraseLibrary[themeId] || [];
                theme.listeningItems = listeningLibrary[themeId] || [];
                ALL_THEMES[themeId] = theme;
            }
        }
    }
}

// ======================== ІНСТРУКЦІЇ ДЛЯ IOS ========================
function showIOSInstructions() {
    const existing = document.getElementById('iosInstructions');
    if (existing) return;
    
    const div = document.createElement('div');
    div.id = 'iosInstructions';
    div.style.cssText = `
        background: #fef9e3;
        border-radius: 16px;
        padding: 16px;
        margin-bottom: 16px;
        border-left: 4px solid #f59e0b;
        font-size: 0.9rem;
    `;
    div.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 10px;">
            <span style="font-size: 1.4rem;">📱</span>
            <div>
                <strong style="display: block; margin-bottom: 4px;">Для iPhone:</strong>
                <ul style="margin: 4px 0 0 16px; padding-left: 4px;">
                    <li>Дозвольте доступ до мікрофона в налаштуваннях Safari</li>
                    <li>Натискайте кнопки 🎤 для озвучення</li>
                    <li>Якщо мікрофон не працює, введіть текст вручну</li>
                </ul>
            </div>
        </div>
    `;
    
    const container = document.querySelector('.app-container');
    if (container) {
        container.insertBefore(div, container.firstChild);
    }
}

// ======================== ВІДОБРАЖЕННЯ ІЄРАРХІЇ ========================
function renderThemeHierarchy() {
    const container = document.getElementById("themeHierarchy");
    container.innerHTML = "";
    for (let levelId in THEMES_HIERARCHY) {
        const level = THEMES_HIERARCHY[levelId];
        const levelDiv = document.createElement("div");
        levelDiv.className = "level-container";
        const levelHeader = document.createElement("div");
        levelHeader.className = "level-header";
        levelHeader.innerHTML = `<span>${level.name}</span><span class="arrow">▼</span>`;
        const levelContent = document.createElement("div");
        levelContent.className = "level-content";
        
        levelHeader.onclick = () => {
            levelHeader.classList.toggle("collapsed");
            levelContent.classList.toggle("hidden-level");
        };
        
        for (let catId in level.categories) {
            const category = level.categories[catId];
            const catDiv = document.createElement("div");
            catDiv.className = "category-container";
            const catHeader = document.createElement("div");
            catHeader.className = "category-header";
            catHeader.innerHTML = `<span>📁 ${category.name}</span><span class="arrow">▼</span>`;
            const themesDiv = document.createElement("div");
            themesDiv.className = "themes-list";
            
            catHeader.onclick = () => {
                catHeader.classList.toggle("collapsed");
                themesDiv.classList.toggle("hidden-level");
            };
            
            for (let themeId in category.themes) {
                const theme = category.themes[themeId];
                const themeBtn = document.createElement("button");
                themeBtn.className = `theme-btn ${themeId === currentThemeId ? 'active-theme' : ''}`;
                themeBtn.innerText = theme.name;
                themeBtn.onclick = () => {
                    switchTheme(themeId);
                    renderThemeHierarchy();
                };
                themesDiv.appendChild(themeBtn);
            }
            catDiv.appendChild(catHeader);
            catDiv.appendChild(themesDiv);
            levelContent.appendChild(catDiv);
        }
        levelDiv.appendChild(levelHeader);
        levelDiv.appendChild(levelContent);
        container.appendChild(levelDiv);
    }
}

function switchTheme(themeId) {
    if (!ALL_THEMES[themeId]) return;
    currentThemeId = themeId;
    currentThemeData = ALL_THEMES[themeId];
    currentWords = currentThemeData.words;
    currentPhrases = currentThemeData.phrases;
    currentListeningItems = currentThemeData.listeningItems;
    
    if (!progressData[currentThemeId]) {
        progressData[currentThemeId] = { learnedSet: [], phraseIndex: 0, quizStats: { correct: 0, total: 0 }, listeningIndex: 0 };
    }
    currentCardIndex = 0;
    showTranslation = false;
    updateFlashcardDisplay();
    let stats = progressData[currentThemeId].quizStats || { correct: 0, total: 0 };
    const quizStatsEl = document.getElementById("quizStats");
    if (quizStatsEl) quizStatsEl.innerHTML = `Правильних: ${stats.correct} / ${stats.total}`;
    currentPhraseIndex = progressData[currentThemeId].phraseIndex || 0;
    if (currentPhrases.length > 0 && currentPhraseIndex >= currentPhrases.length) currentPhraseIndex = 0;
    loadPhrase(currentPhraseIndex);
    generateQuizQuestion();
    currentListeningIndex = progressData[currentThemeId].listeningIndex || 0;
    if (currentListeningItems.length > 0 && currentListeningIndex >= currentListeningItems.length) currentListeningIndex = 0;
    loadListeningTask(currentListeningIndex);
    renderVocabulary(document.getElementById("searchVocab")?.value || "");
    updateLearnedStats();
    saveThemeProgress();
}

// ======================== ПРОГРЕС ========================
function loadThemeProgress() {
    let s = localStorage.getItem("slovak_progress_hierarchy");
    if(s) progressData = JSON.parse(s);
    if(!progressData[currentThemeId]) progressData[currentThemeId] = { learnedSet: [], phraseIndex: 0, quizStats: { correct:0, total:0 }, listeningIndex: 0 };
}
function saveThemeProgress() { localStorage.setItem("slovak_progress_hierarchy", JSON.stringify(progressData)); }
function getLearnedSet() { return new Set(progressData[currentThemeId]?.learnedSet || []); }
function saveLearnedSet(set) { progressData[currentThemeId].learnedSet = [...set]; saveThemeProgress(); updateLearnedStats(); }

// ======================== ФЛЕШКАРТКИ ========================
function updateFlashcardDisplay() {
    if (!currentWords.length) return;
    let w = currentWords[currentCardIndex];
    const skEl = document.getElementById("currentWordSk");
    const uaDiv = document.getElementById("currentWordUa");
    if (skEl) skEl.innerText = w.sk;
    if (uaDiv) {
        if(showTranslation) { uaDiv.innerText = w.uk; uaDiv.classList.remove("hidden-translation"); }
        else { uaDiv.classList.add("hidden-translation"); uaDiv.innerText = ""; }
    }
    const progressEl = document.getElementById("cardProgress");
    if (progressEl) progressEl.innerHTML = `Слово ${currentCardIndex+1} з ${currentWords.length}`;
}
function toggleFlashcard() { showTranslation = !showTranslation; updateFlashcardDisplay(); }
function nextCard() { currentCardIndex = (currentCardIndex+1)%currentWords.length; showTranslation=false; updateFlashcardDisplay(); }
function prevCard() { currentCardIndex = (currentCardIndex-1+currentWords.length)%currentWords.length; showTranslation=false; updateFlashcardDisplay(); }
function markLearned() { let s=getLearnedSet(); s.add(currentCardIndex); saveLearnedSet(s); updateFlashcardDisplay(); }
function resetLearned() { saveLearnedSet(new Set()); updateFlashcardDisplay(); }
function updateLearnedStats() {
    const statsEl = document.getElementById("learnedStats");
    if (statsEl) statsEl.innerHTML = `Вивчено: ${getLearnedSet().size} / ${currentWords.length}`;
}

// ======================== ТЕСТ ========================
function generateQuizQuestion() {
    if (!currentWords.length) return;
    let idx = Math.floor(Math.random()*currentWords.length);
    let correct = currentWords[idx];
    let opts = new Set([correct.uk]);
    while(opts.size<4) { let r = currentWords[Math.floor(Math.random()*currentWords.length)].uk; opts.add(r); }
    currentQuizQuestion = { skWord: correct.sk, correctUk: correct.uk, options: Array.from(opts).sort(()=>Math.random()-0.5) };
    quizAnswered=false;
    const fb = document.getElementById("quizFeedback");
    if (fb) fb.innerHTML = "";
    renderQuiz();
}
function renderQuiz() {
    const qEl = document.getElementById("quizQuestion");
    const cont = document.getElementById("quizOptions");
    if (!qEl || !cont) return;
    if (currentQuizQuestion) qEl.innerHTML = currentQuizQuestion.skWord;
    cont.innerHTML = "";
    if (!currentQuizQuestion) return;
    currentQuizQuestion.options.forEach(opt => {
        let btn = document.createElement("button");
        btn.className = "btn";
        btn.innerText = opt;
        btn.style.display = "block";
        btn.style.margin = "6px auto";
        btn.style.width = "90%";
        btn.onclick = () => { if(!quizAnswered) checkQuizAnswer(opt); };
        cont.appendChild(btn);
    });
}
function checkQuizAnswer(selected) {
    quizAnswered=true;
    let stats = progressData[currentThemeId].quizStats || { correct:0, total:0 };
    stats.total++;
    const fb = document.getElementById("quizFeedback");
    if(selected === currentQuizQuestion.correctUk) {
        stats.correct++;
        speakText(currentQuizQuestion.skWord);
        if (fb) { fb.innerHTML = "✅ Правильно!"; fb.style.color = '#10b981'; }
    } else {
        if (fb) { fb.innerHTML = `❌ Помилка: ${currentQuizQuestion.correctUk}`; fb.style.color = '#ef4444'; }
    }
    progressData[currentThemeId].quizStats = stats;
    saveThemeProgress();
    const statsEl = document.getElementById("quizStats");
    if (statsEl) statsEl.innerHTML = `Правильних: ${stats.correct} / ${stats.total}`;
}
function nextQuiz() { generateQuizQuestion(); }

// ======================== ФРАЗИ ========================
function loadPhrase(index) {
    if (!currentPhrases.length) return;
    let phrase = currentPhrases[index % currentPhrases.length];
    const targetEl = document.getElementById("targetSentenceUa");
    if (targetEl) targetEl.innerHTML = `📌 "${phrase.ua}"`;
    let allTokens = [...phrase.tokens, ...(phrase.distractors||[])];
    currentTokensMix = allTokens.sort(()=>Math.random()-0.5);
    currentUserSentence = [];
    phraseAnswered=false;
    renderWordBank();
    renderConstructed();
    const progressEl = document.getElementById("phraseProgress");
    if (progressEl) progressEl.innerHTML = `Фраза ${(index%currentPhrases.length)+1} з ${currentPhrases.length}`;
    progressData[currentThemeId].phraseIndex = index % currentPhrases.length;
    saveThemeProgress();
}
function renderWordBank() {
    let container = document.getElementById("wordBankContainer");
    if (!container) return;
    container.innerHTML = "";
    currentTokensMix.forEach((word,idx)=>{
        let chip = document.createElement("div");
        chip.className="word-chip";
        chip.innerText=word;
        chip.onclick = () => {
            if(!phraseAnswered) {
                let removed = currentTokensMix.splice(idx,1);
                if(removed.length) currentUserSentence.push({word:removed[0]});
                renderWordBank();
                renderConstructed();
            }
        };
        container.appendChild(chip);
    });
}
function renderConstructed() {
    let container = document.getElementById("constructedArea");
    if (!container) return;
    container.innerHTML = "";
    if(currentUserSentence.length===0) {
        container.innerHTML = "<span style='color:#64748b;'>👉 Натискайте слова...</span>";
        return;
    }
    currentUserSentence.forEach((item,idx)=>{
        let span = document.createElement("span");
        span.className="constructed-word";
        span.innerHTML = `${item.word} <button>✖</button>`;
        span.querySelector("button").onclick = (e) => {
            e.stopPropagation();
            let removed = currentUserSentence.splice(idx,1)[0];
            currentTokensMix.push(removed.word);
            renderWordBank();
            renderConstructed();
        };
        container.appendChild(span);
    });
}
function checkPhrase() {
    if(phraseAnswered) return;
    let phrase = currentPhrases[currentPhraseIndex % currentPhrases.length];
    let userSentence = currentUserSentence.map(w=>w.word).join(" ").replace(/\s+([?.!,])/g,"$1");
    const fb = document.getElementById("phraseFeedback");
    if(userSentence.trim() === phrase.sk.trim()) {
        if (fb) { fb.innerHTML = "✅ Правильно!"; fb.style.color = '#10b981'; }
        speakText(phrase.sk);
    } else {
        if (fb) { fb.innerHTML = `❌ Неправильно: "${phrase.sk}"`; fb.style.color = '#ef4444'; }
    }
    phraseAnswered=true;
}
function nextPhrase() { currentPhraseIndex = (currentPhraseIndex+1)%currentPhrases.length; loadPhrase(currentPhraseIndex); }

// ======================== АУДІЮВАННЯ ========================
function loadListeningTask(idx) {
    if (!currentListeningItems.length) return;
    let target = currentListeningItems[idx % currentListeningItems.length];
    const inputEl = document.getElementById("listeningAnswerInput");
    if (inputEl) {
        inputEl.value = "";
        inputEl.dataset.correctAnswer = target;
        inputEl.placeholder = "Введіть словацькою...";
    }
    const fb = document.getElementById("listeningFeedback");
    if (fb) fb.innerHTML = "";
    listeningAnswered=false;
    const progressEl = document.getElementById("listeningProgress");
    if (progressEl) progressEl.innerHTML = `Завдання ${(idx%currentListeningItems.length)+1} з ${currentListeningItems.length}`;
    progressData[currentThemeId].listeningIndex = idx % currentListeningItems.length;
    saveThemeProgress();
}
function checkListening() {
    if(listeningAnswered) return;
    const inputEl = document.getElementById("listeningAnswerInput");
    if (!inputEl) return;
    let user = inputEl.value.trim().toLowerCase().replace(/\s+/g," ");
    let correct = inputEl.dataset.correctAnswer.toLowerCase().replace(/\s+/g," ");
    const fb = document.getElementById("listeningFeedback");
    if(user===correct) {
        if (fb) { fb.innerHTML = "✅ Правильно!"; fb.style.color = '#10b981'; }
        speakText(inputEl.dataset.correctAnswer);
    } else {
        if (fb) { fb.innerHTML = `❌ Правильно: ${inputEl.dataset.correctAnswer}`; fb.style.color = '#ef4444'; }
    }
    listeningAnswered=true;
}
function nextListening() { currentListeningIndex = (currentListeningIndex+1)%currentListeningItems.length; loadListeningTask(currentListeningIndex); }

// ======================== СЛОВНИК ========================
function renderVocabulary(search="") {
    let container = document.getElementById("vocabListContainer");
    if (!container) return;
    let filtered = currentWords.filter(w=>w.sk.includes(search)||w.uk.includes(search));
    container.innerHTML = "";
    filtered.forEach(w=>{
        let div = document.createElement("div");
        div.className="vocab-item";
        div.innerHTML = `<div><strong>${w.sk}</strong> — ${w.uk}</div><button class="btn audio-btn" data-word="${w.sk}">🔊</button>`;
        div.querySelector("button").onclick = () => speakText(w.sk);
        container.appendChild(div);
    });
}

// ======================== ДІАЛОГИ ========================
function loadDialogueTheme(theme) {
    currentDialogueTheme = theme;
    currentDialogueLines = DIALOGUES[theme]?.lines || [];
    currentDialogueIndex = 0;
    renderDialogue();
}
function renderDialogue() {
    const container = document.getElementById("dialogContent");
    if (!container || !currentDialogueLines.length) return;
    let html = `<div style="font-weight:bold;">📖 ${currentDialogueTheme}</div>`;
    for (let i=0; i<=currentDialogueIndex && i<currentDialogueLines.length; i++) {
        const line = currentDialogueLines[i];
        if (line.speaker === "app") {
            html += `<div class="dialog-line dialog-question">🤖 ${line.sk}<br><span style="font-size:0.7rem;">${line.uk}</span></div>`;
        } else {
            html += `<div class="dialog-line dialog-answer">🧑 Ви: ${line.freeInput ? "[ваша відповідь]" : "(очікується: " + (line.expected?.join(" або ") || "") + ")"}</div>`;
        }
    }
    if (currentDialogueIndex < currentDialogueLines.length-1) {
        const nextLine = currentDialogueLines[currentDialogueIndex+1];
        if (nextLine.speaker === "app") {
            html += `<div style="opacity:0.6;">⏩ Наступне: ${nextLine.sk}</div>`;
        }
    } else {
        html += `<div style="text-align:center;">✅ Діалог завершено!</div>`;
    }
    container.innerHTML = html;
    const lastAppLine = [...currentDialogueLines].reverse().find(l => l.speaker === "app" && currentDialogueLines.indexOf(l) <= currentDialogueIndex);
    const speakBtn = document.getElementById("speakDialogLineBtn");
    if (speakBtn && lastAppLine) speakBtn.onclick = () => speakText(lastAppLine.sk, 'sk-SK');
}
function advanceDialogue(userSpoken) {
    if (currentDialogueIndex >= currentDialogueLines.length-1) {
        const fb = document.getElementById("dialogFeedback");
        if (fb) { fb.innerHTML = "🎉 Діалог завершено!"; fb.style.color = '#10b981'; }
        return;
    }
    const nextLine = currentDialogueLines[currentDialogueIndex+1];
    if (nextLine.speaker === "user") {
        let isOk = true;
        if (nextLine.expected && nextLine.expected.length) {
            const norm = userSpoken.toLowerCase().trim();
            isOk = nextLine.expected.some(exp => norm.includes(exp.toLowerCase()));
        }
        if (isOk || nextLine.freeInput) {
            currentDialogueIndex++;
            renderDialogue();
            const fb = document.getElementById("dialogFeedback");
            if (fb) { fb.innerHTML = "✅ Відповідь прийнято!"; fb.style.color = '#10b981'; }
            if (currentDialogueLines[currentDialogueIndex+1]?.speaker === "app") {
                setTimeout(() => speakText(currentDialogueLines[currentDialogueIndex+1].sk, 'sk-SK'), 300);
            }
        } else {
            const fb = document.getElementById("dialogFeedback");
            if (fb) { fb.innerHTML = `❌ Очікувалося: ${nextLine.expected.join(" або ")}`; fb.style.color = '#ef4444'; }
        }
    } else {
        currentDialogueIndex++;
        renderDialogue();
    }
}

// ======================== КЛАВІАТУРА ========================
function initKeyboard() {
    const input = document.getElementById("listeningAnswerInput");
    const kbDiv = document.getElementById("skKeyboard");
    if (!kbDiv) return;
    kbDiv.innerHTML = `
        <div class="keyboard-row">
            <span class="key" data-char="ä">ä</span>
            <span class="key" data-char="ô">ô</span>
            <span class="key" data-char="á">á</span>
            <span class="key" data-char="é">é</span>
            <span class="key" data-char="í">í</span>
            <span class="key" data-char="ý">ý</span>
            <span class="key" data-char="ó">ó</span>
            <span class="key" data-char="ú">ú</span>
        </div>
        <div class="keyboard-row">
            <span class="key key-special" data-action="backspace">⌫</span>
            <span class="key key-special" data-action="clear">🗑</span>
            <span class="key key-special" data-action="space">␣</span>
        </div>
    `;
    document.querySelectorAll("#skKeyboard .key").forEach(k=>{
        k.addEventListener("click", (e) => {
            e.preventDefault();
            let char = k.getAttribute("data-char");
            let act = k.getAttribute("data-action");
            if(!input) return;
            if(act==="backspace") {
                input.value = input.value.slice(0,-1);
            } else if(act==="clear") {
                input.value = "";
            } else if(act==="space") {
                input.value += " ";
            } else if(char) {
                input.value += char;
            }
            input.focus();
            // Для iOS: оновлюємо позицію курсора
            if (isIOS) {
                const length = input.value.length;
                input.setSelectionRange(length, length);
            }
        });
    });
}

// ======================== ВКЛАДКИ ТА ПАНЕЛІ ========================
function switchTab(tabId) {
    document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active-panel"));
    const panel = document.getElementById(`${tabId}Panel`);
    if (panel) panel.classList.add("active-panel");
    document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
    let activeBtn = Array.from(document.querySelectorAll(".tab-btn")).find(b=>b.dataset.tab===tabId);
    if(activeBtn) activeBtn.classList.add("active");
    if(tabId==="vocab") renderVocabulary(document.getElementById("searchVocab")?.value||"");
    if(tabId==="dialogues") {
        const themeSelector = document.getElementById("dialogThemeSelector");
        if (themeSelector) {
            themeSelector.innerHTML = "";
            Object.keys(DIALOGUES).forEach(t=>{
                let btn=document.createElement("button");
                btn.className="btn";
                btn.innerText=t;
                btn.onclick=()=>{ loadDialogueTheme(t); };
                themeSelector.appendChild(btn);
            });
        }
        if(!currentDialogueLines.length) loadDialogueTheme("Знайомство");
        renderDialogue();
    }
}

function fillPanels() {
    const flashcardsPanel = document.getElementById("flashcardsPanel");
    if (flashcardsPanel) flashcardsPanel.innerHTML = `
        <div class="flashcard" id="flashcardEl">
            <div class="word-slovak" id="currentWordSk"></div>
            <div class="word-translation hidden-translation" id="currentWordUa"></div>
            <div class="card-hint" style="font-size:0.7rem; text-align:center; margin-top:16px;">👇 Торкніться для перекладу</div>
        </div>
        <div class="btn-group">
            <button class="btn" id="prevCardBtn">◀ Попереднє</button>
            <button class="btn btn-primary audio-btn" id="speakCardBtn">🔊 Озвучити</button>
            <button class="btn btn-mic" id="micCardBtn">🎤 Вимова</button>
            <button class="btn" id="nextCardBtn">Наступне ▶</button>
        </div>
        <div class="progress-text" id="cardProgress" style="text-align:center"></div>
        <div class="btn-group">
            <button class="btn" id="markLearnedBtn">✅ Вивчив</button>
            <button class="btn" id="resetLearnedBtn">🔄 Скинути прогрес</button>
        </div>
        <div class="progress-text" id="learnedStats" style="text-align:center"></div>
        <div id="cardMicFeedback" class="feedback-msg"></div>
    `;
    
    const quizPanel = document.getElementById("quizPanel");
    if (quizPanel) quizPanel.innerHTML = `
        <div class="quiz-card">
            <div class="word-slovak" id="quizQuestion" style="font-size:1.8rem;"></div>
            <div id="quizOptions" class="btn-group" style="flex-direction:column;"></div>
            <div id="quizFeedback" class="feedback-msg"></div>
            <div class="btn-group">
                <button class="btn" id="nextQuizBtn">➡ Наступне</button>
                <button class="btn audio-btn" id="speakQuizBtn">🔊 Озвучити</button>
                <button class="btn btn-mic" id="micQuizBtn">🎤 Вимова</button>
            </div>
            <div id="quizStats" style="text-align:center; background:#eef2ff; padding:8px; border-radius:40px;">Правильних: 0 / 0</div>
        </div>
    `;
    
    const phrasesPanel = document.getElementById("phrasesPanel");
    if (phrasesPanel) phrasesPanel.innerHTML = `
        <div class="sentence-builder">
            <div class="task-prompt">📘 Складіть речення словацькою</div>
            <div class="sentence-target" id="targetSentenceUa"></div>
            <div class="word-bank" id="wordBankContainer"></div>
            <div class="sentence-construction" id="constructedArea"></div>
            <div class="feedback-msg" id="phraseFeedback"></div>
            <div class="btn-group">
                <button class="btn" id="checkPhraseBtn">✅ Перевірити</button>
                <button class="btn btn-primary" id="nextPhraseBtn">🎲 Наступна</button>
                <button class="btn audio-btn" id="speakPhraseBtn">🔊 Озвучити фразу</button>
                <button class="btn btn-mic" id="micPhraseBtn">🎤 Вимова фрази</button>
            </div>
            <div class="progress-text" id="phraseProgress" style="text-align:center"></div>
        </div>
    `;
    
    const listeningPanel = document.getElementById("listeningPanel");
    if (listeningPanel) listeningPanel.innerHTML = `
        <div class="listening-card">
            <div class="listening-icon">🎧</div>
            <button class="btn btn-primary" id="speakListeningBtn">🔊 Прослухати</button>
            <input type="text" id="listeningAnswerInput" class="listening-input" placeholder="Введіть словацькою...">
            <div class="sk-keyboard" id="skKeyboard"></div>
            <div class="btn-group">
                <button class="btn" id="checkListeningBtn">✅ Перевірити</button>
                <button class="btn btn-mic" id="micListeningBtn">🎤 Сказати в мікрофон</button>
                <button class="btn btn-primary" id="nextListeningBtn">🎲 Наступне</button>
            </div>
            <div id="listeningFeedback" class="feedback-msg"></div>
            <div id="listeningProgress" style="text-align:center"></div>
        </div>
    `;
    
    const dialoguesPanel = document.getElementById("dialoguesPanel");
    if (dialoguesPanel) dialoguesPanel.innerHTML = `
        <div class="dialog-card">
            <div class="task-prompt">💬 Виберіть тему діалогу</div>
            <div class="btn-group" id="dialogThemeSelector"></div>
            <div id="dialogContent" class="dialog-bubble"></div>
            <div class="btn-group">
                <button class="btn btn-primary" id="speakDialogLineBtn">🔊 Озвучити репліку</button>
                <button class="btn btn-mic" id="micDialogBtn">🎤 Відповісти голосом</button>
            </div>
            <div id="dialogFeedback" class="feedback-msg"></div>
        </div>
    `;
    
    const vocabPanel = document.getElementById("vocabPanel");
    if (vocabPanel) vocabPanel.innerHTML = `
        <input type="text" id="searchVocab" class="search-box" placeholder="🔍 Пошук слів...">
        <div id="vocabListContainer" class="vocab-list"></div>
    `;
}

function bindEvents() {
    const flashcardEl = document.getElementById("flashcardEl");
    if (flashcardEl) flashcardEl.addEventListener("click", toggleFlashcard);
    
    const nextCardBtn = document.getElementById("nextCardBtn");
    if (nextCardBtn) nextCardBtn.onclick = nextCard;
    const prevCardBtn = document.getElementById("prevCardBtn");
    if (prevCardBtn) prevCardBtn.onclick = prevCard;
    const speakCardBtn = document.getElementById("speakCardBtn");
    if (speakCardBtn) speakCardBtn.onclick = () => speakText(currentWords[currentCardIndex]?.sk);
    const markLearnedBtn = document.getElementById("markLearnedBtn");
    if (markLearnedBtn) markLearnedBtn.onclick = markLearned;
    const resetLearnedBtn = document.getElementById("resetLearnedBtn");
    if (resetLearnedBtn) resetLearnedBtn.onclick = resetLearned;
    
    const nextQuizBtn = document.getElementById("nextQuizBtn");
    if (nextQuizBtn) nextQuizBtn.onclick = nextQuiz;
    const speakQuizBtn = document.getElementById("speakQuizBtn");
    if (speakQuizBtn) speakQuizBtn.onclick = () => speakText(currentQuizQuestion?.skWord);
    
    const checkPhraseBtn = document.getElementById("checkPhraseBtn");
    if (checkPhraseBtn) checkPhraseBtn.onclick = checkPhrase;
    const nextPhraseBtn = document.getElementById("nextPhraseBtn");
    if (nextPhraseBtn) nextPhraseBtn.onclick = nextPhrase;
    const speakPhraseBtn = document.getElementById("speakPhraseBtn");
    if (speakPhraseBtn) speakPhraseBtn.onclick = () => { 
        let p = currentPhrases[currentPhraseIndex % currentPhrases.length]; 
        if(p) speakText(p.sk); 
    };
    
    const speakListeningBtn = document.getElementById("speakListeningBtn");
    if (speakListeningBtn) speakListeningBtn.onclick = () => {
        const input = document.getElementById("listeningAnswerInput");
        if (input && input.dataset.correctAnswer) {
            speakText(input.dataset.correctAnswer);
        }
    };
    const checkListeningBtn = document.getElementById("checkListeningBtn");
    if (checkListeningBtn) checkListeningBtn.onclick = checkListening;
    const nextListeningBtn = document.getElementById("nextListeningBtn");
    if (nextListeningBtn) nextListeningBtn.onclick = nextListening;
    
    const micDialogBtn = document.getElementById("micDialogBtn");
    if (micDialogBtn) {
        micDialogBtn.addEventListener("click", () => {
            if (currentDialogueIndex < currentDialogueLines.length - 1) {
                const nextLine = currentDialogueLines[currentDialogueIndex + 1];
                if (nextLine.speaker === "user") {
                    startListening("", (ok, spoken) => { 
                        advanceDialogue(spoken); 
                    }, micDialogBtn);
                } else {
                    advanceDialogue("");
                }
            }
        });
    }
    
    const searchVocab = document.getElementById("searchVocab");
    if (searchVocab) searchVocab.addEventListener("input", e => renderVocabulary(e.target.value));
    
    document.querySelectorAll(".tab-btn").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
    
    setupMicButton("micCardBtn", () => currentWords[currentCardIndex]?.sk, "cardMicFeedback", "Вимова слова правильна!");
    setupMicButton("micQuizBtn", () => currentQuizQuestion?.skWord, "quizFeedback", "Вимова слова правильна!");
    setupMicButton("micPhraseBtn", () => currentPhrases[currentPhraseIndex % currentPhrases.length]?.sk, "phraseFeedback", "Фраза вимовлена правильно!");
    setupMicButton("micListeningBtn", () => document.getElementById("listeningAnswerInput")?.dataset.correctAnswer, "listeningFeedback", "Вимова збігається!");
}

// ======================== ДОДАТКОВІ СТИЛІ ДЛЯ IOS ========================
function addIOSStyles() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInUp {
            from { opacity: 0; transform: translate(-50%, 20px); }
            to { opacity: 1; transform: translate(-50%, 0); }
        }
        
        /* Покращення для сенсорних екранів */
        @media (max-width: 768px) {
            .btn {
                padding: 12px 20px;
                font-size: 0.9rem;
                min-height: 44px;
                min-width: 44px;
            }
            .theme-btn {
                padding: 10px 16px;
                font-size: 0.85rem;
            }
            .key {
                padding: 12px 16px;
                font-size: 1.1rem;
                min-width: 44px;
                min-height: 44px;
            }
            .word-slovak {
                font-size: 1.6rem;
            }
        }
        
        /* Для iOS Safari - покращення прокрутки */
        * {
            -webkit-overflow-scrolling: touch;
        }
        
        .app-container {
            -webkit-touch-callout: none;
        }
        
        input, textarea, select {
            font-size: 16px !important; /* Запобігає зуму на iOS */
        }
    `;
    document.head.appendChild(style);
}

// ======================== ІНІЦІАЛІЗАЦІЯ ========================
function initApp() {
    if (!currentThemeData) {
        const themeKeys = Object.keys(ALL_THEMES);
        currentThemeId = themeKeys[0] || "A1_zaklad";
        currentThemeData = ALL_THEMES[currentThemeId];
        currentWords = currentThemeData?.words || [];
        currentPhrases = currentThemeData?.phrases || [];
        currentListeningItems = currentThemeData?.listeningItems || [];
    }
    
    loadThemeProgress();
    updateFlashcardDisplay();
    updateLearnedStats();
    generateQuizQuestion();
    if (currentPhrases.length) loadPhrase(0);
    if (currentListeningItems.length) loadListeningTask(0);
    
    // Додаємо стилі для iOS
    addIOSStyles();
    
    // Показуємо інструкції для iOS
    if (isIOS) {
        showIOSInstructions();
        // Завантажуємо голоси на iOS
        setTimeout(() => {
            loadVoices().then(voices => {
                console.log('📱 iOS голоси готові:', voices.length);
            });
        }, 500);
    }
    
    initKeyboard();
    bindEvents();
    switchTab("flashcards");
    renderThemeHierarchy();
    
    console.log('✅ Додаток ініціалізовано');
    console.log('📚 Поточна тема:', currentThemeId);
    console.log('📝 Слів:', currentWords.length);
    console.log('📖 Фраз:', currentPhrases.length);
    console.log('🎧 Аудіо:', currentListeningItems.length);
}

// ======================== ЗАПУСК ========================
// Додаємо обробник для завантаження сторінки
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Запуск SlovakLearn Pro...');
    loadData();
});

// Запасний варіант, якщо DOM вже завантажено
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    console.log('🚀 Запуск (готовий DOM)...');
    // Перевіряємо, чи не запущено вже
    if (!window._appStarted) {
        window._appStarted = true;
        // loadData() буде викликано через DOMContentLoaded
    }
}
