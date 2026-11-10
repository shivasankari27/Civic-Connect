import { describe, expect, it } from 'vitest'
import { getDepartmentWorkload } from './departmentWorkload'

describe('getDepartmentWorkload', () => {
  it('counts open tickets for each assigned department', () => {
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

  it('excludes tickets without an assigned department', () => {
    expect(getDepartmentWorkload([
      { department: '', status: 'Pending' },
      { status: 'In Progress' },
      { department: '   ', status: 'Reopened' },
    ])).toEqual([])
  })

  it('highlights only departments with more than 20 open tickets', () => {
    const complaints = [
      ...Array.from({ length: 20 }, () => ({ department: 'Roads', status: 'Pending' })),
      ...Array.from({ length: 21 }, () => ({ department: 'Water', status: 'In Progress' })),
    ]

    expect(getDepartmentWorkload(complaints)).toEqual([
      { department: 'Water', count: 21, isOverCapacity: true },
      { department: 'Roads', count: 20, isOverCapacity: false },
    ])
  })

  it('returns an empty list when there are no assigned open tickets', () => {
    expect(getDepartmentWorkload()).toEqual([])
    expect(getDepartmentWorkload([])).toEqual([])
  })
})
