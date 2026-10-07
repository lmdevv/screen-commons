import type { Shot } from "./tray";
import { sortShots } from "./tray";

/**
 * IndexedDB store for tray shots (blobs can be several MB each). Shared by the background and
 * extension pages, which all live on the same extension origin.
 */
const DB_NAME = "open-ui-capture";
const DB_VERSION = 1;
const STORE = "shots";

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = undefined;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = undefined;
      reject(request.error ?? new Error("Could not open IndexedDB"));
    };
  });
  return dbPromise;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const request = run(store);
    let result: T | undefined;
    if (request) request.onsuccess = () => (result = request.result);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export async function listShots(): Promise<Shot[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const all = await promisify(tx.objectStore(STORE).getAll() as IDBRequest<Shot[]>);
  return sortShots(all);
}

export async function getShot(id: string): Promise<Shot | undefined> {
  return withStore<Shot>("readonly", (store) => store.get(id) as IDBRequest<Shot>);
}

export async function putShots(shots: readonly Shot[]): Promise<void> {
  await withStore("readwrite", (store) => {
    for (const shot of shots) store.put(shot);
  });
}

/** Patch non-blob fields of shots. */
export async function updateShots(patches: readonly ({ id: string } & Partial<Omit<Shot, "id" | "image" | "thumbnail">>)[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const patch of patches) {
      const request = store.get(patch.id) as IDBRequest<Shot | undefined>;
      request.onsuccess = () => {
        if (request.result) store.put({ ...request.result, ...patch });
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

export async function deleteShots(ids: readonly string[]): Promise<void> {
  await withStore("readwrite", (store) => {
    for (const id of ids) store.delete(id);
  });
}

export async function clearShots(): Promise<void> {
  await withStore("readwrite", (store) => store.clear());
}

export async function countShots(): Promise<number> {
  return (await withStore<number>("readonly", (store) => store.count())) ?? 0;
}
