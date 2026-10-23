let diaryEntries = [];
const STORAGE_KEY = 'my_web_diary_entries_v1';
const DRAFT_KEY = 'my_web_diary_draft_v1';
const THEME_KEY = 'my_web_diary_theme_v1';
let currentMood = '😐';
let searchQuery = '';
let currentCalendarDate = new Date(); // Текущая дата для календаря (месяц/год)

// Шкала настроений: один источник правды для всего приложения
const MOODS = [
    { emoji: '😡', score: 1 },
    { emoji: '😕', score: 2 },
    { emoji: '😐', score: 3 },
    { emoji: '🙂', score: 4 },
    { emoji: '😁', score: 5 }
];

// Переводим эмодзи в число. Если эмодзи неизвестный — null.
function getMoodScore(emoji) {
    const found = MOODS.find(m => m.emoji === emoji);
    return found ? found.score : null;
}

// === 🎨 ТЕМЫ ===

function loadTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
    applyTheme(savedTheme);
}

function applyTheme(themeName) {
    document.body.classList.remove('theme-dark', 'theme-pastel');
    if (themeName !== 'light') {
        document.body.classList.add('theme-' + themeName);
    }
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.getAttribute('data-theme') === themeName);
    });
    localStorage.setItem(THEME_KEY, themeName);
    drawMoodChart(); // перекрасить график под тему
}

// === 💾 АВТОСОХРАНЕНИЕ ===

function debounce(fn, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            fn(...args);
        }, delay);
    };
}

function saveDraft() {
    const text = document.getElementById('entry-text').value;
    const mood = currentMood;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, mood }));
    updateSaveStatus('Черновик сохранён 💾');
}

function loadDraft() {
    const savedDraft = localStorage.getItem(DRAFT_KEY);
    if (savedDraft) {
        try {
            const draft = JSON.parse(savedDraft);
            if (draft.text) {
                document.getElementById('entry-text').value = draft.text;
                updateWordCount();
            }
            if (draft.mood) {
                currentMood = draft.mood;
                document.querySelectorAll('.mood-btn').forEach(btn => {
                    btn.classList.toggle('selected', btn.getAttribute('data-mood') === currentMood);
                });
            }
        } catch (e) {
            console.error("Ошибка чтения черновика:", e);
        }
    }
}

function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
}

const debouncedSaveDraft = debounce(saveDraft, 1000);

// === 📊 ЭКСПОРТ/ИМПОРТ ===

// НОВОЕ 1: Экспорт всех записей в JSON файл
function exportData() {
    if (diaryEntries.length === 0) {
        alert('Нет записей для экспорта');
        return;
    }

    // Создаём объект с метаданными и записями
    const exportObject = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        entries: diaryEntries
    };

    // Превращаем в JSON строку с отступами для читаемости
    const jsonString = JSON.stringify(exportObject, null, 2);

    // Создаём "виртуальный" файл в памяти браузера
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    // Создаём временную ссылку для скачивания
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    // Формируем имя файла с датой: diary_backup_2026-10-22.json
    const dateStr = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `diary_backup_${dateStr}.json`;
    
    // Программно "кликаем" по ссылке, чтобы скачать файл
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url); // Освобождаем память

    updateSaveStatus('Экспортировано ✓');
}

// НОВОЕ 2: Импорт записей из JSON файла (с объединением, а не перезаписью!)
function importData(file) {
    const reader = new FileReader();

    reader.onload = function(event) {
        try {
            const importedData = JSON.parse(event.target.result);

            // Проверяем, что это наш формат
            if (!importedData.entries || !Array.isArray(importedData.entries)) {
                alert('Неверный формат файла');
                return;
            }

            // Считаем, сколько записей уже есть
            const existingIds = new Set(diaryEntries.map(entry => entry.id));
            let newCount = 0;

            // Добавляем только те записи, которых ещё нет (по ID)
            importedData.entries.forEach(importedEntry => {
                if (!existingIds.has(importedEntry.id)) {
                    diaryEntries.push(importedEntry);
                    newCount++;
                }
            });

            // Сортируем: новые записи сверху
            diaryEntries.sort((a, b) => b.updatedAt - a.updatedAt);

            saveEntries();
            renderEntries();

            alert(`Импортировано новых записей: ${newCount}\nПропущено дубликатов: ${importedData.entries.length - newCount}`);
            updateSaveStatus('Импортировано ✓');

        } catch (e) {
            alert('Ошибка чтения файла: ' + e.message);
            console.error(e);
        }
    };

    // Читаем файл как текст
    reader.readAsText(file);
}

// === 📝 ОСНОВНАЯ ЛОГИКА ===

function updateSaveStatus(text) {
    document.getElementById('save-status').textContent = text;
    setTimeout(() => {
        document.getElementById('save-status').textContent = 'Готов к работе';
    }, 2000);
}

function updateWordCount() {
    const text = document.getElementById('entry-text').value;
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    document.getElementById('word-count-value').textContent = words.length;
}

function deleteEntry(id) {
    if (confirm('Удалить эту запись безвозвратно?')) {
        diaryEntries = diaryEntries.filter(entry => entry.id !== id);
        saveEntries();
        renderEntries();
    }
}

function handleSearch(event) {
    searchQuery = event.target.value.toLowerCase();
    renderEntries();
}

function loadEntries() {
    const storedData = localStorage.getItem(STORAGE_KEY);
    if (storedData) {
        diaryEntries = JSON.parse(storedData);
    }
    renderEntries();
}

function saveEntries() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(diaryEntries));
    updateSaveStatus('Сохранено ✓');
    drawMoodChart(); // сработает при создании, удалении и импорте
}

// ОБНОВЛЕНО: Теперь сохраняем wordCount в записи
function createNewEntry() {
    const textInput = document.getElementById('entry-text');
    const text = textInput.value.trim();

    if (!text) {
        alert('Пожалуйста, напиши хоть что-нибудь!');
        return;
    }

    // Считаем слова
    const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;

    const newEntry = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        content: text,
        mood: currentMood,
        wordCount: wordCount,  // НОВОЕ: сохраняем количество слов
        updatedAt: Date.now()
    };

    currentCalendarDate = new Date(); // переключаемся на месяц новой записи
    diaryEntries.unshift(newEntry);
    saveEntries();
    renderEntries();
    renderCalendar();

    textInput.value = '';
    clearDraft();
    updateWordCount();
    
    currentMood = '😐';
    document.querySelectorAll('.mood-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.getAttribute('data-mood') === '😐');
    });
}

// ОБНОВЛЕНО: Показываем счётчик слов в карточке
function renderEntries() {
    const listContainer = document.getElementById('entries-list');
    listContainer.innerHTML = '';

    const filteredEntries = diaryEntries.filter(entry => {
        if (!searchQuery) return true;
        return entry.content.toLowerCase().includes(searchQuery) || 
               entry.mood.includes(searchQuery);
    });

    if (filteredEntries.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted); margin-top:20px;">Ничего не найдено</p>';
        return;
    }

    filteredEntries.forEach(entry => {
        const card = document.createElement('div');
        card.className = 'entry-card';

        const dateObj = new Date(entry.date);
        const formattedDate = dateObj.toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        // Для старых записей без wordCount — показываем 0
        const wordCount = entry.wordCount || 0;

        card.innerHTML = `
            <div class="entry-header">
                <span>${formattedDate}</span>
                <div>
                    <span class="entry-mood">${escapeHtml(entry.mood)}</span>
                    <button class="delete-btn" title="Удалить запись">🗑️</button>
                </div>
            </div>
            <div class="entry-text">${escapeHtml(entry.content)}</div>
            <div class="entry-stats">Слов: ${wordCount}</div>
        `;


        card.querySelector('.delete-btn').addEventListener('click', () => deleteEntry(entry.id));
        listContainer.appendChild(card);
    });
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// === 📅 КАЛЕНДАРЬ НАСТРОЕНИЙ ===

function renderCalendar() {
    const calendarGrid = document.getElementById('calendar-grid');
    calendarGrid.innerHTML = ''; // Очищаем сетку

    // Получаем год и месяц из currentCalendarDate
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth(); // 0 = январь, 11 = декабрь

    // Обновляем заголовок календаря
    const monthNames = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    document.getElementById('current-month').textContent = `${monthNames[month]} ${year}`;

    // Определяем, сколько дней в месяце
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Определяем, какой день недели был 1-го числа месяца (0 = воскресенье, 1 = понедельник...)
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    
    // Преобразуем: если 0 (воскресенье), делаем 7, чтобы понедельник был первым
    const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    // Получаем сегодняшнюю дату для выделения
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
    const todayDate = today.getDate();

    // Создаём пустые ячейки для дней перед началом месяца
    for (let i = 0; i < startOffset; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day empty';
        calendarGrid.appendChild(emptyDay);
    }

    // Создаём ячейки для каждого дня месяца
    for (let day = 1; day <= daysInMonth; day++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day';

        // Проверяем, есть ли запись на этот день
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const entryForDay = diaryEntries.find(entry => getDateKey(entry.date) === dateStr);

        if (entryForDay) {
            // Если есть запись — показываем эмодзи настроения
            dayCell.textContent = entryForDay.mood;
            dayCell.title = `${day} ${monthNames[month]}: ${entryForDay.content.substring(0, 50)}...`;
        } else {
            // Если нет записи — показываем номер дня
            dayCell.textContent = day;
            dayCell.style.fontSize = '0.9em';
            dayCell.style.color = 'var(--text-muted)';
        }

        // Выделяем сегодняшний день
        if (isCurrentMonth && day === todayDate) {
            dayCell.classList.add('today');
        }

        calendarGrid.appendChild(dayCell);
    }
}

// Приводим любую дату к локальному ключу вида "2026-10-23"
function getDateKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function changeMonth(delta) {
    // delta = -1 (предыдущий месяц) или +1 (следующий месяц)
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    renderCalendar();
    drawMoodChart();
}

function getMonthMoodData(year, month) {
    const days = {};

    diaryEntries.forEach(entry => {
        const d = new Date(entry.date);
        if (isNaN(d.getTime())) return;
        if (d.getFullYear() !== year || d.getMonth() !== month) return;

        const score = getMoodScore(entry.mood);
        if (score === null) return;

        const day = d.getDate();
        if (!days[day]) days[day] = { day: day, total: 0, count: 0 };

        days[day].total += score;
        days[day].count += 1;
    });

    return Object.values(days)
        .map(item => ({
            day: item.day,
            score: item.total / item.count,
            count: item.count
        }))
        .sort((a, b) => a.day - b.day);
}

//Рисуем график
function drawMoodChart() {
    const canvas = document.getElementById('mood-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Узнаём реальную ширину блока в CSS-пикселях
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    const width = rect.width;
    const height = 180;

    // Чёткость на телефонах: 1 CSS-пиксель там = 2-3 физических
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Присвоение canvas.width автоматически очищает холст — перерисовка с нуля

    // Берём цвета из текущей темы (не хардкодим!)
    const styles = getComputedStyle(document.body);
    const muted  = styles.getPropertyValue('--text-muted').trim() || '#888';
    const grid   = styles.getPropertyValue('--border-color').trim() || '#ddd';
    const accent = styles.getPropertyValue('--accent-color').trim() || '#4CAF50';

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Поля графика (место для подписей)
    const left = 30, right = 12, top = 16, bottom = 26;
    const plotW = width - left - right;
    const plotH = height - top - bottom;

    // Переводим день и оценку в координаты пикселей
    const xForDay = day => left + ((day - 1) / (daysInMonth - 1)) * plotW;
    const yForScore = score => top + ((5 - score) / 4) * plotH;

    // 1. Горизонтальная сетка + эмодзи-шкала слева
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (let score = 1; score <= 5; score++) {
        const y = yForScore(score);
        ctx.strokeStyle = grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(width - right, y);
        ctx.stroke();

        ctx.fillStyle = muted;
        ctx.fillText(MOODS[score - 1].emoji, 2, y);
    }

    // 2. Подписи дней. На узком экране — каждые 7 дней, чтобы не сливалось
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = muted;

    const step = plotW < 260 ? 7 : 5;
    for (let day = 1; day <= daysInMonth; day += step) {
        ctx.fillText(String(day), xForDay(day), height - bottom + 8);
    }

    // 3. Данные
    const data = getMonthMoodData(year, month);
    const totalEntries = data.reduce((sum, item) => sum + item.count, 0);

    if (data.length === 0) {
        ctx.fillStyle = muted;
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('В этом месяце пока нет записей', width / 2, top + plotH / 2);

        document.getElementById('chart-average').textContent = '—';
        document.getElementById('chart-summary').textContent = 'Записей за месяц: 0';
        return;
    }

    // 4. Линии — ТОЛЬКО между соседними днями (разрыв, если записей не было)
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1];
        const cur = data[i];
        if (cur.day !== prev.day + 1) continue;

        ctx.beginPath();
        ctx.moveTo(xForDay(prev.day), yForScore(prev.score));
        ctx.lineTo(xForDay(cur.day), yForScore(cur.score));
        ctx.stroke();
    }

    // 5. Точки
    ctx.fillStyle = accent;
    data.forEach(item => {
        ctx.beginPath();
        ctx.arc(xForDay(item.day), yForScore(item.score), 3.5, 0, Math.PI * 2);
        ctx.fill();
    });

    // 6. Цифры под графиком (обычный HTML, не Canvas)
    const average = data.reduce((sum, item) => sum + item.score, 0) / data.length;
    const averageEmoji = MOODS[Math.round(average) - 1].emoji;

    document.getElementById('chart-average').textContent =
        `Среднее: ${average.toFixed(1)} ${averageEmoji}`;

    document.getElementById('chart-summary').textContent =
        `Записей: ${totalEntries} · Дней с записями: ${data.length}`;
}

// === СОБЫТИЯ ===

document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        currentMood = btn.getAttribute('data-mood');
        debouncedSaveDraft();
    });
});

document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        applyTheme(btn.getAttribute('data-theme'));
    });
});

document.getElementById('save-btn').addEventListener('click', createNewEntry);

document.getElementById('entry-text').addEventListener('input', () => {
    updateWordCount();
    debouncedSaveDraft();
});

document.getElementById('search-input').addEventListener('input', handleSearch);

// НОВОЕ: Кнопки экспорта/импорта
document.getElementById('export-btn').addEventListener('click', exportData);

document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        importData(file);
        // Сбрасываем input, чтобы можно было импортировать тот же файл снова
        event.target.value = '';
    }
});

document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
document.getElementById('next-month').addEventListener('click', () => changeMonth(1));

// Если изменилась ширина экрана (поворот телефона, resize окна) — перерисовываем
const chartObserver = new ResizeObserver(() => drawMoodChart());
chartObserver.observe(document.getElementById('mood-chart'));

// === ЗАПУСК ===
loadTheme();
loadEntries();
loadDraft();
renderCalendar(); // НОВОЕ: рисуем календарь при старте
drawMoodChart();