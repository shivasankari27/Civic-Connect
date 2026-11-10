import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BulkActionsToolbar } from '@/components/admin/BulkActionsToolbar'
import { AdminDashboardPage } from './AdminDashboardPage'
import { Dialog } from '@/components/ui/dialog'
import { executeBulkComplaintAction } from '@/firebase/bulkComplaints'
import toast from 'react-hot-toast'

const runtime = vi.hoisted(() => ({
  values: [],
  cursor: 0,
  listeners: [],
  navigate: vi.fn(),
  user: { uid: 'admin-123' },
}))

vi.mock('react', async (original) => ({
  ...(await original()),
  useState(initial) {
    const index = runtime.cursor++
    if (!(index in runtime.values)) runtime.values[index] = initial
    return [
      runtime.values[index],
      (value) => {
        runtime.values[index] =
          typeof value === 'function' ? value(runtime.values[index]) : value
      },
    ]
  },
  useRef(initial) {
    const index = runtime.cursor++
    return (runtime.values[index] ||= { current: initial })
  },
  useEffect(effect) {
    effect()
  },
  useMemo: (factory) => factory(),
  useCallback: (cb) => cb,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => runtime.navigate,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: runtime.user }),
}))

vi.mock('@/firebase/services', () => ({
  db: {},
}))

vi.mock('@/firebase/bulkComplaints', () => ({
  executeBulkComplaintAction: vi.fn(),
  normalizeComplaintsMap: (complaints) => {
    if (!complaints) return {}
    if (Array.isArray(complaints)) {
      return Object.fromEntries(complaints.map((c) => [c.id, c]))
    }
    return complaints
  },
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => name,
  query: (col) => col,
  orderBy: () => ({}),
  onSnapshot: (_q, callback) => {
    runtime.listeners.push(callback)
    return vi.fn()
  },
}))

function nodes(element) {
  if (!element) return []
  if (Array.isArray(element)) return element.flatMap(nodes)
  return element?.props ? [element, ...nodes(element.props.children)] : []
}

function text(element) {
  if (element == null) return ''
  if (Array.isArray(element)) return element.map(text).join('')
  if (typeof element === 'string' || typeof element === 'number') return String(element)
  return element?.props ? text(element.props.children) : ''
}

describe('Bulk Actions & Selection on Admin Dashboard', () => {
  beforeEach(() => {
    runtime.values = []
    runtime.cursor = 0
    runtime.listeners = []
    vi.clearAllMocks()
  })

  describe('BulkActionsToolbar Component', () => {
    const mockComplaints = [
      { id: 'c1', title: 'Pothole on 5th', status: 'Pending', department: 'Roads' },
      { id: 'c2', title: 'Streetlight dark', status: 'Pending', department: 'Electricity' },
      { id: 'c3', title: 'Garbage dump', status: 'In Progress', department: 'Sanitation' },
    ]

    it('returns null when selectedIds is empty', () => {
      runtime.cursor = 0
      const tree = BulkActionsToolbar({
        selectedIds: [],
        complaints: mockComplaints,
      })
      expect(tree).toBeNull()
    })

    it('renders selected count and action controls when items are selected', () => {
      runtime.cursor = 0
      const onClear = vi.fn()
      const tree = BulkActionsToolbar({
        selectedIds: ['c1', 'c2'],
        complaints: mockComplaints,
        onClearSelection: onClear,
      })

      const allNodes = nodes(tree)
      const toolbarText = text(tree)
      expect(toolbarText).toContain('2 selected')
      expect(toolbarText).toContain('Mark In Progress')
      expect(toolbarText).toContain('Mark Resolved')

      const deselectBtn = allNodes.find(
        (n) => n.props?.['aria-label'] === 'Clear selection'
      )
      expect(deselectBtn).toBeDefined()
      deselectBtn.props.onClick()
      expect(onClear).toHaveBeenCalled()
    })

    it('opens confirmation modal when clicking quick action "Mark In Progress"', () => {
      runtime.cursor = 0
      const tree = BulkActionsToolbar({
        selectedIds: ['c1', 'c2'],
        complaints: mockComplaints,
      })

      const markBtn = nodes(tree).find(
        (n) => n.props?.['aria-label'] === 'Bulk mark In Progress'
      )
      expect(markBtn).toBeDefined()

      // Click "Mark In Progress"
      markBtn.props.onClick()

      // Re-render
      runtime.cursor = 0
      const updatedTree = BulkActionsToolbar({
        selectedIds: ['c1', 'c2'],
        complaints: mockComplaints,
      })

      const dialogNode = nodes(updatedTree).find((n) => n.type === Dialog)
      expect(dialogNode).toBeDefined()
      expect(dialogNode.props.open).toBe(true)

      const dialogText = text(updatedTree)
      expect(dialogText).toContain('Confirm Bulk Status Update')
      expect(dialogText).toContain('In Progress')
      expect(dialogText).toContain('Affected Complaints (2)')
      expect(dialogText).toContain('Pothole on 5th')
      expect(dialogText).toContain('Streetlight dark')
    })

    it('closes modal when Cancel button is clicked', () => {
      runtime.cursor = 0
      // Initialize with pending action already set
      runtime.values[0] = { type: 'status', value: 'Resolved' }

      const tree = BulkActionsToolbar({
        selectedIds: ['c1'],
        complaints: mockComplaints,
      })

      const cancelBtn = nodes(tree).find(
        (n) => n.props?.children === 'Cancel' && n.props?.onClick
      )
      expect(cancelBtn).toBeDefined()

      cancelBtn.props.onClick()

      // pendingAction was cleared to null
      expect(runtime.values[0]).toBeNull()
    })

    it('executes bulk action on confirm, calls onSuccess & onClearSelection, and toasts success', async () => {
      runtime.cursor = 0
      runtime.values[0] = { type: 'status', value: 'In Progress' }
      runtime.values[1] = 'Audit note' // remarks
      runtime.values[2] = false // submitting

      executeBulkComplaintAction.mockResolvedValue({ success: true, count: 2 })

      const onClear = vi.fn()
      const onSuccess = vi.fn()

      const tree = BulkActionsToolbar({
        selectedIds: ['c1', 'c2'],
        complaints: mockComplaints,
        onClearSelection: onClear,
        onSuccess,
        actorUid: 'admin-1',
      })

      const confirmBtn = nodes(tree).find(
        (n) => n.props?.onClick && text(n).includes('Confirm & Apply')
      )
      expect(confirmBtn).toBeDefined()

      await confirmBtn.props.onClick()

      expect(executeBulkComplaintAction).toHaveBeenCalledWith({
        actionType: 'status',
        value: 'In Progress',
        complaintIds: ['c1', 'c2'],
        complaints: mockComplaints,
        actorUid: 'admin-1',
        remarks: 'Audit note',
      })
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('Status updated to "In Progress" for 2 reports')
      )
      expect(onSuccess).toHaveBeenCalled()
      expect(onClear).toHaveBeenCalled()
      expect(runtime.values[0]).toBeNull()
    })

    it('handles execution failure gracefully with error toast', async () => {
      runtime.cursor = 0
      runtime.values[0] = { type: 'department', value: 'Sanitation' }
      runtime.values[1] = ''
      runtime.values[2] = false

      executeBulkComplaintAction.mockRejectedValue(new Error('Network error'))

      const tree = BulkActionsToolbar({
        selectedIds: ['c1'],
        complaints: mockComplaints,
        actorUid: 'admin-1',
      })

      const confirmBtn = nodes(tree).find(
        (n) => n.props?.onClick && text(n).includes('Confirm & Apply')
      )

      await confirmBtn.props.onClick()

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to perform bulk update. Please try again.'
      )
    })
  })

  describe('AdminDashboardPage Checkbox Selection', () => {
    it('renders Select All checkbox and complaint checkboxes on Admin Dashboard', () => {
      runtime.cursor = 0
      AdminDashboardPage()

      // Feed snapshot of complaints to onSnapshot listener
      const snapshot = {
        docs: [
          {
            id: 'c1',
            data: () => ({
              title: 'First Report',
              status: 'Pending',
              category: 'Roads',
              createdAt: { toDate: () => new Date('2026-11-01') },
            }),
          },
          {
            id: 'c2',
            data: () => ({
              title: 'Second Report',
              status: 'In Progress',
              category: 'Water',
              createdAt: { toDate: () => new Date('2026-11-02') },
            }),
          },
        ],
      }

      runtime.listeners[0](snapshot)

      // Re-render with complaints loaded
      runtime.cursor = 0
      const loadedTree = AdminDashboardPage()

      const allNodes = nodes(loadedTree)

      // Find "Select All" checkbox
      const selectAll = allNodes.find(
        (n) => n.props?.['aria-label'] === 'Select all complaints'
      )
      expect(selectAll).toBeDefined()
      expect(selectAll.props.checked).toBe(false)

      // Find individual complaint checkboxes
      const itemCheckboxes = allNodes.filter(
        (n) => n.props?.['aria-label']?.startsWith('Select complaint')
      )
      expect(itemCheckboxes).toHaveLength(2)

      // Click Select All
      selectAll.props.onChange()

      // Re-render
      runtime.cursor = 0
      const afterSelectAllTree = AdminDashboardPage()
      const afterNodes = nodes(afterSelectAllTree)

      const updatedSelectAll = afterNodes.find(
        (n) => n.props?.['aria-label'] === 'Select all complaints'
      )
      expect(updatedSelectAll.props.checked).toBe(true)

      // Toolbar is rendered with 2 selected
      expect(text(afterSelectAllTree)).toContain('2 selected')
    })

    it('stopping propagation on checkbox click avoids triggering complaint card navigation', () => {
      runtime.cursor = 0
      const snapshot = {
        docs: [
          {
            id: 'c1',
            data: () => ({
              title: 'Single Report',
              status: 'Pending',
              category: 'Roads',
            }),
          },
        ],
      }
      AdminDashboardPage()
      runtime.listeners[0](snapshot)

      runtime.cursor = 0
      const tree = AdminDashboardPage()
      const itemCheckbox = nodes(tree).find(
        (n) => n.props?.['aria-label']?.startsWith('Select complaint')
      )

      const stopPropagation = vi.fn()
      itemCheckbox.props.onClick({ stopPropagation })
      expect(stopPropagation).toHaveBeenCalled()
      expect(runtime.navigate).not.toHaveBeenCalled()
    })
  })
})
