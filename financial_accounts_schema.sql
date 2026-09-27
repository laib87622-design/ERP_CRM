create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  currency text not null default 'DZD',
  country text,
  initial_balance numeric(14,2) not null default 0,
  current_balance numeric(14,2) not null default 0,
  bank_name text,
  iban text,
  swift_bic text,
  created_at timestamptz not null default now()
);

create table if not exists public.financial_account_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.financial_accounts(id) on delete cascade,
  type text not null check (type in ('in', 'out')),
  amount numeric(14,2) not null default 0,
  description text,
  reference text,
  created_at timestamptz not null default now()
);

alter table public.financial_accounts enable row level security;
alter table public.financial_account_transactions enable row level security;

create policy "Users can view all financial accounts"
  on public.financial_accounts
  for select
  using (true);

create policy "Users can insert financial accounts"
  on public.financial_accounts
  for insert
  with check (true);

create policy "Users can update financial accounts"
  on public.financial_accounts
  for update
  using (true)
  with check (true);

create policy "Users can delete financial accounts"
  on public.financial_accounts
  for delete
  using (true);

create policy "Users can view all financial account transactions"
  on public.financial_account_transactions
  for select
  using (true);

create policy "Users can insert financial account transactions"
  on public.financial_account_transactions
  for insert
  with check (true);

create policy "Users can update financial account transactions"
  on public.financial_account_transactions
  for update
  using (true)
  with check (true);

create policy "Users can delete financial account transactions"
  on public.financial_account_transactions
  for delete
  using (true);
