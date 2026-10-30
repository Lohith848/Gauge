const DATABASE = 'gauge-local';
const STORE = 'reports';
const CURRENT_REPORT = 'current';

export interface CachedReport {
  file: Blob;
  fileName: string;
  fileType: string;
  lastModified: number;
  ai: import('../ai/types').AiReport | null;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open browser storage.'));
  });
}

async function write(value: CachedReport | null): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    if (value) store.put(value, CURRENT_REPORT);
    else store.delete(CURRENT_REPORT);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the report in this browser.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Browser storage was unavailable.'));
  }).finally(() => db.close());
}

export async function saveCachedReport(file: File, ai: CachedReport['ai'] = null): Promise<void> {
  await write({ file, fileName: file.name, fileType: file.type, lastModified: file.lastModified, ai });
}

export async function saveCachedAi(ai: CachedReport['ai']): Promise<void> {
  const cached = await readCachedReport();
  if (cached) await write({ ...cached, ai });
}

export async function readCachedReport(): Promise<CachedReport | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).get(CURRENT_REPORT);
    request.onsuccess = () => resolve((request.result as CachedReport | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Could not read the saved report.'));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error('Could not read the saved report.')); };
  });
}

export async function clearCachedReport(): Promise<void> {
  await write(null);
}
