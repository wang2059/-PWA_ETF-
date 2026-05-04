-- 持股快照：每日擷取後寫入；anon 僅可 SELECT（RLS）；寫入請用 service_role 於後端／腳本。

create table if not exists public.holdings_snapshot (
  id uuid primary key default gen_random_uuid(),
  trade_date date not null,
  etf_code text not null,
  stock_code text not null,
  stock_name text,
  market_value_twd numeric,
  shares numeric,
  weight_pct numeric,
  ingested_at timestamptz not null default now(),
  source text,
  constraint holdings_snapshot_uk unique (trade_date, etf_code, stock_code)
);

create index if not exists idx_holdings_trade_date on public.holdings_snapshot (trade_date);
create index if not exists idx_holdings_etf on public.holdings_snapshot (etf_code);

alter table public.holdings_snapshot enable row level security;

drop policy if exists "Allow public read holdings" on public.holdings_snapshot;

create policy "Allow public read holdings"
  on public.holdings_snapshot
  for select
  using (true);

-- 禁止匿名寫入；以 service_role 金鑰／Dashboard 繞過 RLS 寫入。

comment on table public.holdings_snapshot is '主動式 ETF 成分持股快照（每日每檔 ETF 多列）';
