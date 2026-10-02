begin;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  color text not null default 'coral'
    check (color in ('coral', 'lavender', 'sage', 'sand', 'sky')),
  stage text not null check (length(btrim(stage)) > 0),
  next_step text not null check (length(btrim(next_step)) > 0),
  due_date date,
  importance text not null default 'normal'
    check (importance in ('normal', 'important')),
  is_focus boolean not null default false,
  last_progress_at timestamptz not null default now(),
  prerequisite text not null default '',
  decisions text not null default '',
  note text not null default '',
  is_completed boolean not null default false,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);

create table public.todos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  is_done boolean not null default false,
  is_today boolean not null default false,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index projects_owner_status_position_idx
  on public.projects (owner_id, is_completed, position);

create index todos_project_status_position_idx
  on public.todos (project_id, is_done, position);

alter table public.projects enable row level security;
alter table public.todos enable row level security;

revoke all on table public.projects from anon, authenticated;
revoke all on table public.todos from anon, authenticated;

grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.todos to authenticated;

create policy "Users can read their own projects"
on public.projects for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy "Users can create their own projects"
on public.projects for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy "Users can update their own projects"
on public.projects for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "Users can delete their own projects"
on public.projects for delete
to authenticated
using ((select auth.uid()) = owner_id);

create policy "Users can read todos from their own projects"
on public.todos for select
to authenticated
using (
  exists (
    select 1
    from public.projects
    where projects.id = todos.project_id
      and projects.owner_id = (select auth.uid())
  )
);

create policy "Users can create todos in their own projects"
on public.todos for insert
to authenticated
with check (
  exists (
    select 1
    from public.projects
    where projects.id = todos.project_id
      and projects.owner_id = (select auth.uid())
  )
);

create policy "Users can update todos in their own projects"
on public.todos for update
to authenticated
using (
  exists (
    select 1
    from public.projects
    where projects.id = todos.project_id
      and projects.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.projects
    where projects.id = todos.project_id
      and projects.owner_id = (select auth.uid())
  )
);

create policy "Users can delete todos from their own projects"
on public.todos for delete
to authenticated
using (
  exists (
    select 1
    from public.projects
    where projects.id = todos.project_id
      and projects.owner_id = (select auth.uid())
  )
);

commit;
