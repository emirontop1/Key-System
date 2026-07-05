# Key-System

Multi-tenant, task-gated single-use license key system for Roblox.

Anyone can sign in with Google, create an "app," define a list of link
tasks (LootLabs-style: open a link, wait, confirm), and get a public
"claim" page to share with players. Once a player finishes every task,
they receive a single-use key. Your Roblox script verifies that key with
one HTTP request - the backend marks it used atomically, so it can never
be redeemed twice.

## Architecture

```
dashboard/              Next.js app - this is the ONLY thing you deploy to Vercel
  pages/
    index.js            Login (Google via Supabase Auth)
    dashboard.js         List / create apps
    apps/[id].js          Manage one app: API key, tasks, claim link
    claim/[appId].js       Public page players use to complete tasks + get a key
    api/
      verify.js             Roblox calls this to redeem a key
      session/start-by-app-id.js   Claim page starts a session
      session/complete-task.js     Claim page marks one task done
      session/claim-key.js         Claim page requests the final key
  lib/
    supabaseClient.js    Browser client (anon key, respects RLS)
    supabaseAdmin.js     Server client (service role key, used only in /api)

supabase/
  schema.sql            Run this once in the Supabase SQL editor

roblox/
  KeySystemClient.lua    Drop into your Roblox game, calls /api/verify
  ExampleUsage.lua       Example wiring to a TextBox + Button
```

Only `dashboard/` gets deployed. Everything - the dashboard UI and the
API - lives in one Next.js project and one Vercel deployment.

## Setup

### 1. Supabase project

1. Create a project at https://supabase.com.
2. Open the SQL Editor and run the contents of `supabase/schema.sql`.
3. Go to **Authentication -> Providers -> Google**, enable it, and follow
   Supabase's instructions to plug in a Google OAuth Client ID/Secret
   (created in Google Cloud Console). Set the redirect URL Supabase gives
   you in your Google OAuth app's "Authorized redirect URIs."
4. Go to **Project Settings -> API** and note down:
   - `Project URL`
   - `anon` `public` key
   - `service_role` key (keep this secret - never put it in the browser)

### 2. Deploy to Vercel

1. Import this GitHub repo into Vercel.
2. In the project's **Settings -> General -> Root Directory**, set it to
   `dashboard`. This tells Vercel to treat `dashboard/` as the project
   root, so both the pages and `pages/api/*` deploy correctly.
3. In **Settings -> Environment Variables**, add (copy from
   `dashboard/.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_URL` (same value as above)
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy. Vercel will give you a URL like
   `https://key-system-yourname.vercel.app`.
5. Back in Supabase, add
   `https://key-system-yourname.vercel.app/dashboard` to the redirect
   URLs allowed for Google auth (Authentication -> URL Configuration).

### 3. Create your first app

1. Visit your deployed URL, sign in with Google.
2. Create an app (e.g. "My GUI Loader").
3. Open it, add tasks (title + link + wait seconds).
4. Copy the **API key** (for your Roblox script) and the **claim link**
   (to share with players, e.g. in your Discord).

### 4. Wire up Roblox

1. Copy `roblox/KeySystemClient.lua` into your game as a ModuleScript.
2. Fill in `API_BASE_URL` (your Vercel URL) and `APP_API_KEY` (from the
   app's dashboard page).
3. **Roblox Studio -> Game Settings -> Security -> Allow HTTP Requests**
   must be turned on, or `HttpService:RequestAsync` will fail.
4. See `roblox/ExampleUsage.lua` for wiring it to a key-entry GUI.

## How a key gets used up exactly once

`/api/verify` reads the key row, then updates it with
`.eq('used', false)` in the same query. If two requests race to redeem
the same key, only the first `UPDATE` actually matches a row (the second
one's `WHERE used = false` matches nothing, since the first request
already flipped it to `true`). That row-level compare-and-set is what
Postgres guarantees atomically - there's no window where both requests
could succeed.

## Notes on the task/wait verification

This system does not integrate a third-party link shortener - tasks are
"open this link, wait N seconds, confirm." The backend re-checks that N
seconds have actually passed since the task was opened before recording
it as complete, using the timestamp from when the link was opened. This
is not bulletproof against a determined person reading the API from
devtools, but it removes the "instant-skip" case without needing an
external click-verification service. If you later want stronger
verification, LootLabs/Linkvertise/work.ink all offer callback-based
APIs that could replace the wait-timer check in
`pages/api/session/complete-task.js`.

## Security notes

- The `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security and must
  only ever be used server-side (already the case in this codebase -
  it's only imported in `pages/api/*` files, never in a page component).
- Each app's `api_key` (used by `/api/verify`) is separate from license
  keys players redeem. Rotating an app's `api_key` would require a
  manual SQL update for now (no UI button yet) - ask if you want that
  added.
- The public claim page never sees or needs an app's `api_key`; it only
  needs the app's `id`, which is safe to expose in a shareable URL.
