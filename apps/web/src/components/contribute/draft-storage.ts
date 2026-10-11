import { initialState, type Draft, type WizardState } from "./model";

type StoredDraft = Omit<Draft, "file" | "previewUrl" | "processed">;
type StoredState = Omit<WizardState, "drafts"> & { drafts: StoredDraft[]; version: 1 };
let connection: Promise<IDBDatabase> | undefined;

function database() {
  return (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("screen-commons-contributions", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("drafts");
      request.result.createObjectStore("assets");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      connection = undefined;
      reject(request.error);
    };
  }));
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function finished(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () =>
      reject(transaction.error ?? new Error("Draft could not be saved"));
  });
}

const savedAssets = new Map<string, { file: File; processed: Draft["processed"] }>();

export async function saveDraft(userId: string, state: WizardState) {
  const db = await database();
  const tx = db.transaction(["drafts", "assets"], "readwrite");
  const done = finished(tx);
  void done.catch(() => {});
  const assets = tx.objectStore("assets");
  const previous = await result<StoredState | undefined>(tx.objectStore("drafts").get(userId));
  const keep = new Set(state.drafts.map((d) => d.id));
  for (const old of previous?.drafts ?? [])
    if (!keep.has(old.id)) {
      assets.delete(`${userId}:${old.id}`);
      savedAssets.delete(`${userId}:${old.id}`);
    }
  for (const draft of state.drafts) {
    const key = `${userId}:${draft.id}`;
    const previousAsset = savedAssets.get(key);
    if (previousAsset?.file !== draft.file || previousAsset.processed !== draft.processed) {
      assets.put({ file: draft.file, processed: draft.processed }, key);
    }
  }
  const stored: StoredState = {
    ...state,
    version: 1,
    drafts: state.drafts.map(
      ({ file: _file, processed: _processed, previewUrl: _url, ...meta }) => meta,
    ),
  };
  if (state.drafts.length) tx.objectStore("drafts").put(stored, userId);
  else tx.objectStore("drafts").delete(userId);
  await done;
  for (const draft of state.drafts)
    savedAssets.set(`${userId}:${draft.id}`, { file: draft.file, processed: draft.processed });
}

export async function loadDraft(userId: string): Promise<WizardState | null> {
  const db = await database();
  const tx = db.transaction(["drafts", "assets"], "readonly");
  const stored = await result<StoredState | undefined>(tx.objectStore("drafts").get(userId));
  if (!stored || stored.version !== 1 || !Array.isArray(stored.drafts)) return null;
  const drafts = await Promise.all(
    stored.drafts.map(async (meta): Promise<Draft> => {
      const key = `${userId}:${meta.id}`;
      const asset = await result<{ file: File; processed?: Draft["processed"] } | undefined>(
        tx.objectStore("assets").get(key),
      );
      if (!asset?.file) throw new Error("Saved screenshot is unavailable");
      savedAssets.set(key, { file: asset.file, processed: asset.processed });
      return {
        ...meta,
        ...asset,
        previewUrl: URL.createObjectURL(asset.processed?.thumbnail ?? asset.file),
        status: asset.processed ? "ready" : "processing",
        upload:
          meta.upload.status === "uploading"
            ? { ...meta.upload, status: "queued", progress: 0 }
            : meta.upload,
      };
    }),
  );
  return {
    ...initialState(),
    ...stored,
    drafts,
    step: drafts.some((d) => d.status === "processing") ? 0 : stored.step,
    submit: {
      ...stored.submit,
      phase: stored.submit.phase === "uploading" ? "error" : stored.submit.phase,
    },
  };
}
