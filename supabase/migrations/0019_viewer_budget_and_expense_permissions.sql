-- Voyage — lets a Viewer set their own personal budget and add
-- expenses, without granting any other Editor/Owner-only capability
--
-- Run this once, after 0001-0018, in the Supabase SQL Editor.
--
-- Background: "My Budget" (0014_personal_trip_budgets.sql) is
-- genuinely personal — one row per (trip, user), readable/writable
-- only by its own owner — but its INSERT/UPDATE policies additionally
-- required `trip_role(trip_id) in ('owner', 'editor')`, so a Viewer
-- could never set a budget for *themself* either, even though nothing
-- about it is shared/collaborative data. Same story for `expenses`:
-- its one combined `for all` policy required owner/editor for every
-- operation, including simply adding a new expense — but adding an
-- expense was never actually a collaborative-editing concern the way
-- editing the itinerary or Saved Places is; it's closer to "logging
-- something that happened," which every trip member should be able to
-- do regardless of role. This migration narrows both gaps to exactly
-- that: personal-budget writes and expense *creation* open up to every
-- trip member; everything else already correctly owner/editor-gated
-- (editing/deleting an existing expense, activities, saved places,
-- packing items, people/invitations, the trip itself) is completely
-- untouched by this file.

-- --- trip_member_budgets -----------------------------------------------
-- Same two policies as 0014, minus the `trip_role(...) in ('owner',
-- 'editor')` clause — `user_id = auth.uid()` alone is what already
-- guarantees "only your own row, never anyone else's", and that part
-- is unchanged. Viewer, editor, and owner all now reach exactly the
-- same rule: is_trip_member(trip_id) alone (SELECT already used this;
-- INSERT/UPDATE now match it) plus "it has to be your own row".

drop policy if exists "an owner or editor can set their own trip budget" on public.trip_member_budgets;
create policy "any trip member can set their own trip budget"
  on public.trip_member_budgets for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_trip_member(trip_id));

drop policy if exists "an owner or editor can update their own trip budget" on public.trip_member_budgets;
create policy "any trip member can update their own trip budget"
  on public.trip_member_budgets for update
  to authenticated
  using (user_id = auth.uid() and public.is_trip_member(trip_id))
  with check (user_id = auth.uid() and public.is_trip_member(trip_id));

-- --- expenses ------------------------------------------------------------
-- The old single "for all" policy (0001_init.sql, `paid_by` check
-- added by 0007_shared_expenses.sql) covered INSERT/UPDATE/DELETE with
-- one identical owner/editor rule. Splitting it into three lets
-- INSERT open up to every trip member while UPDATE and DELETE keep
-- the exact same owner/editor-only rule they already had — "do not
-- accidentally allow editing/deleting arbitrary expenses" stays true;
-- only *creating* one changes. The `paid_by` genuine-trip-member check
-- (0007's own addition) is preserved unchanged on both INSERT and
-- UPDATE.
drop policy if exists "owners and editors can manage expenses" on public.expenses;

create policy "any trip member can add an expense"
  on public.expenses for insert
  to authenticated
  with check (
    public.is_trip_member(trip_id)
    and (paid_by is null or public.is_trip_member(trip_id, paid_by))
  );

create policy "owners and editors can update expenses"
  on public.expenses for update
  to authenticated
  using (public.trip_role(trip_id) in ('owner', 'editor'))
  with check (
    public.trip_role(trip_id) in ('owner', 'editor')
    and (paid_by is null or public.is_trip_member(trip_id, paid_by))
  );

create policy "owners and editors can delete expenses"
  on public.expenses for delete
  to authenticated
  using (public.trip_role(trip_id) in ('owner', 'editor'));

-- --- expense_participants -------------------------------------------------
-- Same split, and for the same reason: creating a *shared* expense
-- writes rows here too (services/tripsRepository.js's
-- writeExpenseParticipants), so a Viewer creating one needs to be able
-- to insert participant rows, not just the expense row itself. Editing
-- an existing shared expense's participants (delete-then-reinsert, the
-- same function) stays owner/editor-only — unaffected, since that
-- path is only ever reached from the Edit-expense flow, still gated
-- behind `canEdit` in the UI and now behind UPDATE/DELETE here exactly
-- as before this migration.
drop policy if exists "owners and editors can manage expense participants" on public.expense_participants;

create policy "any trip member can add expense participants"
  on public.expense_participants for insert
  to authenticated
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and public.is_trip_member(e.trip_id)
        and public.is_trip_member(e.trip_id, user_id)
    )
  );

create policy "owners and editors can update expense participants"
  on public.expense_participants for update
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.trip_role(e.trip_id) in ('owner', 'editor')
    )
  )
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and public.trip_role(e.trip_id) in ('owner', 'editor')
        and public.is_trip_member(e.trip_id, user_id)
    )
  );

create policy "owners and editors can delete expense participants"
  on public.expense_participants for delete
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.trip_role(e.trip_id) in ('owner', 'editor')
    )
  );

-- No grant changes needed: `grant select, insert, update, delete` was
-- already issued to `authenticated` on all three tables back in
-- 0003_fix_trips_access.sql (trips/trip_members/activities/
-- saved_places/expenses/expense_participants/trip_invitations) and
-- 0014_personal_trip_budgets.sql (trip_member_budgets) — this
-- migration only narrows/reshapes RLS *policies*, the finer-grained
-- layer under those already-broad table-level grants; nothing here
-- needs a new grant statement.
