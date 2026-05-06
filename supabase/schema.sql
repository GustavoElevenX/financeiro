create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  partner_name text,
  family_name text,
  baby_expected_date date,
  onboarding_complete boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table profiles add column if not exists partner_name text;
alter table profiles add column if not exists baby_expected_date date;
alter table profiles add column if not exists onboarding_complete boolean default false;

create table if not exists family_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  role text,
  income_participant boolean default true,
  created_at timestamp with time zone default now()
);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  type text not null,
  initial_balance numeric default 0,
  current_balance numeric default 0,
  is_goal_account boolean default false,
  goal_id uuid null,
  active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  type text,
  is_essential boolean default false,
  created_at timestamp with time zone default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  type text not null,
  target_amount numeric default 0,
  reserved_amount numeric default 0,
  spent_amount numeric default 0,
  deadline date null,
  priority int default 1,
  weight numeric default 0,
  status text default 'active',
  is_mandatory boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table projects add column if not exists weight numeric default 0;

create table if not exists income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  person text,
  kind text not null,
  expected_amount numeric default 0,
  received_amount numeric default 0,
  expected_date date null,
  received_date date null,
  recurrence text default 'mensal',
  status text default 'prevista',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists app_settings (
  user_id uuid primary key references profiles(id) on delete cascade,
  emergency_months numeric default 3,
  safety_margin_rate numeric default 0.12,
  desired_monthly_income numeric default 0,
  deepseek_model text default 'deepseek-chat',
  updated_at timestamp with time zone default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'accounts_goal_id_fkey'
  ) then
    alter table accounts
      add constraint accounts_goal_id_fkey foreign key (goal_id) references projects(id) on delete set null;
  end if;
end $$;

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  transaction_date date not null,
  competence_month text not null,
  type text not null,
  amount numeric not null,
  description text,
  category_id uuid references categories(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  account_id uuid references accounts(id) on delete set null,
  destination_account_id uuid references accounts(id) on delete set null,
  payment_method text,
  status text default 'confirmed',
  source text default 'manual',
  ai_confidence numeric null,
  raw_text text null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists financial_months (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  month text not null,
  year int not null,
  status text default 'em_andamento',
  total_income numeric default 0,
  total_expense numeric default 0,
  total_reserved numeric default 0,
  balance numeric default 0,
  closed_at timestamp with time zone null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists day_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  date date not null,
  competence_month text not null,
  status text default 'pending',
  reviewed_at timestamp with time zone null,
  notes text null,
  created_at timestamp with time zone default now()
);

create table if not exists planned_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  category text,
  estimated_amount numeric default 0,
  real_amount numeric default 0,
  priority text default 'media',
  status text default 'planejado',
  deadline date null,
  purchased_at date null,
  account_id uuid references accounts(id) on delete set null,
  notes text null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists recurring_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  description text not null,
  amount numeric not null,
  type text not null,
  category_id uuid references categories(id) on delete set null,
  account_id uuid references accounts(id) on delete set null,
  day_of_month int null,
  frequency text default 'monthly',
  active boolean default true,
  created_at timestamp with time zone default now()
);

create table if not exists credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  limit_amount numeric default 0,
  closing_day int,
  due_day int,
  account_id uuid references accounts(id) on delete set null,
  active boolean default true,
  created_at timestamp with time zone default now()
);

create table if not exists card_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  card_id uuid references credit_cards(id) on delete cascade,
  purchase_date date not null,
  description text,
  amount numeric not null,
  installments int default 1,
  current_installment int default 1,
  category_id uuid references categories(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  created_at timestamp with time zone default now()
);

create table if not exists scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  type text not null,
  monthly_income numeric default 0,
  monthly_expense numeric default 0,
  initial_cost numeric default 0,
  new_obligation_amount numeric default 0,
  result_balance numeric default 0,
  risk_level text,
  notes text,
  created_at timestamp with time zone default now()
);

create table if not exists ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  content text not null,
  severity text default 'info',
  related_project_id uuid references projects(id) on delete set null,
  related_month text null,
  created_at timestamp with time zone default now(),
  read_at timestamp with time zone null
);

create table if not exists classification_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  keyword text not null,
  category_id uuid references categories(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  type text null,
  account_id uuid references accounts(id) on delete set null,
  created_at timestamp with time zone default now()
);

alter table profiles enable row level security;
alter table family_members enable row level security;
alter table accounts enable row level security;
alter table transactions enable row level security;
alter table categories enable row level security;
alter table income_sources enable row level security;
alter table app_settings enable row level security;
alter table financial_months enable row level security;
alter table day_reviews enable row level security;
alter table projects enable row level security;
alter table planned_items enable row level security;
alter table recurring_items enable row level security;
alter table credit_cards enable row level security;
alter table card_purchases enable row level security;
alter table scenarios enable row level security;
alter table ai_insights enable row level security;
alter table classification_rules enable row level security;

drop policy if exists "profiles_select_own" on profiles;
drop policy if exists "profiles_insert_own" on profiles;
drop policy if exists "profiles_update_own" on profiles;
drop policy if exists "family_members_own" on family_members;
drop policy if exists "accounts_own" on accounts;
drop policy if exists "transactions_own" on transactions;
drop policy if exists "categories_own" on categories;
drop policy if exists "income_sources_own" on income_sources;
drop policy if exists "app_settings_own" on app_settings;
drop policy if exists "financial_months_own" on financial_months;
drop policy if exists "day_reviews_own" on day_reviews;
drop policy if exists "projects_own" on projects;
drop policy if exists "planned_items_own" on planned_items;
drop policy if exists "recurring_items_own" on recurring_items;
drop policy if exists "credit_cards_own" on credit_cards;
drop policy if exists "card_purchases_own" on card_purchases;
drop policy if exists "scenarios_own" on scenarios;
drop policy if exists "ai_insights_own" on ai_insights;
drop policy if exists "classification_rules_own" on classification_rules;

create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

create policy "family_members_own" on family_members for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "accounts_own" on accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transactions_own" on transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "categories_own" on categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "income_sources_own" on income_sources for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "app_settings_own" on app_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "financial_months_own" on financial_months for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "day_reviews_own" on day_reviews for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "projects_own" on projects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "planned_items_own" on planned_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recurring_items_own" on recurring_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "credit_cards_own" on credit_cards for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "card_purchases_own" on card_purchases for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "scenarios_own" on scenarios for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ai_insights_own" on ai_insights for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "classification_rules_own" on classification_rules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
