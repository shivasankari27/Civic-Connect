import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CivicChampionLeaderboardCard } from './CivicChampionLeaderboardCard'

const mockLeaderboard = [
  {
    uid: 'u-1',
    name: 'Aria Stark',
    avatar: 'AS',
    monthlyScore: 350,
    allTimeScore: 820,
    reportsCount: 5,
    badgesCount: 4,
    rank: 1,
    medal: '🥇',
    isCurrentUser: false,
  },
  {
    uid: 'u-2',
    name: 'Ben Kenobi',
    avatar: 'BK',
    monthlyScore: 280,
    allTimeScore: 610,
    reportsCount: 4,
    badgesCount: 3,
    rank: 2,
    medal: '🥈',
    isCurrentUser: false,
  },
  {
    uid: 'u-3',
    name: 'Citizen Jane',
    avatar: 'CJ',
    monthlyScore: 190,
    allTimeScore: 400,
    reportsCount: 2,
    badgesCount: 2,
    rank: 3,
    medal: '🥉',
    isCurrentUser: true,
  },
]

describe('CivicChampionLeaderboardCard Component', () => {
  it('renders loading placeholder when loading is true', () => {
    const html = renderToStaticMarkup(<CivicChampionLeaderboardCard loading={true} />)
    expect(html).toContain('animate-pulse')
  })

  it('renders empty state when leaderboard is empty', () => {
    const html = renderToStaticMarkup(
      <CivicChampionLeaderboardCard leaderboard={[]} monthName="November 2026" />
    )
    expect(html).toContain('No community activity yet this month')
    expect(html).toContain('November 2026')
  })

  it('renders top participants with ranks, medals, names, and monthly points', () => {
    const html = renderToStaticMarkup(
      <CivicChampionLeaderboardCard
        leaderboard={mockLeaderboard}
        currentUserRank={3}
        currentUserId="u-3"
        monthName="November 2026"
      />
    )

    expect(html).toContain('Aria Stark')
    expect(html).toContain('350 pts')
    expect(html).toContain('🥇')

    expect(html).toContain('Ben Kenobi')
    expect(html).toContain('280 pts')
    expect(html).toContain('🥈')

    expect(html).toContain('Citizen Jane')
    expect(html).toContain('190 pts')
    expect(html).toContain('🥉')
    expect(html).toContain('You')
  })

  it('renders current user standing banner when user is ranked below top 5', () => {
    const extendedLeaderboard = [
      ...Array.from({ length: 5 }, (_, i) => ({
        uid: `top-${i}`,
        name: `Champion ${i + 1}`,
        avatar: `C${i + 1}`,
        monthlyScore: 500 - i * 50,
        reportsCount: 6,
        badgesCount: 5,
        rank: i + 1,
        medal: i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null,
        isCurrentUser: false,
      })),
      {
        uid: 'user-self',
        name: 'Myself',
        avatar: 'ME',
        monthlyScore: 120,
        reportsCount: 1,
        badgesCount: 1,
        rank: 9,
        medal: null,
        isCurrentUser: true,
      },
    ]

    const html = renderToStaticMarkup(
      <CivicChampionLeaderboardCard
        leaderboard={extendedLeaderboard}
        currentUserRank={9}
        currentUserId="user-self"
        monthName="November 2026"
      />
    )

    expect(html).toContain('Your Current Monthly Standing:')
    expect(html).toContain('Rank #9')
    expect(html).toContain('120 pts')
  })
})
