import { roundLabel } from '../lib/format'
import type { TMatch } from '../lib/types'
import { Button } from './ui'

export default function Bracket({
  matches,
  names,
  canReport,
  onReport,
}: {
  matches: TMatch[]
  names: Map<string, string>
  canReport: (m: TMatch) => boolean
  onReport: (m: TMatch) => void
}) {
  const rounds = Math.max(0, ...matches.map((m) => m.round))
  const byRound = Array.from({ length: rounds }, (_, i) =>
    matches.filter((m) => m.round === i + 1).sort((a, b) => a.slot - b.slot),
  )

  return (
    <div className="bracket" aria-label="Tournament bracket">
      {byRound.map((ms, i) => (
        <div className="bracket-round" key={i}>
          <div className="bracket-round-title">{roundLabel(i + 1, rounds)}</div>
          <div className="bracket-matches">
            {ms.map((m) => (
              <MatchCard key={m.id} m={m} names={names} canReport={canReport(m)} onReport={() => onReport(m)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function MatchCard({ m, names, canReport, onReport }: { m: TMatch; names: Map<string, string>; canReport: boolean; onReport: () => void }) {
  const row = (id: string | null, score: number | null) => {
    const done = m.status === 'completed' || m.status === 'bye'
    const won = done && id && m.winner_id === id
    const lost = done && id && m.winner_id !== id
    return (
      <div className={`bm-row ${won ? 'bm-win' : ''} ${lost ? 'bm-lose' : ''}`}>
        <span className={id ? '' : 'bm-tbd'}>{id ? names.get(id) ?? 'Player' : m.status === 'bye' ? 'BYE' : 'TBD'}</span>
        <span className="bm-score">{score ?? ''}</span>
      </div>
    )
  }
  return (
    <div className={`bm ${m.status === 'ready' ? 'bm-ready' : ''}`}>
      {row(m.player1_id, m.score1)}
      {row(m.player2_id, m.score2)}
      {canReport && (
        <div className="bm-foot">
          <Button size="sm" onClick={onReport}>Record result</Button>
        </div>
      )}
    </div>
  )
}
