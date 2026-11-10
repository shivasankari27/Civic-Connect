import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'
import * as functionsV1 from 'firebase-functions/v1'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { generateSubmissionReceiptTemplate, generateResolutionTemplate } from './templates.js'
import { sendEmail } from './transporter.js'

async function getReporterEmail(uid) {
  const app = getApps().find(({ name }) => name === '[DEFAULT]') ?? initializeApp()
  return (await getAuth(app).getUser(uid)).email
}

function issueEmailOptions() {
  return { requireReportedBy: true, getUserEmail: getReporterEmail, appBaseUrl: process.env.APP_BASE_URL }
}

function requiresOwnerLookup(data, options) {
  return options.requireReportedBy || Object.hasOwn(data, 'reportedBy')
}

function complaintDetailUrl(context, trackingId, options) {
  const base = options.appBaseUrl || options.env?.APP_BASE_URL || 'https://civicconnect.gov'
  const routeId = context?.params?.issueId || trackingId
  return `${base.replace(/\/+$/, '')}/complaints/${encodeURIComponent(routeId)}`
}

/**
 * Resolve the owner of an app issue, with compatibility for legacy complaints.
 */
export async function resolveRecipientEmail(data = {}, options = {}) {
  const ownerLookup = requiresOwnerLookup(data, options)
  if (!ownerLookup) {
    const address = data.citizenEmail || data.userEmail || data.email || data.reporterEmail || data.contactEmail
    if (address) return address
  }

  const uid = ownerLookup ? data.reportedBy : (data.userId || data.uid || data.citizenUid || data.authorId || data.createdBy)
  if (ownerLookup && (typeof uid !== 'string' || !uid.trim())) return null
  if (uid && typeof options.getUserEmail === 'function') {
    try {
      const email = await options.getUserEmail(uid)
      if (email) return email
    } catch (err) {
      console.warn('[EmailNotification] User email lookup failed:', err.code || 'unknown')
    }
  }
  if (ownerLookup) return null

  // Firestore user lookup if firestore instance is available
  if (uid && options.firestore) {
    try {
      const userDoc = await options.firestore.collection('users').doc(uid).get()
      if (userDoc.exists) {
        const userData = userDoc.data()
        if (userData?.email) return userData.email
      }
    } catch (err) {
      console.warn('[EmailNotification] Firestore user lookup failed:', err.message)
    }
  }

  return null
}

/**
 * Pure handler for complaint onCreate event
 */
export async function handleComplaintCreate(snapshot, context = {}, options = {}) {
  try {
    const data = (snapshot && typeof snapshot.data === 'function')
      ? (snapshot.data() || {})
      : (snapshot || {})

    const complaintId =
      context?.params?.complaintId ||
      context?.params?.issueId ||
      snapshot?.id ||
      data?.trackingId ||
      data?.id ||
      'CMP-UNKNOWN'

    const trackingId = data.complaintId || data.trackingId || data.id || complaintId
    const recipientEmail = await resolveRecipientEmail(data, options)

    if (!recipientEmail) {
      console.warn(`[EmailNotification] Complaint ${complaintId} has no recipient email. Skipping receipt email.`)
      return {
        success: false,
        skipped: true,
        reason: 'No recipient email found',
        complaintId,
        trackingId,
      }
    }

    const trackingLink = options.trackingLink || complaintDetailUrl(context, trackingId, options)

    const { subject, html, text } = generateSubmissionReceiptTemplate({
      trackingId,
      complaintId,
      title: data.title || 'Civic Complaint',
      category: data.category || 'General',
      priority: data.priority || 'Medium',
      description: data.description || '',
      address: data.address || data.location?.address || '',
      createdAt: data.createdAt || new Date(),
      citizenName: data.citizenName || data.userName || '',
      trackingLink,
    })

    const result = await sendEmail(
      {
        to: recipientEmail,
        subject,
        html,
        text,
      },
      options.transporter,
      options.env
    )

    return {
      success: result.success,
      complaintId,
      trackingId,
      recipient: recipientEmail,
      messageId: result.messageId,
      fallback: Boolean(result.fallback),
      error: result.error,
    }
  } catch (error) {
    console.warn('[EmailNotification] handleComplaintCreate failed gracefully:', error.message)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Pure handler for complaint onUpdate event
 */
export async function handleComplaintUpdate(change, context = {}, options = {}) {
  try {
    const beforeData = (change?.before && typeof change.before.data === 'function')
      ? (change.before.data() || {})
      : (change?.before || {})

    const afterData = (change?.after && typeof change.after.data === 'function')
      ? (change.after.data() || {})
      : (change?.after || {})

    const complaintId =
      context?.params?.complaintId ||
      context?.params?.issueId ||
      change?.after?.id ||
      afterData?.trackingId ||
      afterData?.id ||
      'CMP-UNKNOWN'

    const trackingId = afterData.complaintId || afterData.trackingId || afterData.id || complaintId

    const beforeStatus = String(beforeData?.status || '').trim().toLowerCase()
    const afterStatus = String(afterData?.status || '').trim().toLowerCase()

    // Trigger resolution receipt when transitioning to 'resolved'
    const isNowResolved = afterStatus === 'resolved'
    const wasAlreadyResolved = beforeStatus === 'resolved'

    if (!isNowResolved) {
      return {
        success: true,
        skipped: true,
        reason: `Status is not resolved (current: "${afterData?.status}")`,
        complaintId,
      }
    }

    if (wasAlreadyResolved && !options.forceSend) {
      return {
        success: true,
        skipped: true,
        reason: 'Complaint was already marked as resolved',
        complaintId,
      }
    }

    let recipientEmail = await resolveRecipientEmail(afterData, options)
    if (!recipientEmail && !requiresOwnerLookup(afterData, options)) {
      recipientEmail = await resolveRecipientEmail(beforeData, options)
    }

    if (!recipientEmail) {
      console.warn(`[EmailNotification] Complaint ${complaintId} has no recipient email. Skipping resolution notice.`)
      return {
        success: false,
        skipped: true,
        reason: 'No recipient email found',
        complaintId,
        trackingId,
      }
    }

    const detailUrl = complaintDetailUrl(context, trackingId, options)
    const feedbackLink = options.feedbackLink || `${detailUrl}#feedback`
    const trackingLink = options.trackingLink || detailUrl

    const officerNotes =
      afterData.officerNotes ||
      afterData.resolutionNotes ||
      afterData.resolutionRemarks ||
      afterData.remarks ||
      ''

    const resolutionPhotos =
      afterData.resolutionPhotos ||
      afterData.resolutionEvidence ||
      (afterData.resolutionPhotoUrl ? [afterData.resolutionPhotoUrl] : [])

    const { subject, html, text } = generateResolutionTemplate({
      trackingId,
      complaintId,
      title: afterData.title || 'Civic Complaint',
      category: afterData.category || 'General',
      department: afterData.department || 'Municipal Operations',
      officerNotes,
      resolutionPhotos,
      assignedWorker: afterData.assignedWorker || afterData.assignedOfficer || '',
      resolvedAt: afterData.resolvedAt || afterData.updatedAt || new Date(),
      citizenName: afterData.citizenName || afterData.userName || '',
      feedbackLink,
      trackingLink,
    })

    const result = await sendEmail(
      {
        to: recipientEmail,
        subject,
        html,
        text,
      },
      options.transporter,
      options.env
    )

    return {
      success: result.success,
      complaintId,
      trackingId,
      recipient: recipientEmail,
      messageId: result.messageId,
      fallback: Boolean(result.fallback),
      error: result.error,
    }
  } catch (error) {
    console.warn('[EmailNotification] handleComplaintUpdate failed gracefully:', error.message)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Firebase Functions v2 Triggers for complaints/{complaintId}
 */
export const onComplaintCreated = onDocumentCreated('complaints/{complaintId}', async (event) => {
  return handleComplaintCreate(event.data, { params: event.params })
})

export const onComplaintUpdated = onDocumentUpdated('complaints/{complaintId}', async (event) => {
  return handleComplaintUpdate(event.data, { params: event.params })
})

/**
 * Firebase Functions v2 Triggers for issues/{issueId} (matching Firestore database collection)
 */
export const onIssueCreated = onDocumentCreated('issues/{issueId}', async (event) => {
  return handleComplaintCreate(event.data, { params: event.params }, issueEmailOptions())
})

export const onIssueUpdated = onDocumentUpdated('issues/{issueId}', async (event) => {
  return handleComplaintUpdate(event.data, { params: event.params }, issueEmailOptions())
})

/**
 * Firebase Functions v1 trigger creators (for v1 runtimes if configured)
 */
export function createV1ComplaintTriggers(customFunctions = functionsV1) {
  return {
    onComplaintCreatedV1: customFunctions.firestore
      .document('complaints/{complaintId}')
      .onCreate(async (snapshot, context) => handleComplaintCreate(snapshot, context)),
    onComplaintUpdatedV1: customFunctions.firestore
      .document('complaints/{complaintId}')
      .onUpdate(async (change, context) => handleComplaintUpdate(change, context)),
    onIssueCreatedV1: customFunctions.firestore
      .document('issues/{issueId}')
      .onCreate(async (snapshot, context) => handleComplaintCreate(snapshot, context, issueEmailOptions())),
    onIssueUpdatedV1: customFunctions.firestore
      .document('issues/{issueId}')
      .onUpdate(async (change, context) => handleComplaintUpdate(change, context, issueEmailOptions())),
  }
}

