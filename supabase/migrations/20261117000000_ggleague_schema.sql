-- =====================================================================
-- GGLeague — core schema, row-level security and competitive logic
-- Target: Supabase (Postgres 15+). Safe to run once on an empty project.
--
-- Security model
--   * Clients can READ public competitive data.
--   * Clients can NOT insert/update/delete any competitive table directly.
--     (wins, losses, ratings, match results, tournaments, teams, ...)
--   * Every write goes through SECURITY DEFINER functions (RPCs) that
--     validate who is calling and which state transition is allowed.
--   * The only direct write a player has is editing their own cosmetic
--     profile fields: username, avatar_key, main_game, bio.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Games (add Fortnite / VALORANT later by flipping is_active)
-- ---------------------------------------------------------------------
create table public.games (
  id          text primary key,
  name        text not null,
  tagline     text,
  is_active   boolean not null default false,
  team_size   int not null default 3 check (team_size between 1 and 10),
  roster_size int not null default 5 check (roster_size between 1 and 20),
  accent      text not null default '#8b5cf6',
  sort_order  int not null default 0
);

insert into public.games (id, name, tagline, is_active, team_size, roster_size, accent, sort_order) values
  ('rocket-league', 'Rocket League', 'Rocket-powered car soccer', true,  3, 5, '#8b5cf6', 1),
  ('fortnite',      'Fortnite',      'Coming soon',               false, 1, 4, '#3b82f6', 2),
  ('valorant',      'VALORANT',      'Coming soon',               false, 5, 7, '#ec4899', 3);

-- ---------------------------------------------------------------------
-- 2. Profiles
--    Real users: id = auth_user_id = auth.users.id
--    Demo players: auth_user_id is null and is_demo = true (cannot log in)
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  username     text not null,
  avatar_key   text not null default 'bolt-violet',
  main_game    text references public.games(id) default 'rocket-league',
  bio          text,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  constraint profiles_avatar_format   check (avatar_key ~ '^[a-z]{3,12}-[a-z]{3,12}$'),
  constraint profiles_bio_length      check (bio is null or char_length(bio) <= 280),
  constraint profiles_demo_has_no_auth check (is_demo = (auth_user_id is null))
);
create unique index profiles_username_lower_key on public.profiles (lower(username));

create table public.moderators (
  user_id uuid primary key references public.profiles(id) on delete cascade
);

-- Verified competitive stats. Never writable by clients.
create table public.player_stats (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  game_id        text not null references public.games(id),
  rating         int  not null default 1000,
  best_rating    int  not null default 1000,
  wins           int  not null default 0,
  losses         int  not null default 0,
  matches_played int  generated always as (wins + losses) stored,
  current_streak int  not null default 0,  -- >0 win streak, <0 loss streak
  primary key (user_id, game_id)
);
create index player_stats_game_rating_idx on public.player_stats (game_id, rating desc);

create table public.rating_history (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  game_id      text not null references public.games(id),
  source       text not null check (source in ('duel', 'tournament')),
  source_id    uuid,
  delta        int not null,
  rating_after int not null,
  created_at   timestamptz not null default now()
);
create index rating_history_user_idx on public.rating_history (user_id, game_id, created_at);

-- ---------------------------------------------------------------------
-- 3. Tournaments
-- ---------------------------------------------------------------------
create table public.tournaments (
  id               uuid primary key default gen_random_uuid(),
  game_id          text not null references public.games(id),
  name             text not null check (char_length(name) between 3 and 60),
  description      text check (description is null or char_length(description) <= 500),
  created_by       uuid not null references public.profiles(id) on delete cascade,
  status           text not null default 'open'
                   check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  max_participants int  not null check (max_participants in (4, 8, 16, 32)),
  starts_at        timestamptz,
  winner_id        uuid references public.profiles(id) on delete set null,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  completed_at     timestamptz
);
create index tournaments_status_idx on public.tournaments (status, created_at desc);

create table public.tournament_participants (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  seed          int,
  placement     int,
  joined_at     timestamptz not null default now(),
  primary key (tournament_id, user_id)
);
create index tournament_participants_user_idx on public.tournament_participants (user_id);

create table public.tournament_matches (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round         int not null,
  slot          int not null,
  player1_id    uuid references public.profiles(id) on delete set null,
  player2_id    uuid references public.profiles(id) on delete set null,
  score1        int,
  score2        int,
  winner_id     uuid references public.profiles(id) on delete set null,
  status        text not null default 'waiting'
                check (status in ('waiting', 'ready', 'completed', 'bye')),
  reported_by   uuid references public.profiles(id) on delete set null,
  completed_at  timestamptz,
  unique (tournament_id, round, slot)
);

-- ---------------------------------------------------------------------
-- 4. 1v1 duels and disputes
-- ---------------------------------------------------------------------
create table public.duels (
  id               uuid primary key default gen_random_uuid(),
  game_id          text not null references public.games(id),
  challenger_id    uuid not null references public.profiles(id) on delete cascade,
  opponent_id      uuid not null references public.profiles(id) on delete cascade,
  message          text check (message is null or char_length(message) <= 200),
  status           text not null default 'pending'
                   check (status in ('pending', 'accepted', 'declined', 'cancelled',
                                     'awaiting_confirmation', 'disputed', 'completed', 'voided')),
  challenger_score int,
  opponent_score   int,
  reported_by      uuid references public.profiles(id) on delete set null,
  reported_at      timestamptz,
  winner_id        uuid references public.profiles(id) on delete set null,
  confirmed_at     timestamptz,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint duels_different_players check (challenger_id <> opponent_id)
);
create index duels_challenger_idx on public.duels (challenger_id, created_at desc);
create index duels_opponent_idx   on public.duels (opponent_id, created_at desc);

create table public.duel_disputes (
  id              uuid primary key default gen_random_uuid(),
  duel_id         uuid not null references public.duels(id) on delete cascade,
  raised_by       uuid not null references public.profiles(id) on delete cascade,
  reason          text not null check (char_length(reason) between 10 and 500),
  status          text not null default 'open' check (status in ('open', 'resolved')),
  resolution_note text,
  resolved_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create unique index duel_disputes_one_open on public.duel_disputes (duel_id) where status = 'open';

-- ---------------------------------------------------------------------
-- 5. Teams
-- ---------------------------------------------------------------------
create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  game_id     text not null references public.games(id),
  name        text not null check (char_length(name) between 3 and 30),
  tag         text not null check (tag ~ '^[A-Z0-9]{2,5}$'),
  description text check (description is null or char_length(description) <= 280),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  is_open     boolean not null default true,  -- anyone may join without an invite
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index teams_name_lower_key on public.teams (lower(name));

create table public.team_members (
  team_id   uuid not null references public.teams(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  game_id   text not null references public.games(id),
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id),
  unique (user_id, game_id)  -- one team per game
);

create table public.team_invites (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'pending'
             check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now()
);
create unique index team_invites_one_pending on public.team_invites (team_id, user_id) where status = 'pending';

-- ---------------------------------------------------------------------
-- 6. Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------
create or replace function public._require_uid() returns uuid
language plpgsql stable as $$
declare v uuid := auth.uid();
begin
  if v is null then
    raise exception 'You need to be signed in' using errcode = '28000';
  end if;
  return v;
end $$;

create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.moderators where user_id = auth.uid());
$$;

create or replace function public._ensure_stats(p_user uuid, p_game text) returns void
language sql security definer set search_path = public as $$
  insert into public.player_stats (user_id, game_id) values (p_user, p_game)
  on conflict do nothing;
$$;

-- Elo-style rating update. The ONLY code path that changes wins/losses/rating.
create or replace function public._apply_result(
  p_game text, p_winner uuid, p_loser uuid, p_source text, p_source_id uuid, p_k int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  rw int; rl int; v_exp numeric; v_delta int; v_new_w int; v_new_l int;
begin
  perform public._ensure_stats(p_winner, p_game);
  perform public._ensure_stats(p_loser, p_game);
  perform 1 from public.player_stats
    where game_id = p_game and user_id in (p_winner, p_loser)
    order by user_id for update;

  select rating into rw from public.player_stats where user_id = p_winner and game_id = p_game;
  select rating into rl from public.player_stats where user_id = p_loser  and game_id = p_game;

  v_exp   := 1 / (1 + power(10, (rl - rw) / 400.0));
  v_delta := greatest(1, round(p_k * (1 - v_exp))::int);
  v_new_w := rw + v_delta;
  v_new_l := greatest(100, rl - v_delta);

  update public.player_stats
     set rating = v_new_w,
         best_rating = greatest(best_rating, v_new_w),
         wins = wins + 1,
         current_streak = case when current_streak > 0 then current_streak + 1 else 1 end
   where user_id = p_winner and game_id = p_game;

  update public.player_stats
     set rating = v_new_l,
         losses = losses + 1,
         current_streak = case when current_streak < 0 then current_streak - 1 else -1 end
   where user_id = p_loser and game_id = p_game;

  insert into public.rating_history (user_id, game_id, source, source_id, delta, rating_after) values
    (p_winner, p_game, p_source, p_source_id, v_new_w - rw, v_new_w),
    (p_loser,  p_game, p_source, p_source_id, v_new_l - rl, v_new_l);
end $$;

-- ---------------------------------------------------------------------
-- 7. Accounts
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_base text; v_name text; v_try int := 0; v_game text; v_avatar text;
begin
  v_base := regexp_replace(
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(coalesce(new.email, ''), '@', 1)),
    '[^A-Za-z0-9_]', '', 'g');
  if char_length(v_base) < 3 then v_base := 'player' || v_base; end if;
  v_base := left(v_base, 16);
  v_name := v_base;
  while exists (select 1 from public.profiles where lower(username) = lower(v_name)) and v_try < 25 loop
    v_try := v_try + 1;
    v_name := v_base || (1000 + floor(random() * 9000))::int::text;
  end loop;

  select id into v_game from public.games
   where id = new.raw_user_meta_data->>'main_game' and is_active;
  v_game := coalesce(v_game, 'rocket-league');

  v_avatar := coalesce(new.raw_user_meta_data->>'avatar_key', '');
  if v_avatar !~ '^[a-z]{3,12}-[a-z]{3,12}$' then v_avatar := 'bolt-violet'; end if;

  insert into public.profiles (id, auth_user_id, username, avatar_key, main_game)
  values (new.id, new.id, v_name, v_avatar, v_game);
  perform public._ensure_stats(new.id, v_game);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Players may only pick an active game as their main game.
create or replace function public.profiles_guard() returns trigger
language plpgsql as $$
begin
  if new.main_game is distinct from old.main_game
     and not exists (select 1 from public.games where id = new.main_game and is_active) then
    raise exception 'That game is not available yet';
  end if;
  return new;
end $$;
create trigger profiles_guard_trg before update on public.profiles
  for each row execute function public.profiles_guard();

create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_username ~ '^[A-Za-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where lower(username) = lower(p_username));
$$;

-- ---------------------------------------------------------------------
-- 8. Duel workflow
--    pending -> accepted -> awaiting_confirmation -> completed
--                        \-> disputed -> completed | voided
-- ---------------------------------------------------------------------
create or replace function public.challenge_duel(p_opponent uuid, p_game text, p_message text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); v_opp public.profiles%rowtype; v_id uuid;
begin
  if p_opponent = v_uid then raise exception 'You cannot challenge yourself'; end if;
  select * into v_opp from public.profiles where id = p_opponent;
  if not found then raise exception 'Player not found'; end if;
  if v_opp.is_demo then
    raise exception '% is a demo player and cannot be challenged', v_opp.username;
  end if;
  if not exists (select 1 from public.games where id = p_game and is_active) then
    raise exception 'That game is not available yet';
  end if;
  if exists (select 1 from public.duels
              where status in ('pending', 'accepted', 'awaiting_confirmation', 'disputed')
                and ((challenger_id = v_uid and opponent_id = p_opponent)
                  or (challenger_id = p_opponent and opponent_id = v_uid))) then
    raise exception 'You already have an active duel with this player';
  end if;
  if (select count(*) from public.duels where challenger_id = v_uid and status = 'pending') >= 10 then
    raise exception 'You have too many pending challenges';
  end if;
  if (select count(*) from public.duels
       where status = 'completed' and confirmed_at > now() - interval '24 hours'
         and ((challenger_id = v_uid and opponent_id = p_opponent)
           or (challenger_id = p_opponent and opponent_id = v_uid))) >= 5 then
    raise exception 'You have played this opponent 5 rated duels in the last 24 hours';
  end if;
  insert into public.duels (game_id, challenger_id, opponent_id, message)
  values (p_game, v_uid, p_opponent, nullif(left(btrim(coalesce(p_message, '')), 200), ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.respond_duel(p_duel uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); v public.duels%rowtype;
begin
  select * into v from public.duels where id = p_duel for update;
  if not found then raise exception 'Duel not found'; end if;
  if v.opponent_id <> v_uid then raise exception 'Only the challenged player can respond'; end if;
  if v.status <> 'pending' then raise exception 'This challenge is no longer pending'; end if;
  update public.duels
     set status = case when p_accept then 'accepted' else 'declined' end, updated_at = now()
   where id = p_duel;
end $$;

create or replace function public.cancel_duel(p_duel uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); v public.duels%rowtype;
begin
  select * into v from public.duels where id = p_duel for update;
  if not found then raise exception 'Duel not found'; end if;
  if v_uid not in (v.challenger_id, v.opponent_id) then raise exception 'Not your duel'; end if;
  if v.status not in ('pending', 'accepted') then
    raise exception 'This duel can no longer be cancelled';
  end if;
  update public.duels set status = 'cancelled', updated_at = now() where id = p_duel;
end $$;

create or replace function public.report_duel(p_duel uuid, p_my_score int, p_opp_score int) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); v public.duels%rowtype;
begin
  if p_my_score is null or p_opp_score is null
     or p_my_score < 0 or p_opp_score < 0 or p_my_score > 99 or p_opp_score > 99 then
    raise exception 'Scores must be between 0 and 99';
  end if;
  if p_my_score = p_opp_score then raise exception 'Draws are not allowed — enter the final score'; end if;
  select * into v from public.duels where id = p_duel for update;
  if not found then raise exception 'Duel not found'; end if;
  if v_uid not in (v.challenger_id, v.opponent_id) then raise exception 'Not your duel'; end if;
  if not (v.status = 'accepted' or (v.status = 'awaiting_confirmation' and v.reported_by = v_uid)) then
    raise exception 'A result cannot be submitted for this duel right now';
  end if;
  update public.duels
     set challenger_score = case when v.challenger_id = v_uid then p_my_score  else p_opp_score end,
         opponent_score   = case when v.challenger_id = v_uid then p_opp_score else p_my_score  end,
         reported_by = v_uid, reported_at = now(),
         status = 'awaiting_confirmation', updated_at = now()
   where id = p_duel;
end $$;

-- internal: turn a scored duel into a verified result + rating change
create or replace function public._finalize_duel(p_duel uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v public.duels%rowtype; v_win uuid; v_lose uuid;
begin
  select * into v from public.duels where id = p_duel for update;
  if v.challenger_score > v.opponent_score then
    v_win := v.challenger_id; v_lose := v.opponent_id;
  else
    v_win := v.opponent_id; v_lose := v.challenger_id;
  end if;
  update public.duels
     set status = 'completed', winner_id = v_win, confirmed_at = now(), updated_at = now()
   where id = p_duel;
  perform public._apply_result(v.game_id, v_win, v_lose, 'duel', p_duel, 32);
end $$;

create or replace function public.confirm_duel(p_duel uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); v public.duels%rowtype;
begin
  select * into v from public.duels where id = p_duel for update;
  if not found then raise exception 'Duel not found'; end if;
  if v.status <> 'awaiting_confirmation' then raise exception 'There is no result to confirm'; end if;
  if v_uid not in (v.challenger_id, v.opponent_id) or v_uid = v.reported_by then
    raise exception 'Only the opponent can confirm this result';
  end if;
  perform public._finalize_duel(p_duel);
end $$;

-- If the opponent never answers, the reporter can finalize after 48 hours.
create or replace function public.finalize_stale_duel(p_duel uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); v public.duels%rowtype;
begin
  select * into v from public.duels where id = p_duel for update;
  if not found then raise exception 'Duel not found'; end if;
  if v.status <> 'awaiting_confirmation' or v.reported_by <> v_uid then
    raise exception 'Nothing to finalize';
  end if;
  if v.reported_at > now() - interval '48 hours' then
    raise exception 'Your opponent has 48 hours to confirm or dispute';
  end if;
  perform public._finalize_duel(p_duel);
end $$;

create or replace function public.dispute_duel(p_duel uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); v public.duels%rowtype; v_id uuid; v_reason text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    raise exception 'Please explain the dispute in 10–500 characters';
  end if;
  select * into v from public.duels where id = p_duel for update;
  if not found then raise exception 'Duel not found'; end if;
  if v.status <> 'awaiting_confirmation' then raise exception 'There is no result to dispute'; end if;
  if v_uid not in (v.challenger_id, v.opponent_id) or v_uid = v.reported_by then
    raise exception 'Only the opponent can dispute this result';
  end if;
  insert into public.duel_disputes (duel_id, raised_by, reason) values (p_duel, v_uid, v_reason)
  returning id into v_id;
  update public.duels set status = 'disputed', updated_at = now() where id = p_duel;
  return v_id;
end $$;

create or replace function public.resolve_duel_dispute(
  p_dispute uuid, p_challenger_score int, p_opponent_score int, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); d public.duel_disputes%rowtype; v public.duels%rowtype;
begin
  if not public.is_moderator() then raise exception 'Moderators only'; end if;
  if p_challenger_score is null or p_opponent_score is null
     or p_challenger_score < 0 or p_opponent_score < 0
     or p_challenger_score > 99 or p_opponent_score > 99 or p_challenger_score = p_opponent_score then
    raise exception 'Enter a valid, non-drawn final score';
  end if;
  select * into d from public.duel_disputes where id = p_dispute for update;
  if not found or d.status <> 'open' then raise exception 'Dispute is not open'; end if;
  select * into v from public.duels where id = d.duel_id for update;
  if v_uid in (v.challenger_id, v.opponent_id) then
    raise exception 'You cannot moderate your own duel';
  end if;
  update public.duels
     set challenger_score = p_challenger_score, opponent_score = p_opponent_score
   where id = v.id;
  perform public._finalize_duel(v.id);
  update public.duel_disputes
     set status = 'resolved', resolved_by = v_uid, resolved_at = now(),
         resolution_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_dispute;
end $$;

create or replace function public.void_duel_dispute(p_dispute uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); d public.duel_disputes%rowtype; v public.duels%rowtype;
begin
  if not public.is_moderator() then raise exception 'Moderators only'; end if;
  select * into d from public.duel_disputes where id = p_dispute for update;
  if not found or d.status <> 'open' then raise exception 'Dispute is not open'; end if;
  select * into v from public.duels where id = d.duel_id for update;
  if v_uid in (v.challenger_id, v.opponent_id) then
    raise exception 'You cannot moderate your own duel';
  end if;
  update public.duels set status = 'voided', updated_at = now() where id = v.id;
  update public.duel_disputes
     set status = 'resolved', resolved_by = v_uid, resolved_at = now(),
         resolution_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Duel voided, no rating change')
   where id = p_dispute;
end $$;

-- ---------------------------------------------------------------------
-- 9. Tournament workflow (single elimination)
-- ---------------------------------------------------------------------
create or replace function public.create_tournament(
  p_game text, p_name text, p_description text, p_max int, p_starts_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  if char_length(v_name) < 3 or char_length(v_name) > 60 then
    raise exception 'Tournament name must be 3–60 characters';
  end if;
  if p_max not in (4, 8, 16, 32) then raise exception 'Choose 4, 8, 16 or 32 players'; end if;
  if not exists (select 1 from public.games where id = p_game and is_active) then
    raise exception 'That game is not available yet';
  end if;
  if (select count(*) from public.tournaments where created_by = v_uid and status in ('open', 'in_progress')) >= 3 then
    raise exception 'You can run at most 3 tournaments at a time';
  end if;
  insert into public.tournaments (game_id, name, description, created_by, max_participants, starts_at)
  values (p_game, v_name, nullif(left(btrim(coalesce(p_description, '')), 500), ''), v_uid, p_max, p_starts_at)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.join_tournament(p_tournament uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); t public.tournaments%rowtype;
begin
  select * into t from public.tournaments where id = p_tournament for update;
  if not found then raise exception 'Tournament not found'; end if;
  if t.is_demo then raise exception 'Demo tournaments are samples and cannot be joined'; end if;
  if t.status <> 'open' then raise exception 'Registration is closed'; end if;
  if exists (select 1 from public.tournament_participants where tournament_id = t.id and user_id = v_uid) then
    raise exception 'You have already joined';
  end if;
  if (select count(*) from public.tournament_participants where tournament_id = t.id) >= t.max_participants then
    raise exception 'This tournament is full';
  end if;
  insert into public.tournament_participants (tournament_id, user_id) values (t.id, v_uid);
  perform public._ensure_stats(v_uid, t.game_id);
end $$;

create or replace function public.leave_tournament(p_tournament uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); t public.tournaments%rowtype;
begin
  select * into t from public.tournaments where id = p_tournament for update;
  if not found then raise exception 'Tournament not found'; end if;
  if t.status <> 'open' then raise exception 'You can only leave before the tournament starts'; end if;
  delete from public.tournament_participants where tournament_id = t.id and user_id = v_uid;
end $$;

create or replace function public.cancel_tournament(p_tournament uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); t public.tournaments%rowtype;
begin
  select * into t from public.tournaments where id = p_tournament for update;
  if not found then raise exception 'Tournament not found'; end if;
  if not (t.created_by = v_uid and t.status = 'open')
     and not (public.is_moderator() and t.status in ('open', 'in_progress')) then
    raise exception 'You cannot cancel this tournament';
  end if;
  update public.tournaments set status = 'cancelled', completed_at = now() where id = t.id;
end $$;

-- internal: push a match winner into the next round
create or replace function public._advance_winner(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m public.tournament_matches%rowtype; v_rounds int; v_next uuid;
begin
  select * into m from public.tournament_matches where id = p_match;
  select max(round) into v_rounds from public.tournament_matches where tournament_id = m.tournament_id;
  if m.round >= v_rounds then return; end if;
  select id into v_next from public.tournament_matches
   where tournament_id = m.tournament_id and round = m.round + 1 and slot = (m.slot + 1) / 2;
  if m.slot % 2 = 1 then
    update public.tournament_matches set player1_id = m.winner_id where id = v_next;
  else
    update public.tournament_matches set player2_id = m.winner_id where id = v_next;
  end if;
  update public.tournament_matches set status = 'ready'
   where id = v_next and player1_id is not null and player2_id is not null and status = 'waiting';
end $$;

create or replace function public.start_tournament(p_tournament uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid(); t public.tournaments%rowtype;
  n int; v_size int := 2; v_rounds int := 1; v_cur int := 1;
  v_order int[]; v_nxt int[]; v_users uuid[]; i int; r int; s int;
  v_a int; v_b int; v_p2 uuid; v_mid uuid;
begin
  select * into t from public.tournaments where id = p_tournament for update;
  if not found then raise exception 'Tournament not found'; end if;
  if t.created_by <> v_uid then raise exception 'Only the organizer can start the tournament'; end if;
  if t.status <> 'open' then raise exception 'This tournament has already started'; end if;
  select count(*) into n from public.tournament_participants where tournament_id = t.id;
  if n < 4 then raise exception 'At least 4 players are needed to start'; end if;

  while v_size < n loop v_size := v_size * 2; v_rounds := v_rounds + 1; end loop;

  with ranked as (
    select user_id, row_number() over (order by random()) as rn
      from public.tournament_participants where tournament_id = t.id)
  update public.tournament_participants tp set seed = ranked.rn
    from ranked where tp.tournament_id = t.id and tp.user_id = ranked.user_id;

  select array_agg(user_id order by seed) into v_users
    from public.tournament_participants where tournament_id = t.id;

  -- standard bracket order: 1 v size, 2 v size-1 ... with top seeds kept apart
  v_order := array[1];
  while v_cur < v_size loop
    v_cur := v_cur * 2;
    v_nxt := '{}';
    foreach i in array v_order loop
      v_nxt := v_nxt || i || (v_cur + 1 - i);
    end loop;
    v_order := v_nxt;
  end loop;

  for s in 1 .. v_size / 2 loop
    v_a  := v_order[2 * s - 1];
    v_b  := v_order[2 * s];
    v_p2 := case when v_b <= n then v_users[v_b] else null end;
    insert into public.tournament_matches
      (tournament_id, round, slot, player1_id, player2_id, status, winner_id, completed_at)
    values
      (t.id, 1, s, v_users[v_a], v_p2,
       case when v_p2 is null then 'bye' else 'ready' end,
       case when v_p2 is null then v_users[v_a] end,
       case when v_p2 is null then now() end);
  end loop;

  for r in 2 .. v_rounds loop
    for s in 1 .. v_size / (1 << r) loop
      insert into public.tournament_matches (tournament_id, round, slot, status)
      values (t.id, r, s, 'waiting');
    end loop;
  end loop;

  for v_mid in select id from public.tournament_matches where tournament_id = t.id and status = 'bye' loop
    perform public._advance_winner(v_mid);
  end loop;

  update public.tournaments set status = 'in_progress', started_at = now() where id = t.id;
end $$;

create or replace function public.report_tournament_match(p_match uuid, p_score1 int, p_score2 int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid(); v_mod boolean := public.is_moderator();
  m public.tournament_matches%rowtype; t public.tournaments%rowtype;
  v_rounds int; v_win uuid; v_lose uuid;
begin
  if p_score1 is null or p_score2 is null or p_score1 < 0 or p_score2 < 0
     or p_score1 > 99 or p_score2 > 99 or p_score1 = p_score2 then
    raise exception 'Enter a valid, non-drawn final score';
  end if;
  select * into m from public.tournament_matches where id = p_match for update;
  if not found then raise exception 'Match not found'; end if;
  select * into t from public.tournaments where id = m.tournament_id for update;
  if t.created_by <> v_uid and not v_mod then
    raise exception 'Only the tournament organizer can record results';
  end if;
  if v_uid in (m.player1_id, m.player2_id) and not v_mod then
    raise exception 'Organizers cannot record their own matches — ask a moderator';
  end if;
  if t.status <> 'in_progress' or m.status <> 'ready' then
    raise exception 'This match is not ready for a result';
  end if;

  v_win  := case when p_score1 > p_score2 then m.player1_id else m.player2_id end;
  v_lose := case when p_score1 > p_score2 then m.player2_id else m.player1_id end;

  update public.tournament_matches
     set score1 = p_score1, score2 = p_score2, winner_id = v_win,
         status = 'completed', reported_by = v_uid, completed_at = now()
   where id = m.id;

  select max(round) into v_rounds from public.tournament_matches where tournament_id = t.id;
  update public.tournament_participants
     set placement = power(2, v_rounds - m.round)::int + 1
   where tournament_id = t.id and user_id = v_lose;

  perform public._apply_result(t.game_id, v_win, v_lose, 'tournament', m.id, 24);

  if m.round = v_rounds then
    update public.tournaments set status = 'completed', winner_id = v_win, completed_at = now() where id = t.id;
    update public.tournament_participants set placement = 1 where tournament_id = t.id and user_id = v_win;
  else
    perform public._advance_winner(m.id);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 10. Team workflow
-- ---------------------------------------------------------------------
create or replace function public.create_team(
  p_game text, p_name text, p_tag text, p_description text default null, p_is_open boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid(); v_id uuid;
  v_name text := btrim(coalesce(p_name, '')); v_tag text := upper(btrim(coalesce(p_tag, '')));
begin
  if char_length(v_name) < 3 or char_length(v_name) > 30 then
    raise exception 'Team name must be 3–30 characters';
  end if;
  if v_tag !~ '^[A-Z0-9]{2,5}$' then raise exception 'Team tag must be 2–5 letters or numbers'; end if;
  if not exists (select 1 from public.games where id = p_game and is_active) then
    raise exception 'That game is not available yet';
  end if;
  if exists (select 1 from public.team_members where user_id = v_uid and game_id = p_game) then
    raise exception 'You are already in a team for this game';
  end if;
  begin
    insert into public.teams (game_id, name, tag, description, owner_id, is_open)
    values (p_game, v_name, v_tag, nullif(left(btrim(coalesce(p_description, '')), 280), ''), v_uid, coalesce(p_is_open, true))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'That team name is already taken';
  end;
  insert into public.team_members (team_id, user_id, game_id, role) values (v_id, v_uid, p_game, 'owner');
  perform public._ensure_stats(v_uid, p_game);
  return v_id;
end $$;

create or replace function public.update_team(p_team uuid, p_description text, p_is_open boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid();
begin
  update public.teams
     set description = nullif(left(btrim(coalesce(p_description, '')), 280), ''),
         is_open = coalesce(p_is_open, is_open)
   where id = p_team and owner_id = v_uid;
  if not found then raise exception 'Only the team owner can edit the team'; end if;
end $$;

create or replace function public.invite_to_team(p_team uuid, p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid(); t public.teams%rowtype; v_target public.profiles%rowtype;
  v_cap int; v_id uuid;
begin
  select * into t from public.teams where id = p_team for update;
  if not found then raise exception 'Team not found'; end if;
  if t.owner_id <> v_uid then raise exception 'Only the team owner can invite players'; end if;
  if t.is_demo then raise exception 'Demo teams are samples'; end if;
  select * into v_target from public.profiles where id = p_user;
  if not found then raise exception 'Player not found'; end if;
  if v_target.is_demo then raise exception 'Demo players cannot be invited'; end if;
  if exists (select 1 from public.team_members where user_id = p_user and game_id = t.game_id) then
    raise exception '% is already in a team for this game', v_target.username;
  end if;
  select roster_size into v_cap from public.games where id = t.game_id;
  if (select count(*) from public.team_members where team_id = t.id) >= v_cap then
    raise exception 'Your roster is full';
  end if;
  begin
    insert into public.team_invites (team_id, user_id, invited_by) values (t.id, p_user, v_uid)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'This player already has a pending invite';
  end;
  return v_id;
end $$;

create or replace function public.respond_team_invite(p_invite uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); i public.team_invites%rowtype; t public.teams%rowtype; v_cap int;
begin
  select * into i from public.team_invites where id = p_invite for update;
  if not found or i.user_id <> v_uid then raise exception 'Invite not found'; end if;
  if i.status <> 'pending' then raise exception 'This invite is no longer pending'; end if;
  if not p_accept then
    update public.team_invites set status = 'declined' where id = i.id;
    return;
  end if;
  select * into t from public.teams where id = i.team_id for update;
  if exists (select 1 from public.team_members where user_id = v_uid and game_id = t.game_id) then
    raise exception 'You are already in a team for this game';
  end if;
  select roster_size into v_cap from public.games where id = t.game_id;
  if (select count(*) from public.team_members where team_id = t.id) >= v_cap then
    raise exception 'That team is full';
  end if;
  insert into public.team_members (team_id, user_id, game_id) values (t.id, v_uid, t.game_id);
  update public.team_invites set status = 'accepted' where id = i.id;
  perform public._ensure_stats(v_uid, t.game_id);
end $$;

create or replace function public.cancel_team_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid();
begin
  update public.team_invites ti set status = 'cancelled'
   where ti.id = p_invite and ti.status = 'pending'
     and exists (select 1 from public.teams t where t.id = ti.team_id and t.owner_id = v_uid);
  if not found then raise exception 'Invite not found'; end if;
end $$;

create or replace function public.join_team(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); t public.teams%rowtype; v_cap int;
begin
  select * into t from public.teams where id = p_team for update;
  if not found then raise exception 'Team not found'; end if;
  if t.is_demo then raise exception 'Demo teams are samples and cannot be joined'; end if;
  if not t.is_open then raise exception 'This team is invite-only'; end if;
  if exists (select 1 from public.team_members where user_id = v_uid and game_id = t.game_id) then
    raise exception 'You are already in a team for this game';
  end if;
  select roster_size into v_cap from public.games where id = t.game_id;
  if (select count(*) from public.team_members where team_id = t.id) >= v_cap then
    raise exception 'That team is full';
  end if;
  insert into public.team_members (team_id, user_id, game_id) values (t.id, v_uid, t.game_id);
  perform public._ensure_stats(v_uid, t.game_id);
end $$;

create or replace function public.leave_team(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); t public.teams%rowtype; v_heir uuid;
begin
  select * into t from public.teams where id = p_team for update;
  if not found then raise exception 'Team not found'; end if;
  if not exists (select 1 from public.team_members where team_id = t.id and user_id = v_uid) then
    raise exception 'You are not in this team';
  end if;
  if t.owner_id = v_uid then
    select user_id into v_heir from public.team_members
     where team_id = t.id and user_id <> v_uid order by joined_at limit 1;
    if v_heir is null then
      delete from public.teams where id = t.id;  -- last member out disbands the team
      return;
    end if;
    update public.teams set owner_id = v_heir where id = t.id;
    update public.team_members set role = 'owner' where team_id = t.id and user_id = v_heir;
  end if;
  delete from public.team_members where team_id = t.id and user_id = v_uid;
end $$;

create or replace function public.remove_team_member(p_team uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid();
begin
  if p_user = v_uid then raise exception 'Use "Leave team" instead'; end if;
  if not exists (select 1 from public.teams where id = p_team and owner_id = v_uid) then
    raise exception 'Only the team owner can remove players';
  end if;
  delete from public.team_members where team_id = p_team and user_id = p_user;
end $$;

-- ---------------------------------------------------------------------
-- 11. Read models (security_invoker: RLS of the caller still applies)
-- ---------------------------------------------------------------------
create view public.leaderboard with (security_invoker = true) as
select ps.game_id, ps.user_id, p.username, p.avatar_key, p.is_demo,
       ps.rating, ps.best_rating, ps.wins, ps.losses, ps.matches_played,
       round(100.0 * ps.wins / nullif(ps.matches_played, 0), 1) as win_rate,
       ps.current_streak,
       rank() over (partition by ps.game_id, p.is_demo order by ps.rating desc, ps.wins desc) as group_rank
  from public.player_stats ps
  join public.profiles p on p.id = ps.user_id
 where ps.matches_played > 0;

create view public.global_leaderboard with (security_invoker = true) as
select p.id as user_id, p.username, p.avatar_key, p.is_demo,
       round(sum(ps.rating * ps.matches_played)::numeric / sum(ps.matches_played))::int as rating,
       sum(ps.wins)::int as wins, sum(ps.losses)::int as losses,
       sum(ps.matches_played)::int as matches_played,
       round(100.0 * sum(ps.wins) / sum(ps.matches_played), 1) as win_rate
  from public.player_stats ps
  join public.profiles p on p.id = ps.user_id
 where ps.matches_played > 0
 group by p.id, p.username, p.avatar_key, p.is_demo;

create view public.tournament_overview with (security_invoker = true) as
select t.*,
       (select count(*) from public.tournament_participants tp where tp.tournament_id = t.id)::int as participant_count,
       c.username as creator_username, c.avatar_key as creator_avatar,
       w.username as winner_username
  from public.tournaments t
  join public.profiles c on c.id = t.created_by
  left join public.profiles w on w.id = t.winner_id;

create view public.duel_overview with (security_invoker = true) as
select d.*,
       c.username as challenger_username, c.avatar_key as challenger_avatar, c.is_demo as challenger_is_demo,
       o.username as opponent_username,   o.avatar_key as opponent_avatar,   o.is_demo as opponent_is_demo
  from public.duels d
  join public.profiles c on c.id = d.challenger_id
  join public.profiles o on o.id = d.opponent_id;

create view public.dispute_overview with (security_invoker = true) as
select dd.id, dd.duel_id, dd.raised_by, dd.reason, dd.status, dd.resolution_note, dd.created_at, dd.resolved_at,
       d.game_id, d.challenger_id, d.opponent_id, d.challenger_score, d.opponent_score, d.reported_by,
       c.username as challenger_username, o.username as opponent_username, r.username as raised_by_username
  from public.duel_disputes dd
  join public.duels d on d.id = dd.duel_id
  join public.profiles c on c.id = d.challenger_id
  join public.profiles o on o.id = d.opponent_id
  join public.profiles r on r.id = dd.raised_by;

create view public.team_overview with (security_invoker = true) as
select s.*,
       rank() over (partition by s.game_id, s.is_demo order by s.avg_rating desc, s.wins desc) as group_rank
  from (
    select t.id, t.game_id, t.name, t.tag, t.description, t.owner_id, t.is_open, t.is_demo, t.created_at,
           o.username as owner_username,
           count(tm.user_id)::int as member_count,
           coalesce(round(avg(ps.rating)), 1000)::int as avg_rating,
           coalesce(sum(ps.wins), 0)::int as wins,
           coalesce(sum(ps.losses), 0)::int as losses
      from public.teams t
      join public.profiles o on o.id = t.owner_id
      left join public.team_members tm on tm.team_id = t.id
      left join public.player_stats ps on ps.user_id = tm.user_id and ps.game_id = t.game_id
     group by t.id, o.username
  ) s;

create view public.team_invite_overview with (security_invoker = true) as
select ti.id, ti.team_id, ti.user_id, ti.invited_by, ti.status, ti.created_at,
       t.name as team_name, t.tag as team_tag, t.game_id,
       inv.username as inviter_username, usr.username as invitee_username, usr.avatar_key as invitee_avatar
  from public.team_invites ti
  join public.teams t on t.id = ti.team_id
  join public.profiles inv on inv.id = ti.invited_by
  join public.profiles usr on usr.id = ti.user_id;

-- one row per player per finished match (duel or tournament)
create view public.match_history with (security_invoker = true) as
select * from (
  select d.id as match_id, 'duel'::text as kind, d.game_id, d.challenger_id as user_id,
         d.opponent_id as opponent_id, d.challenger_score as my_score, d.opponent_score as opp_score,
         (d.winner_id = d.challenger_id) as won, d.confirmed_at as played_at, null::text as context, d.is_demo
    from public.duels d where d.status = 'completed'
  union all
  select d.id, 'duel', d.game_id, d.opponent_id, d.challenger_id, d.opponent_score, d.challenger_score,
         (d.winner_id = d.opponent_id), d.confirmed_at, null::text, d.is_demo
    from public.duels d where d.status = 'completed'
  union all
  select m.id, 'tournament', t.game_id, m.player1_id, m.player2_id, m.score1, m.score2,
         (m.winner_id = m.player1_id), m.completed_at, t.name, t.is_demo
    from public.tournament_matches m join public.tournaments t on t.id = m.tournament_id
   where m.status = 'completed' and m.player1_id is not null and m.player2_id is not null
  union all
  select m.id, 'tournament', t.game_id, m.player2_id, m.player1_id, m.score2, m.score1,
         (m.winner_id = m.player2_id), m.completed_at, t.name, t.is_demo
    from public.tournament_matches m join public.tournaments t on t.id = m.tournament_id
   where m.status = 'completed' and m.player1_id is not null and m.player2_id is not null
) h;

create view public.match_history_detailed with (security_invoker = true) as
select h.*, p.username as opponent_username, p.avatar_key as opponent_avatar
  from public.match_history h
  join public.profiles p on p.id = h.opponent_id;

-- ---------------------------------------------------------------------
-- 12. Row-level security
-- ---------------------------------------------------------------------
alter table public.games                   enable row level security;
alter table public.profiles                enable row level security;
alter table public.moderators              enable row level security;
alter table public.player_stats            enable row level security;
alter table public.rating_history          enable row level security;
alter table public.tournaments             enable row level security;
alter table public.tournament_participants enable row level security;
alter table public.tournament_matches      enable row level security;
alter table public.duels                   enable row level security;
alter table public.duel_disputes           enable row level security;
alter table public.teams                   enable row level security;
alter table public.team_members            enable row level security;
alter table public.team_invites            enable row level security;

-- public, read-only competitive data
create policy games_read        on public.games                   for select using (true);
create policy profiles_read     on public.profiles                for select using (true);
create policy stats_read        on public.player_stats            for select using (true);
create policy rating_hist_read  on public.rating_history          for select using (true);
create policy tournaments_read  on public.tournaments             for select using (true);
create policy t_participants_read on public.tournament_participants for select using (true);
create policy t_matches_read    on public.tournament_matches      for select using (true);
create policy teams_read        on public.teams                   for select using (true);
create policy team_members_read on public.team_members            for select using (true);

-- duels: private to the two players (and moderators) until verified & completed
create policy duels_read on public.duels for select using (
  auth.uid() in (challenger_id, opponent_id) or status = 'completed' or public.is_moderator()
);
create policy disputes_read on public.duel_disputes for select using (
  raised_by = auth.uid()
  or exists (select 1 from public.duels d where d.id = duel_id and auth.uid() in (d.challenger_id, d.opponent_id))
  or public.is_moderator()
);
create policy team_invites_read on public.team_invites for select using (
  auth.uid() in (user_id, invited_by)
  or exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid())
);

-- the single direct write: a player editing their own cosmetic profile
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid() and not is_demo)
  with check (id = auth.uid() and not is_demo);

-- ---------------------------------------------------------------------
-- 13. Privileges: lock everything down, then open only what is intended
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
revoke select on public.moderators from anon, authenticated;
grant update (username, avatar_key, main_game, bio) on public.profiles to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.username_available(text)                       to anon, authenticated;
grant execute on function public.is_moderator()                                 to authenticated;
grant execute on function public.challenge_duel(uuid, text, text)               to authenticated;
grant execute on function public.respond_duel(uuid, boolean)                    to authenticated;
grant execute on function public.cancel_duel(uuid)                              to authenticated;
grant execute on function public.report_duel(uuid, int, int)                    to authenticated;
grant execute on function public.confirm_duel(uuid)                             to authenticated;
grant execute on function public.finalize_stale_duel(uuid)                      to authenticated;
grant execute on function public.dispute_duel(uuid, text)                       to authenticated;
grant execute on function public.resolve_duel_dispute(uuid, int, int, text)     to authenticated;
grant execute on function public.void_duel_dispute(uuid, text)                  to authenticated;
grant execute on function public.create_tournament(text, text, text, int, timestamptz) to authenticated;
grant execute on function public.join_tournament(uuid)                          to authenticated;
grant execute on function public.leave_tournament(uuid)                         to authenticated;
grant execute on function public.cancel_tournament(uuid)                        to authenticated;
grant execute on function public.start_tournament(uuid)                         to authenticated;
grant execute on function public.report_tournament_match(uuid, int, int)        to authenticated;
grant execute on function public.create_team(text, text, text, text, boolean)   to authenticated;
grant execute on function public.update_team(uuid, text, boolean)               to authenticated;
grant execute on function public.invite_to_team(uuid, uuid)                     to authenticated;
grant execute on function public.respond_team_invite(uuid, boolean)             to authenticated;
grant execute on function public.cancel_team_invite(uuid)                       to authenticated;
grant execute on function public.join_team(uuid)                                to authenticated;
grant execute on function public.leave_team(uuid)                               to authenticated;
grant execute on function public.remove_team_member(uuid, uuid)                 to authenticated;
-- NOTE: _apply_result, _finalize_duel, _advance_winner, _ensure_stats and
-- handle_new_user are intentionally NOT granted to any client role.
