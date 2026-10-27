-- INSERT ... RETURNING checks the SELECT policy against the new row, and
-- can_read_note cannot see that row inside the same command. The direct owner
-- branch keeps owner inserts and saves returning their row; shared readers
-- still go through the helper.

drop policy notes_read on public.notes;

create policy notes_read on public.notes
for select to authenticated
using (
  owner_id = (select auth.uid())
  or public.can_read_note(id)
);
