import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bulkUpdateComplaintsStatus,
  bulkAssignComplaintsDepartment,
  executeBulkComplaintAction,
  normalizeComplaintsMap,
} from './bulkComplaints'

const runtime = vi.hoisted(() => ({
  batches: [],
  counter: 0,
}))

vi.mock('./services', () => ({ db: {} }))

vi.mock('firebase/firestore', () => ({
  doc: (ref, ...parts) => (parts.length ? parts.join('/') : `${ref}/${++runtime.counter}`),
  collection: (_db, name) => name,
  serverTimestamp: () => 'server-time',
  writeBatch: () => {
    const currentBatch = {
      updates: [],
      sets: [],
      committed: false,
      update: (ref, data) => currentBatch.updates.push({ ref, data }),
      set: (ref, data) => currentBatch.sets.push({ ref, data }),
      commit: async () => {
        currentBatch.committed = true
      },
    }
    runtime.batches.push(currentBatch)
    return currentBatch
  },
}))

describe('bulkComplaints service', () => {
  beforeEach(() => {
    runtime.batches = []
    runtime.counter = 0
    vi.clearAllMocks()
  })

  describe('normalizeComplaintsMap', () => {
    it('normalizes an array of complaints into an id-indexed map', () => {
      const list = [
        { id: 'c1', title: 'Pothole' },
        { id: 'c2', title: 'Streetlight' },
      ]
      const map = normalizeComplaintsMap(list)
      expect(map).toEqual({
        c1: { id: 'c1', title: 'Pothole' },
        c2: { id: 'c2', title: 'Streetlight' },
      })
    })

    it('returns empty object when passed null or undefined', () => {
      expect(normalizeComplaintsMap(null)).toEqual({})
      expect(normalizeComplaintsMap(undefined)).toEqual({})
    })
  })

  describe('bulkUpdateComplaintsStatus', () => {
    it('returns count 0 without creating batch when complaintIds is empty', async () => {
      const result = await bulkUpdateComplaintsStatus({
        complaintIds: [],
        newStatus: 'In Progress',
      })
      expect(result).toEqual({ success: true, count: 0 })
      expect(runtime.batches).toHaveLength(0)
    })

    it('throws error when newStatus is missing', async () => {
      await expect(
        bulkUpdateComplaintsStatus({
          complaintIds: ['c1'],
          newStatus: '',
        })
      ).rejects.toThrow('New status is required')
    })

    it('performs batched status update with atomic audit event creation', async () => {
      const complaints = [
        {
          id: 'c1',
          title: 'Damaged sidewalk',
          status: 'Pending',
          reportedBy: 'user-1',
          complaintId: 'CMP-2026-0001',
        },
        {
          id: 'c2',
          title: 'Water leak',
          status: 'Pending',
          reportedBy: 'user-2',
          complaintId: 'CMP-2026-0002',
        },
      ]

      const result = await bulkUpdateComplaintsStatus({
        complaintIds: ['c1', 'c2'],
        complaints,
        newStatus: 'In Progress',
        actorUid: 'admin-99',
        remarks: 'Triage team morning update',
      })

      expect(result).toEqual({ success: true, count: 2 })
      expect(runtime.batches).toHaveLength(1)

      const batch = runtime.batches[0]
      expect(batch.committed).toBe(true)

      // Verify complaint document updates
      expect(batch.updates).toHaveLength(2)
      expect(batch.updates[0]).toEqual({
        ref: 'issues/c1',
        data: {
          status: 'In Progress',
          updatedAt: 'server-time',
        },
      })
      expect(batch.updates[1]).toEqual({
        ref: 'issues/c2',
        data: {
          status: 'In Progress',
          updatedAt: 'server-time',
        },
      })

      // Verify atomic audit events in issues/{id}/events sub-collection
      const eventSets = batch.sets.filter((s) => s.ref.includes('/events/'))
      expect(eventSets).toHaveLength(2)

      expect(eventSets[0]).toEqual({
        ref: 'issues/c1/events/1',
        data: {
          timestamp: 'server-time',
          actorUid: 'admin-99',
          action: 'Status changed',
          previousStatus: 'Pending',
          newStatus: 'In Progress',
          remarks: 'Triage team morning update',
        },
      })

      expect(eventSets[1]).toEqual({
        ref: 'issues/c2/events/3',
        data: {
          timestamp: 'server-time',
          actorUid: 'admin-99',
          action: 'Status changed',
          previousStatus: 'Pending',
          newStatus: 'In Progress',
          remarks: 'Triage team morning update',
        },
      })

      // Verify notifications
      const notifSets = batch.sets.filter((s) => s.ref.includes('notifications/'))
      expect(notifSets).toHaveLength(2)
      expect(notifSets[0].data.recipientUid).toBe('user-1')
      expect(notifSets[0].data.issueId).toBe('CMP-2026-0001')
      expect(notifSets[0].data.message).toContain('In Progress')
    })

    it('sets resolvedAt timestamp when updating status to Resolved', async () => {
      const complaints = [{ id: 'c1', status: 'In Progress' }]

      await bulkUpdateComplaintsStatus({
        complaintIds: ['c1'],
        complaints,
        newStatus: 'Resolved',
        actorUid: 'admin-1',
      })

      const batch = runtime.batches[0]
      expect(batch.updates[0].data).toEqual({
        status: 'Resolved',
        updatedAt: 'server-time',
        resolvedAt: 'server-time',
      })
      const event = batch.sets.find((s) => s.ref.includes('/events/'))
      expect(event.data.newStatus).toBe('Resolved')
    })

    it('splits large updates into multiple batches to respect Firestore 500-op limit', async () => {
      const ids = Array.from({ length: 320 }, (_, i) => `complaint-${i}`)
      const complaints = ids.map((id) => ({ id, status: 'Pending' }))

      const result = await bulkUpdateComplaintsStatus({
        complaintIds: ids,
        complaints,
        newStatus: 'In Progress',
        actorUid: 'admin-1',
      })

      expect(result.count).toBe(320)
      // 320 items / 150 per chunk = 3 batches
      expect(runtime.batches).toHaveLength(3)
      expect(runtime.batches[0].committed).toBe(true)
      expect(runtime.batches[1].committed).toBe(true)
      expect(runtime.batches[2].committed).toBe(true)
      expect(runtime.batches[0].updates).toHaveLength(150)
      expect(runtime.batches[1].updates).toHaveLength(150)
      expect(runtime.batches[2].updates).toHaveLength(20)
    })
  })

  describe('bulkAssignComplaintsDepartment', () => {
    it('throws error when newDepartment is missing', async () => {
      await expect(
        bulkAssignComplaintsDepartment({
          complaintIds: ['c1'],
          newDepartment: '',
        })
      ).rejects.toThrow('New department is required')
    })

    it('performs batched department reassignment with atomic audit event creation', async () => {
      const complaints = [
        {
          id: 'c10',
          title: 'Clogged drain',
          status: 'In Progress',
          department: 'Roads',
          reportedBy: 'citizen-8',
          complaintId: 'CMP-2026-0010',
        },
      ]

      const result = await bulkAssignComplaintsDepartment({
        complaintIds: ['c10'],
        complaints,
        newDepartment: 'Sanitation',
        actorUid: 'admin-42',
      })

      expect(result).toEqual({ success: true, count: 1 })
      expect(runtime.batches).toHaveLength(1)

      const batch = runtime.batches[0]
      expect(batch.updates[0]).toEqual({
        ref: 'issues/c10',
        data: {
          department: 'Sanitation',
          updatedAt: 'server-time',
        },
      })

      const event = batch.sets.find((s) => s.ref.includes('/events/'))
      expect(event.data).toEqual({
        timestamp: 'server-time',
        actorUid: 'admin-42',
        action: 'Department assigned',
        previousStatus: 'In Progress',
        newStatus: 'In Progress',
        remarks: 'Bulk department reassignment to Sanitation',
      })

      const notif = batch.sets.find((s) => s.ref.includes('notifications/'))
      expect(notif.data.recipientUid).toBe('citizen-8')
      expect(notif.data.title).toBe('Department Assigned')
      expect(notif.data.message).toContain('Sanitation')
    })
  })

  describe('executeBulkComplaintAction dispatcher', () => {
    it('routes status action correctly', async () => {
      const result = await executeBulkComplaintAction({
        actionType: 'status',
        value: 'Resolved',
        complaintIds: ['c1'],
        complaints: [{ id: 'c1', status: 'In Progress' }],
        actorUid: 'admin-1',
      })
      expect(result.success).toBe(true)
      expect(runtime.batches[0].updates[0].data.status).toBe('Resolved')
    })

    it('routes department action correctly', async () => {
      const result = await executeBulkComplaintAction({
        actionType: 'department',
        value: 'Electricity',
        complaintIds: ['c2'],
        complaints: [{ id: 'c2', status: 'Pending' }],
        actorUid: 'admin-1',
      })
      expect(result.success).toBe(true)
      expect(runtime.batches[0].updates[0].data.department).toBe('Electricity')
    })

    it('throws error for unsupported action type', async () => {
      await expect(
        executeBulkComplaintAction({
          actionType: 'unsupported',
          value: 'test',
          complaintIds: ['c1'],
        })
      ).rejects.toThrow('Unsupported bulk action type')
    })
  })
})
