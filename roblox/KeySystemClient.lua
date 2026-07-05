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

	SETUP:
	1. Replace API_BASE_URL below with your deployed Vercel URL, e.g.
	   "https://key-system-yourname.vercel.app"
	2. Replace APP_API_KEY with the API key shown on your app's dashboard
	   page (Settings -> API key). This key is NOT the same as a player's
	   license key - it identifies YOUR app to the backend.
	3. Call KeySystem.VerifyKey(playerEnteredKey) and handle the result.

	Usage example:

		local KeySystem = require(script.KeySystemClient)

		local ok, result = KeySystem.VerifyKey(textBox.Text)
		if ok then
			print("Key accepted, unlocking GUI")
		else
			print("Key rejected:", result.error)
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

--- Verifies a license key against the backend.
--- Returns (true) if valid, or (false, { error = "..." }) if not.
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
		return true
	end

	-- decoded.error is one of: key_not_found, key_already_used,
	-- key_wrong_app, key_expired, app_not_found, rate_limited
	return false, { error = decoded.error or "unknown_error" }
end

return KeySystem
