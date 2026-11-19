import { q, supabase } from './supabase'
import type { DuelRow, TeamInvite } from './types'

export interface Attention {
  /** Challenges sent to me that I have not answered */
  incoming: DuelRow[]
  /** Results my opponent submitted that I must confirm or dispute */
  toConfirm: DuelRow[]
  /** Accepted duels waiting for a result */
  toPlay: DuelRow[]
  invites: TeamInvite[]
  total: number
}

export async function fetchAttention(uid: string): Promise<Attention> {
  const [duels, invites] = await Promise.all([
    q<DuelRow[]>(
      supabase
        .from('duel_overview')
        .select('*')
        .or(`challenger_id.eq.${uid},opponent_id.eq.${uid}`)
        .in('status', ['pending', 'accepted', 'awaiting_confirmation'])
        .order('updated_at', { ascending: false }),
    ),
    q<TeamInvite[]>(
      supabase.from('team_invite_overview').select('*').eq('user_id', uid).eq('status', 'pending'),
    ),
  ])
  const incoming = duels.filter((d) => d.status === 'pending' && d.opponent_id === uid)
  const toConfirm = duels.filter((d) => d.status === 'awaiting_confirmation' && d.reported_by !== uid)
  const toPlay = duels.filter((d) => d.status === 'accepted')
  return { incoming, toConfirm, toPlay, invites, total: incoming.length + toConfirm.length + invites.length }
}
