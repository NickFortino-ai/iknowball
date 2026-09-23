-- Goodwill credit to Ustadbadger for the Pete Alonso home-run prop.
--
--   user  8b2fc5a5-deb3-4524-a713-6b74358df308   (Ustadbadger)
--
-- WHAT HAPPENED
--   He took Alonso to homer at 3:53 AM, when the prop was priced +300. Risk
--   10, reward 30, and he was scored 30 — correctly. The book then re-priced
--   the prop to +510 (prop row updated 4:18 PM).
--
--   PropCard rendered the LIVE odds on a side he had already taken, so his own
--   card showed "-10 -> +51 / +510" next to "+30 pts". The scoring was right;
--   the card was telling him he should have had 51. Display bug fixed
--   separately — a picked side now shows the odds that pick locked.
--
--   Nick's call: honour the number the app showed him. 51 - 30 = 21.
--
-- WHY A BONUS ROW RATHER THAN EDITING THE PICK
--   Rewriting prop_picks.points_earned to 51 would misrepresent what he
--   actually locked (+300), and would be reverted by anything that re-scores
--   the prop from reward_points. bonus_points is the mechanism built for
--   exactly this: recalculateAllUserPoints sums picks, parlays, prop_picks,
--   futures_picks AND bonus_points, so this survives a full recalculation.
--
--   league_id is NULL on purpose — prop picks are global, not league-scoped.
--
-- NOTE FOR WHEN HE ASKS
--   His pick card will still read "+30 pts", because that is what the pick
--   earned. After the display fix it will also correctly read +300 rather
--   than +510, so the card is at least self-consistent. The 21 shows in his
--   total, not on the card.
--
-- The OTHER pick he has at 30 points (Coby Mayo, locked +295, prop now +280)
-- is deliberately NOT adjusted: that one drifted DOWN, so the card was
-- showing him less than he got. Nothing owed.

begin;

insert into bonus_points (user_id, league_id, type, label, points)
values (
  '8b2fc5a5-deb3-4524-a713-6b74358df308',
  null,
  'prop_odds_adjustment',
  'Pete Alonso HR prop — credited the +510 shown on the card (+21)',
  21
);

commit;

-- VERIFY — expect the new row, and a total 21 higher than before (-125 -> -104):
--
--   select label, points, created_at from bonus_points
--   where  user_id = '8b2fc5a5-deb3-4524-a713-6b74358df308'
--   order  by created_at desc limit 3;
--
--   select username, total_points from users
--   where  id = '8b2fc5a5-deb3-4524-a713-6b74358df308';
--
-- users.total_points is a STORED aggregate, so it does not move on its own.
-- Either run the admin "Recalculate Points" action, or bump it directly:
--
--   select increment_user_points('8b2fc5a5-deb3-4524-a713-6b74358df308', 21);
