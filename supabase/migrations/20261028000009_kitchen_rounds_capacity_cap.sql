-- Cap a round's capacity at one week (168 h = 10080 min), matching the RoundsEditor UI limit.
-- Replaces the original "capacity_minutes > 0" check under the same name.

ALTER TABLE public.kitchen_rounds
  DROP CONSTRAINT IF EXISTS kitchen_rounds_capacity_minutes_check;

ALTER TABLE public.kitchen_rounds
  ADD CONSTRAINT kitchen_rounds_capacity_minutes_check
  CHECK (capacity_minutes > 0 AND capacity_minutes <= 10080);
