begin;

alter table public.projects enable row level security;
alter table public.todos enable row level security;

-- Anonymous requests have no auth.uid(), so projects can no longer require an owner.
alter table public.projects alter column owner_id drop not null;

drop policy if exists "Users can read their own projects" on public.projects;
drop policy if exists "Users can create their own projects" on public.projects;
drop policy if exists "Users can update their own projects" on public.projects;
drop policy if exists "Users can delete their own projects" on public.projects;
drop policy if exists "Users can read todos from their own projects" on public.todos;
drop policy if exists "Users can create todos in their own projects" on public.todos;
drop policy if exists "Users can update todos in their own projects" on public.todos;
drop policy if exists "Users can delete todos from their own projects" on public.todos;

revoke all on table public.projects from anon, authenticated;
revoke all on table public.todos from anon, authenticated;
grant select, insert, update, delete on table public.projects to anon, authenticated;
grant select, insert, update, delete on table public.todos to anon, authenticated;

create policy "Public can read projects"
on public.projects for select
to anon, authenticated
using (true);

create policy "Public can create projects"
on public.projects for insert
to anon, authenticated
with check (true);

create policy "Public can update projects"
on public.projects for update
to anon, authenticated
using (true)
with check (true);

create policy "Public can delete projects"
on public.projects for delete
to anon, authenticated
using (true);

create policy "Public can read todos"
on public.todos for select
to anon, authenticated
using (true);

create policy "Public can create todos"
on public.todos for insert
to anon, authenticated
with check (true);

create policy "Public can update todos"
on public.todos for update
to anon, authenticated
using (true)
with check (true);

create policy "Public can delete todos"
on public.todos for delete
to anon, authenticated
using (true);

commit;
