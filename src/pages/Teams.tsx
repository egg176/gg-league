import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { DEFAULT_GAME, useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { errMsg, q, rpc, supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { winRate } from '../lib/format'
import type { TeamInvite, TeamRow } from '../lib/types'
import {
  Badge, Button, Card, DemoBadge, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, PageLoader, SectionTitle,
} from '../components/ui'

export default function Teams() {
  const { user } = useAuth()
  const { showDemo, activeGames } = useApp()
  const toast = useToast()
  const nav = useNavigate()
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const { data, loading, error, reload } = useQuery(async () => {
    let tb = supabase.from('team_overview').select('*')
    if (!showDemo) tb = tb.eq('is_demo', false)
    const [teams, mine, invites] = await Promise.all([
      q<TeamRow[]>(tb.order('is_demo', { ascending: true }).order('avg_rating', { ascending: false }).limit(100)),
      user ? q<{ team_id: string }[]>(supabase.from('team_members').select('team_id').eq('user_id', user.id)) : Promise.resolve([]),
      user ? q<TeamInvite[]>(supabase.from('team_invite_overview').select('*').eq('user_id', user.id).eq('status', 'pending')) : Promise.resolve([]),
    ])
    return { teams, myTeamIds: mine.map((m) => m.team_id), invites }
  }, [user?.id, showDemo])

  async function respond(inv: TeamInvite, accept: boolean) {
    setBusy(inv.id)
    try {
      await rpc('respond_team_invite', { p_invite: inv.id, p_accept: accept })
      toast.success(accept ? `Welcome to ${inv.team_name}!` : 'Invite declined')
      reload()
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const myTeams = data?.teams.filter((t) => data.myTeamIds.includes(t.id)) ?? []

  return (
    <>
      <PageHeader
        title="Teams"
        subtitle="Squad up, share a banner and climb the team rankings together."
        actions={<Button onClick={() => (user ? setCreating(true) : nav('/auth'))}>+ Create team</Button>}
      />

      {loading && !data ? (
        <PageLoader />
      ) : error || !data ? (
        <ErrorState message={error ?? 'Could not load teams'} onRetry={reload} />
      ) : (
        <div className="stack" style={{ gap: 26 }}>
          {data.invites.length > 0 && (
            <section>
              <SectionTitle>Team invites</SectionTitle>
              <div className="grid grid-2">
                {data.invites.map((i) => (
                  <Card key={i.id} className="spread">
                    <div>
                      <Badge tone="purple">Invite</Badge>
                      <p style={{ marginTop: 6 }}><strong>[{i.team_tag}] {i.team_name}</strong></p>
                      <p className="muted small">from {i.inviter_username}</p>
                    </div>
                    <div className="row">
                      <Button size="sm" loading={busy === i.id} onClick={() => respond(i, true)}>Join</Button>
                      <Button size="sm" variant="ghost" onClick={() => respond(i, false)}>Decline</Button>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {myTeams.length > 0 && (
            <section>
              <SectionTitle>Your team</SectionTitle>
              {myTeams.map((t) => (
                <Link key={t.id} to={`/teams/${t.id}`} className="card card-glow spread">
                  <div className="row">
                    <TagBlock tag={t.tag} />
                    <div>
                      <h3>{t.name}</h3>
                      <p className="muted small">{t.member_count} members · rank #{t.group_rank}</p>
                    </div>
                  </div>
                  <strong className="mono">{t.avg_rating}</strong>
                </Link>
              ))}
            </section>
          )}

          <section>
            <SectionTitle>Team rankings</SectionTitle>
            {data.teams.length === 0 ? (
              <Card>
                <EmptyState title="No teams yet" text="Start the first squad and invite your friends." action={<Button onClick={() => (user ? setCreating(true) : nav('/auth'))}>Create team</Button>} />
              </Card>
            ) : (
              <Card padded={false}>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>#</th><th>Team</th><th className="num hide-sm">Members</th><th className="num">Avg rating</th><th className="num hide-sm">W–L</th><th className="num hide-sm">Win %</th></tr>
                    </thead>
                    <tbody>
                      {data.teams.map((t, i) => (
                        <tr key={t.id}>
                          <td className={`rank rank-${i + 1}`}>{i + 1}</td>
                          <td>
                            <Link to={`/teams/${t.id}`} className="row">
                              <TagBlock tag={t.tag} small />
                              <span><strong>{t.name}</strong> {t.is_demo && <DemoBadge />}<br /><span className="muted small">{t.is_open ? 'Open to join' : 'Invite only'}</span></span>
                            </Link>
                          </td>
                          <td className="num hide-sm">{t.member_count}</td>
                          <td className="num"><strong>{t.avg_rating}</strong></td>
                          <td className="num hide-sm">{t.wins}–{t.losses}</td>
                          <td className="num hide-sm">{winRate(t.wins, t.losses)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </section>
        </div>
      )}

      <CreateTeam
        open={creating}
        onClose={() => setCreating(false)}
        games={activeGames}
        onCreated={(id) => { toast.success('Team created'); nav(`/teams/${id}`) }}
      />
    </>
  )
}

export function TagBlock({ tag, small }: { tag: string; small?: boolean }) {
  const s = small ? 36 : 48
  return (
    <span className="avatar" style={{ width: s, height: s, background: 'linear-gradient(135deg, rgba(139,92,246,.35), rgba(59,130,246,.25))', border: '1px solid rgba(139,92,246,.5)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: small ? '.72rem' : '.9rem', letterSpacing: '.02em' }}>
      {tag}
    </span>
  )
}

function CreateTeam({ open, onClose, games, onCreated }: { open: boolean; onClose: () => void; games: { id: string; name: string }[]; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [tag, setTag] = useState('')
  const [desc, setDesc] = useState('')
  const [game, setGame] = useState(DEFAULT_GAME)
  const [isOpen, setIsOpen] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const id = await rpc<string>('create_team', { p_game: game, p_name: name, p_tag: tag, p_description: desc || null, p_is_open: isOpen })
      setName(''); setTag(''); setDesc('')
      onCreated(id)
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create a team">
      <form className="stack" onSubmit={submit}>
        {error && <Notice tone="red">{error}</Notice>}
        <div className="grid grid-2" style={{ gridTemplateColumns: '2fr 1fr' }}>
          <Field label="Team name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} minLength={3} maxLength={30} required /></Field>
          <Field label="Tag" hint="2–5 characters"><input className="input" value={tag} onChange={(e) => setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} minLength={2} maxLength={5} required /></Field>
        </div>
        <Field label="Game">
          <select className="select" value={game} onChange={(e) => setGame(e.target.value)}>
            {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
        <Field label="Description (optional)"><textarea className="textarea" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={280} /></Field>
        <label className="toggle"><input type="checkbox" checked={isOpen} onChange={(e) => setIsOpen(e.target.checked)} /><span>Anyone can join (uncheck for invite-only)</span></label>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Create team</Button>
        </div>
      </form>
    </Modal>
  )
}
