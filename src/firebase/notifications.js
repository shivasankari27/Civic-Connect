import { collection, addDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging'
import app, { db } from './services'
import firebaseConfig from './config'

function buildNotification({
  recipientUid = null,
  recipientRole,
  senderUid,
  issueId,
  type,
  title,
  message,
}) {
  return {
    recipientUid,
    recipientRole,
    senderUid,
    issueId,
    type,
    title,
    message,
    read: false,
    createdAt: serverTimestamp(),
  }
}

export async function createNotification(fields) {
  await addDoc(collection(db, 'notifications'), buildNotification(fields))
}

// Queues the notification on an existing writeBatch so it commits atomically with the caller's other writes.
export function addNotificationToBatch(batch, fields, customDb = db) {
  batch.set(doc(collection(customDb, 'notifications')), buildNotification(fields))
}

let messagingPromise = null

export function _resetMessagingInstanceForTests() {
  messagingPromise = null
}

export async function getMessagingService() {
  if (typeof window === 'undefined' && typeof self === 'undefined') return null
  if (!messagingPromise) {
    messagingPromise = isSupported()
      .then((supported) => {
        if (!supported) return null
        return getMessaging(app)
      })
      .catch(() => null)
  }
  return messagingPromise
}

export function getPushPermissionStatus() {
  if (typeof Notification === 'undefined') {
    return 'unsupported'
  }
  return Notification.permission
}

export function showNativeNotification({ title, message, url, issueId }) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return null
  }

  const targetUrl = url || (issueId ? `/complaints/${issueId}` : '/notifications')
  try {
    const notification = new Notification(title || 'Civic-Connect Update', {
      body: message || 'Your complaint status has been updated.',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: targetUrl, issueId },
    })

    notification.onclick = (event) => {
      event.preventDefault()
      if (typeof window !== 'undefined') {
        window.focus?.()
        if (window.location && window.location.pathname !== targetUrl) {
          window.location.href = targetUrl
        }
      }
      notification.close()
    }

    return notification
  } catch (err) {
    console.warn('Native notification failed:', err)
    return null
  }
}

export async function requestPushPermission(userUid) {
  if (typeof Notification === 'undefined') {
    return { status: 'unsupported' }
  }

  try {
    let currentPermission = Notification.permission
    if (currentPermission === 'default') {
      currentPermission = await Notification.requestPermission()
    }

    if (currentPermission !== 'granted') {
      return { status: currentPermission }
    }

    const messaging = await getMessagingService()
    if (!messaging) {
      return { status: 'unsupported' }
    }

    let registration = undefined
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const swParams = new URLSearchParams()
      if (firebaseConfig.messagingSenderId) swParams.set('messagingSenderId', firebaseConfig.messagingSenderId)
      if (firebaseConfig.projectId) swParams.set('projectId', firebaseConfig.projectId)
      if (firebaseConfig.appId) swParams.set('appId', firebaseConfig.appId)
      if (firebaseConfig.apiKey) swParams.set('apiKey', firebaseConfig.apiKey)

      const queryStr = swParams.toString()
      const swUrl = queryStr ? `/firebase-messaging-sw.js?${queryStr}` : '/firebase-messaging-sw.js'
      registration = await navigator.serviceWorker.register(swUrl)
    }

    const vapidKey = import.meta.env?.VITE_FIREBASE_VAPID_KEY
    const token = await getToken(messaging, {
      serviceWorkerRegistration: registration,
      ...(vapidKey ? { vapidKey } : {}),
    })

    if (token && userUid) {
      await updateDoc(doc(db, 'users', userUid), {
        fcmToken: token,
        pushNotificationsEnabled: true,
        updatedAt: serverTimestamp(),
      })
    }

    return { status: 'granted', token }
  } catch (err) {
    console.error('Error enabling push notifications:', err)
    return { status: 'error', error: err }
  }
}

export async function setupForegroundNotificationListener(onNotification) {
  const messaging = await getMessagingService()
  if (!messaging) return () => {}

  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title || payload.data?.title || 'Civic-Connect Notification'
    const message = payload.notification?.body || payload.data?.message || 'New update received'
    const issueId = payload.data?.issueId || payload.data?.complaintId || ''
    const url = payload.data?.url || (issueId ? `/complaints/${issueId}` : '/notifications')

    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      showNativeNotification({ title, message, url, issueId })
    }

    if (typeof onNotification === 'function') {
      onNotification({ title, message, url, issueId, payload })
    }
  })
}
