-- ============================================================
-- Key System - Database Schema
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query)
-- ============================================================

-- Enable extension for UUID generation
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- apps: each app belongs to one "owner" - identified by an opaque
-- owner_token stored in a browser cookie. No accounts, no login.
-- Anyone who holds the owner_token for an app can manage it; the
-- token is never shown in the UI as anything but an internal cookie
-- value, and all reads/writes to apps/tasks happen through the
-- serverless API (using the service role key), which checks the
-- cookie against apps.owner_token before allowing access.
-- ------------------------------------------------------------
create table if not exists apps (
  id uuid primary key default gen_random_uuid(),
  owner_token text not null default encode(gen_random_bytes(24), 'hex'),
  name text not null,
  api_key text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

create index if not exists idx_apps_owner on apps(owner_token);

-- ------------------------------------------------------------
-- tasks: link-based steps a player must complete to earn a key
-- ------------------------------------------------------------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  title text not null,
  url text not null,
  wait_seconds int not null default 15 check (wait_seconds >= 3 and wait_seconds <= 120),
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_tasks_app on tasks(app_id, order_index);

-- ------------------------------------------------------------
-- key_sessions: one "attempt" at earning a key. Tracks a player
-- moving through the task list. Identified by an opaque token
-- placed in a signed cookie / URL param, not tied to Roblox
-- account (player isn't authenticated - just browser-based).
-- ------------------------------------------------------------
create table if not exists key_sessions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  session_token text not null unique default encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  completed boolean not null default false
);

create index if not exists idx_sessions_token on key_sessions(session_token);
create index if not exists idx_sessions_app on key_sessions(app_id);

-- ------------------------------------------------------------
-- task_completions: which tasks in a session have been cleared
-- ------------------------------------------------------------
create table if not exists task_completions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references key_sessions(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique(session_id, task_id)
);

-- ------------------------------------------------------------
-- license_keys: single-use keys redeemed by Roblox script
-- ------------------------------------------------------------
create table if not exists license_keys (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  session_id uuid references key_sessions(id) on delete set null,
  key_value text not null unique,
  used boolean not null default false,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists idx_keys_value on license_keys(key_value);
create index if not exists idx_keys_app on license_keys(app_id);

-- ============================================================
-- Row Level Security
-- ============================================================
-- There is no Supabase Auth user in this system - ownership is just an
-- opaque cookie value (apps.owner_token) checked by server-side API
-- routes. RLS stays ON but with NO policies for the anon/public role,
-- which blocks the browser from talking to Supabase directly at all.
-- Every read/write goes through /pages/api/* using the service role
-- key, which bypasses RLS and does the owner_token check itself in code.
alter table apps enable row level security;
alter table tasks enable row level security;
alter table key_sessions enable row level security;
alter table task_completions enable row level security;
alter table license_keys enable row level security;
