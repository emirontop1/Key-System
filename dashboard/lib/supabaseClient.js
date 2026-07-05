import { createClient } from '@supabase/supabase-js';

// Public/anon client - safe to expose in the browser. Row Level Security
// policies (see supabase/schema.sql) ensure a logged-in user can only
// read/write apps and tasks they own.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
