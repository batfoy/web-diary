# Daytone — умный дневник настроения (PWA, готов к Capacitor)

## 📌 Продукт
Мобильное веб-приложение для ежедневного трекинга настроения с аналитикой
триггеров, инсайтами, достижениями и визуализациями. Работает офлайн (PWA),
ставится на домашний экран; код готов к обёртке в Capacitor без переделок.

## 🏗️ Файлы и порядок загрузки
| Файл | Назначение |
|---|---|
| `index.html` | Все экраны: главная, модалки, сайдбар, таб-бар, настройки |
| `style.css` | 4 темы, компоненты, анимации, `content-visibility` |
| `db.js` | Обёртка IndexedDB: `initDB, dbPut, dbDelete, dbGetAll, saveAllToIndexedDB, migrateFromLocalStorage` |
| `purify.min.js` | DOMPurify |
| `i18n.js` | Ключевая локализация RU/EN (FR = только словари) |
| `script.js` | Вся логика; классические скрипты, порядок: db → purify → i18n → script(defer) |
| `sw.js` | Service Worker, stale-while-revalidate, `CACHE_VERSION` (ритуал: +1 при каждом релизе) |
| `manifest.json` | PWA-манифест |
| `emojis/*.svg` | 10 SVG-эмодзи настроений |
| `bg-*.webp` | Фоны записей |
| `generate-test-data.js` | DEV-инструмент: генерация 2 лет тестовых записей (в index.html не подключается) |

## 🌍 i18n (ключевая, пост-рендер движок УДАЛЁН)
- `i18n.js`: `DICT.ru / DICT.en`, `I18N.t(key, vars)` (`{n}`-подстановки),
  `I18N.plural(n, keyBase)` через `Intl.PluralRules` (ключи `unit.entry/day/year/memory/time/point`
  с формами `.one/.few/.many/.other`), `I18N.fmtDate/fmtTime` (LOCALES ru-RU/en-GB/fr-FR),
  `I18N.triggerLabel(raw)` (словарь `TRIGGERS_EN`, поддерживает списки через запятую),
  `I18N.applyStatic(root)`, `I18N.setLang(lang)` → событие `app:langchange`.
- Хранение: `localStorage ds_lang_v1`. Мост: `applyLanguage()` в `initDiarySettings`
  вызывает `I18N.setLang`.
- HTML: статика через `data-i18n`, тултипы `data-i18n-title`, placeholder'ы
  `data-i18n-placeholder`, `data-i18n-dph` (data-placeholder), `aria-label` `data-i18n-aria`.
  Внутри элементов лежит RU-текст как fallback.
- JS: все строки только через `I18N.t/plural/fmtDate/fmtTime`. Даты НИКОГДА не через
  `toLocaleDateString('ru-RU')` напрямую.
- Открытые модалки обновляются слушателями `app:langchange` (ре-рендер динамики +
  `I18N.applyStatic` для статики).
- Правила пополнения: новый ключ → в оба словаря; новый экран → `data-i18n` в HTML.

## ⚡ Перф-контракт (не нарушать!)
- Группировка по дням ТОЛЬКО через `getDayIndex()` (Map<dateKey, Entry[]>, кэш);
  инвалидация `touchEntries()` (вызывается первой строкой в `renderEntries` и `scheduleRender`).
- Пачки перерисовок ТОЛЬКО через `scheduleRender('list'|'calendar'|'chart'|'deep'|'progress')`
  (коалесценция в один rAF). Прямые `renderEntries()` допустимы только из фильтров/навигации.
- `renderEntries(force)`: при открытой модалке записи пропускает рендер (`_listDirty`),
  дорисовывает в `closeEntryForm`. Пагинация: `PAGE_SIZE=40`, sentinel
  `#entries-sentinel` + IntersectionObserver (fallback: scroll-листенер).
- События списка делегированы на `#entries-list` (pointerdown/long-press 500ms/click);
  НИКАКИХ слушателей на отдельных карточках.
- Календарь: строится только видимая сетка (`matchMedia('(min-width:769px)')`),
  клик делегирован по `.calendar-day[data-date]`, ре-рендер на смене брейкпоинта.
- Поиск: debounce 180ms. CSS: `content-visibility:auto` на `.entry-card/.entries-date-group`.
- Запрещено: MutationObserver для перевода, патчи `Date.prototype`/`fillText`,
  `filter` по всем записям внутри циклов по дням.

## 🏅 Достижения (9)
`ACHIEVEMENTS` = [{id, cur(stats), target}]: newbie(1 запись), apprentice(7 дней),
master(30), eternal(360), tireless(30 подряд), nights(1001), multifaceted(6 настроений),
rich(10 настроений), colorful(смена темы).
- `computeAchievementStats()`: totalEntries, totalDays, bestStreak (подряд по dateKey),
  moods, themeChanged (`ds_theme_changed_v1`, ставится в `applyTheme` через сравнение с
  `my_web_diary_theme_prev_v1`).
- Хранение: `ds_achievements_v1` = {id: timestamp}. Разблокировка необратима.
- Проверка: `checkAchievements()` из `updateProgressCard()`, `applyTheme()`, `saveAndRender()`.
- UI: пункт «Достижения» ПЕРВЫМ в сайдбаре; fullscreen-модалка, сетка 3×3,
  золото `--gold:#FFD700` (`.ach-card.unlocked`), прогресс `N / target` или `✓`;
  подмодалка детали (крестик/фон/Escape): иконка + «Поздравляем!…» или условие+прогресс.
- Тост: очередь `_achToastQueue` + `.ach-toast` (выплывает сверху, 3.2s, при очереди ≥3 — 1.6s).
- Иконки: `ACHIEVEMENT_ICONS` (stroke-SVG, `currentColor`): птенец, шапочка, корона-бокс,
  щит-бесконечность, супергерой, солнце/луна, лицо, человек со звёздами, палитра.
- i18n-ключи `ach.*` (menu/title/counter/congrats + name/desc на каждое).
- DEV-диагностика: console-скрипт с `console.table` по `ACHIEVEMENTS` (mismatch-колонка).

## ⚙️ Настройки и уведомления (`initDiarySettings` IIFE)
- Ключи: `ds_notifications_v1 {enabled,time,days[]}`, `ds_triggers_v1`, `ds_lang_v1`.
- Триггер-тумблер: guard в `startTriggersFlow()` (выключено → сразу редактор).
- Уведомления: веб-ветка — цепочка `setTimeout` до `nextOccurrence()` (MAX_TIMEOUT-чанки),
  показ через SW `registration.showNotification` или `new Notification`;
  нативная ветка активируется САМА при наличии `window.Capacitor.Plugins.LocalNotifications`:
  недельное расписание `schedule.on {weekday, hour, minute}`, id 4100+, `extra.route='quick-entry'`,
  тап по уведомлению → `openMoodModal(true,false)`. Экран настроек не меняется между вебом и нативом.
- `window.DiarySettings` API: triggersEnabled, language, nativeNotifications, t,
  allowTriggersOnce (legacy no-op), rescheduleNotifications, openSettings.

## 🎯 Ядро (без изменений из v1)
Записи: contenteditable-редактор (H1-H5, списки/чек-листы, таблицы, цвета, 6 шрифтов,
10 фонов), автосейв 500ms, теги #, избранное, long-press multidelete, свайп-отмена выбора.
Настроение: 10 баллов SVG; Daylio-поток «+ → эмодзи → триггеры → редактор».
Триггеры: каталог в localStorage (`my_web_diary_trigger_catalog_v1`), 6 групп, CRUD
с переименованием/вычисткой из записей, long-press меню, пул свободных иконок.
Аналитика: smart day score (взвешенное среднее), двухступенчатые средние,
инсайты same-day/next-day с confidence, стрики, календарь+инсайты месяца,
пиксельная сетка года (инспектор дня), сторис ×3, ностальгия, графики canvas ×4.
Безопасность: DOMPurify whitelist + style-хук, PIN SHA-256+salt с миграцией plaintext.
UX: smart-header (автодокрут в обе стороны, search-open pin), bottom-nav с ripple,
сегмент-контролы, toast/confirm, 4 темы + `syncThemeColor()`.

## 💾 Схема Entry
{id, date(ISO noon), createdAt, updatedAt, editedAt, title, content(HTML sanitized),
mood(emoji), triggers["icon name"], tags[], favorite, wordCount, background,
fontSize/LineHeight/FontFamily/FontWeight/FontStyle, isQuickEntry}

## 🧩 Хранилище
IndexedDB `MyWebDiaryDB/entries` — записи. localStorage: тема, `SORT_KEY`, язык,
PIN-хеш, уведомления, триггеры-каталог, достижения, флаги темы.
Миграция v1(localStorage)→IndexedDB автоматическая.

## ⏳ Отложено / план
Веб (опционально до Capacitor): install-prompt (`beforeinstallprompt` + iOS-инструкция).
Capacitor-фаза: PDF-экспорт, облачный бэкап, голосовой ввод, FR-словари (только данные).

## 🔁 Ритуалы
Любая правка: `CACHE_VERSION`+1 → Ctrl+Shift+R → git commit (семантический) → push.
Новая строка UI = ключ в обоих словарях. Новый рендер = через `scheduleRender`.

📱 Что делать в Capacitor (когда вернёшься)
Сначала коммит и тег: git tag v1.0-web — точка возврата «чистый веб».
Инициализация: npm i @capacitor/core @capacitor/cli → npx cap init "Daytone" com.daytone.app --web-dir=. (webDir = корень проекта, где лежит index.html).
Платформы: npx cap add android, npx cap add ios (iOS нужен Mac+Xcode).
Плагины: @capacitor/local-notifications (код УЖЕ готов — нативная ветка подхватится сама), @capacitor/app (кнопка «назад» на Android), @capacitor/splash-screen, @capacitor/status-bar, позже @capacitor/filesystem + @capacitor/share (PDF/бэкапы).
capacitor.config.ts: android: { scheme: 'https' } (важно: стабильные localStorage/IndexedDB), splash 2000ms под цвет темы, smallIcon/sound для уведомлений.
Иконки/сплэш: npx capacitor-assets generate из одного лого 1024px.
Service Worker в нативе отключить: в сниппете регистрации обернуть if (!window.Capacitor), иначе обновления приложения будут застревать в кэше WebView.
Данные веб→натив не переедут сами (другой origin): мост — твой же экспорт/импорт JSON.
Сборка: npx cap sync && npx cap open android; уведомления проверять на реальном устройстве (эмулятор + scheduled-уведомления капризны), Android 13+ сам запросит POST_NOTIFICATIONS через плагин.
В нативной фазе доделать: PDF, облако, голосовой ввод, install-prompt уже не нужен (есть иконка).