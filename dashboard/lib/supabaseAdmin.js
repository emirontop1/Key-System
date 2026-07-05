const { createClient } = require('@supabase/supabase-js');

// Service-role client for use ONLY inside serverless functions (server-side).
// This key bypasses RLS, so it must never be exposed to the browser/Roblox.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

module.exports = { supabaseAdmin };
