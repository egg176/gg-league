import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { DEFAULT_GAME, useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { errMsg, q, rpc, supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { TOURNAMENT_STATUS, fmtDateTime } from '../lib/format'
import type { TournamentRow } from '../lib/types'
import { Badge, Button, DemoBadge, EmptyState, ErrorState, Field, Modal, PageHeader, PageLoader, Tabs } from '../components/ui'

type Filter = 'open' | 'in_progress' | 'completed' | 'all'

export default function Tournaments() {
  const { user } = useAuth()
  const { showDemo, activeGames, gameById } = useApp()
  const toast = useToast()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<Filter>('open')
  const [creating, setCreating] = useState(params.get('new') === '1')

  const { data, loading, error, reload } = useQuery(
    () => {
      let b = supabase.from('tournament_overview').select('*').neq('status', 'cancelled')
      if (filter !== 'all') b = b.eq('status', filter)
      if (!showDemo) b = b.eq('is_demo', false)
      return q<TournamentRow[]>(b.order('created_at', { ascending: false }).limit(60))
    },
    [filter, showDemo],
  )

  useEffect(() => {
    if (params.get('new') === '1') {
      setParams({}, { replace: true })
      if (!user) nav('/auth')
    }
  }, [params, setParams, user, nav])

  return (
    <>
      <PageHeader
        title="Tournaments"
        subtitle="Single-elimination brackets. Organizers record results, ratings update automatically."
        actions={
          <Button
            onClick={() => (user ? setCreating(true) : nav('/auth'))}
          >
            + Create tournament
          </Button>
        }
      />

      <div style={{ marginBottom: 20 }}>
        <Tabs<Filter>
          tabs={[
            { id: 'open', label: 'Open' },
            { id: 'in_progress', label: 'Live' },
            { id: 'completed', label: 'Completed' },
            { id: 'all', label: 'All' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {loading && !data ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data && data.length === 0 ? (
        <div className="card">
          <EmptyState
            title={filter === 'open' ? 'No open tournaments' : 'Nothing here yet'}
            text="Create a tournament and invite players to fill the bracket."
            action={<Button onClick={() => (user ? setCreating(true) : nav('/auth'))}>Create tournament</Button>}
          />
        </div>
      ) : (
        <div className="grid grid-3">
          {data?.map((t) => {
            const st = TOURNAMENT_STATUS[t.status]
            return (
              <Link key={t.id} to={`/tournaments/${t.id}`} className="card t-card">
                <div className="spread">
                  <Badge tone={st.tone}>{st.label}</Badge>
                  {t.is_demo ? <DemoBadge /> : <span className="muted small">{gameById(t.game_id)?.name}</span>}
                </div>
                <h3>{t.name}</h3>
                {t.description && <p className="muted small" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.description}</p>}
                <div>
                  <div className="progress"><span style={{ width: `${(100 * t.participant_count) / t.max_participants}%` }} /></div>
                  <div className="spread small muted" style={{ marginTop: 6 }}>
                    <span>{t.participant_count}/{t.max_participants} players</span>
                    <span>{t.status === 'completed' && t.winner_username ? `🏆 ${t.winner_username}` : fmtDateTime(t.starts_at)}</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <CreateTournament
        open={creating}
        onClose={() => setCreating(false)}
        games={activeGames.map((g) => ({ id: g.id, name: g.name }))}
        onCreated={(id) => {
          toast.success('Tournament created')
          nav(`/tournaments/${id}`)
        }}
      />
    </>
  )
}

function CreateTournament({
  open, onClose, games, onCreated,
}: {
  open: boolean
  onClose: () => void
  games: { id: string; name: string }[]
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [size, setSize] = useState(8)
  const [game, setGame] = useState(DEFAULT_GAME)
  const [starts, setStarts] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const id = await rpc<string>('create_tournament', {
        p_game: game,
        p_name: name,
        p_description: desc || null,
        p_max: size,
        p_starts_at: starts ? new Date(starts).toISOString() : null,
      })
      setName(''); setDesc(''); setStarts('')
      onCreated(id)
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create tournament">
      <form className="stack" onSubmit={submit}>
        {error && <div className="notice notice-red">{error}</div>}
        <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} minLength={3} maxLength={60} required placeholder="Friday Night Boost Cup" /></Field>
        <Field label="Description (optional)"><textarea className="textarea" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} placeholder="Format, rules, lobby details…" /></Field>
        <div className="grid grid-2">
          <Field label="Game">
            <select className="select" value={game} onChange={(e) => setGame(e.target.value)}>
              {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>
          <Field label="Players">
            <select className="select" value={size} onChange={(e) => setSize(Number(e.target.value))}>
              {[4, 8, 16, 32].map((n) => <option key={n} value={n}>{n} players</option>)}
            </select>
          </Field>
        </div>
        <Field label="Start time (optional)"><input className="input" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} /></Field>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Create</Button>
        </div>
      </form>
    </Modal>
  )
}
