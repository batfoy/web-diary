// === 📦 ПЕРЕМЕННЫЕ ===
let diaryEntries = [];
const STORAGE_KEY = 'my_web_diary_entries_v2';
const PIN_KEY = 'my_web_diary_pin_v1';
let currentCalendarDate = new Date();
let searchQuery = '';
let editingEntryId = null;
let activeTagFilter = null;
let activeDateFilter = null;
let activeMoodFilter = null;
let tempMood = '😐';
let currentQuoteIndex = 0;
const DRAFT_KEY = 'my_web_diary_draft_v1';

let multiDeleteMode = false;
let selectedEntries = [];
let datePickerCallback = null;
let isEditing = false;
let draftSaveTimer = null;

// PIN-код
let pinInputBuffer = '';
let pinSetupStage = null;
let pinSetupTemp = '';
let isPinUnlocked = false;

const appMain = document.getElementById('app-main');

const MOODS = [
    { emoji: '😡', score: 0 }, { emoji: '😭', score: 1 }, { emoji: '☹️', score: 2 },
    { emoji: '😕', score: 3 }, { emoji: '😐', score: 4 }, { emoji: '😏', score: 5 },
    { emoji: '😊', score: 6 }, { emoji: '😁', score: 7 }, { emoji: '🤪', score: 8 },
    { emoji: '🥰', score: 9 }
];

const QUOTES = [
    { text: "Счастье — это не пункт назначения, а способ путешествия.", author: "Рой Гудман" },
    { text: "Не считай дни, извлекай из них пользу.", author: "Мухаммед Али" },
    { text: "Самый темный час — тот, что перед рассветом.", author: "Томас Фуллер" },
    { text: "Делай то, что можешь, с тем, что имеешь, там, где ты есть.", author: "Теодор Рузвельт" },
    { text: "Успех — это способность идти от поражения к поражению, не теряя энтузиазма.", author: "Уинстон Черчилль" },
    { text: "Ваше время ограничено, не тратьте его, живя чужой жизнью.", author: "Стив Джобс" },
    { text: "Победа — это еще не все, все — это постоянное желание побеждать.", author: "Винс Ломбарди" },
    { text: "Сложнее всего начать действовать, все остальное зависит только от упорства.", author: "Амелия Эрхарт" },
    { text: "Логика приведет вас из пункта А в пункт Б. Воображение приведет вас куда угодно.", author: "Альберт Эйнштейн" },
    { text: "Через 20 лет вы будете больше жалеть о том, чего не сделали, чем о том, что сделали.", author: "Марк Твен" },
    { text: "Не позволяйте шуму чужих мнений перебить ваш внутренний голос.", author: "Стив Джобс" },
    { text: "Единственный способ делать великие дела — любить то, что вы делаете.", author: "Стив Джобс" },
    { text: "Жизнь — это то, что с вами случается, пока вы строите другие планы.", author: "Джон Леннон" },
    { text: "Стремитесь не к успеху, а к ценностям, которые он дает.", author: "Альберт Эйнштейн" },
    { text: "Я не терпел поражений. Я просто нашел 10 000 способов, которые не работают.", author: "Томас Эдисон" },
    { text: "Тот, кто не может изменить свои мысли, не может изменить ничего.", author: "Джордж Бернард Шоу" },
    { text: "Лучший способ предсказать будущее — изобрести его.", author: "Алан Кей" },
    { text: "Если вы думаете, что способны на что-то, вы правы; если думаете, что у вас ничего не получится — вы тоже правы.", author: "Генри Форд" },
    { text: "Два самых важных дня в твоей жизни: день, когда ты родился, и день, когда понял зачем.", author: "Марк Твен" },
    { text: "Начинать всегда стоит с того, что сеет сомнения.", author: "Борис Стругацкий" },
    { text: "Настоящая ответственность бывает только личной.", author: "Фазиль Искандер" },
    { text: "Неисполненное намерение подобно облаку без дождя.", author: "Уильям Блейк" },
    { text: "Целый мир уступает место человеку, который знает, куда идет.", author: "Ральф Эмерсон" },
    { text: "Счастье зависит от нас самих.", author: "Аристотель" },
    { text: "Жизнь слишком коротка, чтобы быть маленьким.", author: "Бенджамин Дизраэли" },
    { text: "Все, что вы можете представить — реально.", author: "Пабло Пикассо" },
    { text: "Когда закрывается одна дверь счастья, открывается другая.", author: "Хелен Келлер" },
    { text: "Секрет успеха — начать.", author: "Марк Твен" },
    { text: "Не бойтесь совершенства. Вам его не достичь.", author: "Сальвадор Дали" },
    { text: "Каждый ребенок — художник. Трудность в том, чтобы остаться художником, выйдя из детского возраста.", author: "Пабло Пикассо" },
    { text: "Вы никогда не пересечете океан, если не наберетесь мужества потерять берег из виду.", author: "Христофор Колумб" }
];

// === 🛠️ ВСПОМОГАТЕЛЬНЫЕ ===
function extractTags(text) {
    if (!text) return [];
    const matches = text.match(/#[a-zA-Zа-яА-ЯёЁ0-9_]+/g);
    return matches ? [...new Set(matches.map(t => t.toLowerCase()))] : [];
}

function migrateEntriesTags() {
    let needsSave = false;
    diaryEntries.forEach(entry => {
        if (!entry.tags || entry.tags.length === 0) {
            entry.tags = extractTags(entry.content);
            needsSave = true;
        }
    });
    if (needsSave) localStorage.setItem(STORAGE_KEY, JSON.stringify(diaryEntries));
}

function getMoodScore(emoji) {
    const found = MOODS.find(m => m.emoji === emoji);
    return found ? found.score : null;
}

function getDateKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function formatPrettyDate(dateKey) {
    const date = new Date(dateKey + 'T12:00:00');
    const today = new Date();
    const todayKey = getDateKey(today);
    if (dateKey === todayKey) return 'Сегодня';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateKey === getDateKey(yesterday)) return 'Вчера';
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

// === 🔐 PIN-КОД ===
function initPinProtection() {
    const savedPin = localStorage.getItem(PIN_KEY);
    updateResetPinButtonVisibility();
    if (savedPin) {
        showPinModal('enter');
    } else {
        showPinModal('setup-new');
    }
}

function showPinModal(mode) {
    const modal = document.getElementById('pin-modal');
    const title = document.getElementById('pin-title');
    const subtitle = document.getElementById('pin-subtitle');
    const skipBtn = document.getElementById('pin-skip-btn');
    
    pinInputBuffer = '';
    subtitle.classList.remove('error');
    subtitle.textContent = '';
    updatePinDots();
    
    if (mode === 'enter') {
        pinSetupStage = null;
        title.textContent = '🔐 Введите PIN-код';
        subtitle.textContent = '';
        skipBtn.classList.add('hidden');
    } else if (mode === 'setup-new') {
        pinSetupStage = 'enter-new';
        title.textContent = '🔐 Установите PIN-код';
        subtitle.textContent = 'Придумайте 4-значный код';
        skipBtn.classList.remove('hidden');
    } else if (mode === 'setup-confirm') {
        pinSetupStage = 'confirm-new';
        title.textContent = '🔐 Подтвердите PIN';
        subtitle.textContent = 'Повторите код ещё раз';
        skipBtn.classList.add('hidden');
    }
    modal.classList.remove('hidden');
}

function updatePinDots() {
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('filled', i < pinInputBuffer.length);
    });
}

function shakePinModal() {
    const content = document.querySelector('.pin-modal-content');
    content.classList.remove('pin-shake');
    void content.offsetWidth;
    content.classList.add('pin-shake');
}

function handlePinKey(key) {
    if (pinInputBuffer.length >= 4) return;
    pinInputBuffer += key;
    updatePinDots();
    if (pinInputBuffer.length === 4) {
        setTimeout(() => verifyPinInput(), 150);
    }
}

function handlePinDelete() {
    if (pinInputBuffer.length === 0) return;
    pinInputBuffer = pinInputBuffer.slice(0, -1);
    updatePinDots();
    const subtitle = document.getElementById('pin-subtitle');
    subtitle.classList.remove('error');
    subtitle.textContent = pinSetupStage === 'enter-new' ? 'Придумайте 4-значный код' 
                         : pinSetupStage === 'confirm-new' ? 'Повторите код ещё раз' : '';
}

function verifyPinInput() {
    const savedPin = localStorage.getItem(PIN_KEY);
    const subtitle = document.getElementById('pin-subtitle');
    
    if (pinSetupStage === 'enter-new') {
        pinSetupTemp = pinInputBuffer;
        showPinModal('setup-confirm');
    } else if (pinSetupStage === 'confirm-new') {
        if (pinInputBuffer === pinSetupTemp) {
            localStorage.setItem(PIN_KEY, pinSetupTemp);
            pinSetupTemp = '';
            pinSetupStage = null;
            isPinUnlocked = true;
            document.getElementById('pin-modal').classList.add('hidden');
            updateResetPinButtonVisibility();
            showToast('PIN-код установлен', 'success');
        } else {
            subtitle.classList.add('error');
            subtitle.textContent = 'Коды не совпадают. Попробуйте снова';
            shakePinModal();
            pinInputBuffer = '';
            pinSetupTemp = '';
            updatePinDots();
            setTimeout(() => {
                subtitle.classList.remove('error');
                subtitle.textContent = 'Придумайте 4-значный код';
                pinSetupStage = 'enter-new';
                document.getElementById('pin-title').textContent = '🔐 Установите PIN-код';
            }, 1500);
        }
    } else {
        if (pinInputBuffer === savedPin) {
            isPinUnlocked = true;
            document.getElementById('pin-modal').classList.add('hidden');
        } else {
            subtitle.classList.add('error');
            subtitle.textContent = 'Неверный PIN-код';
            shakePinModal();
            pinInputBuffer = '';
            updatePinDots();
            setTimeout(() => {
                subtitle.classList.remove('error');
                subtitle.textContent = '';
            }, 1500);
        }
    }
}

function skipPinSetup() {
    isPinUnlocked = true;
    document.getElementById('pin-modal').classList.add('hidden');
}

async function resetPin() {
    closeSidebar();
    const confirmed = await showConfirm('Сбросить PIN-код? Дневник останется без защиты.');
    if (confirmed) {
        localStorage.removeItem(PIN_KEY);
        updateResetPinButtonVisibility();
        showToast('PIN-код сброшен', 'success');
    }
}

function updateResetPinButtonVisibility() {
    const btn = document.getElementById('sidebar-reset-pin-btn');
    const hasPin = !!localStorage.getItem(PIN_KEY);
    btn.classList.toggle('hidden', !hasPin);
}

// === 📅 ЦИТАТА ДНЯ ===
function updateDailyQuote() {
    const lastDate = localStorage.getItem('quote_last_date');
    const today = new Date().toDateString();
    if (lastDate !== today) {
        const dayOfMonth = new Date().getDate();
        currentQuoteIndex = (dayOfMonth - 1) % QUOTES.length;
        localStorage.setItem('quote_last_date', today);
        localStorage.setItem('quote_index', currentQuoteIndex);
    } else {
        currentQuoteIndex = parseInt(localStorage.getItem('quote_index')) || 0;
    }
    displayQuote();
}

function displayQuote() {
    document.getElementById('daily-quote-text').textContent = `«${QUOTES[currentQuoteIndex].text}»`;
    document.getElementById('daily-quote-author').textContent = `— ${QUOTES[currentQuoteIndex].author}`;
}

function nextQuote() {
    const textEl = document.getElementById('daily-quote-text');
    const authorEl = document.getElementById('daily-quote-author');
    textEl.style.opacity = '0';
    authorEl.style.opacity = '0';
    setTimeout(() => {
        currentQuoteIndex = (currentQuoteIndex + 1) % QUOTES.length;
        localStorage.setItem('quote_index', currentQuoteIndex);
        displayQuote();
        textEl.style.opacity = '1';
        authorEl.style.opacity = '1';
    }, 250);
}

// === 😊 ВЫБОР НАСТРОЕНИЯ ===
function openMoodModal() {
    const grid = document.getElementById('mood-grid');
    grid.innerHTML = '';
    MOODS.forEach(m => {
        const btn = document.createElement('div');
        btn.className = 'mood-option';
        btn.textContent = m.emoji;
        btn.onclick = () => selectMoodForEntry(m.emoji);
        grid.appendChild(btn);
    });
    const moodModal = document.getElementById('mood-modal');
    moodModal.classList.remove('hidden');
    moodModal.classList.add('top-layer');
}

function selectMoodForEntry(emoji) {
    tempMood = emoji;
    const moodModal = document.getElementById('mood-modal');
    moodModal.classList.add('hidden');
    moodModal.classList.remove('top-layer');
    const moodDisplay = document.getElementById('selected-mood-display');
    if (moodDisplay) moodDisplay.textContent = tempMood;
}

// === 💾 ЧЕРНОВИК ===
function saveDraft() {
    if (editingEntryId) return;
    const title = document.getElementById('entry-title').value.trim();
    const text = document.getElementById('entry-text').value.trim();
    if (!title && !text) { localStorage.removeItem(DRAFT_KEY); return; }
    const draft = {
        title, content: text, mood: tempMood,
        dateKey: document.getElementById('entry-date-display').dataset.date,
        savedAt: Date.now()
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function loadDraft() {
    const stored = localStorage.getItem(DRAFT_KEY);
    if (!stored) return null;
    try { return JSON.parse(stored); }
    catch (e) { localStorage.removeItem(DRAFT_KEY); return null; }
}

function clearDraft() { localStorage.removeItem(DRAFT_KEY); }

function scheduleDraftSave() {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(saveDraft, 1000);
}

// === 📝 МОДАЛКА ЗАПИСИ ===
function updateEditModeUI() {
    const modal = document.getElementById('entry-modal');
    const titleInput = document.getElementById('entry-title');
    const textInput = document.getElementById('entry-text');
    const insertTagBtn = document.getElementById('insert-tag-btn');
    const templatesBtn = document.getElementById('templates-btn');

    if (isEditing) {
        modal.classList.add('is-editing');
        titleInput.removeAttribute('readonly');
        textInput.removeAttribute('readonly');
        insertTagBtn.classList.remove('hidden');
        templatesBtn.classList.remove('hidden');
    } else {
        modal.classList.remove('is-editing');
        titleInput.setAttribute('readonly', true);
        textInput.setAttribute('readonly', true);
        insertTagBtn.classList.add('hidden');
        templatesBtn.classList.add('hidden');
    }
}

function openEntryForm(entry = null) {
    const dateDisplay = document.getElementById('entry-date-display');
    const dateText = document.getElementById('entry-date-text');
    const moodDisplay = document.getElementById('selected-mood-display');
    const titleInput = document.getElementById('entry-title');
    const textInput = document.getElementById('entry-text');
    const cancelBtn = document.getElementById('cancel-entry-btn');

    if (entry) {
        editingEntryId = entry.id;
        tempMood = entry.mood;
        titleInput.value = entry.title || '';
        textInput.value = entry.content;
        cancelBtn.textContent = 'Удалить';
        cancelBtn.className = 'btn-danger';
        const entryDateKey = getDateKey(entry.date);
        dateDisplay.dataset.date = entryDateKey;
        dateText.textContent = formatPrettyDate(entryDateKey);
        isEditing = false;
    } else {
        editingEntryId = null;
        cancelBtn.textContent = 'Очистить';
        cancelBtn.className = 'btn-secondary';
        const draft = loadDraft();
        if (draft) {
            titleInput.value = draft.title || '';
            textInput.value = draft.content || '';
            tempMood = draft.mood || '😐';
            dateDisplay.dataset.date = draft.dateKey || getDateKey(new Date());
            dateText.textContent = formatPrettyDate(dateDisplay.dataset.date);
        } else {
            titleInput.value = '';
            textInput.value = '';
            tempMood = '😐';
            const todayKey = getDateKey(new Date());
            dateDisplay.dataset.date = todayKey;
            dateText.textContent = 'Сегодня';
        }
        isEditing = true;
    }

    moodDisplay.textContent = tempMood;
    updateEditModeUI();
    document.getElementById('entry-modal').classList.remove('hidden');
    if (isEditing && !entry) setTimeout(() => titleInput.focus(), 100);
}

function handleSaveEntry() {
    const dateDisplay = document.getElementById('entry-date-display');
    const dateInput = dateDisplay.dataset.date;
    const title = document.getElementById('entry-title').value.trim();
    const text = document.getElementById('entry-text').value.trim();

    if (!text && !title) { showToast('Запись не может быть пустой', 'error'); return; }

    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const finalDate = new Date(dateInput + 'T12:00:00').toISOString();
    const tags = extractTags(text);

    if (editingEntryId) {
        const index = diaryEntries.findIndex(e => e.id === editingEntryId);
        if (index !== -1) {
            diaryEntries[index] = { 
                ...diaryEntries[index], date: finalDate, title, content: text,
                mood: tempMood, wordCount, tags, updatedAt: Date.now() 
            };
        }
        showToast('Запись обновлена', 'success');
    } else {
        const newEntry = {
            id: Date.now().toString(), date: finalDate, title, content: text,
            mood: tempMood, wordCount, tags, updatedAt: Date.now()
        };
        diaryEntries.unshift(newEntry);
        showToast('Запись сохранена', 'success');
        clearDraft();
    }

    isEditing = false;
    updateEditModeUI();
    saveAndRender();
}

function closeEntryForm() {
    const titleInput = document.getElementById('entry-title');
    const textInput = document.getElementById('entry-text');
    if (!editingEntryId && !titleInput.value.trim() && !textInput.value.trim()) clearDraft();
    document.getElementById('entry-modal').classList.add('hidden');
    editingEntryId = null;
}

// === 📊 ГРАФИК ===
function drawMoodChart() {
    const canvas = document.getElementById('mood-chart');
    const chartModal = document.getElementById('chart-modal');
    if (chartModal && chartModal.classList.contains('hidden')) return;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    const width = rect.width, height = 180;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const styles = getComputedStyle(document.body);
    const muted = styles.getPropertyValue('--text-muted').trim() || '#888';
    const grid = styles.getPropertyValue('--border-color').trim() || '#ddd';
    const accent = styles.getPropertyValue('--accent-color').trim() || '#4CAF50';

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const left = 30, right = 12, top = 16, bottom = 26;
    const plotW = width - left - right;
    const plotH = height - top - bottom;

    const maxScore = MOODS.length;
    const xForDay = day => left + ((day - 1) / (daysInMonth - 1)) * plotW;
    const yForScore = score => top + ((maxScore - 1 - score) / (maxScore - 1)) * plotH;
    const scoreIndices = [0, 3, 6, 9];

    ctx.font = '14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const score of scoreIndices) {
        const y = yForScore(score);
        ctx.strokeStyle = grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - right, y); ctx.stroke();
        ctx.fillStyle = muted; 
        ctx.fillText(MOODS[score].emoji, 2, y);
    }

    ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = muted;
    const step = plotW < 260 ? 7 : 5;
    for (let day = 1; day <= daysInMonth; day += step) {
        ctx.fillText(String(day), xForDay(day), height - bottom + 8);
    }

    const days = {};
    diaryEntries.forEach(entry => {
        const d = new Date(entry.date);
        if (isNaN(d.getTime()) || d.getFullYear() !== year || d.getMonth() !== month) return;
        const score = getMoodScore(entry.mood);
        if (score === null) return;
        const day = d.getDate();
        if (!days[day]) days[day] = { day, total: 0, count: 0 };
        days[day].total += score;
        days[day].count += 1;
    });

    const data = Object.values(days).map(item => ({ day: item.day, score: item.total / item.count, count: item.count })).sort((a, b) => a.day - b.day);
    const totalEntries = data.reduce((sum, item) => sum + item.count, 0);

    if (data.length === 0) {
        ctx.fillStyle = muted; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('В этом месяце пока нет записей', width / 2, top + plotH / 2);
        document.getElementById('chart-average').textContent = '—';
        document.getElementById('chart-summary').textContent = 'Записей за месяц: 0';
        return;
    }

    ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1];
        const cur = data[i];
        if (cur.day - prev.day <= 2) {
            ctx.beginPath();
            ctx.moveTo(xForDay(prev.day), yForScore(prev.score));
            ctx.lineTo(xForDay(cur.day), yForScore(cur.score));
            ctx.stroke();
        }
    }

    ctx.fillStyle = accent;
    data.forEach(item => {
        ctx.beginPath();
        ctx.arc(xForDay(item.day), yForScore(item.score), 4, 0, Math.PI * 2);
        ctx.fill();
    });

    const average = data.reduce((sum, item) => sum + item.score, 0) / data.length;
    const averageEmoji = MOODS[Math.round(average)]?.emoji || '😐';
    document.getElementById('chart-average').textContent = `Среднее: ${average.toFixed(1)} ${averageEmoji}`;
    document.getElementById('chart-summary').textContent = `Записей: ${totalEntries} · Дней: ${data.length}`;
}

// === 📋 СПИСОК ЗАПИСЕЙ ===
function renderEntries() {
    const list = document.getElementById('entries-list');
    list.innerHTML = '';

    const hasAnyFilter = !!(activeTagFilter || activeDateFilter || activeMoodFilter || searchQuery);
    appMain.classList.toggle('search-active', hasAnyFilter);

    let filtered = diaryEntries;
    if (activeDateFilter) filtered = filtered.filter(entry => getDateKey(entry.date) === activeDateFilter);
    if (activeTagFilter) filtered = filtered.filter(entry => entry.tags && entry.tags.includes(activeTagFilter));
    if (activeMoodFilter) filtered = filtered.filter(entry => entry.mood === activeMoodFilter);
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(entry =>
            (entry.content && entry.content.toLowerCase().includes(query)) ||
            (entry.title && entry.title.toLowerCase().includes(query))
        );
    }
    
    const sorted = [...filtered].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    if (activeDateFilter) {
        const prettyDate = new Date(activeDateFilter + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        const banner = document.createElement('div');
        banner.className = 'active-filter-banner';
        banner.innerHTML = `<span>📅 <strong>${prettyDate}</strong></span><button class="clear-filter-btn" id="clear-date-filter" title="Показать все">✕</button>`;
        list.appendChild(banner);
    } else if (activeTagFilter) {
        const banner = document.createElement('div');
        banner.className = 'active-filter-banner';
        banner.innerHTML = `<span>Тег: <strong>${escapeHtml(activeTagFilter)}</strong></span><button class="clear-filter-btn" id="clear-tag-filter" title="Показать все">✕</button>`;
        list.appendChild(banner);
    } else if (activeMoodFilter) {
        const banner = document.createElement('div');
        banner.className = 'active-filter-banner';
        banner.innerHTML = `<span>Настроение: <strong style="font-size:1.2em">${activeMoodFilter}</strong></span><button class="clear-filter-btn" id="clear-mood-filter" title="Показать все">✕</button>`;
        list.appendChild(banner);
    }

    if (sorted.length === 0) {
        const empty = document.createElement('p');
        empty.style.cssText = 'text-align:center; color:var(--text-muted); margin-top:40px;';
        let msg = 'Пока нет записей. Нажмите +, чтобы начать!';
        if (activeDateFilter) msg = 'В этот день записей нет';
        else if (activeTagFilter) msg = `Нет записей с тегом ${activeTagFilter}`;
        else if (activeMoodFilter) msg = `Нет записей с настроением ${activeMoodFilter}`;
        else if (searchQuery) msg = 'Ничего не найдено';
        empty.textContent = msg;
        list.appendChild(empty);
        return;
    }

    sorted.forEach(entry => {
        const card = document.createElement('div');
        card.className = 'entry-card';
        card.dataset.entryId = entry.id;

        const dateObj = new Date(entry.updatedAt || entry.date);
        const dateStr = dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

        const tagsHtml = (entry.tags && entry.tags.length > 0) 
            ? `<div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">${entry.tags.map(t => `<span style="font-size:0.75em; background:var(--mood-btn-bg); padding:2px 8px; border-radius:10px; color:var(--accent-color);">${t}</span>`).join('')}</div>` 
            : '';

        card.innerHTML = `
            <div class="entry-header">
                <span>${dateStr}</span>
                <span style="font-size:1.2em">${entry.mood}</span>
            </div>
            ${entry.title ? `<div class="entry-title">${escapeHtml(entry.title)}</div>` : ''}
            <div class="entry-text">${escapeHtml(entry.content)}</div>
            ${tagsHtml}
        `;

        // Долгое нажатие для множественного удаления
        let pressTimer = null;
        let isLongPress = false;

        const startPress = () => {
            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                enterMultiDeleteMode(entry.id);
            }, 500);
        };
        const endPress = () => { clearTimeout(pressTimer); };
        const cancelPress = () => { clearTimeout(pressTimer); };

        card.addEventListener('touchstart', startPress, { passive: true });
        card.addEventListener('touchend', endPress);
        card.addEventListener('touchmove', cancelPress);
        card.addEventListener('touchcancel', cancelPress);
        card.addEventListener('mousedown', startPress);
        card.addEventListener('mouseup', endPress);
        card.addEventListener('mouseleave', cancelPress);

        card.addEventListener('click', () => {
            if (isLongPress) { isLongPress = false; return; }
            if (multiDeleteMode) { toggleEntrySelection(entry.id); return; }
            openEntryForm(entry);
        });

        list.appendChild(card);
    });
}

async function saveAndRender() {
    // Сохраняем все записи в IndexedDB
    await saveAllToIndexedDB();
    renderEntries();
    drawMoodChart();
    renderCalendar();
}

async function loadEntries() {
    // 1. Одноразовая миграция из localStorage (если есть старые данные)
    const migrated = await migrateFromLocalStorage();
    if (migrated) {
        showToast('Данные перенесены в новое хранилище', 'success');
    }
    
    // 2. Загружаем записи из IndexedDB
    try {
        diaryEntries = await dbGetAll();
    } catch (error) {
        console.error('Ошибка загрузки из IndexedDB:', error);
        diaryEntries = [];
    }
    
    // 3. Миграция тегов для старых записей (без #)
    migrateEntriesTags();
    
    // 4. Если были изменения тегов — сохраняем обратно в IndexedDB
    if (migrated || diaryEntries.some(e => !e.tags)) {
        await saveAllToIndexedDB();
    }
    
    renderEntries();
}

// === 🔔 TOAST И CONFIRM ===
function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

let confirmResolve = null;
function showConfirm(msg) {
    return new Promise(resolve => {
        confirmResolve = resolve;
        document.getElementById('confirm-message').textContent = msg;
        document.getElementById('confirm-modal').classList.remove('hidden');
    });
}
function closeConfirm(res) {
    document.getElementById('confirm-modal').classList.add('hidden');
    if (confirmResolve) { confirmResolve(res); confirmResolve = null; }
}

// === 🗑️ МНОЖЕСТВЕННОЕ УДАЛЕНИЕ ===
function enterMultiDeleteMode(firstEntryId) {
    multiDeleteMode = true;
    document.body.classList.add('multi-delete-active');
    selectedEntries = [firstEntryId];
    updateDeleteButton();
    document.getElementById('cancel-multi-delete-btn').classList.remove('hidden');
    
    const firstCard = document.querySelector(`[data-entry-id="${firstEntryId}"]`);
    if (firstCard) firstCard.classList.add('selected');
}

function exitMultiDeleteMode() {
    multiDeleteMode = false;
    document.body.classList.remove('multi-delete-active');
    selectedEntries = [];
    const searchBtn = document.getElementById('search-btn');
    searchBtn.textContent = '🔍';
    searchBtn.classList.remove('multi-delete-mode');
    searchBtn.title = 'Поиск';
    document.getElementById('cancel-multi-delete-btn').classList.add('hidden');
    document.querySelectorAll('.entry-card').forEach(card => card.classList.remove('selected'));
}

function toggleEntrySelection(entryId) {
    const index = selectedEntries.indexOf(entryId);
    const card = document.querySelector(`[data-entry-id="${entryId}"]`);
    
    if (index === -1) {
        selectedEntries.push(entryId);
        if (card) card.classList.add('selected');
    } else {
        selectedEntries.splice(index, 1);
        if (card) card.classList.remove('selected');
    }
    updateDeleteButton();
    if (selectedEntries.length === 0) exitMultiDeleteMode();
}

function updateDeleteButton() {
    const searchBtn = document.getElementById('search-btn');
    if (selectedEntries.length > 0) {
        searchBtn.textContent = `🗑️ ${selectedEntries.length}`;
        searchBtn.classList.add('multi-delete-mode');
        searchBtn.title = `Удалить ${selectedEntries.length} записей`;
    }
}

async function deleteSelectedEntries() {
    if (selectedEntries.length === 0) return;
    const count = selectedEntries.length;
    const confirmed = await showConfirm(`Удалить ${count} ${count === 1 ? 'запись' : count < 5 ? 'записи' : 'записей'}?`);
    if (confirmed) {
        diaryEntries = diaryEntries.filter(e => !selectedEntries.includes(e.id));
        saveAndRender();
        exitMultiDeleteMode();
        showToast(`Удалено: ${count}`, 'success');
    }
}

// === 📅 КАЛЕНДАРЬ ===
function renderCalendar() {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const monthDate = new Date(year, month, 1);
    const monthText = monthDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

    const labelModal = document.getElementById('calendar-month-label');
    const labelDesktop = document.getElementById('calendar-month-label-desktop');
    if (labelModal) labelModal.textContent = monthText;
    if (labelDesktop) labelDesktop.textContent = monthText;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    const todayKey = getDateKey(new Date());

    function fillGrid(gridId) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        grid.innerHTML = '';
        for (let i = 0; i < offset; i++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day empty';
            grid.appendChild(cell);
        }
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'calendar-day';
            const dayEntries = diaryEntries.filter(e => getDateKey(e.date) === dateStr);

            if (dayEntries.length > 0) {
                cell.textContent = dayEntries[0].mood;
                cell.classList.add('has-entry');
                cell.title = `Записей: ${dayEntries.length}`;
            } else {
                cell.textContent = day;
                cell.classList.add('no-entry');
            }
            if (dateStr === todayKey) cell.classList.add('today');
            cell.onclick = () => handleDayClick(dateStr);
            grid.appendChild(cell);
        }
    }
    fillGrid('calendar-grid');
    fillGrid('calendar-grid-desktop');
}

function handleDayClick(dateStr) {
    if (datePickerCallback) {
        const callback = datePickerCallback;
        datePickerCallback = null;
        document.querySelector('.calendar-modal-content').classList.remove('selecting-date');
        closeCalendarScreen();
        callback(dateStr);
    } else {
        applyDateFilter(dateStr);
    }
}

function applyDateFilter(dateKey) {
    activeDateFilter = dateKey;
    activeTagFilter = null;
    activeMoodFilter = null;
    searchQuery = '';
    document.getElementById('search-input').value = '';
    if (multiDeleteMode) exitMultiDeleteMode();
    closeCalendarScreen();
    appMain.classList.add('search-active');
    renderEntries();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const prettyDate = new Date(dateKey + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    showToast(`Записи за ${prettyDate}`, 'info');
}

function clearDateFilter() { activeDateFilter = null; renderEntries(); }

function openCalendarScreen() {
    closeSidebar();
    datePickerCallback = null;
    renderCalendar();
    document.getElementById('calendar-modal').classList.remove('hidden');
}

function openDatePicker(callback) {
    datePickerCallback = callback;
    renderCalendar();
    document.getElementById('calendar-modal').classList.remove('hidden');
    document.querySelector('.calendar-modal-content').classList.add('selecting-date');
}

function closeCalendarScreen() { document.getElementById('calendar-modal').classList.add('hidden'); }

function changeCalendarMonth(delta) {
    const grid = document.getElementById('calendar-grid');
    grid.classList.remove('slide-left', 'slide-right');
    void grid.offsetWidth;
    grid.classList.add(delta > 0 ? 'slide-left' : 'slide-right');
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    renderCalendar();
    drawMoodChart();
}

// === 🔔 НАПОМИНАНИЕ ===
function checkReminder() {
    if (diaryEntries.length === 0) return;
    const lastEntry = diaryEntries.reduce((latest, entry) => new Date(entry.date) > new Date(latest.date) ? entry : latest);
    const lastDate = new Date(lastEntry.date);
    const now = new Date();
    const daysDiff = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));

    if (daysDiff >= 2) {
        const prettyDate = lastDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        document.getElementById('reminder-text').textContent = `Последняя запись была ${prettyDate}. Есть что добавить?`;
        setTimeout(() => { document.getElementById('reminder-modal').classList.remove('hidden'); }, 500);
    }
}

function closeReminder() { document.getElementById('reminder-modal').classList.add('hidden'); }
function openNewEntryFromReminder() {
    closeReminder();
    document.getElementById('fab-add').click();
}

// === 🔍 ПОИСК ===
const header = document.querySelector('.main-header');
const searchBtn = document.getElementById('search-btn');
const headerTitle = document.getElementById('header-title');
const searchBar = document.getElementById('search-bar');
const searchInput = document.getElementById('search-input');

searchBtn.onclick = () => {
    if (multiDeleteMode) { deleteSelectedEntries(); return; }
    headerTitle.classList.add('hidden');
    searchBtn.classList.add('hidden');
    searchBar.classList.remove('hidden');
    setTimeout(() => searchInput.focus(), 50);
};

document.getElementById('cancel-multi-delete-btn').onclick = exitMultiDeleteMode;

document.getElementById('close-search-btn').onclick = () => {
    searchBar.classList.add('hidden');
    headerTitle.classList.remove('hidden');
    searchBtn.classList.remove('hidden');
    searchInput.value = '';
    searchQuery = '';
    activeTagFilter = null;
    activeDateFilter = null;
    activeMoodFilter = null;
    renderEntries();
};

searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderEntries();
});

// === 📂 БОКОВОЕ МЕНЮ (СО СВАЙПОМ ВЛЕВО ДЛЯ ЗАКРЫТИЯ) ===
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');

function openSidebar() {
    sidebar.classList.add('open');
    sidebarBackdrop.classList.remove('hidden');
    setTimeout(() => sidebarBackdrop.classList.add('open'), 10);
}
function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarBackdrop.classList.remove('open');
    setTimeout(() => sidebarBackdrop.classList.add('hidden'), 300);
}

document.getElementById('menu-btn').onclick = openSidebar;
document.getElementById('close-sidebar-btn').onclick = closeSidebar;
sidebarBackdrop.onclick = closeSidebar;

// Свайп влево для закрытия гамбургера
let sidebarTouchStartX = 0;
sidebar.addEventListener('touchstart', e => { 
    sidebarTouchStartX = e.changedTouches[0].screenX; 
}, { passive: true });

sidebar.addEventListener('touchend', e => {
    const swipeDistance = sidebarTouchStartX - e.changedTouches[0].screenX;
    // Если свайпнули влево более чем на 50px, закрываем меню
    if (swipeDistance > 50) {
        closeSidebar();
    }
}, { passive: true });

// === 🪟 ОБРАБОТЧИКИ МОДАЛКИ ЗАПИСИ ===
document.getElementById('fab-add').onclick = () => openEntryForm();
document.getElementById('close-entry-modal').onclick = closeEntryForm;
document.querySelector('#entry-modal .modal-backdrop').onclick = closeEntryForm;

document.getElementById('edit-mode-btn').onclick = () => {
    isEditing = true;
    updateEditModeUI();
    document.getElementById('entry-title').focus();
};

document.getElementById('selected-mood-display').onclick = () => {
    if (isEditing) openMoodModal();
};

document.getElementById('insert-tag-btn').onclick = () => {
    const textInput = document.getElementById('entry-text');
    const currentText = textInput.value;
    const suffix = (currentText.length > 0 && !currentText.endsWith(' ')) ? ' #' : '#';
    textInput.value = currentText + suffix;
    textInput.focus();
    textInput.scrollTop = textInput.scrollHeight;
};

document.getElementById('cancel-entry-btn').onclick = async () => {
    if (editingEntryId) {
        const confirmed = await showConfirm('Удалить эту запись?');
        if (confirmed) {
            const entryId = editingEntryId;
            closeEntryForm();
            diaryEntries = diaryEntries.filter(e => e.id !== entryId);
            saveAndRender();
            showToast('Запись удалена', 'success');
        }
    } else {
        const confirmed = await showConfirm('Очистить черновик?');
        if (confirmed) {
            clearDraft();
            closeEntryForm();
            showToast('Черновик очищен', 'success');
        }
    }
};

document.getElementById('save-check-btn').onclick = handleSaveEntry;

document.getElementById('entry-title').addEventListener('input', scheduleDraftSave);
document.getElementById('entry-text').addEventListener('input', scheduleDraftSave);

document.getElementById('entry-date-display').onclick = () => {
    openDatePicker((selectedDate) => {
        const dateDisplay = document.getElementById('entry-date-display');
        const dateText = document.getElementById('entry-date-text');
        dateDisplay.dataset.date = selectedDate;
        dateText.textContent = formatPrettyDate(selectedDate);
    });
};

// === 📝 ШАБЛОНЫ ЗАПИСЕЙ ===
const TEMPLATES = {
    gratitude: `1. Сегодня я благодарен за...\n2. Мне помогло...\n3. Я рад, что...`,
    summary: `Что получилось сегодня:\n- \n\nЧто можно улучшить:\n- \n\nВыводы:`,
    ideas: `Идеи и мысли:\n- \n\nПланы на будущее:\n- \n\nМечты:`,
    empty: ''
};

function openTemplatesModal() {
    document.getElementById('templates-modal').classList.remove('hidden');
}

function closeTemplatesModal() {
    document.getElementById('templates-modal').classList.add('hidden');
}

function applyTemplate(templateKey) {
    const textInput = document.getElementById('entry-text');
    const templateText = TEMPLATES[templateKey];
    
    if (textInput.value.trim()) {
        textInput.value += '\n\n' + templateText;
    } else {
        textInput.value = templateText;
    }
    
    textInput.focus();
    textInput.scrollTop = textInput.scrollHeight;
    closeTemplatesModal();
    scheduleDraftSave();
}

document.getElementById('templates-btn').onclick = openTemplatesModal;
document.getElementById('close-templates-modal').onclick = closeTemplatesModal;
document.querySelector('#templates-modal .modal-backdrop').onclick = closeTemplatesModal;

document.querySelectorAll('.template-item').forEach(btn => {
    btn.onclick = () => applyTemplate(btn.dataset.template);
});

// === 😊 МОДАЛКА НАСТРОЕНИЯ ===
function closeMoodModal() {
    const moodModal = document.getElementById('mood-modal');
    moodModal.classList.add('hidden');
    moodModal.classList.remove('top-layer');
}
document.getElementById('close-mood-modal').onclick = closeMoodModal;
document.querySelector('#mood-modal .modal-backdrop').onclick = closeMoodModal;

// === ❓ CONFIRM ===
document.getElementById('confirm-ok').onclick = () => closeConfirm(true);
document.getElementById('confirm-cancel').onclick = () => closeConfirm(false);
document.querySelector('#confirm-modal .modal-backdrop').onclick = () => closeConfirm(false);

// === 🎨 ТЕМЫ ===
document.getElementById('sidebar-theme-toggle').onclick = () => {
    document.getElementById('theme-options').classList.toggle('hidden');
};

function applyTheme(themeName) {
    document.body.classList.remove('theme-dark', 'theme-pastel');
    if (themeName !== 'light') document.body.classList.add('theme-' + themeName);
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.getAttribute('data-theme') === themeName);
    });
    localStorage.setItem('my_web_diary_theme_v1', themeName);
    drawMoodChart();
}

function loadTheme() {
    const savedTheme = localStorage.getItem('my_web_diary_theme_v1') || 'light';
    applyTheme(savedTheme);
}
document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.onclick = () => { applyTheme(btn.getAttribute('data-theme')); };
});

// === 💾 ОБЩИЙ МЕХАНИЗМ СКАЧИВАНИЯ ===
function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Освобождаем память после того, как скачивание запущено
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getExportFileName(extension) {
    const today = new Date().toISOString().split('T')[0];
    return `my_diary_${today}.${extension}`;
}

// === 📦 ПОДМЕНЮ ЭКСПОРТ/ИМПОРТ ===
document.getElementById('sidebar-export-import-toggle').onclick = () => {
    document.getElementById('export-import-options').classList.toggle('hidden');
};

// === 📦 ЭКСПОРТ В JSON (для резервной копии и импорта обратно) ===
document.getElementById('sidebar-export-btn').onclick = () => {
    if (diaryEntries.length === 0) return showToast('Нет записей для экспорта', 'error');
    const data = JSON.stringify({ version: '2.0', entries: diaryEntries }, null, 2);
    downloadFile(data, getExportFileName('json'), 'application/json');
    closeSidebar();
    showToast(`Экспортировано записей: ${diaryEntries.length}`, 'success');
};

// === 📝 ЭКСПОРТ В MARKDOWN (для чтения и переноса) ===
function escapeMarkdownText(text) {
    if (!text) return '';
    // Экранируем символы, которые Markdown мог бы превратить в разметку
    return text.replace(/([\\`*_\[\]<>])/g, '\\$1');
}

function exportMarkdown() {
    if (diaryEntries.length === 0) {
        showToast('Нет записей для экспорта', 'error');
        return;
    }

    // В архиве записи идут хронологически: от старых к новым.
    // Сортируем именно по дате события, а не по дате редактирования.
    const sorted = [...diaryEntries].sort(
        (a, b) => new Date(a.date) - new Date(b.date)
    );

    const lines = [
        '# Мой дневник',
        '',
        `_Записей: ${sorted.length}_`,
        `_Экспорт от ${new Date().toLocaleDateString('ru-RU')}_`,
        ''
    ];

    sorted.forEach(entry => {
        const d = new Date(entry.date);
        const dateLabel = d.toLocaleDateString('ru-RU', {
            day: '2-digit', month: 'long', year: 'numeric'
        });

        lines.push('---', '');
        lines.push(`## ${dateLabel} ${entry.mood || ''}`.trim(), '');

        if (entry.title) {
            lines.push(`### ${escapeMarkdownText(entry.title)}`, '');
        }

        // Текст сохраняем как есть, чтобы работать с обычными абзацами и списками
        lines.push(entry.content || '', '');

        // Теги у нас уже начинаются с #, поэтому Markdown понимает их как заголовки.
        // Выносим их отдельной строкой без решёток — как обычный текст-метку.
        if (entry.tags && entry.tags.length > 0) {
            const tagLabels = entry.tags.map(tag => tag.replace(/^#/, ''));
            lines.push(`_Теги: ${tagLabels.join(', ')}_`, '');
        }
    });

    downloadFile(
        lines.join('\n'),
        getExportFileName('md'),
        'text/markdown;charset=utf-8'
    );

    closeSidebar();
    showToast(`Экспорт в Markdown готов: ${sorted.length} записей`, 'success');
}

document.getElementById('sidebar-markdown-btn').onclick = exportMarkdown;

document.getElementById('sidebar-import-btn').onclick = () => { document.getElementById('import-file').click(); };
document.getElementById('import-file').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            if (!data.entries) throw new Error();
            const existing = new Set(diaryEntries.map(x => x.id));
            let count = 0;
            data.entries.forEach(entry => { if (!existing.has(entry.id)) { diaryEntries.push(entry); count++; } });
            saveAndRender();
            showToast(`Импортировано: ${count}`, 'success');
            closeSidebar();
        } catch { showToast('Ошибка файла', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
};

// === 🔔 НАПОМИНАНИЕ ===
document.getElementById('reminder-later-btn').onclick = closeReminder;
document.getElementById('reminder-write-btn').onclick = openNewEntryFromReminder;
document.querySelector('#reminder-modal .modal-backdrop').onclick = closeReminder;

// === 💬 ЦИТАТА ===
document.querySelector('.quote-section').onclick = nextQuote;

// === 📊 ГРАФИК НАСТРОЕНИЙ (МОДАЛКА) ===
function openChartModal() {
    closeSidebar();
    updateChartModalTitle();
    document.getElementById('chart-modal').classList.remove('hidden');
    setTimeout(() => drawMoodChart(), 50);
}

function closeChartModal() {
    document.getElementById('chart-modal').classList.add('hidden');
}

function updateChartModalTitle() {
    const monthText = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1)
        .toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    document.getElementById('chart-modal-title').textContent = monthText;
}

function changeChartMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    updateChartModalTitle();
    drawMoodChart();
}

document.getElementById('sidebar-chart-btn').onclick = openChartModal;
document.getElementById('close-chart-modal').onclick = closeChartModal;
document.querySelector('#chart-modal .modal-backdrop').onclick = closeChartModal;
document.getElementById('prev-month-chart').onclick = () => changeChartMonth(-1);
document.getElementById('next-month-chart').onclick = () => changeChartMonth(1);

// === 📈 СТАТИСТИКА ===
function openStatsModal() {
    closeSidebar();
    
    if (diaryEntries.length === 0) {
        document.getElementById('stats-body').innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:40px 0;">Пока нет записей.<br>Начните вести дневник!</p>';
        document.getElementById('stats-modal').classList.remove('hidden');
        return;
    }
    
    const totalEntries = diaryEntries.length;
    const totalWords = diaryEntries.reduce((sum, entry) => sum + (entry.wordCount || 0), 0);
    const avgWords = Math.round(totalWords / totalEntries);
    
    const uniqueDays = new Set(diaryEntries.map(e => getDateKey(e.date)));
    const daysWithEntries = uniqueDays.size;
    
    const sortedByDate = [...diaryEntries].sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstEntryDate = new Date(sortedByDate[0].date);
    const daysSinceFirst = Math.floor((new Date() - firstEntryDate) / (1000 * 60 * 60 * 24));
    const activityPercent = daysSinceFirst > 0 ? Math.round((daysWithEntries / daysSinceFirst) * 100) : 0;
    
    const moodCounts = {};
    diaryEntries.forEach(entry => {
        moodCounts[entry.mood] = (moodCounts[entry.mood] || 0) + 1;
    });
    const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0];
    
    const longestEntry = [...diaryEntries].sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0))[0];
    const shortestEntry = [...diaryEntries].sort((a, b) => (a.wordCount || 0) - (b.wordCount || 0))[0];
    const firstDateStr = firstEntryDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    
    document.getElementById('stats-body').innerHTML = `
        <div class="stats-item"><span class="stats-label">Всего записей</span><span class="stats-value large">${totalEntries}</span></div>
        <div class="stats-item"><span class="stats-label">Всего слов</span><span class="stats-value">${totalWords.toLocaleString('ru-RU')}</span></div>
        <div class="stats-item"><span class="stats-label">Средняя длина записи</span><span class="stats-value">${avgWords} слов</span></div>
        <div class="stats-item"><span class="stats-label">Дней с записями</span><span class="stats-value">${daysWithEntries} из ${daysSinceFirst} (${activityPercent}%)</span></div>
        <div class="stats-item"><span class="stats-label">Самое частое настроение</span><span class="stats-value">${topMood[0]} (${topMood[1]} ${topMood[1] === 1 ? 'раз' : 'раза'})</span></div>
        <div class="stats-item"><span class="stats-label">Самая длинная запись</span><span class="stats-value">${longestEntry.wordCount || 0} слов</span></div>
        <div class="stats-item"><span class="stats-label">Самая короткая запись</span><span class="stats-value">${shortestEntry.wordCount || 0} слов</span></div>
        <div class="stats-item"><span class="stats-label">Первая запись</span><span class="stats-value">${firstDateStr}</span></div>
    `;
    
    document.getElementById('stats-modal').classList.remove('hidden');
}

function closeStatsModal() {
    document.getElementById('stats-modal').classList.add('hidden');
}

document.getElementById('sidebar-stats-btn').onclick = openStatsModal;
document.getElementById('close-stats-modal').onclick = closeStatsModal;
document.querySelector('#stats-modal .modal-backdrop').onclick = closeStatsModal;

// === 📅 КНОПКИ КАЛЕНДАРЯ ===
document.getElementById('sidebar-calendar-btn').onclick = openCalendarScreen;
document.getElementById('close-calendar-btn').onclick = closeCalendarScreen;
document.querySelector('#calendar-modal .modal-backdrop').onclick = closeCalendarScreen;
document.getElementById('prev-month-btn').onclick = () => changeCalendarMonth(-1);
document.getElementById('next-month-btn').onclick = () => changeCalendarMonth(1);
document.getElementById('prev-month-desktop').onclick = () => changeCalendarMonth(-1);
document.getElementById('next-month-desktop').onclick = () => changeCalendarMonth(1);

// === 🏷️ ТЕГИ ===
function openTagsModal() {
    closeSidebar();
    const tagCounts = {};
    diaryEntries.forEach(entry => {
        if (entry.tags && entry.tags.length > 0) {
            entry.tags.forEach(tag => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; });
        }
    });

    const sortedTags = Object.entries(tagCounts).sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
    });

    const list = document.getElementById('tags-list');
    if (sortedTags.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:var(--text-muted); width:100%;">Пока нет ни одного тега.<br>Добавьте #тег в текст записи!</p>';
    } else {
        list.innerHTML = sortedTags.map(([tag, count]) =>
            `<div class="tag-pill" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)} <span class="count">(${count})</span></div>`
        ).join('');
    }
    document.getElementById('tags-modal').classList.remove('hidden');
}

document.getElementById('tags-list').addEventListener('click', (e) => {
    const pill = e.target.closest('.tag-pill');
    if (!pill) return;
    applyTagFilter(pill.dataset.tag);
});

function applyTagFilter(tag) {
    activeTagFilter = tag;
    activeDateFilter = null;
    activeMoodFilter = null;
    searchQuery = '';
    document.getElementById('search-input').value = '';
    if (multiDeleteMode) exitMultiDeleteMode();
    closeTagsModal();
    appMain.classList.add('search-active');
    renderEntries();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`Показаны записи: ${tag}`, 'info');
}

function clearTagFilter() { activeTagFilter = null; renderEntries(); }
function closeTagsModal() { document.getElementById('tags-modal').classList.add('hidden'); }

document.getElementById('sidebar-tags-btn').onclick = openTagsModal;
document.getElementById('close-tags-modal').onclick = closeTagsModal;
document.querySelector('#tags-modal .modal-backdrop').onclick = closeTagsModal;

// === 😊 ФИЛЬТР ПО НАСТРОЕНИЮ ===
function initMoodFilterGrid() {
    const grid = document.getElementById('mood-filter-grid');
    grid.innerHTML = '';
    MOODS.forEach(m => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mood-filter-emoji';
        btn.textContent = m.emoji;
        btn.dataset.mood = m.emoji;
        btn.onclick = () => applyMoodFilter(m.emoji);
        grid.appendChild(btn);
    });
}

document.getElementById('sidebar-mood-filter-toggle').onclick = () => {
    document.getElementById('mood-filter-options').classList.toggle('hidden');
};

function applyMoodFilter(emoji) {
    activeMoodFilter = emoji;
    activeTagFilter = null;
    activeDateFilter = null;
    searchQuery = '';
    document.getElementById('search-input').value = '';
    if (multiDeleteMode) exitMultiDeleteMode();
    closeSidebar();
    appMain.classList.add('search-active');
    renderEntries();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`Записи с настроением ${emoji}`, 'info');
}

function clearMoodFilter() { activeMoodFilter = null; renderEntries(); }

document.getElementById('entries-list').addEventListener('click', (e) => {
    if (e.target.closest('#clear-tag-filter')) clearTagFilter();
    else if (e.target.closest('#clear-date-filter')) clearDateFilter();
    else if (e.target.closest('#clear-mood-filter')) clearMoodFilter();
});

// === 🔐 PIN ===
document.querySelectorAll('.pin-key[data-key]').forEach(key => {
    key.addEventListener('click', () => handlePinKey(key.dataset.key));
});
document.querySelector('.pin-key-delete').addEventListener('click', handlePinDelete);
document.getElementById('pin-skip-btn').onclick = skipPinSetup;
document.getElementById('sidebar-reset-pin-btn').onclick = resetPin;

// === 👉 СВАЙП ВПРАВО ДЛЯ ОТМЕНЫ ВЫБОРА ===
let cancelSwipeStartX = 0;
let cancelSwipeStartY = 0;
let isCancelSwiping = false;

document.addEventListener('touchstart', (e) => {
    // Работает ТОЛЬКО в режиме множественного выбора
    if (!multiDeleteMode) return;
    // Игнорируем поля ввода
    if (e.target.closest('input, textarea')) return;
    
    cancelSwipeStartX = e.touches[0].clientX;
    cancelSwipeStartY = e.touches[0].clientY;
    isCancelSwiping = false;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    if (!multiDeleteMode) return;
    if (e.target.closest('input, textarea')) return;
    
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const deltaX = touchX - cancelSwipeStartX;
    const deltaY = touchY - cancelSwipeStartY;
    
    // Свайп строго вправо и горизонтальный
    if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 120) {
        isCancelSwiping = true;
    }
}, { passive: true });

document.addEventListener('touchend', () => {
    if (!multiDeleteMode) return;
    if (!isCancelSwiping) return;
    
    // Отменяем выбор
    exitMultiDeleteMode();
    isCancelSwiping = false;
}, { passive: true });

// === 🚀 ЗАПУСК ===
async function initApp() {
    // Сначала инициализируем базу данных
    try {
        await initDB();
        console.log('IndexedDB инициализирована');
    } catch (error) {
        console.error('Не удалось инициализировать IndexedDB:', error);
        showToast('Ошибка хранилища данных', 'error');
        return;
    }
    
    // Затем запускаем всё остальное
    loadTheme();
    updateDailyQuote();
    await loadEntries();
    renderCalendar();
    initMoodFilterGrid();
    initPinProtection();
    checkReminder();
}

initApp();