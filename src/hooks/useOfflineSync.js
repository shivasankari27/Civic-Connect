import { useEffect, useCallback, useRef } from 'react'
import { auth } from '@/firebase/services'
import { syncOfflineComplaint } from '@/firebase/offlineComplaintSync'
import { useAuth } from '@/hooks/useAuth'

import {
  getPendingComplaints,
  removeOfflineComplaint,
} from '@/utils/offlineQueue'

export function useOfflineSync() {
  const { user } = useAuth()
  const syncingRef = useRef(null)

  const syncComplaints = useCallback(async () => {
    const session = auth.currentUser
    if (
      typeof navigator === 'undefined' ||
      !navigator.onLine ||
      !session || session.uid !== user?.uid ||
      syncingRef.current === session
    ) {
      return
    }

    syncingRef.current = session

    try {
      const pendingComplaints = await getPendingComplaints(session.uid)

      for (const complaint of pendingComplaints) {
        if (!navigator.onLine || auth.currentUser !== session) break

        try {
          await syncOfflineComplaint(complaint, session)
          await removeOfflineComplaint(complaint.localId)

          console.log(
            'Offline complaint synchronized:',
            complaint.localId
          )
        } catch (error) {
          console.error(
            'Failed to synchronize complaint:',
            complaint.localId,
            error
          )
        }
      }
    } catch (error) {
      console.error('Offline synchronization failed:', error)
    } finally {
      if (syncingRef.current === session) syncingRef.current = null
    }
  }, [user?.uid])

  useEffect(() => {
    window.addEventListener('online', syncComplaints)

    // Also check for pending complaints when the app opens.
    syncComplaints()

    return () => {
      window.removeEventListener('online', syncComplaints)
    }
  }, [syncComplaints])

  return { syncComplaints }
}
