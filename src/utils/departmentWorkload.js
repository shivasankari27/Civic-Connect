export const OPEN_TICKET_STATUSES = ['Pending', 'In Progress', 'Reopened']
export const DEPARTMENT_WORKLOAD_THRESHOLD = 20

export function getDepartmentWorkload(complaints = []) {
  const counts = new Map()

  for (const complaint of complaints) {
    if (!OPEN_TICKET_STATUSES.includes(complaint?.status)) continue
    if (typeof complaint.department !== 'string' || !complaint.department.trim()) continue

    const department = complaint.department.trim()
    counts.set(department, (counts.get(department) || 0) + 1)
  }

  return [...counts.entries()]
    .map(([department, count]) => ({
      department,
      count,
      isOverCapacity: count > DEPARTMENT_WORKLOAD_THRESHOLD,
    }))
    .sort((a, b) => b.count - a.count || a.department.localeCompare(b.department))
}
