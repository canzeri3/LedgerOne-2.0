-- Allow Aggressive profile in buy_planners.ladder_depth
-- Some environments may use different constraint names; drop both if present,
-- then add a single canonical one that allows 70, 75, and 90.

alter table if exists buy_planners
  drop constraint if exists buy_planners_ladder_depth_check;

alter table if exists buy_planners
  drop constraint if exists buy_planners_ladder_depth_ck;

alter table if exists buy_planners
  add constraint buy_planners_ladder_depth_ck
  check (ladder_depth in (70, 75, 90));

