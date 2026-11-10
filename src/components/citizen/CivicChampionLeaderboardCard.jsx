import { Trophy, Medal, Sparkles, UserCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

export function CivicChampionLeaderboardCard({
  leaderboard = [],
  currentUserRank = null,
  currentUserId = null,
  monthName = 'This Month',
  loading = false,
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-6 w-40 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
          <div className="h-4 w-60 bg-gray-100 dark:bg-gray-800/60 rounded animate-pulse mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-14 rounded-lg bg-gray-100 dark:bg-gray-800/50 animate-pulse"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const topParticipants = leaderboard.slice(0, 5)
  const isCurrentUserInTop = topParticipants.some((p) => p.isCurrentUser || p.uid === currentUserId)
  const currentUserEntry = leaderboard.find((p) => p.isCurrentUser || p.uid === currentUserId)

  return (
    <Card className="border border-gray-200/80 dark:border-gray-800 shadow-sm overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-amber-50/50 via-white to-primary-50/40 dark:from-amber-950/20 dark:via-gray-900 dark:to-primary-950/10 border-b border-gray-100 dark:border-gray-800 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
              <Medal className="h-5 w-5 text-amber-500 shrink-0" />
              Civic Champions Leaderboard
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-0.5">
              Top active residents fostering community improvement in {monthName}
            </CardDescription>
          </div>

          <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300 font-semibold text-xs py-0.5 px-2.5">
            {monthName}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-3">
        {leaderboard.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Trophy className="h-8 w-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm font-medium">No community activity yet this month</p>
            <p className="text-xs mt-1">
              Be the first to file a complaint or endorse an issue to claim the #1 spot!
            </p>
          </div>
        ) : (
          <div data-testid="leaderboard-list" className="space-y-2">
            {topParticipants.map((participant) => {
              const isCurrent = participant.isCurrentUser || participant.uid === currentUserId

              return (
                <div
                  key={participant.uid || participant.name}
                  data-testid={`leaderboard-item-${participant.rank}`}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    isCurrent
                      ? 'border-primary-400 bg-primary-50/60 dark:border-primary-600 dark:bg-primary-950/40 shadow-xs'
                      : 'border-gray-100 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-900/30'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Rank Badge */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center font-bold text-sm">
                      {participant.medal ? (
                        <span className="text-xl" title={`Rank ${participant.rank}`}>
                          {participant.medal}
                        </span>
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-semibold">
                          #{participant.rank}
                        </span>
                      )}
                    </div>

                    {/* Avatar */}
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 text-xs font-semibold">
                        {participant.avatar || 'AC'}
                      </AvatarFallback>
                    </Avatar>

                    {/* Details */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {participant.name}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary-600 text-white leading-none">
                            You
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>{participant.reportsCount || 0} reports</span>
                        <span>•</span>
                        <span>{participant.badgesCount || 0} badges</span>
                      </div>
                    </div>
                  </div>

                  {/* Monthly Score */}
                  <div className="text-right shrink-0">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100/80 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300/40">
                      <Sparkles className="h-3 w-3 text-amber-600" />
                      {participant.monthlyScore} pts
                    </span>
                  </div>
                </div>
              )
            })}

            {/* Current user footer if ranked below top 5 */}
            {!isCurrentUserInTop && currentUserEntry && (
              <div
                data-testid="current-user-standing"
                className="mt-3 pt-3 border-t border-dashed border-gray-200 dark:border-gray-800 flex items-center justify-between p-3 rounded-xl border border-primary-300 bg-primary-50/40 dark:bg-primary-950/20"
              >
                <div className="flex items-center gap-2.5 text-xs">
                  <UserCheck className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Your Current Monthly Standing:
                  </span>
                  <span className="font-bold text-gray-900 dark:text-white">
                    Rank #{currentUserRank}
                  </span>
                </div>
                <span className="font-bold text-xs text-primary-700 dark:text-primary-300">
                  {currentUserEntry.monthlyScore} pts
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

