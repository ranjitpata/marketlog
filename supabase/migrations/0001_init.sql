-- =====================================================================
-- MarketLog — initial schema (Supabase / Postgres)
--
-- Architecture note: the CLIENT (IndexedDB) is the source of truth.
-- These tables are the *synchronized cloud copy*. Rows are pushed by the
-- client sync engine as UPSERTS of client-generated UUID rows; the server
-- never generates ids and never hard-deletes (deleted_at tombstones only).
--
-- All money columns are INTEGER CENTS.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------
create or replace function marketlog.touch_updated_at()
returns trigger
language plpgsql
-- SECURITY DEFINER intentionally NOT used: plain trigger function runs with
-- the invoking role, so RLS still applies. No search_path tricks needed.
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =====================================================================
-- profiles (one row per user; id === auth uid)
-- =====================================================================
create table public.profiles (
  id           uuid primary key default gen_random_uuid(), -- client sends auth uid
  user_id      uuid not null default auth.uid(),
  display_name text not null default 'You',
  business_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

alter table public.profiles enable row level security;

create policy "profiles: own rows" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger profiles_touch before update on public.profiles
  for each row execute function marketlog.touch_updated_at();

create index profiles_user_idx on public.profiles (user_id);
create index profiles_updated_idx on public.profiles (updated_at);

-- =====================================================================
-- products
-- =====================================================================
create table public.products (
  id                  uuid primary key,          -- client-generated UUID v4
  user_id             uuid not null default auth.uid(),
  name                text not null,
  sku                 text,
  category            text,
  description         text,
  cost_price          integer not null default 0,  -- cents
  selling_price       integer not null default 0,  -- cents
  current_inventory   integer not null default 0,  -- derived cache (client-computed)
  low_stock_threshold integer,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

alter table public.products enable row level security;

create policy "products: own rows" on public.products
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger products_touch before update on public.products
  for each row execute function marketlog.touch_updated_at();

create index products_user_idx on public.products (user_id);
create index products_updated_idx on public.products (updated_at);

-- =====================================================================
-- events
-- =====================================================================
create table public.events (
  id         uuid primary key,
  user_id    uuid not null default auth.uid(),
  name       text not null,
  location   text,
  start_date date not null,
  end_date   date not null,
  booth_fee  integer not null default 0,           -- cents; counted ONCE (never an expense row)
  status     text not null default 'upcoming' check (status in ('upcoming','ongoing','completed')),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.events enable row level security;

create policy "events: own rows" on public.events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger events_touch before update on public.events
  for each row execute function marketlog.touch_updated_at();

create index events_user_idx on public.events (user_id);
create index events_updated_idx on public.events (updated_at);
create index events_start_idx on public.events (user_id, start_date);

-- =====================================================================
-- event_inventory (SNAPSHOT rows prepared per event)
-- =====================================================================
create table public.event_inventory (
  id              uuid primary key,
  user_id         uuid not null default auth.uid(),
  event_id        uuid not null references public.events (id) on delete cascade,
  product_id      uuid not null references public.products (id) on delete cascade,
  product_name    text not null,                   -- snapshot at prep time
  selling_price   integer not null,                -- cents, snapshot
  cost_price      integer not null,                -- cents, snapshot
  quantity_brought integer not null default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (event_id, product_id)
);

alter table public.event_inventory enable row level security;

create policy "event_inventory: own rows" on public.event_inventory
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger event_inventory_touch before update on public.event_inventory
  for each row execute function marketlog.touch_updated_at();

create index event_inventory_user_idx on public.event_inventory (user_id);
create index event_inventory_event_idx on public.event_inventory (event_id);
create index event_inventory_product_idx on public.event_inventory (product_id);
create index event_inventory_updated_idx on public.event_inventory (updated_at);

-- =====================================================================
-- sales (append-only once synced)
-- =====================================================================
create table public.sales (
  id             uuid primary key,
  user_id        uuid not null default auth.uid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  sold_at        timestamptz not null,
  payment_method text not null check (payment_method in ('cash','card','other')),
  total_amount   integer not null default 0,        -- cents
  total_cost     integer not null default 0,        -- cents (COGS snapshot)
  item_count     integer not null default 0,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

alter table public.sales enable row level security;

create policy "sales: own rows" on public.sales
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger sales_touch before update on public.sales
  for each row execute function marketlog.touch_updated_at();

create index sales_user_idx on public.sales (user_id);
create index sales_event_idx on public.sales (event_id);
create index sales_updated_idx on public.sales (updated_at);

-- =====================================================================
-- sale_items (append-only; snapshots at time of sale)
-- =====================================================================
create table public.sale_items (
  id                    uuid primary key,
  user_id               uuid not null default auth.uid(),
  sale_id               uuid not null references public.sales (id) on delete cascade,
  event_id              uuid not null references public.events (id) on delete cascade, -- denormalized
  product_id            uuid not null references public.products (id) on delete cascade,
  product_name_snapshot text not null,
  unit_price            integer not null,           -- cents, snapshot
  unit_cost             integer not null,           -- cents, snapshot
  quantity              integer not null check (quantity > 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

alter table public.sale_items enable row level security;

create policy "sale_items: own rows" on public.sale_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger sale_items_touch before update on public.sale_items
  for each row execute function marketlog.touch_updated_at();

create index sale_items_user_idx on public.sale_items (user_id);
create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_event_idx on public.sale_items (event_id);
create index sale_items_product_idx on public.sale_items (product_id);
create index sale_items_updated_idx on public.sale_items (updated_at);

-- =====================================================================
-- event_expenses (booth fee is NOT an expense row — it lives on events)
-- =====================================================================
create table public.event_expenses (
  id           uuid primary key,
  user_id      uuid not null default auth.uid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  description  text not null,
  amount       integer not null check (amount > 0),  -- cents
  category     text,
  expense_date date not null,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

alter table public.event_expenses enable row level security;

create policy "event_expenses: own rows" on public.event_expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger event_expenses_touch before update on public.event_expenses
  for each row execute function marketlog.touch_updated_at();

create index event_expenses_user_idx on public.event_expenses (user_id);
create index event_expenses_event_idx on public.event_expenses (event_id);
create index event_expenses_updated_idx on public.event_expenses (updated_at);

-- =====================================================================
-- inventory_adjustments (append-only movement ledger:
-- initial / restock / damaged / giveaway / correction)
-- =====================================================================
create table public.inventory_adjustments (
  id             uuid primary key,
  user_id        uuid not null default auth.uid(),
  product_id     uuid not null references public.products (id) on delete cascade,
  event_id       uuid references public.events (id) on delete cascade, -- null = home stock
  reason         text not null check (reason in ('initial','restock','damaged','giveaway','correction')),
  quantity_change integer not null,                 -- signed
  note           text,
  adjusted_at    timestamptz not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

alter table public.inventory_adjustments enable row level security;

create policy "inventory_adjustments: own rows" on public.inventory_adjustments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger inventory_adjustments_touch before update on public.inventory_adjustments
  for each row execute function marketlog.touch_updated_at();

create index inventory_adjustments_user_idx on public.inventory_adjustments (user_id);
create index inventory_adjustments_product_idx on public.inventory_adjustments (product_id);
create index inventory_adjustments_event_idx on public.inventory_adjustments (event_id);
create index inventory_adjustments_updated_idx on public.inventory_adjustments (updated_at);

-- =====================================================================
-- Notes
-- * RLS: every table enforces auth.uid() = user_id for ALL operations
--   (select/insert/update/delete). There is no client-side-only filtering
--   as a security boundary; the anon key can only ever touch own rows.
-- * No SECURITY DEFINER functions exist in this migration. If one is ever
--   added, it must pin a safe `set search_path = public` first.
-- * current_inventory on products is a client-computed derived cache; the
--   server copy may lag — the client fold (and any future server-side
--   derived view) is authoritative.
-- =====================================================================
