-- Voyage — fixes two issues discovered live-testing the trips migration
--
-- 1. Row Level Security policies restrict access *within* whatever a
--    role is already granted — they don't grant access themselves.
--    0001_init.sql enabled RLS on every table but never actually
--    GRANTed the `authenticated` role table-level privileges, so every
--    query failed with "permission denied for table trips" regardless
--    of how correct the RLS policies were. Fixed by granting on every
--    table 0001_init.sql created (all of them need this, even though
--    only `trips` is actually exercised by app code yet).
--
-- 2. The partial unique index from 0002_trips_local_id.sql (`where
--    local_id is not null`) isn't usable as an `ON CONFLICT` target —
--    Postgres can't infer a partial index from a plain column list
--    without the query repeating its WHERE clause, which Supabase's
--    `upsert(...).onConflict(...)` doesn't send. Fixed by replacing it
--    with a full (non-partial) unique index instead — standard SQL
--    never treats NULL as equal to NULL in a UNIQUE constraint, so this
--    behaves identically for normally-created trips (local_id always
--    null there) while still correctly catching a real duplicate
--    migration (local_id set and matching).

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.trips to authenticated;
grant select, insert, update, delete on public.trip_members to authenticated;
grant select, insert, update, delete on public.activities to authenticated;
grant select, insert, update, delete on public.saved_places to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.expense_participants to authenticated;
grant select, insert, update, delete on public.trip_invitations to authenticated;

drop index if exists public.trips_owner_local_id_idx;
create unique index if not exists trips_owner_local_id_idx
  on public.trips (owner_id, local_id);
