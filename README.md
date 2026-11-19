# GGLeague

Competitive gaming platform: tournaments, ranked 1v1 duels, teams and leaderboards.
React + TypeScript + Vite frontend, Supabase (Auth, Postgres, RLS) backend. Launches with Rocket League; Fortnite and VALORANT are already seeded as "coming soon".

## Setup

1. Create a project at supabase.com.
2. SQL editor: run `supabase/migrations/20261117000000_ggleague_schema.sql`.
3. Optional demo content: run `supabase/seed.sql`. Everything in it is flagged `is_demo` and labelled DEMO in the UI. The cleanup block at the bottom removes it.
4. `cp .env.example .env.local` and fill in your project URL and publishable/anon key.
5. `npm install && npm run dev`
6. Auth → Providers → Email. Turn off "Confirm email" for instant sign-up while developing.

### Making a moderator
Moderators resolve duel disputes and can record/cancel tournament matches. Sign up, then run:

    insert into public.moderators (user_id) select id from public.profiles where username = 'YourName';

## How integrity is enforced

- Clients have read access to public competitive data and **no direct write access** to any competitive table. Revoked at the privilege level, not just by policy.
- The only direct write allowed is `UPDATE (username, avatar_key, main_game, bio)` on your own profile row.
- Every other change goes through `SECURITY DEFINER` functions that validate caller and state transition: `challenge_duel`, `respond_duel`, `report_duel`, `confirm_duel`, `dispute_duel`, `start_tournament`, `report_tournament_match`, `create_team`, and so on.
- Wins, losses and rating change only inside `_apply_result`, which no client role can execute. It runs when an opponent confirms a duel, a moderator resolves a dispute, or an organizer records a tournament match.
- Duels are private to the two players (and moderators) until verified.
- Tournament organizers cannot record their own matches.

## Duel lifecycle
`pending → accepted → awaiting_confirmation → completed`, or `→ disputed → completed | voided`. If an opponent never responds, the reporter can finalize after 48 hours.

## Duel lobby
Accepting a challenge opens a lobby (`/duels/:id`, migration `20261118000000_duel_lobby.sql`):
1. Either player edits the match details: series (best of 1/3/5), arena, who hosts, play now or scheduled, house rules.
2. Any change clears both players' ready flags. When both press Ready the lobby locks.
3. A locked lobby reveals a system-generated lobby name and password for the in-game private match.
4. A result can only be submitted after the lock. In a best of 3/5 the score is games won and the server checks the winner has exactly the required number.

Run both migrations in order. The lobby page polls every 3 seconds while open.

## Adding a game
`update public.games set is_active = true where id = 'valorant';` and adjust `roster_size`. Ratings, ladders, duels, tournaments and teams are all keyed by `game_id`, so no schema change is needed.

## Demo vs real data
Demo players have no login, can't be challenged or invited, demo tournaments and teams can't be joined, and demo rows are ranked in a separate section. Settings has a "Show demo data" toggle.

## Scripts
`npm run dev` · `npm run build` · `npm run typecheck`
