-- =====================================================================
-- GGLeague DEMO DATA (optional)
--
-- Everything inserted here is flagged is_demo = true. Demo players have no
-- login (auth_user_id is null), cannot be challenged or invited, and demo
-- tournaments/teams cannot be joined. The UI labels all of it "DEMO" and
-- ranks it separately from real players.
--
-- Run in the Supabase SQL editor (runs as an admin role, so it bypasses RLS).
-- To remove all demo data later, run the cleanup block at the bottom.
-- =====================================================================

-- 12 demo players ----------------------------------------------------
insert into public.profiles (id, username, avatar_key, main_game, bio, is_demo) values
  ('d0000000-0000-0000-0000-000000000001', 'NovaStrike',   'bolt-violet',  'rocket-league', 'Demo player. Aerial specialist.',        true),
  ('d0000000-0000-0000-0000-000000000002', 'VoltRider',    'flame-amber',  'rocket-league', 'Demo player. Boost-starved but fearless.', true),
  ('d0000000-0000-0000-0000-000000000003', 'AeroPhantom',  'ghost-cyan',   'rocket-league', 'Demo player. Ceiling shots only.',       true),
  ('d0000000-0000-0000-0000-000000000004', 'TurboNinja',   'star-pink',    'rocket-league', 'Demo player. Flip resets for breakfast.', true),
  ('d0000000-0000-0000-0000-000000000005', 'SkyBreaker',   'wave-blue',    'rocket-league', 'Demo player.',                           true),
  ('d0000000-0000-0000-0000-000000000006', 'Pulsar',       'orbit-violet', 'rocket-league', 'Demo player.',                           true),
  ('d0000000-0000-0000-0000-000000000007', 'ApexOrbit',    'orbit-cyan',   'rocket-league', 'Demo player.',                           true),
  ('d0000000-0000-0000-0000-000000000008', 'BoostGoblin',  'ghost-green',  'rocket-league', 'Demo player. Collects every pad.',       true),
  ('d0000000-0000-0000-0000-000000000009', 'DriftKing',    'crown-amber',  'rocket-league', 'Demo player.',                           true),
  ('d0000000-0000-0000-0000-000000000010', 'Zenith',       'shield-blue',  'rocket-league', 'Demo player.',                           true),
  ('d0000000-0000-0000-0000-000000000011', 'CrimsonFlare', 'flame-pink',   'rocket-league', 'Demo player.',                           true),
  ('d0000000-0000-0000-0000-000000000012', 'LunarLoop',    'wave-green',   'rocket-league', 'Demo player.',                           true);

insert into public.player_stats (user_id, game_id, rating, best_rating, wins, losses, current_streak) values
  ('d0000000-0000-0000-0000-000000000001', 'rocket-league', 1486, 1502, 41, 14,  5),
  ('d0000000-0000-0000-0000-000000000002', 'rocket-league', 1431, 1450, 36, 17,  2),
  ('d0000000-0000-0000-0000-000000000003', 'rocket-league', 1377, 1390, 31, 18, -1),
  ('d0000000-0000-0000-0000-000000000004', 'rocket-league', 1342, 1371, 28, 20,  3),
  ('d0000000-0000-0000-0000-000000000005', 'rocket-league', 1296, 1310, 24, 21, -2),
  ('d0000000-0000-0000-0000-000000000006', 'rocket-league', 1250, 1288, 22, 22,  1),
  ('d0000000-0000-0000-0000-000000000007', 'rocket-league', 1198, 1240, 19, 24, -3),
  ('d0000000-0000-0000-0000-000000000008', 'rocket-league', 1144, 1180, 15, 22,  1),
  ('d0000000-0000-0000-0000-000000000009', 'rocket-league', 1112, 1150, 13, 21, -1),
  ('d0000000-0000-0000-0000-000000000010', 'rocket-league', 1087, 1120, 12, 19,  2),
  ('d0000000-0000-0000-0000-000000000011', 'rocket-league', 1049, 1100,  9, 17, -4),
  ('d0000000-0000-0000-0000-000000000012', 'rocket-league', 1021, 1060,  7, 15,  1)
on conflict (user_id, game_id) do update
  set rating = excluded.rating, best_rating = excluded.best_rating, wins = excluded.wins,
      losses = excluded.losses, current_streak = excluded.current_streak;

-- Demo rating history (so demo profiles show a chart) ----------------
insert into public.rating_history (user_id, game_id, source, delta, rating_after, created_at)
select p.id, 'rocket-league', 'duel', d.delta, 1000 + d.cum, now() - ((12 - d.n) * interval '3 days')
from (values
  ('d0000000-0000-0000-0000-000000000001'::uuid),
  ('d0000000-0000-0000-0000-000000000002'::uuid),
  ('d0000000-0000-0000-0000-000000000003'::uuid)
) as p(id)
cross join lateral (
  select n, (case when n % 4 = 0 then -12 else 16 end) as delta,
         sum(case when n % 4 = 0 then -12 else 16 end) over (order by n) as cum
  from generate_series(1, 12) n
) d;

-- Demo completed tournament (8 players) ------------------------------
insert into public.tournaments (id, game_id, name, description, created_by, status, max_participants, winner_id, is_demo, created_at, started_at, completed_at)
values ('d1000000-0000-0000-0000-000000000001', 'rocket-league', 'Demo Cup: Autumn Open',
        'Sample tournament showing a finished single-elimination bracket.',
        'd0000000-0000-0000-0000-000000000001', 'completed', 8,
        'd0000000-0000-0000-0000-000000000001', true,
        now() - interval '9 days', now() - interval '8 days', now() - interval '8 days');

insert into public.tournament_participants (tournament_id, user_id, seed, placement) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 1, 1),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 2, 2),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 3, 3),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004', 4, 3),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000005', 5, 5),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000006', 6, 5),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000007', 7, 5),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000008', 8, 5);

insert into public.tournament_matches (tournament_id, round, slot, player1_id, player2_id, score1, score2, winner_id, status, completed_at) values
  ('d1000000-0000-0000-0000-000000000001', 1, 1, 'd0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000008', 4, 1, 'd0000000-0000-0000-0000-000000000001', 'completed', now() - interval '8 days'),
  ('d1000000-0000-0000-0000-000000000001', 1, 2, 'd0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000005', 3, 2, 'd0000000-0000-0000-0000-000000000004', 'completed', now() - interval '8 days'),
  ('d1000000-0000-0000-0000-000000000001', 1, 3, 'd0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000006', 5, 2, 'd0000000-0000-0000-0000-000000000003', 'completed', now() - interval '8 days'),
  ('d1000000-0000-0000-0000-000000000001', 1, 4, 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000007', 2, 1, 'd0000000-0000-0000-0000-000000000002', 'completed', now() - interval '8 days'),
  ('d1000000-0000-0000-0000-000000000001', 2, 1, 'd0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004', 3, 1, 'd0000000-0000-0000-0000-000000000001', 'completed', now() - interval '8 days'),
  ('d1000000-0000-0000-0000-000000000001', 2, 2, 'd0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', 1, 2, 'd0000000-0000-0000-0000-000000000002', 'completed', now() - interval '8 days'),
  ('d1000000-0000-0000-0000-000000000001', 3, 1, 'd0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 4, 3, 'd0000000-0000-0000-0000-000000000001', 'completed', now() - interval '8 days');

-- Demo open tournament -----------------------------------------------
insert into public.tournaments (id, game_id, name, description, created_by, status, max_participants, starts_at, is_demo)
values ('d1000000-0000-0000-0000-000000000002', 'rocket-league', 'Demo Cup: Winter Showdown',
        'Sample open tournament. Real tournaments you create will appear alongside it.',
        'd0000000-0000-0000-0000-000000000009', 'open', 16, now() + interval '5 days', true);
insert into public.tournament_participants (tournament_id, user_id)
select 'd1000000-0000-0000-0000-000000000002', id from public.profiles
 where is_demo and username in ('DriftKing', 'Zenith', 'CrimsonFlare', 'LunarLoop', 'Pulsar', 'ApexOrbit');

-- Demo completed duels -----------------------------------------------
insert into public.duels (game_id, challenger_id, opponent_id, status, challenger_score, opponent_score, reported_by, reported_at, winner_id, confirmed_at, is_demo, created_at, updated_at)
select 'rocket-league', c, o, 'completed', cs, os, c, now() - ago, case when cs > os then c else o end, now() - ago, true, now() - ago, now() - ago
from (values
  ('d0000000-0000-0000-0000-000000000001'::uuid, 'd0000000-0000-0000-0000-000000000002'::uuid, 3, 2, interval '2 hours'),
  ('d0000000-0000-0000-0000-000000000003'::uuid, 'd0000000-0000-0000-0000-000000000004'::uuid, 1, 4, interval '5 hours'),
  ('d0000000-0000-0000-0000-000000000005'::uuid, 'd0000000-0000-0000-0000-000000000006'::uuid, 2, 3, interval '1 day'),
  ('d0000000-0000-0000-0000-000000000007'::uuid, 'd0000000-0000-0000-0000-000000000008'::uuid, 5, 1, interval '1 day 4 hours'),
  ('d0000000-0000-0000-0000-000000000009'::uuid, 'd0000000-0000-0000-0000-000000000010'::uuid, 2, 1, interval '2 days'),
  ('d0000000-0000-0000-0000-000000000011'::uuid, 'd0000000-0000-0000-0000-000000000012'::uuid, 0, 3, interval '3 days'),
  ('d0000000-0000-0000-0000-000000000002'::uuid, 'd0000000-0000-0000-0000-000000000004'::uuid, 4, 4 - 1, interval '4 days'),
  ('d0000000-0000-0000-0000-000000000001'::uuid, 'd0000000-0000-0000-0000-000000000003'::uuid, 2, 0, interval '5 days')
) as v(c, o, cs, os, ago);

-- Demo teams ---------------------------------------------------------
insert into public.teams (id, game_id, name, tag, description, owner_id, is_open, is_demo) values
  ('d2000000-0000-0000-0000-000000000001', 'rocket-league', 'Overdrive Esports', 'ODV', 'Demo team. Aggressive rotations.', 'd0000000-0000-0000-0000-000000000001', false, true),
  ('d2000000-0000-0000-0000-000000000002', 'rocket-league', 'Night Circuit',     'NTC', 'Demo team. Late-night grinders.',   'd0000000-0000-0000-0000-000000000003', true,  true),
  ('d2000000-0000-0000-0000-000000000003', 'rocket-league', 'Pulse Garage',      'PLS', 'Demo team. Casual but competitive.', 'd0000000-0000-0000-0000-000000000006', true,  true);

insert into public.team_members (team_id, user_id, game_id, role) values
  ('d2000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'rocket-league', 'owner'),
  ('d2000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'rocket-league', 'member'),
  ('d2000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004', 'rocket-league', 'member'),
  ('d2000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 'rocket-league', 'owner'),
  ('d2000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000005', 'rocket-league', 'member'),
  ('d2000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000007', 'rocket-league', 'member'),
  ('d2000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000006', 'rocket-league', 'owner'),
  ('d2000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000008', 'rocket-league', 'member'),
  ('d2000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000012', 'rocket-league', 'member');

-- =====================================================================
-- CLEANUP: remove every piece of demo data (uncomment and run)
-- =====================================================================
-- delete from public.tournaments where is_demo;
-- delete from public.duels       where is_demo;
-- delete from public.teams       where is_demo;
-- delete from public.profiles    where is_demo;   -- cascades stats and history
