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

Both tasks and whole apps can be deleted from the dashboard (with an
inline confirm step - no accidental clicks). Deleting an app is
permanent and removes everything under it - tasks, key packages,
sessions, license keys, and redemption analytics - via `ON DELETE
CASCADE` in the schema, so there's nothing orphaned left behind in
Supabase afterward.

## Architecture

```
dashboard/              Next.js app - this is the ONLY thing you deploy to Vercel
  pages/
    index.js            Redirects to /dashboard (no login step)
    dashboard.js         List / create / delete apps (scoped to the owner cookie)
    apps/[id].js          Manage one app: API key, key packages, tasks, claim link, analytics, delete
    claim/[appId].js       Public page: pick a key package, complete tasks, get a key
    api/
      apps/index.js               List/create apps for this browser's owner cookie
      apps/[id].js                 Get one app + its tasks (owner-cookie checked)
      apps/[id]/tasks.js           Add/remove tasks (owner-cookie checked)
      apps/[id]/packages.js        Add/remove key packages (owner-cookie checked)
      apps/[id]/public-packages.js Public: app name + package list (for the claim page)
      apps/[id]/analytics.js       Owner-cookie checked: executor/studio/age charts data
      verify.js                    Roblox calls this to redeem a key (+ logs analytics)
      session/start-by-app-id.js   Claim page starts a session for a chosen package
      session/complete-task.js     Claim page marks one assigned task done
      session/claim-key.js         Claim page requests the final key (expiry from package)
  lib/
    supabaseAdmin.js    Server client (service role key, used only in /api)
    utils.js            Owner-cookie helpers, key generation, CORS, rate limiting

supabase/
  schema.sql            Run this once in the Supabase SQL editor

roblox/
  KeySystemClient.lua      Reusable module - drop into your game, calls /api/verify
  ExampleUsage.lua         Example wiring the module to a TextBox + Button GUI
  AllInOneExample.lua      Single-file, no-setup demo - paste and run directly
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
4. Add at least one **key package** - a duration (hours) and how many of
   the app's tasks it requires, e.g. "24 Hour Key" = 24h / 2 tasks,
   "72 Hour Key" = 72h / 6 tasks. Players choose one of these on the
   claim page. Without at least one package, the claim page has nothing
   to offer players.
5. Copy the **API key** (for your Roblox script) and the **claim link**
   (to share with players, e.g. in your Discord).
6. Bookmark the dashboard URL in the same browser - since there's no
   login, that browser's cookie is the only way back in to manage this
   app later.

### 4. Wire up Roblox

1. Copy `roblox/KeySystemClient.lua` into your game as a ModuleScript.
2. Fill in `API_BASE_URL` (your Vercel URL) and `APP_API_KEY` (from the
   app's dashboard page).
3. **Roblox Studio -> Game Settings -> Security -> Allow HTTP Requests**
   must be turned on, or `HttpService:RequestAsync` will fail.
4. See `roblox/ExampleUsage.lua` for wiring it to a key-entry GUI, or
   `roblox/AllInOneExample.lua` for a single paste-and-run script with
   no setup - it builds its own on-screen key-entry box in code.

## Key packages (duration + task count)

Each app can define any number of **key packages** - e.g. "24 Hour Key"
(24h expiry, 2 tasks), "48 Hour Key" (48h, 4 tasks), "72 Hour Key" (72h,
6 tasks). You set these up on the app's management page. Players pick
one on the claim page before starting tasks.

A package's task count decides how many of the app's tasks are randomly
selected for that player (0 or a number >= the app's total task count
means "require all tasks"). The exact random subset is locked into
`key_sessions.assigned_task_ids` at session start, so a player can't
dodge hard tasks by refreshing, and can't complete tasks outside the
set they were shown. The package's duration is copied onto the session
and used to compute the license key's `expires_at` at the moment the
key is issued - so a "24 Hour Key" really does stop working 24 hours
after that specific player claimed it, not 24 hours from when the app
was created.

On the Roblox side, `KeySystem.VerifyKey()` returns `issuedAtText`,
`expiresAtText`, and `timeRemainingText` (e.g. `"1d 3h 20m"`) alongside
success, so you can show players how much time is left on their key.

## Analytics

Every time `/api/verify` accepts a key, the Roblox script sends a few
additional fields with the request: a best-effort executor name (self-
reported - reports `"Roblox"` on an unmodified client), whether the
call came from Studio, the player's display name, and their account
age in days. This is stored in the `redemptions` table and charted on
each app's dashboard page - executor breakdown, Studio vs. live game,
and account-age distribution, plus a table of recent redemptions. None
of this affects whether a key is accepted; it's purely for your own
visibility into who's using your keys.

## Account-bound re-verification

The first time a key is redeemed, it's bound to the redeeming player's
Roblox `UserId` (`license_keys.redeemed_by_user_id`). If that same
account submits the same key again later - e.g. they rejoin the game
and your GUI re-checks their key on join - `/api/verify` accepts it
again (`returning: true` in the response) instead of rejecting it as
"already used," as long as it hasn't hit its `expires_at` yet. A
different account trying the same key is still rejected normally, so
the single-use guarantee against sharing still holds - only the
original redeemer can keep re-using their own key until it naturally
expires. This needs the Roblox script to send the player's `UserId`
with each verify call (already wired up in `KeySystemClient.lua`,
`AllInOneExample.lua`, and `ExampleUsage.lua`).

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
