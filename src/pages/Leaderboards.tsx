import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { DEFAULT_GAME, useApp } from '../context/AppContext'
import { q, supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { winRate } from '../lib/format'
import type { GlobalRow, LeaderRow } from '../lib/types'
import { Card, DemoBadge, EmptyState, ErrorState, Notice, PageHeader, PageLoader, PlayerLink, SectionTitle, Tabs } from '../components/ui'

interface Row {
  user_id: string
  username: string
  avatar_key: string
  is_demo: boolean
  rating: number
  wins: number
  losses: number
  matches_played: number
  streak: number | null
}

export default function Leaderboards() {
  const { user } = useAuth()
  const { games, showDemo } = useApp()
  const [tab, setTab] = useState<string>('global')
  const [search, setSearch] = useState('')

  const { data, loading, error, reload } = useQuery(async () => {
    if (tab === 'global') {
      const rows = await q<GlobalRow[]>(supabase.from('global_leaderboard').select('*').order('rating', { ascending: false }).limit(200))
      return rows.map<Row>((r) => ({ ...r, streak: null }))
    }
    const rows = await q<LeaderRow[]>(supabase.from('leaderboard').select('*').eq('game_id', tab).order('rating', { ascending: false }).limit(200))
    return rows.map<Row>((r) => ({ ...r, streak: r.current_streak }))
  }, [tab])

  const term = search.trim().toLowerCase()
  const filtered = (data ?? []).filter((r) => !term || r.username.toLowerCase().includes(term))
  const real = filtered.filter((r) => !r.is_demo)
  const demo = filtered.filter((r) => r.is_demo)

  const tabs = [
    { id: 'global', label: 'Global' },
    ...games.map((g) => ({ id: g.id, label: g.is_active ? g.name : `${g.name} · soon`, disabled: !g.is_active })),
  ]
  const gameName = games.find((g) => g.id === tab)?.name ?? DEFAULT_GAME

  return (
    <>
      <PageHeader title="Leaderboards" subtitle="Ratings move only when a duel or tournament result is verified." />

      <div className="spread" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
        <input className="input" style={{ maxWidth: 260 }} placeholder="Find a player…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Find a player" />
      </div>

      {loading && !data ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="stack" style={{ gap: 28 }}>
          <section>
            <SectionTitle>{tab === 'global' ? 'Global ladder' : `${gameName} ladder`}</SectionTitle>
            {real.length === 0 ? (
              <Card><EmptyState title={term ? 'No players match your search' : 'No ranked players yet'} text={term ? undefined : 'Win a verified duel or tournament match to take the first spot on the ladder.'} /></Card>
            ) : (
              <Table rows={real} meId={user?.id} showStreak={tab !== 'global'} />
            )}
          </section>

          {showDemo && demo.length > 0 && (
            <section>
              <SectionTitle><span className="row">Sample players <DemoBadge label="DEMO DATA" /></span></SectionTitle>
              <Notice tone="amber">These are made-up players so the ladder doesn't look empty. They are ranked separately and never affect real rankings.</Notice>
              <div style={{ marginTop: 14 }}><Table rows={demo} showStreak={tab !== 'global'} /></div>
            </section>
          )}
        </div>
      )}
    </>
  )
}

function Table({ rows, meId, showStreak }: { rows: Row[]; meId?: string; showStreak: boolean }) {
  return (
    <Card padded={false}>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>#</th><th>Player</th><th className="num">Rating</th><th className="num">W–L</th>
              <th className="num hide-sm">Win %</th><th className="num hide-sm">Matches</th>{showStreak && <th className="num hide-sm">Streak</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.user_id} className={r.user_id === meId ? 'row-me' : ''}>
                <td className={`rank rank-${i + 1}`}>{i + 1}</td>
                <td><PlayerLink username={r.username} avatar={r.avatar_key} isDemo={r.is_demo} /></td>
                <td className="num"><strong>{r.rating}</strong></td>
                <td className="num">{r.wins}–{r.losses}</td>
                <td className="num hide-sm">{winRate(r.wins, r.losses)}</td>
                <td className="num hide-sm">{r.matches_played}</td>
                {showStreak && (
                  <td className={`num hide-sm ${r.streak && r.streak > 0 ? 'pos' : r.streak && r.streak < 0 ? 'neg' : ''}`}>
                    {r.streak ? `${Math.abs(r.streak)}${r.streak > 0 ? 'W' : 'L'}` : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
