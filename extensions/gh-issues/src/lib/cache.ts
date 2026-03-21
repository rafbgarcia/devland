const CACHE_DB_NAME = 'devlandapp';
const CACHE_STORE_NAME = 'gh-issues';
const CACHE_DB_VERSION = 1;

function openCacheDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(CACHE_STORE_NAME)) {
        database.createObjectStore(CACHE_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open extension cache database.'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const database = await openCacheDatabase();

  try {
    const transaction = database.transaction(CACHE_STORE_NAME, mode);
    const store = transaction.objectStore(CACHE_STORE_NAME);

    return await callback(store);
  } finally {
    database.close();
  }
}

function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
  });
}

export async function getCachedValue<T>(key: string): Promise<T | null> {
  return await withStore('readonly', async (store) => {
    const request = store.get(key);
    const value = await readRequest<T | undefined>(request);

    return value ?? null;
  });
}

export async function setCachedValue<T>(key: string, value: T): Promise<void> {
  await withStore('readwrite', async (store) => {
    store.put(value, key);
    await waitForTransaction(store.transaction);
  });
}

export async function deleteCachedValue(key: string): Promise<void> {
  await withStore('readwrite', async (store) => {
    store.delete(key);
    await waitForTransaction(store.transaction);
  });
}
