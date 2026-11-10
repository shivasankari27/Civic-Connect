import { useState, useEffect, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle, Clock, Flag, Plus, FileWarning, Pencil } from 'lucide-react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/firebase/services'
import { isUnconfirmedEmpty } from '@/firebase/snapshot'
import { useAuth } from '@/hooks/useAuth'
import { sortByCreatedAtDesc } from '@/utils/sortByCreatedAtDesc'
import { ConnectionErrorBanner } from '@/components/common/ConnectionErrorBanner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import CommunityFeed from '@/components/citizen/CommunityFeed'

const ComplaintsMap = lazy(() =>
  import('@/components/common/ComplaintsMap').then((m) => ({ default: m.ComplaintsMap }))
)
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useComplaintEditSave } from '@/hooks/useComplaintEditSave'

const statusVariant = {
  Resolved: 'success',
  'In Progress': 'warning',
  Pending: 'destructive',
  Rejected: 'secondary',
  Reopened: 'warning',
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good Morning'
  if (hour < 17) return 'Good Afternoon'
  return 'Good Evening'
}

function useReducedMotionPreference() {
  const [shouldReduceMotion, setShouldReduceMotion] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleChange = (e) => setShouldReduceMotion(e.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return shouldReduceMotion
}

export function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotionPreference()
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [editTarget, setEditTarget] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'community'
  const { savingEdit, saveEdit } = useComplaintEditSave()

  useEffect(() => {
    if (!user) {
      console.log('Dashboard: user is null, skipping query')
      setLoading(false)
      return
    }
    console.log('Dashboard: fetching issues for uid:', user.uid)
    setLoading(true)
    setLoadError(false)
    // No orderBy here: where + orderBy on another field needs a composite index,
    // so the results are sorted on the client instead.
    const q = query(
      collection(db, 'issues'),
      where('reportedBy', '==', user.uid)
    )
    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (isUnconfirmedEmpty(snapshot)) {
          if (!navigator.onLine) {
            setLoadError(true)
            setLoading(false)
          }
          return
        }
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        console.log('Dashboard: received', list.length, 'documents')
        setComplaints(sortByCreatedAtDesc(list))
        setLoadError(false)
        setLoading(false)
      },
      (error) => {
        console.error('Dashboard Firestore error:', error)
        setLoadError(true)
        setLoading(false)
      }
    )
    return unsubscribe
  }, [user, reloadKey])

  const openEdit = (complaint) => {
    setEditTarget(complaint)
    setEditTitle(complaint.title)
    setEditDescription(complaint.description)
    setEditAddress(complaint.address)
  }

  const handleEditSave = () => saveEdit(editTarget, {
    title: editTitle, description: editDescription, address: editAddress,
  }, user?.uid, () => setEditTarget(null))

  const total = complaints.length
  const pending = complaints.filter((c) => c.status === 'Pending' || c.status === 'Reopened').length
  const inProgress = complaints.filter((c) => c.status === 'In Progress').length
  const resolved = complaints.filter((c) => c.status === 'Resolved').length
  const recent = complaints.slice(0, 5)

  const stats = [
    { label: 'Total Reports', value: total, icon: Flag, color: 'text-primary-600 bg-primary-50 dark:bg-primary-900/30' },
    { label: 'Resolved', value: resolved, icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'In Progress', value: inProgress, icon: Clock, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Pending', value: pending, icon: AlertTriangle, color: 'text-red-600 bg-red-50 dark:bg-red-900/30' },
  ]

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            {getGreeting()} <span className="wave inline-block">👋</span>
          </h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            Welcome back, {user?.name?.split(' ')[0] || 'User'}. Manage and track your civic complaints.
          </p>
        </div>
        <Button onClick={() => navigate('/report')} className="gap-2 shrink-0 h-11">
          <Plus className="h-5 w-5" /> New Complaint
        </Button>
      </div>
      {/* Dashboard Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 gap-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`py-2 px-4 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          My Overview
        </button>
        <button
          onClick={() => setActiveTab('community')}
          className={`py-2 px-4 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'community'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          Community Feed
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

      {activeTab === 'community' ? (
        <CommunityFeed />
      ) : activeTab === 'map' ? (
        <Suspense
          fallback={
            <div className="h-96 rounded-xl border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-500">
              Loading map...
            </div>
          }
        >
          <ComplaintsMap complaints={complaints} />
        </Suspense>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, delay: index * 0.05 }}
              >
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
                        {loading ? (
                          <Skeleton className="h-8 w-12 mt-1" />
                        ) : (
                          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{loadError ? '-' : stat.value}</p>
                        )}
                      </div>
                      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.color}`}>
                        <stat.icon className="h-6 w-6" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Reports</CardTitle>
            </CardHeader>
            <CardContent>
              {loadError ? (
                <ConnectionErrorBanner onRetry={() => setReloadKey((k) => k + 1)} />
              ) : loading ? (
                <div className="divide-y divide-gray-100 dark:divide-gray-800" aria-busy="true">
                  {Array.from({ length: 3 }, (_, i) => (
                    <div key={i} aria-hidden="true" className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : recent.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <FileWarning className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">No reports yet</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {recent.map((report) => (
                    <div key={report.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{report.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {report.createdAt?.toDate?.().toLocaleDateString() || ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusVariant[report.status] || 'default'} className="capitalize">
                          {report.status}
                        </Badge>
                        {report.status === 'Pending' && (
                          <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8" onClick={() => openEdit(report)}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open && !savingEdit) setEditTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Complaint</DialogTitle>
            <DialogDescription>Update the details of your pending complaint.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input id="edit-title" disabled={savingEdit} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Description</Label>
              <textarea
                id="edit-desc"
                disabled={savingEdit}
                rows={3}
                className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 resize-none"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-addr">Address</Label>
              <Input id="edit-addr" disabled={savingEdit} value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={savingEdit} onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={savingEdit}>
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}