const DB_NAME = "TileGoDB";
const DB_VERSION = 2;
const SETTINGS_STORE = "settings";

export interface PersistedSettings {
  id: string;
  urlTemplate: string;
  selectedTemplateId: string;
  minZoom: number;
  maxZoom: number;
  fileName: string;
  format: string;
  threads: number;
  timeout: number;
  retries: number;
  proxyUrl: string;
  userAgent: string;
  referer: string;
  skipExisting: boolean;
  checkMd5: boolean;
  minFileSize: number;
  maxFileSize: number;
  rateLimit: number;
  useHttp2: boolean;
  keepAlive: boolean;
  batchSize: number;
  bufferSize: number;
  apiBaseUrl: string;
  theme: string;
  locale: string;
}

const DEFAULT_SETTINGS: PersistedSettings = {
  id: "default",
  urlTemplate: "",
  selectedTemplateId: "",
  minZoom: 0,
  maxZoom: 18,
  fileName: "tiles",
  format: "zxy",
  threads: 10,
  timeout: 60,
  retries: 5,
  proxyUrl: "",
  userAgent: "",
  referer: "",
  skipExisting: true,
  checkMd5: false,
  minFileSize: 100,
  maxFileSize: 2097152,
  rateLimit: 10,
  useHttp2: true,
  keepAlive: true,
  batchSize: 1000,
  bufferSize: 8192,
  apiBaseUrl: "http://localhost:8765",
  theme: "light",
  locale: "zh-CN",
};

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
      }
    };
  });
};

export const saveSettings = async (
  settings: Partial<PersistedSettings>,
): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SETTINGS_STORE, "readwrite");
    const store = transaction.objectStore(SETTINGS_STORE);
    const data = { ...DEFAULT_SETTINGS, ...settings, id: "default" };
    const request = store.put(data);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

export const loadSettings = async (): Promise<PersistedSettings> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SETTINGS_STORE, "readonly");
    const store = transaction.objectStore(SETTINGS_STORE);
    const request = store.get("default");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (request.result) {
        resolve({ ...DEFAULT_SETTINGS, ...request.result });
      } else {
        resolve(DEFAULT_SETTINGS);
      }
    };
  });
};

export const clearSettings = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SETTINGS_STORE, "readwrite");
    const store = transaction.objectStore(SETTINGS_STORE);
    const request = store.clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};
