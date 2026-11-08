const LS_KEY = 'my_web_diary_entries_v2'; // Добавлено для миграции
// === 🗄️ IndexedDB ОБЁРТКА ===
const DB_NAME = 'MyWebDiaryDB';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

let db = null;

// Инициализация базы данных
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                objectStore.createIndex('date', 'date', { unique: false });
                objectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
        };
    });
}

// Получить все записи
function dbGetAll() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

// Сохранить или обновить запись
function dbPut(entry) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(entry);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

// Удалить запись по ID
function dbDelete(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

// Очистить все записи
function dbClear() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

// Миграция из localStorage в IndexedDB
async function migrateFromLocalStorage() {
    const stored = localStorage.getItem(LS_KEY);
    if (!stored) return false;
    
    try {
        const entries = JSON.parse(stored);
        if (Array.isArray(entries) && entries.length > 0) {
            let migratedCount = 0;

            for (const entry of entries) {
                // Пропускаем битые записи (без id или не объекты)
                if (!entry || typeof entry !== 'object' || !entry.id) {
                    console.warn('Пропущена битая запись при миграции:', entry);
                    continue;
                }

                // Проверяем, что дата валидная
                if (!entry.date || isNaN(new Date(entry.date).getTime())) {
                    console.warn('Пропущена запись с невалидной датой:', entry);
                    continue;
                }

                try {
                    await dbPut(entry);
                    migratedCount++;
                } catch (e) {
                    console.warn('Не удалось мигрировать запись:', entry.id, e);
                }
            }

            // ВСЕГДА удаляем localStorage, даже если часть записей пропущена
            // Это предотвращает зацикливание миграции
            localStorage.removeItem(LS_KEY);

            console.log(`Миграция завершена: ${migratedCount} из ${entries.length} записей`);
            return true;
        }
    } catch (error) {
        console.error('Ошибка миграции:', error);
    }
    
    return false;
}


// Массовое сохранение всех записей (используется при миграции и импорте)
async function saveAllToIndexedDB() {
    if (!db) {
        console.warn('IndexedDB не инициализирована');
        throw new Error('DB not initialized');
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        // 1. Получаем все существующие ключи в базе
        const getAllKeysRequest = store.getAllKeys();

        getAllKeysRequest.onsuccess = () => {
            const existingKeys = new Set(getAllKeysRequest.result);
            const newKeys = new Set(diaryEntries.map(e => e.id));

            // 2. Удаляем ТОЛЬКО те записи, которых больше нет в массиве
            for (const key of existingKeys) {
                if (!newKeys.has(key)) {
                    store.delete(key);
                }
            }

            // 3. Записываем/перезаписываем актуальные записи
            for (const entry of diaryEntries) {
                store.put(entry);
            }
        };

        // 4. Обработка завершения транзакции
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(new Error('Transaction aborted'));
    });
}