--[[
	AllInOneExample.lua

	A single, self-contained script - no ModuleScript setup, no GUI
	wiring required. Paste this whole file into a LocalScript (or a
	script executor's console) and run it directly to see the full
	key-check flow end to end, with a minimal on-screen prompt.

	This is meant for testing/demoing the backend quickly. For a real
	game you'll still want a proper GUI - see KeySystemClient.lua +
	ExampleUsage.lua for the reusable module version.

	SETUP: fill in API_BASE_URL and APP_API_KEY below, then run.

	NOTE: this project is intended for gating a Studio tool or an
	in-game feature behind a key - see the README. It is not built or
	intended for use as an exploit key system.
]]

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

-- ===== CONFIG - fill these in =====
local API_BASE_URL = "https://YOUR-PROJECT.vercel.app" -- no trailing slash
local APP_API_KEY = "YOUR_APP_API_KEY_FROM_DASHBOARD"
-- ===================================

local ERROR_MESSAGES = {
	empty_key = "Please enter a key.",
	key_not_found = "That key doesn't exist.",
	key_already_used = "This key has already been used.",
	key_wrong_app = "This key isn't valid for this game.",
	key_expired = "This key has expired. Generate a new one.",
	app_not_found = "Server misconfigured (app not found). Contact the developer.",
	rate_limited = "Too many attempts. Wait a moment and try again.",
	network_error = "Couldn't reach the server. Check your connection.",
	bad_response = "Unexpected server response. Try again.",
}

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

local function parseIsoTimestamp(iso)
	if typeof(iso) ~= "string" then return nil end
	local y, mo, d, h, mi, s = iso:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
	if not y then return nil end
	return os.time({
		year = tonumber(y), month = tonumber(mo), day = tonumber(d),
		hour = tonumber(h), min = tonumber(mi), sec = tonumber(s),
	})
end

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

local function verifyKey(keyValue)
	if typeof(keyValue) ~= "string" or #keyValue == 0 then
		return false, { error = "empty_key" }
	end

	local player = Players.LocalPlayer
	local payload = HttpService:JSONEncode({
		appApiKey = APP_API_KEY,
		key = keyValue,
		executor = detectExecutor(),
		isStudio = RunService:IsStudio(),
		playerName = player and player.Name or nil,
		accountAgeDays = player and player.AccountAge or nil,
	})

	local success, response = pcall(function()
		return HttpService:RequestAsync({
			Url = API_BASE_URL .. "/api/verify",
			Method = "POST",
			Headers = { ["Content-Type"] = "application/json" },
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
			issuedAtText = issuedAtUnix and os.date("!%Y-%m-%d %H:%M:%S UTC", issuedAtUnix) or "unknown",
			expiresAtText = expiresAtUnix and os.date("!%Y-%m-%d %H:%M:%S UTC", expiresAtUnix) or "unknown",
			timeRemainingText = expiresAtUnix and formatDuration(expiresAtUnix - nowUnix) or "unknown",
		}
	end

	return false, { error = decoded.error or "unknown_error" }
end

-- ===== Minimal on-screen UI (built entirely in code, no Studio GUI needed) =====

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "KeySystemAllInOneDemo"
screenGui.ResetOnSpawn = false
screenGui.Parent = playerGui

local frame = Instance.new("Frame")
frame.Size = UDim2.new(0, 320, 0, 160)
frame.Position = UDim2.new(0.5, -160, 0.5, -80)
frame.BackgroundColor3 = Color3.fromRGB(18, 18, 22)
frame.BorderSizePixel = 0
frame.Parent = screenGui

local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 8)
corner.Parent = frame

local title = Instance.new("TextLabel")
title.Text = "Enter your Key-System license key"
title.Font = Enum.Font.GothamBold
title.TextSize = 15
title.TextColor3 = Color3.fromRGB(230, 230, 235)
title.BackgroundTransparency = 1
title.Size = UDim2.new(1, -20, 0, 30)
title.Position = UDim2.new(0, 10, 0, 10)
title.TextXAlignment = Enum.TextXAlignment.Left
title.Parent = frame

local keyInput = Instance.new("TextBox")
keyInput.PlaceholderText = "Paste your key here"
keyInput.Text = ""
keyInput.Font = Enum.Font.Gotham
keyInput.TextSize = 14
keyInput.TextColor3 = Color3.fromRGB(230, 230, 235)
keyInput.BackgroundColor3 = Color3.fromRGB(30, 30, 36)
keyInput.Size = UDim2.new(1, -20, 0, 36)
keyInput.Position = UDim2.new(0, 10, 0, 50)
keyInput.ClearTextOnFocus = false
keyInput.Parent = frame

local inputCorner = Instance.new("UICorner")
inputCorner.CornerRadius = UDim.new(0, 6)
inputCorner.Parent = keyInput

local submitButton = Instance.new("TextButton")
submitButton.Text = "Verify"
submitButton.Font = Enum.Font.GothamBold
submitButton.TextSize = 14
submitButton.TextColor3 = Color3.fromRGB(15, 15, 18)
submitButton.BackgroundColor3 = Color3.fromRGB(124, 158, 255)
submitButton.Size = UDim2.new(1, -20, 0, 36)
submitButton.Position = UDim2.new(0, 10, 0, 96)
submitButton.Parent = frame

local buttonCorner = Instance.new("UICorner")
buttonCorner.CornerRadius = UDim.new(0, 6)
buttonCorner.Parent = submitButton

local statusLabel = Instance.new("TextLabel")
statusLabel.Text = ""
statusLabel.Font = Enum.Font.Gotham
statusLabel.TextSize = 12
statusLabel.TextColor3 = Color3.fromRGB(160, 160, 170)
statusLabel.BackgroundTransparency = 1
statusLabel.Size = UDim2.new(1, -20, 0, 20)
statusLabel.Position = UDim2.new(0, 10, 0, 136)
statusLabel.TextXAlignment = Enum.TextXAlignment.Left
statusLabel.Parent = frame

local verifying = false

submitButton.MouseButton1Click:Connect(function()
	if verifying then return end
	verifying = true

	statusLabel.Text = "Verifying..."
	statusLabel.TextColor3 = Color3.fromRGB(160, 160, 170)
	submitButton.Active = false

	local ok, result = verifyKey(keyInput.Text)

	if ok then
		statusLabel.Text = ("Accepted! Expires in %s"):format(result.timeRemainingText)
		statusLabel.TextColor3 = Color3.fromRGB(139, 233, 160)
		print(("[Key-System] Key accepted. Issued: %s | Expires: %s"):format(result.issuedAtText, result.expiresAtText))
		-- TODO: put whatever should happen after a valid key here
		task.wait(2)
		screenGui:Destroy()
	else
		statusLabel.Text = ERROR_MESSAGES[result.error] or "Something went wrong."
		statusLabel.TextColor3 = Color3.fromRGB(255, 143, 163)
	end

	submitButton.Active = true
	verifying = false
end)

print("[Key-System] All-in-one demo loaded. Enter a key in the on-screen box.")
