// === 🌍 i18n: ключевая локализация. Источник правды — словари, а не текст в DOM ===
(function () {
    'use strict';

    const STORAGE_KEY = 'ds_lang_v1';           // тот же ключ, что у старого движка
    const LOCALES = { ru: 'ru-RU', en: 'en-GB', fr: 'fr-FR' };
    const FALLBACK = 'ru';

    const DICT = {
        ru: {
            'app.brand': 'Daytone',
            'app.entries': 'Мои записи',
            'common.save': 'Сохранить', 'common.cancel': 'Отмена', 'common.delete': 'Удалить',
            'common.close': 'Закрыть', 'common.back': 'Назад', 'common.yes': 'Да',
            'common.edit': 'Редактировать', 'common.search': 'Поиск',
            'common.clearFilter': 'Закрыть фильтр', 'common.showAll': 'Показать все',
            'common.today': 'Сегодня', 'common.yesterday': 'Вчера', 'common.off': 'Выключены',
            'nav.menu': 'Меню', 'nav.entries': 'Записи', 'nav.add': 'Новая запись',
            'nav.stats': 'Статистика', 'nav.calendar': 'Календарь',
            'sidebar.title': 'Меню',
            'sidebar.sort': 'Сортировать записи по...',
            'sidebar.sortCreated': '📅 Дате создания', 'sidebar.sortUpdated': '🕒 Дате изменения',
            'sidebar.theme': 'Тема', 'sidebar.themesSoon': 'Следующие темы скоро...',
            'theme.light': '☀️ Светлая', 'theme.dark': '🌙 Тёмная',
            'theme.pastel': '🌸 Пастельная', 'theme.blue': '🌊 Мягкая голубая',
            'sidebar.mood': 'Настроение', 'sidebar.favorites': 'Избранные', 'sidebar.tags': 'Теги',
            'sidebar.exportImport': 'Экспорт / Импорт',
            'sidebar.exportJson': '📤 Экспорт в JSON', 'sidebar.importJson': '📥 Импорт из JSON',
            'sidebar.exportMd': '📝 Экспорт в Markdown',
            'sidebar.pin': 'PIN-код', 'sidebar.pinCreate': '🔒 Создать PIN-код',
            'sidebar.pinReset': '🔓 Сбросить PIN-код', 'sidebar.settings': 'Настройки',
            'search.placeholder': 'Поиск по записям...',
            'sort.toastCreated': 'Сортировка: по дате создания',
            'sort.toastUpdated': 'Сортировка: по дате изменения',
            'sort.changed': 'Сортировка изменена', 'sort.title': 'Сортировка записей',
            'favorites.title': 'Избранные',
            'settings.title': 'Настройки', 'settings.notifications': 'Уведомления',
            'settings.triggers': 'Триггеры',
            'settings.triggersSub': 'Спрашивать, что повлияло на настроение',
            'settings.language': 'Язык',
            'settings.footnote': 'Настройки хранятся только на этом устройстве',
            'settings.everyday': 'каждый день',
            'language.title': 'Язык', 'language.changed': 'Язык изменён',
            'language.footnote': 'Язык меняет интерфейс приложения. Текст ваших записей остаётся нетронутым.',
            'day.mon': 'Пн', 'day.tue': 'Вт', 'day.wed': 'Ср', 'day.thu': 'Чт',
            'day.fri': 'Пт', 'day.sat': 'Сб', 'day.sun': 'Вс',
            'date.todayShort': 'сегодня', 'date.yesterdayShort': 'вчера',
            'entries.edited': '· изм. {date}',
            'entries.noText': '(Запись без текста)',
            'entries.empty': 'Пока нет записей. Нажмите +, чтобы начать!',
            'entries.emptyDay': 'В этот день записей нет',
            'entries.emptyTag': 'Нет записей с тегом {tag}',
            'entries.emptyMood': 'Нет записей с настроением {mood}',
            'entries.emptyTrigger': 'Нет записей с триггером {trigger}',
            'entries.emptySearch': 'Ничего не найдено',
            'filter.tag': 'Тег:', 'filter.mood': 'Настроение:', 'filter.trigger': 'Триггер:',
            'toast.entriesForDate': 'Записи за {date}',
            'toast.showingTag': 'Показаны записи: {tag}',
            'toast.showingTrigger': 'Показаны записи с триггером: {trigger}',
            'toast.moodFilter': 'Записи с настроением {mood}',
            'toast.deleted': 'Удалено: {n}',
            'toast.deleteFailed': 'Не удалось удалить записи. Попробуйте ещё раз.',
            'toast.saveFailed': 'Ошибка сохранения данных — попробуйте ещё раз',
            'toast.migrated': 'Данные перенесены в новое хранилище',
            'confirm.deleteMany': 'Удалить {count}?',
            'delete.button': 'Удалить ({n})',
            'progress.streak': 'Вы пишете {count} подряд',
            'widgets.statsNote': 'за 30 дней: {avg} · 3 сторис',
            'widgets.statsEmpty': '3 сторис о настроении',
            'widgets.memEmpty': 'ностальгии пока нет',
            'unit.entry.one': '{n} запись', 'unit.entry.few': '{n} записи',
            'unit.entry.many': '{n} записей', 'unit.entry.other': '{n} записи',
            'unit.day.one': '{n} день', 'unit.day.few': '{n} дня',
            'unit.day.many': '{n} дней', 'unit.day.other': '{n} дня',
            'unit.memory.one': '{n} воспоминание', 'unit.memory.few': '{n} воспоминания',
            'unit.memory.many': '{n} воспоминаний', 'unit.memory.other': '{n} воспоминания',
            'editor.titlePlaceholder': 'Оглавление (необязательно)',
            'editor.textPlaceholder': 'О чем вы хотите написать?',
            'editor.cancelBack': 'Отмена (назад)',
            'editor.favorite': 'В избранное', 'editor.delete': 'Удалить запись',
            'editor.prev': 'Предыдущая запись', 'editor.next': 'Следующая запись',
            'toolbar.templates': 'Шаблоны', 'toolbar.bg': 'Фон записи', 'toolbar.emoji': 'Эмодзи',
            'toolbar.tags': 'Теги', 'toolbar.triggers': 'Что повлияло на настроение?',
            'toolbar.text': 'Текст', 'toolbar.list': 'Список', 'toolbar.table': 'Таблица', 'toolbar.font': 'Шрифт',
            'toolbar.align': 'Выравнивание по горизонтали',
            'toolbar.lineDown': 'Уменьшить межстрочный интервал', 'toolbar.lineUp': 'Увеличить межстрочный интервал',
            'toolbar.h1': 'Очень крупный (H1)', 'toolbar.h2': 'Крупный (H2)', 'toolbar.h3': 'Средний (H3)',
            'toolbar.h4': 'Стандартный (H4)', 'toolbar.h5': 'Мелкий (H5)',
            'toolbar.listCircle': 'Маркированный список', 'toolbar.listStar': 'Список со звездочками',
            'toolbar.listHeart': 'Список с сердечками', 'toolbar.listThumb': 'Список с пальцем',
            'toolbar.listNumber': 'Нумерованный список', 'toolbar.listCheck': 'Чек-лист', 'toolbar.listRemove': 'Убрать список',
            'toolbar.tableRemove': '🗑️ Удалить',
            'tpl.title': '📝 Выберите шаблон',
            'tpl.gratitude': '🙏 Благодарности дня', 'tpl.gratitudeDesc': 'За что я благодарен сегодня?',
            'tpl.summary': '📊 Итоги дня', 'tpl.summaryDesc': 'Что получилось? Что улучшить?',
            'tpl.ideas': '💡 Идеи на будущее', 'tpl.ideasDesc': 'Мысли, планы, мечты',
            'tpl.empty': '📄 Пустой шаблон', 'tpl.emptyDesc': 'Начать с чистого листа',
            'tpl.gratitudeBody': '1. Сегодня я благодарен за...\n2. Мне помогло...\n3. Я рад, что...',
            'tpl.summaryBody': 'Что получилось сегодня:\n- \n\nЧто можно улучшить:\n- \n\nВыводы:',
            'tpl.ideasBody': 'Идеи и мысли:\n- \n\nПланы на будущее:\n- \n\nМечты:',
            'bg.default': 'Стандарт', 'bg.paper': 'Бумага', 'bg.night': 'Ночь', 'bg.forest': 'Лес',
            'bg.sunset': 'Закат', 'bg.lavender': 'Лаванда', 'bg.wood': 'Дерево', 'bg.stone': 'Камень',
            'bg.landscape': 'Пейзаж', 'bg.perry': 'Утканос',
            'emojiPack.standard': 'Стандартные', 'emojiPack.custom_halloween': 'Хэллоуин (Тест)',
            'pin.enter': '🔐 Введите PIN-код', 'pin.setup': '🔐 Установите PIN-код', 'pin.confirm': '🔐 Подтвердите PIN',
            'pin.setupSub': 'Придумайте 4-значный код', 'pin.confirmSub': 'Повторите код ещё раз',
            'pin.wrong': 'Неверный PIN-код', 'pin.mismatch': 'Коды не совпадают. Попробуйте снова',
            'pin.set': 'PIN-код установлен', 'pin.reset': 'PIN-код сброшен',
            'pin.resetConfirm': 'Сбросить PIN-код? Дневник останется без защиты.', 'pin.skip': 'Пропустить',
            'mood.question': 'Как прошел ваш день?',
            'confirm.default': 'Вы уверены?', 'confirm.deleteEntry': 'Удалить эту запись?',
            'toast.entrySaved': 'Запись сохранена', 'toast.entryUpdated': 'Запись обновлена',
            'toast.entryDeleted': 'Запись удалена', 'toast.emptyDeleted': 'Пустая запись удалена',
            'toast.saveEntryFailed': 'Не удалось сохранить запись', 'toast.saveFailedShort': 'Не удалось сохранить',
            'toast.moodSaved': 'Настроение сохранено',
            'toast.selectTextFirst': 'Сначала выделите текст, который хотите покрасить',
            'toast.listInTable': 'Списки нельзя применять внутри таблицы',
            'toast.tableRemoved': 'Таблица удалена', 'toast.cursorNotInTable': 'Курсор не в таблице',
            'stats.title': 'Статистика', 'stats.normal': 'Обычная', 'stats.deep': 'Глубокая',
            'stats.empty1': 'Пока нет записей.', 'stats.empty2': 'Начните вести дневник!',
            'stats.bestWeek': 'Лучшее за неделю', 'stats.worstWeek': 'Худшее за неделю',
            'stats.topMood': 'Самое частое настроение',
            'stats.avg7': 'Среднее за 7 дней', 'stats.avg30': 'Среднее за 30 дней',
            'stats.avgAll': 'Среднее за всё время',
            'stats.daysWithEntries': 'Дней с записями', 'stats.totalEntries': 'Всего записей',
            'stats.firstEntry': 'Первая запись',
            'stats.daysValue': '{a} из {b} ({p}%)',
            'unit.time.one': '{n} раз', 'unit.time.few': '{n} раза',
            'unit.time.many': '{n} раз', 'unit.time.other': '{n} раза',
            'chart.title': 'Настроение', 'chart.frequency': 'Частота эмоций',
            'chart.distribution': 'Распределение', 'chart.line': 'Линия', 'chart.bars': 'Гистограмма',
            'chart.average': 'Среднее: {v}',
            'chart.summary': 'Записей: {entries} · Дней: {days}',
            'chart.summaryEmpty': 'Записей за месяц: 0',
            'chart.emptyMonth': 'В этом месяце пока нет записей',
            'chart.barSummary': '{period} · Всего записей: {n}',
            'period.all': 'За всё время', 'period.month': 'За месяц', 'period.week': 'За неделю',
            'period.monthCurrent': 'За текущий месяц', 'period.choose': 'Выбрать период',
            'aria.statsMode': 'Режим статистики', 'aria.chartMode': 'Тип графика',
            'aria.moodChart': 'График настроений', 'aria.barChart': 'Гистограмма настроений'
        },
        en: {
            'app.brand': 'Daytone',
            'app.entries': 'My entries',
            'common.save': 'Save', 'common.cancel': 'Cancel', 'common.delete': 'Delete',
            'common.close': 'Close', 'common.back': 'Back', 'common.yes': 'Yes',
            'common.edit': 'Edit', 'common.search': 'Search',
            'common.clearFilter': 'Clear filter', 'common.showAll': 'Show all',
            'common.today': 'Today', 'common.yesterday': 'Yesterday', 'common.off': 'Off',
            'nav.menu': 'Menu', 'nav.entries': 'Entries', 'nav.add': 'New entry',
            'nav.stats': 'Statistics', 'nav.calendar': 'Calendar',
            'sidebar.title': 'Menu',
            'sidebar.sort': 'Sort entries by...',
            'sidebar.sortCreated': '📅 Date created', 'sidebar.sortUpdated': '🕒 Date modified',
            'sidebar.theme': 'Theme', 'sidebar.themesSoon': 'More themes coming soon...',
            'theme.light': '☀️ Light', 'theme.dark': '🌙 Dark',
            'theme.pastel': '🌸 Pastel', 'theme.blue': '🌊 Soft blue',
            'sidebar.mood': 'Mood', 'sidebar.favorites': 'Favorites', 'sidebar.tags': 'Tags',
            'sidebar.exportImport': 'Export / Import',
            'sidebar.exportJson': '📤 Export to JSON', 'sidebar.importJson': '📥 Import from JSON',
            'sidebar.exportMd': '📝 Export to Markdown',
            'sidebar.pin': 'PIN code', 'sidebar.pinCreate': '🔒 Create PIN code',
            'sidebar.pinReset': '🔓 Reset PIN code', 'sidebar.settings': 'Settings',
            'search.placeholder': 'Search entries...',
            'sort.toastCreated': 'Sorted by date created',
            'sort.toastUpdated': 'Sorted by date modified',
            'sort.changed': 'Sort order changed', 'sort.title': 'Sort entries',
            'favorites.title': 'Favorites',
            'settings.title': 'Settings', 'settings.notifications': 'Notifications',
            'settings.triggers': 'Triggers',
            'settings.triggersSub': 'Ask what affected your mood',
            'settings.language': 'Language',
            'settings.footnote': 'Settings are stored only on this device',
            'settings.everyday': 'every day',
            'language.title': 'Language', 'language.changed': 'Language changed',
            'language.footnote': 'Language changes the app interface. Your entries stay untouched.',
            'day.mon': 'Mon', 'day.tue': 'Tue', 'day.wed': 'Wed', 'day.thu': 'Thu',
            'day.fri': 'Fri', 'day.sat': 'Sat', 'day.sun': 'Sun',
            'date.todayShort': 'today', 'date.yesterdayShort': 'yesterday',
            'entries.edited': '· ed. {date}',
            'entries.noText': '(No text)',
            'entries.empty': 'No entries yet. Tap + to start!',
            'entries.emptyDay': 'No entries on this day',
            'entries.emptyTag': 'No entries with tag {tag}',
            'entries.emptyMood': 'No entries with mood {mood}',
            'entries.emptyTrigger': 'No entries with trigger {trigger}',
            'entries.emptySearch': 'Nothing found',
            'filter.tag': 'Tag:', 'filter.mood': 'Mood:', 'filter.trigger': 'Trigger:',
            'toast.entriesForDate': 'Entries for {date}',
            'toast.showingTag': 'Showing entries: {tag}',
            'toast.showingTrigger': 'Showing entries with trigger: {trigger}',
            'toast.moodFilter': 'Entries with mood {mood}',
            'toast.deleted': 'Deleted: {n}',
            'toast.deleteFailed': 'Could not delete entries. Please try again.',
            'toast.saveFailed': 'Save failed — please try again',
            'toast.migrated': 'Data moved to the new storage',
            'confirm.deleteMany': 'Delete {count}?',
            'delete.button': 'Delete ({n})',
            'progress.streak': 'You have been writing {count} in a row',
            'widgets.statsNote': 'last 30 days: {avg} · 3 stories',
            'widgets.statsEmpty': '3 mood stories',
            'widgets.memEmpty': 'no memories yet',
            'unit.entry.one': '{n} entry', 'unit.entry.other': '{n} entries',
            'unit.day.one': '{n} day', 'unit.day.other': '{n} days',
            'unit.memory.one': '{n} memory', 'unit.memory.other': '{n} memories',
            'editor.titlePlaceholder': 'Title (optional)',
            'editor.textPlaceholder': 'What would you like to write about?',
            'editor.cancelBack': 'Cancel (back)',
            'editor.favorite': 'Favorite', 'editor.delete': 'Delete entry',
            'editor.prev': 'Previous entry', 'editor.next': 'Next entry',
            'toolbar.templates': 'Templates', 'toolbar.bg': 'Entry background', 'toolbar.emoji': 'Emoji',
            'toolbar.tags': 'Tags', 'toolbar.triggers': 'What affected your mood?',
            'toolbar.text': 'Text', 'toolbar.list': 'List', 'toolbar.table': 'Table', 'toolbar.font': 'Font',
            'toolbar.align': 'Horizontal alignment',
            'toolbar.lineDown': 'Decrease line spacing', 'toolbar.lineUp': 'Increase line spacing',
            'toolbar.h1': 'Extra large (H1)', 'toolbar.h2': 'Large (H2)', 'toolbar.h3': 'Medium (H3)',
            'toolbar.h4': 'Standard (H4)', 'toolbar.h5': 'Small (H5)',
            'toolbar.listCircle': 'Bulleted list', 'toolbar.listStar': 'Star list',
            'toolbar.listHeart': 'Heart list', 'toolbar.listThumb': 'Thumb list',
            'toolbar.listNumber': 'Numbered list', 'toolbar.listCheck': 'Checklist', 'toolbar.listRemove': 'Remove list',
            'toolbar.tableRemove': '🗑️ Delete',
            'tpl.title': '📝 Choose a template',
            'tpl.gratitude': '🙏 Daily gratitude', 'tpl.gratitudeDesc': 'What am I grateful for today?',
            'tpl.summary': '📊 Day summary', 'tpl.summaryDesc': 'What worked? What to improve?',
            'tpl.ideas': '💡 Ideas for the future', 'tpl.ideasDesc': 'Thoughts, plans, dreams',
            'tpl.empty': '📄 Blank template', 'tpl.emptyDesc': 'Start from scratch',
            'tpl.gratitudeBody': '1. Today I am grateful for...\n2. What helped me...\n3. I am glad that...',
            'tpl.summaryBody': 'What worked today:\n- \n\nWhat can be improved:\n- \n\nConclusions:',
            'tpl.ideasBody': 'Ideas and thoughts:\n- \n\nPlans for the future:\n- \n\nDreams:',
            'bg.default': 'Default', 'bg.paper': 'Paper', 'bg.night': 'Night', 'bg.forest': 'Forest',
            'bg.sunset': 'Sunset', 'bg.lavender': 'Lavender', 'bg.wood': 'Wood', 'bg.stone': 'Stone',
            'bg.landscape': 'Landscape', 'bg.perry': 'Platypus',
            'emojiPack.standard': 'Standard', 'emojiPack.custom_halloween': 'Halloween (Test)',
            'pin.enter': '🔐 Enter PIN code', 'pin.setup': '🔐 Set PIN code', 'pin.confirm': '🔐 Confirm PIN',
            'pin.setupSub': 'Come up with a 4-digit code', 'pin.confirmSub': 'Enter the code again',
            'pin.wrong': 'Wrong PIN code', 'pin.mismatch': 'Codes do not match. Try again',
            'pin.set': 'PIN code set', 'pin.reset': 'PIN code reset',
            'pin.resetConfirm': 'Reset PIN code? The diary will be unprotected.', 'pin.skip': 'Skip',
            'mood.question': 'How was your day?',
            'confirm.default': 'Are you sure?', 'confirm.deleteEntry': 'Delete this entry?',
            'toast.entrySaved': 'Entry saved', 'toast.entryUpdated': 'Entry updated',
            'toast.entryDeleted': 'Entry deleted', 'toast.emptyDeleted': 'Empty entry deleted',
            'toast.saveEntryFailed': 'Could not save the entry', 'toast.saveFailedShort': 'Could not save',
            'toast.moodSaved': 'Mood saved',
            'toast.selectTextFirst': 'Select the text you want to colour first',
            'toast.listInTable': 'Lists cannot be used inside a table',
            'toast.tableRemoved': 'Table deleted', 'toast.cursorNotInTable': 'Cursor is not inside a table',
            'stats.title': 'Statistics', 'stats.normal': 'Basic', 'stats.deep': 'Deep',
            'stats.empty1': 'No entries yet.', 'stats.empty2': 'Start your diary!',
            'stats.bestWeek': 'Best this week', 'stats.worstWeek': 'Worst this week',
            'stats.topMood': 'Most frequent mood',
            'stats.avg7': '7-day average', 'stats.avg30': '30-day average',
            'stats.avgAll': 'All-time average',
            'stats.daysWithEntries': 'Days with entries', 'stats.totalEntries': 'Total entries',
            'stats.firstEntry': 'First entry',
            'stats.daysValue': '{a} of {b} ({p}%)',
            'unit.time.one': '{n} time', 'unit.time.other': '{n} times',
            'chart.title': 'Mood', 'chart.frequency': 'Emotion frequency',
            'chart.distribution': 'Distribution', 'chart.line': 'Line', 'chart.bars': 'Bars',
            'chart.average': 'Average: {v}',
            'chart.summary': 'Entries: {entries} · Days: {days}',
            'chart.summaryEmpty': 'Entries this month: 0',
            'chart.emptyMonth': 'No entries this month yet',
            'chart.barSummary': '{period} · Total entries: {n}',
            'period.all': 'All time', 'period.month': 'This month', 'period.week': 'This week',
            'period.monthCurrent': 'Current month', 'period.choose': 'Choose period',
            'aria.statsMode': 'Statistics mode', 'aria.chartMode': 'Chart type',
            'aria.moodChart': 'Mood chart', 'aria.barChart': 'Mood histogram'
        }
    };

    let lang = localStorage.getItem(STORAGE_KEY);
    if (!LOCALES[lang]) lang = FALLBACK;

    // t('key', {n: 5}) → подстановка {n}
    function t(key, vars) {
        const table = DICT[lang] || {};
        let s = table[key];
        if (s === undefined) s = (DICT[FALLBACK] || {})[key];
        if (s === undefined) { console.warn('[i18n] нет ключа:', key); return key; }
        if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
        return s;
    }

    // plural(5, 'entries.count') → ищет entries.count.one / .few / .many / .other
    function plural(n, keyBase, vars) {
        const cat = new Intl.PluralRules(lang).select(n);
        const table = DICT[lang] || {};
        const key = table[keyBase + '.' + cat] !== undefined ? keyBase + '.' + cat : keyBase + '.other';
        return t(key, Object.assign({ n: n }, vars || {}));
    }


    // Имена триггеров: ключ = русское имя в нижнем регистре, без эмодзи
    const TRIGGERS_EN = {
        'счастье':'happiness','спокойствие':'calmness','благодарность':'gratitude','уверенность':'confidence',
        'усталость':'tiredness','скука':'boredom','волнение':'nervousness','грусть':'sadness',
        'неуверенность':'insecurity','тревога':'anxiety','стресс':'stress','злость':'anger','отчаяние':'despair',
        'хороший':'good sleep','средний':'average sleep','плохой':'bad sleep',
        'спорт':'exercise','ходьба':'walking','здоровое питание':'healthy eating','медитация':'meditation',
        'кино':'movies','чтение':'reading','игры':'gaming','отдых':'vacation','искусство':'art',
        'здоровая':'healthy food','фастфуд':'fast food','домашняя':'home-cooked','сладости':'sweets','вода':'water',
        'начинать рано':'waking up early','составить список':'make a list','сконцентрироваться':'focus','рассеянность':'distraction'
    };
    // один триггер ("😴 усталость") или список через запятую
    function triggerLabel(raw) {
        const s = String(raw == null ? '' : raw);
        if (lang === 'ru' || !s) return s;
        const one = (x) => {
            const k = x.trim();
            const sp = k.indexOf(' ');
            const name = (sp === -1 ? k : k.slice(sp + 1)).trim().toLowerCase();
            const en = TRIGGERS_EN[name];
            if (!en) return k;
            return sp === -1 ? en : k.slice(0, sp + 1) + en;
        };
        return s.includes(',') ? s.split(',').map(one).join(', ') : one(s);
    }

    const toDate = (d) => (d instanceof Date ? d : new Date(d));
    const fmtDate = (d, opts) => toDate(d).toLocaleDateString(LOCALES[lang], opts);
    const fmtTime = (d, opts) => toDate(d).toLocaleTimeString(LOCALES[lang], opts);

    // Статика: только элементы с data-i18n*, никакого обхода всего дерева
    function applyStatic(root) {
        const scope = root || document;
        const skip = (el) => !!el.closest('[data-i18n-skip]');
        scope.querySelectorAll('[data-i18n]').forEach(el => {
            if (skip(el)) return;
            el.textContent = t(el.getAttribute('data-i18n'));
        });
        [['data-i18n-placeholder', 'placeholder'],
        ['data-i18n-title', 'title'],
        ['data-i18n-aria', 'aria-label'],
        ['data-i18n-dph', 'data-placeholder']].forEach(([attr, target]) => {
            scope.querySelectorAll('[' + attr + ']').forEach(el => {
                if (skip(el)) return;
                el.setAttribute(target, t(el.getAttribute(attr)));
            });
        });
        scope.querySelectorAll('[data-i18n-html]').forEach(el => {
            if (skip(el)) return;
            el.innerHTML = t(el.getAttribute('data-i18n-html'));
        });
    }

    function setLang(next, opts) {
        lang = LOCALES[next] ? next : FALLBACK;
        try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
        document.documentElement.lang = lang;
        applyStatic(document);
        document.dispatchEvent(new CustomEvent('app:langchange', { detail: { lang: lang } }));
        if (opts && opts.announce && typeof window.showToast === 'function') {
            window.showToast(t('language.changed'), 'success');
        }
    }

    window.I18N = {
        t: t, plural: plural, fmtDate: fmtDate, fmtTime: fmtTime,
        applyStatic: applyStatic, setLang: setLang,
        triggerLabel: triggerLabel,
        get lang() { return lang; },
        get locale() { return LOCALES[lang]; },
        get languages() { return Object.keys(LOCALES); }
    };

    document.documentElement.lang = lang;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => applyStatic(document));
    } else {
        applyStatic(document);
    }
})();