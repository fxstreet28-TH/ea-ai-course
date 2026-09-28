-- EA / AI course — member profiles
-- Run on the dedicated `ea-ai-course` Supabase project only (NOT hknvooaqgpufrbdxtzxf).

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  has_access boolean not null default false,
  access_granted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using (auth.uid() = id);

-- ผู้ใช้แก้ได้แค่ชื่อ/รูป ห้ามแก้ has_access เอง
drop policy if exists "profiles: update own (no access change)" on public.profiles;
create policy "profiles: update own (no access change)" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id and has_access = (select p.has_access from public.profiles p where p.id = auth.uid()));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
