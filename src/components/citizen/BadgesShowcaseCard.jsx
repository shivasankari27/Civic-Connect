import { useState } from 'react'
import {
  Award,
  Shield,
  Trophy,
  ThumbsUp,
  Medal,
  Sparkles,
  CheckCircle2,
  Flame,
  Target,
  Star,
  Lock,
  Check,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const ICON_MAP = {
  Award,
  Shield,
  Trophy,
  ThumbsUp,
  Medal,
  Sparkles,
  CheckCircle2,
  Flame,
  Target,
  Star,
}

const TIER_STYLES = {
  bronze: {
    badge: 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
    iconBg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    label: 'Bronze',
  },
  silver: {
    badge: 'border-slate-400 bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    iconBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700',
    label: 'Silver',
  },
  gold: {
    badge: 'border-yellow-400 bg-yellow-50 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300',
    iconBg: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-400 dark:border-yellow-700',
    label: 'Gold',
  },
  platinum: {
    badge: 'border-purple-400 bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300',
    iconBg: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-purple-400 dark:border-purple-700',
    label: 'Platinum',
  },
}

export function BadgesShowcaseCard({
  badges = [],
  score = {},
  level = {},
  stats = {},
  loading = false,
}) {
  const [activeTab, setActiveTab] = useState('all') // 'all' | 'unlocked' | 'locked'

  const unlockedCount = badges.filter((b) => b.unlocked).length
  const lockedCount = badges.length - unlockedCount

  const filteredBadges = badges.filter((b) => {
    if (activeTab === 'unlocked') return b.unlocked
    if (activeTab === 'locked') return !b.unlocked
    return true
  })

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-6 w-48 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
          <div className="h-4 w-72 bg-gray-100 dark:bg-gray-800/60 rounded animate-pulse mt-2" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-28 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 animate-pulse p-4"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden border border-gray-200/80 dark:border-gray-800 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-primary-50/50 via-white to-amber-50/40 dark:from-primary-950/20 dark:via-gray-900 dark:to-amber-950/10 border-b border-gray-100 dark:border-gray-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
              <Trophy className="h-5 w-5 text-amber-500 shrink-0" />
              Civic Badges & Achievements
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-1">
              Incentivizing civic engagement through community participation and verified reports
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span
              data-testid="monthly-score-badge"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700"
            >
              <Flame className="h-3.5 w-3.5 text-amber-600 animate-pulse" />
              <span>{score?.monthlyScore ?? 0} pts</span>
              <span className="text-[10px] font-normal opacity-80">this month</span>
            </span>

            <span
              data-testid="all-time-score-badge"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary-100/70 text-primary-800 dark:bg-primary-950/40 dark:text-primary-300 border border-primary-200 dark:border-primary-800"
            >
              <Sparkles className="h-3 w-3 text-primary-600 dark:text-primary-400" />
              {score?.allTimeScore ?? 0} XP
            </span>
          </div>
        </div>

        {/* Level Progression Progress Bar */}
        <div className="mt-4 pt-3 border-t border-gray-200/60 dark:border-gray-800/80">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[11px] font-semibold py-0 px-2 border-primary-400 text-primary-700 dark:text-primary-300">
                Level {level?.level ?? 1}
              </Badge>
              <span className="font-semibold text-gray-900 dark:text-white">
                {level?.title ?? 'Civic Explorer'}
              </span>
            </div>
            <span className="text-gray-500 dark:text-gray-400 text-[11px]">
              {level?.isMaxLevel ? (
                'Highest Rank Achieved!'
              ) : (
                `${level?.pointsRemaining ?? 0} XP to ${level?.nextTitle}`
              )}
            </span>
          </div>

          <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
            <div
              data-testid="level-progress-bar"
              className="h-full bg-gradient-to-r from-primary-500 to-amber-500 rounded-full transition-all duration-500"
              style={{ width: `${level?.progressPercentage ?? 0}%` }}
              role="progressbar"
              aria-valuenow={level?.progressPercentage ?? 0}
              aria-valuemin="0"
              aria-valuemax="100"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Quick engagement stats counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 text-center">
            <div className="text-xl font-bold text-gray-900 dark:text-white">
              {stats?.totalFiled ?? 0}
            </div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              Reports Filed
            </div>
          </div>
          <div className="p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 text-center">
            <div className="text-xl font-bold text-gray-900 dark:text-white">
              {stats?.totalEndorsed ?? 0}
            </div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              Endorsed Issues
            </div>
          </div>
          <div className="p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 text-center">
            <div className="text-xl font-bold text-gray-900 dark:text-white">
              {stats?.totalResolved ?? 0}
            </div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              Issues Resolved
            </div>
          </div>
          <div className="p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 text-center">
            <div className="text-xl font-bold text-primary-600 dark:text-primary-400">
              {unlockedCount} / {badges.length}
            </div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              Badges Unlocked
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              activeTab === 'all'
                ? 'bg-primary-600 text-white shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            All Badges ({badges.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('unlocked')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              activeTab === 'unlocked'
                ? 'bg-primary-600 text-white shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            Unlocked ({unlockedCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('locked')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              activeTab === 'locked'
                ? 'bg-primary-600 text-white shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            In Progress ({lockedCount})
          </button>
        </div>

        {/* Badges Grid */}
        <div
          data-testid="badges-grid"
          className="grid grid-cols-1 sm:grid-cols-2 gap-3.5"
        >
          {filteredBadges.map((badge) => {
            const IconComponent = ICON_MAP[badge.icon] || Award
            const tierStyle = TIER_STYLES[badge.tier] || TIER_STYLES.bronze

            return (
              <div
                key={badge.id}
                data-testid={`badge-card-${badge.id}`}
                className={`relative flex items-start gap-3.5 p-3.5 rounded-xl border transition-all ${
                  badge.unlocked
                    ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xs hover:border-primary-400 dark:hover:border-primary-600'
                    : 'border-dashed border-gray-200 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-900/20 opacity-80'
                }`}
              >
                {/* Badge Icon */}
                <div
                  className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                    badge.unlocked
                      ? tierStyle.iconBg
                      : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <IconComponent className="h-5 w-5" />
                  {!badge.unlocked && (
                    <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-gray-700 text-white text-[9px] shadow-xs">
                      <Lock className="h-2.5 w-2.5" />
                    </div>
                  )}
                </div>

                {/* Badge Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {badge.title}
                    </h3>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border ${tierStyle.badge}`}
                      >
                        {tierStyle.label}
                      </span>
                      {badge.unlocked && (
                        <span className="flex items-center text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          <Check className="h-3 w-3 mr-0.5" />
                          Unlocked
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                    {badge.description}
                  </p>

                  {/* Progress for locked badges */}
                  {!badge.unlocked && (
                    <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-gray-800">
                      <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1">
                        <span>Progress</span>
                        <span className="font-medium">
                          {badge.progress.current} / {badge.progress.target} ({badge.progress.percentage}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-primary-600 dark:bg-primary-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${badge.progress.percentage}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

