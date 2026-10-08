-- Special lessons: a second, per-user access flag layered on top of has_access.
-- Lessons flagged requires_special_access are only playable/downloadable for
-- users whose profile has_special_access = true (granted from the admin console).

-- per-user special access (mirrors has_access / access_granted_at)
alter table public.profiles
  add column if not exists has_special_access boolean not null default false,
  add column if not exists special_access_granted_at timestamptz;

-- per-lesson flag: which lessons require special access
alter table public.lessons
  add column if not exists requires_special_access boolean not null default false;

-- flag BOTH special lessons (positions 9 and 10).
-- To lock only DB position 10 later:
--   update public.lessons set requires_special_access = false where position = 9;
update public.lessons
  set requires_special_access = true
  where position in (9, 10);

-- Students may still edit their own name/avatar, but never their access flags.
-- (Without this, the existing "update own" policy would let a student flip
-- has_special_access on their own row via the anon client.)
-- (Applied remotely as migration 0010_profiles_lock_special_access_self_update.)
alter policy "profiles: update own (no access change)" on public.profiles
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and has_access = (select p.has_access from public.profiles p where p.id = auth.uid())
    and has_special_access = (select p.has_special_access from public.profiles p where p.id = auth.uid())
    and special_access_granted_at is not distinct from
        (select p.special_access_granted_at from public.profiles p where p.id = auth.uid())
  );
