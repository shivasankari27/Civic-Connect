import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flag, Shield, BarChart3, Users, Clock, ArrowRight, Star, AlertTriangle } from 'lucide-react'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '@/firebase/services'
import { useAuth } from '@/hooks/useAuth'
import { getDisplayId } from '@/firebase/complaintId'
import { isSlaBreached } from '@/utils/sla'
import { SlaBadge } from '@/components/common/SlaBadge'
import { PageHeader } from '@/components/common/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BulkActionsToolbar } from '@/components/admin/BulkActionsToolbar'
import { DepartmentWorkloadMonitor } from '@/components/admin/DepartmentWorkloadMonitor'

const ComplaintsMap = lazy(() =>
  import('@/components/common/ComplaintsMap').then((m) => ({ default: m.ComplaintsMap }))
)

const statusVariant = {
  Pending: 'destructive',
  'In Progress': 'warning',
  Resolved: 'success',
  Rejected: 'secondary',
  Reopened: 'warning',
}

export function AdminDashboardPage() {
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [slaFilter, setSlaFilter] = useState('all')
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedIds, setSelectedIds] = useState([])
  const selectAllRef = useRef(null)
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const q = query(collection(db, 'issues'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        setComplaints(list)
        setLoading(false)
      },
      (err) => {
        console.error('AdminDashboard Firestore error:', err)
        setLoading(false)
      }
    )
    return unsub
  }, [])

  const stats = useMemo(() => {
    const total = complaints.length
    let pending = 0, inProgress = 0, resolved = 0, breached = 0
    let totalRating = 0, ratedCount = 0
    const uniqueUsers = new Set()
    for (const c of complaints) {
      if (c.status === 'Pending' || c.status === 'Reopened') pending++
      else if (c.status === 'In Progress') inProgress++
      else if (c.status === 'Resolved') resolved++
      if (isSlaBreached(c)) breached++
      if (c.reportedBy) uniqueUsers.add(c.reportedBy)
      if (c.feedback?.rating && typeof c.feedback.rating === 'number') {
        totalRating += c.feedback.rating
        ratedCount++
      }
    }
    const avgRating = ratedCount > 0 ? (totalRating / ratedCount).toFixed(1) : null
    return {
      total,
      pending,
      inProgress,
      resolved,
      breached,
      activeCitizens: uniqueUsers.size,
      avgRating,
      ratedCount,
    }
  }, [complaints])

  const filteredReports = useMemo(() => {
    if (slaFilter === 'breached') {
      return complaints.filter((c) => isSlaBreached(c))
    }
    return complaints
  }, [complaints, slaFilter])

  const recentReports = filteredReports.slice(0, 5)
  const displayedComplaints = recentReports

  const isAllSelected = useMemo(() => {
    if (displayedComplaints.length === 0) return false
    return displayedComplaints.every((r) => selectedIds.includes(r.id))
  }, [displayedComplaints, selectedIds])

  const isIndeterminate = useMemo(() => {
    const count = displayedComplaints.filter((r) => selectedIds.includes(r.id)).length
    return count > 0 && count < displayedComplaints.length
  }, [displayedComplaints, selectedIds])

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isIndeterminate
    }
  }, [isIndeterminate])

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      const displayedIdSet = new Set(displayedComplaints.map((r) => r.id))
      setSelectedIds((prev) => prev.filter((id) => !displayedIdSet.has(id)))
    } else {
      const ids = displayedComplaints.map((r) => r.id)
      setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])))
    }
  }

  const handleToggleSelect = (id, e) => {
    e.stopPropagation()
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const statCards = [
    { label: 'Total Complaints', value: stats.total, icon: Flag, color: 'text-primary-600 bg-primary-50 dark:bg-primary-900/30' },
    { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-red-600 bg-red-50 dark:bg-red-900/30' },
    { label: 'In Progress', value: stats.inProgress, icon: BarChart3, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Resolved', value: stats.resolved, icon: Shield, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30' },
  ]

  return (
    <div>
      <PageHeader
        title="Admin Dashboard"
        description="Overview of all civic reports"
      />

      {/* Admin Dashboard Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 gap-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`py-2 px-4 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('map')}
          className={`py-2 px-4 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'map'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          GIS Map
        </button>
      </div>

      {activeTab === 'map' ? (
        <Suspense
          fallback={
            <div className="h-96 rounded-xl border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-500">
              Loading map...
            </div>
          }
        >
          <ComplaintsMap complaints={complaints} isAdmin={true} />
        </Suspense>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            {statCards.map((stat) => (
              <Card key={stat.label}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                        {loading ? '-' : stat.value}
                      </p>
                    </div>
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.color}`}>
                      <stat.icon className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

      <DepartmentWorkloadMonitor complaints={complaints} loading={loading} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4">
            <CardTitle>Recent Reports</CardTitle>
            <div className="flex items-center gap-1.5" role="group" aria-label="Filter reports by SLA status">
              <Button
                variant={slaFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setSlaFilter('all')}
              >
                All
              </Button>
              <Button
                variant={slaFilter === 'breached' ? 'destructive' : 'outline'}
                size="sm"
                className="h-7 text-xs px-2.5 gap-1"
                onClick={() => setSlaFilter('breached')}
              >
                Breached SLA
                {stats.breached > 0 && (
                  <span className="ml-1 rounded-full bg-red-600/20 dark:bg-red-400/20 px-1.5 py-0.2 text-[10px] font-semibold">
                    {stats.breached}
                  </span>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
              </div>
            ) : recentReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Flag className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {slaFilter === 'breached' ? 'No reports have breached SLA deadlines.' : 'No reports submitted yet.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 mb-1 border-b border-gray-100 dark:border-gray-800 text-xs text-gray-500">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      aria-label="Select all complaints"
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                      checked={isAllSelected}
                      ref={selectAllRef}
                      onChange={handleToggleSelectAll}
                    />
                    <span>Select All ({displayedComplaints.length})</span>
                  </label>
                  {selectedIds.length > 0 && (
                    <span className="font-medium text-primary-600 dark:text-primary-400">
                      {selectedIds.length} selected
                    </span>
                  )}
                </div>
                {recentReports.map((r) => (
                  <div
                    key={r.id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                      selectedIds.includes(r.id)
                        ? 'border-primary-500 bg-primary-50/40 dark:bg-primary-950/30'
                        : 'border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                    onClick={() => navigate(`/admin/reports/${r.id}`)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        aria-label={`Select complaint ${getDisplayId(r)}`}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer shrink-0"
                        checked={selectedIds.includes(r.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleToggleSelect(r.id, e)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-mono text-gray-400 dark:text-gray-500">{getDisplayId(r)}</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate mt-0.5">{r.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {r.category} &middot; {r.department || 'Unassigned'} &middot; {r.createdAt?.toDate?.().toLocaleDateString() || '-'}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0 ml-3 justify-end">
                      <SlaBadge complaint={r} />
                      <Badge variant={statusVariant[r.status] || 'default'} className="capitalize">{r.status}</Badge>
                    </div>
                  </div>
                ))}
                <Button variant="ghost" size="sm" className="w-full gap-2 text-primary-600" onClick={() => navigate('/admin/reports')}>
                  View All Reports <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Stats</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-4">
                {[
                  { icon: Users, label: 'Active Citizens', desc: 'Unique complainants', value: stats.activeCitizens, bg: 'bg-gray-50 dark:bg-gray-800/50', iconColor: 'text-primary-600 dark:text-primary-400' },
                  { icon: Star, label: 'Citizen Satisfaction', desc: stats.ratedCount ? `${stats.ratedCount} review${stats.ratedCount === 1 ? '' : 's'}` : 'No ratings yet', value: stats.avgRating ? `${stats.avgRating} ★` : '-', bg: 'bg-amber-50 dark:bg-amber-900/20', iconColor: 'text-amber-500 fill-amber-500' },
                  {
                    icon: AlertTriangle,
                    label: 'Breached SLA',
                    desc: 'Exceeded resolution target (click to filter)',
                    value: stats.breached,
                    bg: stats.breached > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-800/50',
                    iconColor: stats.breached > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400',
                    onClick: () => setSlaFilter((prev) => (prev === 'breached' ? 'all' : 'breached')),
                  },
                  { icon: Clock, label: 'Pending', desc: 'Awaiting action', value: stats.pending, bg: 'bg-red-50 dark:bg-red-900/20', iconColor: 'text-red-600 dark:text-red-400' },
                  { icon: BarChart3, label: 'In Progress', desc: 'Being addressed', value: stats.inProgress, bg: 'bg-amber-50 dark:bg-amber-900/20', iconColor: 'text-amber-600 dark:text-amber-400' },
                  { icon: Shield, label: 'Resolved', desc: 'Completed', value: stats.resolved, bg: 'bg-emerald-50 dark:bg-emerald-900/20', iconColor: 'text-emerald-600 dark:text-emerald-400' },
                ].map((s) => (
                  <div
                    key={s.label}
                    className={`flex items-center justify-between p-4 rounded-lg ${s.bg} ${s.onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
                    onClick={s.onClick}
                  >
                    <div className="flex items-center gap-3">
                      <s.icon className={`h-5 w-5 ${s.iconColor}`} />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{s.label}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{s.desc}</p>
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )}
      <BulkActionsToolbar
        selectedIds={selectedIds}
        complaints={complaints}
        onClearSelection={() => setSelectedIds([])}
        onSuccess={() => setSelectedIds([])}
        actorUid={user?.uid}
      />
    </div>
  )
}
