
// Генератор 2 лет тестовых записей для Daytone
(async function generateTestData() {
    'use strict';

    // === КОНФИГУРАЦИЯ ===
    const DAYS_BACK = 730; // 2 года
    const ENTRY_PROBABILITY = 0.85; // 85% дней с записями
    const MAX_ENTRIES_PER_DAY = 3;
    const FAVORITE_PROBABILITY = 0.15; // 15% избранных
    const TAG_PROBABILITY = 0.4; // 40% записей с тегами
    const TITLE_PROBABILITY = 0.6; // 60% записей с заголовком

    // === СЛОВАРИ ===
    const MOODS = ['😭', '😫', '☹️', '😕', '😐', '😏', '😊', '😄', '😍', '🥰'];
    
    const TRIGGER_GROUPS = {
        emotions: ['😊 счастье', '😌 спокойствие', '🙏 благодарность', '💪 уверенность', '😴 усталость', '🥱 скука', '😬 волнение', '😢 грусть', '😕 неуверенность', '😰 тревога', '😫 стресс', '😠 злость', '😞 отчаяние'],
        sleep: ['😴 хороший', '💤 средний', '😵 плохой'],
        health: ['🏃 спорт', '🚶 ходьба', '🥗 здоровое питание', '🧘 медитация'],
        hobby: ['🎬 кино', '📚 чтение', '🎮 игры', '🏖️ отдых', '🎨 искусство'],
        food: ['🥗 здоровая', '🍔 фастфуд', '🍲 домашняя', '🍩 сладости', '💧 вода'],
        productivity: ['⏰ начинать рано', '📝 составить список', '🎯 сконцентрироваться', '🌀 рассеянность']
    };
    const ALL_TRIGGERS = Object.values(TRIGGER_GROUPS).flat();

    const TAGS = ['работа', 'семья', 'друзья', 'здоровье', 'спорт', 'учёба', 'хобби', 'путешествия', 'еда', 'фильмы', 'книги', 'музыка', 'природа', 'творчество', 'медитация', 'планы', 'итоги', 'мысли', 'благодарность', 'цели'];

    const BACKGROUNDS = ['default', 'paper', 'night', 'forest', 'sunset', 'lavender', 'wood', 'stone', 'landscape', 'perry'];

    const TITLES = [
        'Сегодня был особенный день', 'Обычный день', 'Важные мысли', 'Что-то новое',
        'Встреча с друзьями', 'Рабочие будни', 'Выходной', 'Планы на неделю',
        'Интересное наблюдение', 'Неожиданность', 'Размышления', 'Итоги дня',
        'Утренняя рутина', 'Вечерние мысли', 'Семейный день', 'Время для себя'
    ];

    const TEXTS = [
        'Сегодня был насыщенный день. Утром проснулся рано, сделал зарядку и позавтракал. На работе было много задач, но справился со всем. Вечером встретился с друзьями, давно не виделись. Чувствую себя отлично!',
        'День прошёл спокойно. Читал книгу, гулял в парке. Погода была хорошая, солнечно и тепло. Вечером смотрел фильм и рано лёг спать.',
        'Сложный день на работе. Много встреч, дедлайны горят. Но в целом справился. Нужно больше отдыхать и не перегружаться.',
        'Отличный день! Сходил на тренировку, чувствую прилив энергии. Потом пообедал в новом кафе — очень вкусно. Вечером занимался хобби.',
        'Сегодня весь день провёл дома. Работал удалённо, готовил обед. Вечером смотрел сериал. Тихий, уютный день.',
        'Встретился с семьёй. Долго не виделись, было приятно пообщаться. Готовили вместе ужин, играли в настольные игры.',
        'Продуктивный день. Составил список задач и выполнил все пункты. Чувствую удовлетворение от проделанной работы.',
        'Немного грустный день. Не выспался, на работе были проблемы. Но вечер провёл с книгой и стало легче.',
        'Идеальный выходной! Утром долго спал, потом гулял в парке. Обедал в кафе, вечером смотрел фильм. Полная перезагрузка.',
        'Рабочий день. Много звонков, совещаний. Устал к вечеру, но задачи выполнены. Завтра нужно отдохнуть.'
    ];

    // === ГЕНЕРАЦИЯ HTML С ФОРМАТИРОВАНИЕМ ===
    function generateRichText() {
        const templates = [
            // Простой текст
            () => `<p>${randomElement(TEXTS)}</p>`,
            
            // С заголовком
            () => `<h2>${randomElement(['Важное', 'Заметка', 'Мысль', 'Идея'])}</h2><p>${randomElement(TEXTS)}</p>`,
            
            // Со списком
            () => `<p>${randomElement(TEXTS)}</p><div class="custom-list-item" data-marker="●"><div>\u200B${randomElement(['Сделать зарядку', 'Позавтракать', 'Позвонить маме', 'Прочитать книгу'])}</div></div><div class="custom-list-item" data-marker="●"><div>\u200B${randomElement(['Сходить в магазин', 'Приготовить ужин', 'Посмотреть фильм', 'Пораньше лечь'])}</div></div>`,
            
            // С чек-листом
            () => `<p>Планы на сегодня:</p><div class="custom-list-item checkbox-item"><span class="custom-checkbox-marker"></span><div>\u200B${randomElement(['Утренняя пробежка', 'Медитация', 'Завтрак', 'Работа'])}</div></div><div class="custom-list-item checkbox-item checked"><span class="custom-checkbox-marker checked"></span><div>\u200B${randomElement(['Прочитать 30 минут', 'Позвонить другу', 'Готовка', 'Уборка'])}</div></div>`,
            
            // С таблицей
            () => `<p>${randomElement(TEXTS)}</p><div class="table-wrapper"><table><tbody><tr><th>Время</th><th>Активность</th></tr><tr><td>09:00</td><td>${randomElement(['Зарядка', 'Завтрак', 'Работа', 'Встреча'])}</td></tr><tr><td>14:00</td><td>${randomElement(['Обед', 'Прогулка', 'Совещание', 'Чтение'])}</td></tr></tbody></table></div>`,
            
            // С разными шрифтами
            () => `<p style="font-family: 'Dancing Script', cursive; font-size: 1.2em;">Сегодня был ${randomElement(['прекрасный', 'обычный', 'сложный', 'радостный'])} день</p><p>${randomElement(TEXTS)}</p>`,
            
            // С тегами в тексте
            () => `<p>${randomElement(TEXTS)} #${randomElement(TAGS)} #${randomElement(TAGS)}</p>`,
            
            // Длинная запись с несколькими абзацами
            () => `<p>${randomElement(TEXTS)}</p><p>${randomElement(TEXTS)}</p><p>${randomElement(TEXTS)}</p>`
        ];
        
        return randomElement(templates)();
    }

    function randomElement(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function weightedMood() {
        //偏向 положительные настроения (распределение с пиком на 6-8)
        const weights = [2, 3, 5, 8, 10, 12, 15, 12, 8, 5];
        const total = weights.reduce((a, b) => a + b, 0);
        let rand = Math.random() * total;
        for (let i = 0; i < weights.length; i++) {
            rand -= weights[i];
            if (rand <= 0) return MOODS[i];
        }
        return MOODS[5];
    }

    // === ГЕНЕРАЦИЯ ОДНОЙ ЗАПИСИ ===
    function generateEntry(date) {
        const hasTitle = Math.random() < TITLE_PROBABILITY;
        const title = hasTitle ? randomElement(TITLES) : '';
        const content = generateRichText();
        const mood = weightedMood();
        
        // Триггеры (0-4 штуки)
        const triggerCount = randomInt(0, 4);
        const triggers = [];
        for (let i = 0; i < triggerCount; i++) {
            const trig = randomElement(ALL_TRIGGERS);
            if (!triggers.includes(trig)) triggers.push(trig);
        }

        // Теги (0-3 штуки)
        const tags = [];
        if (Math.random() < TAG_PROBABILITY) {
            const tagCount = randomInt(1, 3);
            for (let i = 0; i < tagCount; i++) {
                const tag = randomElement(TAGS);
                if (!tags.includes(tag)) tags.push(tag);
            }
        }

        const wordCount = (content.replace(/<[^>]*>/g, '').split(/\s+/).filter(w => w.length > 0)).length;
        const isFavorite = Math.random() < FAVORITE_PROBABILITY;
        const background = randomElement(BACKGROUNDS);

        return {
            title,
            content,
            mood,
            triggers,
            tags,
            wordCount,
            favorite: isFavorite,
            background,
            fontSize: '',
            lineHeight: '',
            fontFamily: '',
            fontWeight: '',
            fontStyle: '',
            isQuickEntry: false
        };
    }

    // === ГЛАВНАЯ ФУНКЦИЯ ===
    async function init() {
        console.log('🚀 Начинаем генерацию тестовых данных...');
        
        // Ждём инициализацию БД
        if (typeof initDB === 'function') {
            try {
                await initDB();
                console.log('✅ IndexedDB инициализирована');
            } catch (err) {
                console.error('❌ Ошибка инициализации БД:', err);
                return;
            }
        }

        const entries = [];
        const today = new Date();
        let totalEntries = 0;

        console.log(`📅 Генерируем записи за последние ${DAYS_BACK} дней...`);

        for (let daysAgo = DAYS_BACK; daysAgo >= 0; daysAgo--) {
            if (Math.random() > ENTRY_PROBABILITY) continue; // пропускаем день

            const date = new Date(today);
            date.setDate(date.getDate() - daysAgo);
            date.setHours(12, 0, 0, 0); // полдень

            const entriesCount = randomInt(1, MAX_ENTRIES_PER_DAY);
            
            for (let i = 0; i < entriesCount; i++) {
                const entryDate = new Date(date);
                entryDate.setHours(entryDate.getHours() + i * 4); // +4 часа между записями

                const base = generateEntry(entryDate);
                const now = entryDate.getTime();
                
                const entry = {
                    ...base,
                    id: now.toString() + i,
                    date: entryDate.toISOString(),
                    createdAt: now,
                    updatedAt: now,
                    editedAt: Math.random() < 0.2 ? now + 3600000 : null // 20% отредактированных
                };

                entries.push(entry);
                totalEntries++;
            }

            if (totalEntries % 100 === 0) {
                console.log(`📝 Сгенерировано ${totalEntries} записей...`);
            }
        }

        console.log(`✨ Сгенерировано всего ${totalEntries} записей`);
        console.log('💾 Сохраняем в IndexedDB...');

        // Сохраняем в БД
        if (typeof dbPut === 'function') {
            for (const entry of entries) {
                try {
                    await dbPut(entry);
                } catch (err) {
                    console.error('Ошибка сохранения записи:', entry.id, err);
                }
            }
            console.log('✅ Все записи сохранены в БД');
        }

        // Обновляем глобальный массив
        if (typeof diaryEntries !== 'undefined') {
            window.diaryEntries = entries;
            console.log('✅ diaryEntries обновлён');
        }

        // Перерисовываем интерфейс
        if (typeof renderEntries === 'function') renderEntries();
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof drawMoodChart === 'function') drawMoodChart();
        if (typeof updateProgressCard === 'function') updateProgressCard();

        console.log('🎉 Готово! Перезагрузите страницу для применения изменений.');
        
        // Статистика
        console.log('\n📊 Статистика:');
        console.log(`   Всего записей: ${totalEntries}`);
        console.log(`   С тегами: ${entries.filter(e => e.tags.length > 0).length}`);
        console.log(`   С триггерами: ${entries.filter(e => e.triggers.length > 0).length}`);
        console.log(`   Избранных: ${entries.filter(e => e.favorite).length}`);
        console.log(`   С заголовками: ${entries.filter(e => e.title).length}`);
    }

    await init();
})();