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
let activeTriggerFilter = null;
let sortOrder = 'desc'; // 'desc' = сначала новые, 'asc' = сначала старые

let triggerChartPositions = [];
let cameFromDeepStats = false;
let activeFavoriteFilter = false;
let quickEntryMood = '😐';
let quickEntryTriggers = [];

let tempTriggers = [];

// === 🎯 ГРУППЫ ТРИГГЕРОВ (Daylio-style) ===
const TRIGGER_GROUPS = [
    { id: 'emotions', name: 'Эмоции', icon: '😊', triggers: [
        { name: 'счастье', icon: '😊' }, { name: 'спокойствие', icon: '😌' },
        { name: 'благодарность', icon: '🙏' }, { name: 'уверенность', icon: '💪' },
        { name: 'усталость', icon: '😴' }, { name: 'скука', icon: '🥱' },
        { name: 'волнение', icon: '😬' }, { name: 'грусть', icon: '😢' },
        { name: 'неуверенность', icon: '😕' }, { name: 'тревога', icon: '😰' },
        { name: 'стресс', icon: '😫' }, { name: 'злость', icon: '😠' },
        { name: 'отчаяние', icon: '😞' }
    ]},
    { id: 'sleep', name: 'Сон', icon: '🌙', triggers: [
        { name: 'хороший', icon: '😴' }, { name: 'средний', icon: '💤' }, { name: 'плохой', icon: '😵' }
    ]},
    { id: 'health', name: 'Здоровье', icon: '💪', triggers: [
        { name: 'спорт', icon: '🏃' }, { name: 'ходьба', icon: '🚶' },
        { name: 'здоровое питание', icon: '🥗' }, { name: 'медитация', icon: '🧘' }
    ]},
    { id: 'hobby', name: 'Хобби', icon: '🎨', triggers: [
        { name: 'кино', icon: '🎬' }, { name: 'чтение', icon: '📚' }, { name: 'игры', icon: '🎮' },
        { name: 'отдых', icon: '🏖️' }, { name: 'искусство', icon: '🎨' }
    ]},
    { id: 'food', name: 'Еда', icon: '🍽️', triggers: [
        { name: 'здоровая', icon: '🥗' }, { name: 'фастфуд', icon: '🍔' },
        { name: 'домашняя', icon: '🍲' }, { name: 'сладости', icon: '🍩' }, { name: 'вода', icon: '💧' }
    ]},
    { id: 'productivity', name: 'Производительность', icon: '⚡', triggers: [
        { name: 'начинать рано', icon: '⏰' }, { name: 'составить список', icon: '📝' },
        { name: 'сконцентрироваться', icon: '🎯' }, { name: 'рассеянность', icon: '🌀' }
    ]}
];
// Плоский список — для совместимости со старой быстрой модалкой
const AVAILABLE_TRIGGERS = TRIGGER_GROUPS.flatMap(g => g.triggers.map(t => `${t.icon} ${t.name}`));


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

function renderTriggers() {
    const grid = document.getElementById('triggers-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    AVAILABLE_TRIGGERS.forEach(trig => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'trigger-chip' + (tempTriggers.includes(trig) ? ' active' : '');
        chip.textContent = trig;
        
        chip.onclick = (e) => {
            e.preventDefault();
            if (tempTriggers.includes(trig)) {
                tempTriggers = tempTriggers.filter(t => t !== trig);
                chip.classList.remove('active');
            } else {
                tempTriggers.push(trig);
                chip.classList.add('active');
            }
            onEntryFieldInput(); // Автосохранение
        };
        grid.appendChild(chip);
    });
}

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

// === ⚡ PERF: индекс дней, планировщик рендеров, пагинация списка ===
let _dayIndex = null;            // Map<dateKey, Entry[]> — кэш группировки по дням
let _listDirty = false;          // список изменился, пока открыта модалка записи
const PAGE_SIZE = 40;            // карточек за одну догрузку
let _pageState = null;
let _entriesObserver = null;
const _pendingRenders = new Set();
let _renderRaf = 0;

function touchEntries() { _dayIndex = null; }

function getDayIndex() {
    if (_dayIndex) return _dayIndex;
    const map = new Map();
    for (let i = 0; i < diaryEntries.length; i++) {
        const e = diaryEntries[i];
        const k = getDateKey(e.date);
        let arr = map.get(k);
        if (!arr) { arr = []; map.set(k, arr); }
        arr.push(e);
    }
    map.forEach(arr => arr.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
    _dayIndex = map;
    return map;
}

// Все перерисовки коалесцируются в один кадр: 5 вызовов подряд = 1 рендер каждого типа
function scheduleRender(...names) {
    touchEntries();
    for (let i = 0; i < names.length; i++) _pendingRenders.add(names[i]);
    if (_renderRaf) return;
    _renderRaf = requestAnimationFrame(() => {
        _renderRaf = 0;
        const set = new Set(_pendingRenders);
        _pendingRenders.clear();
        if (set.has('list')) renderEntries();
        if (set.has('calendar')) renderCalendar();
        if (set.has('chart')) { if (currentChartMode === 'line') drawMoodChart(); else drawBarChart(); }
        if (set.has('deep')) renderDeepStats();
        if (set.has('progress')) updateProgressCard();
    });
}

function ensureEntriesObserver() {
    if (_entriesObserver) return;
    if ('IntersectionObserver' in window) {
        _entriesObserver = new IntersectionObserver(list => {
            if (list.some(x => x.isIntersecting)) renderNextPage();
        }, { rootMargin: '400px 0px' });
    } else {
        _entriesObserver = 'scroll';
        window.addEventListener('scroll', () => {
            const s = document.getElementById('entries-sentinel');
            if (s && s.getBoundingClientRect().top < window.innerHeight + 400) renderNextPage();
        }, { passive: true });
    }
}


// === 🎨 КОНФИГ ИКОНОК (SVG) ===
const NAV_ICONS = {
    // Иконка "Назад" (круглая стрелка)
    back: `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 8 8 12 12 16"></polyline><line x1="16" y1="12" x2="8" y2="12"></line></svg>`,
    // Иконка "Статистика" (уже есть, но используем её и для заголовка)
    stats: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="4" y="12" width="4" height="9" rx="1" ry="1"/><rect x="10" y="4" width="4" height="17" rx="1" ry="1"/><rect x="16" y="14" width="4" height="7" rx="1" ry="1"/></svg>`,

    // Новая иконка "Список/Глубокая статистика" (похожа на лупу, но можно использовать любую)
    deepStats: `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
    // Иконка смайлика для быстрой записи
    quickMood: `<svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>`,

    // Иконка огонька для прогресса
    flame: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>`,
    // Звездочка (контур)
    star: `<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,

    // Звездочка (закрашенная)
    starFilled: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#FFD700" stroke="#FFD700" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
    
    //Иконки для верхнего блока
        search: `<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
    // ==========================================
    // ИКОНКИ ДЛЯ НИЖНЕГО ТАБ-БАРА (bottom-nav)
    // ==========================================
    
    menu: `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`,

    entries: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>`,

    stats: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><rect x="4" y="12" width="4" height="9" rx="1" ry="1"/><rect x="10" y="4" width="4" height="17" rx="1" ry="1"/><rect x="16" y="14" width="4" height="7" rx="1" ry="1"/></svg>`,

    calendar: `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,

    plus: `<svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="4" x2="12" y2="20"></line><line x1="4" y1="12" x2="20" y2="12"></line></svg>`,

    // ==========================================
    // ИКОНКИ ДЛЯ БОКОВОГО МЕНЮ (sidebar)
    // ==========================================

    // Иконка "Сортировка" (стрелки вверх/вниз)
    sort: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 3L3 7h3v14h2V7h3L7 3zm10 18l4-4h-3V3h-2v14h-3l4 4z"/></svg>`,

    // Иконка "Тема" (палитра)
    theme: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.1 0 2-.9 2-2 0-.55-.2-1.02-.55-1.45-.36-.43-.45-.97-.45-1.55 0-1.1.9-2 2-2h2c2.76 0 5-2.24 5-5 0-4.41-5.03-8-10-8zm-5.5 11c-.83 0-1.5-.67-1.5-1.5S5.67 10 6.5 10 8 10.67 8 11.5 7.33 13 6.5 13zm3-4C8.67 9 8 8.33 8 7.5S8.67 6 9.5 6s1.5.67 1.5 1.5S10.33 9 9.5 9zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 6 14.5 6s1.5.67 1.5 1.5S15.33 9 14.5 9zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 10 17.5 10s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`,

    // Иконка "Настроение" (смайлик)
    mood: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>`,

    // Иконка "График настроений" (календарь со смайликом)
    chart: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-7 14c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm2-4.5c.28 0 .5-.22.5-.5s-.22-.5-.5-.5-.5.22-.5.5.22.5.5.5zm-4 0c.28 0 .5-.22.5-.5s-.22-.5-.5-.5-.5.22-.5.5.22.5.5.5zm2 2c-.83 0-1.5.67-1.5 1.5h3c0-.83-.67-1.5-1.5-1.5z"/></svg>`,

    // Иконка "Теги" (бирка)
    tags: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>`,

    // Иконка "Экспорт / Импорт" (стрелки туда-сюда)
    exportImport: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 4l-4 4h3v8h-3l4 4 4-4h-3V8h3l-4-4zM7 20l4-4H8V8h3L7 4 3 8h3v8H3l4 4z"/></svg>`,

    // Иконка "PIN-код" (замок)
    pin: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>`,
    // Корзина
    trash: `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
    nostalgia: `<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline><path d="M3.5 9 L3.5 4.5 L8 4.5"></path></svg>`,
        trophy: `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v6a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 5"/><path d="M17 6h3a3 3 0 0 1-3 5"/></svg>`,
};


const MOODS = [
    { emoji: '😭', svg: 'emojis/1.svg', score: 1 },
    { emoji: '😫', svg: 'emojis/2.svg', score: 2 },
    { emoji: '☹️', svg: 'emojis/3.svg', score: 3 },
    { emoji: '😕', svg: 'emojis/4.svg', score: 4 },
    { emoji: '😐', svg: 'emojis/5.svg', score: 5 },
    { emoji: '😏', svg: 'emojis/6.svg', score: 6 },
    { emoji: '😊', svg: 'emojis/7.svg', score: 7 },
    { emoji: '😄', svg: 'emojis/8.svg', score: 8 },
    { emoji: '😍', svg: 'emojis/9.svg', score: 9 },
    { emoji: '🥰', svg: 'emojis/10.svg', score: 10 }
];


// Предзагрузка SVG-эмодзи для графиков
const moodImages = {};
function preloadMoodImages() {
    MOODS.forEach(m => {
        if (!m.svg) return;
        const img = new Image();
        img.src = m.svg;
        img.onload = () => {
            moodImages[m.emoji] = img;
            // Перерисовываем график, если статистика открыта
            const statsModal = document.getElementById('stats-modal');
            if (statsModal && !statsModal.classList.contains('hidden')) {
                if (currentChartMode === 'line') drawMoodChart();
                else drawBarChart();
            }
        };
    });
}

// Хелпер для получения SVG-картинки по текстовому эмодзи
function getMoodSvg(emoji, size = 24) {
    const mood = MOODS.find(m => m.emoji === emoji);
    if (mood && mood.svg) {
        return `<img src="${mood.svg}" alt="${emoji}" style="width: ${size}px; height: ${size}px; object-fit: contain; vertical-align: middle;">`;
    }
    // Если картинки нет, возвращаем текст (фоллбэк)
    return emoji;
}

// Вспомогательная функция для получения класса цвета строки статистики
function getStatsMoodClass(score) {
    if (score <= 2) return 'stats-mood-1'; // Красный
    if (score <= 4) return 'stats-mood-2'; // Оранжевый
    if (score <= 6) return 'stats-mood-3'; // Голубой
    if (score <= 8) return 'stats-mood-4'; // Светло-зеленый
    return 'stats-mood-5'; // Темно-зеленый
}


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

function getEmojiByScore(score) {
    // score от 1 до 10
    const clamped = Math.max(1, Math.min(10, Math.round(score)));
    const found = MOODS.find(m => m.score === clamped);
    return found ? found.emoji : '😐';
}

// === 🧠 УМНЫЙ РАСЧЕТ НАСТРОЕНИЯ ЗА ДЕНЬ (С УЧЕТОМ ВРЕМЕНИ) ===
function calculateSmartDayScore(entriesOfDay) {
    if (!entriesOfDay || entriesOfDay.length === 0) return null;

    // 1. Если запись одна — просто возвращаем её балл
    if (entriesOfDay.length === 1) {
        return getMoodScore(entriesOfDay[0].mood);
    }

    // 2. Сортируем записи по времени создания (от утра к вечеру)
    // Используем createdAt, так как date может быть одинаковым (полдень)
    const sorted = [...entriesOfDay].sort((a, b) => a.createdAt - b.createdAt);

    // 3. Высчитываем "вес" для каждой записи
    let totalWeightedScore = 0;
    let totalWeight = 0;

    sorted.forEach((entry, index) => {
        const score = getMoodScore(entry.mood);
        if (score === null) return;

        let weight = 1.0;
        
        // Если это не первая запись, проверяем разницу с предыдущей
        if (index > 0) {
            const prevScore = getMoodScore(sorted[index - 1].mood);
            if (prevScore !== null) {
                const diff = Math.abs(score - prevScore);
                // Если разница больше 1 (например, 9 и 1), включаем взвешивание
                if (diff > 1) {
                    // Чем позже запись, тем больше её вес (до 1.5)
                    weight = 1.0 + (index * 0.2); 
                }
            }
        }

        totalWeightedScore += score * weight;
        totalWeight += weight;
    });

    if (totalWeight === 0) return null;
    return totalWeightedScore / totalWeight;
}

// === 📊 ДВУХСТУПЕНЧАТОЕ СРЕДНЕЕ ЗА ПЕРИОД (сначала день, потом период) ===
function getPeriodStats(startMs, endMs) {
    let entriesCount = 0;
    const dayScores = [];
    getDayIndex().forEach((arr, key) => {
        const t = new Date(key + 'T12:00:00').getTime();
        if (t < startMs || t > endMs) return;
        entriesCount += arr.length;
        const s = calculateSmartDayScore(arr);
        if (s !== null) dayScores.push(s);
    });
    if (!dayScores.length) return { avg: null, days: 0, entries: 0 };
    return {
        avg: dayScores.reduce((a, b) => a + b, 0) / dayScores.length,
        days: dayScores.length,
        entries: entriesCount
    };
}
//---//

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
    if (dateKey === getDateKey(today)) return I18N.t('common.today');
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateKey === getDateKey(yesterday)) return I18N.t('common.yesterday');
    return I18N.fmtDate(date, { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatEditedDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const editedKey = getDateKey(date);
    if (editedKey === getDateKey(new Date())) return I18N.t('date.todayShort');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (editedKey === getDateKey(yesterday)) return I18N.t('date.yesterdayShort');
    return I18N.fmtDate(date, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function getEditedLabelHtml(entry) {
    if (!entry.editedAt) return '';
    return `<span class="entry-edited">${I18N.t('entries.edited', { date: formatEditedDate(entry.editedAt) })}</span>`;
}

// === ↕️ СОРТИРОВКА И ДАТЫ ===
function getEntryCreatedTime(entry) {
    return Number(entry.createdAt) 
        || Number(entry.updatedAt) 
        || new Date(entry.date).getTime() 
        || Number(entry.id) 
        || 0;
}

function getEntryUpdatedTime(entry) {
    return Number(entry.updatedAt) 
        || Number(entry.createdAt) 
        || new Date(entry.date).getTime() 
        || Number(entry.id) 
        || 0;
}

function sortEntriesForList(entries) {
    const sorted = [...entries];

    // Сначала сортируем по выбранному режиму (создание или изменение)
    if (activeSortMode === 'updated') {
        sorted.sort((a, b) => getEntryUpdatedTime(b) - getEntryUpdatedTime(a));
    } else {
        // По умолчанию — по дате создания
        sorted.sort((a, b) => getEntryCreatedTime(b) - getEntryCreatedTime(a));
    }


    return sorted;
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

    const labels = { created: 'sort.toastCreated', updated: 'sort.toastUpdated' };
    showToast(I18N.t(labels[mode] || 'sort.changed'), 'info');
}

// Миграция тегов — теперь в IndexedDB, а не в localStorage
async function migrateEntriesTags() {
    let needsSave = false;
    diaryEntries.forEach(entry => {
        // Добавляем теги, если их нет
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
    pinInputBuffer = '';
    const subtitle = document.getElementById('pin-subtitle');
    subtitle.classList.remove('error');
    subtitle.textContent = '';
    updatePinDots();
    if (mode === 'enter') pinSetupStage = null;
    else if (mode === 'setup-new') pinSetupStage = 'enter-new';
    else if (mode === 'setup-confirm') pinSetupStage = 'confirm-new';
    refreshPinTexts();
    document.getElementById('pin-skip-btn').classList.toggle('hidden', pinSetupStage !== 'enter-new');
    modal.classList.remove('hidden');
}

function refreshPinTexts() {
    const title = document.getElementById('pin-title');
    const sub = document.getElementById('pin-subtitle');
    if (pinSetupStage === 'enter-new') {
        title.textContent = I18N.t('pin.setup');
        if (!sub.classList.contains('error')) sub.textContent = I18N.t('pin.setupSub');
    } else if (pinSetupStage === 'confirm-new') {
        title.textContent = I18N.t('pin.confirm');
        if (!sub.classList.contains('error')) sub.textContent = I18N.t('pin.confirmSub');
    } else {
        title.textContent = I18N.t('pin.enter');
    }
}

function handlePinDelete() {
    if (pinInputBuffer.length === 0) return;
    pinInputBuffer = pinInputBuffer.slice(0, -1);
    updatePinDots();
    const subtitle = document.getElementById('pin-subtitle');
    subtitle.classList.remove('error');
    subtitle.textContent = pinSetupStage === 'enter-new' ? I18N.t('pin.setupSub')
        : pinSetupStage === 'confirm-new' ? I18N.t('pin.confirmSub') : '';
}

async function verifyPinInput() {
    const savedPin = localStorage.getItem(PIN_KEY);
    const subtitle = document.getElementById('pin-subtitle');
    if (pinSetupStage === 'enter-new') {
        pinSetupTemp = pinInputBuffer;
        showPinModal('setup-confirm');
    } else if (pinSetupStage === 'confirm-new') {
        if (pinInputBuffer === pinSetupTemp) {
            localStorage.setItem(PIN_KEY, await hashPin(pinSetupTemp));
            pinSetupTemp = ''; pinSetupStage = null; isPinUnlocked = true;
            document.getElementById('pin-modal').classList.add('hidden');
            updatePinMenuVisibility();
            showToast(I18N.t('pin.set'), 'success');
        } else {
            subtitle.classList.add('error');
            subtitle.textContent = I18N.t('pin.mismatch');
            shakePinModal();
            pinInputBuffer = ''; pinSetupTemp = '';
            updatePinDots();
            setTimeout(() => {
                subtitle.classList.remove('error');
                pinSetupStage = 'enter-new';
                refreshPinTexts();
            }, 1500);
        }
    } else {
        const inputHash = await hashPin(pinInputBuffer);
        if (inputHash === savedPin || pinInputBuffer === savedPin) {
            if (pinInputBuffer === savedPin) localStorage.setItem(PIN_KEY, inputHash);
            isPinUnlocked = true;
            document.getElementById('pin-modal').classList.add('hidden');
        } else {
            subtitle.classList.add('error');
            subtitle.textContent = I18N.t('pin.wrong');
            shakePinModal();
            pinInputBuffer = '';
            updatePinDots();
            setTimeout(() => { subtitle.classList.remove('error'); subtitle.textContent = ''; }, 1500);
        }
    }
}

async function resetPin() {
    closeSidebar();
    if (await showConfirm(I18N.t('pin.resetConfirm'))) {
        localStorage.removeItem(PIN_KEY);
        updatePinMenuVisibility();
        showToast(I18N.t('pin.reset'), 'success');
    }
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



function skipPinSetup() {
    pinInputBuffer = '';
    isPinUnlocked = true;
    document.getElementById('pin-modal').classList.add('hidden');
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



// === 😊 ВЫБОР НАСТРОЕНИЯ ===
function openMoodModal(isNewEntry = false, isQuick = false) {
    const grid = document.getElementById('mood-grid');
    grid.innerHTML = '';
    
    MOODS.forEach(m => {
        const btn = document.createElement('div');
        
        // Определяем цветовой класс
        let colorClass = '';
        if (m.score <= 2) colorClass = 'mood-level-1';      // Красный
        else if (m.score <= 4) colorClass = 'mood-level-2'; // Оранжевый
        else if (m.score <= 6) colorClass = 'mood-level-3'; // Голубой
        else if (m.score <= 8) colorClass = 'mood-level-4'; // Светло-зеленый
        else colorClass = 'mood-level-5';                   // Темно-зеленый
        
        btn.className = `mood-option ${colorClass}`;
        
        // Вставляем SVG-картинку
        btn.innerHTML = `<img src="${m.svg}" alt="${m.emoji}" style="width: 100%; height: 100%; object-fit: contain; pointer-events: none;">`;
        
        btn.onclick = () => {
            if (isNewEntry) {
                selectMoodForEntry(m.emoji);
                closeMoodModal();
                
                // Если это БЫСТРАЯ запись — открываем модалку триггеров
                if (isQuick) {
                    quickEntryMood = m.emoji;
                    quickEntryTriggers = [];
                    openQuickEntryModal();
                } else {
                    // Обычная запись: сначала выбор триггеров
                    startTriggersFlow(m.emoji);
                }
            } else {
                selectMoodForEntry(m.emoji);
            }
        };
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
    
    // Обновляем отображение в шапке модалки записи (если она открыта)
    const moodDisplay = document.getElementById('selected-mood-display');
    if (moodDisplay) moodDisplay.innerHTML = getMoodSvg(tempMood, 32);
}

// === ⚡ БЫСТРАЯ ЗАПИСЬ ===

function openQuickEntryModal() {
    const modal = document.getElementById('quick-entry-modal');
    modal.classList.remove('hidden');
    renderQuickTriggers();
}

function closeQuickEntryModal() {
    document.getElementById('quick-entry-modal').classList.add('hidden');
}

function renderQuickTriggers() {
    const grid = document.getElementById('quick-triggers-grid');
    if (!grid) return;
    grid.innerHTML = '';

    AVAILABLE_TRIGGERS.forEach(trig => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'trigger-chip' + (quickEntryTriggers.includes(trig) ? ' active' : '');
        chip.textContent = trig;

        chip.onclick = (e) => {
            e.preventDefault();
            if (quickEntryTriggers.includes(trig)) {
                quickEntryTriggers = quickEntryTriggers.filter(t => t !== trig);
                chip.classList.remove('active');
            } else {
                quickEntryTriggers.push(trig);
                chip.classList.add('active');
            }
        };
        grid.appendChild(chip);
    });
}

async function saveQuickEntry() {
    const now = Date.now();
    const dateDisplay = document.getElementById('entry-date-display');
    // Берем сегодняшнюю дату (или дату из основной формы, если она открыта)
    const dateKey = dateDisplay.dataset.date || getDateKey(new Date());
    const finalDate = new Date(dateKey + 'T12:00:00').toISOString();

    const newEntry = {
        id: now.toString(),
        date: finalDate,
        createdAt: now,
        updatedAt: now,
        editedAt: null,
        title: '',
        content: '',
        mood: quickEntryMood,
        wordCount: 0,
        tags: [],
        fontSize: '',
        lineHeight: '',
        fontFamily: '',
        fontWeight: '',
        fontStyle: '',
        background: 'default',
        triggers: [...quickEntryTriggers],
        favorite: false,
        isQuickEntry: true // <-- Помечаем, что это быстрая запись
    };

    diaryEntries.unshift(newEntry);
    try {
        await dbPut(newEntry);
    } catch (err) {
        console.error('Ошибка сохранения быстрой записи:', err);
        showToast(I18N.t('toast.saveFailedShort'), 'error');
        return;
    }

    closeQuickEntryModal();
    scheduleRender('list', 'calendar', 'chart', 'progress');
    showToast(I18N.t('toast.moodSaved'), 'success');
}

// Обработчики кнопок быстрой модалки
document.getElementById('quick-entry-cancel-btn').onclick = closeQuickEntryModal;
document.getElementById('quick-entry-save-btn').onclick = saveQuickEntry;
document.querySelector('#quick-entry-modal .modal-backdrop').onclick = closeQuickEntryModal;

// === 💾 АВТОСОХРАНЕНИЕ ЗАПИСИ ===
let autoSaveTimer = null;
let cancelDeleteId = null; // id записи, созданной автосейвом в этом сеансе

/**
 * Собирает объект записи из текущего состояния формы.
 * Возвращает null, если запись пустая (нет title, текста и картинок).
 */
function buildEntryFromForm(existingEntry = null) {
    const title = document.getElementById('entry-title').value.trim();
    const editor = document.getElementById('entry-text');
    const htmlContent = editor.innerHTML.replace(/\u200B/g, '').trim();

    // Чистим пустые <div>, не трогая таблицы
    const temp = document.createElement('div');
    temp.innerHTML = htmlContent;
    temp.querySelectorAll('div').forEach(div => {
        if (div.closest('table') || div.querySelector('table')) return;
        if (div.textContent.replace(/\u200B/g, '').trim() === '' && !div.querySelector('img')) {
            div.remove();
        }
    });
    const cleanedHtml = temp.innerHTML;

    const plainText = getPlainTextFromHTML(cleanedHtml);
    const hasImage = editor.querySelector('img.inline-emoji') !== null;


    

    const dateDisplay = document.getElementById('entry-date-display');
    const dateInput = dateDisplay.dataset.date;
    const finalDate = new Date(dateInput + 'T12:00:00').toISOString();
    const tags = extractTags(cleanedHtml);
    const wordCount = plainText.split(/\s+/).filter(w => w.length > 0).length;
    const now = Date.now();

    const base = {
        title,
        content: cleanedHtml,
        mood: tempMood,
        wordCount,
        tags,
        fontSize:   editor.style.fontSize   || '',
        lineHeight: editor.style.lineHeight || '',
        fontFamily: editor.style.fontFamily || '',
        fontWeight: editor.style.fontWeight || '',
        fontStyle:  editor.style.fontStyle  || '',
        background: currentBgId,
        triggers:   [...tempTriggers],
        favorite: existingEntry ? (existingEntry.favorite || false) : false,
    };

    if (existingEntry) {
        // Обновление: date НЕ меняется, createdAt — не перезаписываем (но гарантируем, что он есть)
        return {
            ...existingEntry,
            ...base,
            createdAt: existingEntry.createdAt || now,
            updatedAt: now,
            editedAt: now,
        };
    }

    // Новая запись
    return {
        ...base,
        id: now.toString(),
        date: finalDate,
        createdAt: now,
        updatedAt: now,
        editedAt: null,
    };
}

async function saveCurrentEntry() {
    const existing = editingEntryId
        ? diaryEntries.find(e => e.id === editingEntryId)
        : null;

    const entry = buildEntryFromForm(existing);
    if (!entry) return; // пусто — ничего не делаем

    if (existing) {
        const idx = diaryEntries.findIndex(e => e.id === existing.id);
        if (idx !== -1) diaryEntries[idx] = entry;
    } else {
        diaryEntries.unshift(entry);
        editingEntryId = entry.id;
        cancelDeleteId = entry.id;
    }

    try {
        await dbPut(entry);
    } catch (err) {
        console.error('Ошибка автосохранения:', err);
        return;
    }

    scheduleRender('list', 'calendar', 'chart', 'progress');
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
function updateEditModeUI() {
    const modal = document.getElementById('entry-modal');
    const titleInput = document.getElementById('entry-title');
    const textInput = document.getElementById('entry-text');
    const headerDeleteBtn = document.getElementById('header-delete-btn');
    const editModeBtn = document.getElementById('edit-mode-btn');
    const footer = document.getElementById('entry-footer');

    if (isEditing) {
        modal.classList.add('is-editing');
        titleInput.removeAttribute('readonly');
        textInput.setAttribute('contenteditable', 'true');
        if (editModeBtn) editModeBtn.classList.add('hidden');
        if (headerDeleteBtn) headerDeleteBtn.classList.remove('hidden');
    } else {
        modal.classList.remove('is-editing');
        titleInput.setAttribute('readonly', true);
        textInput.setAttribute('contenteditable', 'false');
        if (editModeBtn) editModeBtn.classList.remove('hidden');
        if (headerDeleteBtn) headerDeleteBtn.classList.remove('hidden');
    }

    // Футер виден только в просмотре, тулбар — только в редактировании
    if (footer) footer.classList.toggle('hidden', isEditing);
    if (!isEditing) updateEntryNav();

    const toolbar = document.getElementById('entry-toolbar');
    if (toolbar) toolbar.classList.toggle('hidden', !isEditing);
}

function openEntryForm(entry = null, initialMood = null, initialTriggers = null) {
    cancelDeleteId = null;
    const dateDisplay = document.getElementById('entry-date-display');
    const dateText = document.getElementById('entry-date-text');
    const moodDisplay = document.getElementById('selected-mood-display');
    const titleInput = document.getElementById('entry-title');
    const saveCloseBtn = document.getElementById('save-close-btn');
    const editor = document.getElementById('entry-text');

    // === Сессия редактирования: снапшот для отмены крестиком ===
    entrySessionOriginal = entry ? JSON.parse(JSON.stringify(entry)) : null;
    entrySessionIsNew = !entry;
    entrySessionTouched = false;

    if (entry) {
        editingEntryId = entry.id;
        tempMood = entry.mood || '😐';
        tempTriggers = Array.isArray(entry.triggers) ? [...entry.triggers] : [];
        titleInput.value = entry.title || '';
        editor.innerHTML = entry.content || '';
        editor.style.fontSize   = entry.fontSize   || '';
        editor.style.lineHeight = entry.lineHeight || '';
        editor.style.fontFamily = entry.fontFamily || '';
        editor.style.fontWeight = entry.fontWeight || '';
        editor.style.fontStyle  = entry.fontStyle  || '';
        setEntryBackground(entry.background || 'default');
        const entryDateKey = getDateKey(entry.date);
        dateDisplay.dataset.date = entryDateKey;
        dateText.textContent = formatPrettyDate(entryDateKey);
        isEditing = false;
        saveCloseBtn.title = I18N.t('common.close');
    } else {
        editingEntryId = null;
        titleInput.value = '';
        editor.innerHTML = '';
        editor.style.fontSize = '';
        editor.style.lineHeight = '';
        editor.style.fontFamily = '';
        editor.style.fontWeight = '';
        editor.style.fontStyle = '';
        setEntryBackground('default');
        tempMood = initialMood || '😐';
        tempTriggers = initialTriggers ? [...initialTriggers] : [];
        const todayKey = getDateKey(new Date());
        dateDisplay.dataset.date = todayKey;
        dateText.textContent = formatPrettyDate(todayKey);
        isEditing = true;
        saveCloseBtn.title = I18N.t('editor.cancelBack');
    }

    moodDisplay.innerHTML = getMoodSvg(tempMood, 32);
    updateModalState();
    updateEditModeUI();

    const modal = document.getElementById('entry-modal');
    const starSlot = document.getElementById('icon-star-slot');
    const favBtn = document.getElementById('header-favorite-btn');
    if (starSlot && favBtn) {
        const isFav = entry ? (entry.favorite || false) : false;
        starSlot.innerHTML = isFav ? NAV_ICONS.starFilled : NAV_ICONS.star;
        favBtn.style.opacity = isFav ? '1' : '0.6';
    }

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.getElementById('bottomNav').classList.add('nav-hidden');

    if (isEditing && !entry) {
        setTimeout(() => titleInput.focus(), 100);
    }
}


// Вход в редактирование существующей записи (по клику на ✏️)
function enterEditMode() {
    if (!editingEntryId) return;

    // Новый снапшот отсчёта: отмена вернёт к последнему сохранённому состоянию
    const sessionCurrent = diaryEntries.find(e => e.id === editingEntryId);
    entrySessionOriginal = sessionCurrent ? JSON.parse(JSON.stringify(sessionCurrent)) : null;
    entrySessionIsNew = false;
    entrySessionTouched = false;

    isEditing = true;
    updateModalState();
    updateEditModeUI();

    const editor = document.getElementById('entry-text');
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    editor.scrollTop = editor.scrollHeight;
}

async function handleSaveEntry() {
    clearTimeout(autoSaveTimer);

    const existing = editingEntryId
        ? diaryEntries.find(e => e.id === editingEntryId)
        : null;

    const entry = buildEntryFromForm(existing);

    // === Пустая запись ===
    if (!entry) {
        if (existing) {
            // Существующая, но очищенная — удаляем без подтверждения
            const entryId = existing.id;
            closeEntryForm();
            await dbDelete(entryId);
            diaryEntries = diaryEntries.filter(e => e.id !== entryId);
            scheduleRender('list', 'calendar', 'chart');
            showToast(I18N.t('toast.emptyDeleted'), 'info');
        } else {
            closeEntryForm();
        }
        return false;
    }

    // === Сохранение ===
    if (existing) {
        const idx = diaryEntries.findIndex(e => e.id === existing.id);
        if (idx !== -1) diaryEntries[idx] = entry;
        showToast(I18N.t('toast.entryUpdated'), 'success');
    } else {
        diaryEntries.unshift(entry);
        editingEntryId = entry.id;
        showToast(I18N.t('toast.entrySaved'), 'success');
    }

    isEditing = false;
    updateModalState();
    updateEditModeUI();

    try {
        await dbPut(entry);
        cancelDeleteId = null;
    } catch (err) {
        console.error('Ошибка сохранения:', err);
        showToast(I18N.t('toast.saveEntryFailed'), 'error');
        return false;
    }

    scheduleRender('list', 'calendar', 'chart', 'progress');
    return true;
}

function closeEntryForm() {
    clearTimeout(autoSaveTimer);
    closeToolbarPanel();
    document.getElementById('entry-modal').classList.add('hidden');
    editingEntryId = null;
    isEditing = false;
    document.body.style.overflow = '';

    // Показываем нижний таб-бар обратно
    document.getElementById('bottomNav').classList.remove('nav-hidden');
    cancelDeleteId = null;
    if (_listDirty) renderEntries(true); // дорисовываем то, что пропустили во время редактирования
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
        const confirmed = await showConfirm(I18N.t('confirm.deleteEntry'))
        if (!confirmed) return;

        const entryId = editingEntryId;
        closeEntryForm();
        
        // 1. Реальное удаление из IndexedDB
        await dbDelete(entryId);
        
        // 2. Удаление из массива в памяти
        diaryEntries = diaryEntries.filter(e => e.id !== entryId);
        
        // 3. Обновление интерфейса
        scheduleRender('list', 'calendar', 'chart', 'progress');
        showToast(I18N.t('toast.entryDeleted'), 'success');
    } else {
        closeEntryForm();
    }
}



// === 📊 ГРАФИК НАСТРОЕНИЯ (без разрывов + градиентная заливка) ===
function drawMoodChart() {
    const canvas = document.getElementById('mood-chart');
    if (!canvas) return;

    // Guard: рисуем только если статистика открыта
    const statsModal = document.getElementById('stats-modal');
    if (statsModal && statsModal.classList.contains('hidden')) return;

    // Не рисуем, если секция графика скрыта (в глубокой статистике)
    const section = document.getElementById('stats-chart-section');
    if (section && section.classList.contains('hidden')) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    const width = rect.width;
    const height = rect.height || 220;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const styles = getComputedStyle(document.body);
    const muted = styles.getPropertyValue('--text-muted').trim() || '#888';
    const grid = styles.getPropertyValue('--border-color').trim() || '#ddd';
    const surface = styles.getPropertyValue('--surface').trim() || '#ffffff';

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const left = 34, right = 12, top = 16, bottom = 30;
    const plotW = width - left - right;
    const plotH = height - top - bottom;

    const MIN_SCORE = 1, MAX_SCORE = 10;
    const xForDay = day => left + ((day - 1) / Math.max(1, daysInMonth - 1)) * plotW;
    const yForScore = score => top + ((MAX_SCORE - score) / (MAX_SCORE - MIN_SCORE)) * plotH;
    const baseline = top + plotH;

    // Сетка + эмодзи на оси Y
    [1, 4, 7, 10].forEach(score => {
        const y = yForScore(score);
        ctx.strokeStyle = grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - right, y); ctx.stroke();
        const img = moodImages[getEmojiByScore(score)];
        if (img) ctx.drawImage(img, 4, y - 8, 16, 16);
        else { ctx.fillStyle = muted; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(String(score), 6, y); }
    });

    // Подписи дней
    ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = muted;
    const step = plotW < 260 ? 7 : 5;
    for (let day = 1; day <= daysInMonth; day += step) {
        ctx.fillText(String(day), xForDay(day), height - bottom + 8);
    }

    // Данные по дням (умный балл за день)
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const days = {};
    getDayIndex().forEach((arr, key) => {
        if (key.startsWith(prefix)) days[+key.slice(8)] = arr;
    });
    const data = Object.entries(days)
        .map(([day, entries]) => ({ day: +day, score: calculateSmartDayScore(entries) }))
        .filter(p => p.score !== null)
        .sort((a, b) => a.day - b.day);
    const totalEntries = Object.values(days).reduce((s, arr) => s + arr.length, 0);

    if (data.length === 0) {
        ctx.fillStyle = muted; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(I18N.t('chart.emptyMonth'), width / 2, top + plotH / 2);
        document.getElementById('chart-average').textContent = '—';
        document.getElementById('chart-summary').textContent = I18N.t('chart.summaryEmpty');
        return;
    }

    // === 1. ГРАДИЕНТНАЯ ЗАЛИВКА ПОД ЛИНИЕЙ (трапеции) ===
    if (data.length >= 2) {
        ctx.save();
        ctx.globalAlpha = 0.16;
        for (let i = 1; i < data.length; i++) {
            const p = data[i - 1], c = data[i];
            const x1 = xForDay(p.day), y1 = yForScore(p.score);
            const x2 = xForDay(c.day), y2 = yForScore(c.score);
            const grad = ctx.createLinearGradient(x1, 0, x2, 0);
            grad.addColorStop(0, getMoodColorHex(p.score));
            grad.addColorStop(1, getMoodColorHex(c.score));
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineTo(x2, baseline);
            ctx.lineTo(x1, baseline);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    // === 2. ЛИНИЯ БЕЗ РАЗРЫВОВ (градиент на каждом сегменте) ===
    if (data.length >= 2) {
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 1; i < data.length; i++) {
            const p = data[i - 1], c = data[i];
            const x1 = xForDay(p.day), y1 = yForScore(p.score);
            const x2 = xForDay(c.day), y2 = yForScore(c.score);
            const grad = ctx.createLinearGradient(x1, y1, x2, y2);
            grad.addColorStop(0, getMoodColorHex(p.score));
            grad.addColorStop(1, getMoodColorHex(c.score));
            ctx.strokeStyle = grad;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
    }

    // === 3. ТОЧКИ, ОКРАШЕННЫЕ ПО НАСТРОЕНИЮ ДНЯ ===
    data.forEach(item => {
        const x = xForDay(item.day), y = yForScore(item.score);
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = getMoodColorHex(item.score);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = surface;
        ctx.stroke();
    });

    // === 4. ПОДПИСИ ===
    const average = data.reduce((s, p) => s + p.score, 0) / data.length;
    document.getElementById('chart-average').innerHTML = I18N.t('chart.average', { v: average.toFixed(1) }) + ' ' + getMoodSvg(getEmojiByScore(average), 18);
    document.getElementById('chart-summary').textContent = I18N.t('chart.summary', { entries: totalEntries, days: data.length });
}

// === 📋 СПИСОК ЗАПИСЕЙ ===
function getFilteredSorted() {
    let filtered = diaryEntries;
    if (activeFavoriteFilter) filtered = filtered.filter(e => e.favorite === true);
    if (activeDateFilter) filtered = filtered.filter(e => getDateKey(e.date) === activeDateFilter);
    if (activeTagFilter) filtered = filtered.filter(e => e.tags && e.tags.includes(activeTagFilter));
    if (activeMoodFilter) filtered = filtered.filter(e => e.mood === activeMoodFilter);
    if (activeTriggerFilter) filtered = filtered.filter(e => e.triggers && e.triggers.includes(activeTriggerFilter));
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(e =>
            (e.content && e.content.toLowerCase().includes(q)) ||
            (e.title && e.title.toLowerCase().includes(q))
        );
    }
    return sortEntriesForList(filtered);
}

function renderEntries(force = false) {
    touchEntries();
    // список под модалкой не виден — не тратим время, дорисуем при закрытии
    const modal = document.getElementById('entry-modal');
    if (!force && modal && !modal.classList.contains('hidden')) { _listDirty = true; return; }
    _listDirty = false;

    const list = document.getElementById('entries-list');
    list.innerHTML = '';
    _pageState = null;

    const hasAnyFilter = !!(activeTagFilter || activeDateFilter || activeMoodFilter || activeTriggerFilter || searchQuery);
    appMain.classList.toggle('search-active', hasAnyFilter);

    const clearTitle = escapeHtml(I18N.t('common.showAll'));
    let bannerHtml = '';
    if (activeDateFilter) {
        const pretty = I18N.fmtDate(new Date(activeDateFilter + 'T12:00:00'), { day: 'numeric', month: 'long', year: 'numeric' });
        bannerHtml = `<span>📅 <strong>${escapeHtml(pretty)}</strong></span><button class="clear-filter-btn" id="clear-date-filter" title="${clearTitle}">✕</button>`;
    } else if (activeTagFilter) {
        bannerHtml = `<span>${I18N.t('filter.tag')} <strong>${escapeHtml(activeTagFilter)}</strong></span><button class="clear-filter-btn" id="clear-tag-filter" title="${clearTitle}">✕</button>`;
    } else if (activeMoodFilter) {
        bannerHtml = `<span>${I18N.t('filter.mood')} <strong style="font-size:1.2em">${activeMoodFilter}</strong></span><button class="clear-filter-btn" id="clear-mood-filter" title="${clearTitle}">✕</button>`;
    } else if (activeTriggerFilter) {
        bannerHtml = `<span>${I18N.t('filter.trigger')} <strong>${escapeHtml(I18N.triggerLabel(activeTriggerFilter))}</strong></span><button class="clear-filter-btn" id="clear-trigger-filter" title="${clearTitle}">✕</button>`;
    }
    if (bannerHtml) {
        const banner = document.createElement('div');
        banner.className = 'active-filter-banner';
        banner.innerHTML = bannerHtml;
        list.appendChild(banner);
    }

    const sorted = getFilteredSorted();
    if (!sorted.length) {
        const empty = document.createElement('p');
        empty.style.cssText = 'text-align:center; color:var(--text-muted); margin-top:40px;';
        let msg = I18N.t('entries.empty');
        if (activeDateFilter) msg = I18N.t('entries.emptyDay');
        else if (activeTagFilter) msg = I18N.t('entries.emptyTag', { tag: activeTagFilter });
        else if (activeMoodFilter) msg = I18N.t('entries.emptyMood', { mood: activeMoodFilter });
        else if (activeTriggerFilter) msg = I18N.t('entries.emptyTrigger', { trigger: I18N.triggerLabel(activeTriggerFilter) });
        else if (searchQuery) msg = I18N.t('entries.emptySearch');
        empty.textContent = msg;
        list.appendChild(empty);
        return;
    }

    const groups = new Map();
    sorted.forEach(e => {
        const k = getDateKey(e.date);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(e);
    });
    const keys = [...groups.keys()].sort((a, b) =>
        sortOrder === 'asc' ? new Date(a) - new Date(b) : new Date(b) - new Date(a));

    _pageState = { groups, keys, keyIdx: 0, list };
    renderNextPage();
}

function buildEntryCard(entry) {
    const card = document.createElement('div');
    card.className = 'entry-card';
    card.dataset.entryId = entry.id;

    const score = getMoodScore(entry.mood);
    let level = 0;
    if (score !== null) {
        level = score <= 2 ? 1 : score <= 4 ? 2 : score <= 6 ? 3 : score <= 8 ? 4 : 5;
        card.classList.add('entry-mood-level-' + level);
    }
    if (multiDeleteMode && selectedEntries.includes(entry.id)) card.classList.add('selected');

    const timeStr = I18N.fmtTime(new Date(entry.createdAt), { hour: '2-digit', minute: '2-digit' });
    const editedHtml = getEditedLabelHtml(entry);
    const tagsHtml = (entry.tags && entry.tags.length)
        ? `<div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">${entry.tags.map(t => `<span style="font-size:0.75em; background:var(--mood-btn-bg); padding:2px 8px; border-radius:10px; color:var(--accent-ink, var(--accent-color));">${escapeHtml(t)}</span>`).join('')}</div>`
        : '';
    const triggersHtml = (entry.triggers && entry.triggers.length)
        ? `<div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">${entry.triggers.map(t => `<span class="entry-trigger-chip ${level ? 'trigger-level-' + level : ''}">${escapeHtml(I18N.triggerLabel(t))}</span>`).join('')}</div>`
        : '';
    const plain = getPlainTextFromHTML(entry.content).replace(/#[a-zA-Zа-яА-ЯёЁ0-9_]+/g, '').trim();
    const preview = plain.length > 120 ? plain.substring(0, 120) + '...' : plain;

    card.innerHTML = `
        <div class="entry-header">
            <span class="entry-date-line">
                <span>${timeStr}</span>
                ${editedHtml}
            </span>
            <span style="display:flex; align-items:center; gap:8px;">
                ${entry.favorite ? NAV_ICONS.starFilled.replace('width="22" height="22"', 'width="16" height="16"') : ''}
                ${getMoodSvg(entry.mood, 20)}
            </span>
        </div>
        ${entry.title ? `<div class="entry-title">${escapeHtml(entry.title)}</div>` : ''}
        <div class="entry-text">${preview ? escapeHtml(preview) : `<span style="color:var(--text-muted); font-style:italic;">${I18N.t('entries.noText')}</span>`}</div>
        ${triggersHtml}
        ${tagsHtml}
    `;
    return card;
}

function buildDayGroup(dateKey, entries) {
    const wrap = document.createElement('div');
    wrap.className = 'entries-date-group';
    const header = document.createElement('div');
    header.className = 'entries-date-header';
    const todayKey = getDateKey(new Date());
    const y = new Date(); y.setDate(y.getDate() - 1);
    header.textContent = dateKey === todayKey ? I18N.t('common.today')
        : dateKey === getDateKey(y) ? I18N.t('common.yesterday')
        : I18N.fmtDate(new Date(dateKey + 'T12:00:00'), { day: 'numeric', month: 'long', year: 'numeric' });
    wrap.appendChild(header);
    for (let i = 0; i < entries.length; i++) wrap.appendChild(buildEntryCard(entries[i]));
    return wrap;
}

function renderNextPage() {
    if (!_pageState) return;
    const { groups, keys, list } = _pageState;
    const oldSent = list.querySelector('#entries-sentinel');
    if (oldSent) {
        if (_entriesObserver && _entriesObserver !== 'scroll') _entriesObserver.unobserve(oldSent);
        oldSent.remove();
    }
    const frag = document.createDocumentFragment();
    let added = 0;
    while (_pageState.keyIdx < keys.length && added < PAGE_SIZE) {
        const key = keys[_pageState.keyIdx];
        const arr = groups.get(key);
        frag.appendChild(buildDayGroup(key, arr));
        added += arr.length;
        _pageState.keyIdx++;
    }
    list.appendChild(frag);
    if (_pageState.keyIdx < keys.length) {
        const sent = document.createElement('div');
        sent.id = 'entries-sentinel';
        sent.style.height = '1px';
        list.appendChild(sent);
        ensureEntriesObserver();
        if (_entriesObserver && _entriesObserver !== 'scroll') _entriesObserver.observe(sent);
    }
}

async function saveAndRender() {
    touchEntries();
    try {
        await saveAllToIndexedDB();
    } catch (error) {
        console.error('Не удалось сохранить в IndexedDB:', error);
        showToast(I18N.t('toast.saveFailed'), 'error');
        return;   // НЕ рендерим, чтобы UI не показывал «сохранено», если это не так
    }
    
    // Обновляем интерфейс только если сохранение прошло успешно
    renderEntries();
    drawMoodChart();
    renderCalendar();
    checkAchievements();
}

async function loadEntries() {
    const migrated = await migrateFromLocalStorage();
    if (migrated) {
        showToast(I18N.t('toast.migrated'), 'success');
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
    
    // Показываем плавающую панель
    document.getElementById('multi-delete-panel').classList.remove('hidden');
    
    updateDeleteButton();

    const firstCard = document.querySelector(`[data-entry-id="${firstEntryId}"]`);
    if (firstCard) firstCard.classList.add('selected');
}

function exitMultiDeleteMode() {
    multiDeleteMode = false;
    document.body.classList.remove('multi-delete-active');
    selectedEntries = [];
    
    // Скрываем панель
    document.getElementById('multi-delete-panel').classList.add('hidden');
    
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
    
    // Если сняли выделение со всех — выходим
    if (selectedEntries.length === 0) exitMultiDeleteMode();
}

function updateDeleteButton() {
    const countText = document.getElementById('delete-count-text');
    const iconSlot = document.getElementById('delete-icon-slot');
    if (selectedEntries.length > 0) {
        countText.textContent = I18N.t('delete.button', { n: selectedEntries.length });
        iconSlot.innerHTML = NAV_ICONS.trash;
    }
}

async function deleteSelectedEntries() {
    if (selectedEntries.length === 0) return;
    const count = selectedEntries.length;
    const confirmed = await showConfirm(I18N.t('confirm.deleteMany', { count: I18N.plural(count, 'unit.entry') }));
    if (!confirmed) return;

    try {
        await Promise.all(selectedEntries.map(id => dbDelete(id)));
    } catch (err) {
        console.error('Ошибка массового удаления:', err);
        showToast(I18N.t('toast.deleteFailed'), 'error');
        return;
    }

    diaryEntries = diaryEntries.filter(e => !selectedEntries.includes(e.id));
    scheduleRender('list', 'calendar', 'chart', 'progress');
    exitMultiDeleteMode();
    showToast(I18N.t('toast.deleted', { n: count }), 'success');
}

// === 📅 КАЛЕНДАРЬ ===
function renderCalendar() {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const monthText = I18N.fmtDate(new Date(year, month, 1), { month: 'long', year: 'numeric' });

    const labelModal = document.getElementById('calendar-month-label');
    const labelDesktop = document.getElementById('calendar-month-label-desktop');
    if (labelModal) labelModal.textContent = monthText;
    if (labelDesktop) labelDesktop.textContent = monthText;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    const todayKey = getDateKey(new Date());
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const index = getDayIndex();

    // десктопную сетку не строим на мобильном и наоборот
    const isDesktop = window.matchMedia('(min-width: 769px)').matches;
    const targets = isDesktop ? ['calendar-grid', 'calendar-grid-desktop'] : ['calendar-grid'];

    targets.forEach(gridId => {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        const frag = document.createDocumentFragment();
        for (let i = 0; i < offset; i++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day empty';
            frag.appendChild(cell);
        }
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${prefix}-${String(day).padStart(2, '0')}`;
            const dayEntries = index.get(dateStr);
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'calendar-day';
            cell.dataset.date = dateStr;
            if (dayEntries && dayEntries.length) {
                const smartAvg = calculateSmartDayScore(dayEntries);
                const avgScore = smartAvg !== null ? smartAvg : 5;
                cell.innerHTML = getMoodSvg(getEmojiByScore(avgScore), 24);
                const level = avgScore <= 2 ? 1 : avgScore <= 4 ? 2 : avgScore <= 6 ? 3 : avgScore <= 8 ? 4 : 5;
                cell.classList.add('has-entry', 'mood-level-' + level);
                cell.title = I18N.t('calendar.cellTitle', { n: dayEntries.length });
            } else {
                cell.textContent = day;
                cell.classList.add('no-entry');
            }
            if (dateStr === todayKey) cell.classList.add('today');
            frag.appendChild(cell);
        }
        grid.innerHTML = '';
        grid.appendChild(frag);
    });

    renderMonthInsights();
}

// один делегированный клик на обе сетки календаря
['calendar-grid', 'calendar-grid-desktop'].forEach(id => {
    const g = document.getElementById(id);
    if (!g) return;
    g.addEventListener('click', (e) => {
        const cell = e.target.closest('.calendar-day[data-date]');
        if (cell) handleDayClick(cell.dataset.date);
    });
});

// перерисовка при переходе через брейкпоинт (мобайл ↔ десктоп)
(function () {
    const mq = window.matchMedia('(min-width: 769px)');
    const onChange = () => renderCalendar();
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
})();

function handleDayClick(dateStr) {
    if (datePickerCallback) {
        const callback = datePickerCallback;
        datePickerCallback = null;
        document.querySelector('.calendar-modal-content').classList.remove('selecting-date');
        closeCalendarScreen();
        callback(dateStr);
    } else {
        applyDateFilter(dateStr);
        setActiveNav('nav-entries-btn');
    }
}

function applyDateFilter(dateKey) {
    activeDateFilter = dateKey;
    activeTagFilter = null;
    activeMoodFilter = null;
    searchQuery = '';
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    if (multiDeleteMode) exitMultiDeleteMode();
    closeCalendarScreen();
    appMain.classList.add('search-active');
    renderEntries();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const prettyDate = I18N.fmtDate(new Date(dateKey + 'T12:00:00'), { day: 'numeric', month: 'long', year: 'numeric' });
    showToast(I18N.t('toast.entriesForDate', { date: prettyDate }), 'info');
    cameFromDeepStats = false;
    document.getElementById('back-to-stats-btn').classList.add('hidden');
}

function clearDateFilter() { activeDateFilter = null; renderEntries(); }

function openCalendarScreen() {
    closeChartModal();
    closeStatsModal();
    closeSidebar();
    datePickerCallback = null;
    renderCalendar();
    document.getElementById('calendar-modal').classList.remove('hidden');
    
    // Сброс скролла внутри модалки
    setTimeout(() => {
        const modalContent = document.querySelector('#calendar-modal .modal-content');
        if (modalContent) modalContent.scrollTop = 0;
        const calendarBody = document.querySelector('#calendar-modal .calendar-modal-content');
        if (calendarBody) calendarBody.scrollTop = 0;
    }, 50);
    updateBodyScrollLock();
}

function openDatePicker(callback) {
    datePickerCallback = callback;
    renderCalendar();
    document.getElementById('calendar-modal').classList.remove('hidden');
    document.querySelector('.calendar-modal-content').classList.add('selecting-date');
}

function closeCalendarScreen() { 
    document.getElementById('calendar-modal').classList.add('hidden'); 
    updateBodyScrollLock();
}

function changeCalendarMonth(delta) {
    const grid = document.getElementById('calendar-grid');
    grid.classList.remove('slide-left', 'slide-right');
    void grid.offsetWidth;
    grid.classList.add(delta > 0 ? 'slide-left' : 'slide-right');
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    renderCalendar();
    drawMoodChart();
}



// === 🔍 ПОИСК ===
const searchBtn = document.getElementById('search-btn');
const searchBar = document.getElementById('search-bar');
const searchInput = document.getElementById('search-input');
const headerTitle = document.getElementById('header-title');
const closeSearchBtn = document.getElementById('close-search-btn');


if (searchBtn) {
    searchBtn.onclick = () => {
        if (multiDeleteMode) { deleteSelectedEntries(); return; }
        const header = document.querySelector('.top-header');
        if (header) { header.classList.add('search-open'); header.classList.remove('header-hidden'); }
        if (headerTitle) headerTitle.classList.add('hidden');
        searchBtn.classList.add('hidden');
        if (searchBar) searchBar.classList.remove('hidden');
        if (searchInput) setTimeout(() => searchInput.focus(), 50);
    };
}

if (closeSearchBtn) {
    closeSearchBtn.onclick = () => {
        const header = document.querySelector('.top-header');
        if (header) header.classList.remove('search-open');
        if (searchBar) searchBar.classList.add('hidden');
        if (headerTitle) headerTitle.classList.remove('hidden');
        if (searchBtn) searchBtn.classList.remove('hidden');
        if (searchInput) searchInput.value = '';
        searchQuery = '';
        activeTagFilter = null;
        activeDateFilter = null;
        activeMoodFilter = null;
        activeTriggerFilter = null;
        renderEntries();
    };
}

let _searchTimer = 0;
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        if (multiDeleteMode) exitMultiDeleteMode();
        activeTagFilter = null;
        activeDateFilter = null;
        activeMoodFilter = null;
        activeTriggerFilter = null;
        cameFromDeepStats = false;
        const backBtn = document.getElementById('back-to-stats-btn');
        if (backBtn) backBtn.classList.add('hidden');
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(() => renderEntries(), 180);
    });
}



// Обработчик отмены выделения (новая плавающая панель)
const cancelMultiDeleteBtn = document.getElementById('cancel-multi-delete-btn');
if (cancelMultiDeleteBtn) {
    cancelMultiDeleteBtn.onclick = exitMultiDeleteMode;
}

// Обработчик кнопки удаления (новая плавающая панель)
const deleteSelectedBtn = document.getElementById('delete-selected-btn');
if (deleteSelectedBtn) {
    deleteSelectedBtn.onclick = deleteSelectedEntries;
}




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
    const prevTheme = localStorage.getItem('my_web_diary_theme_prev_v1');
    if (prevTheme === null || prevTheme !== themeName) localStorage.setItem('ds_theme_changed_v1', '1');
    localStorage.setItem('my_web_diary_theme_prev_v1', themeName);
    syncThemeColor();
    
    // Перерисовываем статистику, если она открыта
    const statsModal = document.getElementById('stats-modal');
    if (statsModal && !statsModal.classList.contains('hidden')) {
        if (currentStatsMode === 'deep') {
            // Глубокая статистика
            renderDeepStats();
        } else {
            // Обычная статистика — перерисовываем график (если он виден)
            const chartSection = document.getElementById('stats-chart-section');
            if (chartSection && !chartSection.classList.contains('hidden')) {
                if (currentChartMode === 'line') drawMoodChart();
                else drawBarChart();
            }
        }
    }
    syncThemeColor();
    // Проверяем достижение "Разноцветная жизнь" сразу после смены темы
    checkAchievements();
}

function loadTheme() {
    const savedTheme = localStorage.getItem('my_web_diary_theme_v1') || 'light';
    applyTheme(savedTheme);
}

document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.onclick = () => { 
        applyTheme(btn.getAttribute('data-theme'));
        // Перерисовываем график, если он открыт
        if (!document.getElementById('stats-modal').classList.contains('hidden')) {
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
    if (diaryEntries.length === 0) return showToast(I18N.t('export.none'), 'error');
    const data = JSON.stringify({ version: '2.0', entries: diaryEntries }, null, 2);
    downloadFile(data, getExportFileName('json'), 'application/json');
    closeSidebar();
    showToast(I18N.t('export.jsonDone', { n: diaryEntries.length }), 'success');
};

function escapeMarkdownText(text) {
    if (!text) return '';
    return text.replace(/([\\`*_\[\]<>])/g, '\\$1');
}

function exportMarkdown() {
    if (diaryEntries.length === 0) { showToast(I18N.t('export.none'), 'error'); return; }
    const sorted = [...diaryEntries].sort((a, b) => new Date(a.date) - new Date(b.date));
    const lines = [
        `# ${I18N.t('md.title')}`,
        '',
        `_${I18N.t('md.count', { n: sorted.length })}_`,
        `_${I18N.t('md.exportedAt', { date: I18N.fmtDate(new Date()) })}_`,
        ''
    ];
    sorted.forEach(entry => {
        const dateLabel = I18N.fmtDate(new Date(entry.date), { day: '2-digit', month: 'long', year: 'numeric' });
        lines.push('---', '');
        lines.push(`## ${dateLabel} ${entry.mood || ''}`.trim(), '');
        if (entry.title) lines.push(`### ${escapeMarkdownText(entry.title)}`, '');
        lines.push(entry.content || '', '');
        if (entry.tags && entry.tags.length > 0) {
            lines.push(`_${I18N.t('md.tags', { tags: entry.tags.map(tag => tag.replace(/^#/, '')).join(', ') })}_`, '');
        }
    });
    downloadFile(lines.join('\n'), getExportFileName('md'), 'text/markdown;charset=utf-8');
    closeSidebar();
    showToast(I18N.t('export.mdDone', { n: sorted.length }), 'success');
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
            showToast(I18N.t('import.done', { n: count }), 'success');
            closeSidebar();
        }   catch { showToast(I18N.t('import.badFile'), 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
};



// === 📊 ГРАФИК (модалка) ===
let currentChartMode = 'line'; // 'line' | 'bar'
let currentBarPeriod = 'all';  // 'all' | 'month' | 'week'



function closeChartModal() {
    const sel = document.getElementById('chart-period-selector');
    if (sel) sel.classList.add('hidden');
}


function refreshStatsChart() {
    const section = document.getElementById('stats-chart-section');
    if (section) section.classList.remove('hidden');
    // Стрелка периода — только в режиме гистограммы
    const periodToggle = document.getElementById('chart-period-toggle');
    if (periodToggle) periodToggle.classList.toggle('hidden', currentChartMode !== 'bar');
    if (currentChartMode === 'line') updateChartModalTitle();
    syncPeriodButtons();
    setTimeout(() => {
        const modal = document.getElementById('stats-modal');
        if (!modal || modal.classList.contains('hidden')) return;
        if (currentChartMode === 'line') drawMoodChart();
        else drawBarChart();
    }, 80);
}

function updateChartModalTitle() {
    const d = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1);
    document.getElementById('chart-modal-title').textContent =
        I18N.fmtDate(d, { month: 'long', year: 'numeric' });
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

// === 🔀 ПЕРЕКЛЮЧАТЕЛЬ ТИПА ГРАФИКА (сегменты) ===
function syncPeriodButtons() {
    document.querySelectorAll('.period-option').forEach(b => {
        b.classList.toggle('active', b.dataset.period === currentBarPeriod);
    });
}

function setChartMode(mode) {
    currentChartMode = mode;
    const isBar = mode === 'bar';
    const control = document.getElementById('chart-mode-toggle');
    if (control) control.classList.toggle('seg-right', isBar);
    const btnLine = document.getElementById('chart-mode-line');
    const btnBar = document.getElementById('chart-mode-bar');
    if (btnLine) { btnLine.classList.toggle('active', !isBar); btnLine.setAttribute('aria-selected', String(!isBar)); }
    if (btnBar) { btnBar.classList.toggle('active', isBar); btnBar.setAttribute('aria-selected', String(isBar)); }
    document.getElementById('prev-month-chart').classList.toggle('hidden', isBar);
    document.getElementById('next-month-chart').classList.toggle('hidden', isBar);
    document.getElementById('mood-chart').classList.toggle('hidden', isBar);
    document.getElementById('bar-chart').classList.toggle('hidden', !isBar);
    document.getElementById('chart-period-toggle').classList.toggle('hidden', !isBar);
    document.getElementById('chart-period-selector').classList.add('hidden');
    syncPeriodButtons();
    if (isBar) {
        document.getElementById('chart-modal-title').textContent = I18N.t('chart.frequency');
        document.getElementById('chart-average').textContent = I18N.t('chart.distribution');
        drawBarChart();
    } else {
        updateChartModalTitle();
        drawMoodChart();
    }
}
document.getElementById('chart-mode-line').onclick = () => { if (currentChartMode !== 'line') setChartMode('line'); };
document.getElementById('chart-mode-bar').onclick = () => { if (currentChartMode !== 'bar') setChartMode('bar'); };

document.getElementById('chart-period-toggle').onclick = (e) => {
    e.stopPropagation();
    const selector = document.getElementById('chart-period-selector');
    selector.classList.toggle('hidden');
};

document.addEventListener('click', (e) => {
    const selector = document.getElementById('chart-period-selector');
    const toggleBtn = document.getElementById('chart-period-toggle');
    if (!selector || !toggleBtn) return; // ← защита от null
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
        syncPeriodButtons();
        document.getElementById('chart-period-selector').classList.add('hidden');
        if (currentChartMode === 'bar') drawBarChart();
    };
});


document.getElementById('prev-month-chart').onclick = () => changeChartMonth(-1);
document.getElementById('next-month-chart').onclick = () => changeChartMonth(1);

// === РИСОВАНИЕ ГИСТОГРАММЫ ===
function drawBarChart() {
    const canvas = document.getElementById('bar-chart');
    if (!canvas) return;

    // Guard: рисуем только если статистика открыта
    const statsModal = document.getElementById('stats-modal');
    if (statsModal && statsModal.classList.contains('hidden')) return;

    // Не рисуем, если секция графика скрыта
    const section = document.getElementById('stats-chart-section');
    if (section && section.classList.contains('hidden')) return;

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

        const emojiImg = moodImages[m.emoji];
        if (emojiImg) {
            ctx.drawImage(emojiImg, x + barWidth / 2 - 10, top + plotH + 8, 20, 20);
        } else {
            ctx.font = '18px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = textColor;
            ctx.fillText(m.emoji, x + barWidth / 2, top + plotH + 8);
        }
    });

    const totalEntries = filteredEntries.length;
    const periodKey = currentBarPeriod === 'week' ? 'period.week' : currentBarPeriod === 'month' ? 'period.monthCurrent' : 'period.all';
    document.getElementById('chart-summary').textContent = I18N.t('chart.barSummary', { period: I18N.t(periodKey), n: totalEntries });
    }



// Пересчёт скролла активной вкладки статистики (лечит "залипание" на iOS)
function refreshStatsScroll() {
    requestAnimationFrame(() => {
        const activeBody = document.querySelector('#stats-modal .stats-body:not(.hidden)');
        if (!activeBody) return;
        activeBody.scrollTop = 0;               // сбрасываем старую позицию
        // Принудительный пересчёт области прокрутки (iOS-нюд)
        activeBody.style.overflow = 'hidden';
        void activeBody.offsetHeight;           // форсируем reflow
        activeBody.style.overflow = '';
    });
}

// Блокировка скролла страницы, пока открыта полноэкранная модалка
function updateBodyScrollLock() {
    const anyOpen = ['stats-modal', 'calendar-modal', 'triggers-list-modal']
        .some(id => !document.getElementById(id).classList.contains('hidden'));
    document.body.classList.toggle('modal-lock', anyOpen);
}

// === 📈 СТАТИСТИКА ===
let currentStatsMode = 'normal'; // 'normal' | 'deep'

function redrawStatsChart() {
    updateChartModalTitle();
    setTimeout(() => {
        const modal = document.getElementById('stats-modal');
        if (!modal || modal.classList.contains('hidden')) return;
        if (currentChartMode === 'line') drawMoodChart();
        else drawBarChart();
    }, 80);
}

function renderStatsItems() {
    const box = document.getElementById('stats-items-container');
    if (!box) return;

    if (!diaryEntries.length) {
        box.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:40px 0;">${I18N.t('stats.empty1')}<br>${I18N.t('stats.empty2')}</p>`;
        return;
    }

    const totalEntries = diaryEntries.length;
    const daysWithEntries = new Set(diaryEntries.map(e => getDateKey(e.date))).size;
    const sortedByDate = [...diaryEntries].sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstEntryDate = new Date(sortedByDate[0].date);
    const daysSinceFirst = Math.max(1, Math.floor((Date.now() - firstEntryDate) / 86400000));
    const activityPercent = Math.round((daysWithEntries / daysSinceFirst) * 100);

    const moodCounts = {};
    diaryEntries.forEach(e => { moodCounts[e.mood] = (moodCounts[e.mood] || 0) + 1; });
    const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0];

    const DAY_MS = 86400000, nowMs = Date.now();
    const s7 = getPeriodStats(nowMs - 7 * DAY_MS, nowMs);
    const s30 = getPeriodStats(nowMs - 30 * DAY_MS, nowMs);
    const sAll = getPeriodStats(0, nowMs);
    const avg7 = s7.avg ?? 0, avg30 = s30.avg ?? 0, avgAll = sAll.avg ?? 0;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    let weekBest = null, weekWorst = null;
    diaryEntries.forEach(e => {
        if (new Date(e.date) < sevenDaysAgo) return;
        const score = getMoodScore(e.mood);
        if (score === null) return;
        if (!weekBest || score > weekBest.score) weekBest = { emoji: e.mood, score, date: e.date };
        if (!weekWorst || score < weekWorst.score) weekWorst = { emoji: e.mood, score, date: e.date };
    });

    const FLEX = 'display:flex; align-items:center; justify-content:flex-end; gap:8px;';
    const muted = (txt) => `<span style="font-size:0.8em; color:var(--text-muted);">${txt}</span>`;
    const shortDate = (d) => I18N.fmtDate(new Date(d), { day: 'numeric', month: 'short' });
    const row = (label, value, moodClass, style, valueClass) => `
        <div class="stats-item ${moodClass || ''}">
            <span class="stats-label">${label}</span>
            <span class="stats-value${valueClass ? ' ' + valueClass : ''}"${style ? ` style="${style}"` : ''}>${value}</span>
        </div>`;
    const avgRow = (label, avg, days) => row(
        I18N.t(label),
        muted(days > 0 ? `(${avg.toFixed(1)})` : '—') + (days > 0 ? getMoodSvg(getEmojiByScore(avg), 24) : ''),
        days > 0 ? getStatsMoodClass(avg) : '', FLEX
    );

    box.innerHTML = [
        row(I18N.t('stats.bestWeek'),
            muted(weekBest ? shortDate(weekBest.date) : '—') + (weekBest ? getMoodSvg(weekBest.emoji, 24) : ''),
            weekBest ? getStatsMoodClass(weekBest.score) : '', FLEX),
        row(I18N.t('stats.worstWeek'),
            muted(weekWorst ? shortDate(weekWorst.date) : '—') + (weekWorst ? getMoodSvg(weekWorst.emoji, 24) : ''),
            weekWorst ? getStatsMoodClass(weekWorst.score) : '', FLEX),
        row(I18N.t('stats.topMood'),
            muted(I18N.plural(topMood[1], 'unit.time')) + getMoodSvg(topMood[0], 24),
            getStatsMoodClass(getMoodScore(topMood[0])), FLEX),
        avgRow('stats.avg7', avg7, s7.days),
        avgRow('stats.avg30', avg30, s30.days),
        avgRow('stats.avgAll', avgAll, sAll.days),
        row(I18N.t('stats.daysWithEntries'),
            I18N.t('stats.daysValue', { a: daysWithEntries, b: daysSinceFirst, p: activityPercent })),
        row(I18N.t('stats.totalEntries'), totalEntries, '', '', 'large'),
        row(I18N.t('stats.firstEntry'),
            I18N.fmtDate(firstEntryDate, { day: 'numeric', month: 'long', year: 'numeric' }),
            '', 'font-size:0.9em;')
    ].join('');
}

function openStatsModal() {
    closeChartModal();
    closeCalendarScreen();
    closeSidebar();
    setStatsMode('normal', false);
    setChartMode(currentChartMode);
    renderStatsItems();
    document.getElementById('stats-modal').classList.remove('hidden');
    refreshStatsChart();
    refreshStatsScroll();
    updateBodyScrollLock();
}

// Переключатель режимов статистики
// === 🔀 ПЕРЕКЛЮЧАТЕЛЬ РЕЖИМА СТАТИСТИКИ (сегменты) ===
function setStatsMode(mode, render = true) {
    currentStatsMode = mode;
    const isDeep = mode === 'deep';
    const control = document.getElementById('stats-mode-toggle');
    if (control) control.classList.toggle('seg-right', isDeep);
    const btnNormal = document.getElementById('stats-mode-normal');
    const btnDeep = document.getElementById('stats-mode-deep');
    if (btnNormal) { btnNormal.classList.toggle('active', !isDeep); btnNormal.setAttribute('aria-selected', String(!isDeep)); }
    if (btnDeep) { btnDeep.classList.toggle('active', isDeep); btnDeep.setAttribute('aria-selected', String(isDeep)); }
    document.getElementById('stats-normal-body').classList.toggle('hidden', isDeep);
    document.getElementById('stats-deep-body').classList.toggle('hidden', !isDeep);
    if (!render) return;
    if (isDeep) {
        requestAnimationFrame(() => { renderDeepStats(); refreshStatsScroll(); });
    } else {
        document.getElementById('stats-chart-section').classList.remove('hidden');
        requestAnimationFrame(() => { refreshStatsChart(); refreshStatsScroll(); });
    }
}
document.getElementById('stats-mode-normal').onclick = () => { if (currentStatsMode !== 'normal') setStatsMode('normal'); };
document.getElementById('stats-mode-deep').onclick = () => { if (currentStatsMode !== 'deep') setStatsMode('deep'); };



// === Глубокая статистика === //
function renderBestStreak() {
    const sortedDays = [...getDayIndex().entries()].map(([dateKey, es]) => {
        let total = 0, count = 0;
        es.forEach(e => {
            const s = getMoodScore(e.mood);
            if (s !== null) { total += s; count++; }
        });
        return {
            date: dateKey,
            dateObj: new Date(dateKey + 'T12:00:00'),
            avgScore: count > 0 ? total / count : 0,
            entries: es
        };
    }).sort((a, b) => a.dateObj - b.dateObj);

    let bestStreak = [], currentStreak = [];
    sortedDays.forEach(day => {
        const isGood = day.avgScore >= 7;
        let isNextDay = false;
        if (currentStreak.length) {
            const prev = currentStreak[currentStreak.length - 1].dateObj;
            isNextDay = Math.ceil(Math.abs(day.dateObj - prev) / 86400000) === 1;
        }
        if (isGood && (!currentStreak.length || isNextDay)) currentStreak.push(day);
        else {
            if (currentStreak.length > bestStreak.length) bestStreak = [...currentStreak];
            currentStreak = isGood ? [day] : [];
        }
    });
    if (currentStreak.length > bestStreak.length) bestStreak = [...currentStreak];

    const container = document.getElementById('best-streak-container');
    if (!container) return;

    if (!bestStreak.length) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px 0; font-size:0.9em;">${I18N.t('deep.streakEmpty')}</p>`;
        return;
    }

    const firstDay = bestStreak[0];
    const lastDay = bestStreak[bestStreak.length - 1];
    const midDay = bestStreak[Math.floor(bestStreak.length / 2)];
    const fmt = (d) => I18N.fmtDate(d, { day: 'numeric', month: 'long' });

    const allTriggers = new Set();
    bestStreak.forEach(day => day.entries.forEach(e => {
        if (e.triggers) e.triggers.forEach(t => allTriggers.add(t));
    }));
    const triggersHtml = allTriggers.size
        ? `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:15px; justify-content:center;">${Array.from(allTriggers).map(t => `<span class="entry-trigger-chip trigger-level-4">${escapeHtml(I18N.triggerLabel(t))}</span>`).join('')}</div>`
        : '';

    const dot = (mood, color) => `
        <div style="position:relative; z-index:2; text-align:center;">
            <div style="background:var(--surface); padding:4px; border-radius:50%; border:2px solid ${color}; display:inline-flex; align-items:center; justify-content:center;">
                ${getMoodSvg(mood, 24)}
            </div>
        </div>`;

    container.innerHTML = `
        <div style="text-align:center; margin-bottom:15px;">
            <h3 style="font-size:1em; margin:0; color:var(--text-color); font-weight:400;">${I18N.t('deep.streakTitle')}</h3>
        </div>
        <div style="position:relative; display:flex; align-items:center; justify-content:space-between; padding:0 20px; margin:20px 0;">
            <div style="position:absolute; top:50%; left:30px; right:30px; height:3px; background:linear-gradient(90deg,#8bc34a,#1b5e20); z-index:1;"></div>
            ${dot(firstDay.entries[0].mood, '#8bc34a')}
            ${dot(midDay.entries[0].mood, '#8bc34a')}
            ${dot(lastDay.entries[0].mood, '#1b5e20')}
        </div>
        <div style="text-align:center; margin-bottom:15px;">
            <p style="font-size:0.75em; color:var(--text-muted); margin:0;">${I18N.t('deep.streakRange', {
                count: I18N.plural(bestStreak.length, 'unit.day'),
                from: fmt(firstDay.dateObj),
                to: fmt(lastDay.dateObj)
            })}</p>
        </div>
        ${triggersHtml}`;
}

function renderLastWeekMood(containerId = 'last-week-mood-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
    const startOfLastWeek = new Date(today);
    startOfLastWeek.setDate(today.getDate() - dayOfWeek - 6);
    startOfLastWeek.setHours(0, 0, 0, 0);
    const weekEnd = new Date(startOfLastWeek.getTime() + 7 * 86400000);

    const byDay = {};
    diaryEntries.forEach(e => {
        const k = getDateKey(e.date);
        (byDay[k] = byDay[k] || []).push(e);
    });

    const index = getDayIndex();
    const dayScores = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfLastWeek);
        d.setDate(d.getDate() + i);
        const es = index.get(getDateKey(d)) || [];
        const avg = calculateSmartDayScore(es);
        dayScores.push({ date: d, avg, emoji: avg !== null ? getEmojiByScore(avg) : null });
    }

    const titleHtml = `<h3 style="font-size:1em; margin:0 0 10px 0; color:var(--text-color); font-weight:400;">${I18N.t('deep.lastWeekTitle')}</h3>`;

    if (dayScores.filter(d => d.avg !== null).length < 3) {
        container.innerHTML = `<div style="text-align:center; padding:20px 10px;">${titleHtml}
            <p style="font-size:0.9em; color:var(--text-muted); margin:0;">${I18N.t('deep.lastWeekEmpty')}</p></div>`;
        return;
    }

    let weekTotal = 0, weekCount = 0;
    const weekTriggers = {};
    diaryEntries.forEach(e => {
        const d = new Date(e.date);
        if (d >= startOfLastWeek && d < weekEnd) {
            const s = getMoodScore(e.mood);
            if (s !== null) { weekTotal += s; weekCount++; }
            if (e.triggers) e.triggers.forEach(t => weekTriggers[t] = (weekTriggers[t] || 0) + 1);
        }
    });
    const weekAvg = weekCount ? weekTotal / weekCount : 0;
    const topTriggers = Object.entries(weekTriggers).sort((a, b) => b[1] - a[1]).slice(0, 3).map(t => t[0]);

    const valid = dayScores.map((d, i) => d.avg !== null ? i : -1).filter(i => i !== -1);
    const firstIdx = valid[0], lastIdx = valid[valid.length - 1];
    const stops = [];
    if (firstIdx === lastIdx) {
        const c = getMoodColorHex(dayScores[firstIdx].avg);
        stops.push(`${c} 0%`, `${c} 100%`);
    } else {
        const span = lastIdx - firstIdx;
        for (let i = firstIdx; i < lastIdx; i++) {
            const c0 = dayScores[i].avg !== null ? getMoodColorHex(dayScores[i].avg) : '#cccccc';
            const c1 = dayScores[i + 1].avg !== null ? getMoodColorHex(dayScores[i + 1].avg) : '#cccccc';
            if (i === firstIdx) stops.push(`${c0} 0%`);
            stops.push(`${c1} ${((i + 1 - firstIdx) / span) * 100}%`);
        }
    }

    const DAY_KEYS = ['day.mon', 'day.tue', 'day.wed', 'day.thu', 'day.fri', 'day.sat', 'day.sun'];
    const daysHtml = dayScores.map((d, i) => {
        if (i !== 0 && i !== 3 && i !== 6) return '';
        return `
            <div style="position:relative; z-index:2; text-align:center; display:flex; flex-direction:column; align-items:center;">
                <div style="background:var(--surface); padding:4px; border-radius:50%; border:2px solid var(--border-color); display:flex; align-items:center; justify-content:center; width:40px; height:40px;">
                    ${d.emoji ? getMoodSvg(d.emoji, 24) : '<span style="font-size:0.7em; color:var(--text-muted);">—</span>'}
                </div>
                <div style="font-size:0.7em; color:var(--text-muted); margin-top:4px;">${I18N.t(DAY_KEYS[i])}</div>
                <div style="font-size:0.65em; color:var(--text-muted);">${I18N.fmtDate(d.date, { day: 'numeric', month: 'short' })}</div>
            </div>`;
    }).join('');

    container.innerHTML = `
        <div style="text-align:center; margin-bottom:15px;">${titleHtml}</div>
        <div style="position:relative; display:flex; align-items:center; justify-content:space-between; padding:0 10px; margin:20px 0;">
            <div style="position:absolute; top:20px; left:30px; right:30px; height:4px; background:linear-gradient(90deg, ${stops.join(', ')}); z-index:1; border-radius:2px;"></div>
            ${daysHtml}
        </div>
        <div style="text-align:center; margin-top:15px;">
            <p style="font-size:0.85em; color:var(--text-color); margin:0 0 5px 0;">
                ${I18N.t('deep.weekAvg')} <strong>${weekAvg.toFixed(1)} ${getEmojiByScore(weekAvg)}</strong>
            </p>
            ${topTriggers.length ? `<p style="font-size:0.75em; color:var(--text-muted); margin:0;">${I18N.t('deep.topTriggers')} ${escapeHtml(topTriggers.map(t => I18N.triggerLabel(t)).join(', '))}</p>` : ''}
        </div>`;
}

function renderDeepStats() {
    renderBestStreak();
    renderLastWeekMood();

    const triggerStats = {};
    diaryEntries.forEach(entry => {
        if (!entry.triggers || !entry.triggers.length) return;
        const score = getMoodScore(entry.mood);
        if (score === null) return;
        entry.triggers.forEach(trig => {
            if (!triggerStats[trig]) triggerStats[trig] = { total: 0, count: 0 };
            triggerStats[trig].total += score;
            triggerStats[trig].count += 1;
        });
    });

    const sortedTriggers = Object.entries(triggerStats).map(([name, data]) => ({
        trigger: name,
        avgScore: data.total / data.count,
        count: data.count,
        emoji: getEmojiByScore(data.total / data.count)
    })).sort((a, b) => b.count - a.count);

    const byScore = [...sortedTriggers].sort((a, b) => b.avgScore - a.avgScore);
    const topGood = byScore.slice(0, 3).filter(t => t.avgScore >= 5);
    const topBad = byScore.slice(-3).reverse().filter(t => t.avgScore < 5);

    const renderTop = (list, titleKey, accent) => {
        if (!list.length) return '';
        const rows = list.map(t => `
            <div style="display:flex; justify-content:space-between; margin-bottom:4px; align-items:center;">
                <span style="font-size:0.9em; font-weight:500;">${escapeHtml(I18N.triggerLabel(t.trigger))}</span>
                <span style="font-size:0.9em; color:${accent}; font-weight:600; display:flex; align-items:center; gap:4px;">
                    ${getMoodSvg(t.emoji, 16)} ${t.avgScore.toFixed(1)}
                </span>
            </div>`).join('');
        return `<div style="background:${accent === 'var(--accent-color)' ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)'}; border-left:4px solid ${accent}; padding:10px; border-radius:8px;">
            <div style="font-size:0.85em; color:var(--text-muted); margin-bottom:8px;">${I18N.t(titleKey)}</div>${rows}</div>`;
    };

    document.getElementById('top-good-triggers').innerHTML = renderTop(topGood, 'deep.topGood', 'var(--accent-color)');
    document.getElementById('top-bad-triggers').innerHTML = renderTop(topBad, 'deep.topBad', 'var(--danger-color)');

    const select = document.getElementById('trigger-filter-select');
    const currentValue = select.value;
    select.innerHTML = `<option value="all">${I18N.t('deep.allTriggers')}</option>`;
    sortedTriggers.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.trigger;                              // значение — исходный ключ
        opt.textContent = I18N.triggerLabel(t.trigger);     // подпись — перевод
        select.appendChild(opt);
    });
    select.value = currentValue;

    const displayData = select.value !== 'all'
        ? sortedTriggers.filter(t => t.trigger === select.value)
        : sortedTriggers;
    drawTriggerChart(displayData);

    const triggerListEl = document.getElementById('trigger-stats-list');
    const triggerChartEl = document.getElementById('trigger-chart');
    if (!sortedTriggers.length) {
        triggerChartEl.classList.add('hidden');
        if (triggerListEl) triggerListEl.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px 0;">${I18N.t('deep.noTriggers')}</p>`;
    } else {
        triggerChartEl.classList.remove('hidden');
        if (triggerListEl) triggerListEl.innerHTML = '';
    }

    if (!document.getElementById('stats-deep-body').classList.contains('hidden')) drawWeekdayChart();
}



// === 🎨 ПЛАВНЫЙ ЦВЕТ НАСТРОЕНИЯ (интерполяция между твоими 5 уровнями) ===
const MOOD_COLOR_STOPS = [
    { s: 1.5, c: [244, 67, 54] },   // #f44336 — уровень 1
    { s: 3.5, c: [255, 152, 0] },   // #ff9800 — уровень 2
    { s: 5.5, c: [2, 136, 209] },   // #0288d1 — уровень 3
    { s: 7.5, c: [139, 195, 74] },  // #8bc34a — уровень 4
    { s: 9.5, c: [27, 94, 32] }     // #1b5e20 — уровень 5
];

function rgbToHex(rgb) {
    return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
}

function getMoodColorHex(score) {
    const s = Math.max(1, Math.min(10, score));
    const first = MOOD_COLOR_STOPS[0];
    const last = MOOD_COLOR_STOPS[MOOD_COLOR_STOPS.length - 1];
    if (s <= first.s) return rgbToHex(first.c);
    if (s >= last.s) return rgbToHex(last.c);
    for (let i = 0; i < MOOD_COLOR_STOPS.length - 1; i++) {
        const a = MOOD_COLOR_STOPS[i], b = MOOD_COLOR_STOPS[i + 1];
        if (s >= a.s && s <= b.s) {
            const t = (s - a.s) / (b.s - a.s);
            return rgbToHex(a.c.map((ch, k) => Math.round(ch + (b.c[k] - ch) * t)));
        }
    }
    return rgbToHex(last.c);
}





// === 📋 СПИСОК ВСЕХ ТРИГГЕРОВ ===
let statsModeBeforeTriggers = 'normal'; // запоминаем, с какой вкладки статистики пришли

function openAllTriggersList() {
    statsModeBeforeTriggers = currentStatsMode; // запоминаем текущий режим
    closeStatsModal();
    document.getElementById('triggers-list-modal').classList.remove('hidden');
    renderAllTriggersList();
}

// Открывает статистику и СРАЗУ (синхронно, без мигания) переключает на нужный режим
function openStatsModalInMode(mode) {
    openStatsModal();
    if (mode === 'deep') setStatsMode('deep');
}

function closeAllTriggersList() {
    closeTriggersModal();
    closeAddTriggerModal();
    ['settings-modal', 'notifications-modal', 'language-modal'].forEach(id => {
        const m = document.getElementById(id); if (m) m.classList.add('hidden');
    });
    document.body.classList.remove('modal-lock');
    const modal = document.getElementById('triggers-list-modal');
    if (!modal || modal.classList.contains('hidden')) return; // список не открыт — ничего не делаем
    modal.classList.add('hidden');
    openStatsModalInMode(statsModeBeforeTriggers); // возвращаем туда, откуда пришли
}

// Функция отрисовки списка
function renderAllTriggersList() {
    const container = document.getElementById('all-triggers-list-container');
    if (!container) return;

    const triggerStats = {};
    diaryEntries.forEach(entry => {
        if (!entry.triggers || !entry.triggers.length) return;
        const score = getMoodScore(entry.mood);
        if (score === null) return;
        entry.triggers.forEach(trig => {
            if (!triggerStats[trig]) triggerStats[trig] = { total: 0, count: 0 };
            triggerStats[trig].total += score;
            triggerStats[trig].count += 1;
        });
    });

    const sortedTriggers = Object.entries(triggerStats).map(([name, data]) => ({
        trigger: name,
        avgScore: data.total / data.count,
        count: data.count,
        emoji: getEmojiByScore(data.total / data.count)
    })).sort((a, b) => b.count - a.count);

    const posBlock = document.getElementById('triggers-insight-pos-block');
    const negBlock = document.getElementById('triggers-insight-neg-block');

    if (!sortedTriggers.length) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px 0;">${I18N.t('deep.noTriggers')}</p>`;
        posBlock.style.display = 'none';
        negBlock.style.display = 'none';
        return;
    }

    let globalTotal = 0, globalCount = 0;
    diaryEntries.forEach(e => {
        const s = getMoodScore(e.mood);
        if (s !== null) { globalTotal += s; globalCount++; }
    });
    const globalAvg = globalCount ? globalTotal / globalCount : 0;

    const entriesByDay = getDayIndex();

    let bestPositive = null, bestNegative = null, maxPos = 0, maxNeg = 0;
    Object.entries(triggerStats).forEach(([triggerName, data]) => {
        let confidence = 'low';
        if (data.count >= 15) confidence = 'high';
        else if (data.count >= 8) confidence = 'medium';
        else if (data.count >= 5) confidence = 'low';
        else return;

        const sameDayAvg = data.total / data.count;
        let nextTotal = 0, nextCount = 0;
        diaryEntries.forEach(e => {
            if (!e.triggers || !e.triggers.includes(triggerName)) return;
            const d = new Date(e.date);
            d.setDate(d.getDate() + 1);
            (entriesByDay.get(getDateKey(d)) || []).forEach(n => {
                const s = getMoodScore(n.mood);
                if (s !== null) { nextTotal += s; nextCount++; }
            });
        });
        const nextAvg = nextCount ? nextTotal / nextCount : sameDayAvg;
        const sameDiff = sameDayAvg - globalAvg;
        const nextDiff = nextAvg - globalAvg;
        const impact = Math.abs(sameDiff) > Math.abs(nextDiff) ? sameDiff : nextDiff;
        const type = Math.abs(sameDiff) > Math.abs(nextDiff) ? 'same' : 'next';
        const percent = Math.round(Math.abs(impact) / 10 * 100);

        if (impact > 0.3 && impact > maxPos) { maxPos = impact; bestPositive = { trigger: triggerName, confidence, percent, type }; }
        if (impact < -0.3 && impact < maxNeg) { maxNeg = impact; bestNegative = { trigger: triggerName, confidence, percent, type }; }
    });

    const buildInsight = (d, positive) => {
        const maybe = d.confidence === 'low' ? I18N.t('insight.maybe') : '';
        const conf = d.confidence === 'low' ? I18N.t('insight.confLow')
            : d.confidence === 'medium' ? I18N.t('insight.confMedium') : '';
        const when = I18N.t(d.type === 'next' ? 'insight.nextDay' : 'insight.sameDay');
        const dir = I18N.t(positive ? 'insight.higher' : 'insight.lower', { p: d.percent });
        return `${maybe}${I18N.t('insight.body')} <strong>${dir}</strong>, ${when} ${I18N.t('insight.triggerWord')} ` +
            `<strong>«${escapeHtml(I18N.triggerLabel(d.trigger))}»</strong>.` +
            (conf ? `<span style="font-size:0.85em; opacity:0.7; display:block; margin-top:5px;">${conf}</span>` : '');
    };

    if (bestPositive) {
        document.getElementById('triggers-insight-pos-text').innerHTML = buildInsight(bestPositive, true);
        posBlock.style.display = 'block';
    } else posBlock.style.display = 'none';

    if (bestNegative) {
        document.getElementById('triggers-insight-neg-text').innerHTML = buildInsight(bestNegative, false);
        negBlock.style.display = 'block';
    } else negBlock.style.display = 'none';

    container.innerHTML = '<div>' + sortedTriggers.map(t => {
        let levelClass = '';
        if (t.count >= 2) {
            const lv = t.avgScore <= 2 ? 1 : t.avgScore <= 4 ? 2 : t.avgScore <= 6 ? 3 : t.avgScore <= 8 ? 4 : 5;
            levelClass = 'trigger-level-' + lv;
        }
        return `
            <div class="trigger-list-row" data-trigger="${escapeHtml(t.trigger)}">
                <div style="display:flex; align-items:center;">
                    <div class="trigger-list-indicator ${levelClass}"></div>
                    <span class="trigger-list-name">${escapeHtml(I18N.triggerLabel(t.trigger))}</span>
                </div>
                <div style="display:flex; align-items:center;">
                    <span class="trigger-list-count">${I18N.plural(t.count, 'unit.entry')}</span>
                    <span class="trigger-list-score">${t.emoji}</span>
                </div>
            </div>`;
    }).join('') + '</div>';

    container.querySelectorAll('.trigger-list-row').forEach(row => {
        row.onclick = () => applyTriggerFilterAndClose(row.dataset.trigger);
    });
}

// Функция для перехода к записям по клику
function applyTriggerFilterAndClose(triggerName) {
    document.getElementById('triggers-list-modal').classList.add('hidden');
    applyTriggerFilter(triggerName);
}

function drawTriggerChart(triggerData) {
    const canvas = document.getElementById('trigger-chart');
    if (!canvas || canvas.classList.contains('hidden')) return;

    const ctx = canvas.getContext('2d');
    
    // 1. ДИНАМИЧЕСКИЙ РАСЧЕТ ВЫСОТЫ
    // Базовый отступ (сверху/снизу) + по 35px на каждый триггер (минимум 200px)
    const padding = 40; 
    const rowHeight = 35; 
    const calculatedHeight = Math.max(200, triggerData.length * rowHeight + padding);
    
    // Задаем высоту элементу в HTML, чтобы он растянул родительский блок
    canvas.style.height = calculatedHeight + 'px';

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    const width = rect.width;
    const height = calculatedHeight; // Используем новую высоту
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    
    // Проверяем тему: если тёмная, берем светлый текст, иначе — тёмный
    const styles = getComputedStyle(document.body);
    const textColor = styles.getPropertyValue('--text-color').trim() || '#333';
    const gridColor = styles.getPropertyValue('--border-color').trim() || '#ddd';


    ctx.clearRect(0, 0, width, height);

    if (triggerData.length === 0) return;

    // 2. КООРДИНАТЫ
    const left = 110, right = 20, top = 10, bottom = 20;
    const chartWidth = width - left - right;
    // Высота области для столбиков теперь тоже динамическая
    const chartHeight = height - top - bottom;
    
    // Высота одного столбика (с учетом отступа)
    const barHeight = Math.min(chartHeight / triggerData.length, 30);
    const maxScore = 10;

    // Сетка
        // Сетка от 1 до 10
    for (let i = 1; i <= 10; i += 3) {
        const x = left + (i / 10) * chartWidth;
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, top + chartHeight);
        ctx.stroke();

        ctx.fillStyle = textColor;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(i, x, top + chartHeight + 15);
    }

    // Полоски
        // Полоски
    triggerChartPositions = []; // Сбрасываем позиции перед отрисовкой

    triggerData.forEach((item, index) => {
        const y = top + index * (chartHeight / triggerData.length) + 5; 
            // Нормализация от 1 до 10 (чтобы 0 не пропадал, а был маленькой полоской)
        const normalizedScore = Math.max(1, item.avgScore); // Минимум 1
        const barW = (normalizedScore / 10) * chartWidth;

        // Сохраняем координаты для клика (X: от left до width-right, Y: от y до y + barHeight)
        triggerChartPositions.push({
            trigger: item.trigger,
            xStart: left,
            xEnd: width - right,
            yStart: y,
            yEnd: y + barHeight
        });

        // Название триггера
        ctx.fillStyle = textColor;
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(I18N.triggerLabel(item.trigger), left - 10, y + barHeight / 2);

                // Выбор цвета (5 градаций, как в weekday-chart)
        let barColor;
        if (item.avgScore >= 8) {
            barColor = '#1B5E20';      // 8–9: Темно-зеленый (Супер)
        } else if (item.avgScore >= 6) {
            barColor = '#8BC34A';      // 6–7: Светло-зеленый (Хорошо)
        } else if (item.avgScore >= 4) {
            barColor = '#0288D1';      // 4–5: Темно-голубой (Так себе)
        } else if (item.avgScore >= 2) {
            barColor = '#FF9800';      // 2–3: Оранжевый (Плохо)
        } else {
            barColor = '#F44336';      // 0–1: Красный (Ужасно)
        }

        // Полоска
        ctx.fillStyle = barColor;
        ctx.beginPath();
        ctx.roundRect(left, y, barW, barHeight - 10, [0, 4, 4, 0]);
        ctx.fill();

        // Отрисовка текста и картинки отдельно, чтобы выровнять
        const numText = item.avgScore.toFixed(1);
        const emojiImg = moodImages[item.emoji];

        if (barW < 30) {
            ctx.fillStyle = textColor;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(numText, left + barW + 5, y + barHeight / 2);
            if (emojiImg) {
                ctx.drawImage(emojiImg, left + barW + 5 + ctx.measureText(numText).width + 2, y + barHeight / 2 - 7, 14, 14);
            } else {
                ctx.fillText(item.emoji, left + barW + 5 + ctx.measureText(numText).width + 2, y + barHeight / 2);
            }
        } else {
            ctx.fillStyle = 'white';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            if (emojiImg) {
                ctx.drawImage(emojiImg, left + barW - 20, y + barHeight / 2 - 7, 14, 14);
            } else {
                ctx.fillText(item.emoji, left + barW - 5, y + barHeight / 2);
            }
            ctx.fillText(numText, left + barW - 22, y + barHeight / 2);
        }
    });
}

// Обработчик фильтра
document.getElementById('trigger-filter-select').addEventListener('change', () => {
    renderDeepStats();
});




function closeStatsModal() {
    document.getElementById('stats-modal').classList.add('hidden');
    updateBodyScrollLock();
}


document.getElementById('close-stats-modal').onclick = () => {
    closeStatsModal();
    setActiveNav('nav-entries-btn');
};
document.querySelector('#stats-modal .modal-backdrop').onclick = () => {
    closeStatsModal();
    setActiveNav('nav-entries-btn');
};

// === 📅 КНОПКИ КАЛЕНДАРЯ ===
document.getElementById('close-calendar-btn').onclick = () => {
    closeCalendarScreen();
    setActiveNav('nav-entries-btn');
};
document.querySelector('#calendar-modal .modal-backdrop').onclick = () => {
    closeCalendarScreen();
    setActiveNav('nav-entries-btn');
};
document.getElementById('prev-month-btn').onclick = () => changeCalendarMonth(-1);
document.getElementById('next-month-btn').onclick = () => changeCalendarMonth(1);
document.getElementById('prev-month-desktop').onclick = () => changeCalendarMonth(-1);
document.getElementById('next-month-desktop').onclick = () => changeCalendarMonth(1);


// Обработчики для модалки списка триггеров
document.getElementById('close-triggers-list-btn').onclick = closeAllTriggersList;
document.getElementById('open-triggers-list-hint').onclick = openAllTriggersList;
document.querySelector('#triggers-list-modal .modal-backdrop').onclick = closeAllTriggersList;

// === 🏷️ ТЕГИ ===
function openTagsModal() {
    closeSidebar();
    const tagCounts = {};
    diaryEntries.forEach(entry => {
        if (entry.tags) entry.tags.forEach(tag => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; });
    });
    const sortedTags = Object.entries(tagCounts).sort((a, b) =>
        b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0], I18N.locale));

    const list = document.getElementById('tags-list');
    list.innerHTML = sortedTags.length
        ? sortedTags.map(([tag, count]) => `<div class="tag-pill" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)} <span class="count">(${count})</span></div>`).join('')
        : `<p style="text-align:center; color:var(--text-muted); width:100%;">${I18N.t('tags.empty1')}<br>${I18N.t('tags.empty2')}</p>`;

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
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    if (multiDeleteMode) exitMultiDeleteMode();
    closeTagsModal();
    appMain.classList.add('search-active');
    renderEntries();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(I18N.t('toast.showingTag', { tag: tag }), 'info');
    cameFromDeepStats = false;
    document.getElementById('back-to-stats-btn').classList.add('hidden');
}

function applyTriggerFilter(trigger) {
    activeTriggerFilter = trigger;
    activeTagFilter = null;
    activeDateFilter = null;
    activeMoodFilter = null;
    searchQuery = '';
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    if (multiDeleteMode) exitMultiDeleteMode();
    
    cameFromDeepStats = true; // Запоминаем, что пришли из статистики
    document.getElementById('back-to-stats-btn').classList.remove('hidden'); // Показываем кнопку
    
    appMain.classList.add('search-active');
    renderEntries();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(I18N.t('toast.showingTrigger', { trigger: I18N.triggerLabel(trigger) }), 'info');
}

function clearTagFilter() { activeTagFilter = null; renderEntries(); }
function closeTagsModal() { document.getElementById('tags-modal').classList.add('hidden'); }

document.getElementById('sidebar-tags-btn').onclick = openTagsModal;
document.getElementById('close-tags-modal').onclick = closeTagsModal;
document.querySelector('#tags-modal .modal-backdrop').onclick = closeTagsModal;

// === 😊 ФИЛЬТР ПО НАСТРОЕНИЮ ===
function initMoodFilterGrid() {
    const grid = document.getElementById('mood-filter-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    MOODS.forEach(m => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mood-filter-emoji';
        
        // Вставляем SVG-картинку
        btn.innerHTML = `<img src="${m.svg}" alt="${m.emoji}" style="width: 100%; height: 100%; object-fit: contain;">`;
        
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
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    if (multiDeleteMode) exitMultiDeleteMode();
    closeSidebar();
    appMain.classList.add('search-active');
    renderEntries();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(I18N.t('toast.moodFilter', { mood: emoji }), 'info');
    cameFromDeepStats = false;
    document.getElementById('back-to-stats-btn').classList.add('hidden');
}

function clearMoodFilter() { activeMoodFilter = null; renderEntries(); }
function clearTriggerFilter() {
    activeTriggerFilter = null;
    renderEntries();
}

// === 🖱️ ДЕЛЕГИРОВАННЫЕ СОБЫТИЯ СПИСКА (один набор на весь список) ===
(function bindEntriesListEvents() {
    const list = document.getElementById('entries-list');
    if (!list) return;
    let lpTimer = 0, lpFired = false, lpId = null, lpX = 0, lpY = 0;

    list.addEventListener('pointerdown', (e) => {
        const card = e.target.closest('.entry-card');
        if (!card) return;
        lpFired = false; lpId = card.dataset.entryId; lpX = e.clientX; lpY = e.clientY;
        clearTimeout(lpTimer);
        lpTimer = setTimeout(() => {
            lpFired = true;
            if (navigator.vibrate) navigator.vibrate(20);
            enterMultiDeleteMode(lpId);
        }, 500);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
        list.addEventListener(ev, () => clearTimeout(lpTimer))
    );
    list.addEventListener('pointermove', (e) => {
        if (lpTimer && (Math.abs(e.clientX - lpX) > 10 || Math.abs(e.clientY - lpY) > 10)) clearTimeout(lpTimer);
    });

    list.addEventListener('click', (e) => {
        if (e.target.closest('#clear-tag-filter')) { clearTagFilter(); return; }
        if (e.target.closest('#clear-date-filter')) { clearDateFilter(); return; }
        if (e.target.closest('#clear-mood-filter')) { clearMoodFilter(); return; }
        if (e.target.closest('#clear-trigger-filter')) { clearTriggerFilter(); return; }
        const card = e.target.closest('.entry-card');
        if (!card) return;
        if (lpFired) { lpFired = false; return; }
        const id = card.dataset.entryId;
        if (multiDeleteMode) { toggleEntrySelection(id); return; }
        const entry = diaryEntries.find(x => String(x.id) === String(id));
        if (entry) openEntryForm(entry);
    });
})();

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
        if (panelId === 'triggers-panel') {
            renderTriggers();
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
                showToast(I18N.t('toast.selectTextFirst'), 'info');
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
        showToast(I18N.t('toast.listInTable'), 'info');
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
// 4. НАДЕЖНЫЙ ОБРАБОТЧИК КЛАВИШ (ENTER и BACKSPACE) ДЛЯ СПИСКОВ
document.getElementById('entry-text').addEventListener('keydown', (e) => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const anchorNode = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    const item = anchorNode ? anchorNode.closest('.custom-list-item') : null;
    if (!item) return; // не в списке — не мешаем браузеру

    // --- 1. ОБРАБОТКА BACKSPACE ---
    if (e.key === 'Backspace') {
        // Проверяем, пустая ли строка (только \u200B или пробелы)
        const textContent = item.textContent.replace(/\u200B/g, '').trim();
        
        if (textContent === '') {
            // Если строка пустая — выходим из списка
            e.preventDefault();

            // Убираем классы списка
            item.classList.remove('custom-list-item', 'checkbox-item', 'number-item', 'checked');
            item.removeAttribute('data-marker');
            item.style.listStyleType = '';
            item.style.paddingLeft = '';
            item.style.display = '';

            // Удаляем чекбокс, если был
            const cb = item.querySelector('.custom-checkbox-marker');
            if (cb) cb.remove();

            // Оставляем невидимый символ, чтобы блок не схлопнулся
            item.innerHTML = '\u200B';

            // Ставим курсор после него
            const range = document.createRange();
            range.setStart(item.firstChild, 1);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);

            onEntryFieldInput();
        }
        // Если в строке есть текст, ничего не делаем — даем браузеру удалить символ
        return;
    }

    // --- 2. ОБРАБОТКА ENTER ---
    if (e.key !== 'Enter' || e.shiftKey) return;

    // Проверяем, пустая ли текущая строка
    const textContent = item.textContent.replace(/\u200B/g, '').trim();
    const isEmptyItem = textContent === '';

    if (isEmptyItem) {
        // Если пустая — выходим из списка
        e.preventDefault();

        item.classList.remove('custom-list-item', 'checkbox-item', 'number-item', 'checked');
        item.removeAttribute('data-marker');
        item.style.listStyleType = '';
        item.style.paddingLeft = '';
        item.style.display = '';

        const cb = item.querySelector('.custom-checkbox-marker');
        if (cb) cb.remove();

        item.innerHTML = '\u200B';

        const range = document.createRange();
        range.setStart(item.firstChild, 1);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);

        onEntryFieldInput();
        return;
    }

    // === ОБЫЧНЫЙ ENTER В СПИСКЕ (создаем новый пункт) ===
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
        btn.title = I18N.t('bg.' + bg.id);
        btn.dataset.bgId = bg.id;

        // Внутренний превью-квадрат с тем же классом фона
        const preview = document.createElement('div');
        preview.className = 'bg-option-preview ' + bg.cssClass;

        // Название фона
        const name = document.createElement('span');
        name.className = 'bg-option-name';
        name.textContent = I18N.t('bg.' + bg.id);

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

// Только применяет класс фона, без автосейва и без обновления панели
function setEntryBackground(bgId) {
    const form = document.getElementById('entry-form');
    const bg = BACKGROUNDS.find(b => b.id === bgId);
    if (!bg || !form) return;

    BACKGROUNDS.forEach(b => form.classList.remove(b.cssClass));
    form.classList.add(bg.cssClass);
    currentBgId = bgId;
}

// Пользовательский обработчик: применить фон + сохранить + обновить выделение в панели
function applyBackgroundToEntry(bgId) {
    setEntryBackground(bgId);

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
        btn.title = I18N.t('emojiPack.' + pack.id);
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

// Кнопка СОХРАНИТЬ (галочка)
document.getElementById('save-close-btn').onclick = async () => {
    // Просто вызываем сохранение. Если запись пустая — buildEntryFromForm вернёт null
    // и мы просто закроем модалку без создания записи.
    if (await handleSaveEntry()) {
        closeEntryForm();
    } else {
        // Если handleSaveEntry вернул false (пустая запись) — всё равно закрываем
        closeEntryForm();
    }
};

// Кнопка ОТМЕНА (крестик): не сохраняет, а удаляет созданное автосейвом
document.getElementById('cancel-entry-btn').onclick = async () => {
    clearTimeout(autoSaveTimer);
    const id = cancelDeleteId;
    closeEntryForm();
    if (!id) return;
    await dbDelete(id);
    diaryEntries = diaryEntries.filter(e => e.id !== id);
    scheduleRender('list', 'calendar', 'chart', 'progress');
};


// === ⬅️➡️ ПЕРЕЛИСТЫВАНИЕ ЗАПИСЕЙ (хронологически: следующая = новее) ===
function getVisibleEntriesChrono() {
    return getFilteredSorted().sort((a, b) =>
        (new Date(a.date) - new Date(b.date)) || ((a.createdAt || 0) - (b.createdAt || 0)));
}

function updateEntryNav() {
    const prev = document.getElementById('entry-prev-btn');
    const next = document.getElementById('entry-next-btn');
    if (!prev || !next) return;
    const list = getVisibleEntriesChrono();
    const i = list.findIndex(e => String(e.id) === String(editingEntryId));
    prev.disabled = i <= 0;
    next.disabled = i < 0 || i >= list.length - 1;
}

function navigateEntry(step) {
    const list = getVisibleEntriesChrono();
    const i = list.findIndex(e => String(e.id) === String(editingEntryId));
    if (i < 0) return;
    const target = list[i + step];
    if (!target) return;
    openEntryForm(target);
    const editor = document.getElementById('entry-text');
    if (editor) editor.scrollTop = 0;
}

const entryPrevBtn = document.getElementById('entry-prev-btn');
const entryNextBtn = document.getElementById('entry-next-btn');
if (entryPrevBtn) entryPrevBtn.onclick = () => navigateEntry(-1);
if (entryNextBtn) entryNextBtn.onclick = () => navigateEntry(1);

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
const TEMPLATES = { gratitude: 'tpl.gratitudeBody', summary: 'tpl.summaryBody', ideas: 'tpl.ideasBody', empty: '' };

function applyTemplate(templateKey) {
    const textInput = document.getElementById('entry-text');
    const templateText = TEMPLATES[templateKey] ? I18N.t(TEMPLATES[templateKey]) : '';
    const currentText = getPlainTextFromHTML(textInput.innerHTML);
    const textToInsert = currentText.trim() ? '\n\n' + templateText : templateText;
    insertEmojiAtCursor(textToInsert);
    textInput.focus();
    textInput.scrollTop = textInput.scrollHeight;
    closeTemplatesModal();
    onEntryFieldInput();
}

function openTemplatesModal() {
    document.getElementById('templates-modal').classList.remove('hidden');
}

function closeTemplatesModal() {
    document.getElementById('templates-modal').classList.add('hidden');
}



document.getElementById('toolbar-templates-btn').onclick = openTemplatesModal;
document.getElementById('close-templates-modal').onclick = closeTemplatesModal;
document.querySelector('#templates-modal .modal-backdrop').onclick = closeTemplatesModal;

document.querySelectorAll('.template-item').forEach(btn => {
    btn.onclick = () => applyTemplate(btn.dataset.template);
});

// Кнопка возврата к глубокой статистике
document.getElementById('back-to-stats-btn').onclick = () => {
    activeTriggerFilter = null;
    cameFromDeepStats = false;
    document.getElementById('back-to-stats-btn').classList.add('hidden');
    renderEntries();
    openStatsModalInMode('deep');
};

// === 😊 МОДАЛКА НАСТРОЕНИЯ (закрытие) ===
function closeMoodModal() {
    const moodModal = document.getElementById('mood-modal');
    moodModal.classList.add('hidden');
    moodModal.classList.remove('top-layer');
}
document.querySelector('#mood-modal .modal-backdrop').onclick = () => {
    closeMoodModal();
    // Если это была новая запись и мы закрыли модалку — ничего не открываем
};
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


document.addEventListener('app:langchange', () => {
    const cal = document.getElementById('calendar-modal');
    if (cal && !cal.classList.contains('hidden')) renderCalendar();
    else renderCalendar(); // десктопный календарь на главной тоже обновляем

    const tl = document.getElementById('triggers-list-modal');
    if (tl && !tl.classList.contains('hidden')) { I18N.applyStatic(tl); renderAllTriggersList(); }

    const tm = document.getElementById('triggers-modal');
    if (tm && !tm.classList.contains('hidden')) { I18N.applyStatic(tm); renderTriggersGroups(); }

    const at = document.getElementById('add-trigger-modal');
    if (at && !at.classList.contains('hidden')) {
        I18N.applyStatic(at);
        const title = document.getElementById('add-trigger-title');
        if (title) title.textContent = I18N.t(editingTriggerId ? 'trig.edit' : 'trig.add');
        updatePickerRows();
    }

    const tags = document.getElementById('tags-modal');
    if (tags && !tags.classList.contains('hidden')) { I18N.applyStatic(tags); openTagsModal(); }
});

document.addEventListener('app:langchange', () => {
    const pin = document.getElementById('pin-modal');
    if (pin && !pin.classList.contains('hidden')) refreshPinTexts();
    const em = document.getElementById('entry-modal');
    if (em && !em.classList.contains('hidden')) {
        const dd = document.getElementById('entry-date-display');
        if (dd && dd.dataset.date) document.getElementById('entry-date-text').textContent = formatPrettyDate(dd.dataset.date);
    }
    const bgGrid = document.getElementById('bg-options-grid');
    if (bgGrid && bgGrid.childElementCount) renderBgOptions();
});

document.addEventListener('app:langchange', () => {
    const sm = document.getElementById('stats-modal');
    if (!sm || sm.classList.contains('hidden')) return;
    I18N.applyStatic(sm);
    renderStatsItems();
    if (currentStatsMode === 'deep') {
        if (typeof renderDeepStats === 'function') renderDeepStats();
    } else {
        refreshStatsChart();
    }
});

document.addEventListener('app:langchange', () => {
    const st = document.getElementById('stories-modal');
    if (st && !st.classList.contains('hidden')) {
        I18N.applyStatic(st);
        showStorySlide(storiesIndex); // перерисовываем активный слайд на новом языке
    }
    const no = document.getElementById('nostalgia-modal');
    if (no && !no.classList.contains('hidden')) { I18N.applyStatic(no); openNostalgiaModal(); }
    const pg = document.getElementById('pixel-grid-modal');
    if (pg && !pg.classList.contains('hidden')) { I18N.applyStatic(pg); renderPixelGrid(); }
});

document.addEventListener('app:langchange', () => {
    if (typeof renderEntries === 'function') renderEntries();
    if (typeof updateProgressCard === 'function') updateProgressCard();
    const set = document.getElementById('settings-modal');
    if (set && !set.classList.contains('hidden')) I18N.applyStatic(set);
    const nm = document.getElementById('notifications-modal');
    if (nm && !nm.classList.contains('hidden')) I18N.applyStatic(nm);
    const lm = document.getElementById('language-modal');
    if (lm && !lm.classList.contains('hidden')) I18N.applyStatic(lm);
});

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

document.getElementById('toolbar-triggers-btn').onclick = () => {
    openTriggersModal('edit');
};


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
        showToast(I18N.t('toast.tableRemoved'), 'success');
    } else {
        showToast(I18N.t('toast.cursorNotInTable'), 'info');
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


// Обработчик кнопки сортировки
document.getElementById('sort-toggle-btn').onclick = () => {
    sortOrder = (sortOrder === 'desc') ? 'asc' : 'desc';
    
    // Меняем иконку (визуально переворачиваем)
    const icon = document.getElementById('sort-icon');
    if (sortOrder === 'asc') {
        // Стрелка вверх (сначала старые)
        icon.innerHTML = `
            <line x1="4" y1="18" x2="20" y2="18"></line>
            <line x1="4" y1="12" x2="14" y2="12"></line>
            <line x1="4" y1="6" x2="8" y2="6"></line>
        `;
    } else {
        // Стрелка вниз (сначала новые)
        icon.innerHTML = `
            <line x1="4" y1="6" x2="20" y2="6"></line>
            <line x1="4" y1="12" x2="14" y2="12"></line>
            <line x1="4" y1="18" x2="8" y2="18"></line>
        `;
    }
    
    renderEntries();
};

function drawWeekdayChart() {
    const canvas = document.getElementById('weekday-chart');
    if (!canvas || canvas.classList.contains('hidden')) return;

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
    const textColor = styles.getPropertyValue('--text-color').trim() || '#333';
    const gridColor = styles.getPropertyValue('--border-color').trim() || '#ddd';

    ctx.clearRect(0, 0, width, height);

    

    // Считаем ПРОСТОЕ среднее для каждой даты и раскладываем по дням недели

    const weekdayScores = [[], [], [], [], [], [], []];
    getDayIndex().forEach((arr, key) => {
        const s = calculateSmartDayScore(arr);
        if (s === null) return;
        weekdayScores[new Date(key + 'T12:00:00').getDay()].push(s);
    });

    // Теперь усредняем баллы по всем дням недели
    const weekdayData = weekdayScores.map(scores => {
        if (scores.length === 0) return { avgScore: null };
        const avg = scores.reduce((sum, val) => sum + val, 0) / scores.length;
        return { avgScore: avg };
    });


    const weekdays = ['day.sun', 'day.mon', 'day.tue', 'day.wed', 'day.thu', 'day.fri', 'day.sat'].map(k => I18N.t(k));
    const left = 30, right = 10, top = 30, bottom = 30;
    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;
    const barSpacing = chartWidth / 7;
    const barWidth = Math.min(barSpacing * 0.6, 30);
    const maxScore = 10;

    for (let i = 0; i <= 3; i++) {
        const score = i * 3;
        const y = top + chartHeight - (score / maxScore) * chartHeight;
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(width - right, y);
        ctx.stroke();

        ctx.fillStyle = textColor;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(score, left - 5, y + 4);
    }

    weekdayData.forEach((data, index) => {
        // Если за этот день нет данных (avgScore равен null), рисуем пустую полоску
        if (data.avgScore === null || data.avgScore === undefined) {
            ctx.fillStyle = gridColor;
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.roundRect(left + index * barSpacing + (barSpacing - barWidth) / 2, top + chartHeight - 2, barWidth, 2, [0, 0, 0, 0]);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        } else {
            const avgScore = data.avgScore;
            const barHeight = (avgScore / maxScore) * chartHeight;
            const x = left + index * barSpacing + (barSpacing - barWidth) / 2;
            const y = top + chartHeight - barHeight;

            // Берем эмодзи и цвет напрямую из нашей шкалы MOODS
            const matchedMood = MOODS.reduce((prev, curr) => {
                return (Math.abs(curr.score - avgScore) < Math.abs(prev.score - avgScore) ? curr : prev);
            });

            let emoji = matchedMood.emoji;
            let barColor;

            // Определяем цвет по реальному баллу
            if (matchedMood.score <= 2) barColor = '#F44336';      // Красный
            else if (matchedMood.score <= 4) barColor = '#FF9800'; // Оранжевый
            else if (matchedMood.score <= 6) barColor = '#0288D1'; // Голубой
            else if (matchedMood.score <= 8) barColor = '#8BC34A'; // Светло-зеленый
            else barColor = '#1B5E20';                             // Темно-зеленый

            ctx.fillStyle = barColor;
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
            ctx.fill();

            // === ОТРИСОВКА ИКОНКИ НАД СТОЛБЦОМ ===
            const emojiImg = moodImages[emoji];
            if (emojiImg) {
                ctx.drawImage(emojiImg, x + barWidth / 2 - 8, y - 24, 16, 16);
            } else {
                ctx.font = '16px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillStyle = textColor;
                ctx.fillText(emoji, x + barWidth / 2, y - 6);
            }
        }

        // Подпись дня недели (рисуется всегда)
        ctx.fillStyle = textColor;
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        // Вычисляем x для подписи: центр столбца
        const labelX = left + index * barSpacing + (barSpacing - barWidth) / 2 + barWidth / 2;
        ctx.fillText(weekdays[index], labelX, top + chartHeight + 8);
    });
}

function renderMonthInsights() {
    const container = document.getElementById('month-insights');
    if (!container) return;

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthEntries = [];
    getDayIndex().forEach((arr, key) => { if (key.startsWith(prefix)) monthEntries.push(...arr); });

    if (monthEntries.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px 0;">${I18N.t('calendar.monthEmpty')}</p>`;
        return;
    }

    const days = {};
    monthEntries.forEach(e => {
        const k = getDateKey(e.date);
        (days[k] = days[k] || []).push(e);
    });

    let bestDay = null, worstDay = null;
    for (const [dayKey, entries] of Object.entries(days)) {
        let total = 0, count = 0;
        entries.forEach(e => {
            const s = getMoodScore(e.mood);
            if (s !== null) { total += s; count++; }
        });
        if (!count) continue;
        const avgScore = total / count;
        const data = { date: dayKey, avgScore, emoji: getEmojiByScore(avgScore), entries };
        if (!bestDay || avgScore > bestDay.avgScore) bestDay = data;
        if (!worstDay || avgScore < worstDay.avgScore) worstDay = data;
    }

    const createCard = (data, isBest) => {
        if (!data) return '';
        const mainEntry = [...data.entries].sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0))[0];
        const plainText = getPlainTextFromHTML(mainEntry.content);
        const preview = plainText.length > 80 ? plainText.substring(0, 80) + '...' : plainText;
        const triggersHtml = (mainEntry.triggers && mainEntry.triggers.length)
            ? `<div class="insight-triggers">${mainEntry.triggers.map(t => `<span class="insight-trigger-chip">${escapeHtml(I18N.triggerLabel(t))}</span>`).join('')}</div>`
            : '';
        const dateStr = I18N.fmtDate(new Date(data.date + 'T12:00:00'), { day: 'numeric', month: 'long' });
        const label = I18N.t(isBest ? 'calendar.bestDay' : 'calendar.worstDay');
        return `
            <div class="insight-card ${isBest ? '' : 'bad'}">
                <div class="insight-header">
                    <span class="insight-date">${label}: ${dateStr}</span>
                    <span class="insight-mood">${getMoodSvg(data.emoji, 24)}</span>
                </div>
                <div class="insight-content">${preview ? escapeHtml(preview) : `<i>${I18N.t('calendar.noText')}</i>`}</div>
                ${triggersHtml}
            </div>`;
    };

    let html = '';
    if (bestDay) html += createCard(bestDay, true);
    if (worstDay && bestDay && worstDay.date !== bestDay.date) html += createCard(worstDay, false);
    else if (worstDay && !bestDay) html += createCard(worstDay, false);

    container.innerHTML = `<h3>${I18N.t('calendar.insightsTitle')}</h3>` +
        (html || `<p style="text-align:center; color:var(--text-muted);">${I18N.t('calendar.notEnough')}</p>`);
}


// === 🧭 НИЖНИЙ ТАБ-БАР ===

function setActiveNav(navId) {
    document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
        btn.classList.remove('active');
    });
    const btn = document.getElementById(navId);
    if (btn && !btn.classList.contains('nav-center')) {
        btn.classList.add('active');
    }
}

// 1. Гамбургер (Меню) — открывает/закрывает
document.getElementById('nav-menu-btn').onclick = () => {
    setActiveNav('nav-menu-btn');
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('open')) {
        closeSidebar();
    } else {
        openSidebar();
    }
};

// 2. Записи — закрывает всё и показывает главную
document.getElementById('nav-entries-btn').onclick = () => {
    closeAllTriggersList();
    const wasActive = document.getElementById('nav-entries-btn').classList.contains('active');
    
    // Если мы уже на вкладке "Записи" и все модалки закрыты — скроллим наверх
    if (wasActive) {
        const entryModalOpen = !document.getElementById('entry-modal').classList.contains('hidden');
        const statsOpen = !document.getElementById('stats-modal').classList.contains('hidden');
        const calendarOpen = !document.getElementById('calendar-modal').classList.contains('hidden');
        
        if (!entryModalOpen && !statsOpen && !calendarOpen) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
    }

    // Стандартное поведение (переключение на вкладку)
    setActiveNav('nav-entries-btn');
    closeStatsModal();
    closeCalendarScreen();
    closeSidebar();
    
    const entryModal = document.getElementById('entry-modal');
    if (!entryModal.classList.contains('hidden')) {
        if (isEditing) handleSaveEntry().finally(closeEntryForm);
        else closeEntryForm();
    }
    
    // Рендерим список и сбрасываем скролл в начало
    renderEntries();
    window.scrollTo({ top: 0, behavior: 'smooth' }); // <--- ДОБАВИЛИ ЭТУ СТРОКУ
};


// 3. Плюсик — новая запись
document.getElementById('nav-add-btn').onclick = () => {
    closeAllTriggersList();
    // Принудительно закрываем все открытые полноэкранные модалки и сайдбар
    closeStatsModal();
    closeCalendarScreen();
    closeSidebar();
    
    openMoodModal(true, false); // true = новая запись, false = обычный режим
};



// 4. Статистика — открывает статистику
document.getElementById('nav-stats-btn').onclick = () => {
    closeAllTriggersList();
    setActiveNav('nav-stats-btn');
    closeCalendarScreen();
    closeSidebar();
    
    window.scrollTo({ top: 0, behavior: 'auto' });
    
    openStatsModal();
};

// 5. Календарь — открывает календарь
document.getElementById('nav-calendar-btn').onclick = () => {
    closeAllTriggersList();
    setActiveNav('nav-calendar-btn');
    closeStatsModal();
    closeSidebar();
    
    window.scrollTo({ top: 0, behavior: 'auto' });
    
    openCalendarScreen();
};




// Заглушка для отсутствующего поля поиска (чтобы не было ошибок)
const searchInputEl = document.getElementById('search-input');
if (!searchInputEl) {
    // Если элемента нет, создаем скрытый пустышку в памяти (не в DOM)
    // Но лучше просто защитить код.
}



// === 📜 УМНАЯ ПРОКРУТКА ШАПКИ (АВТОДОКРУТ В ОБЕ СТОРОНЫ) ===
(function initSmartHeader() {
    const header = document.querySelector('.top-header');
    if (!header) return;
    let lastScrollTop = 0;
    let scrollDelta = 0;          // накопленная дельта с последней смены направления
    const THRESHOLD = 10;         // порог: 10px, чтобы отфильтровать дрожание
    const DEADZONE = 30;          // у самого верха шапка всегда видна
    let scrollTimer = null;

    window.addEventListener('scroll', () => {
        // Пока открыт поиск — шапка всегда видна, иначе поле уедет при скролле результатов
        if (header.classList.contains('search-open')) {
            header.classList.remove('header-hidden');
            return;
        }
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const delta = scrollTop - lastScrollTop;
        lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;

        // Сбрасываем дельту при смене направления
        if ((delta > 0 && scrollDelta < 0) || (delta < 0 && scrollDelta > 0)) {
            scrollDelta = 0;
        }
        scrollDelta += delta;

        clearTimeout(scrollTimer);

        if (scrollTop <= DEADZONE) {
            header.classList.remove('header-hidden');
            scrollDelta = 0;
            return;
        }

        if (scrollDelta > THRESHOLD) {
            header.classList.add('header-hidden');
        } else if (scrollDelta < -THRESHOLD) {
            header.classList.remove('header-hidden');
        }

        // Автодокрут при остановке: доводим до конца ПО НАПРАВЛЕНИЮ последнего движения
        scrollTimer = setTimeout(() => {
            const cur = window.pageYOffset || document.documentElement.scrollTop;
            if (cur <= DEADZONE) {
                // У самого верха шапка всегда открыта
                header.classList.remove('header-hidden');
            } else if (scrollDelta < -THRESHOLD) {
                // АВТОДОКРУТ ВВЕРХ: пользователь скроллил вверх — шапка остаётся открытой
                header.classList.remove('header-hidden');
            } else if (scrollDelta > 0) {
                // Автодокрут вниз: скроллил вниз (или микро-дрожание) — шапка остаётся скрытой
                header.classList.add('header-hidden');
            }
            // |delta| < порога и отрицательная (отскок инерции) — состояние не трогаем
            scrollDelta = 0;
        }, 180);
    }, { passive: true });
})();

// === 🎠 ВИДЖЕТЫ + СТОРИС + НОСТАЛЬГИЯ ===
const WIDGET_ICONS = {
    nostalgia: `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline><path d="M3.5 9 L3.5 4.5 L8 4.5"></path></svg>`
};
let activeWidgetIndex = 0;

// Безопасная привязка клика (не роняет скрипт, если элемента нет)
function bindClick(id, handler) {
    const el = document.getElementById(id);
    if (el) el.onclick = handler;
}
function bindBackdrop(selector, handler) {
    const el = document.querySelector(selector);
    if (el) el.onclick = handler;
}

function setActiveWidget(index) {
    activeWidgetIndex = index;
    ['widget-stats-btn', 'widget-nostalgia-btn'].forEach((id, i) => {
        const c = document.getElementById(id);
        if (!c) return;
        c.classList.toggle('is-active', i === index);
        c.setAttribute('aria-expanded', i === index ? 'true' : 'false');
    });
    document.querySelectorAll('.home-widgets-dot').forEach((d, i) => d.classList.toggle('active', i === index));
}

function getNostalgiaEntries() {
    const now = new Date();
    const m = now.getMonth(), d = now.getDate(), y = now.getFullYear();
    return diaryEntries
        .filter(e => {
            const t = new Date(e.date);
            return t.getMonth() === m && t.getDate() === d && t.getFullYear() < y;
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderWidgetPreviews() {
    const cutoff = Date.now() - 30 * 86400000;
    const scores = diaryEntries
        .filter(e => new Date(e.date).getTime() >= cutoff)
        .map(e => getMoodScore(e.mood))
        .filter(v => v !== null);
    const sNote = document.getElementById('widget-stats-note');
    if (sNote) sNote.textContent = scores.length
        ? I18N.t('widgets.statsNote', { avg: (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) })
        : I18N.t('widgets.statsEmpty');
    const mem = getNostalgiaEntries();
    const nNote = document.getElementById('widget-nostalgia-note');
    if (nNote) nNote.textContent = mem.length
        ? I18N.plural(mem.length, 'unit.memory')
        : I18N.t('widgets.memEmpty');
}

// --- Плавный цвет настроения (интерполяция 5 уровней) ---
function storyMoodColor(score) {
    const stops = [
        { s: 1.5, c: [244, 67, 54] },
        { s: 3.5, c: [255, 152, 0] },
        { s: 5.5, c: [2, 136, 209] },
        { s: 7.5, c: [139, 195, 74] },
        { s: 9.5, c: [27, 94, 32] }
    ];
    const s = Math.max(1, Math.min(10, score));
    let a = stops[0], b = stops[stops.length - 1];
    if (s <= a.s) b = a;
    else if (s >= b.s) a = b;
    else {
        for (let i = 0; i < stops.length - 1; i++) {
            if (s >= stops[i].s && s <= stops[i + 1].s) { a = stops[i]; b = stops[i + 1]; break; }
        }
    }
    const t = b.s === a.s ? 0 : (s - a.s) / (b.s - a.s);
    const rgb = a.c.map((ch, k) => Math.round(ch + (b.c[k] - ch) * t));
    return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
}

// === СТОРИС: ДВИЖОК (единственная версия) ===
const STORIES_DURATION = 6500;
let storiesOpen = false, storiesIndex = 0, storiesProgress = 0, storiesPaused = false;
let storiesRaf = null, storiesLastTs = 0;

function openStoriesModal() {
    closeStatsModal();
    closeCalendarScreen();
    closeChartModal();
    closeSidebar();
    storiesOpen = true;
    storiesIndex = 0;
    storiesProgress = 0;
    storiesPaused = false;
    document.getElementById('bottomNav').classList.add('nav-hidden');
    document.body.style.overflow = 'hidden';
    document.getElementById('stories-modal').classList.remove('hidden');
    showStorySlide(0);
    storiesLastTs = performance.now();
    cancelAnimationFrame(storiesRaf);
    storiesRaf = requestAnimationFrame(storiesTick);
}

function closeStoriesModal() {
    storiesOpen = false;
    cancelAnimationFrame(storiesRaf);
    storiesRaf = null;
    const modal = document.getElementById('stories-modal');
    if (modal) modal.classList.add('hidden');
    document.getElementById('bottomNav').classList.remove('nav-hidden');
    document.body.style.overflow = '';
}

function storiesTick(ts) {
    if (!storiesOpen) return;
    const dt = Math.min(100, ts - storiesLastTs);
    storiesLastTs = ts;
    if (!storiesPaused) {
        storiesProgress += dt;
        if (storiesProgress >= STORIES_DURATION) {
            nextStory();
            if (!storiesOpen) return; // модалка закрылась на последнем слайде
        }
    }
    updateStoriesProgressUI();
    storiesRaf = requestAnimationFrame(storiesTick);
}

function updateStoriesProgressUI() {
    document.querySelectorAll('#stories-progress .stories-seg').forEach((seg, i) => {
        const fill = seg.querySelector('.stories-seg-fill');
        if (!fill) return;
        fill.style.width = i < storiesIndex ? '100%'
            : i === storiesIndex ? Math.min(100, (storiesProgress / STORIES_DURATION) * 100) + '%'
            : '0%';
    });
    const counter = document.getElementById('stories-counter');
    if (counter) counter.textContent = (storiesIndex + 1) + '/3';
}

function showStorySlide(i) {
    storiesIndex = i;
    storiesProgress = 0;
    document.querySelectorAll('#stories-modal .story-slide').forEach((s, k) => s.classList.toggle('is-active', k === i));
    if (i === 0) requestAnimationFrame(drawStoryMoodChart);
    if (i === 1) renderStoryWeek();
    if (i === 2) requestAnimationFrame(animateMonthCompare);
    updateStoriesProgressUI();
}

function nextStory() {
    if (storiesIndex < 2) showStorySlide(storiesIndex + 1);
    else closeStoriesModal();
}
function prevStory() {
    if (storiesIndex > 0) showStorySlide(storiesIndex - 1);
    else storiesProgress = 0;
}

// === СТОРИС 1: ГРАДИЕНТНЫЙ ГРАФИК НАСТРОЕНИЙ ===
function drawStoryMoodChart() {
    const canvas = document.getElementById('story-mood-chart');
    if (!canvas || !storiesOpen) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = rect.width, h = 250;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const left = 30, right = 10, top = 14, bottom = 26;
    const plotW = w - left - right, plotH = h - top - bottom;
    const xForDay = d => left + ((d - 1) / Math.max(1, daysInMonth - 1)) * plotW;
    const yForScore = s => top + ((10 - s) / 9) * plotH;
    const baseline = top + plotH;

    ctx.font = '10px sans-serif';
    [1, 4, 7, 10].forEach(s => {
        const y = yForScore(s);
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(w - right, y); ctx.stroke();
        const img = moodImages[getEmojiByScore(s)];
        if (img) ctx.drawImage(img, 4, y - 8, 16, 16);
        else {
            ctx.fillStyle = '#93a1ad'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(String(s), 6, y);
        }
    });
    ctx.fillStyle = '#93a1ad'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const step = plotW < 260 ? 7 : 5;
    for (let d = 1; d <= daysInMonth; d += step) ctx.fillText(String(d), xForDay(d), baseline + 8);

    const byDay = {};
    diaryEntries.forEach(e => {
        const t = new Date(e.date);
        if (t.getFullYear() !== year || t.getMonth() !== month) return;
        const k = t.getDate();
        (byDay[k] = byDay[k] || []).push(e);
    });
    const pts = Object.entries(byDay)
        .map(([d, es]) => ({ day: +d, s: calculateSmartDayScore(es) }))
        .filter(p => p.s !== null)
        .sort((a, b) => a.day - b.day)
        .map(p => ({ x: xForDay(p.day), y: yForScore(p.s), s: p.s, day: p.day }));

    const sub = document.getElementById('story-chart-sub');
    const cap = document.getElementById('story-chart-caption');
    if (sub) sub.textContent = I18N.fmtDate(now, { month: 'long', year: 'numeric' });

    if (pts.length === 0) {
        ctx.fillStyle = '#93a1ad'; ctx.font = '12px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(I18N.t('chart.emptyMonth'), w / 2, top + plotH / 2);
        if (cap) cap.textContent = I18N.t('story.addEntry');
        return;
    }
    if (pts.length > 1) {
        ctx.save();
        ctx.globalAlpha = 0.22;
        for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i];
            const g = ctx.createLinearGradient(a.x, 0, b.x, 0);
            g.addColorStop(0, storyMoodColor(a.s));
            g.addColorStop(1, storyMoodColor(b.s));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.lineTo(b.x, baseline); ctx.lineTo(a.x, baseline);
            ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i];
            const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
            g.addColorStop(0, storyMoodColor(a.s));
            g.addColorStop(1, storyMoodColor(b.s));
            ctx.strokeStyle = g;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
    }
    pts.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = storyMoodColor(p.s); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#0c1116'; ctx.stroke();
    });
    const avg = pts.reduce((s, p) => s + p.s, 0) / pts.length;
    const total = Object.values(byDay).reduce((s, es) => s + es.length, 0);
        if (cap) cap.innerHTML = `${I18N.t('story.avgPrefix')} <strong>${avg.toFixed(1)}</strong> ${getMoodSvg(getEmojiByScore(avg), 18)} · ${I18N.t('story.counts', { entries: total, days: pts.length })}`;
}

// === СТОРИС 2: ПРОШЛАЯ НЕДЕЛЯ ===
function renderStoryWeek() {
    const box = document.getElementById('story-last-week');
    if (!box) return;
    const today = new Date();
    const dow = today.getDay() === 0 ? 7 : today.getDay();
    const start = new Date(today);
    start.setDate(today.getDate() - dow - 6);
    start.setHours(0, 0, 0, 0);

    const byDay = {};
    diaryEntries.forEach(e => {
        const k = getDateKey(e.date);
        (byDay[k] = byDay[k] || []).push(e);
    });

    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const es = byDay[getDateKey(d)] || [];
        days.push({ d, avg: calculateSmartDayScore(es), count: es.length });
    }

    const title = `<h3 class="story-title">${I18N.t('deep.lastWeekTitle')}</h3>`;
    if (days.filter(x => x.avg !== null).length < 3) {
        box.innerHTML = `${title}<p class="story-caption" style="margin-top:10px;">${I18N.t('story.weekEmpty1')}<br>${I18N.t('story.weekEmpty2')}</p>`;
        return;
    }

    const valid = days.map((x, i) => x.avg !== null ? i : -1).filter(i => i !== -1);
    const first = valid[0], last = valid[valid.length - 1];
    const stops = [];
    if (first === last) {
        const c = storyMoodColor(days[first].avg);
        stops.push(`${c} 0%`, `${c} 100%`);
    } else {
        for (let i = first; i < last; i++) {
            const p0 = ((i - first) / (last - first)) * 100;
            const p1 = ((i + 1 - first) / (last - first)) * 100;
            const c0 = days[i].avg !== null ? storyMoodColor(days[i].avg) : '#3a4652';
            const c1 = days[i + 1].avg !== null ? storyMoodColor(days[i + 1].avg) : '#3a4652';
            if (i === first) stops.push(`${c0} ${p0}%`);
            stops.push(`${c1} ${p1}%`);
        }
    }
    const gradient = `linear-gradient(90deg, ${stops.join(', ')})`;
    const DAY_KEYS = ['day.mon', 'day.tue', 'day.wed', 'day.thu', 'day.fri', 'day.sat', 'day.sun'];

    const cells = days.map((x, i) => {
        if (i !== 0 && i !== 3 && i !== 6) return '';
        return `
            <div style="position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:4px;">
                <div style="width:44px;height:44px;border-radius:50%;background:#1b232c;border:2px solid ${x.avg !== null ? storyMoodColor(x.avg) : '#2d3945'};display:flex;align-items:center;justify-content:center;">
                    ${x.avg !== null ? getMoodSvg(getEmojiByScore(x.avg), 26) : '<span style="color:#6d7a86;font-size:.8em;">—</span>'}
                </div>
                <span style="font-size:.7em;color:#93a1ad;">${I18N.t(DAY_KEYS[i])}</span>
                <span style="font-size:.62em;color:#6d7a86;">${I18N.fmtDate(x.d, { day: 'numeric', month: 'short' })}</span>
            </div>`;
    }).join('');

    const scored = days.filter(x => x.avg !== null);
    const weekAvg = scored.reduce((s, x) => s + x.avg, 0) / scored.length;
    const trig = {};
    const weekEnd = new Date(start.getTime() + 7 * 86400000);
    diaryEntries.forEach(e => {
        const t = new Date(e.date);
        if (t >= start && t < weekEnd && e.triggers) e.triggers.forEach(x => trig[x] = (trig[x] || 0) + 1);
    });
    const top = Object.entries(trig).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);

    box.innerHTML = `${title}
        <div style="position:relative;display:flex;align-items:center;justify-content:space-between;padding:0 6px;margin:22px 0 10px;">
            <div style="position:absolute;top:22px;left:26px;right:26px;height:4px;border-radius:2px;background:${gradient};z-index:1;"></div>
            ${cells}
        </div>
        <p class="story-caption">${I18N.t('story.weekAvg')} <strong>${weekAvg.toFixed(1)}</strong> ${getMoodSvg(getEmojiByScore(weekAvg), 18)}</p>
        ${top.length ? `<p class="story-sub" style="margin-top:6px;">${I18N.t('story.topTriggers')} ${escapeHtml(top.map(x => I18N.triggerLabel(x)).join(', '))}</p>` : ''}`;
}

// === СТОРИС 3: СРАВНЕНИЕ МЕСЯЦЕВ ===
function monthDayAverage(year, month) {
    const byDay = {};
    diaryEntries.forEach(e => {
        const t = new Date(e.date);
        if (t.getFullYear() !== year || t.getMonth() !== month) return;
        const k = getDateKey(e.date);
        (byDay[k] = byDay[k] || []).push(e);
    });
    const scores = Object.values(byDay).map(es => calculateSmartDayScore(es)).filter(v => v !== null);
    if (!scores.length) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function animateMonthCompare() {
    const now = new Date();
    const curY = now.getFullYear(), curM = now.getMonth();
    const prevDate = new Date(curY, curM - 1, 1);
    const prevAvg = monthDayAverage(prevDate.getFullYear(), prevDate.getMonth());
    const curAvg = monthDayAverage(curY, curM);
    const trackH = 210;
    const setup = (suffix, avg, dateObj) => {
        const bar = document.getElementById('mc-bar-' + suffix);
        const emoji = document.getElementById('mc-emoji-' + suffix);
        const score = document.getElementById('mc-score-' + suffix);
        const label = document.getElementById('mc-label-' + suffix);
        if (!bar || !emoji || !score || !label) return;
        label.textContent = I18N.fmtDate(dateObj, { month: 'long' });
        bar.style.transition = 'none';
        emoji.style.transition = 'none';
        score.style.transition = 'none';
        bar.style.height = '0%';
        emoji.style.bottom = '8px';
        score.style.bottom = '46px';
        if (avg === null) {
            bar.style.background = '#2d3945';
            emoji.innerHTML = '<span style="color:#6d7a86;font-size:1.2em;line-height:34px;display:inline-block;">—</span>';
            score.textContent = I18N.t('story.noData');
            score.style.fontSize = '.62em';
        } else {
            const c = storyMoodColor(avg);
            bar.style.background = `linear-gradient(180deg, ${c} 0%, ${c}cc 100%)`;
            emoji.innerHTML = getMoodSvg(getEmojiByScore(avg), 34);
            score.textContent = avg.toFixed(1);
            score.style.fontSize = '.8em';
        }
        void bar.offsetHeight;
        bar.style.transition = '';
        emoji.style.transition = '';
        score.style.transition = '';
        const hPct = avg === null ? 2 : Math.max(4, (avg / 10) * 100);
        requestAnimationFrame(() => {
            bar.style.height = hPct + '%';
            const px = (hPct / 100) * trackH;
            emoji.style.bottom = (px + 10) + 'px';
            score.style.bottom = (px + 48) + 'px';
        });
    };
    setup('prev', prevAvg, prevDate);
    setup('cur', curAvg, now);
    const cap = document.getElementById('mc-caption');
    if (!cap) return;
    if (prevAvg === null || curAvg === null) {
        cap.textContent = I18N.t('story.compareEmpty');
    } else {
        const diff = curAvg - prevAvg;
        const curName = I18N.fmtDate(now, { month: 'long' });
        const prevName = I18N.fmtDate(prevDate, { month: 'long' });
        const points = (v) => I18N.plural(Math.abs(v), 'unit.point', { n: Math.abs(v).toFixed(1) });
        if (Math.abs(diff) < 0.15) {
            cap.textContent = I18N.t('story.compareSame', { a: curName, b: prevName });
        } else if (diff > 0) {
            cap.innerHTML = `${I18N.t('story.compareBetter', { a: curName, b: prevName })} <strong>${points(diff)}</strong> ${getMoodSvg(getEmojiByScore(curAvg), 18)}`;
        } else {
            cap.innerHTML = `${I18N.t('story.compareLower', { a: curName, b: prevName })} <strong>${points(diff)}</strong>`;
        }
    }
}

// === НОСТАЛЬГИЯ: МОДАЛКА ===
function openNostalgiaModal() {
    document.getElementById('bottomNav').classList.add('nav-hidden');
    document.body.style.overflow = 'hidden';

    const list = document.getElementById('nostalgia-list');
    const mem = getNostalgiaEntries();
    if (!mem.length) {
        list.innerHTML = `<p class="nostalgia-empty">${I18N.t('nostalgia.empty1')}<br>${I18N.t('nostalgia.empty2')}</p>`;
    } else {
        list.innerHTML = mem.map(e => {
            const t = getPlainTextFromHTML(e.content || '');
            const years = new Date().getFullYear() - new Date(e.date).getFullYear();
            return `<button class="nostalgia-row" type="button" data-entry-id="${e.id}">
                <span class="nostalgia-years">${I18N.plural(years, 'unit.year')} ${I18N.t('nostalgia.ago')}</span>
                <span class="nostalgia-mood">${getMoodSvg(e.mood, 22)}</span>
                <span class="nostalgia-text">${escapeHtml(t ? t.slice(0, 110) : (e.title || I18N.t('nostalgia.noText')))}</span>
            </button>`;
        }).join('');
    }
    document.getElementById('nostalgia-modal').classList.remove('hidden');
}

function closeNostalgiaModal() {
    document.getElementById('nostalgia-modal').classList.add('hidden');
    document.getElementById('bottomNav').classList.remove('nav-hidden');
    document.body.style.overflow = '';
}

// === ПРИВЯЗКА (по одному разу на элемент) ===
bindClick('widget-stats-btn', openStoriesModal);
bindClick('widget-nostalgia-btn', openNostalgiaModal);
bindClick('close-stories-btn', closeStoriesModal);
bindBackdrop('#stories-modal .modal-backdrop', closeStoriesModal);
bindClick('story-next-btn', nextStory);
bindClick('story-prev-btn', prevStory);
bindClick('close-nostalgia-btn', closeNostalgiaModal);
bindBackdrop('#nostalgia-modal .modal-backdrop', closeNostalgiaModal);

const nostalgiaList = document.getElementById('nostalgia-list');
if (nostalgiaList) {
    nostalgiaList.addEventListener('click', (e) => {
        const row = e.target.closest('.nostalgia-row');
        if (!row) return;
        const entry = diaryEntries.find(x => x.id === row.dataset.entryId);
        closeNostalgiaModal();
        if (entry) openEntryForm(entry);
    });
}

document.addEventListener('keydown', (e) => {
    if (!storiesOpen) return;
    if (e.key === 'Escape') closeStoriesModal();
    if (e.key === 'ArrowRight') nextStory();
    if (e.key === 'ArrowLeft') prevStory();
});

(function initWidgetsAndStories() {
    const row = document.getElementById('home-widgets-row');
    if (row) {
        let downX = 0, downY = 0, dragging = false, suppress = false;
        row.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; dragging = true; });
        row.addEventListener('pointerup', (e) => {
            if (!dragging) return;
            dragging = false;
            const dx = e.clientX - downX, dy = e.clientY - downY;
            if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
                suppress = true;
                setTimeout(() => { suppress = false; }, 120);
                setActiveWidget(dx < 0 ? 1 : 0);
            }
        });
        row.addEventListener('pointercancel', () => { dragging = false; });
        row.addEventListener('click', (e) => {
            if (suppress) { e.stopPropagation(); e.preventDefault(); }
        }, true);
    }
    const stage = document.getElementById('stories-stage');
    if (stage) {
        let sx = 0, sy = 0, holding = false;
        stage.addEventListener('pointerdown', (e) => {
            holding = true; storiesPaused = true;
            sx = e.clientX; sy = e.clientY;
        });
        stage.addEventListener('pointerup', (e) => {
            if (!holding) return;
            holding = false; storiesPaused = false;
            const dx = e.clientX - sx, dy = e.clientY - sy;
            if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
                if (dx < 0) nextStory(); else prevStory();
            }
        });
        stage.addEventListener('pointercancel', () => { holding = false; storiesPaused = false; });
        stage.addEventListener('pointerleave', () => { if (holding) { holding = false; storiesPaused = false; } });
    }
    window.addEventListener('resize', () => {
        if (storiesOpen && storiesIndex === 0) {
            clearTimeout(initWidgetsAndStories._t);
            initWidgetsAndStories._t = setTimeout(drawStoryMoodChart, 200);
        }
    });
})();

// === ⭐ ИЗБРАННОЕ ===
bindClick('header-favorite-btn', async () => {
    if (!editingEntryId) return;
    const entry = diaryEntries.find(e => e.id === editingEntryId);
    if (!entry) return;
    entry.favorite = !entry.favorite;
    const starSlot = document.getElementById('icon-star-slot');
    const favBtn = document.getElementById('header-favorite-btn');
    if (starSlot) starSlot.innerHTML = entry.favorite ? NAV_ICONS.starFilled : NAV_ICONS.star;
    if (favBtn) favBtn.style.opacity = entry.favorite ? '1' : '0.6';
    await dbPut(entry);
    scheduleRender('list');
});

function applyFavoriteFilter() {
    activeFavoriteFilter = true;
    activeTagFilter = null;
    activeDateFilter = null;
    activeMoodFilter = null;
    activeTriggerFilter = null;
    searchQuery = '';
    if (multiDeleteMode) exitMultiDeleteMode();
    closeSidebar();
    document.getElementById('header-title').textContent = I18N.t('favorites.title');
    document.getElementById('search-btn').classList.add('hidden');
    document.getElementById('header-clear-filter-btn').classList.remove('hidden');
    appMain.classList.add('search-active');
    renderEntries();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearActiveFilter() {
    activeFavoriteFilter = false;
    activeTagFilter = null;
    activeDateFilter = null;
    activeMoodFilter = null;
    activeTriggerFilter = null;
    searchQuery = '';
    document.getElementById('header-title').textContent = I18N.t('app.brand');
    document.getElementById('header-clear-filter-btn').classList.add('hidden');
    document.getElementById('search-btn').classList.remove('hidden');
    appMain.classList.remove('search-active');
    renderEntries();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// === 🔥 ПРОГРЕСС ===
function updateProgressCard() {
    const progressText = document.getElementById('progress-days-text');
    const progressFill = document.getElementById('progress-bar-fill');
    if (!progressText || !progressFill) return;
    const daysWithEntries = new Set(diaryEntries.map(e => getDateKey(e.date)));
    let streak = 0;
    let currentDate = new Date();
    if (!daysWithEntries.has(getDateKey(currentDate))) currentDate.setDate(currentDate.getDate() - 1);
    while (daysWithEntries.has(getDateKey(currentDate))) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
    }
    progressText.textContent = I18N.t('progress.streak', { count: I18N.plural(streak, 'unit.day') });
    progressFill.style.width = `${Math.min((streak / 7) * 100, 100)}%`;
    renderWidgetPreviews();
    checkAchievements();
}

bindClick('sidebar-favorites-btn', applyFavoriteFilter);
bindClick('header-clear-filter-btn', clearActiveFilter);

// === 💫 RIPPLE ДЛЯ КНОПОК РЕЖИМА  ===
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement('span');
    ripple.className = 'btn-ripple';
    ripple.style.width = ripple.style.height = size + 'px';
    // Центр волны — точка касания (для клавиатуры — центр кнопки)
    const x = (e.clientX || rect.left + rect.width / 2) - rect.left - size / 2;
    const y = (e.clientY || rect.top + rect.height / 2) - rect.top - size / 2;
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 500);
});


// === 🎯 ТРИГГЕРЫ: КАТАЛОГ, ВЫБОР, СОЗДАНИЕ, РЕДАКТИРОВАНИЕ, УДАЛЕНИЕ ===
const TRIGGER_CATALOG_KEY = 'my_web_diary_trigger_catalog_v1';
const CUSTOM_TRIGGERS_KEY = 'my_web_diary_custom_triggers_v1'; // legacy: миграция

function loadTriggerCatalog() {
    try {
        const raw = JSON.parse(localStorage.getItem(TRIGGER_CATALOG_KEY));
        if (Array.isArray(raw) && raw.length) return raw;
    } catch (e) { /* повреждённые данные — пересоздаём */ }
    // Первый запуск: сид из встроенных групп
    const groups = TRIGGER_GROUPS.map(g => ({
        id: g.id, name: g.name, icon: g.icon,
        triggers: g.triggers.map((t, i) => ({ id: 'b_' + g.id + '_' + i, name: t.name, icon: t.icon }))
    }));
    // Миграция ранее созданных кастомных триггеров
    try {
        const old = JSON.parse(localStorage.getItem(CUSTOM_TRIGGERS_KEY)) || [];
        if (Array.isArray(old)) {
            old.forEach((c, i) => {
                const g = groups.find(x => x.id === c.group);
                if (g && c.name && c.icon) g.triggers.push({ id: 'c_' + Date.now().toString(36) + '_' + i, name: c.name, icon: c.icon });
            });
        }
    } catch (e) { /* нет legacy-данных — ок */ }
    localStorage.setItem(TRIGGER_CATALOG_KEY, JSON.stringify(groups));
    return groups;
}
let triggerCatalog = loadTriggerCatalog();
function saveTriggerCatalog() {
    localStorage.setItem(TRIGGER_CATALOG_KEY, JSON.stringify(triggerCatalog));
}
function findTriggerById(id) {
    for (const g of triggerCatalog) {
        const t = g.triggers.find(x => x.id === id);
        if (t) return { group: g, trigger: t };
    }
    return null;
}

let triggersModalMode = 'new';   // 'new' | 'edit'
let pendingNewMood = null;
let triggersSelection = [];
let newTriggerDraft = { name: '', icon: null, group: null };
let editingTriggerId = null;     // null = создание, id = редактирование
let triggerActionsTarget = null;

// Пул иконок: только НЕ занятые триггерами (12 новых + запас)
const TRIGGER_ICON_POOL = [
    '🔞','💦','🏆','🌈','🥂','💑','🖕','💻','💊','🔍','🍂','👄',
    '❤️','🐶','🐱','☀️','🌧️','💼','🎵','✈️','🛒','💰','🧹','📱',
    '☕','🍷','⚽','🎁','🌙','🔥','🎓','🏠','🚗','🌊','🍕','🍺',
    '🎤','📷','🧠','💡','🛌','🤝','🧩','❓','💬','👎','👍','🟢',
];
function getAvailableIcons(exceptId = null) {
    const used = new Set();
    triggerCatalog.forEach(g => g.triggers.forEach(t => {
        if (t.id !== exceptId) used.add(t.icon);
    }));
    return TRIGGER_ICON_POOL.filter(ic => !used.has(ic));
}

function triggerKey(t) { return `${t.icon} ${t.name}`; }

function startTriggersFlow(mood) {
    if (window.DiarySettings && !window.DiarySettings.triggersEnabled) {
        openEntryForm(null, mood, []);
        return;
    }
    pendingNewMood = mood;
    openTriggersModal('new');
}
function openTriggersModal(mode) {
    triggersModalMode = mode;
    triggersSelection = mode === 'edit' ? [...tempTriggers] : [];
    renderTriggersGroups();
    document.getElementById('triggers-modal').classList.remove('hidden');
    document.body.classList.add('modal-lock');
    document.getElementById('bottomNav').classList.add('nav-hidden');
}
function closeTriggersModal() {
    const modal = document.getElementById('triggers-modal');
    if (modal) modal.classList.add('hidden');
    document.body.classList.remove('modal-lock');
    syncTriggersNav();
}
function syncTriggersNav() {
    const nav = document.getElementById('bottomNav');
    if (!nav) return;
    const ids = ['entry-modal', 'triggers-modal', 'add-trigger-modal', 'trigger-actions-modal', 'stories-modal', 'nostalgia-modal'];
    const anyOpen = ids.some(id => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden');
    });
    nav.classList.toggle('nav-hidden', anyOpen);
}

function renderTriggersGroups() {
    const box = document.getElementById('triggers-groups-container');
    if (!box) return;
    box.innerHTML = `<p class="triggers-hint">${I18N.t('trig.hint')}</p>` +
        triggerCatalog.map((g, gi) => `
        <section class="trigger-group">
            <h3 class="trigger-group-title"><span class="trigger-group-dot"><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5.2" fill="none" stroke="currentColor" stroke-opacity="0.35" stroke-width="1.4"/><circle cx="6" cy="6" r="2.8" fill="currentColor"/></svg></span>${I18N.t('trig.group.' + g.id)}</h3>
            <div class="triggers-grid">
                ${g.triggers.map(t => {
                    const key = triggerKey(t);
                    const active = triggersSelection.includes(key) ? ' active' : '';
                    return `<button type="button" class="trigger-chip${active}" data-id="${t.id}" data-trigger="${escapeHtml(key)}">${t.icon} ${escapeHtml(I18N.triggerLabel(t.name))}</button>`;
                }).join('')}
                ${gi === triggerCatalog.length - 1 ? `<button type="button" class="trigger-add-btn" title="${escapeHtml(I18N.t('trig.add'))}" aria-label="${escapeHtml(I18N.t('trig.add'))}">${NAV_ICONS.plus}</button>` : ''}
            </div>
        </section>`).join('');
}

// === 👆 ДОЛГОЕ НАЖАТИЕ → КОНТЕКСТНОЕ МЕНЮ ===
const tgContainer = document.getElementById('triggers-groups-container');
let lpTimer = null, lpFired = false, lpX = 0, lpY = 0;

tgContainer.addEventListener('pointerdown', (e) => {
    const chip = e.target.closest('.trigger-chip');
    if (!chip) return;
    lpFired = false;
    lpX = e.clientX; lpY = e.clientY;
    clearTimeout(lpTimer);
    lpTimer = setTimeout(() => {
        lpFired = true;
        if (navigator.vibrate) navigator.vibrate(30);
        const found = findTriggerById(chip.dataset.id);
        if (found) openTriggerActions(found.trigger);
    }, 500);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
    tgContainer.addEventListener(ev, () => clearTimeout(lpTimer))
);
tgContainer.addEventListener('pointermove', (e) => {
    if (Math.abs(e.clientX - lpX) > 10 || Math.abs(e.clientY - lpY) > 10) clearTimeout(lpTimer);
});
tgContainer.addEventListener('contextmenu', (e) => {
    const chip = e.target.closest('.trigger-chip');
    if (!chip) return;
    e.preventDefault();
    clearTimeout(lpTimer);
    const found = findTriggerById(chip.dataset.id);
    if (found) openTriggerActions(found.trigger);
});

tgContainer.addEventListener('click', (e) => {
    if (lpFired) { lpFired = false; return; }
    if (e.target.closest('.trigger-add-btn')) { openAddTriggerModal(); return; }
    const chip = e.target.closest('.trigger-chip');
    if (!chip) return;
    const key = chip.dataset.trigger;
    if (triggersSelection.includes(key)) {
        triggersSelection = triggersSelection.filter(k => k !== key);
        chip.classList.remove('active');
    } else {
        triggersSelection.push(key);
        chip.classList.add('active');
    }
});

// Галочка: работает даже без выбранных триггеров
document.getElementById('triggers-save-btn').onclick = () => {
    if (triggersModalMode === 'new') {
        const mood = pendingNewMood || '😐';
        const sel = [...triggersSelection];
        closeTriggersModal();
        openEntryForm(null, mood, sel);
    } else {
        tempTriggers = [...triggersSelection];
        closeTriggersModal();
        onEntryFieldInput();
    }
};
document.querySelector('#triggers-modal .modal-backdrop').onclick = closeTriggersModal;

// === 🗂️ КОНТЕКСТНОЕ МЕНЮ: ИЗМЕНИТЬ / УДАЛИТЬ ===
function openTriggerActions(trigger) {
    triggerActionsTarget = trigger;
    document.getElementById('trigger-actions-name').innerHTML = `${trigger.icon} ${escapeHtml(trigger.name)}`;
    document.getElementById('trigger-actions-modal').classList.remove('hidden');
}
function closeTriggerActions() {
    document.getElementById('trigger-actions-modal').classList.add('hidden');
    triggerActionsTarget = null;
}
document.getElementById('trigger-edit-btn').onclick = () => {
    const t = triggerActionsTarget;
    closeTriggerActions();
    if (t) openAddTriggerModal(t.id);
};
document.getElementById('trigger-delete-btn').onclick = async () => {
    const t = triggerActionsTarget;
    closeTriggerActions();
    if (t) await deleteTriggerById(t.id);
};
document.querySelector('#trigger-actions-modal .modal-backdrop').onclick = closeTriggerActions;

async function deleteTriggerById(id) {
    const found = findTriggerById(id);
    if (!found) return;
    const key = triggerKey(found.trigger);
    found.group.triggers = found.group.triggers.filter(t => t.id !== id);
    saveTriggerCatalog();
    triggersSelection = triggersSelection.filter(k => k !== key);
    // Полное удаление: вычищаем триггер из всех записей
    let touched = false;
    diaryEntries.forEach(en => {
        if (Array.isArray(en.triggers) && en.triggers.includes(key)) {
            en.triggers = en.triggers.filter(k => k !== key);
            en.updatedAt = Date.now();
            touched = true;
        }
    });
    renderTriggersGroups();
    if (touched) {
        try { await saveAllToIndexedDB(); }
        catch (err) { console.error(err); showToast(I18N.t('trig.saveFailed'), 'error'); }
        scheduleRender('list', 'calendar', 'progress');
    }
    showToast(I18N.t('trig.deleted'), 'success');
}

// === ➕ СОЗДАНИЕ / ✏️ РЕДАКТИРОВАНИЕ ТРИГГЕРА ===
function openAddTriggerModal(triggerId = null) {
    editingTriggerId = triggerId;
    const title = document.getElementById('add-trigger-title');
    if (triggerId) {
        const found = findTriggerById(triggerId);
        if (!found) return;
        newTriggerDraft = { name: found.trigger.name, icon: found.trigger.icon, group: found.group.id };
        if (title) title.textContent = I18N.t('trig.edit');
    } else {
        newTriggerDraft = { name: '', icon: null, group: null };
        if (title) title.textContent = I18N.t('trig.add');
    }
    document.getElementById('new-trigger-name').value = newTriggerDraft.name;
    updatePickerRows();
    validateNewTrigger();
    document.getElementById('add-trigger-modal').classList.remove('hidden');
    if (!triggerId) setTimeout(() => document.getElementById('new-trigger-name').focus(), 100);
}
function closeAddTriggerModal() {
    const modal = document.getElementById('add-trigger-modal');
    if (modal) modal.classList.add('hidden');
    const gp = document.getElementById('group-pick-modal');
    const ip = document.getElementById('icon-pick-modal');
    const ta = document.getElementById('trigger-actions-modal');
    if (gp) gp.classList.add('hidden');
    if (ip) ip.classList.add('hidden');
    if (ta) ta.classList.add('hidden');
    editingTriggerId = null;
}

function updatePickerRows() {
    const gVal = document.getElementById('picked-group-value');
    const iVal = document.getElementById('picked-icon-value');
    const g = triggerCatalog.find(x => x.id === newTriggerDraft.group);
    gVal.textContent = g ? `${g.icon} ${I18N.t('trig.group.' + g.id)}` : I18N.t('trig.chooseGroup');
    gVal.classList.toggle('placeholder', !g);
    iVal.textContent = newTriggerDraft.icon || I18N.t('trig.chooseIcon');
    iVal.classList.toggle('placeholder', !newTriggerDraft.icon);
}

function validateNewTrigger() {
    const ok = newTriggerDraft.name.trim().length > 0 && !!newTriggerDraft.icon && !!newTriggerDraft.group;
    document.getElementById('save-new-trigger-btn').disabled = !ok;
}

document.getElementById('new-trigger-name').addEventListener('input', (e) => {
    newTriggerDraft.name = e.target.value;
    validateNewTrigger();
});
document.getElementById('close-add-trigger-btn').onclick = closeAddTriggerModal;
document.querySelector('#add-trigger-modal .modal-backdrop').onclick = closeAddTriggerModal;

// Подмодалка: выбор группы
document.getElementById('pick-group-btn').onclick = () => {
    document.getElementById('group-pick-list').innerHTML = triggerCatalog.map(g => `
        <button type="button" class="group-pick-row" data-group="${g.id}">
            <span class="group-pick-icon">${g.icon}</span>${I18N.t('trig.group.' + g.id)}
        </button>
    `).join('');
    document.getElementById('group-pick-modal').classList.remove('hidden');
};
document.getElementById('group-pick-list').addEventListener('click', (e) => {
    const row = e.target.closest('.group-pick-row');
    if (!row) return;
    newTriggerDraft.group = row.dataset.group;
    updatePickerRows();
    validateNewTrigger();
    document.getElementById('group-pick-modal').classList.add('hidden');
});
document.getElementById('close-group-pick-btn').onclick = () => document.getElementById('group-pick-modal').classList.add('hidden');
document.querySelector('#group-pick-modal .modal-backdrop').onclick = () => document.getElementById('group-pick-modal').classList.add('hidden');

// Подмодалка: выбор иконки (только свободные + своя при редактировании)
document.getElementById('pick-icon-btn').onclick = () => {
    const icons = getAvailableIcons(editingTriggerId);
    document.getElementById('icon-pick-grid').innerHTML = icons.length
        ? icons.map(ic => `<button type="button" class="icon-pick-item" data-icon="${ic}">${ic}</button>`).join('')
            : `<p class="icon-pick-empty">${I18N.t('trig.iconsExhausted1')}<br>${I18N.t('trig.iconsExhausted2')}</p>`;
    document.getElementById('icon-pick-modal').classList.remove('hidden');
};
document.getElementById('icon-pick-grid').addEventListener('click', (e) => {
    const item = e.target.closest('.icon-pick-item');
    if (!item) return;
    newTriggerDraft.icon = item.dataset.icon;
    updatePickerRows();
    validateNewTrigger();
    document.getElementById('icon-pick-modal').classList.add('hidden');
});
document.getElementById('close-icon-pick-btn').onclick = () => document.getElementById('icon-pick-modal').classList.add('hidden');
document.querySelector('#icon-pick-modal .modal-backdrop').onclick = () => document.getElementById('icon-pick-modal').classList.add('hidden');

// Сохранение: создание или редактирование
document.getElementById('save-new-trigger-btn').onclick = async () => {
    const name = newTriggerDraft.name.trim();
    if (!name || !newTriggerDraft.icon || !newTriggerDraft.group) return;
    const newKey = `${newTriggerDraft.icon} ${name}`;
    const dup = triggerCatalog.some(g => g.triggers.some(t => t.id !== editingTriggerId && triggerKey(t) === newKey));
    if (dup) { showToast(I18N.t('trig.dup'), 'error'); return; }

    if (editingTriggerId) {
        const found = findTriggerById(editingTriggerId);
        if (!found) return;
        const oldKey = triggerKey(found.trigger);
        // Перенос в другую группу, если сменили
        if (found.group.id !== newTriggerDraft.group) {
            const target = triggerCatalog.find(g => g.id === newTriggerDraft.group);
            if (target) {
                found.group.triggers = found.group.triggers.filter(t => t.id !== editingTriggerId);
                target.triggers.push(found.trigger);
            }
        }
        found.trigger.name = name;
        found.trigger.icon = newTriggerDraft.icon;
        saveTriggerCatalog();
        triggersSelection = triggersSelection.map(k => k === oldKey ? newKey : k);
        // Переименовываем триггер во всех записях
        let touched = false;
        diaryEntries.forEach(en => {
            if (Array.isArray(en.triggers) && en.triggers.includes(oldKey)) {
                en.triggers = en.triggers.map(k => k === oldKey ? newKey : k);
                en.updatedAt = Date.now();
                touched = true;
            }
        });
        closeAddTriggerModal();
        renderTriggersGroups();
        if (touched) {
            try { await saveAllToIndexedDB(); }
            catch (err) { console.error(err); showToast(I18N.t('trig.saveFailed'), 'error'); }
            renderEntries();
            renderCalendar();
            updateProgressCard();
        }
        showToast(I18N.t('trig.updated'), 'success');
    } else {
        const g = triggerCatalog.find(x => x.id === newTriggerDraft.group);
        if (!g) return;
        g.triggers.push({ id: 't_' + Date.now().toString(36), name, icon: newTriggerDraft.icon });
        saveTriggerCatalog();
        triggersSelection.push(newKey);
        closeAddTriggerModal();
        renderTriggersGroups();
        showToast(I18N.t('trig.added'), 'success');
    }
};

// === 🟩 ПИКСЕЛЬНАЯ СЕТКА ГОДА (YEAR IN PIXELS) ===
let pixelYear = new Date().getFullYear();
let pixelSelectedKey = null;
let pixelDayMap = {};
let statsModeBeforePixel = 'deep';
const PIXEL_MONTHS = ['month.short.jan','month.short.feb','month.short.mar','month.short.apr','month.short.may','month.short.jun','month.short.jul','month.short.aug','month.short.sep','month.short.oct','month.short.nov','month.short.dec'];

function pixelLevel(score) {
    if (score <= 2) return 1;
    if (score <= 4) return 2;
    if (score <= 6) return 3;
    if (score <= 8) return 4;
    return 5;
}
function pixelPlural(n, forms) {
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
    return forms[2];
}

function openPixelGrid() {
    statsModeBeforePixel = currentStatsMode;
    closeStatsModal();
    pixelYear = new Date().getFullYear();
    pixelSelectedKey = null;
    renderPixelGrid();
    document.getElementById('pixel-grid-modal').classList.remove('hidden');
    document.body.classList.add('modal-lock');
    document.getElementById('bottomNav').classList.add('nav-hidden');
}
function closePixelGrid() {
    document.getElementById('pixel-grid-modal').classList.add('hidden');
    document.body.classList.remove('modal-lock');
    document.getElementById('bottomNav').classList.remove('nav-hidden');
    openStatsModalInMode(statsModeBeforePixel || 'deep');
}

function renderPixelGrid() {
    const body = document.getElementById('pixel-grid-body');
    const monthsRow = document.getElementById('pixel-months-row');
    if (!body || !monthsRow) return;
    const year = pixelYear;
    const todayKey = getDateKey(new Date());
    document.getElementById('pixel-year-label').textContent = year;
    document.getElementById('pixel-next-year').disabled = year >= new Date().getFullYear();

    pixelDayMap = {};
    diaryEntries.forEach(e => {
        const d = new Date(e.date);
        if (isNaN(d.getTime()) || d.getFullYear() !== year) return;
        const k = getDateKey(e.date);
        (pixelDayMap[k] = pixelDayMap[k] || []).push(e);
    });

    let pos = 0, neu = 0, neg = 0;
    Object.values(pixelDayMap).forEach(es => {
        const s = calculateSmartDayScore(es);
        if (s === null) return;
        const lv = pixelLevel(s);
        if (lv >= 4) pos++; else if (lv === 3) neu++; else neg++;
    });
    const filled = pos + neu + neg;
    const daysInYear = new Date(year, 1, 29).getMonth() === 1 ? 366 : 365;

    monthsRow.innerHTML = '<span class="pixel-corner"></span>' +
        PIXEL_MONTHS.map(k => `<span class="pixel-month-label">${I18N.t(k)}</span>`).join('');

    let html = '';
    for (let day = 1; day <= 31; day++) {
        html += `<span class="pixel-day-num">${day}</span>`;
        for (let m = 0; m < 12; m++) {
            const dim = new Date(year, m + 1, 0).getDate();
            if (day > dim) { html += '<span class="pixel-cell pixel-void" aria-hidden="true"></span>'; continue; }
            const key = `${year}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const es = pixelDayMap[key];
            const score = es ? calculateSmartDayScore(es) : null;
            const todayCls = key === todayKey ? ' today' : '';
            const selCls = key === pixelSelectedKey ? ' selected' : '';
            const delay = (day - 1) * 12;
            const pretty = formatPrettyDate(key);
            const label = score !== null
                ? I18N.t('pixel.cellMood', { date: pretty, score: score.toFixed(1) })
                : I18N.t('pixel.cellEmpty', { date: pretty });
            const cls = score !== null ? 'pixel-level-' + pixelLevel(score) : 'pixel-empty';
            html += `<button type="button" class="pixel-cell ${cls}${todayCls}${selCls}" data-key="${key}" style="--d:${delay}ms" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></button>`;
        }
    }
    body.innerHTML = html;

    const pct = n => filled ? Math.round(n / filled * 100) : 0;
    document.getElementById('pixel-count-pos').textContent = pos;
    document.getElementById('pixel-count-neu').textContent = neu;
    document.getElementById('pixel-count-neg').textContent = neg;
    document.getElementById('pixel-pct-pos').textContent = pct(pos) + '%';
    document.getElementById('pixel-pct-neu').textContent = pct(neu) + '%';
    document.getElementById('pixel-pct-neg').textContent = pct(neg) + '%';
    document.getElementById('pixel-bar-pos').style.width = pct(pos) + '%';
    document.getElementById('pixel-bar-neu').style.width = pct(neu) + '%';
    document.getElementById('pixel-bar-neg').style.width = pct(neg) + '%';
    document.getElementById('pixel-summary-total').innerHTML = filled
        ? `${I18N.t('pixel.filledLabel')} <strong>${filled}</strong> ${I18N.t('pixel.filledRest', { total: daysInYear, p: Math.round(filled / daysInYear * 100) })}`
        : I18N.t('pixel.yearEmpty');
    updatePixelInspector();
}

function updatePixelInspector() {
    const box = document.getElementById('pixel-day-inspector');
    const openBtn = document.getElementById('pixel-open-day-btn');
    if (!box) return;
    if (!pixelSelectedKey) { box.classList.add('hidden'); return; }
    const es = pixelDayMap[pixelSelectedKey];
    document.getElementById('pixel-inspector-date').textContent = formatPrettyDate(pixelSelectedKey);
    const moodEl = document.getElementById('pixel-inspector-mood');
    const metaEl = document.getElementById('pixel-inspector-meta');
    if (es && es.length) {
        const s = calculateSmartDayScore(es);
        moodEl.innerHTML = getMoodSvg(getEmojiByScore(s), 22);
        metaEl.textContent = `${s.toFixed(1)} · ${I18N.plural(es.length, 'unit.entry')}`;
        openBtn.classList.remove('hidden');
    } else {
        moodEl.innerHTML = '';
        metaEl.textContent = I18N.t('pixel.noEntries');
        openBtn.classList.add('hidden');
    }
    box.classList.remove('hidden');
}

document.getElementById('pixel-grid-body').addEventListener('click', (e) => {
    const cell = e.target.closest('.pixel-cell');
    if (!cell || cell.classList.contains('pixel-void') || !cell.dataset.key) return;
    document.querySelectorAll('#pixel-grid-body .pixel-cell.selected').forEach(c => c.classList.remove('selected'));
    cell.classList.add('selected');
    pixelSelectedKey = cell.dataset.key;
    updatePixelInspector();
});

document.getElementById('pixel-open-day-btn').onclick = () => {
    if (!pixelSelectedKey) return;
    const key = pixelSelectedKey;
    document.getElementById('pixel-grid-modal').classList.add('hidden');
    document.body.classList.remove('modal-lock');
    document.getElementById('bottomNav').classList.remove('nav-hidden');
    applyDateFilter(key);
};

document.getElementById('pixel-prev-year').onclick = () => { pixelYear--; pixelSelectedKey = null; renderPixelGrid(); };
document.getElementById('pixel-next-year').onclick = () => {
    if (pixelYear >= new Date().getFullYear()) return;
    pixelYear++; pixelSelectedKey = null; renderPixelGrid();
};
document.getElementById('close-pixel-grid-btn').onclick = closePixelGrid;
document.querySelector('#pixel-grid-modal .modal-backdrop').onclick = closePixelGrid;
document.getElementById('open-pixel-grid-btn').onclick = openPixelGrid;
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('pixel-grid-modal').classList.contains('hidden')) closePixelGrid();
});

async function normalizeEntryTimestamps() {
    const fixed = [];
    diaryEntries.forEach(e => {
        const base = Number(e.createdAt) || Number(e.updatedAt)
                  || new Date(e.date).getTime() || Number(e.id) || Date.now();
        let dirty = false;
        if (!Number(e.createdAt)) { e.createdAt = base; dirty = true; }
        if (!Number(e.updatedAt)) { e.updatedAt = base; dirty = true; }
        if (dirty) fixed.push(e);
    });
    for (const e of fixed) {
        try { await dbPut(e); } catch (err) { console.warn(e.id, err); }
    }
    if (fixed.length) console.log('Восстановлены метки времени у записей:', fixed.length);
}

//полосы сверху и снизу
function syncThemeColor() {
    const meta = document.querySelector('meta[name="theme-color"]');
    const nav = document.getElementById('bottomNav');
    if (!meta || !nav) return;
    const bg = getComputedStyle(nav).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        meta.content = bg;
    }
}


function virtualizeEntriesList() {
    const list = document.getElementById('entries-list');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Загружаем контент карточки
                loadEntryCard(entry.target);
            }
        });
    }, { rootMargin: '100px' });
    
    document.querySelectorAll('.entry-card').forEach(card => {
        observer.observe(card);
    });
}

// === 🏅 ДОСТИЖЕНИЯ ===
const ACH_KEY = 'ds_achievements_v1';
const ACHIEVEMENTS = [
    { id: 'newbie',       cur: s => s.totalEntries, target: 1 },
    { id: 'apprentice',   cur: s => s.totalDays,    target: 7 },
    { id: 'master',       cur: s => s.totalDays,    target: 30 },
    { id: 'eternal',      cur: s => s.totalDays,    target: 360 },
    { id: 'tireless',     cur: s => s.bestStreak,   target: 30 },
    { id: 'nights',       cur: s => s.totalDays,    target: 1001 },
    { id: 'multifaceted', cur: s => s.moods,        target: 6 },
    { id: 'rich',         cur: s => s.moods,        target: 10 },
    { id: 'colorful',     cur: s => s.themeChanged ? 1 : 0, target: 1 }
];

function computeAchievementStats() {
    const days = new Set(), moods = new Set();
    diaryEntries.forEach(e => {
        days.add(getDateKey(e.date));
        if (e.mood) moods.add(e.mood);
    });
    const sortedDays = [...days].sort();
    let best = 0, cur = 0, prevTs = 0;
    sortedDays.forEach(k => {
        const ts = new Date(k + 'T12:00:00').getTime();
        cur = (prevTs && Math.round((ts - prevTs) / 86400000) === 1) ? cur + 1 : 1;
        if (cur > best) best = cur;
        prevTs = ts;
    });
    return {
        totalEntries: diaryEntries.length,
        totalDays: days.size,
        bestStreak: best,
        moods: moods.size,
        themeChanged: localStorage.getItem('ds_theme_changed_v1') === '1'
    };
}

function getUnlockedAchievements() {
    try { return JSON.parse(localStorage.getItem(ACH_KEY)) || {}; } catch { return {}; }
}

function checkAchievements() {
    // если иконки ещё не инициализированы — пропускаем, будет вызвано позже
    if (typeof ACHIEVEMENTS === 'undefined') return;

    const unlocked = getUnlockedAchievements();
    const stats = computeAchievementStats();
    let changed = false;
    ACHIEVEMENTS.forEach(a => {
        if (unlocked[a.id]) return;
        if (a.cur(stats) >= a.target) {
            unlocked[a.id] = Date.now();
            changed = true;
            showAchievementToast(a.id);
        }
    });
    if (changed) {
        localStorage.setItem(ACH_KEY, JSON.stringify(unlocked));
        const modal = document.getElementById('achievements-modal');
        if (modal && !modal.classList.contains('hidden')) renderAchievements();
    }
}

// === 🏅 ТОСТ ДОСТИЖЕНИЯ: очередь, чтобы при массовой разблокировке тосты не наслаивались ===
const _achToastQueue = [];
let _achToastBusy = false;

function showAchievementToast(achId) {
    _achToastQueue.push(achId);
    if (!_achToastBusy) nextAchievementToast();
}

function nextAchievementToast() {
    const id = _achToastQueue.shift();
    if (!id) { _achToastBusy = false; return; }

    // защита: если иконки ещё не инициализированы — ставим обратно в очередь
    if (typeof ACHIEVEMENT_ICONS === 'undefined' || !ACHIEVEMENT_ICONS[id]) {
        _achToastQueue.unshift(id);
        _achToastBusy = false;
        setTimeout(nextAchievementToast, 200);
        return;
    }
    _achToastBusy = true;

    const toast = document.createElement('div');
    toast.className = 'ach-toast';
    toast.innerHTML = `
        <span class="ach-toast-trophy">${NAV_ICONS.trophy}</span>
        <span class="ach-toast-icon">${ACHIEVEMENT_ICONS[id] || ''}</span>
        <span class="ach-toast-text">
            <span class="ach-toast-title">${I18N.t('ach.congrats')}</span>
            <span class="ach-toast-name">${I18N.t('ach.' + id + '.name')}</span>
        </span>
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    const duration = _achToastQueue.length >= 3 ? 1600 : 3200;
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => {
            toast.remove();
            nextAchievementToast();
        }, 450);
    }, duration);
}

function renderAchievements() {
    const grid = document.getElementById('achievements-grid');
    if (!grid) return;
    const unlocked = getUnlockedAchievements();
    const stats = computeAchievementStats();
    grid.innerHTML = ACHIEVEMENTS.map(a => {
        const done = !!unlocked[a.id];
        const cur = Math.min(a.cur(stats), a.target);
        return `<button type="button" class="ach-card${done ? ' unlocked' : ''}" data-ach="${a.id}">
            <span class="ach-icon">${ACHIEVEMENT_ICONS[a.id] || ''}</span>
            <span class="ach-name">${I18N.t('ach.' + a.id + '.name')}</span>
            <span class="ach-progress">${done ? '✓' : cur + ' / ' + a.target}</span>
        </button>`;
    }).join('');
    const count = ACHIEVEMENTS.filter(a => unlocked[a.id]).length;
    const counter = document.getElementById('achievements-counter');
    if (counter) counter.textContent = I18N.t('ach.counter', { a: count, b: ACHIEVEMENTS.length });
}

let _achDetailId = null;
function openAchievementDetail(id) {
    const a = ACHIEVEMENTS.find(x => x.id === id);
    if (!a) return;
    _achDetailId = id;
    const done = !!getUnlockedAchievements()[id];
    const stats = computeAchievementStats();
    const iconBox = document.getElementById('achievement-detail-icon');
    iconBox.innerHTML = ACHIEVEMENT_ICONS[id] || '';
    iconBox.classList.toggle('unlocked', done);
    document.getElementById('achievement-detail-name').textContent = I18N.t('ach.' + id + '.name');
    document.getElementById('achievement-detail-text').textContent = done
        ? I18N.t('ach.congrats')
        : `${I18N.t('ach.' + id + '.desc')} — ${Math.min(a.cur(stats), a.target)} / ${a.target}`;
    document.getElementById('achievement-detail-modal').classList.remove('hidden');
}
function closeAchievementDetail() {
    _achDetailId = null;
    document.getElementById('achievement-detail-modal').classList.add('hidden');
}

function openAchievements() {
    closeSidebar();
    renderAchievements();
    document.getElementById('achievements-modal').classList.remove('hidden');
    document.body.classList.add('modal-lock');
    document.getElementById('bottomNav').classList.add('nav-hidden');
}
function closeAchievements() {
    closeAchievementDetail();
    document.getElementById('achievements-modal').classList.add('hidden');
    document.body.classList.remove('modal-lock');
    document.getElementById('bottomNav').classList.remove('nav-hidden');
}

document.getElementById('sidebar-achievements-btn').onclick = openAchievements;
document.getElementById('close-achievements-btn').onclick = closeAchievements;
document.querySelector('#achievements-modal .modal-backdrop').onclick = closeAchievements;
document.getElementById('achievements-grid').addEventListener('click', (e) => {
    const card = e.target.closest('.ach-card');
    if (card) openAchievementDetail(card.dataset.ach);
});
document.getElementById('close-achievement-detail-btn').onclick = closeAchievementDetail;
document.querySelector('#achievement-detail-modal .modal-backdrop').onclick = closeAchievementDetail;
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const detail = document.getElementById('achievement-detail-modal');
    if (detail && !detail.classList.contains('hidden')) { closeAchievementDetail(); return; }
    const main = document.getElementById('achievements-modal');
    if (main && !main.classList.contains('hidden')) closeAchievements();
});
document.addEventListener('app:langchange', () => {
    const main = document.getElementById('achievements-modal');
    if (main && !main.classList.contains('hidden')) {
        I18N.applyStatic(main);
        renderAchievements();
    }
    if (_achDetailId) openAchievementDetail(_achDetailId);
});


// === 🚀 ЗАПУСК ===
async function initApp() {
    try {
        await initDB();
        console.log('IndexedDB инициализирована');
    } catch (error) {
        console.error('Не удалось инициализировать IndexedDB:', error);
        showToast(I18N.t('storage.error'), 'error');
        return;
    }
    preloadMoodImages();
    loadTheme();
    updateSortButtons();
    await loadEntries();
    await normalizeEntryTimestamps();
    updateProgressCard();
    renderCalendar();
    initMoodFilterGrid();
    initPinProtection();

    // Все иконки — одной таблицей, без повторов
    const iconMap = {
        'icon-back-add-trigger': NAV_ICONS.back,
        'icon-menu': NAV_ICONS.menu,
        'icon-entries': NAV_ICONS.entries,
        'icon-stats': NAV_ICONS.stats,
        'icon-calendar': NAV_ICONS.calendar,
        'icon-plus': NAV_ICONS.plus,
        'icon-back-calendar': NAV_ICONS.back,
        'icon-back-triggers': NAV_ICONS.back,
        'icon-back-pixel': NAV_ICONS.back,
        'icon-back-stats': NAV_ICONS.back,
        'icon-back-nostalgia': NAV_ICONS.back,
        'calendar-header-icon': NAV_ICONS.calendar,
        'stats-header-icon': NAV_ICONS.stats,
        'nostalgia-header-icon': WIDGET_ICONS.nostalgia,
        'icon-progress-flame': NAV_ICONS.flame,
        'icon-search': NAV_ICONS.search,
        'icon-favorites': NAV_ICONS.star,
        'icon-widget-stats': NAV_ICONS.stats,
        'icon-widget-nostalgia': WIDGET_ICONS.nostalgia,
        'icon-sort': NAV_ICONS.sort,
        'icon-theme': NAV_ICONS.theme,
        'icon-mood': NAV_ICONS.mood,
        'icon-chart': NAV_ICONS.chart,
        'icon-tags': NAV_ICONS.tags,
        'icon-export': NAV_ICONS.exportImport,
        'icon-pin': NAV_ICONS.pin,
        'icon-achievements': NAV_ICONS.trophy,
        'icon-back-achievements': NAV_ICONS.back,
    };
    Object.entries(iconMap).forEach(([id, svg]) => {
        const el = document.getElementById(id);
        if (el && svg) el.innerHTML = svg;
    });

    setActiveNav('nav-entries-btn');
    setActiveWidget(0);
    renderWidgetPreviews();
    syncThemeColor();
}

// === ЗАСТАВКА ===
window.addEventListener('load', () => {
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.classList.add('hidden');
            setTimeout(() => splash.remove(), 1000);
        }
    }, 2000);
});

initApp();





// ============================================
// ⚙️ НАСТРОЙКИ: уведомления · триггеры · язык
// ============================================
(function initDiarySettings() {
    'use strict';

    const KEYS = { notif: 'ds_notifications_v1', triggers: 'ds_triggers_v1', lang: 'ds_lang_v1' };
    const read = (k, fallback) => {
        try { const raw = localStorage.getItem(k); return raw === null ? fallback : JSON.parse(raw); }
        catch { return fallback; }
    };
    const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
    const $ = id => document.getElementById(id);

    const state = {
        notif: Object.assign({ enabled: false, time: '20:00', days: [1, 2, 3, 4, 5, 6, 0] }, read(KEYS.notif, {})),
        triggers: read(KEYS.triggers, true),
        lang: read(KEYS.lang, 'ru')
    };

    const ICONS = {
        gear: `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
        back: `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 8 8 12 12 16"></polyline><line x1="16" y1="12" x2="8" y2="12"></line></svg>`
    };

    // ---------- ЯЗЫК: тонкая обёртка над I18N ----------
    const t = (key) => window.I18N.t(key);

    function applyLanguage(lang, announce) {
        state.lang = window.I18N.languages.includes(lang) ? lang : 'ru';
        write(KEYS.lang, state.lang);
        window.I18N.setLang(state.lang); // статика + событие app:langchange
        renderLanguage();
        renderSettingsSubs();
        renderNotifications();
        if (announce && typeof window.showToast === 'function') showToast(t('language.changed'), 'success');
    }

    // ---------- УВЕДОМЛЕНИЯ: веб сейчас, Capacitor без переделок ----------
    const Native = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) || null;
    const isNative = !!Native;
    let nativePerm = 'default';
    let webTimer = null;
    const MAX_TIMEOUT = 2147483647;
    const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
    const DAY_KEY = { 1: 'day.mon', 2: 'day.tue', 3: 'day.wed', 4: 'day.thu', 5: 'day.fri', 6: 'day.sat', 0: 'day.sun' };
    const NOTIF_ID_BASE = 4100;

    function permState() {
        if (isNative) return nativePerm;
        return ('Notification' in window) ? Notification.permission : 'unsupported';
    }

    async function refreshPermission() {
        if (isNative) {
            try { nativePerm = (await Native.checkPermissions()).display; } catch { nativePerm = 'default'; }
        }
        return permState();
    }

    async function ensurePermission() {
        if (isNative) {
            await refreshPermission();
            if (nativePerm === 'granted') return true;
            try { nativePerm = (await Native.requestPermissions()).display; } catch { nativePerm = 'denied'; }
            return nativePerm === 'granted';
        }
        if (!('Notification' in window)) return false;
        if (Notification.permission === 'granted') return true;
        if (Notification.permission === 'denied') return false;
        try { return (await Notification.requestPermission()) === 'granted'; } catch { return false; }
    }

    function nextOccurrence() {
        if (!state.notif.days.length) return null;
        const [h, m] = String(state.notif.time || '20:00').split(':').map(Number);
        const now = new Date();
        for (let i = 0; i < 9; i++) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, h || 0, m || 0, 0, 0);
            if (d.getTime() <= now.getTime()) continue;
            if (!state.notif.days.includes(d.getDay())) continue;
            return d;
        }
        return null;
    }

    function notifPayload() {
        return { title: t('app.brand'), body: t('notif.heroTitle') };
    }

    async function pushNow() {
        const { title, body } = notifPayload();
        if (isNative) {
            try {
                await Native.schedule({ notifications: [{ id: NOTIF_ID_BASE, title, body, schedule: { at: new Date(Date.now() + 1200) }, extra: { route: 'quick-entry' } }] });
                return true;
            } catch { return false; }
        }
        const options = { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'diary-daily-reminder', renotify: true, data: { url: './index.html' } };
        try {
            if ('serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.getRegistration();
                if (reg && typeof reg.showNotification === 'function' && Notification.permission === 'granted') {
                    await reg.showNotification(title, options);
                    return true;
                }
            }
            if ('Notification' in window && Notification.permission === 'granted') {
                const n = new Notification(title, options);
                n.onclick = () => { window.focus(); n.close(); };
                return true;
            }
        } catch {}
        return false;
    }

    async function syncSchedule() {
        if (webTimer) { clearTimeout(webTimer); webTimer = null; }
        if (isNative) {
            try {
                const pending = await Native.getPending();
                const mine = (pending.notifications || []).filter(n => n.id >= NOTIF_ID_BASE && n.id < NOTIF_ID_BASE + 10);
                if (mine.length) await Native.cancel({ notifications: mine.map(n => ({ id: n.id })) });
                if (!state.notif.enabled || permState() !== 'granted') return;
                const [hour, minute] = String(state.notif.time || '20:00').split(':').map(Number);
                const { title, body } = notifPayload();
                const notifications = state.notif.days.map(day => ({
                    id: NOTIF_ID_BASE + day + 1,
                    title, body,
                    schedule: { on: { weekday: day + 1, hour: hour || 0, minute: minute || 0 }, allowWhileIdle: true },
                    extra: { route: 'quick-entry' }
                }));
                if (notifications.length) await Native.schedule({ notifications });
            } catch (e) { console.warn('LocalNotifications schedule failed:', e); }
            return;
        }
        if (!state.notif.enabled || permState() !== 'granted') return;
        const next = nextOccurrence();
        if (!next) return;
        const delay = next.getTime() - Date.now();
        if (delay > MAX_TIMEOUT) { webTimer = setTimeout(syncSchedule, MAX_TIMEOUT); return; }
        webTimer = setTimeout(async () => { await pushNow(); syncSchedule(); renderNotifications(); }, delay);
    }

    function saveNotif() {
        write(KEYS.notif, state.notif);
        syncSchedule();
        renderNotifications();
        renderSettingsSubs();
    }

    function renderNotifications() {
        const toggle = $('notif-enabled-toggle');
        if (toggle) toggle.checked = !!state.notif.enabled;
        const timeInput = $('notif-time-input');
        if (timeInput && timeInput.value !== state.notif.time) timeInput.value = state.notif.time;
        const previewTime = $('push-preview-time');
        if (previewTime) previewTime.textContent = state.notif.time;

        const daysBox = $('notif-days');
        if (daysBox && !daysBox.childElementCount) {
            DAY_ORDER.forEach(d => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'ds-day';
                b.dataset.day = String(d);
                b.addEventListener('click', () => {
                    const i = state.notif.days.indexOf(d);
                    if (i === -1) state.notif.days.push(d);
                    else if (state.notif.days.length > 1) state.notif.days.splice(i, 1);
                    else { if (typeof window.showToast === 'function') window.showToast(t('notif.pickDay'), 'info'); return; }
                    saveNotif();
                });
                daysBox.appendChild(b);
            });
        }
        if (daysBox) {
            daysBox.querySelectorAll('.ds-day').forEach(b => {
                const d = Number(b.dataset.day);
                b.textContent = t(DAY_KEY[d]);
                b.classList.toggle('active', state.notif.days.includes(d));
            });
        }

        const permSub = $('notif-permission-sub');
        const permBtn = $('notif-permission-btn');
        const p = permState();
        if (permSub) {
            permSub.classList.remove('ds-perm-ok', 'ds-perm-bad');
            if (p === 'granted') { permSub.textContent = t('notif.permGranted'); permSub.classList.add('ds-perm-ok'); }
            else if (p === 'denied') { permSub.textContent = t(isNative ? 'notif.permDeniedSystem' : 'notif.permDeniedBrowser'); permSub.classList.add('ds-perm-bad'); }
            else if (p === 'unsupported') { permSub.textContent = t('notif.unsupported'); permSub.classList.add('ds-perm-bad'); }
            else { permSub.textContent = t('notif.permDefault'); }
        }
        if (permBtn) permBtn.classList.toggle('hidden', p === 'granted' || p === 'unsupported');

        const nextSub = $('notif-next-sub');
        if (nextSub) {
            if (!state.notif.enabled) nextSub.textContent = t('common.off');
            else {
                const next = nextOccurrence();
                nextSub.textContent = next
                    ? `${t('notif.next')} · ${window.I18N.fmtDate(next, { day: 'numeric', month: 'short' })}, ${state.notif.time}`
                    : t('notif.pickDay');
            }
        }

        const bridge = $('notif-bridge');
        const bTitle = $('notif-engine-title');
        const bSub = $('notif-engine-sub');
        if (bridge) bridge.classList.toggle('native', isNative);
        if (bTitle) bTitle.textContent = t(isNative ? 'notif.nativeMode' : 'notif.webMode');
        if (bSub) bSub.textContent = t(isNative ? 'notif.nativeSub' : 'notif.webSub');
    }

    function renderSettingsSubs() {
        const nSub = $('settings-notif-sub');
        if (nSub) {
            nSub.textContent = state.notif.enabled
                ? `${state.notif.time} · ${state.notif.days.length === 7 ? t('settings.everyday') : DAY_ORDER.filter(d => state.notif.days.includes(d)).map(d => t(DAY_KEY[d])).join(', ')}`
                : t('common.off');
        }
        const lSub = $('settings-lang-sub');
        if (lSub) lSub.textContent = ({ ru: 'Русский', en: 'English', fr: 'Français' })[state.lang] || 'Русский';
    }

    function renderLanguage() {
        document.querySelectorAll('.lang-row').forEach(row => {
            const on = row.dataset.lang === state.lang;
            row.classList.toggle('selected', on);
            row.setAttribute('aria-selected', on ? 'true' : 'false');
        });
    }


    // ---------- НАВИГАЦИЯ ----------
    const open = id => { const m = $(id); if (m) m.classList.remove('hidden'); };
    const close = id => { const m = $(id); if (m) m.classList.add('hidden'); };

    function openSettings() {
        if (typeof window.closeSidebar === 'function') window.closeSidebar();
        renderSettingsSubs();
        open('settings-modal');
        window.I18N.applyStatic($('settings-modal')); 
        document.body.classList.add('modal-lock');
    }

    function backToSettings(id) { close(id); open('settings-modal'); }

    function closeSettings() {
        close('settings-modal');
        if (typeof window.setActiveNav === 'function') window.setActiveNav('nav-entries-btn');
        document.body.classList.remove('modal-lock');
    }

    const bind = (id, handler) => { const el = $(id); if (el) el.onclick = handler; };

    bind('sidebar-settings-btn', openSettings);
    bind('close-settings-btn', closeSettings);
    bind('settings-notifications-btn', () => {
        close('settings-modal');
        renderNotifications();
        open('notifications-modal');
        window.I18N.applyStatic($('notifications-modal'));
    });
    bind('settings-language-btn', () => {
        close('settings-modal');
        renderLanguage();
        open('language-modal');
        window.I18N.applyStatic($('language-modal'));
    });
    bind('close-notifications-btn', () => backToSettings('notifications-modal'));
    bind('close-language-btn', () => backToSettings('language-modal'));

    [['settings-modal', closeSettings],
     ['notifications-modal', () => backToSettings('notifications-modal')],
     ['language-modal', () => backToSettings('language-modal')]]
        .forEach(([id, fn]) => { const b = document.querySelector('#' + id + ' .modal-backdrop'); if (b) b.onclick = fn; });

    const trigToggle = $('settings-triggers-toggle');
    if (trigToggle) {
        trigToggle.checked = !!state.triggers;
        trigToggle.addEventListener('change', () => {
            state.triggers = trigToggle.checked;
            write(KEYS.triggers, state.triggers);
            if (typeof window.showToast === 'function') window.showToast(t(state.triggers ? 'trig.on' : 'trig.off'), 'info');
        });
    }

    

    const notifToggle = $('notif-enabled-toggle');
    if (notifToggle) {
        notifToggle.addEventListener('change', async () => {
            if (notifToggle.checked) {
                const ok = await ensurePermission();
                if (!ok) {
                    notifToggle.checked = false;
                    state.notif.enabled = false;
                    saveNotif();
                    if (typeof window.showToast === 'function') window.showToast(t('notif.allowFirst'), 'error');
                    return;
                }
                state.notif.enabled = true;
                saveNotif();
                if (typeof window.showToast === 'function') window.showToast(t('notif.enabled'), 'success');
            } else {
                state.notif.enabled = false;
                saveNotif();
                if (typeof window.showToast === 'function') window.showToast(t('notif.disabled'), 'info');
            }
        });
    }

    const timeInput = $('notif-time-input');
    if (timeInput) timeInput.addEventListener('change', () => { state.notif.time = timeInput.value || '20:00'; saveNotif(); });

    bind('notif-permission-btn', async () => { await ensurePermission(); renderNotifications(); syncSchedule(); });

    bind('notif-test-btn', async () => {
        if (permState() !== 'granted') {
            if (typeof window.showToast === 'function') window.showToast(t('notif.allowFirst'), 'error');
            return;
        }
        const ok = await pushNow();
        if (typeof window.showToast === 'function') {
            window.showToast(ok ? t('notif.testSent') : t('notif.unsupported'), ok ? 'success' : 'error');
        }
    });

    document.querySelectorAll('.lang-row').forEach(row => {
        row.setAttribute('role', 'option');
        row.addEventListener('click', () => {
            if (row.dataset.lang === state.lang) return;
            applyLanguage(row.dataset.lang, true);
        });
    });

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        const lang = $('language-modal'), notif = $('notifications-modal'), set = $('settings-modal');
        if (lang && !lang.classList.contains('hidden')) { backToSettings('language-modal'); return; }
        if (notif && !notif.classList.contains('hidden')) { backToSettings('notifications-modal'); return; }
        if (set && !set.classList.contains('hidden')) closeSettings();
    });

    document.addEventListener('visibilitychange', () => { if (!document.hidden && !isNative) syncSchedule(); });
    window.addEventListener('focus', () => { if (!isNative) syncSchedule(); });

    if (isNative && Native.addListener) {
        try {
            Native.addListener('localNotificationActionPerformed', () => {
                if (typeof window.openMoodModal === 'function') window.openMoodModal(true, false);
            });
        } catch {}
    }

    

    // ---------- СТАРТ ----------
    const gearSlot = $('icon-settings');
    if (gearSlot) gearSlot.innerHTML = ICONS.gear;
    ['icon-back-settings', 'icon-back-notifications', 'icon-back-language'].forEach(id => {
        const el = $(id); if (el) el.innerHTML = ICONS.back;
    });

    window.DiarySettings = {
        get triggersEnabled() { return !!state.triggers; },
        get language() { return state.lang; },
        get nativeNotifications() { return isNative; },
        t,
        allowTriggersOnce() {}, // legacy: проверка триггеров теперь в startTriggersFlow
        rescheduleNotifications: syncSchedule,
        openSettings
    };

    renderSettingsSubs();
    renderLanguage();
    applyLanguage(state.lang, false);
    refreshPermission().then(() => { renderNotifications(); syncSchedule(); });
})();

// === 🏅 ИКОНКИ ДОСТИЖЕНИЙ (SVG, stroke-стиль приложения, цвет через currentColor) ===
const ACHIEVEMENT_ICONS = {
    newbie: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5.6 9.4 4l-1.1.9"/><path d="M12 5.3V3.5"/><path d="M14 5.6l.6-1.6 1.1.9"/><circle cx="12" cy="9.6" r="4.4"/><path d="M10.4 9.1h.01"/><path d="M13.6 9.1h.01"/><path d="M12 10.4l1.3 1-1.3 1-1.3-1z"/><path d="M4.2 13.6l2.5 1.8 2.8-2.2 2.5 2.2 2.5-2.2 2.8 2.2 2.5-1.8"/><path d="M4.2 13.6c.3 3.9 3.7 6.9 7.8 6.9s7.5-3 7.8-6.9"/><path d="M17.4 7.6c1.9 1.3 3.1 3.3 3.2 5.6l-1.9 1.3-1.3-1 1.2-1.3-1.3-1.2 1.2-1.3-1.4-1.1z"/></svg>`,
    apprentice: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.7 9.2 12 4.8l9.3 4.4L12 13.6z"/><path d="M6.7 11.2v3.6c0 1.5 2.4 2.7 5.3 2.7s5.3-1.2 5.3-2.7v-3.6"/><path d="M21.3 9.2v4.6"/><path d="M21.3 15.6h.01"/></svg>`,
    master: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.2" width="14" height="12.6" rx="2"/><path d="M8.6 11.6V8.4l1.9 1.5L12 7.4l1.5 2.5 1.9-1.5v3.2z"/><path d="M5 18.2h14v1.6a1.6 1.6 0 0 1-1.6 1.6H6.6A1.6 1.6 0 0 1 5 19.8z"/><path d="M16.4 20h.01"/></svg>`,
    eternal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.6 19.8 6v6.1c0 4.9-3.3 8.5-7.8 9.3-4.5-.8-7.8-4.4-7.8-9.3V6z"/><path d="M9.2 9.9a2.3 2.3 0 1 0 0 4.6c1.5 0 2.2-1.1 2.8-2.3.6-1.2 1.3-2.3 2.8-2.3a2.3 2.3 0 1 1 0 4.6c-1.5 0-2.2-1.1-2.8-2.3-.6-1.2-1.3-2.3-2.8-2.3z"/></svg>`,
    tireless: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.9" r="2.2"/><path d="M9 9.1 6.4 7.9 5 4.9"/><path d="M15 9.1l2.6-1.2L19 4.9"/><path d="M9.4 8.9h5.2l.9 6-1.1 6.4h-1.5l-.9-5.2-.9 5.2H9.6L8.5 14.9z"/><path d="M8.7 9.6c-1.8 2.5-2.8 5.4-3 8.6l2.8.9"/><path d="M15.3 9.6c1.8 2.5 2.8 5.4 3 8.6l-2.8.9"/></svg>`,
    nights: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 20.5 20.5 3.5"/><path d="M9 5.2V3.4"/><path d="M5.4 6.6 4.1 5.3"/><path d="M4.8 10.2H3"/><path d="M6.6 13.4l-1.3 1.3"/><path d="M12.6 6.4a4.6 4.6 0 1 0-6.2 6.2z"/><path d="M15.8 12.6a4.8 4.8 0 1 0 4.6 6.4 5.6 5.6 0 0 1-4.6-6.4z"/></svg>`,
    multifaceted: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="8.2" ry="9.2"/><path d="M9.2 9.6h.01"/><path d="M14.8 9.6h.01"/><path d="M8.6 14.6h6.8"/></svg>`,
    rich: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.3 3.6l.75 1.5 1.65.24-1.2 1.17.28 1.65-1.48-.78-1.48.78.28-1.65-1.2-1.17 1.65-.24z"/><path d="M12 2.4l.85 1.7 1.9.28-1.37 1.34.32 1.88L12 6.7l-1.7.9.32-1.88L9.25 4.38l1.9-.28z"/><path d="M17.7 3.6l.75 1.5 1.65.24-1.2 1.17.28 1.65-1.48-.78-1.48.78.28-1.65-1.2-1.17 1.65-.24z"/><circle cx="12" cy="11.2" r="2.5"/><path d="M8.6 21v-3.6c-2.5-.9-4.2-3.5-4.4-6.6a1.5 1.5 0 0 1 3-.2c.3 2.5 1.6 4.4 3.2 4.4h3.2c1.6 0 2.9-1.9 3.2-4.4a1.5 1.5 0 0 1 3 .2c-.2 3.1-1.9 5.7-4.4 6.6V21z"/></svg>`,
    colorful: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4a8 8 0 1 0 0 16c1.3 0 1.9-.9 1.5-1.9-.4-1.2.3-2.4 1.7-2.4h1.3a3.5 3.5 0 0 0 3.4-3.2A8.2 8.2 0 0 0 10 4z"/><circle cx="7" cy="9" r="1"/><circle cx="5.6" cy="12.4" r="1"/><circle cx="7.6" cy="15.4" r="1"/><path d="M13.5 15.5l6-6"/><path d="M18.5 8.5l1-1a1.5 1.5 0 0 1 2.1 2.1l-1 1z"/><path d="M13.2 16.2c-1.1.3-1.9 1.1-2.2 2.2 1.1-.3 1.9-1.1 2.2-2.2z"/></svg>`
};