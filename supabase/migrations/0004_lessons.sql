-- Lessons CMS: self-service course content managed from the admin console.
create table if not exists public.lessons (
  id          uuid primary key default gen_random_uuid(),
  position    integer not null default 0,
  title       text not null,
  title_en    text,
  description text,
  storage_path text,          -- path inside the private 'lessons' bucket (CRM uploads)
  external_url text,          -- full URL for seeded / externally hosted videos
  poster_url  text,
  duration_sec integer,
  is_published boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists lessons_position_idx on public.lessons (position);

create or replace function public.touch_lessons_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_lessons_updated on public.lessons;
create trigger trg_lessons_updated before update on public.lessons
  for each row execute function public.touch_lessons_updated_at();

-- RLS on, no client policies: all access is via edge functions (service role).
-- Student video paths never reach the browser — only short-lived signed URLs.
alter table public.lessons enable row level security;

-- Private bucket for lesson videos. 500MB per-file limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lessons','lessons',false,524288000,
  array['video/mp4','video/quicktime','video/webm','image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
