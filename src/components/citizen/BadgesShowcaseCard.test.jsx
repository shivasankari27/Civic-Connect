import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BadgesShowcaseCard } from './BadgesShowcaseCard'

const mockBadges = [
  {
    id: 'first_report',
    title: 'First Report',
    description: 'Filed your first civic complaint to improve the community.',
    category: 'reporting',
    tier: 'bronze',
    target: 1,
    icon: 'Award',
    unlocked: true,
    progress: { current: 1, target: 1, percentage: 100 },
  },
  {
    id: 'active_scout',
    title: 'Active Scout',
    description: 'Filed 5 or more civic reports around your neighborhood.',
    category: 'reporting',
    tier: 'silver',
    target: 5,
    icon: 'Shield',
    unlocked: false,
    progress: { current: 2, target: 5, percentage: 40 },
  },
  {
    id: 'top_endorser',
    title: 'Top Endorser',
    description: 'Endorsed 5 or more community issues to help prioritize city action.',
    category: 'endorsing',
    tier: 'silver',
    target: 5,
    icon: 'Medal',
    unlocked: true,
    progress: { current: 5, target: 5, percentage: 100 },
  },
]

const mockScore = {
  monthlyScore: 180,
  allTimeScore: 450,
  monthName: 'November 2026',
}

const mockLevel = {
  level: 2,
  title: 'Active Contributor',
  currentXp: 450,
  nextTitle: 'Community Advocate',
  nextLevelXp: 600,
  pointsRemaining: 150,
  progressPercentage: 50,
  isMaxLevel: false,
}

const mockStats = {
  totalFiled: 2,
  totalEndorsed: 5,
  totalResolved: 1,
}

describe('BadgesShowcaseCard Component', () => {
  it('renders loading skeleton when loading prop is true', () => {
    const html = renderToStaticMarkup(<BadgesShowcaseCard loading={true} />)
    expect(html).toContain('animate-pulse')
  })

  it('renders monthly score and all-time score badges', () => {
    const html = renderToStaticMarkup(
      <BadgesShowcaseCard
        badges={mockBadges}
        score={mockScore}
        level={mockLevel}
        stats={mockStats}
      />
    )
    expect(html).toContain('180 pts')
    expect(html).toContain('this month')
    expect(html).toContain('450 XP')
  })

  it('renders level progress and remaining XP', () => {
    const html = renderToStaticMarkup(
      <BadgesShowcaseCard
        badges={mockBadges}
        score={mockScore}
        level={mockLevel}
        stats={mockStats}
      />
    )
    expect(html).toContain('Level 2')
    expect(html).toContain('Active Contributor')
    expect(html).toContain('150 XP to Community Advocate')
    expect(html).toContain('width:50%')
  })

  it('renders quick stats counters accurately', () => {
    const html = renderToStaticMarkup(
      <BadgesShowcaseCard
        badges={mockBadges}
        score={mockScore}
        level={mockLevel}
        stats={mockStats}
      />
    )
    expect(html).toContain('Reports Filed')
    expect(html).toContain('Endorsed Issues')
    expect(html).toContain('Issues Resolved')
    // 2 unlocked out of 3 total badges
    expect(html).toContain('2 / 3')
  })

  it('renders badge cards with both unlocked status and progress for locked ones', () => {
    const html = renderToStaticMarkup(
      <BadgesShowcaseCard
        badges={mockBadges}
        score={mockScore}
        level={mockLevel}
        stats={mockStats}
      />
    )
    expect(html).toContain('First Report')
    expect(html).toContain('Active Scout')
    expect(html).toContain('Top Endorser')
    expect(html).toContain('Unlocked')
    expect(html).toContain('2 / 5 (40%)')
  })

  it('renders filter tabs with counts for All, Unlocked, and In Progress', () => {
    const html = renderToStaticMarkup(
      <BadgesShowcaseCard
        badges={mockBadges}
        score={mockScore}
        level={mockLevel}
        stats={mockStats}
      />
    )
    expect(html).toContain('All Badges (3)')
    expect(html).toContain('Unlocked (2)')
    expect(html).toContain('In Progress (1)')
  })
})
