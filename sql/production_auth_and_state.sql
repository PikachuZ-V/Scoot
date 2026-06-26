-- Production auth, owner-managed user whitelist, role, and app state setup for v16
-- Run after sql/schema.sql in Supabase SQL Editor.
-- Prinsip: user tidak bisa membuat akun sendiri. Gmail/email harus didaftarkan Owner dulu.

alter table public.profiles add column if not exists email text;

create table if not exists public.allowed_users (
  email text primary key,
  full_name text not null,
  role app_role not null check (role in ('owner','admin','mekanik')),
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists allowed_users_active_idx on public.allowed_users(active);

create or replace function public.current_user_role()
returns app_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid() and active = true limit 1;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  allowed record;
  normalized_email text;
begin
  normalized_email := lower(trim(coalesce(new.email, '')));

  select * into allowed
  from public.allowed_users
  where lower(trim(email)) = normalized_email
    and active = true
  limit 1;

  if allowed.email is not null then
    insert into public.profiles (id, full_name, email, role, active)
    values (
      new.id,
      coalesce(allowed.full_name, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'User'),
      normalized_email,
      allowed.role,
      true
    )
    on conflict (id) do update set
      email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role,
      active = true,
      updated_at = now();
  else
    insert into public.profiles (id, full_name, email, role, active)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'Unauthorized User'),
      normalized_email,
      'viewer',
      false
    )
    on conflict (id) do update set
      email = excluded.email,
      role = 'viewer',
      active = false,
      updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.app_state (
  id text primary key default 'main',
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.app_state (id, data)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.allowed_users enable row level security;
alter table public.app_state enable row level security;

drop policy if exists profiles_select_role_based on public.profiles;
drop policy if exists profiles_update_owner_only on public.profiles;
drop policy if exists profiles_update_admin_owner on public.profiles;
drop policy if exists profiles_insert_self on public.profiles;

create policy profiles_select_role_based on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.current_user_role() = 'owner'
);

create policy profiles_update_owner_only on public.profiles
for update to authenticated
using (public.current_user_role() = 'owner')
with check (public.current_user_role() = 'owner');

-- Tidak ada self sign up/profile insert dari frontend.
-- Profile dibuat oleh trigger saat user login, dan aktif hanya jika email ada di allowed_users.

drop policy if exists allowed_users_owner_select on public.allowed_users;
drop policy if exists allowed_users_owner_insert on public.allowed_users;
drop policy if exists allowed_users_owner_update on public.allowed_users;
drop policy if exists allowed_users_owner_delete on public.allowed_users;

create policy allowed_users_owner_select on public.allowed_users
for select to authenticated
using (public.current_user_role() = 'owner');

create policy allowed_users_owner_insert on public.allowed_users
for insert to authenticated
with check (public.current_user_role() = 'owner');

create policy allowed_users_owner_update on public.allowed_users
for update to authenticated
using (public.current_user_role() = 'owner')
with check (public.current_user_role() = 'owner');

create policy allowed_users_owner_delete on public.allowed_users
for delete to authenticated
using (public.current_user_role() = 'owner');

drop policy if exists app_state_select_active_users on public.app_state;
drop policy if exists app_state_update_active_users on public.app_state;
drop policy if exists app_state_insert_active_users on public.app_state;

create policy app_state_select_active_users on public.app_state
for select to authenticated
using (public.current_user_role() in ('owner', 'admin', 'mekanik'));

create policy app_state_update_active_users on public.app_state
for update to authenticated
using (public.current_user_role() in ('owner', 'admin', 'mekanik'))
with check (public.current_user_role() in ('owner', 'admin', 'mekanik'));

create policy app_state_insert_active_users on public.app_state
for insert to authenticated
with check (public.current_user_role() in ('owner', 'admin'));

-- BOOTSTRAP OWNER PERTAMA, jalankan sebelum owner login pertama kali:
-- insert into public.allowed_users (email, full_name, role, active)
-- values ('email-owner-kamu@gmail.com', 'Owner Utama', 'owner', true)
-- on conflict (email) do update set full_name=excluded.full_name, role='owner', active=true;
-- Setelah owner login, user lain bisa didaftarkan dari menu User Management.
