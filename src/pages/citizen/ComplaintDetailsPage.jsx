import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, MapPin, CalendarDays, Building2, FileText, ClipboardCheck, AlertTriangle, Star, Camera, ZoomIn, ZoomOut, ExternalLink } from 'lucide-react'
import { doc, collection, onSnapshot, serverTimestamp, updateDoc, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '@/firebase/services'
import { getDisplayId } from '@/firebase/complaintId'
import { commitComplaintTransition } from '@/firebase/complaintLifecycle'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SlaBadge, SlaCountdown } from '@/components/common/SlaBadge'
import { getSlaTargetDate } from '@/utils/sla'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import toast from 'react-hot-toast'
import ComplaintAudioPlayer from '@/components/citizen/ComplaintAudioPlayer'

const statusVariant = {
  Resolved: 'success',
  'In Progress': 'warning',
  Pending: 'destructive',
  Rejected: 'secondary',
  Reopened: 'warning',
}

const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const ratingLabels = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
}

function canReopenComplaint(complaint) {
  const resolvedAt = complaint.resolvedAt?.toDate?.()
  return complaint.status === 'Resolved' && !!resolvedAt &&
    Date.now() - resolvedAt.getTime() <= REOPEN_WINDOW_MS
}

function sortEvents(list) {
  const getMillis = (val) => {
    if (!val) return 0
    if (typeof val.toMillis === 'function') return val.toMillis()
    if (typeof val.toDate === 'function') return val.toDate().getTime()
    if (typeof val.seconds === 'number') return val.seconds * 1000
    if (typeof val === 'number') return val
    const parsed = new Date(val).getTime()
    return isNaN(parsed) ? 0 : parsed
  }
  return [...list].sort((a, b) => getMillis(a.timestamp) - getMillis(b.timestamp))
}

function formatEventDate(ts) {
  if (!ts) return ''
  let date = null
  if (typeof ts?.toDate === 'function') {
    date = ts.toDate()
  } else if (ts instanceof Date) {
    date = ts
  } else if (typeof ts?.seconds === 'number') {
    date = new Date(ts.seconds * 1000)
  } else if (typeof ts === 'number' || typeof ts === 'string') {
    const d = new Date(ts)
    if (!isNaN(d.getTime())) date = d
  }
  if (!date) return ''
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function ComplaintDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [complaint, setComplaint] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [rating, setRating] = useState(0)
  const [ratingHover, setRatingHover] = useState(0)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [submittingFeedback, setSubmittingFeedback] = useState(false)
  const [saving, setSaving] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [zoomScale, setZoomScale] = useState(1)
  const transitionPending = useRef(false)

  useEffect(() => {
    const unsubEvents = onSnapshot(
      collection(db, `issues/${id}/events`),
      (snap) => {
        if (snap?.docs) {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          setEvents(sortEvents(list))
        }
      },
      (error) => {
        console.error('ComplaintDetails events Firestore error:', error)
      }
    )

    const unsubComplaint = onSnapshot(
      doc(db, 'issues', id),
      (snap) => {
        if (snap.exists()) {
          setComplaint({ id: snap.id, ...snap.data() })
          setLoading(false)
        } else {
          const q = query(
            collection(db, 'issues'),
            where('complaintId', '==', id),
            limit(1)
          )
          getDocs(q)
            .then((querySnap) => {
              if (!querySnap.empty) {
                navigate(`/complaints/${querySnap.docs[0].id}`, { replace: true })
              } else {
                setNotFound(true)
                setLoading(false)
              }
            })
            .catch(() => {
              setNotFound(true)
              setLoading(false)
            })
        }
      },
      (error) => {
        console.error('ComplaintDetails Firestore error:', error)
        setNotFound(true)
        setLoading(false)
      }
    )

    return () => {
      unsubEvents?.()
      unsubComplaint?.()
    }
  }, [id, navigate])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  if (notFound || !complaint) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Complaint not found</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">This complaint does not exist or has been removed.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/my-reports')}>
          Back to My Reports
        </Button>
      </div>
    )
  }

  const lastUpdated = complaint.updatedAt?.toDate?.() || complaint.createdAt?.toDate?.()
  const slaTarget = getSlaTargetDate(complaint.createdAt, complaint.category, complaint.department)
  const canReopen = canReopenComplaint(complaint)

  const timelineEvents = (events && events.length > 0)
    ? events.map((evt) => ({
        ...evt,
        formattedDate: formatEventDate(evt.timestamp),
      }))
    : [
        {
          id: 'initial',
          action: 'Complaint submitted',
          newStatus: 'Pending',
          remarks: 'Complaint submitted',
          formattedDate: formatEventDate(complaint.createdAt),
        },
        ...(complaint.status && complaint.status !== 'Pending'
          ? [
              {
                id: 'status-update',
                action: 'Status changed',
                previousStatus: 'Pending',
                newStatus: complaint.status,
                remarks:
                  complaint.rejectionReason ||
                  complaint.reopenReason ||
                  `Status updated to ${complaint.status}`,
                formattedDate: formatEventDate(complaint.updatedAt || complaint.createdAt),
              },
            ]
          : []),
      ]

  const handleReopen = async () => {
    if (transitionPending.current) return
    if (!canReopen) {
      toast.error('This complaint is no longer eligible for reopening')
      return
    }
    const reason = feedback.trim()
    if (!reason) {
      toast.error('Please tell us what is still not fixed')
      return
    }
    transitionPending.current = true
    setSaving(true)
    try {
      await commitComplaintTransition(
        id,
        'Resolved',
        {
          status: 'Reopened',
          reopenReason: reason,
          reopenedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        current => ({
          recipientUid: null,
          recipientRole: 'admin',
          senderUid: user.uid,
          issueId: current.complaintId || id,
          type: 'status_update',
          title: 'Complaint Reopened',
          message: `A citizen reopened a resolved complaint: ${reason}`,
        }),
        canReopenComplaint,
        current => ({
          actorUid: user.uid,
          action: 'Status changed',
          previousStatus: current.status,
          newStatus: 'Reopened',
          remarks: reason,
        })
      )
      toast.success('Complaint reopened')
      setReopenOpen(false)
      setFeedback('')
    } catch (err) {
      toast.error('Failed to reopen complaint')
      console.error(err)
    } finally {
      transitionPending.current = false
      setSaving(false)
    }
  }

  const handleSubmitFeedback = async () => {
    if (rating < 1 || rating > 5) {
      toast.error('Please select a star rating from 1 to 5')
      return
    }
    setSubmittingFeedback(true)
    try {
      await updateDoc(doc(db, 'issues', id), {
        feedback: {
          rating,
          comment: feedbackComment.trim(),
          submittedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      })
      toast.success('Thank you for your feedback!')
    } catch (err) {
      toast.error('Failed to submit feedback')
      console.error(err)
    } finally {
      setSubmittingFeedback(false)
    }
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/my-reports')}
          className="gap-2 mb-6 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" /> Back to My Reports
        </Button>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{getDisplayId(complaint)}</span>
                      <Badge variant={statusVariant[complaint.status] || 'default'} className="capitalize">
                        {complaint.status}
                      </Badge>
                      <SlaBadge complaint={complaint} />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white mt-1">{complaint.title}</h1>
                  </div>
                  {canReopen && (
                    <Button size="sm" className="shrink-0" onClick={() => setReopenOpen(true)}>
                      Reopen Issue
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 py-4 border-y border-gray-100 dark:border-gray-800">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Category</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{complaint.category || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Department</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{complaint.department || 'Not assigned'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Created</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">
                      {complaint.createdAt?.toDate?.().toLocaleDateString() || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Updated</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">
                      {lastUpdated?.toLocaleDateString() || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">SLA Target</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">
                      {slaTarget
                        ? slaTarget.toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : '-'}
                    </p>
                  </div>
                </div>

                <SlaCountdown complaint={complaint} className="mt-4" />

                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Description</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{complaint.description}</p>
                </div>

                {(complaint.imageUrl || (complaint.photos && complaint.photos.length > 0)) && (
                  <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
                      <Camera className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                      Photo Evidence
                    </h3>
                    <div className="relative group inline-block overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                      <img
                        src={complaint.imageUrl || complaint.photos?.[0]}
                        alt="Complaint evidence"
                        className="h-48 w-full sm:w-80 object-cover cursor-pointer transition-transform duration-200 group-hover:scale-105"
                        onClick={() => setZoomOpen(true)}
                      />
                      <button
                        type="button"
                        onClick={() => setZoomOpen(true)}
                        className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-medium cursor-pointer"
                        aria-label="Zoom in on photo evidence"
                      >
                        <ZoomIn className="h-4 w-4" />
                        Click to zoom
                      </button>
                    </div>
                  </div>
                )}

                {complaint.status === 'Rejected' && complaint.rejectionReason && (
                  <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm dark:bg-red-900/20">
                    <p className="font-medium text-red-700 dark:text-red-300">Reason for rejection</p>
                    <p className="mt-1 text-gray-700 dark:text-gray-300">{complaint.rejectionReason}</p>
                  </div>
                )}

                {complaint.status === 'Reopened' && complaint.reopenReason && (
                  <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-900/20">
                    <p className="font-medium text-amber-800 dark:text-amber-300">Your reopen feedback</p>
                    <p className="mt-1 text-gray-700 dark:text-gray-300">{complaint.reopenReason}</p>
                  </div>
                )}

                <ComplaintAudioPlayer audioNote={complaint.audioNote} />

                <div className="mt-4 flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{complaint.address}</span>
                </div>
                <div className="mt-1 flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <CalendarDays className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Submitted on {complaint.createdAt?.toDate?.().toLocaleDateString() || '-'}</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardCheck className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                  Status Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative ml-2">
                  <div className="absolute left-[7px] top-1 bottom-1 w-0.5 bg-gray-200 dark:bg-gray-800" />
                  <div className="space-y-6">
                    {timelineEvents.map((evt, i) => (
                      <motion.div
                        key={evt.id || i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.08 }}
                        className="relative flex gap-4"
                      >
                        <div className="relative z-10 mt-1 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-2 border-primary-600 bg-primary-600 dark:border-primary-400 dark:bg-primary-400">
                          <div className="h-1.5 w-1.5 rounded-full bg-white" />
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                              {evt.action}
                            </p>
                            {evt.formattedDate && (
                              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                                {evt.formattedDate}
                              </span>
                            )}
                          </div>
                          {evt.previousStatus && evt.newStatus && evt.previousStatus !== evt.newStatus && (
                            <p className="text-xs font-medium text-primary-600 dark:text-primary-400 mt-0.5">
                              {evt.previousStatus} &rarr; {evt.newStatus}
                            </p>
                          )}
                          {evt.remarks && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                              {evt.remarks}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {complaint.status === 'Resolved' && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
            >
              {complaint.feedback ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                        Your Feedback
                      </CardTitle>
                      <Badge variant="success">Submitted</Badge>
                    </div>
                    <CardDescription>
                      Thank you for helping us improve our municipal services.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`h-5 w-5 ${
                              s <= complaint.feedback.rating
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-gray-300 dark:text-gray-700'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {complaint.feedback.rating} / 5
                      </span>
                      {ratingLabels[complaint.feedback.rating] && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          ({ratingLabels[complaint.feedback.rating]})
                        </span>
                      )}
                    </div>
                    {complaint.feedback.comment && (
                      <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                        {complaint.feedback.comment}
                      </p>
                    )}
                    {complaint.feedback.submittedAt && (
                      <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                        Submitted on {complaint.feedback.submittedAt.toDate?.().toLocaleDateString() || '-'}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-amber-200 dark:border-amber-900/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                      Rate Resolution
                    </CardTitle>
                    <CardDescription>
                      This complaint has been resolved. How satisfied are you with the resolution?
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                        Satisfaction Rating <span className="text-red-500">*</span>
                      </p>
                      <div className="flex items-center gap-1.5" onMouseLeave={() => setRatingHover(0)}>
                        {[1, 2, 3, 4, 5].map((s) => {
                          const active = s <= (ratingHover || rating)
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setRating(s)}
                              onMouseEnter={() => setRatingHover(s)}
                              aria-label={`Rate ${s} star${s > 1 ? 's' : ''}`}
                              className="p-1 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded cursor-pointer"
                            >
                              <Star
                                className={`h-6 w-6 transition-colors ${
                                  active
                                    ? 'text-amber-400 fill-amber-400'
                                    : 'text-gray-300 dark:text-gray-700'
                                }`}
                              />
                            </button>
                          )
                        })}
                        {(ratingHover || rating) > 0 && (
                          <span className="text-sm font-medium text-amber-600 dark:text-amber-400 ml-2">
                            {ratingLabels[ratingHover || rating]}
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="feedback-comment" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                        Feedback Comments (Optional)
                      </label>
                      <textarea
                        id="feedback-comment"
                        rows={3}
                        value={feedbackComment}
                        onChange={(e) => setFeedbackComment(e.target.value)}
                        placeholder="Tell us what went well or what could be improved..."
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                      />
                    </div>

                    <Button
                      onClick={handleSubmitFeedback}
                      disabled={rating === 0 || submittingFeedback}
                      size="sm"
                      className="gap-2"
                    >
                      {submittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}
        </div>

        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                  Resolution Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4">
                  {complaint.resolutionNotes ? (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{complaint.department || 'Unassigned'}</span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{complaint.resolutionNotes}</p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400 dark:text-gray-500">No resolution notes yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                  Location
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg bg-gray-100 dark:bg-gray-800 h-48 flex items-center justify-center overflow-hidden">
                  <div className="text-center">
                    <MapPin className="h-8 w-8 text-primary-600 dark:text-primary-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">{complaint.address}</p>
                    {complaint.latitude && complaint.longitude && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {complaint.latitude}, {complaint.longitude}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen Issue</DialogTitle>
            <DialogDescription>
              Tell us what is still not fixed. Issues can be reopened within 7 days of resolution.
            </DialogDescription>
          </DialogHeader>
          <textarea
            rows={4}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Describe what is still wrong..."
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenOpen(false)}>Cancel</Button>
            <Button onClick={handleReopen} disabled={saving}>
              {saving ? 'Submitting...' : 'Reopen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Photo Evidence Zoom Modal */}
      <Dialog
        open={zoomOpen}
        onOpenChange={(open) => {
          setZoomOpen(open)
          if (!open) setZoomScale(1)
        }}
      >
        <DialogContent className="max-w-3xl p-4 sm:p-6">
          <DialogHeader className="mb-2">
            <div className="flex items-center justify-between pr-8">
              <DialogTitle>Photo Evidence</DialogTitle>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 px-1 py-0.5 text-xs">
                  <button
                    type="button"
                    disabled={zoomScale <= 0.75}
                    onClick={() => setZoomScale((s) => Math.max(0.5, s - 0.25))}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-40"
                    title="Zoom out"
                    aria-label="Zoom out"
                  >
                    <ZoomOut className="h-3.5 w-3.5 text-gray-700 dark:text-gray-300" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomScale(1)}
                    className="px-1.5 py-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded font-mono text-[11px] text-gray-700 dark:text-gray-300"
                    title="Reset zoom"
                    aria-label="Reset zoom"
                  >
                    {Math.round(zoomScale * 100)}%
                  </button>
                  <button
                    type="button"
                    disabled={zoomScale >= 3}
                    onClick={() => setZoomScale((s) => Math.min(3, s + 0.25))}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-40"
                    title="Zoom in"
                    aria-label="Zoom in"
                  >
                    <ZoomIn className="h-3.5 w-3.5 text-gray-700 dark:text-gray-300" />
                  </button>
                </div>

                {(complaint.imageUrl || complaint.photos?.[0]) && (
                  <a
                    href={complaint.imageUrl || complaint.photos?.[0]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-normal text-primary-600 dark:text-primary-400 hover:underline ml-1"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open original
                  </a>
                )}
              </div>
            </div>
            <DialogDescription>
              Visual proof attached to {getDisplayId(complaint)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center max-h-[70vh] overflow-auto rounded-lg bg-black/5 dark:bg-black/40 p-2">
            <img
              src={complaint.imageUrl || complaint.photos?.[0]}
              alt="Enlarged complaint evidence"
              style={{ transform: `scale(${zoomScale})`, transformOrigin: 'center center' }}
              className={`max-h-[65vh] w-auto max-w-full object-contain rounded-md transition-transform duration-150 ${
                zoomScale === 1 ? 'cursor-zoom-in' : 'cursor-zoom-out'
              }`}
              onClick={() => setZoomScale((s) => (s === 1 ? 1.75 : 1))}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
