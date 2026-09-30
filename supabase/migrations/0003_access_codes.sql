-- Access codes: 1 code = 1 user forever. Generated + emailed after payment.
create table if not exists public.access_codes (
  code text primary key,                          -- 8-char code (charset A-Z2-9, no O/0/I/1)
  email text,                                      -- buyer email the code was sent to
  stripe_session_id text,                          -- order that generated it
  redeemed_by uuid references auth.users(id) on delete set null,  -- bound to first user who redeems
  redeemed_at timestamptz,
  status text not null default 'active',           -- active | redeemed | revoked
  created_at timestamptz not null default now()
);
alter table public.access_codes enable row level security;

drop policy if exists "codes: read own" on public.access_codes;
create policy "codes: read own" on public.access_codes
  for select to authenticated using (auth.uid() = redeemed_by);
-- No client writes: only the service role (edge functions) inserts/updates.

-- Atomic redeem: binds the code to the caller iff active + unbound.
-- Returns: 'ok' | 'used' | 'invalid' | 'revoked'.
create or replace function public.redeem_access_code(p_code text, p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.access_codes%rowtype;
begin
  select * into rec from public.access_codes
    where code = upper(trim(p_code)) for update;
  if not found then return 'invalid'; end if;
  if rec.status = 'revoked' then return 'revoked'; end if;

  if rec.redeemed_by is not null then
    if rec.redeemed_by = p_user then
      update public.profiles set has_access = true,
             access_granted_at = coalesce(access_granted_at, now()) where id = p_user;
      return 'ok';
    else
      return 'used';
    end if;
  end if;

  update public.access_codes
     set redeemed_by = p_user, redeemed_at = now(), status = 'redeemed'
   where code = rec.code;
  update public.profiles set has_access = true,
         access_granted_at = coalesce(access_granted_at, now()) where id = p_user;
  return 'ok';
end $$;

grant execute on function public.redeem_access_code(text, uuid) to authenticated;
