import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useOfflineSync } from './useOfflineSync'
import { createTransactionStore } from '@/firebase/testSupport/transactionStore'

const runtime = vi.hoisted(() => ({ auth: { currentUser: null }, store: null, pending: null, id: 0, cleanupError: null }))
vi.mock('react', () => ({ useCallback: callback => callback, useEffect() {}, useRef: current => ({ current }) }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: runtime.auth.currentUser }) }))
vi.mock('@/firebase/services', () => ({ db: {}, auth: runtime.auth }))
vi.mock('@/utils/offlineQueue', () => ({
  getPendingComplaints: async uid => structuredClone([...runtime.pending.values()].filter(item => item.userId === uid)),
  removeOfflineComplaint: async id => {
    if (runtime.cleanupError) throw runtime.cleanupError
    runtime.pending.delete(id)
  },
}))
vi.mock('firebase/firestore', () => ({
  doc: (ref, ...parts) => parts.length ? parts.join('/') : `${ref}/${++runtime.id}`,
  collection: (_db, name) => name,
  documentId: () => '__name__',
  orderBy: () => [],
  startAt: value => ['startAt', value],
  limit: () => [],
  where: (field, _op, value) => [field, value],
  query: (name, ...filters) => ({ name, filters: Object.fromEntries(filters) }),
  getDocsFromServer: async ({ name, filters }) => ({
    docs: runtime.store.read(`${name}/${filters.startAt}`)?.reportedBy === filters.reportedBy
      ? [{ id: filters.startAt }] : [],
  }),
  getDocFromServer: async key => ({ exists: () => runtime.store.read(key) !== undefined }),
  runTransaction: (...args) => runtime.store.runTransaction(...args),
  serverTimestamp: () => 'server-time',
}))

const entry = { localId: 'queued-1', userId: 'citizen-1', title: 'Lamp', description: 'Out', category: 'Lights', address: 'Market Road' }
const issue = `issues/${entry.localId}`
const receipt = `users/${entry.userId}/offlineComplaintReceipts/${entry.localId}`
const counter = 'counters/issueCounter'
const eventCount = () => runtime.store.history.filter(({ key }) => key.startsWith(`${issue}/events/`)).length
const notices = () => runtime.store.history.filter(({ key }) => key.startsWith('notifications/')).map(({ data }) => data)

beforeEach(() => {
  vi.stubGlobal('navigator', { onLine: true })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  runtime.auth.currentUser = { uid: entry.userId }
  runtime.store = createTransactionStore()
  runtime.pending = new Map([[entry.localId, entry]])
  runtime.cleanupError = null
  runtime.id = 0
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('commits one complaint, ticket, event and notice when two tabs sync the same queue item', async () => {
  await Promise.all([useOfflineSync().syncComplaints(), useOfflineSync().syncComplaints()])
  const saved = runtime.store.read(issue)
  expect(runtime.store.conflicts).toBe(1)
  expect(runtime.store.read(counter)).toEqual({ lastNumber: 1 })
  expect(saved).toMatchObject({ title: 'Lamp', reportedBy: entry.userId, status: 'Pending' })
  expect(eventCount()).toBe(1)
  expect(notices()).toEqual([expect.objectContaining({ issueId: saved.complaintId, type: 'new_complaint' })])
  expect(runtime.store.read(receipt)).toEqual({ createdAt: 'server-time' })
  expect(runtime.pending.size).toBe(0)
})

it('retries cleanup after a committed upload without replacing edits or creating another ticket', async () => {
  runtime.cleanupError = new Error('IndexedDB cleanup failed')
  await useOfflineSync().syncComplaints()
  expect(runtime.pending.size).toBe(1)
  const edited = { ...runtime.store.read(issue), title: 'Edited online', department: 'Electricity' }
  runtime.store.write(issue, edited)
  const writes = runtime.store.history.length

  runtime.cleanupError = null
  await useOfflineSync().syncComplaints()
  expect(runtime.store.read(issue)).toEqual(edited)
  expect(runtime.store.history).toHaveLength(writes)
  expect(runtime.pending.size).toBe(0)
})

it('does not recreate a complaint deleted after an upload with failed cleanup', async () => {
  runtime.cleanupError = new Error('IndexedDB cleanup failed')
  await useOfflineSync().syncComplaints()
  runtime.store.remove(issue)
  runtime.cleanupError = null
  await useOfflineSync().syncComplaints()
  expect(runtime.store.read(issue)).toBeUndefined()
  expect(runtime.store.read(counter)).toEqual({ lastNumber: 1 })
  expect(runtime.pending.size).toBe(0)
})

it('records an earlier upload without touching its fields, counter, event history or notices', async () => {
  const legacy = { reportedBy: entry.userId, complaintId: 'CMP-2026-0042', status: 'Resolved', title: 'Updated online' }
  runtime.store = createTransactionStore({ [issue]: legacy })
  await useOfflineSync().syncComplaints()
  expect(runtime.store.read(issue)).toEqual(legacy)
  expect(runtime.store.history).toEqual([{ key: receipt, data: { createdAt: 'server-time' } }])
  expect(runtime.pending.size).toBe(0)
})

it.each(['unavailable', 'permission-denied'])('retains the queue item and rolls back all writes on %s', async code => {
  runtime.store.failCommit = Object.assign(new Error(code), { code })
  await useOfflineSync().syncComplaints()
  expect(runtime.store.history).toEqual([])
  expect(runtime.pending.size).toBe(1)
  runtime.store.failCommit = null
  await useOfflineSync().syncComplaints()
  expect(runtime.store.read(counter)).toEqual({ lastNumber: 1 })
  expect(eventCount()).toBe(1)
  expect(notices()).toHaveLength(1)
  expect(runtime.pending.size).toBe(0)
})

it('preserves the queue item if the sign-in session changes before a transaction retry', async () => {
  runtime.store.beforeCommit = () => {
    runtime.store.write(counter, { lastNumber: 10 })
    runtime.auth.currentUser = { uid: entry.userId }
  }
  await useOfflineSync().syncComplaints()
  expect(runtime.store.conflicts).toBe(1)
  expect(runtime.store.read(issue)).toBeUndefined()
  expect(runtime.store.read(receipt)).toBeUndefined()
  expect(runtime.pending.size).toBe(1)
})
