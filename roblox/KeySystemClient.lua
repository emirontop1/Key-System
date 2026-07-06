--[[
	KeySystemClient.lua

	Drop this into a LocalScript (or require it as a ModuleScript) inside
	your Roblox GUI. It verifies a player-entered license key against your
	Key-System backend. Each key is single-use: once verified, the server
	marks it "used" and it can never be redeemed again.

	This also sends a few informational analytics fields along with the
	verification request (best-effort, self-reported, never affects
	whether the key is accepted): the executor name (or "Roblox" for a
	normal client), whether this is Roblox Studio, the player's display
	name, and their account age in days. These show up as a chart on your
	app's dashboard page. This project is intended for Studio/game key
	distribution, not exploit key systems - see the note in the README.

	Keys now come from app-owner-defined "packages" (e.g. "24 Hour Key" =
	2 tasks, "72 Hour Key" = 6 tasks) - the duration is baked into the key
	server-side, and VerifyKey() below returns when the key was issued and
	when it expires so you can show that in your GUI.

	SETUP:
	1. Replace API_BASE_URL below with your deployed Vercel URL, e.g.
	   "https://key-system-yourname.vercel.app"
	2. Replace APP_API_KEY with the API key shown on your app's dashboard
	   page (Settings -> API key). This key is NOT the same as a player's
	   license key - it identifies YOUR app to the backend.
	3. Call KeySystem.VerifyKey(playerEnteredKey) and handle the result.

	Usage example:

		local KeySystem = require(script.KeySystemClient)

		local ok, info = KeySystem.VerifyKey(textBox.Text)
		if ok then
			print("Key accepted, unlocking GUI")
			print("Issued:", info.issuedAtText)
			print("Expires:", info.expiresAtText)
			print("Time remaining:", info.timeRemainingText)
		else
			print("Key rejected:", info.error)
		end
]]

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local KeySystem = {}

-- ===== CONFIG - fill these in =====
local API_BASE_URL = "https://YOUR-PROJECT.vercel.app" -- no trailing slash
local APP_API_KEY = "YOUR_APP_API_KEY_FROM_DASHBOARD"
-- ===================================

--- Best-effort executor name. On a real Roblox client (no exploit) none
--- of these globals exist, so this correctly reports "Roblox" for normal
--- players. This is purely informational/analytics - it is NEVER used to
--- accept or reject keys, and a player can't fail verification because
--- of what this returns.
local function detectExecutor()
	local ok1, name1 = pcall(function()
		return identifyexecutor and identifyexecutor()
	end)
	if ok1 and typeof(name1) == "string" and #name1 > 0 then
		return name1
	end

	local ok2, name2 = pcall(function()
		return getexecutorname and getexecutorname()
	end)
	if ok2 and typeof(name2) == "string" and #name2 > 0 then
		return name2
	end

	local ok3, isSyn = pcall(function() return typeof(syn) == "table" end)
	if ok3 and isSyn then return "Synapse X" end

	local ok4, hasKrnl = pcall(function() return KRNL_LOADED ~= nil end)
	if ok4 and hasKrnl then return "KRNL" end

	local ok5, hasGetgenv = pcall(function() return typeof(getgenv) == "function" end)
	if ok5 and hasGetgenv then return "Unknown (exploit detected)" end

	return "Roblox"
end

--- Parses an ISO 8601 UTC timestamp (e.g. "2026-07-06T12:34:56.000Z")
--- into a Unix timestamp (seconds), which os.time()/os.date() can use.
--- Returns nil if the string can't be parsed.
local function parseIsoTimestamp(iso)
	if typeof(iso) ~= "string" then return nil end
	local y, mo, d, h, mi, s = iso:match(
		"(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)"
	)
	if not y then return nil end
	return os.time({
		year = tonumber(y),
		month = tonumber(mo),
		day = tonumber(d),
		hour = tonumber(h),
		min = tonumber(mi),
		sec = tonumber(s),
	})
end

--- Formats a count of seconds as "Xd Yh Zm" (skipping zero leading
--- units), or "expired" if <= 0.
local function formatDuration(totalSeconds)
	if totalSeconds <= 0 then return "expired" end
	local days = math.floor(totalSeconds / 86400)
	local hours = math.floor((totalSeconds % 86400) / 3600)
	local minutes = math.floor((totalSeconds % 3600) / 60)

	local parts = {}
	if days > 0 then table.insert(parts, days .. "d") end
	if hours > 0 or days > 0 then table.insert(parts, hours .. "h") end
	table.insert(parts, minutes .. "m")
	return table.concat(parts, " ")
end

--- Verifies a license key against the backend.
--- Returns (true, info) if valid, where info is:
---   {
---     issuedAtUnix = <number>,     -- when the key was issued (Unix time)
---     expiresAtUnix = <number>,    -- when the key expires (Unix time)
---     issuedAtText = <string>,     -- e.g. "2026-07-06 12:34:56 UTC"
---     expiresAtText = <string>,
---     timeRemainingText = <string>, -- e.g. "1d 3h 20m" or "expired"
---   }
--- Returns (false, { error = "..." }) if invalid.
--- NOTE: this makes a network call, so wrap the calling code so your UI
--- can show a loading state - don't call this on every keystroke.
function KeySystem.VerifyKey(keyValue)
	if typeof(keyValue) ~= "string" or #keyValue == 0 then
		return false, { error = "empty_key" }
	end

	local player = Players.LocalPlayer
	local accountAgeDays = player and player.AccountAge or nil

	local payload = HttpService:JSONEncode({
		appApiKey = APP_API_KEY,
		key = keyValue,
		executor = detectExecutor(),
		isStudio = RunService:IsStudio(),
		playerName = player and player.Name or nil,
		accountAgeDays = accountAgeDays,
	})

	local success, response = pcall(function()
		return HttpService:RequestAsync({
			Url = API_BASE_URL .. "/api/verify",
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
			},
			Body = payload,
		})
	end)

	if not success then
		return false, { error = "network_error", detail = tostring(response) }
	end

	local ok, decoded = pcall(function()
		return HttpService:JSONDecode(response.Body)
	end)

	if not ok then
		return false, { error = "bad_response" }
	end

	if response.StatusCode == 200 and decoded.valid == true then
		local issuedAtUnix = parseIsoTimestamp(decoded.issuedAt)
		local expiresAtUnix = parseIsoTimestamp(decoded.expiresAt)
		local nowUnix = os.time()

		return true, {
			issuedAtUnix = issuedAtUnix,
			expiresAtUnix = expiresAtUnix,
			issuedAtText = issuedAtUnix and os.date("!%Y-%m-%d %H:%M:%S UTC", issuedAtUnix) or "unknown",
			expiresAtText = expiresAtUnix and os.date("!%Y-%m-%d %H:%M:%S UTC", expiresAtUnix) or "unknown",
			timeRemainingText = expiresAtUnix and formatDuration(expiresAtUnix - nowUnix) or "unknown",
		}
	end

	-- decoded.error is one of: key_not_found, key_already_used,
	-- key_wrong_app, key_expired, app_not_found, rate_limited
	return false, { error = decoded.error or "unknown_error" }
end

return KeySystem
