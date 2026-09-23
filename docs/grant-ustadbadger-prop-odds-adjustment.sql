-- Re-price Ustadbadger's Pete Alonso home-run pick to the odds his card showed.
--
--   user  8b2fc5a5-deb3-4524-a713-6b74358df308   (Ustadbadger)
--   pick  30888bc7-4ddd-45f0-88d5-912d2d6a5e3e
--   prop  c0814e2a-1abf-439d-974d-d47d7c079907   Pete Alonso, Home Runs 0.5
--
-- WHAT HAPPENED
--   He took Alonso to homer at 3:53 AM when the prop was +300 — risk 10,
--   reward 30 — and was scored 30, correctly. The book then re-priced it to
--   +510 (prop row updated 4:18 PM).
--
--   PropCard rendered LIVE odds on a side he already held, so his card read
--   "-10 -> +51 / +510" directly above "+30 pts". The scoring was right; the
--   card was telling him he should have had 51. Display bug fixed separately
--   — a picked side now shows the odds that pick locked.
--
--   Nick's call: treat it as though he took it at the later price.
--
-- WHY THIS SHAPE
--   Written as a re-price of the PICK rather than a bonus_points credit, so
--   there is no stray adjustment floating in his total. Every field moves
--   together and the row stays internally consistent: at +510
--   calculateRiskPoints is still 10 (flat for anything -1000 or closer to
--   even) and calculateRewardPoints is round(10 * 510/100) = 51. So risk is
--   unchanged and only the reward side moves, 30 -> 51.
--
--   Because reward_points now says 51, a future re-score of this prop
--   recomputes to 51 as well — the change survives rather than being undone,
--   which is exactly what editing points_earned alone would NOT have done.
--
-- NOT TOUCHED: his other 30-point pick (Coby Mayo, locked +295, prop now
-- +280). That one drifted DOWN, so the card understated what he got.

begin;

update prop_picks
set    odds_at_pick         = 510,
       reward_points        = 51,
       points_earned        = 51,
       odds_at_submission   = 510,
       reward_at_submission = 51,
       updated_at           = now()
where  id      = '30888bc7-4ddd-45f0-88d5-912d2d6a5e3e'
  and  user_id = '8b2fc5a5-deb3-4524-a713-6b74358df308';

-- users.total_points is a STORED aggregate and does not move on its own.
select increment_user_points('8b2fc5a5-deb3-4524-a713-6b74358df308', 21);

commit;

-- VERIFY — expect odds 510, risk 10, reward 51, earned 51:
--
--   select odds_at_pick, risk_points, reward_points, points_earned,
--          odds_at_submission, reward_at_submission
--   from   prop_picks
--   where  id = '30888bc7-4ddd-45f0-88d5-912d2d6a5e3e';
--
-- And the total 21 higher than before (-125 -> -104):
--
--   select username, total_points from users
--   where  id = '8b2fc5a5-deb3-4524-a713-6b74358df308';
