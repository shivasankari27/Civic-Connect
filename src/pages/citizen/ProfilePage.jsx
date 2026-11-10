import { useState, useEffect } from 'react'
import { Camera, Save, Loader2, BellRing, Trophy } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/firebase/services'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/hooks/useAuth'
import { getPushPermissionStatus, requestPushPermission } from '@/firebase/notifications'
import { useCivicGamification } from '@/hooks/useCivicGamification'
import { BadgesShowcaseCard } from '@/components/citizen/BadgesShowcaseCard'
import { CivicChampionLeaderboardCard } from '@/components/citizen/CivicChampionLeaderboardCard'
import toast from 'react-hot-toast'

export function ProfilePage() {
  const { user, updateUserProfile } = useAuth()
  const [name, setName] = useState(user?.name || '')
  const [email] = useState(user?.email || '')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState(() => getPushPermissionStatus())
  const [requestingPush, setRequestingPush] = useState(false)

  // Live Civic Gamification & Leaderboard State
  const {
    badges,
    score,
    level,
    stats: gamificationStats,
    leaderboard,
    currentUserRank,
    loading: gamificationLoading,
  } = useCivicGamification(user)

  const handleEnablePush = async () => {
    setRequestingPush(true)
    try {
      const res = await requestPushPermission(user?.uid)
      setPermissionStatus(res.status)
      if (res.status === 'granted') {
        toast.success('Real-time push notifications enabled!')
      } else if (res.status === 'denied') {
        toast('Push notifications were not enabled. You will still receive in-app alerts.', { icon: 'ℹ️' })
      }
    } catch (err) {
      console.error('Error enabling push notifications:', err)
    } finally {
      setRequestingPush(false)
    }
  }

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false)
      return
    }
    let cancelled = false
    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        if (cancelled || !snap.exists()) return
        const data = snap.data()
        if (data.name) setName(data.name)
        setPhone(data.phone || '')
        setAddress(data.address || '')
      })
      .catch((err) => {
        console.error('Profile load error:', err)
        toast.error('Could not load your saved profile')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user?.uid])

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  const handleSave = async (e) => {
    e.preventDefault()
    if (saving) return
    const cleanName = name.trim()
    const cleanPhone = phone.trim()
    if (!cleanName) {
      toast.error('Please enter your name')
      return
    }
    if (cleanPhone && !/^[\d\s()+.-]{7,20}$/.test(cleanPhone)) {
      toast.error('Please enter a valid phone number')
      return
    }
    setSaving(true)
    try {
      await updateUserProfile({ name: cleanName, phone: cleanPhone, address: address.trim() })
      setName(cleanName)
      toast.success('Profile updated successfully!')
    } catch (err) {
      console.error('Profile save error:', err)
      toast.error('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Profile"
        description="Manage your account settings, civic badges, and community standing"
      />

      <div className="max-w-3xl space-y-6">
        {/* User Identity Header Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-6">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarFallback className="bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 text-xl font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  aria-label="Upload profile photo"
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-white shadow-sm hover:bg-primary-700 transition-colors"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{user?.name}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 capitalize">
                    {user?.role}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    <Trophy className="h-3 w-3 text-amber-500" />
                    {level?.title || 'Civic Explorer'}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Badges & Gamification Showcase Card */}
        <BadgesShowcaseCard
          badges={badges}
          score={score}
          level={level}
          stats={gamificationStats}
          loading={gamificationLoading}
        />

        {/* Civic Champions Monthly Leaderboard Card */}
        <CivicChampionLeaderboardCard
          leaderboard={leaderboard}
          currentUserRank={currentUserRank}
          currentUserId={user?.uid}
          monthName={score?.monthName || 'This Month'}
          loading={gamificationLoading}
        />

        {/* Personal Information Form Card */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input id="fullName" value={name} onChange={(e) => setName(e.target.value)} disabled={loading} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={email} disabled className="bg-gray-50 dark:bg-gray-800/50" />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  placeholder="+1 (555) 000-0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  placeholder="123 Main Street, City"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" className="gap-2" disabled={saving || loading}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Notification Preferences Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              Notification Preferences
            </CardTitle>
            <CardDescription>
              Manage real-time browser push notifications for your complaint status updates
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Browser Web Push Notifications
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Receive alerts when an administrator updates the status, assigns a department, or resolves your report.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {permissionStatus === 'granted' ? (
                  <Badge variant="success" className="text-xs py-1 px-2.5">
                    Active
                  </Badge>
                ) : permissionStatus === 'denied' ? (
                  <Badge variant="destructive" className="text-xs py-1 px-2.5">
                    Blocked in browser
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleEnablePush}
                    disabled={requestingPush}
                    className="text-xs"
                  >
                    {requestingPush ? 'Enabling...' : 'Enable Push Notifications'}
                  </Button>
                )}
              </div>
            </div>
            {permissionStatus === 'denied' && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Notifications are blocked. To re-enable push alerts, update permissions in your browser&apos;s site settings.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
