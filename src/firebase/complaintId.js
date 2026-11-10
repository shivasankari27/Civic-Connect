import { doc, runTransaction } from 'firebase/firestore'
import { db } from './services'

const COUNTER_PATH = 'counters/issueCounter'

function formatId(num) {
  const year = new Date().getFullYear()
  return `CMP-${year}-${String(num).padStart(4, '0')}`
}

export async function allocateComplaintId(transaction) {
  const ref = doc(db, COUNTER_PATH)
  const snap = await transaction.get(ref)
  let nextNum = 1
  if (snap.exists()) {
    nextNum = snap.data().lastNumber + 1
  }
  transaction.set(ref, { lastNumber: nextNum }, { merge: true })
  return formatId(nextNum)
}

export async function generateComplaintId() {
  return runTransaction(db, allocateComplaintId)
}

// The complaint and counter share one read set and commit. A competing backfill
// retries against the winning complaint ID instead of allocating another one.
export async function ensureComplaintId(issueId) {
  const issueRef = doc(db, 'issues', issueId)
  return runTransaction(db, async transaction => {
    const issue = await transaction.get(issueRef)
    if (!issue.exists()) throw new Error('Complaint no longer exists')
    if (issue.data().complaintId) return issue.data().complaintId
    const complaintId = await allocateComplaintId(transaction)
    transaction.update(issueRef, { complaintId })
    return complaintId
  })
}

export function getDisplayId(complaint) {
  if (complaint?.complaintId) return complaint.complaintId
  return `CMP-${new Date().getFullYear()}-XXXX`
}
