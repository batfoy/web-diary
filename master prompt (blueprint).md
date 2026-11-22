# Daytone — умный дневник настроения (PWA)

## 📌 Что это
Мобильное веб-приложение для ежедневного трекинга настроения с продвинутой аналитикой триггеров, инсайтами и визуализацией. Работает офлайн как PWA, устанавливается на домашний экран.

## 🏗️ Архитектура файлов

| Файл | Назначение |
|---|---|
| `index.html` | Разметка всех экранов (главная, модалки, сайдбар, таб-бар) |
| `style.css` | Темы (light/dark/pastel/blue), компоненты, анимации |
| `script.js` | Вся бизнес-логика: рендеры, обработчики, состояния |
| `i18n.js` | Мультиязычность (RU/EN) через ключевые словари |
| `db.js` | Обёртка IndexedDB (CRUD записей) |
| `purify.min.js` | DOMPurify — санитизация HTML |
| `sw.js` | Service Worker: offline, кэш stale-while-revalidate |
| `manifest.json` | PWA-манифест (иконки, имя, цвета) |
| `emojis/*.svg` | 10 кастомных SVG-эмодзи настроений |
| `bg-*.webp` | Фоны записей (пейзаж, утканос) |

## 🎯 Ключевые фичи

### Записи
- ContentEditable редактор с богатым форматированием (H1-H5, списки, таблицы, цвета, шрифты, выравнивание)
- 6 пресетов шрифтов (Roboto, Dancing Script, Pacifico, Great Vibes и др.)
- 10 фонов записей (включая 2D-пейзаж и Утканоса)
- 2 пака эмодзи (стандартный + кастомный Halloween)
- Автосохранение через debounce (500ms) в IndexedDB
- Теги (#hashtag) с авто-извлечением
- Избранное, множественное удаление long-press

### Настроение и триггеры
- 10-балльная шкала настроения с SVG-иконками
- Быстрая запись (1 тап на настроение + триггеры)
- Каталог триггеров Daylio-стиль: 6 групп (Эмоции, Сон, Здоровье, Хобби, Еда, Продуктивность)
- Создание/редактирование своих триггеров с иконкой
- Анализ влияния триггеров: same-day и next-day impact с confidence

### Аналитика
- **Обычная статистика**: лучшее/худшее за неделю, топ-настроение, средние за 7/30/всё время
- **Глубокая статистика**: стрики хорошего настроения, настроение прошлой недели, топ-3 хороших/плохих триггеров
- **Инсайты**: автоматический анализ «ваше настроение на X% выше/ниже, когда триггер Y»
- **Графики**: линейный с градиентом по настроению, гистограмма частоты эмоций, график триггеров, график по дням недели
- **Календарь**: с умным настроением за день и инсайтами месяца (лучший/худший день)
- **Пиксельная сетка года**: GitHub-style grid 365 дней с цветовой интерполяцией
- **Сторис**: 3 слайда — месяц, прошлая неделя, сравнение с прошлым месяцем
- **Ностальгия**: записи этого дня в прошлые годы

### UX
- Мобильно-первая адаптация, поддержка iOS safe-area
- Smart-header (скрывается при скролле вниз)
- Bottom nav с ripple-эффектами
- Sidebar с подменю (темы, сортировка, экспорт/импорт, PIN)
- Toast-уведомления и кастомные Confirm-модалки
- PIN-код (SHA-256 + соль) с миграцией plaintext → hash

## 💾 Структура данных Entry

```js
{
  id: String,            // timestamp
  date: ISOString,       // дата записи (YYYY-MM-DDT12:00:00Z)
  createdAt: Number,     // timestamp создания
  updatedAt: Number,     // timestamp изменения
  editedAt: Number|null, // дата редактирования
  title: String,
  content: String,       // HTML (DOMPurify sanitized)
  mood: String,          // emoji из MOODS
  triggers: String[],    // ["⏰ начинать рано", "🏃 спорт"]
  tags: String[],        // ["работа", "семья"]
  favorite: Boolean,
  wordCount: Number,
  background: String,    // id из BACKGROUNDS
  fontSize: String, lineHeight: String,
  fontFamily: String, fontWeight: String, fontStyle: String,
  isQuickEntry: Boolean
}

🌍 Система i18n
Ключевая локализация через i18n.js:
Словари DICT.ru и DICT.en по ключам ('nav.menu': 'Меню')
I18N.t(key, vars) — подстановка переменных {n}, {date}
I18N.plural(n, keyBase) — через Intl.PluralRules
I18N.fmtDate(d, opts) / I18N.fmtTime(d, opts) — locale-aware форматирование
I18N.triggerLabel(raw) — перевод имён триггеров через словарь TRIGGERS_EN
I18N.applyStatic(root) — обходит [data-i18n], [data-i18n-title], [data-i18n-placeholder], [data-i18n-dph], [data-i18n-html], [data-i18n-aria]
Событие app:langchange — открытые модалки обновляются на лету
В HTML: статический текст через data-i18n="key", тултипы — data-i18n-title, placeholder'ы — data-i18n-placeholder.
🎨 Темы
4 встроенные темы через CSS-переменные:
light — классическая светлая
dark — тёмная (синие акценты)
pastel — розовая пастель
blue — мягкая голубая (My Diary style)
Переменные: --bg-color, --surface, --text-color, --accent-color, --border-color, --nav-*, --mood-btn-bg и др.
📊 Ключевые алгоритмы
Smart Day Score (calculateSmartDayScore):
Одна запись → её балл
Несколько записей → взвешенное среднее (вес = 1.0 + index*0.2 при diff>1 между записями)
Mood Color Interpolation:
5 стоп-поинтов (1.5→красный, 3.5→оранжевый, 5.5→голубой, 7.5→зелёный, 9.5→тёмно-зелёный), линейная интерполяция RGB между ними.
Trigger Insights:
Для каждого триггера считается same-day avg и next-day avg. Impact = max(|diff|). Confidence: high (≥15), medium (≥8), low (≥5).
Streak:
Дни подряд с smart score ≥ 7.
🔒 Безопасность
DOMPurify с whitelist тегов/атрибутов + хук на CSS style
contenteditable sandbox
PIN через SHA-256 + salt
noopener noreferrer на внешних ссылках
📱 PWA и офлайн
Service Worker: stale-while-revalidate
CACHE_VERSION поднимается при каждом релизе
Manifest: standalone mode, portrait, иконки 192/512
Offline: все данные в IndexedDB, кэш HTML/CSS/JS
🚀 Деплой
Статический хостинг (GitHub Pages, Netlify, Vercel). Требует HTTPS для Service Worker и Notification API.
🔧 Состояния приложения
diaryEntries[] — массив записей в памяти
activeSortMode, activeTagFilter, activeDateFilter, activeMoodFilter, activeTriggerFilter — фильтры
editingEntryId, isEditing — состояние редактора
multiDeleteMode, selectedEntries[] — режим удаления
currentStatsMode ('normal'|'deep'), currentChartMode ('line'|'bar')
storiesIndex, storiesProgress — сторис
pixelYear, pixelDayMap, pixelSelectedKey — пиксельная сетка
📦 Хранение
IndexedDB (MyWebDiaryDB, store entries) — основной стор записей
localStorage: тема, язык, сортировка, PIN-хеш, уведомления, триггеры, кавычки
Миграция: автоматическая из localStorage v1 в IndexedDB v2
🧩 Паттерны
Модалки: .modal.hidden → .modal:not(.hidden), backdrop blur
Тулбар: openToolbarPanel(panelId) с подпанелями
Делегирование: один обработчик на #entries-list для кликов по карточкам
Long-press: touchstart + 500ms таймер для multi-delete mode
Swipe: pointer events для сторис и виджетов


---

## Как использовать мастер-промпт

1. **Для нового AI-ассистента**: вставь этот промпт в системное сообщение — AI сразу поймёт архитектуру, ключевые функции и как устроен i18n
2. **Для onboarding нового разработчика**: как README верхнего уровня
3. **Для себя**: быстрая шпаргалка по всем модулям без чтения 7000 строк кода
4. **Для документации**: можно конвертировать в `README.md` или Wiki

## Что ещё можно добавить (по желанию)

- **Добавить французский язык**: просто создай `DICT.fr` в `i18n.js` и добавь строку в экран языка
- **Добавить новую тему**: блок `body.theme-X` в `style.css` + кнопка в sidebar
- **Новая группа триггеров**: добавь объект в `TRIGGER_GROUPS` и ключи `trig.group.X` в `i18n.js`
- **Capacitor**: `npx cap add ios` → нативные уведомления заработают без изменений кода

`git add .` → `git commit -m "fix i18n: trigger labels, add trigger btn, year-in-pixels; add master prompt"` → `git push`