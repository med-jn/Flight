import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    'Supabase configuration missing: make sure .env.local defines VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart npm run dev.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
