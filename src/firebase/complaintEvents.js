import { collection, addDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from './services'

export function buildComplaintEvent({
  timestamp = null,
  actorUid = null,
  action,
  previousStatus = null,
  newStatus = null,
  remarks = '',
}) {
  return {
    timestamp: timestamp || serverTimestamp(),
    actorUid: actorUid ?? null,
    action,
    previousStatus: previousStatus ?? null,
    newStatus: newStatus ?? null,
    remarks: remarks || '',
  }
}

export async function logComplaintEvent(issueId, eventFields) {
  const eventData = buildComplaintEvent(eventFields)
  return await addDoc(collection(db, `issues/${issueId}/events`), eventData)
}

export function addComplaintEventToBatch(batch, issueId, eventFields, customDb = db) {
  const eventRef = doc(collection(customDb, `issues/${issueId}/events`))
  const eventData = buildComplaintEvent(eventFields)
  batch.set(eventRef, eventData)
  return eventRef
}

