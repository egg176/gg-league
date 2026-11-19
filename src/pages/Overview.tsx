import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { DEFAULT_GAME, useApp } from '../context/AppContext'
import { q, supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { fetchAttention } from '../lib/attention'
import { TOURNAMENT_STATUS, timeAgo, winRate } from '../lib/format'
import type { DuelRow, LeaderRow, PlayerStats, TournamentRow } from '../lib/types'
import {
  Badge, Card, DemoBadge, EmptyState, ErrorState, PageLoader, PlayerLink, SectionTitle, StatTile,
} from '../components/ui'

async function load(uid: string | null, showDemo: boolean) {
  const demoFilter = <T extends { eq: (c: string, v: boolean) => T }>(b: T) => (showDemo ? b : b.eq('is_demo', false))

  const [tournaments, leaders, recent, attention, myStats, myRank] = await Promise.all([
    q<TournamentRow[]>(
      demoFilter(supabase.from('tournament_overview').select('*').in('status', ['open', 'in_progress']))
        .order('created_at', { ascending: false })
        .limit(4),
    ),
    q<LeaderRow[]>(
      demoFilter(supabase.from('leaderboard').select('*').eq('game_id', DEFAULT_GAME))
        .order('is_demo', { ascending: true })
        .order('rating', { ascending: false })
        .limit(5),
    ),
    q<DuelRow[]>(
      demoFilter(supabase.from('duel_overview').select('*').eq('status', 'completed'))
        .order('confirmed_at', { ascending: false })
        .limit(5),
    ),
    uid ? fetchAttention(uid) : Promise.resolve(null),
    uid
      ? q<PlayerStats | null>(supabase.from('player_stats').select('*').eq('user_id', uid).eq('game_id', DEFAULT_GAME).maybeSingle())
      : Promise.resolve(null),
    uid
      ? q<{ group_rank: number } | null>(supabase.from('leaderboard').select('group_rank').eq('user_id', uid).eq('game_id', DEFAULT_GAME).maybeSingle())
      : Promise.resolve(null),
  ])
  return { tournaments, leaders, recent, attention, myStats, myRank }
}

export default function Overview() {
  const { user, profile } = useAuth()
  const { showDemo } = useApp()
  const { data, loading, error, reload } = useQuery(() => load(user?.id ?? null, showDemo), [user?.id, showDemo])

  if (loading && !data) return <PageLoader />
  if (error || !data) return <ErrorState message={error ?? 'Could not load the overview'} onRetry={reload} />

  const { tournaments, leaders, recent, attention, myStats, myRank } = data

  return (
    <div className="stack" style={{ gap: 28 }}>
      <section className="hero">
        {user && profile ? (
          <>
            <Badge tone="purple">Rocket League Season</Badge>
            <h1 style={{ marginTop: 14 }}>
              Welcome back, <em>{profile.username}</em>
            </h1>
            <p className="muted">
              {attention && attention.total > 0
                ? `You have ${attention.total} thing${attention.total === 1 ? '' : 's'} waiting for you. Clear them and get back on the ladder.`
                : 'Your next rating gain is one duel away. Challenge someone or jump into a bracket.'}
            </p>
            <div className="hero-actions">
              <Link to="/duels?new=1" className="btn btn-primary btn-lg">Challenge a player</Link>
              <Link to="/tournaments" className="btn btn-secondary btn-lg">Find a tournament</Link>
            </div>
          </>
        ) : (
          <>
            <Badge tone="purple">Now live · Rocket League</Badge>
            <h1 style={{ marginTop: 14 }}>
              Compete. <em>Climb.</em> Repeat.
            </h1>
            <p className="muted">
              Enter tournaments, duel rivals 1v1 and watch your rank rise. Every result is verified — rankings can't be edited by hand.
            </p>
            <div className="hero-actions">
              <Link to="/auth" className="btn btn-primary btn-lg">Create your profile</Link>
              <Link to="/leaderboards" className="btn btn-secondary btn-lg">View leaderboard</Link>
            </div>
          </>
        )}
      </section>

      {user && (
        <section className="grid grid-4">
          <StatTile label="Rating" value={myStats?.rating ?? 1000} tone="purple" sub={myStats ? `Peak ${myStats.best_rating}` : 'Unranked until your first match'} />
          <StatTile label="Rank" value={myRank ? `#${myRank.group_rank}` : '—'} sub="Rocket League" />
          <StatTile label="Record" value={`${myStats?.wins ?? 0}–${myStats?.losses ?? 0}`} sub={`${myStats?.matches_played ?? 0} matches · ${winRate(myStats?.wins ?? 0, myStats?.losses ?? 0)}`} />
          <StatTile
            label="Streak"
            value={myStats && myStats.current_streak !== 0 ? `${Math.abs(myStats.current_streak)}${myStats.current_streak > 0 ? 'W' : 'L'}` : '—'}
            tone={myStats && myStats.current_streak > 1 ? 'green' : undefined}
            sub={myStats && myStats.current_streak > 1 ? "You're on fire" : 'Win to start one'}
          />
        </section>
      )}

      {attention && (attention.total > 0 || attention.toPlay.length > 0) && (
        <section>
          <SectionTitle action={<Link to="/duels" className="btn btn-ghost btn-sm">Open duels →</Link>}>Needs your attention</SectionTitle>
          <div className="grid grid-3">
            {attention.incoming.map((d) => (
              <Card key={d.id}><Link to="/duels"><Badge tone="amber">Challenge</Badge><p style={{ marginTop: 8 }}><strong>{d.challenger_username}</strong> challenged you</p><p className="muted small">{timeAgo(d.created_at)} · accept or decline</p></Link></Card>
            ))}
            {attention.toConfirm.map((d) => (
              <Card key={d.id}><Link to="/duels"><Badge tone="red">Confirm result</Badge><p style={{ marginTop: 8 }}><strong>{d.reported_by === d.challenger_id ? d.challenger_username : d.opponent_username}</strong> reported a result</p><p className="muted small">Confirm it or open a dispute</p></Link></Card>
            ))}
            {attention.toPlay.map((d) => (
              <Card key={d.id}><Link to={`/duels/${d.id}`}><Badge tone="blue">Open lobby</Badge><p style={{ marginTop: 8 }}>Duel vs <strong>{d.challenger_id === user?.id ? d.opponent_username : d.challenger_username}</strong></p><p className="muted small">Play, then submit the score</p></Link></Card>
            ))}
            {attention.invites.map((i) => (
              <Card key={i.id}><Link to="/teams"><Badge tone="purple">Team invite</Badge><p style={{ marginTop: 8 }}><strong>[{i.team_tag}] {i.team_name}</strong></p><p className="muted small">Invited by {i.inviter_username}</p></Link></Card>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-main">
        <section>
          <SectionTitle action={<Link to="/tournaments" className="btn btn-ghost btn-sm">All tournaments →</Link>}>Tournaments</SectionTitle>
          {tournaments.length === 0 ? (
            <Card><EmptyState title="No tournaments right now" text="Be the first to create one and invite the community." action={<Link to="/tournaments?new=1" className="btn btn-primary btn-md">Create tournament</Link>} /></Card>
          ) : (
            <div className="grid grid-2">
              {tournaments.map((t) => {
                const st = TOURNAMENT_STATUS[t.status]
                return (
                  <Link key={t.id} to={`/tournaments/${t.id}`} className="card t-card">
                    <div className="spread"><Badge tone={st.tone}>{st.label}</Badge>{t.is_demo && <DemoBadge />}</div>
                    <h3>{t.name}</h3>
                    <div className="progress"><span style={{ width: `${(100 * t.participant_count) / t.max_participants}%` }} /></div>
                    <div className="meta"><span>{t.participant_count}/{t.max_participants} players</span><span>by {t.creator_username}</span></div>
                  </Link>
                )
              })}
            </div>
          )}

          <div className="section-gap">
            <SectionTitle>Recent verified results</SectionTitle>
            <Card>
              {recent.length === 0 ? (
                <EmptyState title="No verified duels yet" text="Results appear here once both players confirm the score." />
              ) : (
                <div className="list">
                  {recent.map((d) => {
                    const cWon = d.winner_id === d.challenger_id
                    return (
                      <div key={d.id} className="list-item">
                        <div className="grow row-wrap">
                          <span className={cWon ? 'win' : ''}>{d.challenger_username}</span>
                          <span className="muted">vs</span>
                          <span className={!cWon ? 'win' : ''}>{d.opponent_username}</span>
                          {d.is_demo && <DemoBadge />}
                        </div>
                        <strong className="mono">{d.challenger_score}–{d.opponent_score}</strong>
                        <span className="muted small hide-sm">{timeAgo(d.confirmed_at)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>
        </section>

        <section>
          <SectionTitle action={<Link to="/leaderboards" className="btn btn-ghost btn-sm">Full ladder →</Link>}>Top players</SectionTitle>
          <Card>
            {leaders.length === 0 ? (
              <EmptyState title="The ladder is empty" text="Play a verified match to claim the first spot." />
            ) : (
              <div className="list">
                {leaders.map((l, i) => (
                  <div key={l.user_id} className="list-item">
                    <span className={`rank rank-${i + 1}`} style={{ width: 30 }}>{i + 1}</span>
                    <div className="grow"><PlayerLink username={l.username} avatar={l.avatar_key} isDemo={l.is_demo} /></div>
                    <strong className="mono">{l.rating}</strong>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      </div>
    </div>
  )
}
