-- ============================================================
-- Key System - Database Schema
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query)
--
-- Safe to re-run any time you pull a newer version of this file: every
-- statement is idempotent (create table/column/index "if not exists"),
-- so re-running never drops or duplicates anything.
--
-- Troubleshooting: if you get an error mentioning "owner_id" or
-- "auth.users" when running this, your apps table was created by a very
-- early (pre-cookie-auth) version of this schema. Run this first, then
-- re-run the rest of this file:
--
--   alter table apps drop column if exists owner_id;
--   alter table apps add column if not exists owner_token text
--     not null default encode(gen_random_bytes(24), 'hex');
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
  task_count int not null default 0, -- how many random tasks to show players; 0 = show all
  created_at timestamptz not null default now()
);

create index if not exists idx_apps_owner on apps(owner_token);

-- Safety net: if this "apps" table was created by an earlier version of
-- this schema (before task_count existed), add it now. No-op if it's
-- already there.
alter table apps add column if not exists task_count int not null default 0;

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
  requested_count int not null default 0, -- how many tasks the player asked for
  assigned_task_ids uuid[] not null default '{}', -- the randomly-picked subset locked in for this session
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  completed boolean not null default false
);

create index if not exists idx_sessions_token on key_sessions(session_token);
create index if not exists idx_sessions_app on key_sessions(app_id);

-- Safety net: add these columns if key_sessions was created by an
-- earlier version of this schema, before random-task-subset support
-- existed. No-op if they're already there.
alter table key_sessions add column if not exists requested_count int not null default 0;
alter table key_sessions add column if not exists assigned_task_ids uuid[] not null default '{}';

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

-- ------------------------------------------------------------
-- redemptions: analytics snapshot captured at the moment a key is
-- successfully verified by the Roblox client. Purely informational -
-- never used for security decisions (the key's used/used_at columns
-- on license_keys are still the single source of truth for whether a
-- key is valid).
-- ------------------------------------------------------------
create table if not exists redemptions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  key_id uuid references license_keys(id) on delete set null,
  executor text, -- e.g. "Synapse X", "Roblox" (real client), etc - self-reported by the script
  is_studio boolean not null default false,
  player_name text,
  account_age_days int,
  created_at timestamptz not null default now()
);

create index if not exists idx_redemptions_app on redemptions(app_id, created_at desc);

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
alter table redemptions enable row level security;
