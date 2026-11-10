// Civic Gamification & Badges Engine

export const GAMIFICATION_POINTS = {
  PER_REPORT_FILED: 50,
  PER_REPORT_RESOLVED: 100,
  PER_REPORT_ENDORSED: 15,
  PER_ENDORSEMENT_RECEIVED: 10,
}

export const CIVIC_LEVELS = [
  { level: 1, title: 'Civic Explorer', minXp: 0, maxXp: 99 },
  { level: 2, title: 'Active Contributor', minXp: 100, maxXp: 299 },
  { level: 3, title: 'Community Advocate', minXp: 300, maxXp: 599 },
  { level: 4, title: 'Neighborhood Guardian', minXp: 600, maxXp: 999 },
  { level: 5, title: 'Civic Champion', minXp: 1000, maxXp: Infinity },
]

export const BADGE_DEFINITIONS = [
  {
    id: 'first_report',
    title: 'First Report',
    description: 'Filed your first civic complaint to improve the community.',
    category: 'reporting',
    tier: 'bronze',
    target: 1,
    icon: 'Award',
  },
  {
    id: 'active_scout',
    title: 'Active Scout',
    description: 'Filed 5 or more civic reports around your neighborhood.',
    category: 'reporting',
    tier: 'silver',
    target: 5,
    icon: 'Shield',
  },
  {
    id: 'civic_sentinel',
    title: 'Civic Sentinel',
    description: 'Filed 10 or more civic reports, demonstrating dedication to public safety.',
    category: 'reporting',
    tier: 'gold',
    target: 10,
    icon: 'Trophy',
  },
  {
    id: 'community_voice',
    title: 'Community Voice',
    description: 'Endorsed your first neighborhood issue to support a fellow resident.',
    category: 'endorsing',
    tier: 'bronze',
    target: 1,
    icon: 'ThumbsUp',
  },
  {
    id: 'top_endorser',
    title: 'Top Endorser',
    description: 'Endorsed 5 or more community issues to help prioritize city action.',
    category: 'endorsing',
    tier: 'silver',
    target: 5,
    icon: 'Medal',
  },
  {
    id: 'civic_pillar',
    title: 'Civic Pillar',
    description: 'Endorsed 15 or more community issues to amplify neighborhood concerns.',
    category: 'endorsing',
    tier: 'gold',
    target: 15,
    icon: 'Sparkles',
  },
  {
    id: 'resolution_champion',
    title: 'Resolution Champion',
    description: 'Had at least 1 reported issue successfully resolved by municipal services.',
    category: 'resolution',
    tier: 'silver',
    target: 1,
    icon: 'CheckCircle2',
  },
  {
    id: 'city_impact',
    title: 'City Impact',
    description: 'Had 3 or more reported issues successfully resolved by the city.',
    category: 'resolution',
    tier: 'gold',
    target: 3,
    icon: 'Flame',
  },
  {
    id: 'neighborhood_watch',
    title: 'Neighborhood Watch',
    description: 'Reported civic issues across 3 or more distinct service categories.',
    category: 'reporting',
    tier: 'bronze',
    target: 3,
    icon: 'Target',
  },
  {
    id: 'crowd_magnet',
    title: 'Crowd Magnet',
    description: 'Received 5 or more community endorsements on your reported complaints.',
    category: 'impact',
    tier: 'platinum',
    target: 5,
    icon: 'Star',
  },
]

/**
 * Safely parses multiple timestamp shapes into a valid JavaScript Date.
 */
export function toDate(val) {
  if (!val) return null
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val
  if (typeof val?.toDate === 'function') {
    try {
      const d = val.toDate()
      return d instanceof Date && !isNaN(d.getTime()) ? d : null
    } catch {
      return null
    }
  }
  if (typeof val?.seconds === 'number') {
    const d = new Date(val.seconds * 1000)
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof val === 'number') {
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof val === 'string') {
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

/**
 * Checks if two dates fall into the same calendar month and year.
 */
export function isSameMonth(dateA, referenceDate = new Date()) {
  const d = toDate(dateA)
  const ref = toDate(referenceDate)
  if (!d || !ref) return false
  return (
    d.getUTCFullYear() === ref.getUTCFullYear() &&
    d.getUTCMonth() === ref.getUTCMonth()
  )
}

/**
 * Normalizes dual arguments or object arguments for gamification functions.
 */
function normalizeInputs(arg1, arg2, arg3) {
  if (Array.isArray(arg1)) {
    return {
      filedComplaints: arg1 || [],
      endorsedComplaints: arg2 || [],
      referenceDate: arg3 || new Date(),
    }
  }
  const opts = arg1 || {}
  return {
    filedComplaints: opts.filedComplaints || [],
    endorsedComplaints: opts.endorsedComplaints || [],
    referenceDate: opts.referenceDate || new Date(),
  }
}

/**
 * Computes citizen badges based on filed and endorsed complaints.
 */
export function computeCitizenBadges(arg1, arg2) {
  const { filedComplaints, endorsedComplaints } = normalizeInputs(arg1, arg2)
  const filedList = Array.isArray(filedComplaints) ? filedComplaints : []
  const endorsedList = Array.isArray(endorsedComplaints) ? endorsedComplaints : []

  const resolvedList = filedList.filter(
    (c) => c?.status === 'Resolved' || c?.status?.toLowerCase() === 'resolved'
  )

  const distinctCategories = new Set(
    filedList
      .map((c) => (c?.category || '').trim())
      .filter((cat) => cat.length > 0)
  )

  const totalEndorsementsReceived = filedList.reduce((acc, c) => {
    const count =
      typeof c?.endorsementCount === 'number'
        ? c.endorsementCount
        : Array.isArray(c?.endorsedBy)
        ? c.endorsedBy.length
        : 0
    return acc + count
  }, 0)

  const metrics = {
    first_report: filedList.length,
    active_scout: filedList.length,
    civic_sentinel: filedList.length,
    community_voice: endorsedList.length,
    top_endorser: endorsedList.length,
    civic_pillar: endorsedList.length,
    resolution_champion: resolvedList.length,
    city_impact: resolvedList.length,
    neighborhood_watch: distinctCategories.size,
    crowd_magnet: totalEndorsementsReceived,
  }

  const badges = BADGE_DEFINITIONS.map((def) => {
    const current = metrics[def.id] || 0
    const target = def.target
    const unlocked = current >= target
    const percentage = Math.min(100, Math.round((current / target) * 100))

    return {
      ...def,
      unlocked,
      progress: {
        current,
        target,
        percentage,
      },
    }
  })

  const unlockedCount = badges.filter((b) => b.unlocked).length
  const lockedCount = badges.length - unlockedCount
  const completionPercentage = Math.round((unlockedCount / badges.length) * 100)

  return {
    badges,
    stats: {
      totalBadges: badges.length,
      unlockedCount,
      lockedCount,
      completionPercentage,
    },
  }
}

/**
 * Computes all-time and monthly civic engagement scores.
 */
export function computeCivicScore(arg1, arg2, arg3) {
  const { filedComplaints, endorsedComplaints, referenceDate } = normalizeInputs(
    arg1,
    arg2,
    arg3
  )
  const ref = toDate(referenceDate) || new Date()
  const filedList = Array.isArray(filedComplaints) ? filedComplaints : []
  const endorsedList = Array.isArray(endorsedComplaints) ? endorsedComplaints : []

  // Total metrics
  const totalFiled = filedList.length
  const totalResolved = filedList.filter(
    (c) => c?.status === 'Resolved' || c?.status?.toLowerCase() === 'resolved'
  ).length
  const totalEndorsed = endorsedList.length
  const totalEndorsementsReceived = filedList.reduce((acc, c) => {
    const count =
      typeof c?.endorsementCount === 'number'
        ? c.endorsementCount
        : Array.isArray(c?.endorsedBy)
        ? c.endorsedBy.length
        : 0
    return acc + count
  }, 0)

  const allTimeScore =
    totalFiled * GAMIFICATION_POINTS.PER_REPORT_FILED +
    totalResolved * GAMIFICATION_POINTS.PER_REPORT_RESOLVED +
    totalEndorsed * GAMIFICATION_POINTS.PER_REPORT_ENDORSED +
    totalEndorsementsReceived * GAMIFICATION_POINTS.PER_ENDORSEMENT_RECEIVED

  // Monthly metrics
  const monthlyFiledComplaints = filedList.filter((c) =>
    isSameMonth(c?.createdAt, ref)
  )
  const monthlyResolvedComplaints = filedList.filter(
    (c) =>
      (c?.status === 'Resolved' || c?.status?.toLowerCase() === 'resolved') &&
      isSameMonth(c?.resolvedAt || c?.updatedAt || c?.createdAt, ref)
  )
  const monthlyEndorsedComplaints = endorsedList.filter((c) =>
    isSameMonth(c?.updatedAt || c?.createdAt, ref)
  )
  const monthlyEndorsementsReceived = monthlyFiledComplaints.reduce((acc, c) => {
    const count =
      typeof c?.endorsementCount === 'number'
        ? c.endorsementCount
        : Array.isArray(c?.endorsedBy)
        ? c.endorsedBy.length
        : 0
    return acc + count
  }, 0)

  const monthlyScore =
    monthlyFiledComplaints.length * GAMIFICATION_POINTS.PER_REPORT_FILED +
    monthlyResolvedComplaints.length * GAMIFICATION_POINTS.PER_REPORT_RESOLVED +
    monthlyEndorsedComplaints.length * GAMIFICATION_POINTS.PER_REPORT_ENDORSED +
    monthlyEndorsementsReceived * GAMIFICATION_POINTS.PER_ENDORSEMENT_RECEIVED

  const monthName = ref.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  return {
    allTimeScore,
    monthlyScore,
    monthName,
    breakdown: {
      totalFiled,
      totalResolved,
      totalEndorsed,
      totalEndorsementsReceived,
      monthlyFiled: monthlyFiledComplaints.length,
      monthlyResolved: monthlyResolvedComplaints.length,
      monthlyEndorsed: monthlyEndorsedComplaints.length,
      monthlyEndorsementsReceived,
    },
  }
}

/**
 * Computes level and tier progression based on total civic score.
 */
export function computeCitizenLevel(xp = 0) {
  const safeXp = Math.max(0, Math.floor(xp || 0))
  const currentTier =
    CIVIC_LEVELS.find((l) => safeXp >= l.minXp && safeXp <= l.maxXp) ||
    CIVIC_LEVELS[CIVIC_LEVELS.length - 1]

  const nextTier =
    CIVIC_LEVELS.find((l) => l.level === currentTier.level + 1) || null
  const isMaxLevel = !nextTier

  let progressPercentage = 100
  let pointsRemaining = 0
  let nextLevelXp = null

  if (nextTier) {
    nextLevelXp = nextTier.minXp
    const range = nextTier.minXp - currentTier.minXp
    const gained = safeXp - currentTier.minXp
    progressPercentage = Math.min(
      100,
      Math.max(0, Math.round((gained / range) * 100))
    )
    pointsRemaining = nextTier.minXp - safeXp
  }

  return {
    level: currentTier.level,
    title: currentTier.title,
    currentXp: safeXp,
    nextTitle: nextTier ? nextTier.title : null,
    nextLevelXp,
    pointsRemaining,
    progressPercentage,
    isMaxLevel,
  }
}

/**
 * Computes a ranked monthly civic champions leaderboard.
 */
export function computeCivicLeaderboard(
  participants = [],
  { referenceDate = new Date(), currentUserId = null } = {}
) {
  const list = Array.isArray(participants) ? participants : []

  const ranked = list.map((p) => {
    let monthlyScore = p.monthlyScore
    let allTimeScore = p.allTimeScore
    let badgesCount = p.unlockedBadgesCount

    if (monthlyScore === undefined && (p.filedComplaints || p.endorsedComplaints)) {
      const scoreData = computeCivicScore({
        filedComplaints: p.filedComplaints || [],
        endorsedComplaints: p.endorsedComplaints || [],
        referenceDate,
      })
      monthlyScore = scoreData.monthlyScore
      allTimeScore = scoreData.allTimeScore
    }

    monthlyScore = typeof monthlyScore === 'number' ? monthlyScore : 0
    allTimeScore = typeof allTimeScore === 'number' ? allTimeScore : 0

    if (badgesCount === undefined && p.filedComplaints) {
      const badgeData = computeCitizenBadges({
        filedComplaints: p.filedComplaints || [],
        endorsedComplaints: p.endorsedComplaints || [],
      })
      badgesCount = badgeData.stats.unlockedCount
    }

    const name = p.name || 'Anonymous Citizen'
    const initials = name
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'AC'

    return {
      uid: p.uid || p.id || '',
      name,
      avatar: p.avatar || initials,
      monthlyScore,
      allTimeScore,
      badgesCount: typeof badgesCount === 'number' ? badgesCount : 0,
      reportsCount: Array.isArray(p.filedComplaints)
        ? p.filedComplaints.length
        : p.reportsCount || 0,
      isCurrentUser: Boolean(
        currentUserId && (p.uid === currentUserId || p.id === currentUserId)
      ),
    }
  })

  // Sort by monthlyScore desc, then allTimeScore desc, then name asc
  ranked.sort((a, b) => {
    if (b.monthlyScore !== a.monthlyScore) {
      return b.monthlyScore - a.monthlyScore
    }
    if (b.allTimeScore !== a.allTimeScore) {
      return b.allTimeScore - a.allTimeScore
    }
    return a.name.localeCompare(b.name)
  })

  const leaderboard = ranked.map((item, index) => {
    const rank = index + 1
    let medal = null
    if (rank === 1) medal = '🥇'
    else if (rank === 2) medal = '🥈'
    else if (rank === 3) medal = '🥉'

    return {
      ...item,
      rank,
      medal,
    }
  })

  const currentUserEntry =
    leaderboard.find((item) => item.isCurrentUser) || null
  const currentUserRank = currentUserEntry ? currentUserEntry.rank : null

  return {
    leaderboard,
    currentUserEntry,
    currentUserRank,
    totalParticipants: leaderboard.length,
  }
}

/**
 * Returns full gamification summary for a citizen.
 */
export function getCivicGamificationSummary(arg1, arg2, arg3) {
  const { filedComplaints, endorsedComplaints, referenceDate } = normalizeInputs(
    arg1,
    arg2,
    arg3
  )
  const scoreData = computeCivicScore({
    filedComplaints,
    endorsedComplaints,
    referenceDate,
  })
  const levelData = computeCitizenLevel(scoreData.allTimeScore)
  const badgeData = computeCitizenBadges({
    filedComplaints,
    endorsedComplaints,
  })

  return {
    score: scoreData,
    level: levelData,
    badges: badgeData.badges,
    badgeStats: badgeData.stats,
    summary: {
      totalFiled: filedComplaints.length,
      totalEndorsed: endorsedComplaints.length,
      totalResolved: scoreData.breakdown.totalResolved,
      totalEndorsementsReceived: scoreData.breakdown.totalEndorsementsReceived,
      unlockedBadgesCount: badgeData.stats.unlockedCount,
      totalBadgesCount: badgeData.stats.totalBadges,
    },
  }
}

