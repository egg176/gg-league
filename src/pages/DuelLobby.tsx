import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { errMsg, q, rpc, supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { DUEL_STATUS, fmtDateTime } from '../lib/format'
import type { DuelLobby as Lobby, DuelRow } from '../lib/types'
import { ReportDuelModal } from './Duels'
import {
  Avatar, Badge, Button, Card, DemoBadge, EmptyState, ErrorState, Field, Notice, PageLoader, Segmented,
} from '../components/ui'

const ARENA_LABEL: Record<Lobby['arena'], string> = {
  agree: 'Agree in lobby',
  standard: 'Standard arenas',
  random: 'Random arena',
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function DuelLobby() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)

  const { data, loading, error, reload } = useQuery(async () => {
    const duel = await q<DuelRow | null>(supabase.from('duel_overview').select('*').eq('id', id).maybeSingle())
    if (!duel) return null
    const lobby = await q<Lobby | null>(supabase.from('duel_lobbies').select('*').eq('duel_id', id).maybeSingle())
    return { duel, lobby }
  }, [id, user?.id])

  // Both players watch the same lobby, so keep it fresh while the tab is visible.
  const phaseOpen = data?.duel.status === 'accepted' || data?.duel.status === 'pending'
  useEffect(() => {
    if (!phaseOpen) return
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') reload()
    }, 3000)
    return () => clearInterval(t)
  }, [phaseOpen, reload])

  // Settings form (local until saved)
  const lobby = data?.lobby ?? null
  const [bestOf, setBestOf] = useState<1 | 3 | 5>(1)
  const [arena, setArena] = useState<Lobby['arena']>('agree')
  const [host, setHost] = useState('')
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [at, setAt] = useState('')
  const [note, setNote] = useState('')
  const syncedAt = useRef<string | null>(null)

  useEffect(() => {
    if (!lobby || syncedAt.current === lobby.updated_at) return
    const first = syncedAt.current === null
    syncedAt.current = lobby.updated_at
    setBestOf(lobby.best_of)
    setArena(lobby.arena)
    setHost(lobby.host_id)
    setWhen(lobby.scheduled_at ? 'later' : 'now')
    setAt(toLocalInput(lobby.scheduled_at))
    setNote(lobby.note ?? '')
    if (!first && lobby.updated_by && lobby.updated_by !== user?.id) {
      toast.info('Your opponent changed the match settings — check them before readying up')
    }
  }, [lobby, user?.id, toast])

  const dirty = useMemo(() => {
    if (!lobby) return false
    return (
      bestOf !== lobby.best_of ||
      arena !== lobby.arena ||
      host !== lobby.host_id ||
      (when === 'later') !== Boolean(lobby.scheduled_at) ||
      (when === 'later' && at !== toLocalInput(lobby.scheduled_at)) ||
      note.trim() !== (lobby.note ?? '')
    )
  }, [lobby, bestOf, arena, host, when, at, note])

  if (loading && !data) return <PageLoader />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data || !user) {
    return (
      <Card>
        <EmptyState
          title="Lobby not found"
          text="This duel doesn't exist, or it isn't yours."
          action={<Link to="/duels" className="btn btn-primary btn-md">Back to duels</Link>}
        />
      </Card>
    )
  }

  const { duel } = data
  const iAmChallenger = duel.challenger_id === user.id
  if (!iAmChallenger && duel.opponent_id !== user.id) {
    return (
      <Card>
        <EmptyState title="Not your duel" action={<Link to="/duels" className="btn btn-primary btn-md">Back to duels</Link>} />
      </Card>
    )
  }

  const me = iAmChallenger
    ? { name: duel.challenger_username, avatar: duel.challenger_avatar, ready: lobby?.challenger_ready ?? false }
    : { name: duel.opponent_username, avatar: duel.opponent_avatar, ready: lobby?.opponent_ready ?? false }
  const them = iAmChallenger
    ? { name: duel.opponent_username, avatar: duel.opponent_avatar, ready: lobby?.opponent_ready ?? false, demo: duel.opponent_is_demo }
    : { name: duel.challenger_username, avatar: duel.challenger_avatar, ready: lobby?.challenger_ready ?? false, demo: duel.challenger_is_demo }
  const locked = Boolean(lobby?.locked_at)
  const st = DUEL_STATUS[duel.status]
  const hostName = lobby ? (lobby.host_id === duel.challenger_id ? duel.challenger_username : duel.opponent_username) : ''
  const need = lobby ? (lobby.best_of + 1) / 2 : 1

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key)
    try {
      await fn()
      if (ok) toast.success(ok)
      reload()
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied`)
    } catch {
      toast.info(`${label}: ${text}`)
    }
  }

  const saveSettings = () =>
    run(
      'save',
      () =>
        rpc('update_lobby', {
          p_duel: duel.id,
          p_best_of: bestOf,
          p_arena: arena,
          p_host: host,
          p_scheduled_at: when === 'later' && at ? new Date(at).toISOString() : null,
          p_note: note || null,
        }),
      'Settings saved — both players need to ready up again',
    )

  /* ---------- Non-lobby states ---------- */
  if (duel.status !== 'accepted') {
    return (
      <div className="stack lobby-wrap">
        <Link to="/duels" className="muted small">← Back to duels</Link>
        <Card className="center">
          <div className="stack-sm" style={{ alignItems: 'center' }}>
            <Badge tone={st.tone}>{st.label}</Badge>
            <h2>{duel.challenger_username} vs {duel.opponent_username}</h2>
            {duel.status === 'pending' && <p className="muted">The lobby opens as soon as this challenge is accepted.</p>}
            {duel.status === 'awaiting_confirmation' && (
              <p className="muted">A result has been submitted. The opponent needs to confirm it from the Duels page.</p>
            )}
            {duel.status === 'completed' && (
              <p className="muted">Verified result: <strong>{duel.challenger_score}–{duel.opponent_score}</strong></p>
            )}
            <Link to="/duels" className="btn btn-primary btn-md">Go to duels</Link>
          </div>
        </Card>
      </div>
    )
  }

  if (!lobby) {
    return (
      <div className="stack lobby-wrap">
        <Link to="/duels" className="muted small">← Back to duels</Link>
        <Card>
          <EmptyState
            title="No lobby for this duel"
            text="This duel was accepted before lobbies existed. Submit the result from the Duels page."
            action={<Link to="/duels" className="btn btn-primary btn-md">Back to duels</Link>}
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="stack lobby-wrap" style={{ gap: 22 }}>
      <Link to="/duels" className="muted small">← Back to duels</Link>

      {/* VS banner */}
      <section className={`lobby-hero ${locked ? 'lobby-hero-locked' : ''}`}>
        <PlayerSide name={me.name} avatar={me.avatar} ready={me.ready} locked={locked} label="You" />
        <div className="lobby-vs" aria-hidden>
          <span>VS</span>
        </div>
        <PlayerSide name={them.name} avatar={them.avatar} ready={them.ready} locked={locked} label="Opponent" demo={them.demo} right />
      </section>

      {locked ? (
        /* ---------- Phase 2: locked ---------- */
        <section className="lobby-locked stack" style={{ gap: 18 }}>
          <div className="lock-banner">
            <span className="lock-ring" aria-hidden />
            <div>
              <strong className="lock-title">Match locked in</strong>
              <div className="muted small">Both players are ready. Settings are final.</div>
            </div>
          </div>

          <Card glow className="code-card">
            <div className="muted small" style={{ marginBottom: 12 }}>
              {hostName === me.name ? 'You are the host.' : `${hostName} is the host.`} The host creates a private match
              in the game with this name and password; the other player joins it.
            </div>
            <div className="code-grid">
              <CodeBox label="Lobby name" value={lobby.lobby_name} onCopy={() => copy(lobby.lobby_name, 'Lobby name')} delay={0} />
              <CodeBox label="Password" value={lobby.lobby_password} onCopy={() => copy(lobby.lobby_password, 'Password')} delay={140} />
            </div>
            <p className="muted small" style={{ marginTop: 12 }}>
              Use exactly this lobby name. If you submit screenshot evidence later, it ties your match to this lobby.
            </p>
          </Card>

          <MatchSummary lobby={lobby} hostName={hostName} />

          <Card className="stack-sm">
            <h3>When the match is over</h3>
            <p className="muted small">
              {lobby.best_of === 1
                ? 'Enter the final goal score. Your opponent will confirm it.'
                : `This is a best of ${lobby.best_of}: enter games won — the winner needs ${need} (for example ${need}–0 or ${need}–${need - 1}). Your opponent will confirm it.`}
            </p>
            <div className="duel-actions">
              <Button onClick={() => setReporting(true)}>Submit result</Button>
              <Button variant="ghost" loading={busy === 'cancel'} onClick={() => run('cancel', () => rpc('cancel_duel', { p_duel: duel.id }), 'Duel cancelled')}>
                Cancel duel
              </Button>
            </div>
          </Card>
        </section>
      ) : (
        /* ---------- Phase 1: setup ---------- */
        <div className="grid grid-main">
          <Card className="stack lobby-settings">
            <div className="spread">
              <h3>Match settings</h3>
              {lobby.updated_by && (
                <span className="muted small">
                  Last changed by {lobby.updated_by === duel.challenger_id ? duel.challenger_username : duel.opponent_username}
                </span>
              )}
            </div>

            <Field label="Series">
              <Segmented
                label="Series length"
                value={bestOf}
                onChange={setBestOf}
                options={[{ id: 1, label: 'Best of 1' }, { id: 3, label: 'Best of 3' }, { id: 5, label: 'Best of 5' }]}
              />
            </Field>

            <Field label="Arena">
              <Segmented
                label="Arena"
                value={arena}
                onChange={setArena}
                options={[
                  { id: 'agree', label: 'Agree in lobby' },
                  { id: 'standard', label: 'Standard arenas' },
                  { id: 'random', label: 'Random' },
                ]}
              />
            </Field>

            <Field label="Who hosts the private match?">
              <Segmented
                label="Host"
                value={host}
                onChange={setHost}
                options={[
                  { id: duel.challenger_id, label: duel.challenger_username },
                  { id: duel.opponent_id, label: duel.opponent_username },
                ]}
              />
            </Field>

            <Field label="When">
              <Segmented
                label="When"
                value={when}
                onChange={setWhen}
                options={[{ id: 'now', label: 'Play now' }, { id: 'later', label: 'Schedule' }]}
              />
              {when === 'later' && (
                <input className="input lobby-when" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
              )}
            </Field>

            <Field label="House rules (optional)" hint={`${note.length}/140`}>
              <input className="input" value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} placeholder="e.g. no demos, no rematches in overtime" />
            </Field>

            <div className="duel-actions">
              <Button onClick={saveSettings} disabled={!dirty || (when === 'later' && !at)} loading={busy === 'save'}>
                Save settings
              </Button>
              {dirty && <span className="muted small">Unsaved changes</span>}
            </div>
            <Notice tone="blue">Changing any setting clears both players' ready status, so nobody readies up against settings they haven't seen.</Notice>
          </Card>

          <div className="stack">
            <Card className="stack ready-card">
              <h3>Ready check</h3>
              <ReadyRow name="You" ready={me.ready} />
              <ReadyRow name={them.name} ready={them.ready} />
              {dirty ? (
                <Notice tone="amber">Save your settings first, then ready up.</Notice>
              ) : me.ready ? (
                <Button variant="secondary" size="lg" loading={busy === 'ready'} onClick={() => run('ready', () => rpc('set_ready', { p_duel: duel.id, p_ready: false }))}>
                  Not ready
                </Button>
              ) : (
                <Button size="lg" className="ready-btn" loading={busy === 'ready'} onClick={() => run('ready', () => rpc('set_ready', { p_duel: duel.id, p_ready: true }))}>
                  I'm ready
                </Button>
              )}
              <p className="muted small">
                {me.ready && !them.ready ? `Waiting for ${them.name}…` : 'When both players are ready, the lobby locks and the lobby code is revealed.'}
              </p>
            </Card>

            <MatchSummary lobby={{ ...lobby, best_of: bestOf, arena, host_id: host, scheduled_at: when === 'later' && at ? new Date(at).toISOString() : null, note: note || null }} hostName={host === duel.challenger_id ? duel.challenger_username : duel.opponent_username} preview />

            <Button variant="ghost" loading={busy === 'cancel'} onClick={() => run('cancel', () => rpc('cancel_duel', { p_duel: duel.id }), 'Duel cancelled')}>
              Cancel duel
            </Button>
          </div>
        </div>
      )}

      <ReportDuelModal
        open={reporting}
        d={duel}
        iAmChallenger={iAmChallenger}
        bestOf={lobby.best_of}
        onClose={() => setReporting(false)}
        onDone={() => {
          setReporting(false)
          toast.success('Result submitted — waiting for your opponent to confirm')
          reload()
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */

function PlayerSide({
  name, avatar, ready, locked, label, demo, right,
}: { name: string; avatar: string; ready: boolean; locked: boolean; label: string; demo?: boolean; right?: boolean }) {
  return (
    <div className={`lobby-side ${right ? 'lobby-side-right' : ''} ${ready ? 'lobby-side-ready' : ''}`}>
      <div className="lobby-avatar">
        <Avatar k={avatar} size={76} />
        {ready && <span className="ready-tick" aria-label="Ready">✓</span>}
      </div>
      <div className="lobby-side-text">
        <span className="muted small">{label}</span>
        <strong>{name} {demo && <DemoBadge />}</strong>
        <Badge tone={locked ? 'purple' : ready ? 'green' : 'gray'}>{locked ? 'Locked in' : ready ? 'Ready' : 'Not ready'}</Badge>
      </div>
    </div>
  )
}

function ReadyRow({ name, ready }: { name: string; ready: boolean }) {
  return (
    <div className={`ready-row ${ready ? 'ready-row-on' : ''}`}>
      <span className="ready-dot" />
      <span className="grow">{name}</span>
      <span className="small">{ready ? 'Ready' : 'Waiting'}</span>
    </div>
  )
}

function CodeBox({ label, value, onCopy, delay }: { label: string; value: string; onCopy: () => void; delay: number }) {
  return (
    <button className="code-box" onClick={onCopy} style={{ animationDelay: `${delay}ms` }} aria-label={`Copy ${label}`}>
      <span className="muted small">{label}</span>
      <span className="code-value">
        {value.split('').map((c, i) => (
          <span key={i} style={{ animationDelay: `${delay + i * 55}ms` }}>{c}</span>
        ))}
      </span>
      <span className="code-copy small">Tap to copy</span>
    </button>
  )
}

function MatchSummary({ lobby, hostName, preview }: { lobby: Lobby; hostName: string; preview?: boolean }) {
  return (
    <Card className="summary-card stack-sm">
      <div className="spread">
        <h3>{preview ? 'Match card (preview)' : 'Match card'}</h3>
      </div>
      <div className="chips">
        <span className="chip">Best of {lobby.best_of}</span>
        <span className="chip">{ARENA_LABEL[lobby.arena]}</span>
        <span className="chip">Host: {hostName}</span>
        <span className="chip">{lobby.scheduled_at ? fmtDateTime(lobby.scheduled_at) : 'Play now'}</span>
      </div>
      {lobby.note && <p className="muted small">House rules: {lobby.note}</p>}
    </Card>
  )
}
