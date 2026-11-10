export const ACTIVE_TICKET_STATUSES = ['Pending', 'In Progress', 'Reopened']
export const DEPARTMENT_WORKLOAD_THRESHOLD = 20

/**
 * Groups active tickets by department for the admin workload monitor.
 * Resolved and rejected tickets are excluded from the active queue.
 */
export function getDepartmentWorkload(complaints = []) {
  const workload = new Map()
  for (const complaint of complaints) {
    if (!ACTIVE_TICKET_STATUSES.includes(complaint?.status)) continue
    const department = typeof complaint.department === 'string' && complaint.department.trim()
      ? complaint.department.trim()
      : 'Unassigned'
    workload.set(department, (workload.get(department) || 0) + 1)
  }
  return [...workload.entries()]
    .map(([department, count]) => ({ department, count, isOverCapacity: count > DEPARTMENT_WORKLOAD_THRESHOLD }))
    .sort((a, b) => b.count - a.count || a.department.localeCompare(b.department))
}

export function getActiveQueueCount(complaints = []) {
  return complaints.filter((complaint) => ACTIVE_TICKET_STATUSES.includes(complaint?.status)).length
}
