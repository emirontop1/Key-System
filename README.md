# Key-System

Multi-tenant, task-gated single-use license key system for Roblox.

No accounts, no login. Open the dashboard, create an "app," define a
list of link tasks (LootLabs-style: open a link, wait, confirm), and get
a public "claim" page to share with players. Once a player finishes
every task, they receive a single-use key. Your Roblox script verifies
that key with one HTTP request - the backend marks it used atomically,
so it can never be redeemed twice.

Ownership without accounts: the first time a browser hits the dashboard,
it's given a random `owner_token` in an httpOnly cookie. Every app you
create from that browser is tagged with that token, and every dashboard
API route checks the cookie before returning or changing anything. No
password, no email - but also no recovery: clearing cookies or switching
browsers/devices means you can no longer manage apps created from the
old cookie (the claim page and Roblox verification are unaffected,
since neither depends on the cookie at all).

## Architecture

```
dashboard/              Next.js app - this is the ONLY thing you deploy to Vercel
  pages/
    index.js            Redirects to /dashboard (no login step)
    dashboard.js         List / create apps (scoped to the owner cookie)
    apps/[id].js          Manage one app: API key, tasks, claim link
    claim/[appId].js       Public page players use to complete tasks + get a key
    api/
      apps/index.js               List/create apps for this browser's owner cookie
      apps/[id].js                 Get one app + its tasks (owner-cookie checked)
      apps/[id]/tasks.js           Add/remove tasks (owner-cookie checked)
      verify.js                    Roblox calls this to redeem a key
      session/start-by-app-id.js   Claim page starts a session
      session/complete-task.js     Claim page marks one task done
      session/claim-key.js         Claim page requests the final key
  lib/
    supabaseAdmin.js    Server client (service role key, used only in /api)
    utils.js            Owner-cookie helpers, key generation, CORS, rate limiting

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
3. Go to **Project Settings -> API** and note down:
   - `Project URL`
   - `service_role` key (keep this secret - never put it in the browser)

No Google/OAuth setup needed - there's no login step at all.

### 2. Deploy to Vercel

1. Import this GitHub repo into Vercel.
2. In the project's **Settings -> General -> Root Directory**, set it to
   `dashboard`. This tells Vercel to treat `dashboard/` as the project
   root, so both the pages and `pages/api/*` deploy correctly.
3. In **Settings -> Environment Variables**, add (copy from
   `dashboard/.env.example`):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy. Vercel will give you a URL like
   `https://key-system-yourname.vercel.app`.

### 3. Create your first app

1. Visit your deployed URL - it drops you straight on the dashboard, no
   sign-in step (a random owner cookie is set automatically).
2. Create an app (e.g. "My GUI Loader").
3. Open it, add tasks (title + link + wait seconds).
4. Copy the **API key** (for your Roblox script) and the **claim link**
   (to share with players, e.g. in your Discord).
5. Bookmark the dashboard URL in the same browser - since there's no
   login, that browser's cookie is the only way back in to manage this
   app later.

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
- There are no accounts. Ownership of an app is just possession of a
  random `owner_token` cookie (httpOnly, so page JavaScript can't read
  or leak it). This is deliberately lower-friction than real auth: fine
  for a solo developer, but anyone who obtains the raw cookie value
  (e.g. via a compromised browser) could manage your apps. Don't open
  this dashboard on a shared/public computer.
- Each app's `api_key` (used by `/api/verify`) is separate from license
  keys players redeem, and separate from the owner cookie. Rotating an
  app's `api_key` would require a manual SQL update for now (no UI
  button yet) - ask if you want that added.
- The public claim page never sees or needs an app's `api_key`; it only
  needs the app's `id`, which is safe to expose in a shareable URL.
