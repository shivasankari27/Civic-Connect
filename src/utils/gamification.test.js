import { describe, it, expect } from 'vitest'
import {
  computeCitizenBadges,
  computeCivicScore,
  computeCitizenLevel,
  computeCivicLeaderboard,
  getCivicGamificationSummary,
  toDate,
  isSameMonth,
  BADGE_DEFINITIONS,
} from './gamification'

describe('Gamification Utility Engine', () => {
  describe('toDate & isSameMonth helpers', () => {
    it('parses JS Date, Firestore Timestamp, and numeric seconds', () => {
      const now = new Date('2026-11-10T12:00:00Z')
      expect(toDate(now)).toEqual(now)

      const firestoreTimestamp = { toDate: () => now }
      expect(toDate(firestoreTimestamp)).toEqual(now)

      const secondsObj = { seconds: Math.floor(now.getTime() / 1000) }
      expect(toDate(secondsObj)?.getFullYear()).toBe(2026)

      expect(toDate(now.getTime())?.toISOString()).toBe(now.toISOString())
      expect(toDate('2026-11-10T12:00:00Z')?.toISOString()).toBe(now.toISOString())
      expect(toDate(null)).toBeNull()
      expect(toDate(undefined)).toBeNull()
      expect(toDate('invalid-date')).toBeNull()
    })

    it('correctly compares dates within the same month and year', () => {
      const ref = new Date('2026-11-15T00:00:00Z')
      expect(isSameMonth(new Date('2026-11-01T08:00:00Z'), ref)).toBe(true)
      expect(isSameMonth(new Date('2026-11-30T23:59:59Z'), ref)).toBe(true)
      expect(isSameMonth(new Date('2026-10-31T23:59:59Z'), ref)).toBe(false)
      expect(isSameMonth(new Date('2025-11-15T00:00:00Z'), ref)).toBe(false)
      expect(isSameMonth(null, ref)).toBe(false)
    })
  })

  describe('computeCitizenBadges', () => {
    it('returns all badges locked when citizen has no activity', () => {
      const result = computeCitizenBadges([], [])
      expect(result.badges).toHaveLength(BADGE_DEFINITIONS.length)
      expect(result.stats.unlockedCount).toBe(0)
      expect(result.stats.lockedCount).toBe(BADGE_DEFINITIONS.length)
      expect(result.stats.completionPercentage).toBe(0)

      const firstReport = result.badges.find((b) => b.id === 'first_report')
      expect(firstReport.unlocked).toBe(false)
      expect(firstReport.progress.current).toBe(0)
      expect(firstReport.progress.target).toBe(1)
      expect(firstReport.progress.percentage).toBe(0)
    })

    it('unlocks "First Report" on filing 1 complaint', () => {
      const filed = [{ id: 'c1', title: 'Pothole', status: 'Pending', category: 'Roads' }]
      const result = computeCitizenBadges({ filedComplaints: filed, endorsedComplaints: [] })

      const firstReport = result.badges.find((b) => b.id === 'first_report')
      expect(firstReport.unlocked).toBe(true)
      expect(firstReport.progress.current).toBe(1)
      expect(firstReport.progress.percentage).toBe(100)

      const activeScout = result.badges.find((b) => b.id === 'active_scout')
      expect(activeScout.unlocked).toBe(false)
      expect(activeScout.progress.current).toBe(1)
      expect(activeScout.progress.target).toBe(5)
      expect(activeScout.progress.percentage).toBe(20)
    })

    it('unlocks "Active Scout" and "Civic Sentinel" as complaint count increases', () => {
      const fiveComplaints = Array.from({ length: 5 }, (_, i) => ({
        id: `c-${i}`,
        title: `Report ${i}`,
        status: 'Pending',
      }))
      const scoutRes = computeCitizenBadges(fiveComplaints, [])
      expect(scoutRes.badges.find((b) => b.id === 'active_scout').unlocked).toBe(true)
      expect(scoutRes.badges.find((b) => b.id === 'civic_sentinel').unlocked).toBe(false)

      const tenComplaints = Array.from({ length: 10 }, (_, i) => ({
        id: `c-${i}`,
        title: `Report ${i}`,
        status: 'Pending',
      }))
      const sentinelRes = computeCitizenBadges(tenComplaints, [])
      expect(sentinelRes.badges.find((b) => b.id === 'civic_sentinel').unlocked).toBe(true)
    })

    it('unlocks endorsement badges ("Community Voice", "Top Endorser", "Civic Pillar")', () => {
      const oneEndorsement = [{ id: 'e1' }]
      const voiceRes = computeCitizenBadges([], oneEndorsement)
      expect(voiceRes.badges.find((b) => b.id === 'community_voice').unlocked).toBe(true)
      expect(voiceRes.badges.find((b) => b.id === 'top_endorser').unlocked).toBe(false)

      const fiveEndorsements = Array.from({ length: 5 }, (_, i) => ({ id: `e-${i}` }))
      const topEndorserRes = computeCitizenBadges([], fiveEndorsements)
      expect(topEndorserRes.badges.find((b) => b.id === 'top_endorser').unlocked).toBe(true)
      expect(topEndorserRes.badges.find((b) => b.id === 'civic_pillar').unlocked).toBe(false)

      const fifteenEndorsements = Array.from({ length: 15 }, (_, i) => ({ id: `e-${i}` }))
      const pillarRes = computeCitizenBadges([], fifteenEndorsements)
      expect(pillarRes.badges.find((b) => b.id === 'civic_pillar').unlocked).toBe(true)
    })

    it('unlocks resolution badges ("Resolution Champion", "City Impact")', () => {
      const oneResolved = [
        { id: 'c1', status: 'Resolved' },
        { id: 'c2', status: 'Pending' },
      ]
      const res1 = computeCitizenBadges(oneResolved, [])
      expect(res1.badges.find((b) => b.id === 'resolution_champion').unlocked).toBe(true)
      expect(res1.badges.find((b) => b.id === 'city_impact').unlocked).toBe(false)

      const threeResolved = [
        { id: 'c1', status: 'Resolved' },
        { id: 'c2', status: 'resolved' }, // case-insensitive check
        { id: 'c3', status: 'Resolved' },
      ]
      const res3 = computeCitizenBadges(threeResolved, [])
      expect(res3.badges.find((b) => b.id === 'city_impact').unlocked).toBe(true)
    })

    it('unlocks "Neighborhood Watch" when reporting across 3 or more distinct categories', () => {
      const complaints = [
        { id: 'c1', category: 'Roads' },
        { id: 'c2', category: 'Sanitation' },
        { id: 'c3', category: 'Roads' }, // duplicate category
        { id: 'c4', category: 'Water' },
      ]
      const res = computeCitizenBadges(complaints, [])
      const badge = res.badges.find((b) => b.id === 'neighborhood_watch')
      expect(badge.unlocked).toBe(true)
      expect(badge.progress.current).toBe(3)
    })

    it('unlocks "Crowd Magnet" when complaints receive 5 or more total endorsements', () => {
      const complaints = [
        { id: 'c1', endorsementCount: 3 },
        { id: 'c2', endorsedBy: ['user1', 'user2'] }, // length 2
      ]
      const res = computeCitizenBadges(complaints, [])
      const badge = res.badges.find((b) => b.id === 'crowd_magnet')
      expect(badge.unlocked).toBe(true)
      expect(badge.progress.current).toBe(5)
      expect(badge.progress.percentage).toBe(100)
    })
  })

  describe('computeCivicScore', () => {
    const ref = new Date('2026-11-10T10:00:00Z')

    it('accurately tallies points according to defined weights', () => {
      const filed = [
        {
          id: 'c1',
          status: 'Resolved',
          createdAt: '2026-11-02T10:00:00Z',
          resolvedAt: '2026-11-04T10:00:00Z',
          endorsementCount: 2,
        },
        {
          id: 'c2',
          status: 'Pending',
          createdAt: '2026-11-05T10:00:00Z',
          endorsedBy: ['u1'],
        },
      ]
      const endorsed = [
        { id: 'e1', createdAt: '2026-11-03T10:00:00Z' },
        { id: 'e2', createdAt: '2026-11-06T10:00:00Z' },
      ]

      const score = computeCivicScore({
        filedComplaints: filed,
        endorsedComplaints: endorsed,
        referenceDate: ref,
      })

      // 2 filed * 50 = 100
      // 1 resolved * 100 = 100
      // 2 endorsed * 15 = 30
      // 3 endorsements received * 10 = 30
      // Total = 260
      expect(score.allTimeScore).toBe(260)
      expect(score.monthlyScore).toBe(260)
      expect(score.monthName).toContain('November')
      expect(score.monthName).toContain('2026')
    })

    it('isolates monthly score from prior months while keeping allTimeScore cumulative', () => {
      const filed = [
        // Prior month (October 2026)
        {
          id: 'old-1',
          status: 'Resolved',
          createdAt: '2026-10-15T10:00:00Z',
          resolvedAt: '2026-10-20T10:00:00Z',
          endorsementCount: 4,
        },
        // Current month (November 2026)
        {
          id: 'new-1',
          status: 'Pending',
          createdAt: '2026-11-02T10:00:00Z',
          endorsementCount: 1,
        },
      ]
      const endorsed = [
        { id: 'old-e', createdAt: '2026-10-10T10:00:00Z', updatedAt: '2026-10-10T10:00:00Z' },
        { id: 'new-e', createdAt: '2026-11-04T10:00:00Z', updatedAt: '2026-11-04T10:00:00Z' },
      ]

      const score = computeCivicScore(filed, endorsed, ref)

      // All-time:
      // Filed: 2 * 50 = 100
      // Resolved: 1 * 100 = 100
      // Endorsed: 2 * 15 = 30
      // Endorsements received: (4 + 1) * 10 = 50
      // Total all-time = 280
      expect(score.allTimeScore).toBe(280)

      // Monthly (Nov 2026):
      // Monthly filed: 1 * 50 = 50
      // Monthly resolved: 0 * 100 = 0
      // Monthly endorsed: 1 * 15 = 15
      // Monthly endorsements received: 1 * 10 = 10
      // Monthly total = 75
      expect(score.monthlyScore).toBe(75)
      expect(score.breakdown.monthlyFiled).toBe(1)
      expect(score.breakdown.monthlyResolved).toBe(0)
      expect(score.breakdown.monthlyEndorsed).toBe(1)
    })
  })

  describe('computeCitizenLevel', () => {
    it('correctly maps XP to tiers and levels', () => {
      const lvl1 = computeCitizenLevel(0)
      expect(lvl1.level).toBe(1)
      expect(lvl1.title).toBe('Civic Explorer')
      expect(lvl1.nextTitle).toBe('Active Contributor')
      expect(lvl1.nextLevelXp).toBe(100)
      expect(lvl1.pointsRemaining).toBe(100)
      expect(lvl1.progressPercentage).toBe(0)

      const lvl2 = computeCitizenLevel(150)
      expect(lvl2.level).toBe(2)
      expect(lvl2.title).toBe('Active Contributor')
      expect(lvl2.nextTitle).toBe('Community Advocate')
      expect(lvl2.nextLevelXp).toBe(300)
      // Range: 100 to 300 (200 pts total range), 150 - 100 = 50 gained => 25%
      expect(lvl2.progressPercentage).toBe(25)
      expect(lvl2.pointsRemaining).toBe(150)

      const lvl5 = computeCitizenLevel(1250)
      expect(lvl5.level).toBe(5)
      expect(lvl5.title).toBe('Civic Champion')
      expect(lvl5.isMaxLevel).toBe(true)
      expect(lvl5.nextTitle).toBeNull()
      expect(lvl5.progressPercentage).toBe(100)
      expect(lvl5.pointsRemaining).toBe(0)
    })

    it('handles negative or invalid numbers safely', () => {
      const safe = computeCitizenLevel(-50)
      expect(safe.level).toBe(1)
      expect(safe.currentXp).toBe(0)
    })
  })

  describe('computeCivicLeaderboard', () => {
    it('orders participants by monthlyScore descending, with ties broken by allTimeScore', () => {
      const participants = [
        { uid: 'u1', name: 'Alice Adams', monthlyScore: 200, allTimeScore: 500 },
        { uid: 'u2', name: 'Bob Baker', monthlyScore: 350, allTimeScore: 400 },
        { uid: 'u3', name: 'Charlie Clark', monthlyScore: 200, allTimeScore: 600 },
      ]

      const { leaderboard, currentUserRank } = computeCivicLeaderboard(participants, {
        currentUserId: 'u3',
      })

      expect(leaderboard[0].uid).toBe('u2') // 350 pts
      expect(leaderboard[0].rank).toBe(1)
      expect(leaderboard[0].medal).toBe('🥇')

      expect(leaderboard[1].uid).toBe('u3') // 200 pts monthly, 600 all-time
      expect(leaderboard[1].rank).toBe(2)
      expect(leaderboard[1].medal).toBe('🥈')
      expect(leaderboard[1].isCurrentUser).toBe(true)

      expect(leaderboard[2].uid).toBe('u1') // 200 pts monthly, 500 all-time
      expect(leaderboard[2].rank).toBe(3)
      expect(leaderboard[2].medal).toBe('🥉')

      expect(currentUserRank).toBe(2)
    })

    it('computes dynamic scores from participant complaints when raw scores omitted', () => {
      const participants = [
        {
          uid: 'u1',
          name: 'Dana',
          filedComplaints: [{ id: 'c1', createdAt: new Date() }],
        },
      ]

      const { leaderboard } = computeCivicLeaderboard(participants)
      expect(leaderboard[0].monthlyScore).toBe(50)
      expect(leaderboard[0].allTimeScore).toBe(50)
      expect(leaderboard[0].badgesCount).toBe(1) // first_report unlocked
    })
  })

  describe('getCivicGamificationSummary', () => {
    it('integrates score, level, badges, and breakdown statistics into one unified payload', () => {
      const filed = [
        {
          id: 'c1',
          status: 'Resolved',
          category: 'Sanitation',
          createdAt: new Date(),
        },
      ]
      const endorsed = [{ id: 'e1', createdAt: new Date() }]

      const summary = getCivicGamificationSummary(filed, endorsed)

      expect(summary.score.allTimeScore).toBe(50 + 100 + 15) // 165
      expect(summary.level.level).toBe(2) // Active Contributor
      expect(summary.badges).toHaveLength(BADGE_DEFINITIONS.length)
      expect(summary.summary.totalFiled).toBe(1)
      expect(summary.summary.totalEndorsed).toBe(1)
      expect(summary.summary.totalResolved).toBe(1)
      expect(summary.badgeStats.unlockedCount).toBe(3) // first_report, community_voice, resolution_champion
    })
  })
})

