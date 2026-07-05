--[[
	KeySystemClient.lua

	Drop this into a LocalScript (or require it as a ModuleScript) inside
	your Roblox GUI. It verifies a player-entered license key against your
	Key-System backend. Each key is single-use: once verified, the server
	marks it "used" and it can never be redeemed again.

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

local KeySystem = {}

-- ===== CONFIG - fill these in =====
local API_BASE_URL = "https://YOUR-PROJECT.vercel.app" -- no trailing slash
local APP_API_KEY = "YOUR_APP_API_KEY_FROM_DASHBOARD"
-- ===================================

--- Verifies a license key against the backend.
--- Returns (true) if valid, or (false, { error = "..." }) if not.
--- NOTE: this makes a network call, so wrap the calling code so your UI
--- can show a loading state - don't call this on every keystroke.
function KeySystem.VerifyKey(keyValue)
	if typeof(keyValue) ~= "string" or #keyValue == 0 then
		return false, { error = "empty_key" }
	end

	local payload = HttpService:JSONEncode({
		appApiKey = APP_API_KEY,
		key = keyValue,
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
