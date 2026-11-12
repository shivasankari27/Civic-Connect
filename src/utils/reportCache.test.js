import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  readCachedReports,
  REPORT_CACHE_TTL_MS,
  writeCachedReports,
} from './reportCache'

function createIndexedDBMock() {
  const records = new Map()
  let storeCreated = false

  const database = {
    objectStoreNames: {
      contains: () => storeCreated,
    },
    createObjectStore: () => {
      storeCreated = true
    },
    transaction: (_storeName, mode) => {
      const transaction = {
        objectStore: () => ({
          get: (key) => {
            const request = {}
            queueMicrotask(() => {
              request.result = records.get(key)
              request.onsuccess?.()
            })
            return request
          },
          put: (record) => {
            if (mode === 'readwrite') records.set(record.userId, record)
            queueMicrotask(() => transaction.oncomplete?.())
          },
        }),
      }
      return transaction
    },
    close: vi.fn(),
  }

  return {
    open: vi.fn(() => {
      const request = { result: database }
      queueMicrotask(() => {
        if (!storeCreated) request.onupgradeneeded?.()
        request.onsuccess?.()
      })
      return request
    }),
  }
}

describe('citizen report IndexedDB cache', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stores and reads reports separately for each citizen', async () => {
    const indexedDB = createIndexedDBMock()
    const reports = [{ id: 'issue-1', title: 'Streetlight outage' }]

    await writeCachedReports('citizen-1', reports, indexedDB, 1000)
    await writeCachedReports('citizen-2', [{ id: 'issue-2' }], indexedDB, 2000)

    await expect(readCachedReports('citizen-1', indexedDB, 3000)).resolves.toEqual({
      reports,
      cachedAt: 1000,
      isStale: false,
    })
  })

  it('marks entries stale after the ten-minute TTL without deleting the fallback data', async () => {
    const indexedDB = createIndexedDBMock()
    const reports = [{ id: 'issue-1' }]

    await writeCachedReports('citizen-1', reports, indexedDB, 5000)

    await expect(
      readCachedReports('citizen-1', indexedDB, 5000 + REPORT_CACHE_TTL_MS)
    ).resolves.toMatchObject({
      reports,
      cachedAt: 5000,
      isStale: true,
    })
  })

  it('preserves Firestore timestamps so cached report dates remain renderable', async () => {
    const indexedDB = createIndexedDBMock()
    const date = new Date('2026-11-12T10:00:00.000Z')
    const reports = [{ id: 'issue-1', createdAt: { toDate: () => date } }]

    await writeCachedReports('citizen-1', reports, indexedDB, 1000)
    const cached = await readCachedReports('citizen-1', indexedDB, 2000)

    expect(cached.reports[0].createdAt.toDate()).toEqual(date)
    expect(cached.reports[0].createdAt.toMillis()).toBe(date.getTime())
  })

  it('returns null when the citizen has no cached reports', async () => {
    await expect(
      readCachedReports('citizen-1', createIndexedDBMock())
    ).resolves.toBeNull()
  })

  it('does not access IndexedDB without a citizen ID', async () => {
    const indexedDB = createIndexedDBMock()

    await expect(readCachedReports('', indexedDB)).resolves.toBeNull()
    await expect(writeCachedReports('', [], indexedDB)).resolves.toBeUndefined()
    expect(indexedDB.open).not.toHaveBeenCalled()
  })

  it('rejects clearly when IndexedDB is unavailable', async () => {
    await expect(readCachedReports('citizen-1', null)).rejects.toThrow(
      'IndexedDB is not supported'
    )
  })
})
