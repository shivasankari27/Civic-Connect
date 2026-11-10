import { describe, expect, it } from 'vitest'
import { DEPARTMENT_WORKLOAD_THRESHOLD, getActiveQueueCount, getDepartmentWorkload } from './departmentWorkload'

describe('getDepartmentWorkload', () => {
  it('groups active tickets by department', () => {
    expect(getDepartmentWorkload([
      { department: 'Roads', status: 'Pending' },
      { department: 'Roads', status: 'In Progress' },
      { department: 'Water', status: 'Reopened' },
    ])).toEqual([
      { department: 'Roads', count: 2, isOverCapacity: false },
      { department: 'Water', count: 1, isOverCapacity: false },
    ])
  })

  it('excludes resolved and rejected tickets', () => {
    expect(getDepartmentWorkload([
      { department: 'Roads', status: 'Resolved' },
      { department: 'Roads', status: 'Rejected' },
    ])).toEqual([])
  })

  it('groups tickets without a department as Unassigned', () => {
    expect(getDepartmentWorkload([
      { department: '', status: 'Pending' },
      { status: 'In Progress' },
    ])).toEqual([{ department: 'Unassigned', count: 2, isOverCapacity: false }])
  })

  it('flags only departments with more than 20 active tickets', () => {
    const complaints = [
      ...Array.from({ length: DEPARTMENT_WORKLOAD_THRESHOLD }, () => ({ department: 'Roads', status: 'Pending' })),
      ...Array.from({ length: DEPARTMENT_WORKLOAD_THRESHOLD + 1 }, () => ({ department: 'Water', status: 'In Progress' })),
    ]
    expect(getDepartmentWorkload(complaints)).toEqual([
      { department: 'Water', count: 21, isOverCapacity: true },
      { department: 'Roads', count: 20, isOverCapacity: false },
    ])
  })

  it('handles an empty queue', () => {
    expect(getDepartmentWorkload()).toEqual([])
    expect(getDepartmentWorkload([])).toEqual([])
  })
})

describe('getActiveQueueCount', () => {
  it('counts Pending, Reopened, and In Progress tickets only', () => {
    expect(getActiveQueueCount([
      { status: 'Pending' }, { status: 'In Progress' }, { status: 'Reopened' },
      { status: 'Resolved' }, { status: 'Rejected' },
    ])).toBe(3)
  })

  it('returns zero for an empty queue', () => {
    expect(getActiveQueueCount([])).toBe(0)
  })
})
