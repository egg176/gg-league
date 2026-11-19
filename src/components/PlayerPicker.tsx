import { useState } from 'react'
import { escapeLike, q, supabase } from '../lib/supabase'
import { useDebounced, useQuery } from '../lib/useQuery'
import type { Profile } from '../lib/types'
import { Avatar, Spinner } from './ui'

/** Search real (non-demo) players by username. */
export default function PlayerPicker({
  excludeIds = [],
  onPick,
  placeholder = 'Search by username…',
}: {
  excludeIds?: string[]
  onPick: (p: Profile) => void
  placeholder?: string
}) {
  const [term, setTerm] = useState('')
  const debounced = useDebounced(term.trim(), 250)

  const res = useQuery(async () => {
    if (debounced.length < 2) return [] as Profile[]
    return q<Profile[]>(
      supabase
        .from('profiles')
        .select('*')
        .eq('is_demo', false)
        .ilike('username', `%${escapeLike(debounced)}%`)
        .limit(10),
    )
  }, [debounced])

  const rows = (res.data ?? []).filter((p) => !excludeIds.includes(p.id))

  return (
    <div className="picker">
      <input
        className="input"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder={placeholder}
        autoFocus
        aria-label="Search players"
      />
      <div className="picker-list">
        {res.loading && debounced.length >= 2 && (
          <div className="picker-note">
            <Spinner size="sm" /> Searching…
          </div>
        )}
        {res.error && <div className="picker-note field-error">{res.error}</div>}
        {!res.loading && debounced.length < 2 && <div className="picker-note muted">Type at least 2 characters.</div>}
        {!res.loading && debounced.length >= 2 && rows.length === 0 && !res.error && (
          <div className="picker-note muted">No players found. Demo players can't be challenged or invited.</div>
        )}
        {rows.map((p) => (
          <button key={p.id} className="picker-row" onClick={() => onPick(p)}>
            <Avatar k={p.avatar_key} size={30} />
            <span>{p.username}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
