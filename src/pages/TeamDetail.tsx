import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { errMsg, q, rpc, supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { winRate } from '../lib/format'
import type { PlayerStats, TeamInvite, TeamMember, TeamRow } from '../lib/types'
import PlayerPicker from '../components/PlayerPicker'
import { TagBlock } from './Teams'
import { Badge, Button, Card, DemoBadge, EmptyState, ErrorState, Modal, Notice, PageLoader, PlayerLink, SectionTitle, StatTile } from '../components/ui'

export default function TeamDetail() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const { gameById } = useApp()
  const toast = useToast()
  const nav = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)

  const { data, loading, error, reload } = useQuery(async () => {
    const team = await q<TeamRow | null>(supabase.from('team_overview').select('*').eq('id', id).maybeSingle())
    if (!team) return null
    const members = await q<TeamMember[]>(
      supabase.from('team_members').select('*, profiles(username, avatar_key, is_demo)').eq('team_id', id).order('joined_at'),
    )
    const ids = members.map((m) => m.user_id)
    const [stats, invites] = await Promise.all([
      ids.length ? q<PlayerStats[]>(supabase.from('player_stats').select('*').eq('game_id', team.game_id).in('user_id', ids)) : Promise.resolve([]),
      q<TeamInvite[]>(supabase.from('team_invite_overview').select('*').eq('team_id', id).eq('status', 'pending')),
    ])
    return { team, members, stats, invites }
  }, [id, user?.id])

  async function act(key: string, fn: () => Promise<unknown>, ok: string, after?: () => void) {
    setBusy(key)
    try {
      await fn()
      toast.success(ok)
      after ? after() : reload()
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  if (loading && !data) return <PageLoader />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <Card><EmptyState title="Team not found" action={<Link to="/teams" className="btn btn-primary btn-md">Back to teams</Link>} /></Card>

  const { team, members, stats, invites } = data
  const isOwner = user?.id === team.owner_id
  const isMember = members.some((m) => m.user_id === user?.id)
  const full = members.length >= (gameById(team.game_id)?.roster_size ?? 5)
  const stat = (uid: string) => stats.find((s) => s.user_id === uid)
  const visibleInvites = isOwner ? invites : []

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div><Link to="/teams" className="muted small">← All teams</Link></div>

      <Card glow>
        <div className="spread" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <TagBlock tag={team.tag} />
            <div className="stack-sm">
              <div className="row-wrap">
                <h1>{team.name}</h1>
                {team.is_demo && <DemoBadge label="DEMO TEAM" />}
              </div>
              <div className="row-wrap">
                <Badge tone="purple">{gameById(team.game_id)?.name}</Badge>
                <Badge tone={team.is_open ? 'green' : 'gray'}>{team.is_open ? 'Open to join' : 'Invite only'}</Badge>
              </div>
              {team.description && <p className="muted">{team.description}</p>}
            </div>
          </div>
          <div className="row-wrap">
            {!isMember && user && !team.is_demo && team.is_open && (
              <Button disabled={full} loading={busy === 'join'} onClick={() => act('join', () => rpc('join_team', { p_team: team.id }), `You joined ${team.name}`)}>{full ? 'Roster full' : 'Join team'}</Button>
            )}
            {!user && <Button onClick={() => nav('/auth')}>Sign in to join</Button>}
            {isOwner && <Button variant="secondary" disabled={full} onClick={() => setInviting(true)}>Invite player</Button>}
            {isMember && (
              <Button variant="danger" loading={busy === 'leave'} onClick={() => { if (confirm(isOwner && members.length === 1 ? 'You are the last member — leaving will disband the team. Continue?' : 'Leave this team?')) void act('leave', () => rpc('leave_team', { p_team: team.id }), 'You left the team', () => nav('/teams')) }}>Leave team</Button>
            )}
          </div>
        </div>
        {team.is_demo && <div style={{ marginTop: 14 }}><Notice tone="amber">Sample team to show how rankings look. It can't be joined or invited to.</Notice></div>}
      </Card>

      <div className="grid grid-4">
        <StatTile label="Rank" value={`#${team.group_rank}`} tone="purple" />
        <StatTile label="Avg rating" value={team.avg_rating} />
        <StatTile label="Record" value={`${team.wins}–${team.losses}`} />
        <StatTile label="Win rate" value={winRate(team.wins, team.losses)} />
      </div>

      <section>
        <SectionTitle>Roster ({members.length}/{gameById(team.game_id)?.roster_size ?? 5})</SectionTitle>
        <Card padded={false}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Player</th><th className="num">Rating</th><th className="num hide-sm">W–L</th><th /></tr></thead>
              <tbody>
                {members.map((m) => {
                  const s = stat(m.user_id)
                  return (
                    <tr key={m.user_id} className={m.user_id === user?.id ? 'row-me' : ''}>
                      <td>
                        <PlayerLink username={m.profiles?.username ?? 'Player'} avatar={m.profiles?.avatar_key ?? 'bolt-violet'} isDemo={m.profiles?.is_demo} sub={m.role === 'owner' ? 'Team owner' : undefined} />
                      </td>
                      <td className="num"><strong>{s?.rating ?? 1000}</strong></td>
                      <td className="num hide-sm">{s?.wins ?? 0}–{s?.losses ?? 0}</td>
                      <td className="num">
                        {isOwner && m.user_id !== user?.id && (
                          <Button size="sm" variant="ghost" loading={busy === m.user_id} onClick={() => { if (confirm(`Remove ${m.profiles?.username}?`)) void act(m.user_id, () => rpc('remove_team_member', { p_team: team.id, p_user: m.user_id }), 'Player removed') }}>Remove</Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {visibleInvites.length > 0 && (
        <section>
          <SectionTitle>Pending invites</SectionTitle>
          <Card>
            <div className="list">
              {visibleInvites.map((i) => (
                <div key={i.id} className="list-item">
                  <div className="grow"><PlayerLink username={i.invitee_username} avatar={i.invitee_avatar} /></div>
                  <Button size="sm" variant="ghost" loading={busy === i.id} onClick={() => act(i.id, () => rpc('cancel_team_invite', { p_invite: i.id }), 'Invite cancelled')}>Cancel</Button>
                </div>
              ))}
            </div>
          </Card>
        </section>
      )}

      <Modal open={inviting} onClose={() => setInviting(false)} title="Invite a player">
        <PlayerPicker
          excludeIds={members.map((m) => m.user_id)}
          onPick={(p) =>
            act('invite', () => rpc('invite_to_team', { p_team: team.id, p_user: p.id }), `Invite sent to ${p.username}`, () => { setInviting(false); reload() })
          }
        />
      </Modal>
    </div>
  )
}
