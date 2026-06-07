/**
 * Recent local files: metadata in storage.local, blobs in IndexedDB (max ~20MB/file, 8 entries).
 */
(function (global) {
  const META_KEY = 'wtpViewerRecent';
  const DB_NAME = 'wtpViewerFiles';
  const STORE = 'files';
  const MAX_ENTRIES = 8;
  const MAX_BYTES = 20 * 1024 * 1024;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
    });
  }

  async function wtpViewerGetRecentMeta() {
    const data = await browser.storage.local.get(META_KEY);
    return Array.isArray(data[META_KEY]) ? data[META_KEY] : [];
  }

  async function wtpViewerSaveFile(file, pageKey, typeKind) {
    if (file.size > MAX_BYTES) {
      throw new Error('FILE_TOO_LARGE');
    }
    const id = pageKey.replace(/^ext-viewer:/, '') || pageKey;
    const entry = {
      id,
      name: file.name,
      type: typeKind || 'bin',
      pageKey,
      lastOpenedAt: new Date().toISOString()
    };
    const buf = await file.arrayBuffer();
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put({
        id,
        pageKey,
        name: entry.name,
        type: entry.type,
        typeKind: entry.type,
        blob: buf,
        savedAt: entry.lastOpenedAt
      });
    });
    db.close();

    let list = await wtpViewerGetRecentMeta();
    list = list.filter((x) => x.id !== id);
    list.unshift(entry);
    if (list.length > MAX_ENTRIES) list = list.slice(0, MAX_ENTRIES);
    await browser.storage.local.set({ [META_KEY]: list });
    return entry;
  }

  async function wtpViewerLoadBlob(id) {
    const db = await openDb();
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!row?.blob) return null;
    return new Blob([row.blob], { type: row.type || 'application/octet-stream' });
  }

  async function wtpViewerTouchRecent(id) {
    const list = await wtpViewerGetRecentMeta();
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return list;
    const [item] = list.splice(i, 1);
    item.lastOpenedAt = new Date().toISOString();
    list.unshift(item);
    await browser.storage.local.set({ [META_KEY]: list });
    return list;
  }

  global.wtpViewerGetRecentMeta = wtpViewerGetRecentMeta;
  global.wtpViewerSaveFile = wtpViewerSaveFile;
  global.wtpViewerLoadBlob = wtpViewerLoadBlob;
  global.wtpViewerTouchRecent = wtpViewerTouchRecent;
})(typeof globalThis !== 'undefined' ? globalThis : window);
