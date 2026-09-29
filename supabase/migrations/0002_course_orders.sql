-- EA / AI course — order log for Stripe payments (audit / reconciliation).
-- Writes are service-role only (via the stripe-webhook edge function); users read their own.
create table if not exists public.course_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  stripe_session_id text unique,
  stripe_payment_intent text,
  amount_total integer,            -- minor units (satang) e.g. 290000 = ฿2,900.00
  currency text not null default 'thb',
  status text not null default 'pending',  -- pending | paid
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.course_orders enable row level security;

drop policy if exists "orders: read own" on public.course_orders;
create policy "orders: read own" on public.course_orders
  for select to authenticated using (auth.uid() = user_id);

drop trigger if exists course_orders_touch on public.course_orders;
create trigger course_orders_touch before update on public.course_orders
  for each row execute function public.touch_updated_at();

create index if not exists course_orders_user_idx on public.course_orders(user_id);
