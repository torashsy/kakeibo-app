create table public.finance_feed (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{"version":1,"observations":{},"sources":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint finance_feed_payload_object check (jsonb_typeof(payload) = 'object')
);
alter table public.finance_feed enable row level security;
revoke all on public.finance_feed from public, anon, authenticated;
grant select on public.finance_feed to authenticated;
grant select, insert, update, delete on public.finance_feed to service_role;
create policy "Read own finance feed" on public.finance_feed for select to authenticated
  using ((select auth.uid()) = user_id);
comment on table public.finance_feed is 'Verified financial observations. Client read-only; isolated from local-first kv sync. No credentials or full email bodies.';

