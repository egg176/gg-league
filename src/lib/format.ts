import type { DuelStatus, TournamentStatus } from './types'

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return 'TBA'
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function winRate(wins: number, losses: number): string {
  const t = wins + losses
  return t === 0 ? '—' : `${Math.round((100 * wins) / t)}%`
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export type Tone = 'purple' | 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'cyan'

export const TOURNAMENT_STATUS: Record<TournamentStatus, { label: string; tone: Tone }> = {
  open: { label: 'Open', tone: 'green' },
  in_progress: { label: 'Live', tone: 'purple' },
  completed: { label: 'Completed', tone: 'gray' },
  cancelled: { label: 'Cancelled', tone: 'red' },
}

export const DUEL_STATUS: Record<DuelStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Challenge sent', tone: 'amber' },
  accepted: { label: 'Ready to play', tone: 'blue' },
  declined: { label: 'Declined', tone: 'gray' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
  awaiting_confirmation: { label: 'Awaiting confirmation', tone: 'amber' },
  disputed: { label: 'Disputed', tone: 'red' },
  completed: { label: 'Verified', tone: 'green' },
  voided: { label: 'Voided', tone: 'gray' },
}

export function roundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semifinals'
  if (fromEnd === 2) return 'Quarterfinals'
  return `Round of ${Math.pow(2, fromEnd + 1)}`
}

export function placementLabel(p: number | null): string {
  if (p === null) return '—'
  if (p === 1) return 'Champion'
  if (p === 2) return 'Runner-up'
  if (p === 3) return 'Semifinalist'
  return `Top ${p - 1}`
}
