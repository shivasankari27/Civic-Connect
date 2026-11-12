const DB_NAME = 'civic-connect-report-cache'
const DB_VERSION = 1
const STORE_NAME = 'citizen-reports'

export const REPORT_CACHE_TTL_MS = 10 * 60 * 1000
export const REPORT_FETCH_TIMEOUT_MS = 10 * 1000

function openDatabase(indexedDBImpl = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    if (!indexedDBImpl) {
      reject(new Error('IndexedDB is not supported'))
      return
    }

    const request = indexedDBImpl.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'userId' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Unable to open report cache'))
  })
}

function serializeValue(value) {
  if (value && typeof value.toDate === 'function') {
    return { __civicConnectTimestamp: value.toDate().toISOString() }
  }

  if (Array.isArray(value)) return value.map(serializeValue)

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, serializeValue(nested)])
    )
  }

  return value
}

function deserializeValue(value) {
  if (Array.isArray(value)) return value.map(deserializeValue)

  if (value && typeof value === 'object') {
    if (typeof value.__civicConnectTimestamp === 'string') {
      const date = new Date(value.__civicConnectTimestamp)
      return { toDate: () => new Date(date) }
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, deserializeValue(nested)])
    )
  }

  return value
}

export async function readCachedReports(userId, indexedDBImpl = globalThis.indexedDB, now = Date.now()) {
  if (!userId) return null

  const database = await openDatabase(indexedDBImpl)

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(userId)

    request.onsuccess = () => {
      database.close()
      const record = request.result
      if (!record || !Array.isArray(record.reports)) {
        resolve(null)
        return
      }

      resolve({
        reports: deserializeValue(record.reports),
        cachedAt: record.cachedAt,
        isStale: !Number.isFinite(record.cachedAt) || now - record.cachedAt >= REPORT_CACHE_TTL_MS,
      })
    }

    request.onerror = () => {
      database.close()
      reject(request.error || new Error('Unable to read cached reports'))
    }
  })
}

export async function writeCachedReports(userId, reports, indexedDBImpl = globalThis.indexedDB, now = Date.now()) {
  if (!userId || !Array.isArray(reports)) return

  const database = await openDatabase(indexedDBImpl)

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put({
      userId,
      reports: serializeValue(reports),
      cachedAt: now,
    })

    transaction.oncomplete = () => {
      database.close()
      resolve()
    }

    transaction.onerror = () => {
      database.close()
      reject(transaction.error || new Error('Unable to write cached reports'))
    }

    transaction.onabort = () => {
      database.close()
      reject(transaction.error || new Error('Report cache write was aborted'))
    }
  })
}
