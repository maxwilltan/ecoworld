-- EcoWorld portal backend. Applied to the Ecoworld Supabase project as
-- migration `ecoworld_portal_initial`.
create schema if not exists private;

create table if not exists public.portal_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account_id text not null unique,
  email text not null,
  name text not null,
  role text not null default 'Consultant' check (role in ('Management', 'Consultant')),
  active boolean not null default false,
  project_keys text[] not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_submissions (
  id text primary key,
  owner_user_id uuid not null references auth.users(id),
  consultant_account_id text not null,
  project_key text not null,
  revision text not null,
  version_number integer not null default 1 check (version_number >= 1),
  edit_allowed boolean not null default false,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, project_key, revision)
);

create index if not exists portal_profiles_role_idx on public.portal_profiles (role) where deleted_at is null;
create index if not exists portal_submissions_owner_idx on public.portal_submissions (owner_user_id);
create index if not exists portal_submissions_project_idx on public.portal_submissions (project_key);
create index if not exists portal_submissions_updated_idx on public.portal_submissions (updated_at desc);
create index if not exists portal_settings_updated_by_idx on public.portal_settings (updated_by);

alter table public.portal_profiles enable row level security;
alter table public.portal_settings enable row level security;
alter table public.portal_submissions enable row level security;

-- Browser clients use the authenticated Edge Function. The Data API tables
-- stay unavailable to anon/authenticated, even on projects with default grants.
revoke all on public.portal_profiles, public.portal_settings, public.portal_submissions from anon, authenticated;
grant select, insert, update, delete on public.portal_profiles, public.portal_settings, public.portal_submissions to service_role;

create or replace function private.portal_is_active_manager()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.portal_profiles p
    where p.id = (select auth.uid())
      and p.role = 'Management'
      and p.active
      and p.deleted_at is null
  );
$$;

create or replace function private.portal_is_active_user()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.portal_profiles p
    where p.id = (select auth.uid())
      and p.active
      and p.deleted_at is null
  );
$$;

revoke all on function private.portal_is_active_manager() from public;
revoke all on function private.portal_is_active_user() from public;
grant usage on schema private to authenticated;
grant execute on function private.portal_is_active_manager(), private.portal_is_active_user() to authenticated;

create or replace function private.portal_create_pending_profile()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.portal_profiles (id, account_id, email, name)
  values (new.id, 'pending-' || new.id::text, coalesce(new.email, ''), 'Pending account')
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.portal_create_pending_profile() from public;
create trigger portal_auth_user_created
after insert on auth.users
for each row execute function private.portal_create_pending_profile();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ecoworld-drawings', 'ecoworld-drawings', false, 52428800,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "ecoworld_drawings_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'ecoworld-drawings'
  and (
    (split_part(name, '/', 1) = (select auth.uid())::text and (select private.portal_is_active_user()))
    or (select private.portal_is_active_manager())
  )
);

create policy "ecoworld_drawings_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'ecoworld-drawings'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and (select private.portal_is_active_user())
);

create policy "ecoworld_drawings_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'ecoworld-drawings'
  and (
    (split_part(name, '/', 1) = (select auth.uid())::text and (select private.portal_is_active_user()))
    or (select private.portal_is_active_manager())
  )
);
