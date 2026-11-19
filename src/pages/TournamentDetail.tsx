import { FormEvent, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { errMsg, q, rpc, supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { TOURNAMENT_STATUS, fmtDateTime, placementLabel } from '../lib/format'
import type { Participant, TMatch, TournamentRow } from '../lib/types'
import Bracket from '../components/Bracket'
import {
  Avatar, Badge, Button, Card, DemoBadge, EmptyState, ErrorState, Modal, Notice, PageLoader, PlayerLink, SectionTitle,
} from '../components/ui'

export default function TournamentDetail() {
  const { id = '' } = useParams()
  const { user, isMod } = useAuth()
  const { gameById } = useApp()
  const toast = useToast()
  const nav = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [report, setReport] = useState<TMatch | null>(null)

  const { data, loading, error, reload } = useQuery(async () => {
    const [t, parts, matches] = await Promise.all([
      q<TournamentRow | null>(supabase.from('tournament_overview').select('*').eq('id', id).maybeSingle()),
      q<Participant[]>(
        supabase.from('tournament_participants').select('*, profiles(username, avatar_key, is_demo)').eq('tournament_id', id).order('joined_at'),
      ),
      q<TMatch[]>(supabase.from('tournament_matches').select('*').eq('tournament_id', id)),
    ])
    return { t, parts, matches }
  }, [id])

  const names = useMemo(() => {
    const m = new Map<string, string>()
    data?.parts.forEach((p) => m.set(p.user_id, p.profiles?.username ?? 'Player'))
    return m
  }, [data])

  if (loading && !data) return <PageLoader />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data?.t) {
    return (
      <Card>
        <EmptyState title="Tournament not found" text="It may have been removed." action={<Link to="/tournaments" className="btn btn-primary btn-md">Back to tournaments</Link>} />
      </Card>
    )
  }

  const { t, parts, matches } = data
  const st = TOURNAMENT_STATUS[t.status]
  const isOrganizer = user?.id === t.created_by
  const joined = parts.some((p) => p.user_id === user?.id)
  const full = t.participant_count >= t.max_participants

  async function act(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key)
    try {
      await fn()
      toast.success(ok)
      reload()
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const canReport = (m: TMatch) =>
    m.status === 'ready' &&
    t.status === 'in_progress' &&
    (isMod || (isOrganizer && user?.id !== m.player1_id && user?.id !== m.player2_id))

  const standings = [...parts].filter((p) => p.placement !== null).sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99))
  const medal = (p: number | null) => (p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : `#${p}`)

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <Link to="/tournaments" className="muted small">← All tournaments</Link>
      </div>

      <Card glow>
        <div className="spread" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div className="stack-sm grow">
            <div className="row-wrap">
              <Badge tone={st.tone}>{st.label}</Badge>
              <Badge tone="purple">{gameById(t.game_id)?.name ?? t.game_id}</Badge>
              {t.is_demo && <DemoBadge label="DEMO TOURNAMENT" />}
            </div>
            <h1>{t.name}</h1>
            {t.description && <p className="muted">{t.description}</p>}
            <div className="meta">
              <span>Organizer: <Link to={`/profile/${t.creator_username}`}>{t.creator_username}</Link></span>
              <span>{t.participant_count}/{t.max_participants} players</span>
              <span>{fmtDateTime(t.starts_at)}</span>
            </div>
          </div>

          <div className="row-wrap">
            {t.status === 'open' && !t.is_demo && (
              <>
                {user ? (
                  joined ? (
                    <Button variant="secondary" loading={busy === 'leave'} onClick={() => act('leave', () => rpc('leave_tournament', { p_tournament: t.id }), 'You left the tournament')}>Leave</Button>
                  ) : (
                    <Button disabled={full} loading={busy === 'join'} onClick={() => act('join', () => rpc('join_tournament', { p_tournament: t.id }), "You're in! Good luck.")}>{full ? 'Tournament full' : 'Join tournament'}</Button>
                  )
                ) : (
                  <Button onClick={() => nav('/auth')}>Sign in to join</Button>
                )}
              </>
            )}
            {isOrganizer && t.status === 'open' && (
              <Button variant="primary" disabled={t.participant_count < 4} loading={busy === 'start'} onClick={() => act('start', () => rpc('start_tournament', { p_tournament: t.id }), 'Bracket generated — tournament is live')}>
                Start tournament
              </Button>
            )}
            {(isOrganizer && t.status === 'open') || (isMod && ['open', 'in_progress'].includes(t.status)) ? (
              <Button variant="danger" loading={busy === 'cancel'} onClick={() => { if (confirm('Cancel this tournament? This cannot be undone.')) void act('cancel', () => rpc('cancel_tournament', { p_tournament: t.id }), 'Tournament cancelled') }}>Cancel</Button>
            ) : null}
          </div>
        </div>
        {isOrganizer && t.status === 'open' && t.participant_count < 4 && (
          <div style={{ marginTop: 14 }}><Notice tone="blue">You need at least 4 players to start. Share this page to fill the bracket.</Notice></div>
        )}
        {t.is_demo && <div style={{ marginTop: 14 }}><Notice tone="amber">This is sample data to show how GGLeague looks. It can't be joined and doesn't affect real rankings.</Notice></div>}
      </Card>

      {t.status === 'completed' && t.winner_username && (
        <Card className="podium-1">
          <div className="row">
            <span style={{ fontSize: '2rem' }}>🏆</span>
            <div>
              <div className="muted small">CHAMPION</div>
              <h2><Link to={`/profile/${t.winner_username}`}>{t.winner_username}</Link></h2>
            </div>
          </div>
        </Card>
      )}

      {matches.length > 0 && (
        <section>
          <SectionTitle>Bracket</SectionTitle>
          <Card>
            <Bracket matches={matches} names={names} canReport={canReport} onReport={setReport} />
            {t.status === 'in_progress' && (
              <p className="muted small" style={{ marginTop: 8 }}>
                {isOrganizer || isMod ? 'Record each match result as it finishes — ratings update instantly.' : 'Results are recorded by the organizer and verified by the system.'}
              </p>
            )}
          </Card>
        </section>
      )}

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <section>
          <SectionTitle>Participants ({parts.length})</SectionTitle>
          <Card>
            {parts.length === 0 ? (
              <EmptyState title="No players yet" text="Be the first to join." />
            ) : (
              <div className="list">
                {parts.map((p) => (
                  <div key={p.user_id} className="list-item">
                    {p.seed && <span className="muted mono" style={{ width: 28 }}>#{p.seed}</span>}
                    <div className="grow">
                      <PlayerLink username={p.profiles?.username ?? 'Player'} avatar={p.profiles?.avatar_key ?? 'bolt-violet'} isDemo={p.profiles?.is_demo} />
                    </div>
                    {p.user_id === t.created_by && <Badge tone="gray">Organizer</Badge>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>

        {t.status === 'completed' && (
          <section>
            <SectionTitle>Final standings</SectionTitle>
            <div className="stack-sm">
              {standings.map((p) => (
                <div key={p.user_id} className={`podium ${p.placement && p.placement <= 3 ? `podium-${p.placement}` : ''}`}>
                  <span className="place">{medal(p.placement)}</span>
                  <Avatar k={p.profiles?.avatar_key ?? 'bolt-violet'} size={32} />
                  <div className="grow">
                    <Link to={`/profile/${p.profiles?.username}`}><strong>{p.profiles?.username}</strong></Link>
                    <div className="muted small">{placementLabel(p.placement)}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <ReportModal m={report} names={names} onClose={() => setReport(null)} onDone={() => { setReport(null); toast.success('Result recorded'); reload() }} />
    </div>
  )
}

function ReportModal({ m, names, onClose, onDone }: { m: TMatch | null; names: Map<string, string>; onClose: () => void; onDone: () => void }) {
  const [s1, setS1] = useState('')
  const [s2, setS2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!m) return
    setBusy(true)
    setError(null)
    try {
      await rpc('report_tournament_match', { p_match: m.id, p_score1: Number(s1), p_score2: Number(s2) })
      setS1(''); setS2('')
      onDone()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!m} onClose={onClose} title="Record match result">
      {m && (
        <form className="stack" onSubmit={submit}>
          {error && <Notice tone="red">{error}</Notice>}
          <Notice tone="amber">Results are final and update both players' ratings. Draws aren't allowed.</Notice>
          <div className="duel-vs">
            <strong>{names.get(m.player1_id ?? '') ?? 'Player 1'}</strong>
            <div className="row">
              <input className="input score-input" type="number" min={0} max={99} value={s1} onChange={(e) => setS1(e.target.value)} required aria-label="Player 1 score" />
              <span className="muted">–</span>
              <input className="input score-input" type="number" min={0} max={99} value={s2} onChange={(e) => setS2(e.target.value)} required aria-label="Player 2 score" />
            </div>
            <strong className="duel-side-right">{names.get(m.player2_id ?? '') ?? 'Player 2'}</strong>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={busy}>Submit result</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
