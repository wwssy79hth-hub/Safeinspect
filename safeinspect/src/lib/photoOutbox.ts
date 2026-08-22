// ============================================================
// SafeInspect — Photo outbox (IndexedDB)
//
// Photos sync separately from data (HeightTrack §4): a slow or
// failed photo upload must never hold up — or lose — field work.
// Pending photo blobs are persisted here so they survive
// reloads; the sync queue replays them when connectivity
// returns. localStorage cannot hold blobs, hence IndexedDB.
// ============================================================

export interface QueuedPhoto {
  /** Also used as the asset_photos row id — replay-idempotent */
  id: string
  inspectionId: string
  assetId: string
  storagePath: string
  contentType: string
  caption: string | null
  sortOrder: number
  uploadedBy: string
  blob: Blob
  queuedAt: string
}

const DB_NAME = 'safeinspect-photo-outbox'
const STORE = 'photos'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'id' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'))
    } catch (err) {
      reject(err)
    }
  })
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = run(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
        t.oncomplete = () => db.close()
        t.onabort = () => db.close()
      })
  )
}

export async function savePhoto(photo: QueuedPhoto): Promise<void> {
  await tx('readwrite', (s) => s.put(photo))
}

export async function getPhoto(id: string): Promise<QueuedPhoto | null> {
  try {
    return (await tx<QueuedPhoto | undefined>('readonly', (s) => s.get(id))) ?? null
  } catch {
    return null
  }
}

export async function deletePhoto(id: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id))
  } catch {
    /* already gone / storage unavailable */
  }
}

export async function listPhotos(): Promise<QueuedPhoto[]> {
  try {
    return await tx<QueuedPhoto[]>('readonly', (s) => s.getAll())
  } catch {
    return []
  }
}

/** Count + total bytes queued — for the sync status screen. */
export async function pendingPhotoStats(): Promise<{ count: number; bytes: number }> {
  const photos = await listPhotos()
  return {
    count: photos.length,
    bytes: photos.reduce((sum, p) => sum + (p.blob?.size ?? 0), 0),
  }
}
