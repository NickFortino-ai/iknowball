-- Push notification subscriptions (one row per device per user)
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index idx_push_subscriptions_user_id on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

create policy "Users can view own push subscriptions"
  on push_subscriptions for select using (auth.uid() = user_id);

create policy "Users can insert own push subscriptions"
  on push_subscriptions for insert with check (auth.uid() = user_id);

create policy "Users can delete own push subscriptions"
  on push_subscriptions for delete using (auth.uid() = user_id);

-- Add push_preferences JSONB column to users (null = all on)
alter table users add column push_preferences jsonb default null;
