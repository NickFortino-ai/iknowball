-- Reverse an add/drop that should never have been offered.
--
-- IDP Bonanza (b051d4b4-a756-42cb-a77a-db8748f62d70), mossyou
-- (f45f8a06-b9bd-4ced-bd21-3f443385da16), 2026-10-01 06:24 UTC.
--
-- WHAT HAPPENED
--   The roster was full, so adding Aaron Jones (4199) required a drop. The
--   drop list included players in the IR slot, and Myles Garrett (3973, on
--   IR) was chosen. IR players do not occupy an active roster spot — the
--   roster-full test excludes them — so the drop freed nothing and the add
--   went through anyway. Result: 8 bench players against a 7-man bench and
--   an empty IR slot.
--
--   The drop picker no longer offers IR players when a drop is required.
--
-- RESTORING GARRETT
--   He was DRAFTED (round 10, pick 59), so acquired_via stays 'draft'.
--   acquired_at is set to the draft window rather than now on purpose: a
--   player rostered under 48 hours goes straight back to free agency when
--   dropped, so a now() timestamp would quietly change how his next drop
--   behaves.
--
--   He is on no other roster in this league, so nothing competes for him.

begin;

-- 1. Undo the add.
delete from fantasy_rosters
where  league_id = 'b051d4b4-a756-42cb-a77a-db8748f62d70'
  and  user_id   = 'f45f8a06-b9bd-4ced-bd21-3f443385da16'
  and  player_id = '4199';

-- 2. Put Garrett back where he was.
insert into fantasy_rosters (league_id, user_id, player_id, slot, acquired_via, acquired_at)
values ('b051d4b4-a756-42cb-a77a-db8748f62d70',
        'f45f8a06-b9bd-4ced-bd21-3f443385da16',
        '3973', 'ir', 'draft', '2026-09-09T20:35:00+00');

-- 3. Clear the waiver hold the drop created, so he isn't sitting on waivers
--    in a league where he never actually left a roster.
delete from fantasy_waiver_pool
where  league_id = 'b051d4b4-a756-42cb-a77a-db8748f62d70'
  and  player_id = '3973';

-- 4. Remove the two log rows for the transaction being undone.
delete from fantasy_transactions
where  id in ('bd4bc16c-8dad-446a-bbc1-b5c84ea01ecf',   -- drop Garrett
              'ae33bfb6-e9b1-4a1d-a177-363d723a6e2e');  -- add Jones

commit;

-- VERIFY — expect Garrett on 'ir', no Aaron Jones, bench back to 7:
--
--   select r.slot, p.full_name, p.injury_status
--   from   fantasy_rosters r
--   join   nfl_players p on p.id = r.player_id
--   where  r.league_id = 'b051d4b4-a756-42cb-a77a-db8748f62d70'
--     and  r.user_id   = 'f45f8a06-b9bd-4ced-bd21-3f443385da16'
--     and  (r.slot = 'ir' or r.slot = 'bench')
--   order by r.slot, p.full_name;
