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
let activeTriggerFilter = null;
let sortOrder = 'desc'; // 'desc' = сначала новые, 'asc' = сначала старые

let triggerChartPositions = [];
let cameFromDeepStats = false;
let activeFavoriteFilter = false;
let quickEntryMood = '😐';
let quickEntryTriggers = [];

let tempTriggers = [];
const AVAILABLE_TRIGGERS = [
    // Эмоции и состояния
    '😴 Усталость', '😠 Ссора', '😢 Обида', '😐 Скука', '😨 Страх', '😰 Тревога',
    // Здоровье и тело
    '🛌 Отдых', '💤 Сон', '💪 Спорт', '🚶 Прогулка', '🍔 Еда',
    // Активности и увлечения
    '🎨 Хобби', '📚 Учёба', '💻 Работа', '☕ Кофе',
    // Социальное
    '❤️ Отношения', '🎉 Праздник', '🤒 Болезнь',
    // Внешнее и атмосфера
    '🌧️ Погода', '📰 Новости', '🔮 Непредсказуемость', 
    // Позитивные состояния
    '🛡️ Безопасность', '🧘 Спокойствие', '☀️ Радость'
];

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

// === 🎨 КОНФИГ ИКОНОК (SVG) ===
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
    const dayMap = {};
    let entriesCount = 0;
    diaryEntries.forEach(e => {
        const t = new Date(e.date).getTime();
        if (t < startMs || t > endMs) return;
        const key = getDateKey(e.date);
        (dayMap[key] = dayMap[key] || []).push(e);
        entriesCount++;
    });
    const dayScores = Object.values(dayMap)
        .map(entries => calculateSmartDayScore(entries))
        .filter(v => v !== null);
    if (dayScores.length === 0) return { avg: null, days: 0, entries: 0 };
    return {
        avg: dayScores.reduce((s, v) => s + v, 0) / dayScores.length,
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

    // Сначала сортируем по выбранному режиму (создание или изменение)
    if (activeSortMode === 'updated') {
        sorted.sort((a, b) => getEntryUpdatedTime(b) - getEntryUpdatedTime(a));
    } else {
        // По умолчанию — по дате создания
        sorted.sort((a, b) => getEntryCreatedTime(b) - getEntryCreatedTime(a));
    }


    return sorted;
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
                    // Обычная запись
                    openEntryForm(null, m.emoji);
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
        showToast('Не удалось сохранить', 'error');
        return;
    }

    closeQuickEntryModal();
    renderEntries();
    renderCalendar();
    drawMoodChart();
    updateProgressCard();
    showToast('Настроение сохранено', 'success');
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
        // Обновление: date НЕ меняется
        return {
            ...existingEntry,
            ...base,
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

    renderEntries();
    renderCalendar();
    drawMoodChart();
    updateProgressCard();
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

function openEntryForm(entry = null, initialMood = null) {
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
        saveCloseBtn.title = 'Закрыть';
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
        tempTriggers = [];
        const todayKey = getDateKey(new Date());
        dateDisplay.dataset.date = todayKey;
        dateText.textContent = 'Сегодня';
        isEditing = true;
        saveCloseBtn.title = 'Отмена (назад)';
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
            renderEntries();
            renderCalendar();
            drawMoodChart();
            showToast('Пустая запись удалена', 'info');
        } else {
            closeEntryForm();
        }
        return false;
    }

    // === Сохранение ===
    if (existing) {
        const idx = diaryEntries.findIndex(e => e.id === existing.id);
        if (idx !== -1) diaryEntries[idx] = entry;
        showToast('Запись обновлена', 'success');
    } else {
        diaryEntries.unshift(entry);
        editingEntryId = entry.id;
        showToast('Запись сохранена', 'success');
    }

    isEditing = false;
    updateModalState();
    updateEditModeUI();

    try {
        await dbPut(entry);
        cancelDeleteId = null;
    } catch (err) {
        console.error('Ошибка сохранения:', err);
        showToast('Не удалось сохранить запись', 'error');
        return false;
    }

    renderEntries();
    renderCalendar();
    drawMoodChart();
    updateProgressCard();
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
        updateProgressCard();
        showToast('Запись удалена', 'success');
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
    const days = {};
    diaryEntries.forEach(entry => {
        const d = new Date(entry.date);
        if (isNaN(d.getTime()) || d.getFullYear() !== year || d.getMonth() !== month) return;
        const day = d.getDate();
        (days[day] = days[day] || []).push(entry);
    });
    const data = Object.entries(days)
        .map(([day, entries]) => ({ day: +day, score: calculateSmartDayScore(entries) }))
        .filter(p => p.score !== null)
        .sort((a, b) => a.day - b.day);
    const totalEntries = Object.values(days).reduce((s, arr) => s + arr.length, 0);

    if (data.length === 0) {
        ctx.fillStyle = muted; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('В этом месяце пока нет записей', width / 2, top + plotH / 2);
        document.getElementById('chart-average').textContent = '—';
        document.getElementById('chart-summary').textContent = 'Записей за месяц: 0';
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
    document.getElementById('chart-average').innerHTML =
        `Среднее: ${average.toFixed(1)} ${getMoodSvg(getEmojiByScore(average), 18)}`;
    document.getElementById('chart-summary').textContent = `Записей: ${totalEntries} · Дней: ${data.length}`;
}

// === 📋 СПИСОК ЗАПИСЕЙ ===
function renderEntries() {
    const list = document.getElementById('entries-list');
    list.innerHTML = '';

    const hasAnyFilter = !!(activeTagFilter || activeDateFilter || activeMoodFilter || activeTriggerFilter || searchQuery);
    appMain.classList.toggle('search-active', hasAnyFilter);

    let filtered = diaryEntries;
    if (activeFavoriteFilter) filtered = filtered.filter(entry => entry.favorite === true);
    if (activeDateFilter) filtered = filtered.filter(entry => getDateKey(entry.date) === activeDateFilter);
    if (activeTagFilter) filtered = filtered.filter(entry => entry.tags && entry.tags.includes(activeTagFilter));
    if (activeMoodFilter) filtered = filtered.filter(entry => entry.mood === activeMoodFilter);
    if (activeTriggerFilter) filtered = filtered.filter(entry => entry.triggers && entry.triggers.includes(activeTriggerFilter));
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(entry =>
            (entry.content && entry.content.toLowerCase().includes(query)) ||
            (entry.title && entry.title.toLowerCase().includes(query))
        );
    }

    const sorted = sortEntriesForList(filtered);

    // Баннеры фильтров
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
    } else if (activeTriggerFilter) {
        const banner = document.createElement('div');
        banner.className = 'active-filter-banner';
        banner.innerHTML = `<span>Триггер: <strong>${escapeHtml(activeTriggerFilter)}</strong></span><button class="clear-filter-btn" id="clear-trigger-filter" title="Показать все">✕</button>`;
        list.appendChild(banner);
    }

    if (sorted.length === 0) {
        const empty = document.createElement('p');
        empty.style.cssText = 'text-align:center; color:var(--text-muted); margin-top:40px;';
        let msg = 'Пока нет записей. Нажмите +, чтобы начать!';
        if (activeDateFilter) msg = 'В этот день записей нет';
        else if (activeTagFilter) msg = `Нет записей с тегом ${activeTagFilter}`;
        else if (activeMoodFilter) msg = `Нет записей с настроением ${activeMoodFilter}`;
        else if (activeTriggerFilter) msg = `Нет записей с триггером ${activeTriggerFilter}`;
        else if (searchQuery) msg = 'Ничего не найдено';
        empty.textContent = msg;
        list.appendChild(empty);
        return;
    }

    // --- ГРУППИРОВКА ПО ДАТЕ ---
    const groups = {};
    sorted.forEach(entry => {
        const dateKey = getDateKey(entry.date);
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(entry);
    });

    // Сортируем ключи (даты)
    const sortedDateKeys = Object.keys(groups).sort((a, b) => {
        if (sortOrder === 'asc') {
            return new Date(a) - new Date(b); // Сначала старые
        } else {
            return new Date(b) - new Date(a); // Сначала новые
        }
    });

    sortedDateKeys.forEach(dateKey => {
        const entriesOfDay = groups[dateKey];
        
        // Контейнер для группы
        const groupContainer = document.createElement('div');
        groupContainer.className = 'entries-date-group';

        // Заголовок с датой
        const dateHeader = document.createElement('div');
        dateHeader.className = 'entries-date-header';
        
        const todayKey = getDateKey(new Date());
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = getDateKey(yesterday);

        let headerText;
        if (dateKey === todayKey) headerText = 'Сегодня';
        else if (dateKey === yesterdayKey) headerText = 'Вчера';
        else {
            headerText = new Date(dateKey + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        }
        dateHeader.textContent = headerText;
        groupContainer.appendChild(dateHeader);

        // Карточки записей этого дня
        entriesOfDay.forEach(entry => {
            const card = document.createElement('div');
            card.className = 'entry-card';
            card.dataset.entryId = entry.id;
            
            // Определяем цветовой класс на основе настроения записи (для полоски слева)
            const score = getMoodScore(entry.mood);
            if (score !== null) {
                if (score <= 2) card.classList.add('entry-mood-level-1');
                else if (score <= 4) card.classList.add('entry-mood-level-2');
                else if (score <= 6) card.classList.add('entry-mood-level-3');
                else if (score <= 8) card.classList.add('entry-mood-level-4');
                else card.classList.add('entry-mood-level-5');
            }

            // В карточке показываем ТОЛЬКО ВРЕМЯ (без даты)
            const timeStr = new Date(entry.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const editedHtml = getEditedLabelHtml(entry);

            const tagsHtml = (entry.tags && entry.tags.length > 0) 
            ? `<div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">${entry.tags.map(t => `<span style="font-size:0.75em; background:var(--mood-btn-bg); padding:2px 8px; border-radius:10px; color:var(--accent-color);">${escapeHtml(t)}</span>`).join('')}</div>` 
            : '';

            // Определяем цветовой класс для триггеров
            let triggerLevelClass = '';
            if (score !== null) {
                if (score <= 2) triggerLevelClass = 'trigger-level-1';
                else if (score <= 4) triggerLevelClass = 'trigger-level-2';
                else if (score <= 6) triggerLevelClass = 'trigger-level-3';
                else if (score <= 8) triggerLevelClass = 'trigger-level-4';
                else triggerLevelClass = 'trigger-level-5';
            }

            const triggersHtml = (entry.triggers && entry.triggers.length > 0) 
            ? `<div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">${entry.triggers.map(t => `<span class="entry-trigger-chip ${triggerLevelClass}">${escapeHtml(t)}</span>`).join('')}</div>` 
            : '';

            const plainContent = getPlainTextFromHTML(entry.content);
            const textWithoutTags = plainContent.replace(/#[a-zA-Zа-яА-ЯёЁ0-9_]+/g, '').trim();
            const previewText = textWithoutTags.length > 120 ? textWithoutTags.substring(0, 120) + '...' : textWithoutTags;

            card.innerHTML = `
                <div class="entry-header">
                    <span class="entry-date-line">
                        <span>${timeStr}</span>
                        ${editedHtml}
                    </span>
                    <span style="display: flex; align-items: center; gap: 8px;">
                        ${entry.favorite ? NAV_ICONS.starFilled.replace('width="22" height="22"', 'width="16" height="16"') : ''}
                        ${getMoodSvg(entry.mood, 20)}
                    </span>
                </div>
                ${entry.title ? `<div class="entry-title">${escapeHtml(entry.title)}</div>` : ''}
                <div class="entry-text">${previewText ? escapeHtml(previewText) : '<span style="color:var(--text-muted); font-style:italic;">(Запись без текста)</span>'}</div>
                ${triggersHtml}
                ${tagsHtml}
            `;

            // --- Обработчики кликов и long press ---
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

            groupContainer.appendChild(card);
        });

        list.appendChild(groupContainer);
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
        countText.textContent = `Удалить (${selectedEntries.length})`;
        iconSlot.innerHTML = NAV_ICONS.trash;
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
    updateProgressCard();

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
                // умное настроение за день
                const smartAvg = calculateSmartDayScore(dayEntries);
                const avgScore = smartAvg !== null ? smartAvg : 5;
                
                const dayMood = getEmojiByScore(avgScore);

                cell.innerHTML = getMoodSvg(dayMood, 24);

                // Определяем цветовой класс уровня для фона ячейки
                let levelClass = '';
                if (avgScore <= 2) levelClass = 'mood-level-1';
                else if (avgScore <= 4) levelClass = 'mood-level-2';
                else if (avgScore <= 6) levelClass = 'mood-level-3';
                else if (avgScore <= 8) levelClass = 'mood-level-4';
                else levelClass = 'mood-level-5';

                cell.classList.add('has-entry', levelClass);
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
    renderMonthInsights();
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
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    if (multiDeleteMode) exitMultiDeleteMode();
    closeCalendarScreen();
    appMain.classList.add('search-active');
    renderEntries();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const prettyDate = new Date(dateKey + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    showToast(`Записи за ${prettyDate}`, 'info');
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



function closeReminder() { document.getElementById('reminder-modal').classList.add('hidden'); }
function openNewEntryFromReminder() {
    closeReminder();
    document.getElementById('fab-add').click();
}

// === 🔍 ПОИСК (адаптирован под новый интерфейс) ===

// === 🔍 ПОИСК ===
const searchBtn = document.getElementById('search-btn');
const searchBar = document.getElementById('search-bar');
const searchInput = document.getElementById('search-input');
const headerTitle = document.getElementById('header-title');
const closeSearchBtn = document.getElementById('close-search-btn');

if (searchBtn) {
    searchBtn.onclick = () => {
        if (multiDeleteMode) { deleteSelectedEntries(); return; }
        if (headerTitle) headerTitle.classList.add('hidden');
        searchBtn.classList.add('hidden');
        if (searchBar) searchBar.classList.remove('hidden');
        if (searchInput) setTimeout(() => searchInput.focus(), 50);
    };
}

if (closeSearchBtn) {
    closeSearchBtn.onclick = () => {
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
        renderEntries();
    });
}

// Если элементы поиска есть в DOM (например, мы вернем их позже) — привязываем
if (searchBtn) {
    searchBtn.onclick = () => {
        if (multiDeleteMode) { deleteSelectedEntries(); return; }
        if (headerTitle) headerTitle.classList.add('hidden');
        searchBtn.classList.add('hidden');
        if (searchBar) searchBar.classList.remove('hidden');
        if (searchInput) setTimeout(() => searchInput.focus(), 50);
    };
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
    setTimeout(() => {
        const modal = document.getElementById('stats-modal');
        if (!modal || modal.classList.contains('hidden')) return;
        if (currentChartMode === 'line') drawMoodChart();
        else drawBarChart();
    }, 80);
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
        
        document.querySelectorAll('.period-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        document.getElementById('chart-period-selector').classList.add('hidden');
        
        if (currentChartMode === 'bar') {
            drawBarChart();
        }
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
    let periodLabel = 'За всё время';
    if (currentBarPeriod === 'week') periodLabel = 'За неделю';
    if (currentBarPeriod === 'month') periodLabel = 'За текущий месяц';
    
    document.getElementById('chart-summary').textContent = `${periodLabel} · Всего записей: ${totalEntries}`;
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

function openStatsModal() {
    closeChartModal();
    closeCalendarScreen();
    closeSidebar();
    currentStatsMode = 'normal';
    
    // Сброс UI на обычный режим
    const toggleText = document.getElementById('stats-toggle-text');
    const toggleIcon = document.getElementById('stats-toggle-icon');
    if (toggleText) toggleText.textContent = 'Глубокая статистика';
    if (toggleIcon) toggleIcon.innerHTML = NAV_ICONS.deepStats;
    document.getElementById('stats-normal-body').classList.remove('hidden');
    document.getElementById('stats-deep-body').classList.add('hidden');

    if (diaryEntries.length === 0) {
        document.getElementById('stats-items-container').innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:40px 0;">Пока нет записей.<br>Начните вести дневник!</p>';
        document.getElementById('stats-modal').classList.remove('hidden');
        redrawStatsChart();
        refreshStatsChart();
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

    // === ДВУХСТУПЕНЧАТОЕ СРЕДНЕЕ (по дням, а не по записям) ===
    const DAY_MS = 86400000;
    const nowMs = Date.now();

    const stats7   = getPeriodStats(nowMs - 7 * DAY_MS, nowMs);
    const stats30  = getPeriodStats(nowMs - 30 * DAY_MS, nowMs);
    const statsAll = getPeriodStats(0, nowMs);

    const avgLast7 = stats7.avg ?? 0;
    const last7Count = stats7.days;

    const avgMonth = stats30.avg ?? 0;
    const monthCount = stats30.days;

    const avgMood = statsAll.avg ?? 0;
    const moodEntriesCount = statsAll.days;

    const avgMoodEmoji = getEmojiByScore(avgMood);
    const avgMonthEmoji = getEmojiByScore(avgMonth);
    const avgLast7Emoji = getEmojiByScore(avgLast7);

    // 2. Лучшее и худшее за последние 7 дней (по записям — это правильно)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(new Date().getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    
    let weekBest = null;
    let weekWorst = null;
    
    diaryEntries.forEach(entry => {
        const d = new Date(entry.date);
        if (d >= sevenDaysAgo) {
            const score = getMoodScore(entry.mood);
            if (score !== null) {
                if (!weekBest || score > weekBest.score) {
                    weekBest = { emoji: entry.mood, score: score, date: entry.date };
                }
                if (!weekWorst || score < weekWorst.score) {
                    weekWorst = { emoji: entry.mood, score: score, date: entry.date };
                }
            }
        }
    });

    // --- ФОРМИРУЕМ HTML ---
    const longestEntry = [...diaryEntries].sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0))[0];
    const shortestEntry = [...diaryEntries].sort((a, b) => (a.wordCount || 0) - (b.wordCount || 0))[0];
    const firstDateStr = firstEntryDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

    // HTML вставка
    document.getElementById('stats-items-container').innerHTML = `

        <!-- Лучшее за неделю -->
        <div class="stats-item ${weekBest ? getStatsMoodClass(weekBest.score) : ''}">
            <span class="stats-label">Лучшее за неделю</span>
            <span class="stats-value" style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
                <span style="font-size: 0.8em; color: var(--text-muted);">
                    ${weekBest ? new Date(weekBest.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—'}
                </span>
                ${weekBest ? getMoodSvg(weekBest.emoji, 24) : ''}
            </span>
        </div>

        <!-- Худшее за неделю -->
        <div class="stats-item ${weekWorst ? getStatsMoodClass(weekWorst.score) : ''}">
            <span class="stats-label">Худшее за неделю</span>
            <span class="stats-value" style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
                <span style="font-size: 0.8em; color: var(--text-muted);">
                    ${weekWorst ? new Date(weekWorst.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—'}
                </span>
                ${weekWorst ? getMoodSvg(weekWorst.emoji, 24) : ''}
            </span>
        </div>

        <!-- Самое частое настроение -->
        <div class="stats-item ${getStatsMoodClass(getMoodScore(topMood[0]))}">
            <span class="stats-label">Самое частое настроение</span>
            <span class="stats-value" style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
                <span style="font-size: 0.8em; color: var(--text-muted);">${topMood[1]} ${topMood[1] === 1 ? 'раз' : 'раза'}</span>
                ${getMoodSvg(topMood[0], 24)}
            </span>
        </div>

        <!-- Среднее за 7 дней -->
        <div class="stats-item ${last7Count > 0 ? getStatsMoodClass(avgLast7) : ''}">
            <span class="stats-label">Среднее за 7 дней</span>
            <span class="stats-value" style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
                ${last7Count > 0 ? `<span style="font-size: 0.8em; color: var(--text-muted);">(${avgLast7.toFixed(1)})</span>` : '<span style="font-size: 0.8em; color: var(--text-muted);">—</span>'}
                ${last7Count > 0 ? getMoodSvg(avgLast7Emoji, 24) : ''}
            </span>
        </div>

        <!-- Среднее настроение (30 дней) -->
        <div class="stats-item ${monthCount > 0 ? getStatsMoodClass(avgMonth) : ''}">
            <span class="stats-label">Среднее за 30 дней</span>
            <span class="stats-value" style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
                ${monthCount > 0 ? `<span style="font-size: 0.8em; color: var(--text-muted);">(${avgMonth.toFixed(1)})</span>` : '<span style="font-size: 0.8em; color: var(--text-muted);">—</span>'}
                ${monthCount > 0 ? getMoodSvg(avgMonthEmoji, 24) : ''}
            </span>
        </div>

        <!-- Среднее настроение (всё время) -->
        <div class="stats-item ${moodEntriesCount > 0 ? getStatsMoodClass(avgMood) : ''}">
            <span class="stats-label">Среднее за всё время</span>
            <span class="stats-value" style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
                <span style="font-size: 0.8em; color: var(--text-muted);">(${avgMood.toFixed(1)})</span>
                ${getMoodSvg(avgMoodEmoji, 24)}
            </span>
        </div>

        <!-- Дней с записями (предпоследний) -->
        <div class="stats-item">
            <span class="stats-label">Дней с записями</span>
            <span class="stats-value">${daysWithEntries} из ${daysSinceFirst} (${activityPercent}%)</span>
        </div>

        <!-- Всего записей (в самом низу) -->
        <div class="stats-item">
            <span class="stats-label">Всего записей</span>
            <span class="stats-value large">${totalEntries}</span>
        </div>

        <!-- Первая запись (в самом-самом низу) -->
        <div class="stats-item">
            <span class="stats-label">Первая запись</span>
            <span class="stats-value" style="font-size: 0.9em;">${firstDateStr}</span>
        </div>
    `;

    document.getElementById('stats-modal').classList.remove('hidden');
    redrawStatsChart();
    // Сброс скролла внутри модалки
    refreshStatsScroll();
    updateBodyScrollLock();
}

// Переключатель режимов статистики
document.getElementById('stats-mode-toggle').onclick = () => {
    if (currentStatsMode === 'normal') {
        currentStatsMode = 'deep';
        document.getElementById('stats-toggle-text').textContent = 'Обычная статистика';
        document.getElementById('stats-toggle-icon').innerHTML = NAV_ICONS.stats;
        document.getElementById('stats-normal-body').classList.add('hidden');
        document.getElementById('stats-deep-body').classList.remove('hidden');
        requestAnimationFrame(() => {
            renderDeepStats();
            refreshStatsScroll();
        });
    } else {
        currentStatsMode = 'normal';
        document.getElementById('stats-toggle-text').textContent = 'Глубокая статистика';
        document.getElementById('stats-toggle-icon').innerHTML = NAV_ICONS.deepStats;
        document.getElementById('stats-normal-body').classList.remove('hidden');
        document.getElementById('stats-deep-body').classList.add('hidden');
        document.getElementById('stats-chart-section').classList.remove('hidden');
        requestAnimationFrame(() => {
            refreshStatsChart();
            refreshStatsScroll();
        });
    }
};


// === 🏆 САМАЯ ДЛИННАЯ ПОЛОСА ХОРОШЕГО НАСТРОЕНИЯ ===
function renderBestStreak() {
    // 1. Группируем записи по дням
    const daysMap = {};
    diaryEntries.forEach(entry => {
        const dateKey = getDateKey(entry.date);
        if (!daysMap[dateKey]) daysMap[dateKey] = [];
        daysMap[dateKey].push(entry);
    });

    // 2. Преобразуем в массив дней со средним баллом
    const sortedDays = Object.keys(daysMap).map(dateKey => {
        let totalScore = 0;
        let count = 0;
        daysMap[dateKey].forEach(entry => {
            const score = getMoodScore(entry.mood);
            if (score !== null) { totalScore += score; count++; }
        });
        return {
            date: dateKey,
            dateObj: new Date(dateKey + 'T12:00:00'),
            avgScore: count > 0 ? (totalScore / count) : 0,
            entries: daysMap[dateKey]
        };
    }).sort((a, b) => a.dateObj - b.dateObj);

    // 3. Ищем самый длинный стрик (дни подряд с хорошим настроением >= 7)
    let bestStreak = [];
    let currentStreak = [];

    sortedDays.forEach((day) => {
        const isGoodMood = day.avgScore >= 7;
        
        let isNextDay = false;
        if (currentStreak.length > 0) {
            const prevDay = currentStreak[currentStreak.length - 1].dateObj;
            const diffTime = Math.abs(day.dateObj - prevDay);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            isNextDay = diffDays === 1;
        }

        if (isGoodMood && (currentStreak.length === 0 || isNextDay)) {
            currentStreak.push(day);
        } else {
            if (currentStreak.length > bestStreak.length) {
                bestStreak = [...currentStreak];
            }
            currentStreak = isGoodMood ? [day] : [];
        }
    });

    if (currentStreak.length > bestStreak.length) {
        bestStreak = [...currentStreak];
    }

    // 4. Формируем HTML
    const container = document.getElementById('best-streak-container');
    if (!container) return;

    if (bestStreak.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px 0; font-size:0.9em;">Пока нет непрерывной полосы хорошего настроения.</p>';
        return;
    }

    const firstDay = bestStreak[0];
    const lastDay = bestStreak[bestStreak.length - 1];
    const midDay = bestStreak[Math.floor(bestStreak.length / 2)];

    // Собираем уникальные триггеры
    const allTriggers = new Set();
    bestStreak.forEach(day => {
        day.entries.forEach(entry => {
            if (entry.triggers) {
                entry.triggers.forEach(t => allTriggers.add(t));
            }
        });
    });

    const startDateStr = firstDay.dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    const endDateStr = lastDay.dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    const daysCount = bestStreak.length;

    const triggersHtml = allTriggers.size > 0 
    ? `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:15px; justify-content:center;">${Array.from(allTriggers).map(t => `<span class="entry-trigger-chip trigger-level-4">${escapeHtml(t)}</span>`).join('')}</div>` 
    : '';

    container.innerHTML = `
        <div style="text-align:center; margin-bottom: 15px;">
            <h3 style="font-size:1em; margin:0; color:var(--text-color); font-weight: 400;">Самая длинная полоса хорошего настроения</h3>
        </div>

        <div style="position: relative; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; margin: 20px 0;">
            <!-- Линия -->
            <div style="position: absolute; top: 50%; left: 30px; right: 30px; height: 3px; background: linear-gradient(90deg, #8bc34a, #1b5e20); z-index: 1;"></div>

            <!-- Начало -->
            <div style="position: relative; z-index: 2; text-align: center;">
                <div style="background: var(--surface); padding: 4px; border-radius: 50%; border: 2px solid #8bc34a; display: inline-flex; align-items: center; justify-content: center;">
                    ${getMoodSvg(firstDay.entries[0].mood, 24)}
                </div>
            </div>

            <!-- Середина -->
            <div style="position: relative; z-index: 2; text-align: center;">
                <div style="background: var(--surface); padding: 4px; border-radius: 50%; border: 2px solid #8bc34a; display: inline-flex; align-items: center; justify-content: center;">
                    ${getMoodSvg(midDay.entries[0].mood, 24)}
                </div>
            </div>

            <!-- Конец -->
            <div style="position: relative; z-index: 2; text-align: center;">
                <div style="background: var(--surface); padding: 4px; border-radius: 50%; border: 2px solid #1b5e20; display: inline-flex; align-items: center; justify-content: center;">
                    ${getMoodSvg(lastDay.entries[0].mood, 24)}
                </div>
            </div>
        </div>

        <!-- Дата под графиком (мелким шрифтом) -->
        <div style="text-align: center; margin-bottom: 15px;">
            <p style="font-size: 0.75em; color: var(--text-muted); margin: 0;">${daysCount} ${daysCount === 1 ? 'день' : daysCount < 5 ? 'дня' : 'дней'} с ${startDateStr} по ${endDateStr}</p>
        </div>

        ${triggersHtml}
    `;
}


// === 📅 НАСТРОЕНИЕ ЗА ПРОШЛУЮ НЕДЕЛЮ ===
function renderLastWeekMood(containerId = 'last-week-mood-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    // 1. Определяем прошлую неделю (Пн-Вс)
    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // Делаем Вс = 7
    const startOfLastWeek = new Date(today);
    startOfLastWeek.setDate(today.getDate() - dayOfWeek - 6); // Отступаем на прошлую неделю
    startOfLastWeek.setHours(0, 0, 0, 0);

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfLastWeek);
        d.setDate(d.getDate() + i);
        weekDays.push(d);
    }

  
    // 2. Собираем настроение по дням
    const dayScores = weekDays.map(date => {
        const dateKey = getDateKey(date);
        const dayEntries = diaryEntries.filter(e => getDateKey(e.date) === dateKey);

        // Считаем "умный" балл через нашу новую функцию
        const avg = calculateSmartDayScore(dayEntries);

        return {
            date,
            dateKey,
            avg: avg, // Теперь тут либо число, либо null
            emoji: avg !== null ? getEmojiByScore(avg) : null, // Берем эмодзи, если есть avg
            count: dayEntries.length // Количество записей (для проверки заполненности)
        };
    });

    // === НОВАЯ ПРОВЕРКА: минимум 3 заполненных дня ===
    const filledDays = dayScores.filter(d => d.avg !== null).length;
    if (filledDays < 3) {
        container.innerHTML = `
            <div style="text-align:center; padding: 20px 10px;">
                <h3 style="font-size:1em; margin:0 0 10px 0; color:var(--text-color); font-weight: 400;">Настроение на прошлой неделе</h3>
                <p style="font-size:0.9em; color:var(--text-muted); margin:0;">
                    Ведите дневник хотя бы 3 дня в неделю, чтобы видеть результаты.
                </p>
            </div>
        `;
        return;
    }

    // 3. Считаем среднее за неделю и топ-триггеры
    let weekTotal = 0, weekCount = 0;
    const weekTriggers = {};
    diaryEntries.forEach(e => {
        const d = new Date(e.date);
        if (d >= startOfLastWeek && d < new Date(startOfLastWeek.getTime() + 7 * 24 * 60 * 60 * 1000)) {
            const s = getMoodScore(e.mood);
            if (s !== null) { weekTotal += s; weekCount++; }
            if (e.triggers) {
                e.triggers.forEach(t => weekTriggers[t] = (weekTriggers[t] || 0) + 1);
            }
        }
    });
    const weekAvg = weekCount > 0 ? (weekTotal / weekCount) : 0;
    const weekAvgEmoji = getEmojiByScore(weekAvg);
    
    // Берем топ-3 триггера
    const topTriggers = Object.entries(weekTriggers).sort((a, b) => b[1] - a[1]).slice(0, 3).map(t => t[0]);

    // 4. Формируем градиент для линии
    // Находим индексы первого и последнего дня с данными
    const validIndices = dayScores.map((d, i) => d.avg !== null ? i : -1).filter(i => i !== -1);
    const firstIdx = validIndices[0];
    const lastIdx = validIndices[validIndices.length - 1];

    // Строим градиент по отрезкам
    let gradientStops = [];
    const numSegments = lastIdx - firstIdx;

    if (numSegments === 0) {
        // Если только один день с данными
        const color = getMoodColorHex(dayScores[firstIdx].avg);
        gradientStops.push(`${color} 0%`, `${color} 100%`);
    } else {
        for (let i = firstIdx; i < lastIdx; i++) {
            const currentDay = dayScores[i];
            const nextDay = dayScores[i + 1];

            const startPercent = ((i - firstIdx) / numSegments) * 100;
            const endPercent = ((i + 1 - firstIdx) / numSegments) * 100;

            const startColor = currentDay.avg !== null ? getMoodColorHex(currentDay.avg) : '#cccccc';
            const endColor = nextDay.avg !== null ? getMoodColorHex(nextDay.avg) : '#cccccc';

            // Если это первый отрезок, добавляем начальный цвет
            if (i === firstIdx) {
                gradientStops.push(`${startColor} ${startPercent}%`);
            }

            // Добавляем конечный цвет этого отрезка
            gradientStops.push(`${endColor} ${endPercent}%`);
        }
    }

    const gradient = `linear-gradient(90deg, ${gradientStops.join(', ')})`;

    // 5. Формируем HTML (Пн, Чт, Вс)
    const daysHtml = dayScores.map((d, i) => {
        const isFirst = i === 0;
        const isLast = i === 6;
        const isMid = i === 3;
        
        if (!isFirst && !isLast && !isMid) return '';

        const dayName = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][i];
        const dateStr = d.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

        return `
            <div style="position: relative; z-index: 2; text-align: center; display: flex; flex-direction: column; align-items: center;">
                <div style="background: var(--surface); padding: 4px; border-radius: 50%; border: 2px solid var(--border-color); display: flex; align-items: center; justify-content: center; width: 40px; height: 40px;">
                    ${d.emoji ? getMoodSvg(d.emoji, 24) : '<span style="font-size:0.7em; color:var(--text-muted);">—</span>'}
                </div>
                <div style="font-size: 0.7em; color: var(--text-muted); margin-top: 4px;">${dayName}</div>
                <div style="font-size: 0.65em; color: var(--text-muted);">${dateStr}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div style="text-align:center; margin-bottom: 15px;">
            <h3 style="font-size:1em; margin:0; color:var(--text-color); font-weight: 400;">Настроение на прошлой неделе</h3>
        </div>

        <div style="position: relative; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; margin: 20px 0;">
            <!-- Градиентная линия -->
            <div style="position: absolute; top: 20px; left: 30px; right: 30px; height: 4px; background: ${gradient}; z-index: 1; border-radius: 2px;"></div>

            ${daysHtml}
        </div>

        <div style="text-align: center; margin-top: 15px;">
            <p style="font-size: 0.85em; color: var(--text-color); margin: 0 0 5px 0;">
                Среднее настроение за неделю: <strong>${weekAvg.toFixed(1)} ${weekAvgEmoji}</strong>
            </p>
            ${topTriggers.length > 0 ? `
                <p style="font-size: 0.75em; color: var(--text-muted); margin: 0;">
                    Чаще всего влияли: ${topTriggers.join(', ')}
                </p>
            ` : ''}
        </div>
    `;
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

// --- ГЛУБОКАЯ СТАТИСТИКА (ТРИГГЕРЫ) ---
function renderDeepStats() {
    const triggerStats = {};
    // Отрисовка "Самая длинная полоса хорошего настроения"
    renderBestStreak();
    // Отрисовка "Настроение на прошлой неделе" (НОВОЕ)
    renderLastWeekMood();
    diaryEntries.forEach(entry => {
        if (entry.triggers && entry.triggers.length > 0) {
            const score = getMoodScore(entry.mood);
            if (score !== null) {
                entry.triggers.forEach(trig => {
                    if (!triggerStats[trig]) triggerStats[trig] = { total: 0, count: 0 };
                    triggerStats[trig].total += score;
                    triggerStats[trig].count += 1;
                });
            }
        }
    });

    const sortedTriggers = Object.entries(triggerStats).map(([name, data]) => {
        const avgScore = data.total / data.count;
        return {
            trigger: name,
            avgScore: avgScore,
            count: data.count,
            emoji: getEmojiByScore(avgScore)
        };
    }).sort((a, b) => b.count - a.count); // Сортируем по частоте для общего списка

    // --- ТОП-3 ХОРОШИХ И ПЛОХИХ ---
    // Берем только те, что встречались хотя бы 1 раз (уже есть в sortedTriggers)
    const sortedByScore = [...sortedTriggers].sort((a, b) => b.avgScore - a.avgScore);
    
    const topGood = sortedByScore.slice(0, 3).filter(t => t.avgScore >= 5); // Только положительные
    const topBad = sortedByScore.slice(-3).reverse().filter(t => t.avgScore < 5); // Только отрицательные

    const goodContainer = document.getElementById('top-good-triggers');
    const badContainer = document.getElementById('top-bad-triggers');

    goodContainer.innerHTML = '';
    badContainer.innerHTML = '';

    if (topGood.length > 0) {
        let html = `<div style="background: rgba(76, 175, 80, 0.1); border-left: 4px solid var(--accent-color); padding: 10px; border-radius: 8px;">
            <div style="font-size: 0.85em; color: var(--text-muted); margin-bottom: 8px;">✨ Больше всего радости:</div>`;
        topGood.forEach(t => {
            html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px; align-items: center;">
                <span style="font-size: 0.9em; font-weight: 500;">${t.trigger}</span>
                <span style="font-size: 0.9em; color: var(--accent-color); font-weight: 600; display: flex; align-items: center; gap: 4px;">
                    ${getMoodSvg(t.emoji, 16)} ${t.avgScore.toFixed(1)}
                </span>
            </div>`;
        });
        html += `</div>`;
        goodContainer.innerHTML = html;
    }

    if (topBad.length > 0) {
        let html = `<div style="background: rgba(244, 67, 54, 0.1); border-left: 4px solid var(--danger-color); padding: 10px; border-radius: 8px;">
            <div style="font-size: 0.85em; color: var(--text-muted); margin-bottom: 8px;">⚠️ Чаще всего портит настроение:</div>`;
        topBad.forEach(t => {
            html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px; align-items: center;">
                <span style="font-size: 0.9em; font-weight: 500;">${t.trigger}</span>
                <span style="font-size: 0.9em; color: var(--danger-color); font-weight: 600; display: flex; align-items: center; gap: 4px;">
                    ${getMoodSvg(t.emoji, 16)} ${t.avgScore.toFixed(1)}
                </span>
            </div>`;
        });
        html += `</div>`;
        badContainer.innerHTML = html;
    }

    // Заполняем селект
    const select = document.getElementById('trigger-filter-select');
    const currentValue = select.value;
    select.innerHTML = '<option value="all">Все триггеры</option>';
    sortedTriggers.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.trigger;
        opt.textContent = t.trigger;
        select.appendChild(opt);
    });
    select.value = currentValue;

    // Фильтрация для графика
    const filterValue = select.value;
    let displayData = sortedTriggers;
    if (filterValue !== 'all') {
        displayData = sortedTriggers.filter(t => t.trigger === filterValue);
    }

    // Отрисовка графика
    drawTriggerChart(displayData);


    const triggerListEl = document.getElementById('trigger-stats-list');
    const triggerChartEl = document.getElementById('trigger-chart');

    if (sortedTriggers.length === 0) {
        triggerChartEl.classList.add('hidden');
        if (triggerListEl) {
            triggerListEl.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px 0;">Пока нет записей с триггерами.</p>';
        }
    } else {
        triggerChartEl.classList.remove('hidden');
        if (triggerListEl) triggerListEl.innerHTML = ''; // очищаем на случай, если было сообщение
    }
    
    // Проверка, что мы на вкладке "Глубокая статистика", прежде чем рисовать график по дням
    if (!document.getElementById('stats-deep-body').classList.contains('hidden')) {
        drawWeekdayChart();
    }
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
    if (mode === 'deep' && currentStatsMode === 'normal') {
        document.getElementById('stats-mode-toggle').click();
    }
}

function closeAllTriggersList() {
    const modal = document.getElementById('triggers-list-modal');
    if (!modal || modal.classList.contains('hidden')) return; // список не открыт — ничего не делаем
    modal.classList.add('hidden');
    openStatsModalInMode(statsModeBeforeTriggers); // возвращаем туда, откуда пришли
}

// Функция отрисовки списка
function renderAllTriggersList() {
    const container = document.getElementById('all-triggers-list-container');
    if (!container) return;

    // 1. Собираем статистику по триггерам
    const triggerStats = {};
    diaryEntries.forEach(entry => {
        if (entry.triggers && entry.triggers.length > 0) {
            const score = getMoodScore(entry.mood);
            if (score !== null) {
                entry.triggers.forEach(trig => {
                    if (!triggerStats[trig]) triggerStats[trig] = { total: 0, count: 0 };
                    triggerStats[trig].total += score;
                    triggerStats[trig].count += 1;
                });
            }
        }
    });

    // 2. Формируем массив и сортируем по частоте
    const sortedTriggers = Object.entries(triggerStats).map(([name, data]) => {
        const avgScore = data.total / data.count;
        return {
            trigger: name,
            avgScore: avgScore,
            count: data.count,
            emoji: getEmojiByScore(avgScore)
        };
    }).sort((a, b) => b.count - a.count);

    if (sortedTriggers.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px 0;">Пока нет записей с триггерами.</p>';
        return;
    }

    
    // --- УМНЫЙ АНАЛИЗ (ДВА ИНСАЙТА) ---
    const posBlock = document.getElementById('triggers-insight-pos-block');
    const posText = document.getElementById('triggers-insight-pos-text');
    const negBlock = document.getElementById('triggers-insight-neg-block');
    const negText = document.getElementById('triggers-insight-neg-text');

    // 1. Глобальное среднее
    let globalTotal = 0, globalCount = 0;
    diaryEntries.forEach(e => {
        const s = getMoodScore(e.mood);
        if (s !== null) { globalTotal += s; globalCount++; }
    });
    const globalAvg = globalCount > 0 ? (globalTotal / globalCount) : 0;

    // 2. Ищем лучший позитивный и худший негативный триггеры
    let bestPositive = null;
    let bestNegative = null;
    let maxPosImpact = 0;
    let maxNegImpact = 0;

    // Группируем по дням для проверки "следующего дня"
    const entriesByDay = {};
    diaryEntries.forEach(e => {
        const key = getDateKey(e.date);
        if (!entriesByDay[key]) entriesByDay[key] = [];
        entriesByDay[key].push(e);
    });

    Object.entries(triggerStats).forEach(([triggerName, data]) => {
        // --- НОВЫЕ ПОРОГИ УВЕРЕННОСТИ ---
        let confidence = 'low';
        if (data.count >= 15) confidence = 'high';      // было 9
        else if (data.count >= 8) confidence = 'medium'; // было 6
        else if (data.count >= 5) confidence = 'low';    // было 3
        else return; // Меньше 5 записей вообще не анализируем

        const sameDayAvg = data.total / data.count;

        let nextDayTotal = 0, nextDayCount = 0;
        diaryEntries.forEach(e => {
            if (e.triggers && e.triggers.includes(triggerName)) {
                const d = new Date(e.date);
                d.setDate(d.getDate() + 1);
                const nextDayKey = getDateKey(d);
                if (entriesByDay[nextDayKey]) {
                    entriesByDay[nextDayKey].forEach(nextEntry => {
                        const s = getMoodScore(nextEntry.mood);
                        if (s !== null) { nextDayTotal += s; nextDayCount++; }
                    });
                }
            }
        });

        const nextDayAvg = nextDayCount > 0 ? (nextDayTotal / nextDayCount) : sameDayAvg;
        const sameDayDiff = sameDayAvg - globalAvg;
        const nextDayDiff = nextDayAvg - globalAvg;
        const impact = Math.abs(sameDayDiff) > Math.abs(nextDayDiff) ? sameDayDiff : nextDayDiff;
        const impactType = Math.abs(sameDayDiff) > Math.abs(nextDayDiff) ? 'same' : 'next';

        // Позитивный триггер (impact > 0)
        if (impact > 0.3 && impact > maxPosImpact) {
            maxPosImpact = impact;
            bestPositive = { trigger: triggerName, confidence, diff: impact, percent: Math.round((impact / 10) * 100), type: impactType };
        }

        // Негативный триггер (impact < 0)
        if (impact < -0.3 && impact < maxNegImpact) {
            maxNegImpact = impact;
            bestNegative = { trigger: triggerName, confidence, diff: impact, percent: Math.round((Math.abs(impact) / 10) * 100), type: impactType };
        }
    });

    // 3. Формируем текст для позитивного инсайта
    if (bestPositive) {
        let caution = bestPositive.confidence === 'low' ? 'Возможно, ' : '';
        let confText = bestPositive.confidence === 'low' ? ' (мало данных)' : 
                       bestPositive.confidence === 'medium' ? ' (средняя уверенность)' : '';

        const timeLabel = bestPositive.type === 'next' ? 'на следующий день после' : 'в день, когда вы отмечаете';

        posText.innerHTML = `
            ${caution}ваше настроение обычно <strong>на ${bestPositive.percent}% выше</strong>, 
            ${timeLabel} триггер <strong>«${escapeHtml(bestPositive.trigger)}»</strong>.
            <span style="font-size: 0.85em; opacity: 0.7; display: block; margin-top: 5px;">${confText}</span>
        `;
        posBlock.style.display = 'block';
    } else {
        posBlock.style.display = 'none';
    }

    // 4. Формируем текст для негативного инсайта
    if (bestNegative) {
        let caution = bestNegative.confidence === 'low' ? 'Возможно, ' : '';
        let confText = bestNegative.confidence === 'low' ? ' (мало данных)' : 
                       bestNegative.confidence === 'medium' ? ' (средняя уверенность)' : '';

        const timeLabel = bestNegative.type === 'next' ? 'на следующий день после' : 'в день, когда вы отмечаете';

        negText.innerHTML = `
            ${caution}ваше настроение обычно <strong>на ${bestNegative.percent}% ниже</strong>, 
            ${timeLabel} триггер <strong>«${escapeHtml(bestNegative.trigger)}»</strong>.
            <span style="font-size: 0.85em; opacity: 0.7; display: block; margin-top: 5px;">${confText}</span>
        `;
        negBlock.style.display = 'block';
    } else {
        negBlock.style.display = 'none';
    }
    // --- КОНЕЦ АНАЛИЗА ---


    // 3. Генерируем HTML для списка (ОДИН цикл, без дублей)
    let html = '<div>';
    sortedTriggers.forEach(t => {
        let levelClass = '';
        if (t.avgScore <= 2) levelClass = 'trigger-level-1';
        else if (t.avgScore <= 4) levelClass = 'trigger-level-2';
        else if (t.avgScore <= 6) levelClass = 'trigger-level-3';
        else if (t.avgScore <= 8) levelClass = 'trigger-level-4';
        else levelClass = 'trigger-level-5';

        if (t.count < 2) levelClass = '';

        html += `
            <div class="trigger-list-row" onclick="applyTriggerFilterAndClose('${escapeHtml(t.trigger)}')">
                <div style="display: flex; align-items: center;">
                    <div class="trigger-list-indicator ${levelClass}"></div>
                    <span class="trigger-list-name">${escapeHtml(t.trigger)}</span>
                </div>
                <div style="display: flex; align-items: center;">
                    <span class="trigger-list-count">${t.count} ${t.count === 1 ? 'запись' : t.count < 5 ? 'записи' : 'записей'}</span>
                    <span class="trigger-list-score">${t.emoji}</span>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
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
    const isDarkTheme = document.body.classList.contains('theme-dark');
    const textColor = isDarkTheme ? '#ffffff' : '#333333';
    const gridColor = isDarkTheme ? '#555555' : '#dddddd';


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
        ctx.fillText(item.trigger, left - 10, y + barHeight / 2);

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
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    if (multiDeleteMode) exitMultiDeleteMode();
    closeTagsModal();
    appMain.classList.add('search-active');
    renderEntries();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`Показаны записи: ${tag}`, 'info');
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
    showToast(`Показаны записи с триггером: ${trigger}`, 'info');
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
    showToast(`Записи с настроением ${emoji}`, 'info');
    cameFromDeepStats = false;
    document.getElementById('back-to-stats-btn').classList.add('hidden');
}

function clearMoodFilter() { activeMoodFilter = null; renderEntries(); }
function clearTriggerFilter() {
    activeTriggerFilter = null;
    renderEntries();
}

document.getElementById('entries-list').addEventListener('click', (e) => {
    if (e.target.closest('#clear-tag-filter')) clearTagFilter();
    else if (e.target.closest('#clear-date-filter')) clearDateFilter();
    else if (e.target.closest('#clear-mood-filter')) clearMoodFilter();
    else if (e.target.closest('#clear-trigger-filter')) clearTriggerFilter();
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
    renderEntries();
    renderCalendar();
    drawMoodChart();
    updateProgressCard();
};


// === ⬅️➡️ ПЕРЕЛИСТЫВАНИЕ ЗАПИСЕЙ (хронологически: следующая = новее) ===
function getVisibleEntriesChrono() {
    return Array.from(document.querySelectorAll('#entries-list .entry-card'))
        .map(c => diaryEntries.find(e => e.id === c.dataset.entryId))
        .filter(Boolean)
        .sort((a, b) =>
            (new Date(a.date) - new Date(b.date)) ||
            ((a.createdAt || 0) - (b.createdAt || 0))
        );
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
    if (activeToolbarPanel === 'triggers-panel') {
        closeToolbarPanel();
    } else {
        openToolbarPanel('triggers-panel');
    }
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

document.getElementById('trigger-filter-select').addEventListener('change', () => {
    renderDeepStats();
});

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

    
    // Группируем записи по конкретным датам
    const dateGroups = {};
    diaryEntries.forEach(entry => {
        const dateKey = getDateKey(entry.date);
        if (!dateGroups[dateKey]) {
            dateGroups[dateKey] = [];
        }
        dateGroups[dateKey].push(entry);
    });

    // Считаем ПРОСТОЕ среднее для каждой даты и раскладываем по дням недели
    const weekdayScores = [[], [], [], [], [], [], []]; // Пн, Вт, Ср, Чт, Пт, Сб, Вс

    Object.entries(dateGroups).forEach(([dateKey, entries]) => {
        let total = 0;
        let count = 0;
        entries.forEach(e => {
            const s = getMoodScore(e.mood);
            if (s !== null) { total += s; count++; }
        });

        if (count > 0) {
            const avgForDay = total / count; // ПРОСТОЕ СРЕДНЕЕ ЗА ДЕНЬ
            const dateObj = new Date(dateKey + 'T12:00:00');
            const dayOfWeek = dateObj.getDay(); // 0 = Вс, 1 = Пн ...
            weekdayScores[dayOfWeek].push(avgForDay);
        }
    });

    // Теперь усредняем баллы по всем дням недели
    const weekdayData = weekdayScores.map(scores => {
        if (scores.length === 0) return { avgScore: null };
        const avg = scores.reduce((sum, val) => sum + val, 0) / scores.length;
        return { avgScore: avg };
    });


    const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
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

    // Фильтруем записи за выбранный месяц
    const monthEntries = diaryEntries.filter(entry => {
        const d = new Date(entry.date);
        return d.getMonth() === month && d.getFullYear() === year;
    });

    if (monthEntries.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px 0;">В этом месяце пока нет записей.</p>';
        return;
    }

    // Группируем по дням, чтобы найти лучший и худший день
    const days = {};
    monthEntries.forEach(entry => {
        const dayKey = getDateKey(entry.date);
        if (!days[dayKey]) days[dayKey] = [];
        days[dayKey].push(entry);
    });

    let bestDay = null;
    let worstDay = null;

    for (const [dayKey, entries] of Object.entries(days)) {
        let total = 0;
        let count = 0;
        entries.forEach(e => {
            const score = getMoodScore(e.mood);
            if (score !== null) { total += score; count++; }
        });
        if (count === 0) continue;
        
        const avgScore = total / count;
        const avgEmoji = getEmojiByScore(avgScore);

        const dayData = {
            date: dayKey,
            avgScore: avgScore,
            emoji: avgEmoji,
            entries: entries
        };

        if (!bestDay || avgScore > bestDay.avgScore) bestDay = dayData;
        if (!worstDay || avgScore < worstDay.avgScore) worstDay = dayData;
    }

    let html = '';

    // Функция для генерации карточки
    const createCard = (data, isBest) => {
        if (!data) return '';
        
        // Берем самую длинную запись этого дня для превью
        const mainEntry = data.entries.sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0))[0];
        const plainText = getPlainTextFromHTML(mainEntry.content);
        const preview = plainText.length > 80 ? plainText.substring(0, 80) + '...' : plainText;

        const triggersHtml = (mainEntry.triggers && mainEntry.triggers.length > 0)
            ? `<div class="insight-triggers">${mainEntry.triggers.map(t => `<span class="insight-trigger-chip">${escapeHtml(t)}</span>`).join('')}</div>`
            : '';

        const dateObj = new Date(data.date + 'T12:00:00');
        const dateStr = dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

        return `
            <div class="insight-card ${isBest ? '' : 'bad'}">
                <div class="insight-header">
                    <span class="insight-date">${isBest ? '🌟 Лучший день' : '⚠️ Худший день'}: ${dateStr}</span>
                    <span class="insight-mood">${getMoodSvg(data.emoji, 24)}</span>
                </div>
                <div class="insight-content">${preview ? escapeHtml(preview) : '<i>(Без текста)</i>'}</div>
                ${triggersHtml}
            </div>
        `;
    };

    if (bestDay) html += createCard(bestDay, true);
    if (worstDay && bestDay && worstDay.date !== bestDay.date) {
        html += createCard(worstDay, false);
    } else if (worstDay && !bestDay) {
        html += createCard(worstDay, false);
    }

    // Заголовок
    container.innerHTML = `<h3>Инсайты месяца</h3>` + (html || '<p style="text-align:center; color:var(--text-muted);">Недостаточно данных для анализа.</p>');
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
        handleSaveCloseBtn();
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


// === 📜 УМНАЯ ПРОКРУТКА ШАПКИ (АВТОДОКРУТ) ===
// === 📜 УМНАЯ ПРОКРУТКА ШАПКИ (с автодокрутом) ===
(function initSmartHeader() {
    const header = document.querySelector('.top-header');
    if (!header) return;

    let lastScrollTop = 0;
    let scrollDelta = 0;          // накопленная дельта с последней смены направления
    const THRESHOLD = 10;         // порог: 10px, чтобы отфильтровать дрожание
    const DEADZONE = 30;          // у самого верха шапка всегда видна
    let scrollTimer = null;

    window.addEventListener('scroll', () => {
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

        // Автодокрут: если пользователь остановился и шапка в промежуточном состоянии
        scrollTimer = setTimeout(() => {
            const cur = window.pageYOffset || document.documentElement.scrollTop;
            if (cur > DEADZONE && !header.classList.contains('header-hidden')) {
                header.classList.add('header-hidden');
            } else if (cur <= DEADZONE) {
                header.classList.remove('header-hidden');
            }
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
        ? `за 30 дней: ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)} · 3 сторис`
        : '3 сторис о настроении';
    const mem = getNostalgiaEntries();
    const nNote = document.getElementById('widget-nostalgia-note');
    if (nNote) nNote.textContent = mem.length
        ? `${mem.length} ${mem.length === 1 ? 'воспоминание' : mem.length < 5 ? 'воспоминания' : 'воспоминаний'}`
        : 'ностальгии пока нет';
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
    if (sub) sub.textContent = now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

    if (pts.length === 0) {
        ctx.fillStyle = '#93a1ad'; ctx.font = '12px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('В этом месяце пока нет записей', w / 2, top + plotH / 2);
        if (cap) cap.textContent = 'Добавь запись — и график оживёт';
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
    if (cap) cap.innerHTML = `Среднее: <strong>${avg.toFixed(1)}</strong> ${getMoodSvg(getEmojiByScore(avg), 18)} · записей: ${total} · дней: ${pts.length}`;
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
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const es = diaryEntries.filter(e => getDateKey(e.date) === getDateKey(d));
        days.push({ d, avg: calculateSmartDayScore(es), count: es.length });
    }
    if (days.filter(x => x.avg !== null).length < 3) {
        box.innerHTML = `
            <h3 class="story-title">Настроение на прошлой неделе</h3>
            <p class="story-caption" style="margin-top:10px;">Веди дневник хотя бы 3 дня в неделю,<br>чтобы увидеть картину недели.</p>`;
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
    const names = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const cells = days.map((x, i) => {
        if (i !== 0 && i !== 3 && i !== 6) return '';
        return `
            <div style="position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:4px;">
                <div style="width:44px;height:44px;border-radius:50%;background:#1b232c;border:2px solid ${x.avg !== null ? storyMoodColor(x.avg) : '#2d3945'};display:flex;align-items:center;justify-content:center;">
                    ${x.avg !== null ? getMoodSvg(getEmojiByScore(x.avg), 26) : '<span style="color:#6d7a86;font-size:.8em;">—</span>'}
                </div>
                <span style="font-size:.7em;color:#93a1ad;">${names[i]}</span>
                <span style="font-size:.62em;color:#6d7a86;">${x.d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
            </div>`;
    }).join('');
    const scored = days.filter(x => x.avg !== null);
    const weekAvg = scored.reduce((s, x) => s + x.avg, 0) / scored.length;
    const trig = {};
    const weekEnd = new Date(start.getTime() + 7 * 86400000);
    diaryEntries.forEach(e => {
        const t = new Date(e.date);
        if (t >= start && t < weekEnd && e.triggers) {
            e.triggers.forEach(x => trig[x] = (trig[x] || 0) + 1);
        }
    });
    const top = Object.entries(trig).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
    box.innerHTML = `
        <h3 class="story-title">Настроение на прошлой неделе</h3>
        <div style="position:relative;display:flex;align-items:center;justify-content:space-between;padding:0 6px;margin:22px 0 10px;">
            <div style="position:absolute;top:22px;left:26px;right:26px;height:4px;border-radius:2px;background:${gradient};z-index:1;"></div>
            ${cells}
        </div>
        <p class="story-caption">Среднее за неделю: <strong>${weekAvg.toFixed(1)}</strong> ${getMoodSvg(getEmojiByScore(weekAvg), 18)}</p>
        ${top.length ? `<p class="story-sub" style="margin-top:6px;">чаще всего влияли: ${top.map(escapeHtml).join(', ')}</p>` : ''}`;
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
        label.textContent = dateObj.toLocaleDateString('ru-RU', { month: 'long' });
        bar.style.transition = 'none';
        emoji.style.transition = 'none';
        score.style.transition = 'none';
        bar.style.height = '0%';
        emoji.style.bottom = '8px';
        score.style.bottom = '46px';
        if (avg === null) {
            bar.style.background = '#2d3945';
            emoji.innerHTML = '<span style="color:#6d7a86;font-size:1.2em;line-height:34px;display:inline-block;">—</span>';
            score.textContent = 'нет данных';
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
        cap.textContent = 'Пока мало данных для сравнения — веди дневник оба месяца.';
    } else {
        const diff = curAvg - prevAvg;
        const curName = now.toLocaleDateString('ru-RU', { month: 'long' });
        const prevName = prevDate.toLocaleDateString('ru-RU', { month: 'long' });
        if (Math.abs(diff) < 0.15) cap.textContent = `${curName} и ${prevName} — примерно одинаковое настроение.`;
        else if (diff > 0) cap.innerHTML = `${curName} лучше, чем ${prevName}, на <strong>${diff.toFixed(1)}</strong> балла ${getMoodSvg(getEmojiByScore(curAvg), 18)}`;
        else cap.innerHTML = `${curName} пока ниже, чем ${prevName}, на <strong>${Math.abs(diff).toFixed(1)}</strong> балла`;
    }
}

// === НОСТАЛЬГИЯ: МОДАЛКА ===
function openNostalgiaModal() {
    document.getElementById('bottomNav').classList.add('nav-hidden');
    document.body.style.overflow = 'hidden';

    const list = document.getElementById('nostalgia-list');
    const mem = getNostalgiaEntries();
    if (!mem.length) {
        list.innerHTML = '<p class="nostalgia-empty">Ностальгии пока нет.<br>Записи, сделанные в этот день в прошлые годы, появятся здесь.</p>';
    } else {
        list.innerHTML = mem.map(e => {
            const t = getPlainTextFromHTML(e.content || '');
            const years = new Date().getFullYear() - new Date(e.date).getFullYear();
            const label = years === 1 ? 'год' : years < 5 ? 'года' : 'лет';
            return `<button class="nostalgia-row" type="button" data-entry-id="${e.id}">
                <span class="nostalgia-years">${years} ${label} назад</span>
                <span class="nostalgia-mood">${getMoodSvg(e.mood, 22)}</span>
                <span class="nostalgia-text">${escapeHtml(t ? t.slice(0, 110) : (e.title || '(без текста)'))}</span>
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
    renderEntries();
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
    document.getElementById('header-title').textContent = 'Избранные';
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
    document.getElementById('header-title').textContent = 'Мой дневник';
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
    if (!daysWithEntries.has(getDateKey(currentDate))) {
        currentDate.setDate(currentDate.getDate() - 1);
    }
    while (daysWithEntries.has(getDateKey(currentDate))) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
    }
    progressText.textContent = `Вы пишете ${streak} ${streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней'} подряд`;
    progressFill.style.width = `${Math.min((streak / 7) * 100, 100)}%`;
    renderWidgetPreviews();
}

bindClick('sidebar-favorites-btn', applyFavoriteFilter);
bindClick('header-clear-filter-btn', clearActiveFilter);

// === 💫 RIPPLE ДЛЯ КНОПОК РЕЖИМА (chart-mode-btn) ===
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.chart-mode-btn');
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
    preloadMoodImages();
    loadTheme();
    updateSortButtons();
    await loadEntries();
    updateProgressCard();
    renderCalendar();
    initMoodFilterGrid();
    initPinProtection();

    // Все иконки — одной таблицей, без повторов
    const iconMap = {
        'icon-menu': NAV_ICONS.menu,
        'icon-entries': NAV_ICONS.entries,
        'icon-stats': NAV_ICONS.stats,
        'icon-calendar': NAV_ICONS.calendar,
        'icon-plus': NAV_ICONS.plus,
        'icon-back-calendar': NAV_ICONS.back,
        'icon-back-triggers': NAV_ICONS.back,
        'icon-back-stats': NAV_ICONS.back,
        'icon-back-nostalgia': NAV_ICONS.back,
        'calendar-header-icon': NAV_ICONS.calendar,
        'stats-header-icon': NAV_ICONS.stats,
        'stats-toggle-icon': NAV_ICONS.deepStats,
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
        'icon-pin': NAV_ICONS.pin
    };
    Object.entries(iconMap).forEach(([id, svg]) => {
        const el = document.getElementById(id);
        if (el && svg) el.innerHTML = svg;
    });

    setActiveNav('nav-entries-btn');
    setActiveWidget(0);
    renderWidgetPreviews();
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