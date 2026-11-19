export interface Game {
  id: string
  name: string
  tagline: string | null
  is_active: boolean
  team_size: number
  roster_size: number
  accent: string
  sort_order: number
}

export interface Profile {
  id: string
  username: string
  avatar_key: string
  main_game: string | null
  bio: string | null
  is_demo: boolean
  created_at: string
}

export interface PlayerStats {
  user_id: string
  game_id: string
  rating: number
  best_rating: number
  wins: number
  losses: number
  matches_played: number
  current_streak: number
}

export interface LeaderRow {
  game_id: string
  user_id: string
  username: string
  avatar_key: string
  is_demo: boolean
  rating: number
  best_rating: number
  wins: number
  losses: number
  matches_played: number
  win_rate: number | null
  current_streak: number
  group_rank: number
}

export interface GlobalRow {
  user_id: string
  username: string
  avatar_key: string
  is_demo: boolean
  rating: number
  wins: number
  losses: number
  matches_played: number
  win_rate: number | null
}

export type TournamentStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'

export interface TournamentRow {
  id: string
  game_id: string
  name: string
  description: string | null
  created_by: string
  status: TournamentStatus
  max_participants: number
  starts_at: string | null
  winner_id: string | null
  is_demo: boolean
  created_at: string
  started_at: string | null
  completed_at: string | null
  participant_count: number
  creator_username: string
  creator_avatar: string
  winner_username: string | null
}

export interface Participant {
  tournament_id: string
  user_id: string
  seed: number | null
  placement: number | null
  joined_at: string
  profiles: { username: string; avatar_key: string; is_demo: boolean } | null
}

export interface TMatch {
  id: string
  tournament_id: string
  round: number
  slot: number
  player1_id: string | null
  player2_id: string | null
  score1: number | null
  score2: number | null
  winner_id: string | null
  status: 'waiting' | 'ready' | 'completed' | 'bye'
  completed_at: string | null
}

export type DuelStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'awaiting_confirmation'
  | 'disputed'
  | 'completed'
  | 'voided'

export interface DuelRow {
  id: string
  game_id: string
  challenger_id: string
  opponent_id: string
  message: string | null
  status: DuelStatus
  challenger_score: number | null
  opponent_score: number | null
  reported_by: string | null
  reported_at: string | null
  winner_id: string | null
  confirmed_at: string | null
  is_demo: boolean
  created_at: string
  updated_at: string
  challenger_username: string
  challenger_avatar: string
  challenger_is_demo: boolean
  opponent_username: string
  opponent_avatar: string
  opponent_is_demo: boolean
}

export interface DuelLobby {
  duel_id: string
  best_of: 1 | 3 | 5
  arena: 'agree' | 'standard' | 'random'
  host_id: string
  scheduled_at: string | null
  note: string | null
  lobby_name: string
  lobby_password: string
  challenger_ready: boolean
  opponent_ready: boolean
  locked_at: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface DisputeRow {
  id: string
  duel_id: string
  raised_by: string
  reason: string
  status: 'open' | 'resolved'
  resolution_note: string | null
  created_at: string
  resolved_at: string | null
  game_id: string
  challenger_id: string
  opponent_id: string
  challenger_score: number | null
  opponent_score: number | null
  reported_by: string | null
  challenger_username: string
  opponent_username: string
  raised_by_username: string
}

export interface TeamRow {
  id: string
  game_id: string
  name: string
  tag: string
  description: string | null
  owner_id: string
  is_open: boolean
  is_demo: boolean
  created_at: string
  owner_username: string
  member_count: number
  avg_rating: number
  wins: number
  losses: number
  group_rank: number
}

export interface TeamMember {
  team_id: string
  user_id: string
  role: 'owner' | 'member'
  joined_at: string
  profiles: { username: string; avatar_key: string; is_demo: boolean } | null
}

export interface TeamInvite {
  id: string
  team_id: string
  user_id: string
  invited_by: string
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  created_at: string
  team_name: string
  team_tag: string
  game_id: string
  inviter_username: string
  invitee_username: string
  invitee_avatar: string
}

export interface HistoryRow {
  match_id: string
  kind: 'duel' | 'tournament'
  game_id: string
  user_id: string
  opponent_id: string
  my_score: number | null
  opp_score: number | null
  won: boolean
  played_at: string | null
  context: string | null
  is_demo: boolean
  opponent_username: string
  opponent_avatar: string
}

export interface RatingPoint {
  delta: number
  rating_after: number
  created_at: string
}
