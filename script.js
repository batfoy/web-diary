let diaryEntries = [];
const STORAGE_KEY = 'my_web_diary_entries_v2';
let currentCalendarDate = new Date();
let editingEntryId = null;
let tempMood = '😐';
let searchQuery = ''; // Для фильтрации записей

const MOODS = [
    { emoji: '😡', score: 0 },  // Самое плохое (внизу)
    { emoji: '😭', score: 1 },
    { emoji: '☹️', score: 2 },
    { emoji: '😕', score: 3 },
    { emoji: '😐', score: 4 },  // Нейтральное (середина)
    { emoji: '😏', score: 5 },
    { emoji: '😊', score: 6 },
    { emoji: '😁', score: 7 },
    { emoji: '🤪', score: 8 },
    { emoji: '🥰', score: 9 }   // Самое хорошее (вверху)
];

// 31 ЦИТАТА (меняется в зависимости от числа месяца: 1-31)
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

function getMoodScore(emoji) {
    const found = MOODS.find(m => m.emoji === emoji);
    return found ? found.score : null;
}

// === 📅 ЦИТАТА ДНЯ ===
function updateDailyQuote() {
    // Получаем текущее число месяца (от 1 до 31)
    const dayOfMonth = new Date().getDate();
    // Используем его как индекс (dayOfMonth - 1, так как массив начинается с 0)
    // Оператор % гарантирует, что если цитат меньше 31, мы не выйдем за границы массива
    const quoteIndex = (dayOfMonth - 1) % QUOTES.length;
    
    document.getElementById('daily-quote-text').textContent = `«${QUOTES[quoteIndex].text}»`;
    document.getElementById('daily-quote-author').textContent = `— ${QUOTES[quoteIndex].author}`;
}

// === 📝 ЛОГИКА СОЗДАНИЯ/РЕДАКТИРОВАНИЯ ===
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
    document.getElementById('mood-modal').classList.remove('hidden');
}

function selectMoodForEntry(emoji) {
    tempMood = emoji;
    document.getElementById('mood-modal').classList.add('hidden');
    openEntryForm();
}

function openEntryForm(entry = null) {
    const dateInput = document.getElementById('entry-date-input');
    const moodDisplay = document.getElementById('selected-mood-display');
    const titleInput = document.getElementById('entry-title');
    const textInput = document.getElementById('entry-text');
    const saveBtn = document.getElementById('save-entry-btn');
    const updateBtn = document.getElementById('update-entry-btn');

    if (entry) {
        editingEntryId = entry.id;
        dateInput.value = entry.date.split('T')[0];
        tempMood = entry.mood;
        titleInput.value = entry.title || '';
        textInput.value = entry.content;
        saveBtn.classList.add('hidden');
        updateBtn.classList.remove('hidden');
    } else {
        editingEntryId = null;
        dateInput.value = new Date().toISOString().split('T')[0];
        titleInput.value = '';
        textInput.value = '';
        saveBtn.classList.remove('hidden');
        updateBtn.classList.add('hidden');
    }
    
    moodDisplay.textContent = tempMood;
    document.getElementById('entry-modal').classList.remove('hidden');
    if (!entry) setTimeout(() => titleInput.focus(), 100);
}

function handleSaveEntry() {
    const dateInput = document.getElementById('entry-date-input').value;
    const title = document.getElementById('entry-title').value.trim();
    const text = document.getElementById('entry-text').value.trim();

    if (!text && !title) {
        showToast('Запись не может быть пустой', 'error');
        return;
    }

    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const finalDate = new Date(dateInput + 'T12:00:00').toISOString();

    if (editingEntryId) {
        const index = diaryEntries.findIndex(e => e.id === editingEntryId);
        if (index !== -1) {
            diaryEntries[index] = { ...diaryEntries[index], date: finalDate, title, content: text, mood: tempMood, wordCount, updatedAt: Date.now() };
        }
        showToast('Запись обновлена', 'success');
    } else {
        const newEntry = {
            id: Date.now().toString(), date: finalDate, title, content: text, mood: tempMood, wordCount, updatedAt: Date.now()
        };
        diaryEntries.unshift(newEntry);
        showToast('Запись сохранена', 'success');
    }

    closeEntryForm();
    saveAndRender();
}

function closeEntryForm() {
    document.getElementById('entry-modal').classList.add('hidden');
    editingEntryId = null;
}

// === 📊 ГРАФИК ===
function drawMoodChart() {
    const canvas = document.getElementById('mood-chart');
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

        // Сетка и эмодзи слева (от 0 до 9)
    ctx.font = '14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (let score = 0; score < maxScore; score++) {
        const y = yForScore(score);
        ctx.strokeStyle = grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - right, y); ctx.stroke();
        ctx.fillStyle = muted; 
        ctx.fillText(MOODS[score].emoji, 2, y);
    }

    // Подписи дней внизу
    ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = muted;
    const step = plotW < 260 ? 7 : 5;
    for (let day = 1; day <= daysInMonth; day += step) {
        ctx.fillText(String(day), xForDay(day), height - bottom + 8);
    }

    // Сбор данных
    const days = {};
    diaryEntries.forEach(entry => {
        const d = new Date(entry.date);
        if (isNaN(d.getTime()) || d.getFullYear() !== year || d.getMonth() !== month) return;
        const score = getMoodScore(entry.mood);
        if (score === null) return;
        const day = d.getDate();
        if (!days[day]) days[day] = { day: day, total: 0, count: 0 };
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

    // === Линии с умной логикой соединения ===
    ctx.strokeStyle = accent; 
    ctx.lineWidth = 2.5; 
    ctx.lineJoin = 'round'; 
    ctx.lineCap = 'round';

    // Рисуем линии между точками, если пропуск <= 2 дня
    for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1];
        const cur = data[i];
        const gap = cur.day - prev.day;

        if (gap <= 2) {
            // Пропуск 1-2 дня — соединяем линией
            ctx.beginPath();
            ctx.moveTo(xForDay(prev.day), yForScore(prev.score));
            ctx.lineTo(xForDay(cur.day), yForScore(cur.score));
            ctx.stroke();
        }
        // Если gap > 2 — линия не рисуется (обрыв)
    }

    // Точки
    ctx.fillStyle = accent;
    data.forEach(item => {
        ctx.beginPath();
        ctx.arc(xForDay(item.day), yForScore(item.score), 4, 0, Math.PI * 2);
        ctx.fill();
    });

    // Итоговые цифры
    const average = data.reduce((sum, item) => sum + item.score, 0) / data.length;
    const averageEmoji = MOODS[Math.round(average)]?.emoji || '😐';
    document.getElementById('chart-average').textContent = `Среднее: ${average.toFixed(1)} ${averageEmoji}`;
    document.getElementById('chart-summary').textContent = `Записей: ${totalEntries} · Дней: ${data.length}`;
}

// === 📋 ОТРИСОВКА СПИСКА (с учетом поиска) ===
function renderEntries() {
    const list = document.getElementById('entries-list');
    list.innerHTML = '';
    
    // Фильтрация по поисковому запросу
    const filtered = diaryEntries.filter(entry => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (entry.content && entry.content.toLowerCase().includes(query)) || 
               (entry.title && entry.title.toLowerCase().includes(query)) ||
               (entry.mood && entry.mood.includes(query));
    });

    const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (sorted.length === 0) {
        const msg = searchQuery ? 'Ничего не найдено' : 'Пока нет записей. Нажмите +, чтобы начать!';
        list.innerHTML = `<p style="text-align:center; color:var(--text-muted); margin-top:40px;">${msg}</p>`;
        return;
    }

    sorted.forEach(entry => {
        const card = document.createElement('div');
        card.className = 'entry-card';
        const dateObj = new Date(entry.date);
        const dateStr = dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        const timeStr = dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

        card.innerHTML = `
            <div class="entry-header">
                <span>${dateStr} в ${timeStr}</span>
                <span style="font-size:1.2em">${entry.mood}</span>
            </div>
            ${entry.title ? `<div class="entry-title">${escapeHtml(entry.title)}</div>` : ''}
            <div class="entry-text">${escapeHtml(entry.content)}</div>
            <div class="entry-stats">Слов: ${entry.wordCount || 0}</div>
            <div class="entry-actions-icons">
                <button class="icon-action edit-btn" title="Редактировать">✏️</button>
                <button class="icon-action delete-btn" title="Удалить">🗑️</button>
            </div>
        `;
        card.querySelector('.edit-btn').onclick = () => openEntryForm(entry);
        card.querySelector('.delete-btn').onclick = () => deleteEntry(entry.id);
        list.appendChild(card);
    });
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function saveAndRender() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(diaryEntries));
    renderEntries();
    drawMoodChart();
}

function loadEntries() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) diaryEntries = JSON.parse(stored);
    renderEntries();
}

async function deleteEntry(id) {
    if (await showConfirm('Удалить эту запись?')) {
        diaryEntries = diaryEntries.filter(e => e.id !== id);
        saveAndRender();
        showToast('Запись удалена', 'success');
    }
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
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

// === ⚡ СОБЫТИЯ ИНТЕРФЕЙСА (МЕНЮ, ПОИСК, СВАЙП) ===

// 1. Гамбургер меню
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

// Свайп влево для закрытия меню
let touchStartX = 0;
sidebar.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

sidebar.addEventListener('touchend', e => {
    const touchEndX = e.changedTouches[0].screenX;
    if (touchStartX - touchEndX > 50) {
        closeSidebar();
    }
}, { passive: true });

// Календарь открывается из меню
document.getElementById('sidebar-calendar-btn').onclick = openCalendarScreen;
document.getElementById('close-calendar-btn').onclick = closeCalendarScreen;
document.querySelector('#calendar-modal .modal-backdrop').onclick = closeCalendarScreen;

// Переключение месяца (для модалки)
document.getElementById('prev-month-btn').onclick = () => changeCalendarMonth(-1);
document.getElementById('next-month-btn').onclick = () => changeCalendarMonth(1);

// Переключение месяца (для ПК версии)
document.getElementById('prev-month-desktop').onclick = () => changeCalendarMonth(-1);
document.getElementById('next-month-desktop').onclick = () => changeCalendarMonth(1);

// Окно записей дня
document.getElementById('day-modal-close').onclick = closeDayModal;
document.querySelector('#day-modal .modal-backdrop').onclick = closeDayModal;

// Кнопка "Тема" - раскрывает подменю
document.getElementById('sidebar-theme-toggle').onclick = () => {
    document.getElementById('theme-options').classList.toggle('hidden');
};

// Темы
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
    btn.onclick = () => {
        applyTheme(btn.getAttribute('data-theme'));
    };
});

// Экспорт
document.getElementById('sidebar-export-btn').onclick = () => {
    if (diaryEntries.length === 0) return showToast('Нет записей', 'error');
    const blob = new Blob([JSON.stringify({ version: '2.0', entries: diaryEntries }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `diary_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click(); 
    showToast('Экспортировано', 'success');
    closeSidebar();
};

// Импорт
document.getElementById('sidebar-import-btn').onclick = () => {
    document.getElementById('import-file').click();
};

document.getElementById('import-file').onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
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

// 5. Модалки создания записи (без изменений)
document.getElementById('fab-add').onclick = openMoodModal;
document.getElementById('close-mood-modal').onclick = () => document.getElementById('mood-modal').classList.add('hidden');
document.querySelector('#mood-modal .modal-backdrop').onclick = () => document.getElementById('mood-modal').classList.add('hidden');

document.getElementById('selected-mood-display').onclick = () => { closeEntryForm(); openMoodModal(); };
document.getElementById('close-entry-modal').onclick = closeEntryForm;
document.getElementById('cancel-entry-btn').onclick = closeEntryForm;
document.querySelector('#entry-modal .modal-backdrop').onclick = closeEntryForm;

document.getElementById('save-entry-btn').onclick = handleSaveEntry;
document.getElementById('update-entry-btn').onclick = handleSaveEntry;

document.getElementById('confirm-ok').onclick = () => closeConfirm(true);
document.getElementById('confirm-cancel').onclick = () => closeConfirm(false);
document.querySelector('#confirm-modal .modal-backdrop').onclick = () => closeConfirm(false);


// === 📅 КАЛЕНДАРЬ ===

// Локальный ключ даты "2026-10-27" (без часового пояса)
function getDateKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Рисует сетку текущего месяца
function renderCalendar() {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    // Подпись месяца
    const monthDate = new Date(year, month, 1);
    const monthText = monthDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    
    // Обновляем оба заголовка (для модалки и для ПК)
    const labelModal = document.getElementById('calendar-month-label');
    const labelDesktop = document.getElementById('calendar-month-label-desktop');
    if (labelModal) labelModal.textContent = monthText;
    if (labelDesktop) labelDesktop.textContent = monthText;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1;

    const todayKey = getDateKey(new Date());

    // Функция для заполнения сетки
    function fillGrid(gridId) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        
        grid.innerHTML = '';

        // Пустые клетки до первого числа
        for (let i = 0; i < offset; i++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day empty';
            grid.appendChild(cell);
        }

        // Все дни месяца
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

            cell.onclick = () => showDayEntries(dateStr);
            grid.appendChild(cell);
        }
    }

    // Заполняем обе сетки
    fillGrid('calendar-grid');
    fillGrid('calendar-grid-desktop');
}

// Открывает календарь из бокового меню
function openCalendarScreen() {
    closeSidebar();
    
    // На ПК календарь уже виден, просто скроллим к нему
    if (window.innerWidth > 768) {
        document.querySelector('.calendar-section-desktop').scrollIntoView({ behavior: 'smooth' });
        return;
    }
    
    // На телефоне открываем модалку
    renderCalendar();
    document.getElementById('calendar-modal').classList.remove('hidden');
}

function closeCalendarScreen() {
    const modal = document.getElementById('calendar-modal');
    // Плавно скрываем (CSS transition сам всё сделает)
    modal.classList.add('hidden');
}

// Перелистывание месяца (-1 назад, +1 вперед)
function changeCalendarMonth(delta) {
    const grid = document.getElementById('calendar-grid');
    
    // 1. Добавляем анимацию в нужную сторону
    grid.classList.remove('slide-left', 'slide-right');
    // Форсируем перерисовку, чтобы анимация запустилась заново
    void grid.offsetWidth;
    grid.classList.add(delta > 0 ? 'slide-left' : 'slide-right');
    
    // 2. Меняем месяц и перерисовываем
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    renderCalendar();
    drawMoodChart();
}

// Показывает все записи выбранного дня
function showDayEntries(dateKey) {
    const entries = diaryEntries.filter(e => getDateKey(e.date) === dateKey);
    const body = document.getElementById('day-modal-body');

    const prettyDate = new Date(dateKey + 'T12:00:00').toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
    document.getElementById('day-modal-title').textContent = prettyDate;

    if (entries.length === 0) {
        body.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px 0;">В этот день записей нет</p>';
    } else {
        body.innerHTML = entries.map(entry => `
            <div class="day-entry-card">
                <div class="day-entry-header">
                    <span>${new Date(entry.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>${escapeHtml(entry.mood)}
                        <button class="icon-action day-edit-btn" title="Редактировать">✏️</button>
                    </span>
                </div>
                ${entry.title ? `<div class="day-title">${escapeHtml(entry.title)}</div>` : ''}
                <div class="day-entry-text">${escapeHtml(entry.content)}</div>
            </div>
        `).join('');

        // Вешаем редактирование на каждую карточку
        body.querySelectorAll('.day-edit-btn').forEach((btn, i) => {
            btn.onclick = () => {
                closeDayModal();
                openEntryForm(entries[i]);
            };
        });
    }

    document.getElementById('day-modal').classList.remove('hidden');
}

function closeDayModal() {
    document.getElementById('day-modal').classList.add('hidden');
}

// === 🔔 НАПОМИНАНИЕ О ЗАПИСЯХ ===

function checkReminder() {
    if (diaryEntries.length === 0) return; // Нет записей — не напоминаем

    // Находим самую свежую запись
    const lastEntry = diaryEntries.reduce((latest, entry) => {
        return new Date(entry.date) > new Date(latest.date) ? entry : latest;
    });

    const lastDate = new Date(lastEntry.date);
    const now = new Date();
    const daysDiff = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));

    // Если прошло >= 2 дней
    if (daysDiff >= 2) {
        const prettyDate = lastDate.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        document.getElementById('reminder-text').textContent = 
            `Последняя запись была ${prettyDate}. Есть что добавить?`;
        
        // Показываем с задержкой, чтобы не мешать загрузке
        setTimeout(() => {
            document.getElementById('reminder-modal').classList.remove('hidden');
        }, 500);
    }
}

function closeReminder() {
    document.getElementById('reminder-modal').classList.add('hidden');
}

function openNewEntryFromReminder() {
    closeReminder();
    openMoodModal();
}

// Напоминание
document.getElementById('reminder-later-btn').onclick = closeReminder;
document.getElementById('reminder-write-btn').onclick = openNewEntryFromReminder;
document.querySelector('#reminder-modal .modal-backdrop').onclick = closeReminder;

// === 🚀 ЗАПУСК ===
loadTheme();
updateDailyQuote();
loadEntries();
renderCalendar();
drawMoodChart();
checkReminder(); // Проверяем, нужно ли показать напоминание