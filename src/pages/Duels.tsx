import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { DEFAULT_GAME, useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { errMsg, q, rpc, supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { DUEL_STATUS, timeAgo } from '../lib/format'
import type { DisputeRow, DuelRow, Profile } from '../lib/types'
import PlayerPicker from '../components/PlayerPicker'
import {
  Avatar, Badge, Button, Card, DemoBadge, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, PageLoader, SignInPrompt, Tabs,
} from '../components/ui'

type Tab = 'active' | 'history' | 'moderation'

export default function Duels() {
  const { user, isMod } = useAuth()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const [tab, setTab] = useState<Tab>('active')
  const [challengeOpen, setChallengeOpen] = useState(false)
  const [preset, setPreset] = useState<Profile | null>(null)

  useEffect(() => {
    const wantsNew = params.get('new') === '1'
    const target = params.get('challenge')
    if (!wantsNew && !target) return
    setParams({}, { replace: true })
    if (!user) {
      nav('/auth')
      return
    }
    setChallengeOpen(true)
    if (target) {
      supabase.from('profiles').select('*').eq('username', target).eq('is_demo', false).maybeSingle().then(({ data }) => {
        if (data && data.id !== user.id) setPreset(data as Profile)
      })
    }
  }, [params, setParams, user, nav])

  const duels = useQuery(async () => {
    if (!user) return { rows: [] as DuelRow[], disputes: [] as DisputeRow[] }
    const rows = await q<DuelRow[]>(
      supabase.from('duel_overview').select('*').or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`).order('updated_at', { ascending: false }).limit(100),
    )
    const disputedIds = rows.filter((r) => r.status === 'disputed').map((r) => r.id)
    const disputes = disputedIds.length
      ? await q<DisputeRow[]>(supabase.from('dispute_overview').select('*').in('duel_id', disputedIds).eq('status', 'open'))
      : []
    return { rows, disputes }
  }, [user?.id])

  const modQ = useQuery(async () => {
    if (!isMod) return [] as DisputeRow[]
    return q<DisputeRow[]>(supabase.from('dispute_overview').select('*').eq('status', 'open').order('created_at'))
  }, [isMod])

  if (!user) {
    return (
      <>
        <PageHeader title="Duels" subtitle="Challenge anyone to a ranked 1v1." />
        <Card><SignInPrompt title="Sign in to duel" text="Challenge other players, submit results and let your opponent confirm them. Every confirmed win moves your rating." /></Card>
      </>
    )
  }

  const rows = duels.data?.rows ?? []
  const active = rows.filter((d) => ['pending', 'accepted', 'awaiting_confirmation', 'disputed'].includes(d.status))
  const history = rows.filter((d) => ['completed', 'declined', 'cancelled', 'voided'].includes(d.status))
  const needsMe = active.filter((d) => (d.status === 'pending' && d.opponent_id === user.id) || (d.status === 'awaiting_confirmation' && d.reported_by !== user.id)).length
  const shown = tab === 'active' ? active : history

  function refresh() {
    duels.reload()
    modQ.reload()
  }

  return (
    <>
      <PageHeader
        title="Duels"
        subtitle="Ranked 1v1s. A result only counts once your opponent confirms it."
        actions={<Button onClick={() => { setPreset(null); setChallengeOpen(true) }}>⚔ Challenge a player</Button>}
      />

      <div style={{ marginBottom: 20 }}>
        <Tabs<Tab>
          tabs={[
            { id: 'active', label: 'Active', badge: needsMe || undefined },
            { id: 'history', label: 'History' },
            ...(isMod ? [{ id: 'moderation' as Tab, label: 'Disputes', badge: modQ.data?.length || undefined }] : []),
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {duels.loading && !duels.data ? (
        <PageLoader />
      ) : duels.error ? (
        <ErrorState message={duels.error} onRetry={duels.reload} />
      ) : tab === 'moderation' ? (
        <ModerationPanel disputes={modQ.data ?? []} loading={modQ.loading} error={modQ.error} onChanged={refresh} />
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState
            title={tab === 'active' ? 'No active duels' : 'No duel history yet'}
            text={tab === 'active' ? 'Pick a rival and throw down a challenge. Winners climb the ladder.' : 'Finished duels will show up here.'}
            action={tab === 'active' ? <Button onClick={() => setChallengeOpen(true)}>Challenge a player</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="grid grid-2">
          {shown.map((d) => (
            <DuelCard key={d.id} d={d} me={user.id} dispute={duels.data?.disputes.find((x) => x.duel_id === d.id)} onChanged={refresh} />
          ))}
        </div>
      )}

      <ChallengeModal
        open={challengeOpen}
        preset={preset}
        onClose={() => { setChallengeOpen(false); setPreset(null) }}
        onDone={() => { setChallengeOpen(false); setPreset(null); setTab('active'); refresh() }}
      />
    </>
  )
}

/* ---------------- Challenge modal ---------------- */

function ChallengeModal({ open, preset, onClose, onDone }: { open: boolean; preset: Profile | null; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth()
  const { activeGames } = useApp()
  const toast = useToast()
  const [picked, setPicked] = useState<Profile | null>(null)
  const [game, setGame] = useState(DEFAULT_GAME)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const opponent = picked ?? preset

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!opponent) return
    setBusy(true)
    setError(null)
    try {
      await rpc('challenge_duel', { p_opponent: opponent.id, p_game: game, p_message: msg || null })
      toast.success(`Challenge sent to ${opponent.username}`)
      setPicked(null); setMsg('')
      onDone()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={() => { setPicked(null); onClose() }} title="Challenge a player">
      <form className="stack" onSubmit={submit}>
        {error && <Notice tone="red">{error}</Notice>}
        {opponent ? (
          <div className="spread podium">
            <div className="row"><Avatar k={opponent.avatar_key} size={36} /><strong>{opponent.username}</strong></div>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setPicked(null); }}>Change</Button>
          </div>
        ) : (
          <PlayerPicker excludeIds={user ? [user.id] : []} onPick={setPicked} />
        )}
        {opponent && (
          <>
            <Field label="Game">
              <select className="select" value={game} onChange={(e) => setGame(e.target.value)}>
                {activeGames.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
            <Field label="Message (optional)"><input className="input" value={msg} maxLength={200} onChange={(e) => setMsg(e.target.value)} placeholder="Best of 1? Let's see what you've got." /></Field>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" loading={busy}>Send challenge</Button>
            </div>
          </>
        )}
      </form>
    </Modal>
  )
}

/* ---------------- Duel card ---------------- */

function DuelCard({ d, me, dispute, onChanged }: { d: DuelRow; me: string; dispute?: DisputeRow; onChanged: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)
  const [disputing, setDisputing] = useState(false)

  const iAmChallenger = d.challenger_id === me
  const st = DUEL_STATUS[d.status]
  const reportedByMe = d.reported_by === me
  const stale = d.reported_at ? Date.now() - new Date(d.reported_at).getTime() > 48 * 3600 * 1000 : false

  async function act(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key)
    try {
      await fn()
      toast.success(ok)
      onChanged()
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const side = (name: string, avatar: string, isDemo: boolean, win: boolean, right = false) => (
    <div className={`row ${right ? 'duel-side-right' : ''}`} style={right ? { flexDirection: 'row-reverse' } : undefined}>
      <Avatar k={avatar} size={38} />
      <div style={{ textAlign: right ? 'right' : 'left' }}>
        <strong className={win ? 'win' : ''}>{name}</strong> {isDemo && <DemoBadge />}
      </div>
    </div>
  )

  const hasScore = d.challenger_score !== null && d.opponent_score !== null

  return (
    <Card className="duel-card">
      <div className="spread">
        <Badge tone={st.tone}>{st.label}</Badge>
        <span className="muted small">{timeAgo(d.updated_at)}</span>
      </div>

      <div className="duel-vs">
        {side(d.challenger_username, d.challenger_avatar, d.challenger_is_demo, d.winner_id === d.challenger_id)}
        <div className="score">{hasScore && d.status !== 'pending' ? `${d.challenger_score} – ${d.opponent_score}` : 'VS'}</div>
        {side(d.opponent_username, d.opponent_avatar, d.opponent_is_demo, d.winner_id === d.opponent_id, true)}
      </div>

      {d.message && d.status === 'pending' && <p className="muted small">“{d.message}”</p>}

      {d.status === 'disputed' && (
        <div className="dispute-box">
          <strong>Dispute open.</strong> A moderator will review it and set the final score.
          {dispute && <p className="muted small" style={{ marginTop: 4 }}>{dispute.raised_by_username}: “{dispute.reason}”</p>}
        </div>
      )}
      {d.status === 'awaiting_confirmation' && (
        <p className="muted small">
          {reportedByMe
            ? `You reported ${iAmChallenger ? d.challenger_score : d.opponent_score}–${iAmChallenger ? d.opponent_score : d.challenger_score}. Waiting for your opponent to confirm.`
            : `${iAmChallenger ? d.opponent_username : d.challenger_username} reported this score. Confirm it if it's correct.`}
        </p>
      )}
      {d.status === 'accepted' && <p className="muted small">Challenge accepted! Open the lobby to set up the match and ready up.</p>}

      <div className="duel-actions">
        {d.status === 'pending' && !iAmChallenger && (
          <>
            <Button size="sm" loading={busy === 'acc'} onClick={() => act('acc', () => rpc('respond_duel', { p_duel: d.id, p_accept: true }), 'Challenge accepted — good luck!')}>Accept</Button>
            <Button size="sm" variant="secondary" loading={busy === 'dec'} onClick={() => act('dec', () => rpc('respond_duel', { p_duel: d.id, p_accept: false }), 'Challenge declined')}>Decline</Button>
          </>
        )}
        {d.status === 'accepted' && <Link to={`/duels/${d.id}`} className="btn btn-primary btn-sm">Open lobby →</Link>}
        {(d.status === 'pending' && iAmChallenger) || d.status === 'accepted' ? (
          <Button size="sm" variant="ghost" loading={busy === 'can'} onClick={() => act('can', () => rpc('cancel_duel', { p_duel: d.id }), 'Duel cancelled')}>Cancel</Button>
        ) : null}
        {d.status === 'awaiting_confirmation' && !reportedByMe && (
          <>
            <Button size="sm" loading={busy === 'conf'} onClick={() => act('conf', () => rpc('confirm_duel', { p_duel: d.id }), 'Result confirmed — ratings updated')}>Confirm result</Button>
            <Button size="sm" variant="danger" onClick={() => setDisputing(true)}>Dispute</Button>
          </>
        )}
        {d.status === 'awaiting_confirmation' && reportedByMe && (
          <>
            <Button size="sm" variant="secondary" onClick={() => setReporting(true)}>Correct score</Button>
            {stale && <Button size="sm" loading={busy === 'fin'} onClick={() => act('fin', () => rpc('finalize_stale_duel', { p_duel: d.id }), 'Result finalized')}>Finalize (opponent didn't respond)</Button>}
          </>
        )}
      </div>

      <ReportDuelModal open={reporting} d={d} iAmChallenger={iAmChallenger} onClose={() => setReporting(false)} onDone={() => { setReporting(false); toast.success('Result submitted — waiting for confirmation'); onChanged() }} />
      <DisputeModal open={disputing} d={d} onClose={() => setDisputing(false)} onDone={() => { setDisputing(false); toast.success('Dispute opened'); onChanged() }} />
    </Card>
  )
}

export function ReportDuelModal({ open, d, iAmChallenger, onClose, onDone, bestOf = 1 }: { open: boolean; d: DuelRow; iAmChallenger: boolean; onClose: () => void; onDone: () => void; bestOf?: number }) {
  const [mine, setMine] = useState('')
  const [theirs, setTheirs] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const opp = iAmChallenger ? d.opponent_username : d.challenger_username

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await rpc('report_duel', { p_duel: d.id, p_my_score: Number(mine), p_opp_score: Number(theirs) })
      setMine(''); setTheirs('')
      onDone()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Submit match result">
      <form className="stack" onSubmit={submit}>
        {error && <Notice tone="red">{error}</Notice>}
        <Notice tone="blue">Your opponent will be asked to confirm. The result only counts, and ratings only change, after they do.</Notice>
        {bestOf > 1 && <p className="muted small">Best of {bestOf}: enter games won. The winner needs exactly {(bestOf + 1) / 2}.</p>}
        <div className="spread">
          <div className="stack-sm center"><span className="muted small">You</span><input className="input score-input" type="number" min={0} max={99} value={mine} onChange={(e) => setMine(e.target.value)} required aria-label="Your score" /></div>
          <span className="muted">–</span>
          <div className="stack-sm center"><span className="muted small">{opp}</span><input className="input score-input" type="number" min={0} max={99} value={theirs} onChange={(e) => setTheirs(e.target.value)} required aria-label="Opponent score" /></div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Submit</Button>
        </div>
      </form>
    </Modal>
  )
}

function DisputeModal({ open, d, onClose, onDone }: { open: boolean; d: DuelRow; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await rpc('dispute_duel', { p_duel: d.id, p_reason: reason })
      setReason('')
      onDone()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Dispute this result">
      <form className="stack" onSubmit={submit}>
        {error && <Notice tone="red">{error}</Notice>}
        <Notice tone="amber">No rating changes happen while a dispute is open. A moderator will review it and set the final score or void the duel.</Notice>
        <Field label="What's wrong with the reported score?" hint="10–500 characters">
          <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} maxLength={500} required />
        </Field>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="danger" loading={busy}>Open dispute</Button>
        </div>
      </form>
    </Modal>
  )
}

/* ---------------- Moderator panel ---------------- */

function ModerationPanel({ disputes, loading, error, onChanged }: { disputes: DisputeRow[]; loading: boolean; error: string | null; onChanged: () => void }) {
  if (loading && disputes.length === 0) return <PageLoader />
  if (error) return <ErrorState message={error} />
  if (disputes.length === 0) return <Card><EmptyState title="No open disputes" text="All clear." /></Card>
  return (
    <div className="grid grid-2">
      {disputes.map((x) => <DisputeCard key={x.id} x={x} onChanged={onChanged} />)}
    </div>
  )
}

function DisputeCard({ x, onChanged }: { x: DisputeRow; onChanged: () => void }) {
  const toast = useToast()
  const [a, setA] = useState(String(x.challenger_score ?? ''))
  const [b, setB] = useState(String(x.opponent_score ?? ''))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key)
    try { await fn(); toast.success(ok); onChanged() } catch (e) { toast.error(errMsg(e)) } finally { setBusy(null) }
  }

  return (
    <Card className="stack">
      <div className="spread"><Badge tone="red">Open dispute</Badge><span className="muted small">{timeAgo(x.created_at)}</span></div>
      <p><strong>{x.challenger_username}</strong> <span className="muted">vs</span> <strong>{x.opponent_username}</strong></p>
      <p className="muted small">Reported {x.challenger_score}–{x.opponent_score}. {x.raised_by_username} disputes: “{x.reason}”</p>
      <div className="row">
        <input className="input score-input" type="number" min={0} max={99} value={a} onChange={(e) => setA(e.target.value)} aria-label="Challenger final score" />
        <span className="muted">–</span>
        <input className="input score-input" type="number" min={0} max={99} value={b} onChange={(e) => setB(e.target.value)} aria-label="Opponent final score" />
      </div>
      <input className="input" placeholder="Resolution note (optional)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      <div className="duel-actions">
        <Button size="sm" loading={busy === 'res'} onClick={() => run('res', () => rpc('resolve_duel_dispute', { p_dispute: x.id, p_challenger_score: Number(a), p_opponent_score: Number(b), p_note: note || null }), 'Dispute resolved')}>Set final score</Button>
        <Button size="sm" variant="secondary" loading={busy === 'void'} onClick={() => run('void', () => rpc('void_duel_dispute', { p_dispute: x.id, p_note: note || null }), 'Duel voided')}>Void duel</Button>
      </div>
    </Card>
  )
}
