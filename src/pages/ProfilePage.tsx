import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { DEFAULT_GAME, useApp } from '../context/AppContext'
import { q, supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { fmtDate, placementLabel, timeAgo, winRate } from '../lib/format'
import type { HistoryRow, PlayerStats, Profile, RatingPoint } from '../lib/types'
import {
  Avatar, Badge, Button, Card, DemoBadge, EmptyState, ErrorState, PageLoader, SectionTitle, SignInPrompt, StatTile,
} from '../components/ui'

interface Achievement {
  tournament_id: string
  placement: number | null
  tournaments: { name: string; status: string; completed_at: string | null; is_demo: boolean } | null
}

export default function ProfilePage() {
  const { username } = useParams()
  const { user, profile: me, loading: authLoading } = useAuth()
  const { gameById } = useApp()
  const nav = useNavigate()

  const target = username ?? me?.username ?? null

  const { data, loading, error, reload } = useQuery(async () => {
    if (!target) return null
    const profile = await q<Profile | null>(supabase.from('profiles').select('*').ilike('username', target).maybeSingle())
    if (!profile) return { profile: null }
    const gameId = profile.main_game ?? DEFAULT_GAME
    const [stats, rank, history, ratings, achievements] = await Promise.all([
      q<PlayerStats | null>(supabase.from('player_stats').select('*').eq('user_id', profile.id).eq('game_id', gameId).maybeSingle()),
      q<{ group_rank: number } | null>(supabase.from('leaderboard').select('group_rank').eq('user_id', profile.id).eq('game_id', gameId).maybeSingle()),
      q<HistoryRow[]>(supabase.from('match_history_detailed').select('*').eq('user_id', profile.id).order('played_at', { ascending: false }).limit(15)),
      q<RatingPoint[]>(supabase.from('rating_history').select('delta, rating_after, created_at').eq('user_id', profile.id).eq('game_id', gameId).order('created_at').limit(60)),
      q<Achievement[]>(supabase.from('tournament_participants').select('tournament_id, placement, tournaments(name, status, completed_at, is_demo)').eq('user_id', profile.id).not('placement', 'is', null)),
    ])
    return { profile, gameId, stats, rank, history, ratings, achievements: achievements.filter((a) => a.tournaments?.status === 'completed') }
  }, [target])

  if (!username && authLoading) return <PageLoader />
  if (!username && !user) return <Card><SignInPrompt title="Sign in to see your profile" /></Card>
  if (loading && !data) return <PageLoader />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data?.profile) {
    return <Card><EmptyState title="Player not found" text="Check the username and try again." action={<Link to="/leaderboards" className="btn btn-primary btn-md">Browse leaderboard</Link>} /></Card>
  }

  const { profile, gameId = DEFAULT_GAME, stats, rank, history = [], ratings = [], achievements = [] } = data
  const isMe = profile.id === user?.id
  const wins = stats?.wins ?? 0
  const losses = stats?.losses ?? 0
  const titles = achievements.filter((a) => a.placement === 1).length
  const finals = achievements.filter((a) => a.placement !== null && a.placement <= 2).length
  const podiums = achievements.filter((a) => a.placement !== null && a.placement <= 3).length

  const badges = [
    { icon: '🏆', title: 'Tournament Champion', desc: `${titles} title${titles === 1 ? '' : 's'}`, on: titles > 0 },
    { icon: '🥈', title: 'Finalist', desc: `${finals} final${finals === 1 ? '' : 's'}`, on: finals > 0 },
    { icon: '🥉', title: 'Podium Finisher', desc: `${podiums} podium${podiums === 1 ? '' : 's'}`, on: podiums > 0 },
    { icon: '🔥', title: 'Hot Streak', desc: 'Win 3 in a row', on: (stats?.current_streak ?? 0) >= 3 },
    { icon: '⚡', title: 'Veteran', desc: '25 verified matches', on: (stats?.matches_played ?? 0) >= 25 },
    { icon: '📈', title: 'Rising Star', desc: 'Reach 1200 rating', on: (stats?.best_rating ?? 0) >= 1200 },
  ]

  return (
    <div className="stack" style={{ gap: 24 }}>
      <Card glow>
        <div className="spread" style={{ flexWrap: 'wrap' }}>
          <div className="profile-head">
            <Avatar k={profile.avatar_key} size={84} />
            <div className="stack-sm">
              <h1>{profile.username} {profile.is_demo && <DemoBadge label="DEMO PLAYER" />}</h1>
              <div className="row-wrap">
                <Badge tone="purple">{gameById(gameId)?.name ?? 'Rocket League'}</Badge>
                {rank ? <Badge tone="blue">Rank #{rank.group_rank}</Badge> : <Badge tone="gray">Unranked</Badge>}
                <span className="muted small">Joined {fmtDate(profile.created_at)}</span>
              </div>
              {profile.bio && <p className="muted">{profile.bio}</p>}
            </div>
          </div>
          <div className="row-wrap">
            {isMe ? (
              <Link to="/settings" className="btn btn-secondary btn-md">Edit profile</Link>
            ) : (
              !profile.is_demo && <Button onClick={() => (user ? nav(`/duels?challenge=${encodeURIComponent(profile.username)}`) : nav('/auth'))}>⚔ Challenge</Button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-4">
        <StatTile label="Rating" value={stats?.rating ?? 1000} tone="purple" sub={`Peak ${stats?.best_rating ?? 1000}`} />
        <StatTile label="Wins" value={wins} tone="green" />
        <StatTile label="Losses" value={losses} tone="red" />
        <StatTile label="Win rate" value={winRate(wins, losses)} sub={`${stats?.matches_played ?? 0} matches played`} />
      </div>

      <div className="grid grid-main">
        <section>
          <SectionTitle>Match history</SectionTitle>
          <Card padded={false}>
            {history.length === 0 ? (
              <EmptyState title="No verified matches yet" text={isMe ? 'Challenge a rival or join a tournament to start your history.' : 'This player has not completed a match yet.'} />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Result</th><th>Opponent</th><th className="num">Score</th><th className="hide-sm">Type</th><th className="num hide-sm">When</th></tr></thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={`${h.kind}-${h.match_id}-${h.user_id}`}>
                        <td className={h.won ? 'win' : 'loss'}>{h.won ? 'WIN' : 'LOSS'}</td>
                        <td><Link to={`/profile/${h.opponent_username}`} className="row"><Avatar k={h.opponent_avatar} size={26} />{h.opponent_username}</Link></td>
                        <td className="num mono">{h.my_score}–{h.opp_score}</td>
                        <td className="hide-sm muted small">{h.kind === 'duel' ? 'Duel' : h.context ?? 'Tournament'}</td>
                        <td className="num hide-sm muted small">{timeAgo(h.played_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="section-gap">
            <SectionTitle>Rating over time</SectionTitle>
            <Card>
              {ratings.length < 2 ? (
                <p className="muted small">Play at least two verified matches to see your rating trend.</p>
              ) : (
                <RatingChart points={ratings} />
              )}
            </Card>
          </div>
        </section>

        <section>
          <SectionTitle>Achievements</SectionTitle>
          <div className="ach-grid">
            {badges.map((b) => (
              <div key={b.title} className={`ach ${b.on ? 'ach-on' : 'ach-off'}`}>
                <span className="ach-icon">{b.icon}</span>
                <strong>{b.title}</strong>
                <span className="muted small">{b.desc}</span>
              </div>
            ))}
          </div>

          <div className="section-gap">
            <SectionTitle>Tournament results</SectionTitle>
            <Card>
              {achievements.length === 0 ? (
                <p className="muted small">No completed tournaments yet.</p>
              ) : (
                <div className="list">
                  {achievements
                    .sort((a, b) => (b.tournaments?.completed_at ?? '').localeCompare(a.tournaments?.completed_at ?? ''))
                    .map((a) => (
                      <Link key={a.tournament_id} to={`/tournaments/${a.tournament_id}`} className="list-item">
                        <div className="grow">
                          <strong>{a.tournaments?.name}</strong> {a.tournaments?.is_demo && <DemoBadge />}
                          <div className="muted small">{fmtDate(a.tournaments?.completed_at)}</div>
                        </div>
                        <Badge tone={a.placement === 1 ? 'amber' : a.placement && a.placement <= 3 ? 'purple' : 'gray'}>{placementLabel(a.placement)}</Badge>
                      </Link>
                    ))}
                </div>
              )}
            </Card>
          </div>
        </section>
      </div>
    </div>
  )
}

function RatingChart({ points }: { points: RatingPoint[] }) {
  const W = 600, H = 150, P = 10
  const vals = points.map((p) => p.rating_after)
  const min = Math.min(...vals), max = Math.max(...vals)
  const span = Math.max(1, max - min)
  const x = (i: number) => P + (i * (W - 2 * P)) / (points.length - 1)
  const y = (v: number) => H - P - ((v - min) * (H - 2 * P)) / span
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.rating_after).toFixed(1)}`).join(' ')
  const area = `${line} L${x(points.length - 1)},${H - P} L${x(0)},${H - P} Z`
  const last = points[points.length - 1]
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Rating history chart">
        <defs>
          <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b5cf6" stopOpacity=".4" /><stop offset="1" stopColor="#8b5cf6" stopOpacity="0" /></linearGradient>
          <linearGradient id="rl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#3b82f6" /></linearGradient>
        </defs>
        <path d={area} fill="url(#rg)" />
        <path d={line} fill="none" stroke="url(#rl)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={x(points.length - 1)} cy={y(last.rating_after)} r="4" fill="#fff" />
      </svg>
      <div className="spread muted small"><span>Low {min}</span><span>Now {last.rating_after}</span><span>High {max}</span></div>
    </div>
  )
}
