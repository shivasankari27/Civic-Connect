import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfilePage } from './ProfilePage'

const mockUser = {
  uid: 'citizen-42',
  name: 'Sara Connor',
  email: 'sara@example.com',
  role: 'citizen',
}

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    updateUserProfile: vi.fn(),
  }),
}))

vi.mock('@/firebase/services', () => ({
  db: {},
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  getDocs: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
  limit: vi.fn(),
}))

vi.mock('@/firebase/notifications', () => ({
  getPushPermissionStatus: () => 'default',
  requestPushPermission: vi.fn(),
}))

vi.mock('@/hooks/useCivicGamification', () => ({
  useCivicGamification: () => ({
    badges: [
      {
        id: 'first_report',
        title: 'First Report',
        description: 'Filed your first civic complaint.',
        category: 'reporting',
        tier: 'bronze',
        target: 1,
        icon: 'Award',
        unlocked: true,
        progress: { current: 1, target: 1, percentage: 100 },
      },
    ],
    score: {
      allTimeScore: 250,
      monthlyScore: 150,
      monthName: 'November 2026',
      breakdown: {
        totalFiled: 2,
        totalResolved: 1,
        totalEndorsed: 3,
        totalEndorsementsReceived: 2,
      },
    },
    level: {
      level: 2,
      title: 'Active Contributor',
      currentXp: 250,
      nextTitle: 'Community Advocate',
      nextLevelXp: 300,
      pointsRemaining: 50,
      progressPercentage: 75,
      isMaxLevel: false,
    },
    stats: {
      totalFiled: 2,
      totalEndorsed: 3,
      totalResolved: 1,
      totalEndorsementsReceived: 2,
    },
    leaderboard: [
      {
        uid: 'citizen-42',
        name: 'Sara Connor',
        avatar: 'SC',
        monthlyScore: 150,
        allTimeScore: 250,
        reportsCount: 2,
        badgesCount: 1,
        rank: 1,
        medal: '🥇',
        isCurrentUser: true,
      },
    ],
    currentUserRank: 1,
    loading: false,
  }),
}))

describe('ProfilePage with Civic Gamification', () => {
  it('renders user identity, gamification badges showcase, and leaderboard', () => {
    const html = renderToStaticMarkup(<ProfilePage />)

    // User identity
    expect(html).toContain('Sara Connor')
    expect(html).toContain('sara@example.com')
    expect(html).toContain('citizen')

    // Gamification level pill in header
    expect(html).toContain('Active Contributor')

    // Badges Showcase card
    expect(html).toContain('Civic Badges &amp; Achievements')
    expect(html).toContain('150 pts')
    expect(html).toContain('250 XP')
    expect(html).toContain('First Report')
    expect(html).toContain('Unlocked')

    // Civic Champions Leaderboard card
    expect(html).toContain('Civic Champions Leaderboard')
    expect(html).toContain('🥇')
    expect(html).toContain('Sara Connor')
    expect(html).toContain('You')
  })
})

