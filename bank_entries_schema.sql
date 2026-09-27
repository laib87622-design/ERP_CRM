create table if not exists public.bank_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.financial_accounts(id) on delete cascade,
  operation_date timestamptz not null default now(),
  description text not null,
  operation_type text not null,
  third_party text,
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.bank_entries enable row level security;

create policy "Users can view all bank entries"
  on public.bank_entries
  for select
  using (true);

create policy "Users can insert bank entries"
  on public.bank_entries
  for insert
  with check (true);

create policy "Users can update bank entries"
  on public.bank_entries
  for update
  using (true)
  with check (true);

create policy "Users can delete bank entries"
  on public.bank_entries
  for delete
  using (true);
