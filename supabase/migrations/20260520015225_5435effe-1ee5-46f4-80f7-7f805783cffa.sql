
-- =========================
-- CATALOGS (seeded)
-- =========================

create table public.points_programs (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('transferable','airline','hotel','cashback','fixed')),
  default_cpp numeric(6,3) not null
);

create table public.cards_catalog (
  id text primary key,
  issuer text not null,
  name text not null,
  annual_fee integer not null default 0,
  points_program_id text references public.points_programs(id),
  foreign_tx_fee_pct numeric(4,2) not null default 0,
  -- earn_rules: jsonb array of { category, multiplier, note? }
  -- category special: "all" for catch-all base rate
  earn_rules jsonb not null default '[]'::jsonb,
  notes text
);

create table public.merchants_catalog (
  id text primary key,
  name text not null,
  category text not null,
  aliases text[] not null default '{}'
);

create index merchants_catalog_name_idx on public.merchants_catalog using gin (to_tsvector('simple', name));

-- =========================
-- USER DATA
-- =========================

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.user_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_catalog_id text not null references public.cards_catalog(id),
  nickname text,
  opened_at date,
  annual_fee_paid_at date,
  created_at timestamptz not null default now()
);

create index user_cards_user_id_idx on public.user_cards(user_id);

create table public.user_signup_bonuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_card_id uuid not null references public.user_cards(id) on delete cascade,
  bonus_points integer not null,
  spend_required integer not null,
  spend_so_far integer not null default 0,
  deadline date not null,
  created_at timestamptz not null default now()
);

create index user_signup_bonuses_user_id_idx on public.user_signup_bonuses(user_id);

create table public.user_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_card_id uuid not null references public.user_cards(id) on delete cascade,
  merchant_catalog_id text references public.merchants_catalog(id),
  merchant_text text not null,
  reward_type text not null check (reward_type in ('multiplier','percent_back','statement_credit')),
  reward_value numeric(8,2) not null,
  min_spend integer not null default 0,
  expires_at date,
  created_at timestamptz not null default now()
);

create index user_offers_user_id_idx on public.user_offers(user_id);

create table public.user_points_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  points_program_id text not null references public.points_programs(id),
  balance integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, points_program_id)
);

create table public.user_cpp_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  points_program_id text not null references public.points_programs(id),
  cpp numeric(6,3) not null,
  primary key (user_id, points_program_id)
);

create table public.user_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_card_id_used uuid references public.user_cards(id) on delete set null,
  merchant_catalog_id text references public.merchants_catalog(id),
  merchant_text text not null,
  amount_cents integer not null,
  occurred_at timestamptz not null default now(),
  recommended_user_card_id uuid references public.user_cards(id) on delete set null,
  delta_value_cents integer not null default 0,
  created_at timestamptz not null default now()
);

create index user_purchases_user_id_idx on public.user_purchases(user_id, occurred_at desc);

-- =========================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =========================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================
-- ROW LEVEL SECURITY
-- =========================

-- Catalogs: readable by anyone signed in, no writes from clients
alter table public.points_programs enable row level security;
alter table public.cards_catalog enable row level security;
alter table public.merchants_catalog enable row level security;

create policy "catalogs_select_authenticated_pp"
  on public.points_programs for select to authenticated using (true);
create policy "catalogs_select_authenticated_cc"
  on public.cards_catalog for select to authenticated using (true);
create policy "catalogs_select_authenticated_mc"
  on public.merchants_catalog for select to authenticated using (true);

-- User data: only owner can CRUD
alter table public.profiles enable row level security;
create policy "profiles_owner_all" on public.profiles
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.user_cards enable row level security;
create policy "user_cards_owner_all" on public.user_cards
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.user_signup_bonuses enable row level security;
create policy "user_bonuses_owner_all" on public.user_signup_bonuses
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.user_offers enable row level security;
create policy "user_offers_owner_all" on public.user_offers
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.user_points_balances enable row level security;
create policy "user_balances_owner_all" on public.user_points_balances
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.user_cpp_overrides enable row level security;
create policy "user_cpp_owner_all" on public.user_cpp_overrides
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.user_purchases enable row level security;
create policy "user_purchases_owner_all" on public.user_purchases
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
