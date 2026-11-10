import { AlertTriangle, Activity, ClipboardList } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DEPARTMENT_WORKLOAD_THRESHOLD, getActiveQueueCount, getDepartmentWorkload } from '@/utils/departmentWorkload'

export function DepartmentWorkloadMonitor({ complaints = [], loading = false }) {
  const workload = getDepartmentWorkload(complaints)
  const activeQueueCount = getActiveQueueCount(complaints)
  const overloadedDepartments = workload.filter((item) => item.isOverCapacity).length
  const maxCount = Math.max(...workload.map((item) => item.count), DEPARTMENT_WORKLOAD_THRESHOLD)

  return (
    <section className="mb-8 space-y-4" aria-label="Department workload and active queue">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card><CardContent className="flex items-center justify-between p-5">
          <div><p className="text-sm text-gray-500 dark:text-gray-400">Active Queue</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white" aria-live="polite">{loading ? '—' : activeQueueCount}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Pending, reopened, and in-progress tickets</p></div>
          <div className="rounded-xl bg-primary-50 p-3 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400"><ClipboardList className="h-6 w-6" aria-hidden="true" /></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center justify-between p-5">
          <div><p className="text-sm text-gray-500 dark:text-gray-400">Departments Over Capacity</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{loading ? '—' : overloadedDepartments}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">More than {DEPARTMENT_WORKLOAD_THRESHOLD} active tickets</p></div>
          <div className={'rounded-xl p-3 ' + (overloadedDepartments ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400')}>
            {overloadedDepartments ? <AlertTriangle className="h-6 w-6" aria-hidden="true" /> : <Activity className="h-6 w-6" aria-hidden="true" />}
          </div>
        </CardContent></Card>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div><CardTitle>Department Workload Distribution</CardTitle><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Live count of open tickets by department</p></div>
          <Badge variant="outline">Threshold: {DEPARTMENT_WORKLOAD_THRESHOLD}</Badge>
        </CardHeader>
        <CardContent>
          {loading ? <div className="py-10 text-center text-sm text-gray-500" role="status">Loading department workload…</div>
            : workload.length === 0 ? <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">No active tickets in the queue.</div>
              : <div className="space-y-5" role="list" aria-label="Active tickets by department">
                {workload.map(({ department, count, isOverCapacity }) => (
                  <div key={department} role="listitem">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{department}</span>
                      <span className="flex shrink-0 items-center gap-2 text-sm">
                        <span className={'font-semibold tabular-nums ' + (isOverCapacity ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300')}>{count} tickets</span>
                        {isOverCapacity && <Badge variant="destructive">Over capacity</Badge>}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800" role="progressbar" aria-label={department + ' active tickets'} aria-valuemin={0} aria-valuemax={maxCount} aria-valuenow={count}>
                      <div className={'h-full rounded-full transition-all ' + (isOverCapacity ? 'bg-red-500' : 'bg-primary-500')} style={{ width: ((count / maxCount) * 100) + '%' }} />
                    </div>
                  </div>
                ))}
              </div>}
          <p className="mt-5 text-xs text-gray-500 dark:text-gray-400">Active tickets include Pending, Reopened, and In Progress. Departments are flagged when the count exceeds {DEPARTMENT_WORKLOAD_THRESHOLD}.</p>
        </CardContent>
      </Card>
    </section>
  )
}
