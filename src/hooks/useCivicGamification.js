import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot, getDocs, limit } from 'firebase/firestore'
import { db } from '@/firebase/services'
import {
  computeCitizenBadges,
  computeCivicScore,
  computeCitizenLevel,
  computeCivicLeaderboard,
} from '@/utils/gamification'

export function useCivicGamification(user, customDb = db) {
  const [filedComplaints, setFiledComplaints] = useState([])
  const [endorsedComplaints, setEndorsedComplaints] = useState([])
  const [communityParticipants, setCommunityParticipants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false)
      return
    }

    let isMounted = true
    setLoading(true)

    // 1. Subscribe to user's filed complaints
    const filedQuery = query(
      collection(customDb, 'issues'),
      where('reportedBy', '==', user.uid)
    )

    const unsubFiled = onSnapshot(
      filedQuery,
      (snapshot) => {
        if (!isMounted) return
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
        setFiledComplaints(list)
        setLoading(false)
      },
      (err) => {
        console.warn('Error fetching filed complaints for gamification:', err)
        if (isMounted) {
          setError(err)
          setLoading(false)
        }
      }
    )

    // 2. Subscribe to user's endorsed complaints
    const endorsedQuery = query(
      collection(customDb, 'issues'),
      where('endorsedBy', 'array-contains', user.uid)
    )

    const unsubEndorsed = onSnapshot(
      endorsedQuery,
      (snapshot) => {
        if (!isMounted) return
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
        setEndorsedComplaints(list)
      },
      (err) => {
        console.warn('Error fetching endorsed complaints for gamification:', err)
      }
    )

    // 3. Fetch community participants for leaderboard
    async function loadLeaderboardParticipants() {
      try {
        const usersSnap = await getDocs(
          query(collection(customDb, 'users'), where('role', '==', 'citizen'), limit(15))
        ).catch(() => null)

        if (!isMounted) return

        let participants = []

        if (usersSnap && !usersSnap.empty) {
          participants = usersSnap.docs.map((d) => {
            const data = d.data()
            return {
              uid: d.id,
              name: data.name || 'Citizen',
              monthlyScore: data.monthlyScore,
              allTimeScore: data.allTimeScore,
            }
          })
        }

        // Ensure current user is in participants
        const userExists = participants.some((p) => p.uid === user.uid)
        if (!userExists) {
          participants.push({
            uid: user.uid,
            name: user.name || 'You',
          })
        }

        setCommunityParticipants(participants)
      } catch (err) {
        console.warn('Error loading leaderboard participants:', err)
      }
    }

    loadLeaderboardParticipants()

    return () => {
      isMounted = false
      unsubFiled()
      unsubEndorsed()
    }
  }, [user?.uid, user?.name, customDb])

  // Compute live gamification state
  const badgesResult = computeCitizenBadges({
    filedComplaints,
    endorsedComplaints,
  })

  const scoreResult = computeCivicScore({
    filedComplaints,
    endorsedComplaints,
  })

  const levelResult = computeCitizenLevel(scoreResult.allTimeScore)

  // Inject current user's computed score into leaderboard participant list
  const fullParticipants = communityParticipants.map((p) => {
    if (p.uid === user?.uid) {
      return {
        ...p,
        monthlyScore: scoreResult.monthlyScore,
        allTimeScore: scoreResult.allTimeScore,
        filedComplaints,
        endorsedComplaints,
        unlockedBadgesCount: badgesResult.stats.unlockedCount,
      }
    }
    return p
  })

  // If no other community participants yet, make sure current user is still represented
  if (fullParticipants.length === 0 && user?.uid) {
    fullParticipants.push({
      uid: user.uid,
      name: user.name || 'You',
      monthlyScore: scoreResult.monthlyScore,
      allTimeScore: scoreResult.allTimeScore,
      filedComplaints,
      endorsedComplaints,
      unlockedBadgesCount: badgesResult.stats.unlockedCount,
    })
  }

  const leaderboardResult = computeCivicLeaderboard(fullParticipants, {
    currentUserId: user?.uid,
  })

  return {
    loading,
    error,
    badges: badgesResult.badges,
    badgeStats: badgesResult.stats,
    score: scoreResult,
    level: levelResult,
    leaderboard: leaderboardResult.leaderboard,
    currentUserRank: leaderboardResult.currentUserRank,
    stats: {
      totalFiled: filedComplaints.length,
      totalEndorsed: endorsedComplaints.length,
      totalResolved: scoreResult.breakdown.totalResolved,
      totalEndorsementsReceived: scoreResult.breakdown.totalEndorsementsReceived,
    },
  }
}

