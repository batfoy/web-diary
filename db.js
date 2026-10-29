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
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return false;
    
    try {
        const entries = JSON.parse(stored);
        if (Array.isArray(entries) && entries.length > 0) {
            console.log(`Миграция: найдено ${entries.length} записей в localStorage`);
            
            // Сохраняем все записи в IndexedDB
            for (const entry of entries) {
                await dbPut(entry);
            }
            
            // После успешной миграции удаляем данные из localStorage
            localStorage.removeItem(STORAGE_KEY);
            console.log('Миграция завершена успешно');
            return true;
        }
    } catch (error) {
        console.error('Ошибка миграции:', error);
    }
    
    return false;
}

// Массовое сохранение всех записей (используется при миграции и импорте)
async function saveAllToIndexedDB() {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Сначала очищаем хранилище
    store.clear();
    
    // Затем записываем все текущие записи
    for (const entry of diaryEntries) {
        store.put(entry);
    }
    
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}