import { useState, useMemo } from 'react'
import { CheckSquare, X, Building2, CheckCircle2, Clock, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { executeBulkComplaintAction, normalizeComplaintsMap } from '@/firebase/bulkComplaints'
import { getDisplayId } from '@/firebase/complaintId'

const departments = ['Roads', 'Sanitation', 'Electricity', 'Water', 'Public Safety']
const statuses = ['Pending', 'In Progress', 'Resolved', 'Rejected']

export function BulkActionsToolbar({
  selectedIds = [],
  complaints = [],
  onClearSelection,
  onSuccess,
  actorUid,
  className = '',
}) {
  const [pendingAction, setPendingAction] = useState(null)
  const [remarks, setRemarks] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const complaintMap = useMemo(() => normalizeComplaintsMap(complaints), [complaints])

  const selectedComplaints = useMemo(() => {
    return selectedIds.map((id) => complaintMap[id] || { id })
  }, [selectedIds, complaintMap])

  if (!selectedIds || selectedIds.length === 0) {
    return null
  }

  const handleOpenAction = (type, value) => {
    if (!value) return
    setRemarks('')
    setPendingAction({ type, value })
  }

  const handleCloseModal = () => {
    if (submitting) return
    setPendingAction(null)
    setRemarks('')
  }

  const handleConfirm = async () => {
    if (!pendingAction) return
    setSubmitting(true)
    try {
      await executeBulkComplaintAction({
        actionType: pendingAction.type,
        value: pendingAction.value,
        complaintIds: selectedIds,
        complaints,
        actorUid,
        remarks: remarks.trim(),
      })

      const count = selectedIds.length
      if (pendingAction.type === 'status') {
        toast.success(`Status updated to "${pendingAction.value}" for ${count} report${count === 1 ? '' : 's'}`)
      } else {
        toast.success(`Assigned ${count} report${count === 1 ? '' : 's'} to "${pendingAction.value}"`)
      }

      setPendingAction(null)
      setRemarks('')
      onSuccess?.()
      onClearSelection?.()
    } catch (err) {
      console.error('Bulk action error:', err)
      toast.error('Failed to perform bulk update. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const count = selectedIds.length

  return (
    <>
      <div
        role="region"
        aria-label="Bulk actions toolbar"
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-4xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl rounded-2xl p-3 sm:px-5 sm:py-3.5 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200 ${className}`}
      >
        {/* Selection Count and Clear */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-950 text-primary-600 dark:text-primary-400">
            <CheckSquare className="h-4 w-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {count} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              className="h-7 px-2 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white"
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Deselect
            </Button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Mark In Progress */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => handleOpenAction('status', 'In Progress')}
            aria-label="Bulk mark In Progress"
          >
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            <span className="hidden sm:inline">Mark</span> In Progress
          </Button>

          {/* Quick Mark Resolved */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => handleOpenAction('status', 'Resolved')}
            aria-label="Bulk mark Resolved"
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span className="hidden sm:inline">Mark</span> Resolved
          </Button>

          {/* More Statuses Dropdown */}
          <Select onValueChange={(val) => handleOpenAction('status', val)}>
            <SelectTrigger className="h-8 w-32 text-xs" aria-label="Bulk status update">
              <SelectValue placeholder="Set Status" />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((st) => (
                <SelectItem key={st} value={st}>
                  {st}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Department Dropdown */}
          <Select onValueChange={(val) => handleOpenAction('department', val)}>
            <SelectTrigger className="h-8 w-44 text-xs" aria-label="Bulk assign department">
              <Building2 className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
              <SelectValue placeholder="Assign Department" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((dept) => (
                <SelectItem key={dept} value={dept}>
                  {dept}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Confirmation Modal */}
      <Dialog open={Boolean(pendingAction)} onOpenChange={(open) => !open && handleCloseModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingAction?.type === 'status'
                ? `Confirm Bulk Status Update`
                : `Confirm Department Assignment`}
            </DialogTitle>
            <DialogDescription>
              {pendingAction?.type === 'status' ? (
                <span>
                  Update status to{' '}
                  <strong className="text-gray-900 dark:text-white font-semibold">
                    "{pendingAction?.value}"
                  </strong>{' '}
                  for{' '}
                  <strong className="text-gray-900 dark:text-white font-semibold">
                    {count}
                  </strong>{' '}
                  selected {count === 1 ? 'complaint' : 'complaints'}?
                </span>
              ) : (
                <span>
                  Assign{' '}
                  <strong className="text-gray-900 dark:text-white font-semibold">
                    {count}
                  </strong>{' '}
                  selected {count === 1 ? 'complaint' : 'complaints'} to the{' '}
                  <strong className="text-gray-900 dark:text-white font-semibold">
                    "{pendingAction?.value}"
                  </strong>{' '}
                  department?
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Selected items preview */}
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 p-3 max-h-48 overflow-y-auto space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Affected Complaints ({count})
              </p>
              {selectedComplaints.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center justify-between text-xs py-1">
                  <div className="min-w-0 flex-1 pr-2">
                    <span className="font-mono font-medium text-primary-600 dark:text-primary-400 mr-2">
                      {getDisplayId(c)}
                    </span>
                    <span className="text-gray-700 dark:text-gray-300 truncate">
                      {c.title || 'Untitled Complaint'}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {pendingAction?.type === 'status' ? c.status || 'Pending' : c.department || 'Unassigned'}
                  </Badge>
                </div>
              ))}
              {count > 5 && (
                <p className="text-xs text-gray-400 italic pt-1">
                  ... and {count - 5} more complaint{count - 5 === 1 ? '' : 's'}
                </p>
              )}
            </div>

            {/* Optional remarks */}
            <div className="space-y-1.5">
              <Label htmlFor="bulk-remarks" className="text-xs font-medium">
                Audit Event Remarks <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <Input
                id="bulk-remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder={
                  pendingAction?.type === 'status'
                    ? `e.g. Bulk updated to ${pendingAction?.value} during triage`
                    : `e.g. Bulk reassigned to ${pendingAction?.value}`
                }
                className="text-xs h-9"
                disabled={submitting}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={handleCloseModal}
              disabled={submitting}
              type="button"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={submitting}
              className="gap-1.5"
              type="button"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Applying...' : 'Confirm & Apply'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
