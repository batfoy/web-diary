// === 🛠️ ПОЛИФИЛЛ ДЛЯ CANVAS (закругленные углы для старых Safari/iOS) ===
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        this.beginPath();
        this.moveTo(x + r, y);
        this.arcTo(x + w, y, x + w, y + h, r);
        this.arcTo(x + w, y + h, x, y + h, r);
        this.arcTo(x, y + h, x, y, r);
        this.arcTo(x, y, x + w, y, r);
        this.closePath();
        return this;
    };
}

// === 📦 ПЕРЕМЕННЫЕ ===
let diaryEntries = [];
const STORAGE_KEY = 'my_web_diary_entries_v2';
const PIN_KEY = 'my_web_diary_pin_v1';
let currentCalendarDate = new Date();
let searchQuery = '';
let editingEntryId = null;       // id существующей записи (null для новой)
let activeTagFilter = null;
let activeDateFilter = null;
let activeMoodFilter = null;
const SORT_KEY = 'my_web_diary_sort_mode_v1';
let activeSortMode = localStorage.getItem(SORT_KEY) || 'created'; 
// created | updated | mood
let tempMood = '😐';
let currentQuoteIndex = 0;

let multiDeleteMode = false;
let selectedEntries = [];
let datePickerCallback = null;
let isEditing = false;           // true = поля редактируемые

// PIN-код
let pinInputBuffer = '';
let pinSetupStage = null;
let pinSetupTemp = '';
let isPinUnlocked = false;


// === 🛡️ БЕЗОПАСНОСТЬ: Конфигурация DOMPurify ===
const SANITIZE_CONFIG = {
    ALLOWED_TAGS: ['div','p','span','br','b','i','u','strong','em','h1','h2','h3','h4','h5','img','a','table','tbody','tr','td','th'],
    ALLOWED_ATTR: ['class','style','data-marker','src','alt','contenteditable','href','target','rel'],
    ALLOW_DATA_ATTR: true,
    FORBID_TAGS: ['script','iframe','object','embed','form'],
    FORBID_ATTR: ['onerror','onload','onclick','onmouseover','onfocus']
};

// Хук для фильтрации CSS в атрибуте style (разрешаем только безопасные свойства)
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'style') {
        const safe = data.attrValue.split(';').filter(rule =>
            /^\s*(color|font-|text-align|line-height|background)/i.test(rule)
        ).join(';');
        data.attrValue = safe;
    }
});

// === 🔐 ХЕШИРОВАНИЕ PIN ===
async function hashPin(pin) {
    const data = new TextEncoder().encode(pin + 'my_diary_salt_v1');
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

const appMain = document.getElementById('app-main');

const MOODS = [
    { emoji: '😭', score: 0 }, { emoji: '☹️', score: 1 }, { emoji: '😡', score: 2 },
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

// === 🎨 ФОНЫ ЗАПИСЕЙ ===
const BACKGROUNDS = [
    { id: 'default',   name: 'Стандарт', cssClass: 'bg-default' },
    { id: 'paper',     name: 'Бумага',   cssClass: 'bg-paper' },
    { id: 'night',     name: 'Ночь',     cssClass: 'bg-night' },
    { id: 'forest',    name: 'Лес',      cssClass: 'bg-forest' },
    { id: 'sunset',    name: 'Закат',    cssClass: 'bg-sunset' },
    { id: 'lavender',  name: 'Лаванда',  cssClass: 'bg-lavender' },
    { id: 'wood',      name: 'Дерево',   cssClass: 'bg-wood' },
    { id: 'stone',     name: 'Камень',   cssClass: 'bg-stone' },
    { id: 'landscape', name: 'Пейзаж',   cssClass: 'bg-landscape' },
    { id: 'perry', name: 'Утканос', cssClass: 'bg-perry' }
];

// === 😊 ПАКИ ЭМОДЗИ (Поддержка текста и картинок) ===
const EMOJI_PACKS = [
    {
        id: 'standard',
        name: 'Стандартные',
        icon: '😀',
        emojis: [
            '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃',
            '😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙',
            '😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔',
            '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
            '👍','👎','👏','🙌','👋','🤚','✋','🖖','👌','🤌',
            '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯',
            '🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🍒','🍑',
            '⚽','🏀','🎮','🎲','🎵','🎶','🔥','💧','💰','🎁'
        ]
    },
    {
        id: 'custom_halloween',
        name: 'Хэллоуин (Тест)',
        icon: '🎃',
        emojis: [
            // Пример использования картинки вместо текста
            { type: 'img', src: 'https://img.icons8.com/color/96/pumpkin-lantern.png', alt: 'тыква' },
            { type: 'img', src: 'https://img.icons8.com/color/96/ghost.png', alt: 'призрак' },
            { type: 'img', src: 'https://img.icons8.com/color/96/skull.png', alt: 'череп' },
            { type: 'img', src: 'https://img.icons8.com/color/96/bat.png', alt: 'летучая мышь' },
            // Можно смешивать с обычными эмодзи
            '🧙', '🧛', '🧟', '🕸️', '🌕'
        ]
    }
];

// === 🛠️ ВСПОМОГАТЕЛЬНЫЕ ===
function extractTags(htmlContent) {
    const text = getPlainTextFromHTML(htmlContent);
    if (!text) return [];
    const matches = text.match(/#[a-zA-Zа-яА-ЯёЁ0-9_]+/g);
    return matches ? [...new Set(matches.map(t => t.toLowerCase()))] : [];
}

// Получает обычный текст из HTML-контента (игнорирует картинки и теги)
function getPlainTextFromHTML(html) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    return tempDiv.textContent || tempDiv.innerText || '';
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

// === ↕️ СОРТИРОВКА И ДАТЫ ===
function getEntryCreatedTime(entry) {
    return new Date(entry.date).getTime();
}

function getEntryUpdatedTime(entry) {
    return entry.updatedAt || entry.editedAt || new Date(entry.date).getTime();
}

function sortEntriesForList(entries) {
    const sorted = [...entries];

    if (activeSortMode === 'updated') {
        return sorted.sort((a, b) => getEntryUpdatedTime(b) - getEntryUpdatedTime(a));
    }

    

    // По умолчанию — по дате создания / публикации
    return sorted.sort((a, b) => getEntryCreatedTime(b) - getEntryCreatedTime(a));
}

function formatEditedDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const todayKey = getDateKey(new Date());
    const editedKey = getDateKey(date);

    if (editedKey === todayKey) return 'сегодня';

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (editedKey === getDateKey(yesterday)) return 'вчера';

    return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
    });
}

function getEditedLabelHtml(entry) {
    if (!entry.editedAt) return '';
    return `<span class="entry-edited">· изм. ${formatEditedDate(entry.editedAt)}</span>`;
}

function updateSortButtons() {
    document.querySelectorAll('.sort-option-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.sort === activeSortMode);
    });
}

function setSortMode(mode) {
    activeSortMode = mode;
    localStorage.setItem(SORT_KEY, mode);
    updateSortButtons();
    renderEntries();

    const labels = {
        created: 'Сортировка: по дате создания',
        updated: 'Сортировка: по дате изменения'
    };

    showToast(labels[mode] || 'Сортировка изменена', 'info');
}

// Миграция тегов — теперь в IndexedDB, а не в localStorage
async function migrateEntriesTags() {
    let needsSave = false;
    diaryEntries.forEach(entry => {
        if (!entry.tags || entry.tags.length === 0) {
            entry.tags = extractTags(entry.content);
            needsSave = true;
        }
    });
    if (needsSave) await saveAllToIndexedDB();
}

// === 🔐 PIN-КОД ===
function initPinProtection() {
    const savedPin = localStorage.getItem(PIN_KEY);
    
    if (savedPin) {
        // PIN установлен — просим ввести
        showPinModal('enter');
    }
    // Если PIN не установлен — НЕ показываем модалку создания
    // Пользователь сам создаст его через меню в гамбургере
    
    updatePinMenuVisibility();
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

async function verifyPinInput() {
    const savedPin = localStorage.getItem(PIN_KEY);
    const subtitle = document.getElementById('pin-subtitle');
    
    if (pinSetupStage === 'enter-new') {
        pinSetupTemp = pinInputBuffer;
        showPinModal('setup-confirm');
    } else if (pinSetupStage === 'confirm-new') {
    if (pinInputBuffer === pinSetupTemp) {
        const hashed = await hashPin(pinSetupTemp);  // ← НОВОЕ: хешируем перед сохранением
        localStorage.setItem(PIN_KEY, hashed);
        pinSetupTemp = '';
        pinSetupStage = null;
        isPinUnlocked = true;
            document.getElementById('pin-modal').classList.add('hidden');
            updatePinMenuVisibility();
            //updateResetPinButtonVisibility();
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
    const inputHash = await hashPin(pinInputBuffer);  // ← НОВОЕ: хешируем введённый

    // Проверяем: хеш совпадает ИЛИ это старый plaintext PIN (для миграции)
    if (inputHash === savedPin || pinInputBuffer === savedPin) {
        // Если это был старый plaintext PIN — мигрируем на хеш
        if (pinInputBuffer === savedPin && !savedPin.includes('-')) {
            const newHash = await hashPin(pinInputBuffer);
            localStorage.setItem(PIN_KEY, newHash);
            console.log('PIN мигрирован на хеш');
        }

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
    pinInputBuffer = '';
    isPinUnlocked = true;
    document.getElementById('pin-modal').classList.add('hidden');
}

async function resetPin() {
    closeSidebar();
    const confirmed = await showConfirm('Сбросить PIN-код? Дневник останется без защиты.');
    if (confirmed) {
        localStorage.removeItem(PIN_KEY);
        updatePinMenuVisibility();
        showToast('PIN-код сброшен', 'success');
    }
}

function updatePinMenuVisibility() {
    const hasPin = !!localStorage.getItem(PIN_KEY);
    const createBtn = document.getElementById('sidebar-create-pin-btn');
    const resetBtn = document.getElementById('sidebar-reset-pin-btn');
    
    if (hasPin) {
        // PIN есть — показываем только "Сбросить"
        createBtn.classList.add('hidden');
        resetBtn.classList.remove('hidden');
    } else {
        // PIN нет — показываем только "Создать"
        createBtn.classList.remove('hidden');
        resetBtn.classList.add('hidden');
    }
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

// === 💾 АВТОСОХРАНЕНИЕ ЗАПИСИ ===
let autoSaveTimer = null;

async function saveCurrentEntry() {
    const title = document.getElementById('entry-title').value.trim();
    const editor = document.getElementById('entry-text');
    const htmlContent = editor.innerHTML.replace(/\u200B/g, '').trim();

    // Удаляем пустые <div> (без текста и без картинок)
    const temp = document.createElement('div');
    temp.innerHTML = htmlContent;

    // Удаляем пустые <div>, НО не трогаем таблицы и их содержимое
    temp.querySelectorAll('div').forEach(div => {
        // Если div находится внутри таблицы или содержит таблицу — не удаляем
        if (div.closest('table') || div.querySelector('table')) return;

        // Если div пустой (без текста, без картинок, без невидимых символов) — удаляем
        if (div.textContent.replace(/\u200B/g, '').trim() === '' && !div.querySelector('img')) {
            div.remove();
        }
    });

    const cleanedHtml = temp.innerHTML;

    const plainText = getPlainTextFromHTML(cleanedHtml);       // ← по cleanedHtml
    const hasImage = editor.querySelector('img.inline-emoji') !== null;

    if (!title && !plainText && !hasImage) return;

    const dateDisplay = document.getElementById('entry-date-display');
    const dateInput = dateDisplay.dataset.date;
    const finalDate = new Date(dateInput + 'T12:00:00').toISOString();
    const tags = extractTags(cleanedHtml);                     // ← по cleanedHtml
    const wordCount = plainText.split(/\s+/).filter(w => w.length > 0).length;
    const now = Date.now();
    const fontSize = editor.style.fontSize || '';
    const lineHeight = editor.style.lineHeight || '';
    const fontFamily = editor.style.fontFamily || '';
    const fontWeight = editor.style.fontWeight || '';
    const fontStyle = editor.style.fontStyle || '';

    if (!editingEntryId) {
        const newEntry = {
            id: now.toString(), date: finalDate, createdAt: now, updatedAt: now, editedAt: null,
            title, content: cleanedHtml,                        // ← cleanedHtml
            mood: tempMood, wordCount, tags, fontSize,
            lineHeight, fontFamily, fontWeight, fontStyle,
            background: currentBgId 
        };
        diaryEntries.unshift(newEntry);
        editingEntryId = newEntry.id;
    } else {
        const index = diaryEntries.findIndex(e => e.id === editingEntryId);
        if (index !== -1) {
            diaryEntries[index] = {
                ...diaryEntries[index], date: diaryEntries[index].date, updatedAt: now, editedAt: now,
                title, content: cleanedHtml,                    // ← cleanedHtml
                mood: tempMood, wordCount, tags, fontSize,
                lineHeight, fontFamily, fontWeight, fontStyle,
                background: currentBgId 
            };
        }
    }

    const currentEntry = diaryEntries.find(e => e.id === editingEntryId);
    if (currentEntry) {
        await dbPut(currentEntry);
    }

    renderEntries();
    renderCalendar();
    drawMoodChart();
}

function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        saveCurrentEntry().catch(err => {
            console.error('Автосохранение не удалось:', err);
            // Опционально: showToast('Ошибка автосохранения', 'error');
        });
    }, 500);
}

// === 📝 МОДАЛКА ЗАПИСИ ===

// Определяет, какое состояние у модалки, и вешает соответствующий класс.
function updateModalState() {
    const modal = document.getElementById('entry-modal');
    const titleVal = document.getElementById('entry-title').value.trim();
    const editor = document.getElementById('entry-text');
    const plainText = getPlainTextFromHTML(editor.innerHTML).trim();
    
    // Проверяем наличие текста, заголовка ИЛИ картинки-эмодзи
    const hasImage = editor.querySelector('img.inline-emoji') !== null;
    const hasContent = !!(titleVal || plainText || hasImage);

    modal.classList.remove('state-new-empty', 'state-new-filled', 'state-view', 'state-edit');

    if (editingEntryId) {
        modal.classList.add(isEditing ? 'state-edit' : 'state-view');
    } else {
        modal.classList.add(hasContent ? 'state-new-filled' : 'state-new-empty');
    }
}

// Обновляет иконки и доступность полей под текущее состояние
// Обновляет иконки и доступность полей под текущее состояние
function updateEditModeUI() {
    const modal = document.getElementById('entry-modal');
    const titleInput = document.getElementById('entry-title');
    const textInput = document.getElementById('entry-text');
    const headerDeleteBtn = document.getElementById('header-delete-btn');
    const editModeBtn = document.getElementById('edit-mode-btn');
    const saveCloseBtn = document.getElementById('save-close-btn');

    // Безопасное получение иконок
    const iconBack = document.getElementById('btn-icon-back');
    const iconCheck = document.getElementById('btn-icon-check');
    const iconClose = document.getElementById('btn-icon-close');

    const plainText = getPlainTextFromHTML(textInput.innerHTML).trim();
    const isNewAndEmpty = !editingEntryId && !titleInput.value.trim() && !plainText;
    const hasContent = titleInput.value.trim() || plainText;

    // Функция для переключения видимости иконок с абсолютной защитой от null
    const showIcon = (iconToShow) => {
        // Если хотя бы одной иконки нет в DOM (из-за кэша), выходим, чтобы не ронять приложение
        if (!iconBack || !iconCheck || !iconClose) {
            console.warn('⚠️ SVG-иконки не найдены в DOM! Очистите кэш (Application -> Clear site data) или обновите CACHE_VERSION в sw.js');
            
            // Фоллбэк: если SVG не загрузились, используем старый текстовый метод, чтобы приложение работало
            if (saveCloseBtn) {
                if (isNewAndEmpty) saveCloseBtn.textContent = '←';
                else if (hasContent || editingEntryId) saveCloseBtn.textContent = '✓';
                else saveCloseBtn.textContent = '✕';
            }
            return;
        }

        // Если всё хорошо, работаем с SVG
        iconBack.style.display = 'none';
        iconCheck.style.display = 'none';
        iconClose.style.display = 'none';
        
        if (iconToShow) {
            iconToShow.style.display = 'block';
        }
    };

    if (isEditing) {
        modal.classList.add('is-editing');
        titleInput.removeAttribute('readonly');
        textInput.setAttribute('contenteditable', 'true'); 
        if (editModeBtn) editModeBtn.classList.add('hidden');
        
        if (isNewAndEmpty) {
            showIcon(iconBack); 
            saveCloseBtn.title = 'Отмена (назад)';
        } else {
            showIcon(iconCheck); 
            saveCloseBtn.title = 'Сохранить и закрыть';
        }

        if (editingEntryId || hasContent) {
            headerDeleteBtn.classList.remove('hidden');
        } else {
            headerDeleteBtn.classList.add('hidden');
        }

    } else {
        modal.classList.remove('is-editing');
        titleInput.setAttribute('readonly', true);
        textInput.setAttribute('contenteditable', 'false');
        if (editModeBtn) editModeBtn.classList.remove('hidden');
        
        showIcon(iconClose); 
        saveCloseBtn.title = 'Закрыть без изменений';
        headerDeleteBtn.classList.remove('hidden');
    }

    const toolbar = document.getElementById('entry-toolbar');
    if (isEditing) {
        toolbar.classList.remove('hidden');
    } else {
        toolbar.classList.add('hidden');
    }
}

function openEntryForm(entry = null) {
    const dateDisplay = document.getElementById('entry-date-display');
    const dateText = document.getElementById('entry-date-text');
    const moodDisplay = document.getElementById('selected-mood-display');
    const titleInput = document.getElementById('entry-title');
    const saveCloseBtn = document.getElementById('save-close-btn');
    const editor = document.getElementById('entry-text');
    

    if (entry) {
        editingEntryId = entry.id;
        tempMood = entry.mood;
        titleInput.value = entry.title || '';
        let content = entry.content || '';
        content = content.replace(/font-family:\s*['"]?High Summit['"]?[^;]*;?/gi, '');
        content = content.replace(/font-family:\s*['"]?Sunday['"]?[^;]*;?/gi, '');
        editor.innerHTML = DOMPurify.sanitize(content, SANITIZE_CONFIG);

        // === НОРМАЛИЗАЦИЯ ===

        // 1. Обычная: "1<br>2<br>3" → "<div>1</div><div>2</div><div>3</div>"
        if (!editor.querySelector('div, p, h1, h2, h3, h4, h5, li') && editor.innerHTML.trim()) {
            const parts = editor.innerHTML.split(/<br\s*\/?>/i);
            if (parts.length > 1) {
                editor.innerHTML = parts.map(p => `<div>${p || '<br>'}</div>`).join('');
            }
        }

        // 2. Агрессивная: разбиваем <br> внутри div, где нет вложенных div
        //    (переносим class и data-marker в первый новый div)
        editor.querySelectorAll('div').forEach(div => {
            if (!div.querySelector('div, p, h1, h2, h3, h4, h5, li') && div.innerHTML.includes('<br')) {
                const parts = div.innerHTML.split(/<br\s*\/?>/i);
                if (parts.length > 1) {
                    const frag = document.createDocumentFragment();
                    parts.forEach((p, i) => {
                        const newDiv = document.createElement('div');
                        newDiv.innerHTML = p || '<br>';
                        if (i === 0) {
                            newDiv.className = div.className;
                            if (div.dataset.marker) newDiv.dataset.marker = div.dataset.marker;
                        }
                        frag.appendChild(newDiv);
                    });
                    div.replaceWith(frag);
                }
            }
        });

        // 3. Восстанавливаем \u200B в начале каждого элемента списка
        editor.querySelectorAll('.custom-list-item').forEach(item => {
            if (!item.firstChild || item.firstChild.nodeType !== 3 || !item.firstChild.textContent.startsWith('\u200B')) {
                item.insertBefore(document.createTextNode('\u200B'), item.firstChild);
            }
        });

        // === КОНЕЦ НОРМАЛИЗАЦИИ ===

        // Восстанавливаем шрифты
        editor.style.fontSize = entry.fontSize || '';
        editor.style.lineHeight = entry.lineHeight || '';
        editor.style.fontFamily = entry.fontFamily || '';
        editor.style.fontWeight = entry.fontWeight || '';
        editor.style.fontStyle = entry.fontStyle || '';

        // Восстанавливаем фон записи
        const savedBg = entry.background || 'default';
        applyBackgroundToEntry(savedBg);

        const entryDateKey = getDateKey(entry.date);
        dateDisplay.dataset.date = entryDateKey;
        dateText.textContent = formatPrettyDate(entryDateKey);
        isEditing = false;

        saveCloseBtn.textContent = '✕';
        saveCloseBtn.title = 'Закрыть без изменений';
    } else {
        editingEntryId = null;
        titleInput.value = '';
        editor.innerHTML = '';

        editor.style.fontSize = '';
        editor.style.lineHeight = '';
        editor.style.fontFamily = '';
        editor.style.fontWeight = '';
        editor.style.fontStyle = '';

        // Сброс фона для новой записи
        applyBackgroundToEntry('default');   // ← добавить

        tempMood = '😐';

        const todayKey = getDateKey(new Date());
        dateDisplay.dataset.date = todayKey;
        dateText.textContent = 'Сегодня';

        isEditing = true;

        saveCloseBtn.textContent = '←';
        saveCloseBtn.title = 'Отмена (назад)';
    }

    moodDisplay.textContent = tempMood;
    updateModalState();
    updateEditModeUI();
    document.getElementById('entry-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Блокируем скролл фона

    if (isEditing && !entry) setTimeout(() => titleInput.focus(), 100);
}

// Вход в редактирование существующей записи (по клику на ✏️)
function enterEditMode() {
    if (!editingEntryId) return;
    isEditing = true;
    updateModalState();
    updateEditModeUI();

    // Ставим курсор в КОНЕЦ текста (как в My Diary / Journey)
    const editor = document.getElementById('entry-text');
    editor.focus();

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false); // false = свернуть в конец
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    // Прокручиваем вниз, чтобы курсор был виден
    editor.scrollTop = editor.scrollHeight;
}

async function handleSaveEntry() {
    clearTimeout(autoSaveTimer);
    const title = document.getElementById('entry-title').value.trim();
    const editor = document.getElementById('entry-text');
    const htmlContent = editor.innerHTML.replace(/\u200B/g, '').trim();

    // Удаляем пустые <div> (без текста и без картинок)
    const temp = document.createElement('div');
    temp.innerHTML = htmlContent;

    // Удаляем пустые <div>, НО не трогаем таблицы и их содержимое
    temp.querySelectorAll('div').forEach(div => {
        // Если div находится внутри таблицы или содержит таблицу — не удаляем
        if (div.closest('table') || div.querySelector('table')) return;

        // Если div пустой (без текста, без картинок, без невидимых символов) — удаляем
        if (div.textContent.replace(/\u200B/g, '').trim() === '' && !div.querySelector('img')) {
            div.remove();
        }
    });

    const cleanedHtml = temp.innerHTML;

    const plainText = getPlainTextFromHTML(cleanedHtml);       // ← по cleanedHtml
    const hasImage = editor.querySelector('img.inline-emoji') !== null;

    if (!plainText && !title && !hasImage) {
        // Если запись пустая и мы её редактировали — удаляем без подтверждения
        if (editingEntryId) {
            const entryId = editingEntryId;
            closeEntryForm(); // Сначала закрываем форму

            // Удаляем из базы и массива
            await dbDelete(entryId);
            diaryEntries = diaryEntries.filter(e => e.id !== entryId);

            // Обновляем интерфейс
            renderEntries();
            renderCalendar();
            drawMoodChart();
            showToast('Пустая запись удалена', 'info'); // Небольшое уведомление
            return false;
        } else {
            // Если это новая пустая запись — просто закрываем
            closeEntryForm();
            return false;
        }
    }

    const dateDisplay = document.getElementById('entry-date-display');
    const dateInput = dateDisplay.dataset.date;
    const finalDate = new Date(dateInput + 'T12:00:00').toISOString();
    const tags = extractTags(cleanedHtml);                     // ← по cleanedHtml
    const wordCount = plainText.split(/\s+/).filter(w => w.length > 0).length;
    const now = Date.now();
    const fontSize = editor.style.fontSize || '';
    const lineHeight = editor.style.lineHeight || '';
    const fontFamily = editor.style.fontFamily || '';
    const fontWeight = editor.style.fontWeight || '';
    const fontStyle = editor.style.fontStyle || '';

    if (editingEntryId) {
        const index = diaryEntries.findIndex(e => e.id === editingEntryId);
        if (index !== -1) {
            diaryEntries[index] = {
                ...diaryEntries[index], date: diaryEntries[index].date, updatedAt: now, editedAt: now,
                title, content: cleanedHtml,                    // ← cleanedHtml
                mood: tempMood, wordCount, tags, fontSize,
                lineHeight, fontFamily, fontWeight, fontStyle,
                background: currentBgId 
            };
            showToast('Запись обновлена', 'success');
        } else {
            showToast('Запись не найдена', 'error');
        }
    } else {
        const newEntry = {
            id: now.toString(), date: finalDate, createdAt: now, updatedAt: now, editedAt: null,
            title, content: cleanedHtml,                        // ← cleanedHtml
            mood: tempMood, wordCount, tags, fontSize,
            lineHeight, fontFamily, fontWeight, fontStyle,
            background: currentBgId 
        };
        diaryEntries.unshift(newEntry);
        editingEntryId = newEntry.id;
        showToast('Запись сохранена', 'success');
    }

    isEditing = false;
    updateModalState();
    updateEditModeUI();

    const currentEntry = diaryEntries.find(e => e.id === editingEntryId);
    if (currentEntry) {
        await dbPut(currentEntry);
    }

    renderEntries();
    renderCalendar();
    drawMoodChart();
    return true;
}

function closeEntryForm() {
    clearTimeout(autoSaveTimer);
    closeToolbarPanel(); // Гарантированно закрываем открытые панели инструментов
    document.getElementById('entry-modal').classList.add('hidden');
    editingEntryId = null;
    isEditing = false;
    document.body.style.overflow = ''; // Возвращаем скролл
}

// Универсальная левая кнопка: поведение зависит от состояния
async function handleSaveCloseBtn() {
    const modal = document.getElementById('entry-modal');

    if (modal.classList.contains('state-new-empty')) {
        closeEntryForm();
        return;
    }
    if (modal.classList.contains('state-new-filled')) {
        if (await handleSaveEntry()) closeEntryForm();
        return;
    }
    if (modal.classList.contains('state-view')) {
        closeEntryForm();
        return;
    }
    if (modal.classList.contains('state-edit')) {
        if (await handleSaveEntry()) closeEntryForm();
        return;
    }
}

// Клик по фону — всегда сохраняем изменения (защита от случайного закрытия)
document.querySelector('#entry-modal .modal-backdrop').onclick = async () => {
    const modal = document.getElementById('entry-modal');
    
    if (modal.classList.contains('state-new-filled') || modal.classList.contains('state-edit')) {
        if (await handleSaveEntry()) {
            closeEntryForm();
        }
        return;
    }
    
    closeEntryForm();
};

// Универсальная обработка нажатия на корзину
async function handleDeleteClick() {
    if (editingEntryId) {
        const confirmed = await showConfirm('Удалить эту запись?');
        if (!confirmed) return;

        const entryId = editingEntryId;
        closeEntryForm();
        
        // 1. Реальное удаление из IndexedDB
        await dbDelete(entryId);
        
        // 2. Удаление из массива в памяти
        diaryEntries = diaryEntries.filter(e => e.id !== entryId);
        
        // 3. Обновление интерфейса
        renderEntries();
        renderCalendar();
        drawMoodChart();
        showToast('Запись удалена', 'success');
    } else {
        closeEntryForm();
    }
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

    const sorted = sortEntriesForList(filtered);

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

        // Дата берем из date (дата создания), а не updatedAt
        const dateObj = new Date(entry.date);
        const dateStr = dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        const editedHtml = getEditedLabelHtml(entry);

        const tagsHtml = (entry.tags && entry.tags.length > 0) 
        ? `<div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">${entry.tags.map(t => `<span style="font-size:0.75em; background:var(--mood-btn-bg); padding:2px 8px; border-radius:10px; color:var(--accent-color);">${escapeHtml(t)}</span>`).join('')}</div>` 
        : '';

        const plainContent = getPlainTextFromHTML(entry.content);
        const previewText = plainContent.length > 120 ? plainContent.substring(0, 120) + '...' : plainContent;

        card.innerHTML = `
            <div class="entry-header">
                <span class="entry-date-line">
                    <span>${dateStr}</span>
                    ${editedHtml}
                </span>
                <span style="font-size:1.2em">${entry.mood}</span>
            </div>
            ${entry.title ? `<div class="entry-title">${escapeHtml(entry.title)}</div>` : ''}
            <div class="entry-text">${previewText ? escapeHtml(previewText) : '<span style="color:var(--text-muted); font-style:italic;">(Запись без текста)</span>'}</div>
            ${tagsHtml}
        `;

        // ... далее идет код с pressTimer и обработчиками кликов (оставь его без изменений) ...

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
    try {
        await saveAllToIndexedDB();
    } catch (error) {
        console.error('Не удалось сохранить в IndexedDB:', error);
        showToast('Ошибка сохранения данных — попробуйте ещё раз', 'error');
        return;   // НЕ рендерим, чтобы UI не показывал «сохранено», если это не так
    }
    
    // Обновляем интерфейс только если сохранение прошло успешно
    renderEntries();
    drawMoodChart();
    renderCalendar();
}

async function loadEntries() {
    const migrated = await migrateFromLocalStorage();
    if (migrated) {
        showToast('Данные перенесены в новое хранилище', 'success');
    }

    try {
        diaryEntries = await dbGetAll();
    } catch (error) {
        console.error('Ошибка загрузки из IndexedDB:', error);
        diaryEntries = [];
    }

    await migrateEntriesTags();
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
    if (!confirmed) return;

    try {
        // Точечное удаление всех выбранных записей из IndexedDB
        await Promise.all(selectedEntries.map(id => dbDelete(id)));
    } catch (err) {
        console.error('Ошибка массового удаления:', err);
        showToast('Не удалось удалить записи. Попробуйте ещё раз.', 'error');
        return; // не выходим из режима выбора — пользователь может повторить
    }

    // Удаление из массива в памяти
    diaryEntries = diaryEntries.filter(e => !selectedEntries.includes(e.id));

    // Обновление интерфейса
    renderEntries();
    renderCalendar();
    drawMoodChart();

    exitMultiDeleteMode();
    showToast(`Удалено: ${count}`, 'success');
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
    
    // Сбрасываем режим множественного выбора, если он был активен
    if (multiDeleteMode) exitMultiDeleteMode();
    
    // Сбрасываем остальные фильтры, чтобы поиск работал глобально
    activeTagFilter = null;
    activeDateFilter = null;
    activeMoodFilter = null;
    
    renderEntries();
});

// === ↕️ МЕНЮ СОРТИРОВКИ ===
document.getElementById('sidebar-sort-toggle').onclick = () => {
    document.getElementById('sort-options').classList.toggle('hidden');
    updateSortButtons();
};

document.querySelectorAll('.sort-option-btn').forEach(btn => {
    btn.onclick = () => {
        setSortMode(btn.dataset.sort);
        closeSidebar();
    };
});

// === 📂 БОКОВОЕ МЕНЮ ===
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

let sidebarTouchStartX = 0;
sidebar.addEventListener('touchstart', e => {
    sidebarTouchStartX = e.changedTouches[0].screenX;
}, { passive: true });

sidebar.addEventListener('touchend', e => {
    const swipeDistance = sidebarTouchStartX - e.changedTouches[0].screenX;
    if (swipeDistance > 50) {
        closeSidebar();
    }
}, { passive: true });

// === 🎨 ТЕМЫ ===
document.getElementById('sidebar-theme-toggle').onclick = () => {
    document.getElementById('theme-options').classList.toggle('hidden');
};

function applyTheme(themeName) {
    document.body.classList.remove('theme-dark', 'theme-pastel', 'theme-blue');
    if (themeName !== 'light') document.body.classList.add('theme-' + themeName);
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.getAttribute('data-theme') === themeName);
    });
    localStorage.setItem('my_web_diary_theme_v1', themeName);
    
    // Перерисовываем активный график, если модалка открыта
    if (!document.getElementById('chart-modal').classList.contains('hidden')) {
        if (currentChartMode === 'line') {
            drawMoodChart();
        } else {
            drawBarChart();
        }
    }
}

function loadTheme() {
    const savedTheme = localStorage.getItem('my_web_diary_theme_v1') || 'light';
    applyTheme(savedTheme);
}

document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.onclick = () => { 
        applyTheme(btn.getAttribute('data-theme'));
        // Перерисовываем график, если он открыт
        if (!document.getElementById('chart-modal').classList.contains('hidden')) {
            drawMoodChart();
        }
    };
});

// === 💾 СКАЧИВАНИЕ ===
function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getExportFileName(extension) {
    const today = new Date().toISOString().split('T')[0];
    return `my_diary_${today}.${extension}`;
}

// === 📦 ЭКСПОРТ / ИМПОРТ ===
document.getElementById('sidebar-export-import-toggle').onclick = () => {
    document.getElementById('export-import-options').classList.toggle('hidden');
};

document.getElementById('sidebar-export-btn').onclick = () => {
    if (diaryEntries.length === 0) return showToast('Нет записей для экспорта', 'error');
    const data = JSON.stringify({ version: '2.0', entries: diaryEntries }, null, 2);
    downloadFile(data, getExportFileName('json'), 'application/json');
    closeSidebar();
    showToast(`Экспортировано записей: ${diaryEntries.length}`, 'success');
};

function escapeMarkdownText(text) {
    if (!text) return '';
    return text.replace(/([\\`*_\[\]<>])/g, '\\$1');
}

function exportMarkdown() {
    if (diaryEntries.length === 0) {
        showToast('Нет записей для экспорта', 'error');
        return;
    }

    const sorted = [...diaryEntries].sort((a, b) => new Date(a.date) - new Date(b.date));

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

        lines.push(entry.content || '', '');

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
            data.entries.forEach(entry => {
                if (!existing.has(entry.id)) {
                    // Проверяем, что entry — это объект
                    if (!entry || typeof entry !== 'object') return;

                    // Проверяем обязательные поля
                    if (!entry.id || !entry.date || typeof entry.content !== 'string') {
                        console.warn('Пропущена битая запись при импорте:', entry);
                        return;
                    }

                    // Санитизируем контент
                    entry.content = DOMPurify.sanitize(entry.content, SANITIZE_CONFIG);

                    // Санитизируем теги: проверяем, что это массив строк, и экранируем каждую
                    if (Array.isArray(entry.tags)) {
                        entry.tags = entry.tags
                            .filter(t => typeof t === 'string')  // только строки
                            .map(t => t.substring(0, 50));        // ограничиваем длину
                    } else {
                        entry.tags = [];
                    }

                    diaryEntries.push(entry);
                    count++;
                }
            });
            saveAndRender();
            showToast(`Импортировано: ${count}`, 'success');
            closeSidebar();
        } catch { showToast('Ошибка файла', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
};

// === 🔔 НАПОМИНАНИЕ (кнопки) ===
document.getElementById('reminder-later-btn').onclick = closeReminder;
document.getElementById('reminder-write-btn').onclick = openNewEntryFromReminder;
document.querySelector('#reminder-modal .modal-backdrop').onclick = closeReminder;

// === 💬 ЦИТАТА ===
document.querySelector('.quote-section').onclick = nextQuote;

// === 📊 ГРАФИК (модалка) ===
let currentChartMode = 'line'; // 'line' | 'bar'
let currentBarPeriod = 'all';  // 'all' | 'month' | 'week'

function openChartModal() {
    closeSidebar();
    
    const isBar = currentChartMode === 'bar';
    document.getElementById('chart-mode-toggle').textContent = isBar ? '📉 Линейный график' : '📈 Гистограмма';
    
    document.getElementById('prev-month-chart').classList.toggle('hidden', isBar);
    document.getElementById('next-month-chart').classList.toggle('hidden', isBar);
    
    document.getElementById('mood-chart').classList.toggle('hidden', isBar);
    document.getElementById('bar-chart').classList.toggle('hidden', !isBar);
    
    // Стрелочка видна ТОЛЬКО на гистограмме
    document.getElementById('chart-period-toggle').classList.toggle('hidden', !isBar);
    
    document.getElementById('chart-period-selector').classList.add('hidden');
    
    if (isBar) {
        document.getElementById('chart-modal-title').textContent = 'Частота эмоций';
        document.getElementById('chart-average').textContent = 'Распределение';
    } else {
        updateChartModalTitle();
    }
    
    if (!document.querySelector('.period-option.active')) {
        document.querySelector('.period-option[data-period="all"]').classList.add('active');
    }
    
    document.getElementById('chart-modal').classList.remove('hidden');
    
    setTimeout(() => {
        if (isBar) drawBarChart();
        else drawMoodChart();
    }, 50);
}

function closeChartModal() {
    document.getElementById('chart-modal').classList.add('hidden');
    document.getElementById('chart-period-selector').classList.add('hidden');
}

function updateChartModalTitle() {
    const monthText = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1)
        .toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    document.getElementById('chart-modal-title').textContent = monthText;
}

function changeChartMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    updateChartModalTitle();
    if (currentChartMode === 'line') {
        drawMoodChart();
    } else {
        drawBarChart();
    }
}

// === ОБРАБОТЧИКИ СОБЫТИЙ ГРАФИКА ===

document.getElementById('chart-mode-toggle').onclick = (e) => {
    e.stopPropagation();
    
    if (currentChartMode === 'line') {
        currentChartMode = 'bar';
        e.target.textContent = '📉 Линейный график';
        
        document.getElementById('prev-month-chart').classList.add('hidden');
        document.getElementById('next-month-chart').classList.add('hidden');
        document.getElementById('chart-modal-title').textContent = 'Частота эмоций';
        document.getElementById('chart-average').textContent = 'Распределение';
        
        document.getElementById('mood-chart').classList.add('hidden');
        document.getElementById('bar-chart').classList.remove('hidden');
        document.getElementById('chart-period-toggle').classList.remove('hidden');
        
        drawBarChart();
    } else {
        currentChartMode = 'line';
        e.target.textContent = '📈 Гистограмма';
        
        document.getElementById('prev-month-chart').classList.remove('hidden');
        document.getElementById('next-month-chart').classList.remove('hidden');
        updateChartModalTitle();
        
        document.getElementById('mood-chart').classList.remove('hidden');
        document.getElementById('bar-chart').classList.add('hidden');
        document.getElementById('chart-period-toggle').classList.add('hidden');
        
        drawMoodChart();
    }
    
    document.getElementById('chart-period-selector').classList.add('hidden');
};

document.getElementById('chart-period-toggle').onclick = (e) => {
    e.stopPropagation();
    const selector = document.getElementById('chart-period-selector');
    selector.classList.toggle('hidden');
};

document.addEventListener('click', (e) => {
    const selector = document.getElementById('chart-period-selector');
    const toggleBtn = document.getElementById('chart-period-toggle');
    
    if (!selector.classList.contains('hidden') && 
        !selector.contains(e.target) && 
        e.target !== toggleBtn && 
        !toggleBtn.contains(e.target)) {
        selector.classList.add('hidden');
    }
});

document.querySelectorAll('.period-option').forEach(btn => {
    btn.onclick = (e) => {
        e.stopPropagation();
        currentBarPeriod = btn.dataset.period;
        
        document.querySelectorAll('.period-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        document.getElementById('chart-period-selector').classList.add('hidden');
        
        if (currentChartMode === 'bar') {
            drawBarChart();
        }
    };
});

// Привязка кнопок открытия/закрытия модалки
document.getElementById('sidebar-chart-btn').onclick = openChartModal;
document.getElementById('close-chart-modal').onclick = closeChartModal;
document.querySelector('#chart-modal .modal-backdrop').onclick = closeChartModal;
document.getElementById('prev-month-chart').onclick = () => changeChartMonth(-1);
document.getElementById('next-month-chart').onclick = () => changeChartMonth(1);

// === РИСОВАНИЕ ГИСТОГРАММЫ ===
function drawBarChart() {
    const canvas = document.getElementById('bar-chart');
    const chartModal = document.getElementById('chart-modal');
    
    if (!canvas || chartModal.classList.contains('hidden')) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    const width = rect.width;
    const height = 220;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const styles = getComputedStyle(document.body);
    const muted = styles.getPropertyValue('--text-muted').trim() || '#888';
    const grid = styles.getPropertyValue('--border-color').trim() || '#ddd';
    const textColor = styles.getPropertyValue('--text-color').trim() || '#333';

    let filteredEntries = diaryEntries;
    const now = new Date();
    
    if (currentBarPeriod === 'week') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);
        filteredEntries = diaryEntries.filter(e => new Date(e.date) >= sevenDaysAgo);
    } else if (currentBarPeriod === 'month') {
        const currentMonth = currentCalendarDate.getMonth();
        const currentYear = currentCalendarDate.getFullYear();
        filteredEntries = diaryEntries.filter(e => {
            const d = new Date(e.date);
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });
    }

    const counts = {};
    MOODS.forEach(m => counts[m.emoji] = 0);
    filteredEntries.forEach(e => {
        if (counts[e.mood] !== undefined) counts[e.mood]++;
    });

    const maxCount = Math.max(...Object.values(counts), 1);

    const left = 30, right = 10, top = 20, bottom = 30;
    const plotW = width - left - right;
    const plotH = height - top - bottom;

    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= 10; i++) {
        const y = top + plotH - (i / 10) * plotH;
        ctx.strokeStyle = grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(width - right, y);
        ctx.stroke();
        ctx.fillStyle = muted;
        ctx.fillText(i, left - 5, y);
    }

    const barSpacing = plotW / 10;
    const barWidth = Math.min(barSpacing * 0.6, 30);

    MOODS.forEach((m, index) => {
        const count = counts[m.emoji];
        const hue = (index / 9) * 120;
        const color = `hsl(${hue}, 70%, 50%)`;
        const x = left + (index * barSpacing) + (barSpacing - barWidth) / 2;
        
        const normalizedHeight = maxCount > 0 ? (count / maxCount) * 10 : 0;
        const barHeight = (normalizedHeight / 10) * plotH;
        const y = top + plotH - barHeight;

        if (count > 0) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
            ctx.fill();
            
            ctx.fillStyle = textColor;
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(count, x + barWidth / 2, y - 5);
        } else {
            ctx.fillStyle = grid;
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.roundRect(x, top + plotH - 2, barWidth, 2, [4, 4, 0, 0]);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }

        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = textColor;
        ctx.fillText(m.emoji, x + barWidth / 2, top + plotH + 8);
    });

    const totalEntries = filteredEntries.length;
    let periodLabel = 'За всё время';
    if (currentBarPeriod === 'week') periodLabel = 'За неделю';
    if (currentBarPeriod === 'month') periodLabel = 'За текущий месяц';
    
    document.getElementById('chart-summary').textContent = `${periodLabel} · Всего записей: ${totalEntries}`;
}

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
    const daysSinceFirst = Math.max(1, Math.floor((new Date() - firstEntryDate) / (1000 * 60 * 60 * 24)));
    const activityPercent = Math.round((daysWithEntries / daysSinceFirst) * 100);

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

// === 🔐 PIN-ОБРАБОТЧИКИ ===
document.querySelectorAll('.pin-key[data-key]').forEach(key => {
    key.addEventListener('click', () => handlePinKey(key.dataset.key));
});
document.querySelector('.pin-key-delete').addEventListener('click', handlePinDelete);
document.getElementById('pin-skip-btn').onclick = skipPinSetup;
// === 🔐 МЕНЮ PIN-КОДА ===
document.getElementById('sidebar-pin-toggle').onclick = () => {
    document.getElementById('pin-options').classList.toggle('hidden');
};

document.getElementById('sidebar-create-pin-btn').onclick = () => {
    closeSidebar();
    showPinModal('setup-new');
};

document.getElementById('sidebar-reset-pin-btn').onclick = resetPin;

// === 👉 СВАЙП ВПРАВО ДЛЯ ОТМЕНЫ ВЫБОРА ===
let cancelSwipeStartX = 0;
let cancelSwipeStartY = 0;
let isCancelSwiping = false;

document.addEventListener('touchstart', (e) => {
    if (!multiDeleteMode) return;
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

    if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 120) {
        isCancelSwiping = true;
    }
}, { passive: true });

document.addEventListener('touchend', () => {
    if (!multiDeleteMode) return;
    if (!isCancelSwiping) return;

    exitMultiDeleteMode();
    isCancelSwiping = false;
}, { passive: true });

// === 🪟 ОБРАБОТЧИКИ МОДАЛКИ ЗАПИСИ (ФИНАЛЬНЫЕ) ===

// FAB — новая запись
document.getElementById('fab-add').onclick = () => openEntryForm();

// === 🛠️ TOOLBAR (ПАНЕЛЬ ИНСТРУМЕНТОВ) ===
document.getElementById('toolbar-bg-btn').onclick = () => {
    openToolbarPanel('bg-panel');
};

document.getElementById('toolbar-emoji-btn').onclick = () => {
    // Если панель эмодзи уже открыта — закрываем, иначе открываем
    if (activeToolbarPanel === 'emoji-panel') {
        closeToolbarPanel();
    } else {
        openToolbarPanel('emoji-panel');
    }
};

document.getElementById('toolbar-tag-btn').onclick = () => {
    insertEmojiAtCursor('#');
};

document.getElementById('toolbar-templates-btn').onclick = openTemplatesModal;

document.getElementById('toolbar-text-btn').onclick = () => {
    if (activeToolbarPanel === 'text-panel') {
        closeToolbarPanel();
    } else {
        openToolbarPanel('text-panel');
    }
};

document.getElementById('toolbar-list-btn').onclick = () => {
    if (activeToolbarPanel === 'list-panel') {
        closeToolbarPanel();
    } else {
        openToolbarPanel('list-panel');
    }
};

document.getElementById('toolbar-table-btn').onclick = () => {
    if (activeToolbarPanel === 'table-panel') {
        closeToolbarPanel();
    } else {
        openToolbarPanel('table-panel');
    }
};

// === 🛑 ЗАКРЫТИЕ ПАНЕЛИ ИНСТРУМЕНТОВ ПРИ КЛИКЕ ВНЕ ЕЁ ===
// Если панель открыта, и мы кликаем в поле текста или заголовка — закрываем её
document.getElementById('entry-text').addEventListener('click', () => {
    if (activeToolbarPanel) {
        closeToolbarPanel();
    }
});

document.getElementById('entry-title').addEventListener('click', () => {
    if (activeToolbarPanel) {
        closeToolbarPanel();
    }
});



// === 😊 ПАНЕЛЬ ЭМОДЗИ В ТУЛБАРЕ ===
let currentEmojiPackId = 'standard';
let activeToolbarPanel = null;

function openToolbarPanel(panelId) {
    const panel = document.getElementById('toolbar-panel');
    
    // Скрываем все подпанели
    document.querySelectorAll('.toolbar-subpanel').forEach(p => p.classList.add('hidden'));
    
    // Показываем нужную
    const targetPanel = document.getElementById(panelId);
    if (targetPanel) {
        targetPanel.classList.remove('hidden');
        panel.classList.remove('hidden');
        activeToolbarPanel = panelId;
        
        // Подсвечиваем активную кнопку тулбара
        document.querySelectorAll('.toolbar-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`[onclick*="${panelId}"], #toolbar-${panelId.replace('-panel', '')}-btn`);
        if (activeBtn) activeBtn.classList.add('active');
        
        // Если это панель эмодзи — рендерим содержимое
        if (panelId === 'emoji-panel') {
            renderEmojiPacks();
            renderEmojiGrid(currentEmojiPackId);
        }
        if (panelId === 'bg-panel') {
            renderBgOptions();
        }
    }
}

function closeToolbarPanel() {
    const panel = document.getElementById('toolbar-panel');
    panel.classList.add('hidden');
    document.querySelectorAll('.toolbar-subpanel').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.toolbar-btn').forEach(btn => btn.classList.remove('active'));
    activeToolbarPanel = null;
}

// Универсальная функция вставки эмодзи (текст или картинка) в позицию курсора
function insertEmojiAtCursor(emojiData) {
    const editor = document.getElementById('entry-text');
    editor.focus();
    
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    let nodeToInsert;

    if (typeof emojiData === 'string') {
        const suffix = emojiData === '#' ? '' : ' ';
        nodeToInsert = document.createTextNode(emojiData + suffix);
        range.deleteContents();
        range.insertNode(nodeToInsert);
        range.setStartAfter(nodeToInsert);
        range.setEndAfter(nodeToInsert);
        selection.removeAllRanges();
        selection.addRange(range);

    } else if (emojiData.type === 'img') {
        nodeToInsert = document.createElement('img');
        nodeToInsert.src = emojiData.src;
        nodeToInsert.alt = emojiData.alt || 'emoji';
        nodeToInsert.className = 'inline-emoji';
        nodeToInsert.contentEditable = "false";
        
        const spacer = document.createTextNode('\u200B');

        range.deleteContents();
        range.insertNode(nodeToInsert);
        range.insertNode(spacer);

        range.setStartAfter(spacer);
        range.setEndAfter(spacer);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    onEntryFieldInput();
}


// === 🅰️ УПРАВЛЕНИЕ ПАНЕЛЬЮ ШРИФТА (ВСТРОЕННАЯ ПАНЕЛЬ) ===

// === 1. Генерация палитры цветов (Финальная, надежная версия) ===
let savedColorSelection = null; // Глобальная переменная — ДО if, чтобы touchstart её видел

const colorPalette = document.getElementById('color-palette');
if (colorPalette) {
    // ... внутри if: используем savedColorSelection без let
    const textColors = [
        // --- ТЁМНЫЕ ---
        '#000000', // чёрный
        '#800000', // бордовый
        '#800080', // пурпурный
        '#006400', // тёмно-зелёный
        '#000080', // тёмно-синий
        '#ff0000', // красный
        '#ff6600', // оранжевый
        '#b8860b', // тёмно-золотой
        '#9933ff', // фиолетовый
        '#008080', // бирюзовый
        '#0066ff', // синий
        // --- СВЕТЛЫЕ ---
        '#ffcc00', // жёлтый
        '#33cc33', // зелёный
        '#87ceeb', // светло-голубой
        '#ffff99', // светло-жёлтый
        '#ffb6c1', // светло-розовый
        '#cccccc', // серый
        '#ffffff'  // белый
    ];
    
    colorPalette.innerHTML = '';
    
    textColors.forEach(color => {
        const circle = document.createElement('div');
        circle.className = 'color-circle';
        circle.style.backgroundColor = color;
        circle.style.border = color === '#ffffff' ? '1px solid #ccc' : '2px solid transparent';
        circle.title = color;
        circle.style.cursor = 'pointer';

        // 1. Пассивно сохраняем выделение при касании (НЕ блокируем скролл!)
        circle.addEventListener('touchstart', () => {
            const selection = window.getSelection();
            const editor = document.getElementById('entry-text');
            if (selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
                savedColorSelection = selection.getRangeAt(0).cloneRange();
            }
        }, { passive: true });

        // 2. Для десктопа предотвращаем потерю фокуса при клике мышью
        circle.addEventListener('mousedown', (e) => e.preventDefault());

        // 3. Обработка клика/тапа
        circle.addEventListener('click', (e) => {
            e.preventDefault();
            
            const editor = document.getElementById('entry-text');
            const selection = window.getSelection();

            // 4. Если на мобильном выделение сбросилось, восстанавливаем его из памяти
            if (savedColorSelection && selection.toString().trim().length === 0) {
                selection.removeAllRanges();
                selection.addRange(savedColorSelection);
            }

            // 5. Проверяем наличие выделения
            const hasSelectionInEditor = 
                selection.rangeCount > 0 && 
                editor.contains(selection.anchorNode) && 
                selection.toString().trim().length > 0;

            if (!hasSelectionInEditor) {
                showToast('Сначала выделите текст, который хотите покрасить', 'info');
                return;
            }

            const range = selection.getRangeAt(0);

            // 6. НАДЕЖНАЯ РУЧНАЯ ОБЁРТКА (работает на 100% на всех мобильных устройствах)
            // Избегаем багов execCommand на iOS Safari
            const span = document.createElement('span');
            span.style.color = color;
            span.appendChild(range.extractContents()); // Перемещаем выделенный текст внутрь span
            range.insertNode(span); // Вставляем span обратно в документ

            // 7. Снимаем выделение и очищаем память
            selection.removeAllRanges();
            savedColorSelection = null;
            
            onEntryFieldInput(); // Триггерим автосохранение
        });

        colorPalette.appendChild(circle);
    });
}





// === ГЛОБАЛЬНОЕ ИЗМЕНЕНИЕ РАЗМЕРА ШРИФТА (ДЛЯ КНОПОК H1-H5) ===
function applyGlobalFontSize(sizeEm) {
    const editor = document.getElementById('entry-text');

    // 1. Сохраняем текущую позицию курсора (исправление от Дипсика)
    const selection = window.getSelection();
    let savedRange = null;
    if (selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
        savedRange = selection.getRangeAt(0).cloneRange();
    }

    // 2. Применяем глобальный размер к самому контейнеру
    editor.style.fontSize = sizeEm;

    // 3. Очищаем inline-размеры у всех дочерних элементов, 
    // чтобы они гарантированно наследовали новый глобальный размер.
    // Мы НЕ трогаем теги H1-H5 и НЕ удаляем их style (чтобы сохранить text-align!)
    const children = editor.querySelectorAll('*');
    children.forEach(child => {
        child.style.fontSize = '';
    });

    // 4. Восстанавливаем фокус и позицию курсора (исправление от Дипсика)
    editor.focus();
    if (savedRange) {
        selection.removeAllRanges();
        selection.addRange(savedRange);
    }

    onEntryFieldInput();
}

// Привязываем обработчики к кнопкам H1-H5
document.querySelectorAll('.heading-btn').forEach(btn => {
    btn.addEventListener('mousedown', (e) => e.preventDefault()); // Сохраняем фокус в редакторе
    
    btn.addEventListener('click', () => {
        const size = btn.dataset.size;
        if (size) {
            applyGlobalFontSize(size);
        }
    });
});

// === УМНЫЕ ПРЕСЕТЫ ШРИФТОВ (С УЧЕТОМ ВЫДЕЛЕНИЯ ИЛИ ВСЕЙ ЗАПИСИ) ===

function applyFontPreset(presetName) {
    const editor = document.getElementById('entry-text');
    editor.focus();
    
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    // Словарь строгих пресетов
    const presets = {
        'default': { family: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", weight: '400', style: 'normal' },
        'bold': { family: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", weight: '700', style: 'normal' },
        'italic': { family: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", weight: '400', style: 'italic' },
        'dancing': { family: "'Dancing Script', cursive", weight: '400', style: 'normal' },
        'pacifico': { family: "'Pacifico', cursive", weight: '400', style: 'normal' },
        'greatvibes': { family: "'Great Vibes', cursive", weight: '400', style: 'normal' }
    };

    const p = presets[presetName];
    if (!p) return;

    if (selection.isCollapsed) {
        // === ВАРИАНТ 1: Текст НЕ выделен. Применяем ко ВСЕЙ записи. ===
        
        // 1. Задаем стиль самому контейнеру (для будущего ввода, если запись пустая)
        editor.style.fontFamily = p.family;
        editor.style.fontWeight = p.weight;
        editor.style.fontStyle = p.style;

        // 2. Проходим по всем существующим элементам внутри записи и явно задаем им этот стиль.
        // Это гарантирует, что стиль сохранится в HTML и перебьет старые настройки.
        const children = editor.querySelectorAll('*');
        children.forEach(child => {
            child.style.fontFamily = p.family;
            child.style.fontWeight = p.weight;
            child.style.fontStyle = p.style;
        });
        
        // 3. Если редактор совершенно пустой, добавляем невидимый символ с этим стилем, 
        // чтобы при начале печати стиль сразу применился.
        if (children.length === 0) {
            const span = document.createElement('span');
            span.style.fontFamily = p.family;
            span.style.fontWeight = p.weight;
            span.style.fontStyle = p.style;
            span.innerHTML = '\u200B'; // Невидимый символ
            
            editor.appendChild(span);
            
            const newRange = document.createRange();
            newRange.setStart(span.firstChild, 0);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
        }

    } else {
        // === ВАРИАНТ 2: Текст ВЫДЕЛЕН. Применяем только к выделенному фрагменту. ===
        
        const range = selection.getRangeAt(0);
        const span = document.createElement('span');
        
        span.style.fontFamily = p.family;
        span.style.fontWeight = p.weight;
        span.style.fontStyle = p.style;
        span.style.textDecoration = 'none';
        span.style.color = ''; // Сбрасываем цвет, чтобы не было конфликтов

        const selectedText = range.toString();
        span.textContent = selectedText;
        
        range.deleteContents();
        range.insertNode(span);
        
        // Выделяем новый span, чтобы можно было сразу применить другой стиль поверх
        range.selectNode(span);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    onEntryFieldInput();
}

// Привязываем кнопки к новой функции
document.querySelectorAll('.font-style-btn').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Сохраняем фокус в редакторе
    });

    btn.addEventListener('click', () => {
        const preset = btn.dataset.preset;
        if (preset) {
            applyFontPreset(preset);
        }
    });
});


// === 📝 ЛОГИКА СПИСКОВ (ФИНАЛЬНАЯ, С ЗАЩИТОЙ ОТ МОБИЛЬНЫХ БАГОВ) ===
function applyListStyle(type) {
    const editor = document.getElementById('entry-text');
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    // Защита от заголовка
    if (!editor.contains(selection.anchorNode)) {
        // Курсор не в тексте (например, в заголовке) — перемещаем в конец #entry-text
        editor.focus();

        // Если редактор пуст — создаём <div> с \u200B
        if (!editor.firstChild || editor.textContent.replace(/\u200B/g, '').trim() === '') {
            editor.innerHTML = '<div>\u200B</div>';
        }

        const range = document.createRange();
        const lastBlock = editor.lastElementChild || editor;
        range.selectNodeContents(lastBlock);
        range.collapse(false);   // в конец
        selection.removeAllRanges();
        selection.addRange(range);
    }

    // Находим текущий блок, в котором стоит курсор
    let node = selection.anchorNode;
    while (node && node !== editor) {
        if (node.nodeType === 1 && ['DIV', 'P', 'LI', 'TD', 'TH'].includes(node.tagName)) {
            break;
        }
        node = node.parentNode;
    }

    // Защита: не применяем списки внутри таблиц
    if (node && node !== editor && node.closest('table')) {
        showToast('Списки нельзя применять внутри таблицы', 'info');
        return;
    }

    // Если курсор не в блоке — создаём блок (после нормализации в openEntryForm это редкость)
    // Если курсор не в блоке — оборачиваем текущую строку или создаём блок
    if (!node || node === editor) {
        const isEmpty = editor.textContent.replace(/\u200B/g, '').trim() === '';

        if (isEmpty) {
            // Пустой редактор — создаём <div> с \u200B и ставим курсор ВНУТРЬ
            const div = document.createElement('div');
            div.textContent = '\u200B';
            editor.innerHTML = '';
            editor.appendChild(div);
            node = div;

            const range = document.createRange();
            range.setStart(div.firstChild, 1);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            // Есть текст, но не в <div> — оборачиваем текущий текстовый узел
            const anchor = selection.anchorNode;
            if (anchor && anchor.nodeType === 3 && anchor.parentNode === editor) {
                const div = document.createElement('div');
                editor.insertBefore(div, anchor);
                div.appendChild(anchor);
                node = div;
            } else {
                // Фоллбэк
                node = document.createElement('div');
                node.textContent = '\u200B';
                editor.appendChild(node);
            }
        }
    }

    // Определяем «семейство» типа списка
    function getFamily(el) {
        if (!el || !el.classList) return null;
        if (el.classList.contains('checkbox-item')) return 'checkbox';
        if (el.classList.contains('number-item')) return 'number';
        const marker = el.getAttribute('data-marker');
        if (marker === '❤️') return 'heart';
        if (marker === '⭐') return 'asterisk';
        if (marker === '👌') return 'thumbs';
        if (marker === '●') return 'circle';
        return null;
    }

    // Собираем «локальный список» — подряд идущие .custom-list-item того же типа
    const currentFamily = getFamily(node);
    const siblings = [node];

    let prev = node.previousElementSibling;
    while (prev && prev.classList && prev.classList.contains('custom-list-item')) {
        if (getFamily(prev) !== currentFamily) break;
        siblings.push(prev);
        prev = prev.previousElementSibling;
    }

    let next = node.nextElementSibling;
    while (next && next.classList && next.classList.contains('custom-list-item')) {
        if (getFamily(next) !== currentFamily) break;
        siblings.push(next);
        next = next.nextElementSibling;
    }

    // Применяем новый тип ко всем найденным строкам
    siblings.forEach(item => {
        // === REMOVE — ДО очистки ===
        if (type === 'remove') {
            item.classList.remove('custom-list-item', 'checkbox-item', 'number-item', 'checked');
            item.removeAttribute('data-marker');
            item.style.listStyleType = '';
            item.style.paddingLeft = '';
            item.style.display = '';

            const oldCb = item.querySelector('.custom-checkbox-marker');
            if (oldCb) oldCb.remove();

            if (item.firstChild && item.firstChild.nodeType === 3) {
                item.firstChild.textContent = item.firstChild.textContent.replace(/^\u200B/, '');
            }
            return;
        }

        // 1. Очистка (для остальных типов)
        item.classList.remove('custom-list-item', 'checkbox-item', 'number-item', 'checked');
        item.removeAttribute('data-marker');
        item.style.listStyleType = '';
        item.style.paddingLeft = '';
        item.style.display = '';

        const oldCheckbox = item.querySelector('.custom-checkbox-marker');
        if (oldCheckbox) oldCheckbox.remove();

        // 2. Применяем новый тип
        item.classList.add('custom-list-item');

        if (type === 'checkbox') {
            item.classList.add('checkbox-item');
            const cb = document.createElement('span');
            cb.className = 'custom-checkbox-marker';
            cb.contentEditable = 'false';
            item.prepend(cb);
        } else if (type === 'number') {
            item.classList.add('number-item');
        } else {
            const markers = {
                'circle': '●',
                'asterisk': '⭐',
                'heart': '❤️',
                'thumbs': '👌'
            };
            item.setAttribute('data-marker', markers[type]);
        }

        // 3. Гарантируем \u200B в начале — чтобы курсор встал после ::before
        if (!item.firstChild || item.firstChild.nodeType !== 3 || !item.firstChild.textContent.startsWith('\u200B')) {
            item.insertBefore(document.createTextNode('\u200B'), item.firstChild);
        }
    });

    editor.focus();
    closeToolbarPanel();
    onEntryFieldInput();
}

// 2. Привязка кликов по кнопкам меню
document.querySelectorAll('.list-option-btn').forEach(btn => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
        applyListStyle(btn.dataset.type);
    });
});

// 3. ДЕЛЕГИРОВАННЫЙ обработчик для клика по чекбоксу
document.getElementById('entry-text').addEventListener('click', (e) => {
    const cb = e.target.closest('.custom-checkbox-marker');
    if (!cb) return;

    e.preventDefault();
    e.stopPropagation();

    cb.classList.toggle('checked');
    const item = cb.closest('.custom-list-item');
    if (item) {
        item.classList.toggle('checked');
    }
    onEntryFieldInput();
});

// 4. НАДЕЖНЫЙ ОБРАБОТЧИК ENTER ДЛЯ СПИСКОВ (с учётом Shift+Enter и чек-листов)
document.getElementById('entry-text').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;

    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const anchorNode = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    const item = anchorNode ? anchorNode.closest('.custom-list-item') : null;
    if (!item) return; // не в списке — обычный Enter

    // Проверяем, пустая ли текущая строка списка (только \u200B или чекбокс без текста)
    const textContent = item.textContent.replace(/\u200B/g, '').trim();
    const isEmptyItem = textContent === '';

    if (isEmptyItem) {
        // === ВЫХОД ИЗ СПИСКА ===
        e.preventDefault();

        // Убираем список с этой строки
        item.classList.remove('custom-list-item', 'checkbox-item', 'number-item', 'checked');
        item.removeAttribute('data-marker');
        item.style.listStyleType = '';
        item.style.paddingLeft = '';
        item.style.display = '';

        const cb = item.querySelector('.custom-checkbox-marker');
        if (cb) cb.remove();

        // Убираем \u200B в начале, ставим обычный текст
        item.innerHTML = '';

        // Ставим курсор внутрь
        const range = document.createRange();
        range.selectNodeContents(item);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);

        onEntryFieldInput();
        return;
    }

    // === ОБЫЧНЫЙ ENTER В СПИСКЕ ===
    e.preventDefault();

    const newItem = document.createElement('div');
    newItem.className = item.className;

    if (item.dataset.marker) {
        newItem.dataset.marker = item.dataset.marker;
    }

    if (item.classList.contains('checkbox-item')) {
        const cb = document.createElement('span');
        cb.className = 'custom-checkbox-marker';
        cb.contentEditable = 'false';
        newItem.appendChild(cb);
    }

    const textNode = document.createTextNode('\u200B');
    newItem.appendChild(textNode);

    item.after(newItem);

    const range = document.createRange();
    const last = newItem.lastChild;
    if (last && last.nodeType === 3) {
        range.setStart(last, 1);
    } else {
        range.selectNodeContents(newItem);
        range.collapse(false);
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    onEntryFieldInput();
});
// === Глобальное изменение межстрочного интервала ===
function changeLineHeight(multiplier) {
    const editor = document.getElementById('entry-text');
    editor.focus();
    
    // Получаем текущий интервал самого редактора, по умолчанию 1.6
    let currentLH = editor.style.lineHeight;
    let currentVal = currentLH ? parseFloat(currentLH) : 1.6;
    
    // Рассчитываем новое значение с плавным шагом и ограничениями (от 0.9 до 2.5)
    let newVal = Math.max(0.9, Math.min(2.5, currentVal + multiplier));
    
    // 1. Применяем интервал ко всему редактору глобально
    editor.style.lineHeight = newVal;
    
    // 2. Очищаем локальные интервалы у всех внутренних элементов (абзацев, заголовков),
    // чтобы они не перебивали глобальную настройку и текст был равномерным
    const children = editor.querySelectorAll('*');
    children.forEach(child => {
        child.style.lineHeight = '';
    });

    onEntryFieldInput();
}

// === Глобальное выравнивание текста (Явная установка стилей) ===
let currentHAlignState = 0; // 0: left, 1: center, 2: right, 3: justify
const hAlignBtn = document.getElementById('btn-h-align');

const alignIcons = [
    // 0: Лево
    '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="17" y1="18" x2="3" y2="18"></line></svg>',
    // 1: Центр
    '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="3" y2="6"></line><line x1="17" y1="10" x2="7" y2="10"></line><line x1="17" y1="14" x2="7" y2="14"></line><line x1="21" y1="18" x2="3" y2="18"></line></svg>',
    // 2: Право
    '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="10" x2="7" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="7" y2="18"></line></svg>',
    // 3: По ширине (Justify)
    '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="10" x2="3" y2="10"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="3" y2="18"></line></svg>'
];

const alignValues = ['left', 'center', 'right', 'justify'];

if (hAlignBtn) {
    hAlignBtn.addEventListener('mousedown', (e) => e.preventDefault());
    
    hAlignBtn.addEventListener('click', () => {
        const editor = document.getElementById('entry-text');

        currentHAlignState = (currentHAlignState + 1) % 4;
        const newAlign = alignValues[currentHAlignState];

        // Ставим выравнивание контейнеру
        editor.style.textAlign = newAlign;

        // Ставим выравнивание ВСЕМ блочным элементам, включая ячейки таблицы
        const children = editor.querySelectorAll('*');
        children.forEach(child => {
            const tag = child.tagName;
            if (['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'LI', 'TD', 'TH'].includes(tag)) {
                child.style.textAlign = newAlign;
            }
        });

        hAlignBtn.innerHTML = alignIcons[currentHAlignState];
        editor.focus();
        onEntryFieldInput();
    });
}

// === Обработчики кнопок интервала (исправленные, без дублирования) ===
const btnLineDecrease = document.getElementById('btn-line-decrease');
const btnLineIncrease = document.getElementById('btn-line-increase');

if (btnLineDecrease) {
    btnLineDecrease.addEventListener('mousedown', (e) => e.preventDefault());
    btnLineDecrease.addEventListener('click', () => changeLineHeight(-0.1)); // Шаг 0.1 для плавности
}

if (btnLineIncrease) {
    btnLineIncrease.addEventListener('mousedown', (e) => e.preventDefault());
    btnLineIncrease.addEventListener('click', () => changeLineHeight(0.1));
}

// === 🎨 РЕНДЕР ПАНЕЛИ ФОНОВ ===
let currentBgId = 'default';   // текущий выбранный фон

function renderBgOptions() {
    const grid = document.getElementById('bg-options-grid');
    if (!grid) return;
    grid.innerHTML = '';

    BACKGROUNDS.forEach(bg => {
        const btn = document.createElement('button');
        btn.className = 'bg-option-btn' + (bg.id === currentBgId ? ' selected' : '');
        btn.title = bg.name;
        btn.dataset.bgId = bg.id;

        // Внутренний превью-квадрат с тем же классом фона
        const preview = document.createElement('div');
        preview.className = 'bg-option-preview ' + bg.cssClass;

        // Название фона
        const name = document.createElement('span');
        name.className = 'bg-option-name';
        name.textContent = bg.name;

        btn.appendChild(preview);
        btn.appendChild(name);

        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('click', () => {
            applyBackgroundToEntry(bg.id);
            closeToolbarPanel();
        });

        grid.appendChild(btn);
    });
}

// Применить фон к #entry-text
function applyBackgroundToEntry(bgId) {
    const editor = document.getElementById('entry-form');
    const bg = BACKGROUNDS.find(b => b.id === bgId);
    if (!bg) return;

    // Убираем все старые классы фонов
    BACKGROUNDS.forEach(b => editor.classList.remove(b.cssClass));

    // Ставим новый (если не default — можно и default поставить, класс прозрачный)
    editor.classList.add(bg.cssClass);

    currentBgId = bgId;

    // Обновляем выделение в панели (если открыта)
    document.querySelectorAll('.bg-option-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.bgId === bgId);
    });

    onEntryFieldInput();
}

//EMODJI
function renderEmojiPacks() {
    const packsContainer = document.getElementById('emoji-packs');
    packsContainer.innerHTML = '';
    
    EMOJI_PACKS.forEach(pack => {
        const btn = document.createElement('button');
        btn.className = 'emoji-pack-btn';
        btn.textContent = pack.icon;
        btn.title = pack.name;
        btn.dataset.packId = pack.id;
        
        if (pack.id === currentEmojiPackId) {
            btn.classList.add('selected');
        }
        
        btn.onclick = () => {
            currentEmojiPackId = pack.id;
            renderEmojiPacks();
            renderEmojiGrid(pack.id);
        };
        
        packsContainer.appendChild(btn);
    });
}

function renderEmojiGrid(packId) {
    const grid = document.getElementById('emoji-grid');
    grid.innerHTML = '';
    
    const pack = EMOJI_PACKS.find(p => p.id === packId);
    if (!pack) return;
    
    pack.emojis.forEach(emojiData => {
        const btn = document.createElement('button');
        btn.className = 'emoji-item';
        btn.type = 'button';
        
        if (typeof emojiData === 'string') {
            btn.textContent = emojiData;
        } else if (emojiData.type === 'img') {
            const img = document.createElement('img');
            img.src = emojiData.src;
            img.alt = emojiData.alt;
            img.style.height = '1.5em';
            img.style.verticalAlign = 'middle';
            btn.appendChild(img);
        }
        
        btn.onclick = () => {
            insertEmojiAtCursor(emojiData);
            // НЕ закрываем панель — пользователь может выбрать ещё эмодзи
        };
        
        grid.appendChild(btn);
    });
}

// Обработчик закрытия панели по галочке
document.getElementById('close-toolbar-panel').onclick = closeToolbarPanel;

//--------------------------------------------------------------------------------//

// Левая кнопка (✕ / ✓ / ←) — вся логика в handleSaveCloseBtn
document.getElementById('save-close-btn').onclick = handleSaveCloseBtn;

// ✏️ — вход в редактирование существующей записи
document.getElementById('edit-mode-btn').onclick = enterEditMode;

// 🗑️ — удаление существующей записи
document.getElementById('header-delete-btn').onclick = handleDeleteClick;


// Смена настроения
document.getElementById('selected-mood-display').onclick = () => {
    const modal = document.getElementById('entry-modal');
    const editable = modal.classList.contains('state-edit') || modal.classList.contains('state-new-filled') || modal.classList.contains('state-new-empty');
    if (editable) openMoodModal();
};

// автосохранение
function onEntryFieldInput() {
    updateModalState();
    updateEditModeUI();
    scheduleAutoSave(); // Автосохранение вместо черновика
}
document.getElementById('entry-title').addEventListener('input', onEntryFieldInput);
document.getElementById('entry-text').addEventListener('input', onEntryFieldInput);



// Выбор даты
document.getElementById('entry-date-display').onclick = () => {
    const modal = document.getElementById('entry-modal');
    const editable = modal.classList.contains('state-edit') ||
                     modal.classList.contains('state-new-filled') ||
                     modal.classList.contains('state-new-empty');
    if (!editable) return;
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
    
    // ИСПРАВЛЕНО: используем getPlainTextFromHTML вместо .value
    const currentText = getPlainTextFromHTML(textInput.innerHTML);
    
    // Если в поле уже есть текст, добавляем шаблон с отступом
    let textToInsert;
    if (currentText.trim()) {
        textToInsert = '\n\n' + templateText;
    } else {
        textToInsert = templateText;
    }
    
    // Используем универсальную функцию вставки (работает с курсором)
    insertEmojiAtCursor(textToInsert);
    
    // Фокус и прокрутка вниз
    textInput.focus();
    textInput.scrollTop = textInput.scrollHeight;
    
    closeTemplatesModal();
    onEntryFieldInput();
}

document.getElementById('toolbar-templates-btn').onclick = openTemplatesModal;
document.getElementById('close-templates-modal').onclick = closeTemplatesModal;
document.querySelector('#templates-modal .modal-backdrop').onclick = closeTemplatesModal;

document.querySelectorAll('.template-item').forEach(btn => {
    btn.onclick = () => applyTemplate(btn.dataset.template);
});

// === 😊 МОДАЛКА НАСТРОЕНИЯ (закрытие) ===
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

// === 📱 КЛАВИАТУРА: Подъем модалки над виртуальной клавиатурой (iOS Fallback) ===
(function initKeyboardInset() {
    if (!window.visualViewport) return;

    const vv = window.visualViewport;

    function updateKeyboardInset() {
        // Вычисляем высоту клавиатуры
        const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        document.documentElement.style.setProperty('--keyboard-inset', inset + 'px');
    }

    vv.addEventListener('resize', updateKeyboardInset);
    vv.addEventListener('scroll', updateKeyboardInset);

    // Сброс при закрытии клавиатуры
    document.addEventListener('focusout', () => {
        setTimeout(updateKeyboardInset, 100);
    });

    updateKeyboardInset();
})();

// === 🛡️ ЗАЩИТА ОТ «УСТАРЕВШЕГО» ВЫДЕЛЕНИЯ ===
// Если пользователь коснулся экрана ВНЕ палитры цветов, сбрасываем сохраненное выделение
document.addEventListener('touchstart', (e) => {
    if (!e.target.closest('#color-palette')) {
        if (typeof savedColorSelection !== 'undefined') {
            savedColorSelection = null;
        }
    }
}, { passive: true });

// === АВТООТКРЫТИЕ ПАНЕЛИ ШРИФТА ПРИ ВЫДЕЛЕНИИ ===
document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    const editor = document.getElementById('entry-text');
    const modal = document.getElementById('entry-modal');

    // Проверяем, что модалка открыта и мы в режиме редактирования
    if (!modal || modal.classList.contains('hidden') || !isEditing) return;

    // Проверяем, что есть непустое выделение ВНУТРИ редактора
    const hasSelection = selection.rangeCount > 0 && 
                         !selection.isCollapsed && 
                         selection.toString().trim().length > 0 &&
                         editor.contains(selection.anchorNode);

    if (hasSelection) {
        // Если панель еще не открыта — открываем
        if (activeToolbarPanel !== 'text-panel') {
            openToolbarPanel('text-panel');
        }
    }
});


// === 🔗 АВТОССЫЛКИ ПРИ ВСТАВКЕ URL ===
document.getElementById('entry-text').addEventListener('paste', (e) => {
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    if (!pasted) return;

    // Проверяем, что вставили именно URL (http/https)
    const isUrl = /^https?:\/\/\S+$/i.test(pasted.trim());
    if (!isUrl) return; // обычный текст — пусть вставляется как есть

    e.preventDefault();

    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();

    // Создаём <a>
    const a = document.createElement('a');
    a.href = pasted.trim();
    a.textContent = pasted.trim();
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.color = 'var(--accent-color)';
    a.style.textDecoration = 'underline';

    range.insertNode(a);
    range.setStartAfter(a);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    onEntryFieldInput();
});

// === 📊 ВСТАВКА И УДАЛЕНИЕ ТАБЛИЦЫ ===

function insertTable(rows, cols) {
    const editor = document.getElementById('entry-text');
    editor.focus();
    
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    
    // Формируем HTML таблицы
    let tableHTML = '<div class="table-wrapper"><table>';
    for (let i = 0; i < rows; i++) {
        tableHTML += '<tr>';
        for (let j = 0; j < cols; j++) {
            const tag = i === 0 ? 'th' : 'td';
            // Важно: добавляем \u200B (невидимый символ), чтобы ячейка не считалась пустой
            tableHTML += `<${tag} contenteditable="true">\u200B</${tag}>`;
        }
        tableHTML += '</tr>';
    }
    tableHTML += '</table></div><div><br></div>';

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = tableHTML;

    const fragment = document.createDocumentFragment();
    while (tempDiv.firstChild) {
        fragment.appendChild(tempDiv.firstChild);
    }

    range.deleteContents();
    range.insertNode(fragment);

    // === ИСПРАВЛЕНИЕ ФОКУСА ===
    // Находим первую ячейку и ставим курсор ровно в неё
    const firstCell = editor.querySelector('th, td');
    if (firstCell) {
        const newRange = document.createRange();
        newRange.selectNodeContents(firstCell);
        newRange.collapse(false); // ставим в конец содержимого ячейки
        selection.removeAllRanges();
        selection.addRange(newRange);
    }

    closeToolbarPanel();
    onEntryFieldInput();
}

function removeTable() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const node = selection.anchorNode.nodeType === 1 
        ? selection.anchorNode 
        : selection.anchorNode.parentElement;
    
    const wrapper = node.closest('.table-wrapper');
    
    if (wrapper) {
        wrapper.remove();
        onEntryFieldInput();
        closeToolbarPanel();
        showToast('Таблица удалена', 'success');
    } else {
        showToast('Курсор не в таблице', 'info');
    }
}

// Привязываем обработчики к кнопкам выбора размера
document.querySelectorAll('.table-size-btn[data-rows]').forEach(btn => {
    btn.addEventListener('click', () => {
        const rows = parseInt(btn.dataset.rows, 10);
        const cols = parseInt(btn.dataset.cols, 10);
        insertTable(rows, cols);
    });
});

// Привязываем обработчик к кнопке удаления
document.getElementById('table-remove-btn')?.addEventListener('click', removeTable);

// === 🚀 ЗАПУСК ===
async function initApp() {
    try {
        await initDB();
        console.log('IndexedDB инициализирована');
    } catch (error) {
        console.error('Не удалось инициализировать IndexedDB:', error);
        showToast('Ошибка хранилища данных', 'error');
        return;
    }

    loadTheme();
    updateDailyQuote();
    updateSortButtons();
    await loadEntries();
    renderCalendar();
    initMoodFilterGrid();
    initPinProtection();
    checkReminder();
}


// === ЗАСТАВКА ===
window.addEventListener('load', () => {
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.classList.add('hidden');
            setTimeout(() => splash.remove(), 1000); // удаляем после исчезновения
        }
    }, 2000); // 1.5 секунды — показываем заставку
});

initApp();