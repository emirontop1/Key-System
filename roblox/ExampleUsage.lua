--[[
	ExampleUsage.lua

	Minimal example wiring a key-entry TextBox + Submit button to
	KeySystemClient. Adjust to fit your actual GUI structure - this just
	shows the calling pattern (async, non-blocking, with basic feedback).

	Assumes:
	- KeySystemClient is a ModuleScript sibling of this script
	- A ScreenGui with a TextBox named "KeyInput", a TextButton named
	  "SubmitButton", and a TextLabel named "StatusLabel"
]]

local KeySystem = require(script.Parent.KeySystemClient)

local screenGui = script.Parent.Parent -- adjust to your hierarchy
local keyInput = screenGui:WaitForChild("KeyInput")
local submitButton = screenGui:WaitForChild("SubmitButton")
local statusLabel = screenGui:WaitForChild("StatusLabel")

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

local verifying = false

submitButton.MouseButton1Click:Connect(function()
	if verifying then
		return
	end
	verifying = true

	statusLabel.Text = "Verifying..."
	submitButton.Active = false

	local ok, result = KeySystem.VerifyKey(keyInput.Text)

	if ok then
		statusLabel.Text = ("Key accepted! Expires in %s"):format(result.timeRemainingText)
		-- TODO: unlock your GUI / fire your main script here
		-- result.issuedAtText / result.expiresAtText are also available
		-- if you want to show the full timestamps somewhere in your GUI.
	else
		statusLabel.Text = ERROR_MESSAGES[result.error] or "Something went wrong."
	end

	submitButton.Active = true
	verifying = false
end)
